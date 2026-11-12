#!/usr/bin/env node
/*
 * tools/test-engine.js: automated test of the deck engine.
 *
 *   node tools/test-engine.js            run everything
 *   node tools/test-engine.js timer      run only tests whose name contains "timer"
 *   node tools/test-engine.js --list     list the test names
 *   node tools/test-engine.js --entry dist/deck.html
 *                                        run the same tests against the single-file build
 *
 * Opens deck/index.html through file:// in headless Chromium (Playwright)
 * and drives the demo slides in deck/slides/_demo.js by id. The URL carries
 * ?demo, which forces those slides on even when window.DECK_DEMO is false,
 * so this keeps working after the real slides are written. (It does need
 * the <script src="slides/_demo.js"> tag to stay in index.html.)
 *
 * Prints one PASS / FAIL line per test and exits 1 if anything failed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/* Playwright is installed globally, not in this repository. */
function requirePlaywright() {
  try { return require('playwright'); } catch (e) { /* try the global folders next */ }
  const roots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  try { roots.push(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch (e) { /* no npm */ }
  for (const root of roots) {
    try { return require(path.join(root, 'playwright')); } catch (e) { /* keep looking */ }
  }
  console.error('Playwright was not found. Install it once, globally:  npm install -g playwright');
  process.exit(2);
}

const { chromium } = requirePlaywright();

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'deck', 'index.html');

// --entry dist/deck.html runs the same tests against another build of the deck.
const ARGS = process.argv.slice(2);
const entryAt = ARGS.indexOf('--entry');
const DECK_FILE = entryAt !== -1 && ARGS[entryAt + 1] ? path.resolve(ARGS[entryAt + 1]) : SOURCE_FILE;
if (entryAt !== -1) { ARGS.splice(entryAt, 2); }
const DECK_URL = pathToFileURL(DECK_FILE).href;

/* ------------------------------------------------------------------ harness */

let browser;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function assert(cond, message) {
  if (!cond) { throw new Error(message || 'assertion failed'); }
}
function eq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { throw new Error((message ? message + ': ' : '') + 'expected ' + e + ', got ' + a); }
}
function near(actual, expected, tolerance, message) {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error((message ? message + ': ' : '') + 'expected ' + expected + ' ±' + tolerance + ', got ' + actual);
  }
}

function deckUrl(flags, hash) {
  return DECK_URL + '?demo' + (flags ? '&' + flags : '') + (hash ? '#/' + hash : '');
}

/* Collect console errors and uncaught exceptions of a page. */
function watch(page, problems) {
  page.on('console', (msg) => { if (msg.type() === 'error') { problems.push('console.error: ' + msg.text()); } });
  page.on('pageerror', (err) => { problems.push('uncaught: ' + err.message); });
}

/**
 * Open the deck in a fresh browser context.
 * opts: { flags: 'fast&debug', hash: 'demo-counter/1', viewport, dpr, touch, init }
 */
async function open(opts) {
  opts = opts || {};
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 720 },
    deviceScaleFactor: opts.dpr || 1,
    hasTouch: !!opts.touch
  });
  const page = await context.newPage();
  const problems = [];
  watch(page, problems);
  if (opts.init) { await page.addInitScript(opts.init); }
  await page.goto(deckUrl(opts.flags, opts.hash === undefined ? 'demo-reveals/0' : opts.hash));
  await ready(page);
  return { context, page, problems, close: () => context.close() };
}

async function ready(page) {
  await page.waitForFunction(() => window.__deck && window.__deck.count() > 0 && window.__deck.current().index >= 0, null, { timeout: 15000 });
}

const cur = (page) => page.evaluate(() => window.__deck.current());
const settle = (page) => page.evaluate(() => window.__deck.settle());
const goto = (page, id, step) => page.evaluate(([i, s]) => window.__deck.goto(i, s), [id, step || 0]);
const loops = (page) => page.evaluate(() => window.Motion.stats().loops);
const liveCount = (page) => page.evaluate(() => document.querySelectorAll('.deck-slides > .slide').length);

async function expectAt(page, id, step, message) {
  const c = await cur(page);
  eq({ id: c.id, step: c.step }, { id, step }, message || 'position');
}

/** Wait until the page is on (id, step). Used across windows, where messages take a moment. */
async function waitAt(page, id, step, message) {
  try {
    await page.waitForFunction(([i, s]) => {
      const c = window.__deck.current();
      return c.id === i && c.step === s;
    }, [id, step], { timeout: 6000 });
  } catch (e) {
    const c = await cur(page);
    throw new Error((message || 'waiting for position') + ': expected ' + id + '/' + step + ', still at ' + c.id + '/' + c.step);
  }
}

/** Computed state of one element inside the slide that is on screen. */
function look(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector('.deck-slides > .slide.is-current ' + sel);
    if (!el) { return null; }
    const cs = getComputedStyle(el);
    return {
      shown: el.classList.contains('is-visible'),
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      translate: cs.translate,
      scale: cs.scale,
      rotate: cs.rotate,
      clipPath: cs.clipPath,
      text: el.textContent.trim()
    };
  }, selector);
}

/* Records every scene call in window.__sceneLog: ['mount'|'step'|'destroy'|'resize', name, ...args].
 * It wraps Scenes.define the moment deck.js creates window.Scenes. */
function sceneSpy() {
  window.__sceneLog = [];
  let real;
  Object.defineProperty(window, 'Scenes', {
    configurable: true,
    get() { return real; },
    set(value) {
      real = value;
      const define = value.define;
      value.define = function (name, factory) {
        return define.call(value, name, function (host, opts, api) {
          window.__sceneLog.push(['mount', name]);
          const inst = factory(host, opts, api) || {};
          ['step', 'destroy', 'resize'].forEach((method) => {
            const original = inst[method];
            inst[method] = function () {
              window.__sceneLog.push([method, name].concat(Array.prototype.slice.call(arguments)));
              return original ? original.apply(inst, arguments) : undefined;
            };
          });
          return inst;
        });
      };
    }
  });
}
const sceneLog = (page, name) => page.evaluate((n) => window.__sceneLog.filter((e) => e[1] === n), name);

/* ==================================================================== tests */

test('offline contract: index.html load order, no modules, no network references', async () => {
  const html = fs.readFileSync(SOURCE_FILE, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const refs = [];
  html.replace(/<link[^>]+href="([^"]+)"|<script[^>]+src="([^"]+)"/g, (m, href, src) => { refs.push(href || src); return m; });
  eq(refs, [
    'theme/tokens.css', 'theme/components.css', 'engine/deck.css',
    'lib/motion.js', 'lib/benchlm-data.js', 'lib/cost-math.js', 'lib/gates-core.js', 'lib/slotting-core.js',
    'content/your-numbers.js', 'engine/deck.js',
    'scenes/timer.js', 'scenes/title.js', 'scenes/gates.js', 'scenes/cost.js', 'scenes/cash.js',
    'scenes/warehouse.js', 'scenes/screener.js', 'scenes/misc.js',
    'slides/act0.js', 'slides/act1.js', 'slides/act2.js', 'slides/act3.js', 'slides/act4.js', 'slides/act5.js',
    'slides/_demo.js'
  ], 'load order');
  assert(/Deck\.start\(\)\s*;?\s*<\/script>\s*<\/body>/.test(html), 'the last script calls Deck.start()');
  assert(!/type\s*=\s*["']module["']/.test(html), 'index.html uses no ES modules');
  for (const ref of refs) { assert(fs.existsSync(path.join(ROOT, 'deck', ref)), 'missing file: deck/' + ref); }

  // The engine's own files must not reach for the network or use modules.
  const own = ['deck/index.html', 'deck/engine/deck.js', 'deck/engine/deck.css', 'deck/lib/motion.js', 'deck/scenes/timer.js',
    'deck/slides/_demo.js', 'deck/theme/tokens.css', 'deck/theme/components.css'];
  for (const file of own) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert(!/https?:\/\//.test(text), file + ' contains an http(s) URL');
    assert(!/\bfetch\s*\(|XMLHttpRequest|\bimport\s*\(|^\s*import\s|^\s*export\s|@import/m.test(text), file + ' uses fetch / XHR / import');
    assert(!/BroadcastChannel/.test(text), file + ' relies on BroadcastChannel');
  }
});

test('motion.js loads under Node and its pure logic works', async () => {
  const Motion = require(path.join(ROOT, 'deck', 'lib', 'motion.js'));
  eq(Motion.formatNumber(3600, '$,d'), '$3,600');
  eq(Motion.formatNumber(1234.567, '$,.2f'), '$1,234.57');
  eq(Motion.formatNumber(1234.567, ',d'), '1,235');
  eq(Motion.formatNumber(4.26, '.1f'), '4.3');
  eq(Motion.formatNumber(42, '%d'), '42');
  eq(Motion.formatNumber(-1234.5, '$,.2f'), '-$1,234.50');
  eq(Motion.lerp(10, 20, 0.25), 12.5);
  eq(Motion.clamp(5, 0, 3), 3);
  eq(Motion.mapRange(5, 0, 10, 100, 200), 150);
  for (const name of ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'inQuart', 'outQuart',
    'inOutQuart', 'inExpo', 'outExpo', 'inOutExpo', 'inBack', 'outBack', 'inOutBack']) {
    near(Motion.ease[name](0), 0, 1e-9, name + '(0)');
    near(Motion.ease[name](1), 1, 1e-9, name + '(1)');
  }
  const spring = Motion.ease.spring(170, 14);
  eq([spring(0), spring(1)], [0, 1], 'spring ends');
  assert(spring(0.25) > 1, 'an under-damped spring overshoots');
  eq(Motion.ease.steps(4)(0.6), 0.5, 'steps(4)(0.6)');

  // seeded random numbers: same seed, same sequence
  const a = Motion.rng(42);
  const b = Motion.rng(42);
  const seqA = [a.next(), a.range(5, 6), a.int(1, 8), a.normal()];
  const seqB = [b.next(), b.range(5, 6), b.int(1, 8), b.normal()];
  eq(seqA, seqB, 'rng(42) repeats');
  const r = Motion.rng('warehouse');
  for (let i = 0; i < 500; i++) {
    const n = r.int(1, 8);
    assert(n >= 1 && n <= 8 && Number.isInteger(n), 'int(1, 8) stays in range');
  }
  const deck = [1, 2, 3, 4, 5, 6];
  const shuffled = r.shuffle(deck);
  eq(deck, [1, 2, 3, 4, 5, 6], 'shuffle leaves the input alone');
  eq(shuffled.slice().sort(), deck, 'shuffle keeps every element');

  // manual clock drives tweens, loops and timelines
  Motion.useManualClock(0);
  const seen = [];
  let done = false;
  const tw = Motion.tween({ from: 0, to: 100, duration: 2, ease: 'linear', onUpdate: (v) => seen.push(v), onDone: () => { done = true; } });
  Motion.setTime(1);
  eq(seen[seen.length - 1], 50, 'tween at half time');
  eq(Motion.stats().pending, 1, 'one finite tween pending');
  Motion.setTime(2.5);
  eq([seen[seen.length - 1], done, Motion.stats().pending], [100, true, 0], 'tween finished');
  eq(await tw.finished, true, 'finished promise');

  let frames = 0;
  const stop = Motion.raf(() => { frames++; });
  Motion.setTime(3); Motion.setTime(4);
  stop();
  Motion.setTime(5);
  eq([frames, Motion.stats().loops], [2, 0], 'raf follows the manual clock and stops');

  let x = 0;
  const marks = [];
  const tl = Motion.timeline();
  tl.add({ from: 0, to: 100, duration: 1, ease: 'linear', onUpdate: (v) => { x = v; } });
  tl.add({ from: 100, to: 200, duration: 1, ease: 'linear', onUpdate: (v) => { x = v; } }, 2);
  tl.at(1.5, () => marks.push('do'), () => marks.push('undo'));
  eq(tl.duration, 3, 'timeline duration');
  tl.seek(0.5); eq(x, 50, 'seek 0.5');
  tl.seek(2.5); eq([x, marks], [150, ['do']], 'seek 2.5');
  tl.seek(0.25); eq([x, marks], [25, ['do', 'undo']], 'seek back');
  tl.play(0);
  Motion.setTime(5 + 2.5);
  eq(x, 150, 'timeline playing on the manual clock');
  Motion.setTime(5 + 10);
  eq([x, tl.playing, Motion.stats().pending], [200, false, 0], 'timeline finished');
  Motion.useRealClock();
});

test('loads from file:// with no errors; demo slides present; skip() honoured', async () => {
  const t = await open({});
  try {
    const ids = await t.page.evaluate(() => window.__deck.ids());
    for (const id of ['demo-reveals', 'demo-counter', 'demo-timer', 'demo-scene', 'demo-throws']) {
      assert(ids.includes(id), 'slide ' + id + ' is in the running order');
    }
    assert(!ids.includes('demo-skipped'), 'demo-skipped is left out of the running order');
    eq(await t.page.evaluate(() => window.__deck.count()), ids.length, 'count() matches ids()');
    eq(await t.page.evaluate(() => [window.__deck.stepsOf('demo-reveals'), window.__deck.stepsOf('demo-counter'), window.__deck.stepsOf('demo-scene')]), [5, 1, 2], 'stepsOf');
    eq(await t.page.evaluate(() => location.protocol), 'file:', 'protocol');

    // walking forward from the scene slide lands on the throwing slide, not the skipped one
    await goto(t.page, 'demo-scene', 2);
    await t.page.keyboard.press('ArrowRight');
    await expectAt(t.page, 'demo-throws', 0, 'after demo-scene');
    eq(await t.page.evaluate(() => document.getElementById('deck').textContent.includes('skip() is broken')), false, 'skipped slide text is nowhere on the page');

    // the skipped id in the hash falls back to the first slide
    await t.page.evaluate(() => { location.hash = '#/demo-skipped/0'; });
    await t.page.waitForFunction(() => window.__deck.current().index === 0);
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('window.DECK_DEMO = false switches the demo slides off; ?demo forces them back on', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const off = await context.newPage();
    const problems = [];
    watch(off, problems);
    await off.addInitScript(() => { window.DECK_DEMO = false; });
    await off.goto(DECK_URL);
    await off.waitForFunction(() => window.__deck && document.documentElement.classList.contains('deck-on'), null, { timeout: 15000 });
    const ids = await off.evaluate(() => window.__deck.ids());
    eq(ids.filter((id) => /^demo-/.test(id)), [], 'no demo slides without ?demo');
    if (ids.length === 0) {
      assert((await off.evaluate(() => (document.querySelector('.deck-empty') || {}).textContent || '')).includes('No slides'), 'an empty deck says so instead of breaking');
      await off.keyboard.press('ArrowRight');
      await off.keyboard.press('o');
      eq(problems, [], 'an empty deck logs no errors, even when keys are pressed');
    }
    const on = await context.newPage();
    await on.addInitScript(() => { window.DECK_DEMO = false; });
    await on.goto(deckUrl('', 'demo-timer/0'));
    await ready(on);
    await expectAt(on, 'demo-timer', 0, '?demo overrides the flag');
  } finally { await context.close(); }
});

test('stage scaling at four window sizes; scenes get resize(); fitCanvas', async () => {
  const t = await open({ init: sceneSpy, hash: 'demo-scene/0', viewport: { width: 1920, height: 1080 } });
  try {
    const sizes = [[1920, 1080], [1280, 720], [1000, 1000], [2400, 900]];
    for (const [w, h] of sizes) {
      await t.page.setViewportSize({ width: w, height: h });
      const scale = Math.min(w / 1920, h / 1080);
      await t.page.waitForFunction((s) => Math.abs(window.__deck.scale() - s) < 0.001, scale, { timeout: 3000 });
      const box = await t.page.evaluate(() => {
        const r = document.querySelector('.deck-stage').getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
      const label = w + 'x' + h;
      near(box.w, 1920 * scale, 1, label + ' stage width');
      near(box.h, 1080 * scale, 1, label + ' stage height');
      near(box.x, (w - 1920 * scale) / 2, 1, label + ' centred horizontally');
      near(box.y, (h - 1080 * scale) / 2, 1, label + ' centred vertically');
      eq(await t.page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth, document.documentElement.scrollHeight <= innerHeight]), [true, true], label + ' no scrollbars');

      // the canvas backing store follows: CSS size x devicePixelRatio x stage scale
      const canvas = await t.page.evaluate(() => {
        const c = document.querySelector('.deck-slides > .slide.is-current canvas');
        return { css: c.clientWidth, px: c.width };
      });
      near(canvas.px, canvas.css * scale, 1.5, label + ' canvas backing store');
    }
    const log = await sceneLog(t.page, 'demo-orbit');
    assert(log.filter((e) => e[0] === 'resize').length >= 3, 'the scene received resize() calls');

    const fit = await t.page.evaluate(() => {
      const c = document.querySelector('.deck-slides > .slide.is-current canvas');
      const f = window.Deck.fitCanvas(c);
      return { width: f.width, height: f.height, ratio: f.ratio, css: [c.clientWidth, c.clientHeight], hasCtx: !!f.ctx };
    });
    eq([fit.width, fit.height], fit.css, 'fitCanvas reports stage units');
    assert(fit.hasCtx, 'fitCanvas returns a context');
  } finally { await t.close(); }

  // high-density screen: the ratio is capped at 2
  const hi = await open({ hash: 'demo-scene/0', viewport: { width: 1920, height: 1080 }, dpr: 3 });
  try {
    const ratio = await hi.page.evaluate(() => window.Deck.fitCanvas(document.querySelector('.deck-slides > .slide.is-current canvas')).ratio);
    eq(ratio, 2, 'ratio cap at devicePixelRatio 3');
  } finally { await hi.close(); }
});

test('steps: forward and back visibility, data-step-only, data-step-out, slide boundaries', async () => {
  const t = await open({});
  try {
    const p = t.page;
    eq(await p.evaluate(() => document.querySelector('.deck-slides > .slide.is-current').getAttribute('data-current-step')), '0', 'data-current-step');
    let v = await look(p, '[data-step="1"]');
    eq([v.shown, v.visibility], [false, 'hidden'], 'step 1 element hidden at step 0');
    v = await look(p, '[data-step-out="1"]');
    eq([v.shown, v.visibility], [true, 'visible'], 'step-out element visible at step 0');

    await p.keyboard.press('ArrowRight');
    await settle(p);
    await expectAt(p, 'demo-reveals', 1);
    v = await look(p, '[data-step="1"]');
    eq([v.shown, v.visibility, v.opacity], [true, 'visible', 1], 'step 1 element revealed');
    v = await look(p, '[data-step-out="1"]');
    eq([v.shown, v.visibility], [false, 'hidden'], 'step-out element gone at step 1');
    eq((await look(p, '[data-step="2"]')).shown, false, 'step 2 element still hidden');
    eq(await p.evaluate(() => document.querySelector('.deck-slides > .slide.is-current').getAttribute('data-current-step')), '1', 'data-current-step follows');

    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    await settle(p);
    eq((await look(p, '[data-step-only="3"]')).visibility, 'visible', 'step-only element visible at step 3');
    await p.keyboard.press('ArrowRight');
    await settle(p);
    eq((await look(p, '[data-step-only="3"]')).visibility, 'hidden', 'step-only element hidden at step 4');
    eq((await look(p, '[data-step="4"]')).opacity, 1, 'step 4 element revealed');

    // back: step 4 element hides again
    await p.keyboard.press('ArrowLeft');
    await settle(p);
    await expectAt(p, 'demo-reveals', 3);
    v = await look(p, '[data-step="4"]');
    eq([v.shown, v.visibility], [false, 'hidden'], 'going back hides the later step');
    eq((await look(p, '[data-step-only="3"]')).visibility, 'visible', 'step-only element is back');

    // past the last step: next slide at step 0. Back again: previous slide at its LAST step, all revealed.
    await goto(p, 'demo-reveals', 5);
    await p.keyboard.press('ArrowRight');
    await settle(p);
    await expectAt(p, 'demo-counter', 0, 'next slide starts at step 0');
    await p.keyboard.press('ArrowLeft');
    await settle(p);
    await expectAt(p, 'demo-reveals', 5, 'back lands on the last step');
    for (const n of [1, 2, 3, 4, 5]) {
      v = await look(p, '[data-step="' + n + '"]');
      eq([v.shown, v.opacity], [true, 1], 'step ' + n + ' element visible after coming back');
    }
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('data-anim: rise, fade, wipe, stamp and pop each have their own hidden state', async () => {
  const t = await open({ flags: 'fast' });
  try {
    const p = t.page;
    const rise = await look(p, '[data-anim="rise"]');
    const fade = await look(p, '[data-step="2"][data-anim="fade"]');
    const wipe = await look(p, '[data-anim="wipe"]');
    const pop = await look(p, '[data-anim="pop"]');
    const stamp = await look(p, '[data-anim="stamp"]');
    assert(rise.translate !== 'none' && rise.opacity === 0, 'rise is offset and transparent while hidden: ' + JSON.stringify(rise));
    assert(fade.translate === 'none' && fade.scale === 'none' && fade.opacity === 0, 'fade only changes opacity: ' + JSON.stringify(fade));
    assert(/inset/.test(wipe.clipPath) && wipe.opacity === 1, 'wipe is clipped, not transparent: ' + JSON.stringify(wipe));
    assert(pop.scale !== 'none' && Number(pop.scale) < 1, 'pop starts small: ' + JSON.stringify(pop));
    assert(stamp.scale !== 'none' && Number(stamp.scale) > 1 && stamp.rotate !== 'none', 'stamp starts large and turned: ' + JSON.stringify(stamp));
    for (const v of [rise, fade, wipe, pop, stamp]) { eq(v.visibility, 'hidden', 'hidden elements are not visible'); }

    await goto(p, 'demo-reveals', 5);
    for (const sel of ['[data-anim="rise"]', '[data-anim="wipe"]', '[data-anim="pop"]', '[data-anim="stamp"]']) {
      const v = await look(p, sel);
      eq([v.visibility, v.opacity, v.translate, v.scale, v.rotate], ['visible', 1, 'none', 'none', 'none'], sel + ' final state');
    }
  } finally { await t.close(); }
});

test('counters count up when revealed, reset when hidden, and are instant in ?fast', async () => {
  const t = await open({});
  try {
    const p = t.page;
    await goto(p, 'demo-reveals', 5);
    // freeze time so the count can be checked mid-flight
    await p.evaluate(() => window.Motion.useManualClock(100));
    await p.keyboard.press('ArrowRight');
    await expectAt(p, 'demo-counter', 0);
    const main = '[data-demo="main-count"]';
    const second = '[data-demo="second-count"]';
    eq((await look(p, main)).text, '$0', 'starts from zero');
    await p.evaluate(() => window.Motion.setTime(100.3));
    const mid = (await look(p, main)).text;
    assert(mid !== '$0' && mid !== '$3,600' && /^\$[\d,]+$/.test(mid), 'mid-count value is in between: ' + mid);
    await p.evaluate(() => window.Motion.setTime(105));
    eq((await look(p, main)).text, '$3,600', 'final value, formatted "$,d"');

    // a counter inside a step waits for its step
    eq((await look(p, second)).text, '0.0 seconds', 'hidden counter waits at its start value');
    await p.keyboard.press('ArrowRight');
    await p.evaluate(() => window.Motion.setTime(105.2));
    const mid2 = (await look(p, second)).text;
    assert(mid2 !== '0.0 seconds' && mid2 !== '4.3 seconds', 'second counter is counting: ' + mid2);
    await p.evaluate(() => window.Motion.setTime(110));
    eq((await look(p, second)).text, '4.3 seconds', 'format ".1f" with a suffix');
    await p.keyboard.press('ArrowLeft');
    eq((await look(p, second)).text, '0.0 seconds', 'stepping back resets it');

    // with the real clock the same thing finishes by itself
    await p.evaluate(() => window.Motion.useRealClock());
    await p.keyboard.press('ArrowRight');
    await settle(p);
    eq((await look(p, second)).text, '4.3 seconds', 'reaches the final value on the real clock');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }

  const fast = await open({ flags: 'fast' });
  try {
    await fast.page.evaluate(() => { window.__deck.goto('demo-counter', 0); });
    eq((await look(fast.page, '[data-demo="main-count"]')).text, '$3,600', '?fast shows the final value at once');
  } finally { await fast.close(); }
});

test('URL hash stays in sync; reload restores slide and step; unknown id falls back', async () => {
  const t = await open({});
  try {
    const p = t.page;
    eq(await p.evaluate(() => location.hash), '#/demo-reveals/0', 'initial hash');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    eq(await p.evaluate(() => location.hash), '#/demo-reveals/2', 'hash follows steps');
    await goto(p, 'demo-counter', 1);
    eq(await p.evaluate(() => location.hash), '#/demo-counter/1', 'hash follows slides');

    await p.reload();
    await ready(p);
    await expectAt(p, 'demo-counter', 1, 'after reload');
    await settle(p);
    eq((await look(p, '[data-step="1"]')).visibility, 'visible', 'the step is restored, not just the slide');
    eq((await look(p, '[data-demo="second-count"]')).text, '4.3 seconds', 'counters show final values after a reload');

    // editing the hash by hand navigates
    await p.evaluate(() => { location.hash = '#/demo-scene/1'; });
    await waitAt(p, 'demo-scene', 1, 'hashchange');

    // unknown id: first slide
    const first = await p.evaluate(() => window.__deck.ids()[0]);
    await p.goto(deckUrl('', 'no-such-slide/3'));
    await ready(p);
    await expectAt(p, first, 0, 'unknown id');
    eq(await p.evaluate(() => location.hash), '#/' + first + '/0', 'hash rewritten');

    // a step that is too large is clamped
    await p.goto(deckUrl('', 'demo-counter/99'));
    await p.reload();
    await ready(p);
    await expectAt(p, 'demo-counter', 1, 'step clamped');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('keys: Space, Enter, PageDown, PageUp, Backspace, Home, End, digits + Enter', async () => {
  const t = await open({ flags: 'fast' });
  try {
    const p = t.page;
    const ids = await p.evaluate(() => window.__deck.ids());
    const at = async () => { const c = await cur(p); return c.id + '/' + c.step; };

    await p.keyboard.press('Space'); eq(await at(), 'demo-reveals/1', 'Space');
    await p.keyboard.press('Enter'); eq(await at(), 'demo-reveals/2', 'Enter');
    await p.keyboard.press('PageDown'); eq(await at(), 'demo-reveals/3', 'PageDown (clicker)');
    await p.keyboard.press('PageUp'); eq(await at(), 'demo-reveals/2', 'PageUp (clicker)');
    await p.keyboard.press('Backspace'); eq(await at(), 'demo-reveals/1', 'Backspace');
    await p.keyboard.press('ArrowLeft'); eq(await at(), 'demo-reveals/0', 'ArrowLeft');
    await p.keyboard.press('End'); eq((await cur(p)).index, ids.length - 1, 'End');
    await p.keyboard.press('Home'); eq((await cur(p)).index, 0, 'Home');

    // digits then Enter: slide numbers are 1-based
    const target = ids.indexOf('demo-timer') + 1;
    for (const d of String(target)) { await p.keyboard.press(d); }
    eq(await p.evaluate(() => document.querySelector('.deck-jump').hidden), false, 'the typed number is shown');
    assert((await p.evaluate(() => document.querySelector('.deck-jump').textContent)).includes(String(target)), 'jump chip shows the digits');
    await p.keyboard.press('Enter');
    await expectAt(p, 'demo-timer', 0, 'digit jump');
    eq(await p.evaluate(() => document.querySelector('.deck-jump').hidden), true, 'jump chip hides');

    // Escape cancels a number; a number past the end goes to the last slide
    await p.keyboard.press('1');
    await p.keyboard.press('Escape');
    await p.keyboard.press('Enter');
    eq((await cur(p)).index, ids.indexOf('demo-timer') + 1, 'after Escape, Enter is just "next"');
    eq(await p.evaluate(() => window.__deck.overview()), false, 'Escape did not open the overview while a number was pending');
    for (const d of '9999') { await p.keyboard.press(d); }
    await p.keyboard.press('Enter');
    eq((await cur(p)).index, ids.length - 1, 'number past the end');

    // Ctrl / Cmd combinations are the browser's, not ours
    await goto(p, 'demo-reveals', 0);
    await p.keyboard.press('Control+ArrowRight');
    eq(await at(), 'demo-reveals/0', 'Ctrl+ArrowRight is ignored');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('overview: O and Escape toggle it, grouped by act, static thumbnails, click and keys jump', async () => {
  const t = await open({ flags: 'fast' });
  try {
    const p = t.page;
    const ids = await p.evaluate(() => window.__deck.ids());
    const loopsBefore = await loops(p);

    await p.keyboard.press('o');
    eq(await p.evaluate(() => window.__deck.overview()), true, 'O opens');
    const ov = await p.evaluate(() => {
      const root = document.querySelector('.deck-overview');
      return {
        hidden: root.hidden,
        display: getComputedStyle(root).display,
        items: root.querySelectorAll('.deck-overview-item').length,
        acts: Array.from(root.querySelectorAll('.deck-overview-act')).map((s) => ({
          heading: s.querySelector('.deck-overview-heading').textContent,
          count: s.querySelectorAll('.deck-overview-item').length
        })),
        thumbs: root.querySelectorAll('.deck-thumb > .slide.is-static').length,
        canvases: root.querySelectorAll('canvas').length,
        timers: root.querySelectorAll('.timer').length,
        current: Array.from(root.querySelectorAll('.deck-overview-item.is-current')).map((n) => n.getAttribute('data-index')),
        thumbWidth: root.querySelector('.deck-thumb > .slide').getBoundingClientRect().width,
        boxWidth: root.querySelector('.deck-thumb').getBoundingClientRect().width,
        stepsShown: root.querySelector('[data-thumb-of="demo-reveals"] [data-step="5"]').classList.contains('is-visible')
      };
    });
    eq([ov.hidden, ov.display !== 'none'], [false, true], 'overview is displayed');
    eq(ov.items, ids.length, 'one thumbnail per slide');
    eq(ov.thumbs, ids.length, 'thumbnails are static slide copies');
    assert(ov.acts.length >= 1 && ov.acts.every((a) => /^Act \d/.test(a.heading) && a.count > 0), 'grouped under act headings: ' + JSON.stringify(ov.acts));
    eq(ov.acts.reduce((n, a) => n + a.count, 0), ids.length, 'every slide is in a group');
    eq([ov.canvases, ov.timers], [0, 0], 'no scenes are mounted in the overview');
    near(ov.thumbWidth, ov.boxWidth, 1, 'the slide copy is scaled to its box');
    eq(ov.stepsShown, true, 'thumbnails show the final step');
    eq(ov.current, [String(ids.indexOf('demo-reveals'))], 'the current slide is marked');
    eq(await loops(p), loopsBefore, 'opening the overview starts no animation loops');
    eq((await p.evaluate(() => window.__deck.mounted())).length, 1, 'only the live slide is mounted');

    // click a thumbnail
    await p.click('.deck-overview-item[data-index="' + ids.indexOf('demo-timer') + '"]');
    eq(await p.evaluate(() => window.__deck.overview()), false, 'click closes the overview');
    await expectAt(p, 'demo-timer', 0, 'click jumps');

    // Escape opens and closes it too
    await p.keyboard.press('Escape');
    eq(await p.evaluate(() => window.__deck.overview()), true, 'Escape opens');
    await p.keyboard.press('Escape');
    eq(await p.evaluate(() => window.__deck.overview()), false, 'Escape closes');
    await expectAt(p, 'demo-timer', 0, 'closing does not move');

    // keyboard: arrows move the selection, Enter jumps
    await p.keyboard.press('o');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Enter');
    eq((await cur(p)).index, ids.indexOf('demo-timer') + 1, 'arrow + Enter jumps');
    eq(await p.evaluate(() => window.__deck.overview()), false, 'Enter closes the overview');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('blackout: B and "." toggle; a next key only brings the picture back', async () => {
  const t = await open({});
  try {
    const p = t.page;
    const opacity = () => p.evaluate(() => Number(getComputedStyle(document.querySelector('.deck-blackout')).opacity));
    eq(await opacity(), 0, 'not black to begin with');
    await p.keyboard.press('b');
    await settle(p);
    eq([await p.evaluate(() => window.__deck.blackout()), await opacity()], [true, 1], 'B blacks out');
    const cover = await p.evaluate(() => {
      const r = document.querySelector('.deck-blackout').getBoundingClientRect();
      return [r.width >= innerWidth, r.height >= innerHeight, getComputedStyle(document.querySelector('.deck-blackout')).backgroundColor];
    });
    eq(cover, [true, true, 'rgb(0, 0, 0)'], 'covers the whole window in black');
    await p.keyboard.press('.');
    await settle(p);
    eq([await p.evaluate(() => window.__deck.blackout()), await opacity()], [false, 0], '"." brings it back');

    await p.keyboard.press('.');
    eq(await p.evaluate(() => window.__deck.blackout()), true, '"." blacks out (clicker key)');
    await p.keyboard.press('PageDown');
    eq(await p.evaluate(() => window.__deck.blackout()), false, 'PageDown ends the blackout');
    await expectAt(p, 'demo-reveals', 0, 'and does not advance');
    await p.keyboard.press('PageDown');
    await expectAt(p, 'demo-reveals', 1, 'the next press advances');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('a slide whose enter() throws does not break the deck; ?debug shows a badge', async () => {
  const quiet = await open({});
  try {
    const p = quiet.page;
    await goto(p, 'demo-scene', 2);
    await p.keyboard.press('ArrowRight');
    await settle(p);
    await expectAt(p, 'demo-throws', 0);
    const shown = await p.evaluate(() => {
      const s = document.querySelector('.deck-slides > .slide.is-current');
      return { id: s.getAttribute('data-slide-id'), opacity: getComputedStyle(s).opacity, text: s.querySelector('h1').textContent };
    });
    eq([shown.id, shown.opacity], ['demo-throws', '1'], 'the slide is on screen');
    assert(/throws/.test(shown.text), 'its content rendered');
    const errs = await p.evaluate(() => window.__deck.errors());
    const mine = errs.filter((e) => e.slide === 'demo-throws');
    eq(mine.length, 1, 'the error was recorded once');
    assert(/enter/.test(mine[0].where) && /on purpose/.test(mine[0].message) && mine[0].expected === true, 'recorded with where/message/expected');

    await p.keyboard.press('ArrowLeft');
    await settle(p);
    await expectAt(p, 'demo-scene', 2, 'back still works');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Home');
    await settle(p);
    eq((await cur(p)).index, 0, 'Home still works');
    eq(await liveCount(p), 1, 'one slide in the DOM');
    eq(quiet.problems, [], 'without ?debug nothing reaches the console');
    eq(await p.evaluate(() => !!document.querySelector('.deck-debug-badge')), false, 'without ?debug there is no badge');
  } finally { await quiet.close(); }

  const debug = await open({ flags: 'debug' });
  try {
    const p = debug.page;
    await goto(p, 'demo-throws', 0);
    const badge = await p.evaluate(() => {
      const b = document.querySelector('.deck-debug-badge');
      return b ? { hidden: b.hidden, text: b.textContent, display: getComputedStyle(b).display } : null;
    });
    assert(badge && !badge.hidden && badge.display !== 'none', 'the badge is visible with ?debug');
    assert(/demo-throws/.test(badge.text) && /enter/.test(badge.text) && /on purpose/.test(badge.text), 'the badge says what threw: ' + badge.text);
    assert(debug.problems.some((m) => /demo-throws/.test(m)), 'with ?debug the error is also logged');

    // registering a duplicate or late slide is reported, never thrown
    const before = await p.evaluate(() => window.__deck.errors().length);
    await p.evaluate(() => { window.Deck.slide({ id: 'demo-reveals', html: 'again' }); window.Deck.slide({}); });
    eq(await p.evaluate(() => window.__deck.errors().length), before + 2, 'bad Deck.slide() calls are recorded');
    await p.keyboard.press('ArrowLeft');
    await expectAt(p, 'demo-scene', 2, 'still navigates');
  } finally { await debug.close(); }
});

test('a scene whose factory or step() throws is isolated too', async () => {
  // Add two broken things before the deck starts: an undefined scene and a scene that throws.
  const t = await open({
    hash: 'demo-reveals/0',
    init: () => {
      window.addEventListener('DOMContentLoaded', () => {}, { once: true });
      let real;
      Object.defineProperty(window, 'Deck', {
        configurable: true,
        get() { return real; },
        set(value) {
          real = value;
          const start = value.start;
          value.start = function () {
            window.Scenes.define('test-bad-step', function () {
              return { step: function () { throw new Error('test: step blew up'); }, destroy: function () { throw new Error('test: destroy blew up'); } };
            });
            window.Scenes.define('test-bad-mount', function () { throw new Error('test: mount blew up'); });
            value.slide({
              id: 'test-broken-scenes', act: 0, title: 'broken scenes',
              html: '<h1>broken scenes</h1><div data-scene="test-bad-step"></div><div data-scene="test-bad-mount"></div>' +
                '<div data-scene="test-not-defined"></div><div data-scene="timer" data-opts="{not json"></div><p data-step="1">one</p>'
            });
            return start.apply(value, arguments);
          };
        }
      });
    }
  });
  try {
    const p = t.page;
    await goto(p, 'test-broken-scenes', 0);
    await p.keyboard.press('ArrowRight');
    await settle(p);
    await expectAt(p, 'test-broken-scenes', 1, 'stepping works on a slide with broken scenes');
    eq((await look(p, '[data-step="1"]')).visibility, 'visible', 'its own reveal still happened');
    eq(await p.evaluate(() => !!document.querySelector('.deck-slides > .slide.is-current .timer')), true, 'the healthy scene on the same slide still mounted');
    const where = (await p.evaluate(() => window.__deck.errors())).filter((e) => e.slide === 'test-broken-scenes').map((e) => e.message).join(' | ');
    for (const needle of ['mount blew up', 'step blew up', 'not defined']) { assert(where.includes(needle), 'recorded "' + needle + '": ' + where); }
    await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('ArrowLeft');
    await settle(p);
    assert((await cur(p)).id !== 'test-broken-scenes', 'leaving works even though destroy() throws');
    eq(await liveCount(p), 1, 'the broken slide was removed');
    eq(t.problems, [], 'nothing reached the console');
  } finally { await t.close(); }
});

test('scenes: mounted on enter, step(current, 0) then step(n, dir), destroyed on exit, no leaked loops', async () => {
  const t = await open({ init: sceneSpy });
  try {
    const p = t.page;
    const idle = await loops(p);
    eq(idle, 0, 'no animation loops on a slide without scenes');
    eq(await sceneLog(p, 'demo-orbit'), [], 'the scene is not mounted before its slide');

    // enter at step 1: mount, then exactly one step(1, 0)
    await goto(p, 'demo-scene', 1);
    eq(await sceneLog(p, 'demo-orbit'), [['mount', 'demo-orbit'], ['step', 'demo-orbit', 1, 0]], 'mount + step(current, 0)');
    eq(await loops(p), idle + 1, 'the scene runs one loop');
    eq(await p.evaluate(() => window.__deck.mounted()), [{ id: 'demo-scene', scenes: ['demo-orbit'] }], 'mounted()');
    const size = await p.evaluate(() => {
      const host = document.querySelector('.deck-slides > .slide.is-current [data-scene]');
      return [host.clientWidth > 400, host.clientHeight > 200, !!host.querySelector('canvas')];
    });
    eq(size, [true, true, true], 'the host was attached and sized when the scene mounted');

    // step changes are forwarded with a direction
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowLeft');
    eq((await sceneLog(p, 'demo-orbit')).slice(2), [['step', 'demo-orbit', 2, 1], ['step', 'demo-orbit', 1, -1]], 'step(n, dir)');

    // the canvas really is animating (pixels change between frames)
    const moving = await p.evaluate(async () => {
      const c = document.querySelector('.deck-slides > .slide.is-current canvas');
      const a = c.toDataURL();
      await new Promise((r) => setTimeout(r, 250));
      return a !== c.toDataURL();
    });
    eq(moving, true, 'the scene is drawing frames');

    // leave: during the cross-fade both slides exist and the scene is still alive...
    await p.keyboard.press('ArrowRight');   // step 2
    await p.keyboard.press('ArrowRight');   // next slide
    eq(await liveCount(p), 2, 'two slides in the DOM during the transition');
    eq((await sceneLog(p, 'demo-orbit')).some((e) => e[0] === 'destroy'), false, 'not destroyed until the transition ends');
    // ...and afterwards it is destroyed and its loop is gone
    await settle(p);
    eq(await liveCount(p), 1, 'one slide in the DOM after the transition');
    const log = await sceneLog(p, 'demo-orbit');
    eq(log[log.length - 1], ['destroy', 'demo-orbit'], 'destroy() on exit');
    eq(log.filter((e) => e[0] === 'destroy').length, 1, 'destroyed exactly once');
    eq(await loops(p), idle, 'no loop left behind');

    // hammer the keys: never more than two slides, and nothing leaks
    await p.evaluate(() => {
      window.__maxSlides = 0;
      const host = document.querySelector('.deck-slides');
      new MutationObserver(() => { window.__maxSlides = Math.max(window.__maxSlides, host.children.length); }).observe(host, { childList: true });
    });
    await goto(p, 'demo-reveals', 5);
    for (let i = 0; i < 12; i++) { await p.keyboard.press('ArrowRight'); }
    for (let i = 0; i < 12; i++) { await p.keyboard.press('ArrowLeft'); }
    await p.keyboard.press('End');
    await p.keyboard.press('Home');
    await settle(p);
    await p.waitForTimeout(50);
    assert((await p.evaluate(() => window.__maxSlides)) <= 2, 'at most two slides in the DOM, saw ' + (await p.evaluate(() => window.__maxSlides)));
    eq(await liveCount(p), 1, 'one slide left');
    const mounts = (await sceneLog(p, 'demo-orbit')).filter((e) => e[0] === 'mount').length;
    const destroys = (await sceneLog(p, 'demo-orbit')).filter((e) => e[0] === 'destroy').length;
    assert(mounts >= 3, 'the scene was mounted again on each visit (' + mounts + ')');
    const here = await cur(p);
    eq(destroys, here.id === 'demo-scene' ? mounts - 1 : mounts, 'every mount has its destroy');
    await goto(p, 'demo-reveals', 0);
    eq(await loops(p), idle, 'no loops leaked after rapid navigation');
    eq(await p.evaluate(() => window.Motion.stats().pending), 0, 'no tweens left running');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('timer scene: T start/pause, R reset, last-minute and finished states, timestamp based', async () => {
  const t = await open({ hash: 'demo-timer/0' });
  try {
    const p = t.page;
    const timer = () => p.evaluate(() => {
      const root = document.querySelector('.deck-slides > .slide.is-current .timer');
      return {
        text: root.querySelector('.timer-digits').textContent,
        state: root.getAttribute('data-state'),
        lastMinute: root.hasAttribute('data-last-minute'),
        color: getComputedStyle(root).color,
        size: parseFloat(getComputedStyle(root.querySelector('.timer-digits')).fontSize),
        label: root.querySelector('.timer-label').textContent
      };
    });
    const idle = await loops(p);
    await p.evaluate(() => window.Motion.useManualClock(1000));

    let s = await timer();
    eq([s.text, s.state, s.lastMinute, s.label], ['2:00', 'idle', false, 'Timer demo'], 'initial');
    assert(s.size >= 300, 'digits are very large: ' + s.size + 'px on the 1080px stage');
    const normalColor = s.color;

    await p.keyboard.press('t');
    eq((await timer()).state, 'running', 'T starts');
    eq(await loops(p), idle + 1, 'one loop while running');
    // one single 30 second jump: a tick counter would be off, timestamps are exact
    await p.evaluate(() => window.Motion.setTime(1030));
    eq((await timer()).text, '1:30', 'derives the time from timestamps');

    await p.keyboard.press('t');
    eq((await timer()).state, 'paused', 'T pauses');
    eq(await loops(p), idle, 'no loop while paused');
    await p.evaluate(() => window.Motion.setTime(1100));
    eq((await timer()).text, '1:30', 'time stands still while paused');

    await p.keyboard.press('T');
    await p.evaluate(() => window.Motion.setTime(1100 + 30.5));
    await settle(p);                       // the colour change is a short CSS transition
    s = await timer();
    eq([s.text, s.state, s.lastMinute], ['1:00', 'running', true], 'last minute');
    assert(s.color !== normalColor, 'the last minute has its own colour');
    const warnColor = s.color;

    await p.evaluate(() => window.Motion.setTime(1100 + 95));
    eq(await settle(p), true, 'settle() ignores the endless "finished" pulse');
    s = await timer();
    eq([s.text, s.state, s.lastMinute], ['0:00', 'finished', false], 'finished');
    assert(s.color !== normalColor && s.color !== warnColor, 'finished has its own colour');
    eq(await loops(p), idle, 'the loop stops at zero');
    await p.keyboard.press('t');
    eq((await timer()).state, 'finished', 'T does nothing once time is up');

    await p.keyboard.press('r');
    await settle(p);
    s = await timer();
    eq([s.text, s.state, s.color], ['2:00', 'idle', normalColor], 'R resets');

    // clicking the timer also starts it, and does not advance the deck
    await p.click('.deck-slides > .slide.is-current .timer');
    eq((await timer()).state, 'running', 'click starts');
    await expectAt(p, 'demo-timer', 0, 'click did not advance');

    // leaving the slide while it runs must stop its loop
    await p.keyboard.press('ArrowRight');
    await settle(p);
    eq(await loops(p), (await cur(p)).id === 'demo-scene' ? idle + 1 : idle, 'the timer loop is gone after leaving');
    await goto(p, 'demo-reveals', 0);
    eq(await loops(p), idle, 'no loops left');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('presenter view: opens with S, shows notes, stays in sync both ways, pacing', async () => {
  const t = await open({});
  try {
    const p = t.page;
    const [pv] = await Promise.all([p.waitForEvent('popup'), p.keyboard.press('s')]);
    const pvProblems = [];
    watch(pv, pvProblems);
    await ready(pv);
    assert(/[?&]presenter/.test(pv.url()) && /^file:/.test(pv.url()), 'presenter URL: ' + pv.url());
    await waitAt(pv, 'demo-reveals', 0, 'presenter opens on the same slide');
    const ids = await p.evaluate(() => window.__deck.ids());
    const index = ids.indexOf('demo-reveals');

    const panel = () => pv.evaluate(() => ({
      pos: document.querySelector('.deck-pv-pos').textContent.replace(/\s+/g, ' ').trim(),
      act: document.querySelector('.deck-pv-act').textContent,
      title: document.querySelector('.deck-pv-title').textContent,
      notes: document.querySelector('.deck-pv-notes').textContent,
      notesSize: parseFloat(getComputedStyle(document.querySelector('.deck-pv-notes')).fontSize),
      next: document.querySelector('.deck-pv-next-title').textContent,
      clock: document.querySelector('.deck-pv-clock').textContent,
      elapsed: document.querySelector('.deck-pv-elapsed').textContent,
      planned: document.querySelector('.deck-pv-planned, .deck-pv-pace .deck-pv-row').textContent,
      status: document.querySelector('.deck-pv-status').textContent,
      linked: document.querySelector('.deck-pv-link').getAttribute('data-linked'),
      stageScenes: document.querySelectorAll('canvas, .timer').length
    }));

    await pv.waitForFunction(() => document.querySelector('.deck-pv-link').getAttribute('data-linked') === 'yes', null, { timeout: 5000 });
    let v = await panel();
    eq(v.pos, (index + 1) + ' / ' + ids.length, 'slide number / total');
    assert(/^Act 0/.test(v.act), 'act: ' + v.act);
    eq(v.title, 'Demo: step reveals', 'title');
    assert(v.notes.includes('Five builds, one per data-anim value'), 'speaker notes are shown');
    assert(v.notesSize >= 28, 'notes are in large type: ' + v.notesSize + 'px');
    assert(/Build 1 of 5/.test(v.next) && /counters/.test(v.next), 'next: ' + v.next);
    assert(/\d{1,2}:\d{2}:\d{2}/.test(v.clock), 'wall clock: ' + v.clock);
    eq(v.elapsed, '0:00', 'elapsed timer waits');
    eq(v.stageScenes, 0, 'the presenter view mounts no scenes');
    eq(await pv.evaluate(() => window.__deck.pacing().started), false, 'timer has not started before the first advance');

    // deck -> presenter
    await p.keyboard.press('ArrowRight');
    await waitAt(pv, 'demo-reveals', 1, 'deck step reaches the presenter');
    eq(await pv.evaluate(() => window.__deck.pacing().started), true, 'the elapsed timer starts on the first advance');
    await goto(p, 'demo-counter', 0);
    await waitAt(pv, 'demo-counter', 0, 'deck slide change reaches the presenter');
    v = await panel();
    eq(v.title, 'Demo: counters and long notes', 'presenter title follows');
    assert(v.notes.includes('deliberately long notes') && v.notes.includes('Last paragraph'), 'long notes are all there');
    eq(await pv.evaluate(() => !!document.querySelector('.deck-pv-notes .deck-notes-story')), true, '"YOUR STORY:" paragraph is marked');
    eq(await pv.evaluate(() => location.hash), '#/demo-counter/0', 'presenter hash follows');

    // presenter -> deck: keys, then its own buttons
    await pv.keyboard.press('ArrowRight');
    await waitAt(p, 'demo-counter', 1, 'presenter key reaches the deck');
    await pv.keyboard.press('PageDown');
    await waitAt(p, 'demo-timer', 0, 'presenter PageDown reaches the deck');
    await settle(p);
    eq(await p.evaluate(() => document.querySelector('.deck-slides > .slide.is-current').getAttribute('data-slide-id')), 'demo-timer', 'the deck really shows that slide');
    await pv.click('.deck-pv-prev');
    await waitAt(p, 'demo-counter', 1, 'presenter Back button');
    await pv.click('.deck-pv-go');
    await waitAt(p, 'demo-timer', 0, 'presenter Next button');
    await expectAt(pv, 'demo-timer', 0, 'presenter itself moved');

    // timer and blackout keys pressed in the presenter act on the deck
    await pv.keyboard.press('t');
    await p.waitForFunction(() => window.__deck.scene('timer').state().state === 'running', null, { timeout: 4000 });
    await pv.keyboard.press('r');
    await p.waitForFunction(() => window.__deck.scene('timer').state().state === 'idle', null, { timeout: 4000 });
    await pv.keyboard.press('b');
    await p.waitForFunction(() => window.__deck.blackout() === true, null, { timeout: 4000 });
    eq(await pv.evaluate(() => document.querySelector('.deck-pv-blackout').hidden), false, 'presenter shows that the screen is black');
    await p.keyboard.press('b');
    await pv.waitForFunction(() => window.__deck.blackout() === false, null, { timeout: 4000 });

    // notes size: buttons and keys
    const size0 = (await panel()).notesSize;
    await pv.click('.deck-pv-bigger');
    await pv.keyboard.press('+');
    eq((await panel()).notesSize, size0 + 8, 'A+ and "+" enlarge the notes');
    await pv.click('.deck-pv-smaller');
    await pv.keyboard.press('-');
    eq((await panel()).notesSize, size0, 'A− and "-" shrink them');

    // pacing: planned start = minutes of the slides before; drive the clock by hand
    await pv.click('.deck-pv-reset');
    eq(await pv.evaluate(() => window.__deck.pacing().started), false, 'Reset stops and clears the elapsed timer');
    const info = await pv.evaluate(() => window.__deck.ids().map((id) => window.__deck.info(id).minutes));
    const plannedStart = (i) => info.slice(0, i).reduce((a, b) => a + b, 0) * 60;
    await pv.evaluate(() => window.Motion.useManualClock(0));
    await pv.evaluate(() => { window.__deck.goto('demo-reveals', 0); });
    await pv.keyboard.press('End');                     // an advance: starts the timer at t = 0
    const last = ids.length - 1;
    await pv.evaluate(() => window.Motion.setTime(30));
    let pace = await pv.evaluate(() => window.__deck.pacing());
    eq([pace.started, pace.running, pace.elapsed], [true, true, 30], 'elapsed follows the clock');
    eq(pace.plannedStart, plannedStart(last), 'planned start is the sum of the minutes before');
    eq([pace.status, pace.delta], ['ahead', plannedStart(last) - 30], 'ahead when early');
    await pv.waitForFunction(() => /^Ahead by \d+:\d\d$/.test(document.querySelector('.deck-pv-status').textContent), null, { timeout: 3000 });
    await pv.evaluate((s) => window.Motion.setTime(s + 20), plannedStart(last));
    pace = await pv.evaluate(() => window.__deck.pacing());
    eq(pace.status, 'on-pace', 'on pace inside the slide\'s planned window');
    await pv.evaluate((s) => window.Motion.setTime(s + 60 + 75), plannedStart(last));
    pace = await pv.evaluate(() => window.__deck.pacing());
    eq([pace.status, pace.delta], ['behind', 75], 'behind once the slide\'s time is used up');
    await pv.waitForFunction(() => document.querySelector('.deck-pv-status').textContent === 'Behind by 1:15', null, { timeout: 3000 });
    eq((await panel()).elapsed, (() => { const s = plannedStart(last) + 135; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); })(), 'elapsed display');
    // click the time to pause
    await pv.click('.deck-pv-elapsed');
    eq(await pv.evaluate(() => window.__deck.pacing().running), false, 'clicking the time pauses it');
    await pv.evaluate((s) => window.Motion.setTime(s + 999), plannedStart(last));
    eq(await pv.evaluate(() => window.__deck.pacing().delta), 75, 'paused time does not move');
    await pv.click('.deck-pv-elapsed');
    eq(await pv.evaluate(() => window.__deck.pacing().running), true, 'clicking again resumes');
    await pv.evaluate(() => window.Motion.useRealClock());
    await waitAt(p, ids[last], 0, 'the deck followed the presenter to the end');

    // reload the presenter while its timer runs: the elapsed time survives
    const beforeReload = await pv.evaluate(() => window.__deck.pacing().elapsed);
    await pv.reload();
    await ready(pv);
    let after = await pv.evaluate(() => window.__deck.pacing());
    assert(after.started && after.running && after.elapsed >= beforeReload && after.elapsed < beforeReload + 30,
      'elapsed timer survives a presenter reload: ' + beforeReload + ' -> ' + after.elapsed);

    // reload it again with the timer reset, while the deck is somewhere else: it finds the deck and catches up
    await pv.click('.deck-pv-reset');
    await goto(p, 'demo-scene', 1);
    await waitAt(pv, 'demo-scene', 1, 'presenter follows');
    await pv.evaluate(() => { history.replaceState(null, '', '#/demo-reveals/0'); });   // a stale address
    await pv.reload();
    await ready(pv);
    await waitAt(pv, 'demo-scene', 1, 'presenter catches up after its reload');
    eq(await pv.evaluate(() => window.__deck.pacing().started), false, 'catching up is not an "advance"');

    // scrolling the notes: a build step keeps the scroll position, a new slide resets it
    await goto(p, 'demo-counter', 0);
    await waitAt(pv, 'demo-counter', 0, 'presenter on the long-notes slide');
    await pv.setViewportSize({ width: 1000, height: 500 });
    await pv.evaluate(() => { document.querySelector('.deck-pv-notes').scrollTop = 120; });
    await p.keyboard.press('ArrowRight');
    await waitAt(pv, 'demo-counter', 1, 'build step');
    eq(await pv.evaluate(() => document.querySelector('.deck-pv-notes').scrollTop), 120, 'a build step leaves the notes where they were scrolled');
    await p.keyboard.press('ArrowRight');
    await waitAt(pv, 'demo-timer', 0, 'next slide');
    eq(await pv.evaluate(() => document.querySelector('.deck-pv-notes').scrollTop), 0, 'a new slide starts its notes at the top');
    await goto(p, 'demo-scene', 1);
    await waitAt(pv, 'demo-scene', 1, 'back in place');

    // reload the deck: the presenter re-links (it says hello every 2 s)
    await p.reload();
    await ready(p);
    await expectAt(p, 'demo-scene', 1, 'deck restored from its hash');
    await p.keyboard.press('ArrowRight');
    await waitAt(pv, 'demo-scene', 2, 'deck -> presenter after the deck reloaded');
    await pv.keyboard.press('ArrowLeft');
    await waitAt(p, 'demo-scene', 1, 'presenter -> deck after the deck reloaded');

    // pressing S again does not open a second window
    const pagesBefore = t.context.pages().length;
    await p.keyboard.press('s');
    await p.waitForTimeout(300);
    eq(t.context.pages().length, pagesBefore, 'S focuses the existing presenter window');

    eq(t.problems, [], 'deck console errors');
    eq(pvProblems, [], 'presenter console errors');
  } finally { await t.close(); }
});

test('?print: every slide at its final step, one per 1920x1080 page, scenes mounted; PDF page count', async () => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const problems = [];
  watch(page, problems);
  try {
    await page.addInitScript(sceneSpy);
    await page.goto(deckUrl('print'));
    await ready(page);
    eq(await page.evaluate(() => window.__deck.settle()), true, 'print view settles');
    const ids = await page.evaluate(() => window.__deck.ids());
    const pages = await page.evaluate(() => Array.from(document.querySelectorAll('.deck-print-page')).map((pg) => {
      const s = pg.querySelector('.slide');
      const r = pg.getBoundingClientRect();
      return {
        id: s.getAttribute('data-slide-id'),
        step: Number(s.getAttribute('data-current-step')),
        w: r.width, h: r.height,
        opacity: getComputedStyle(s).opacity,
        slides: pg.querySelectorAll('.slide').length
      };
    }));
    eq(pages.map((x) => x.id), ids, 'one page per slide, in order');
    assert(!ids.includes('demo-skipped'), 'skipped slides are not printed');
    for (const pg of pages) {
      eq([pg.w, pg.h, pg.opacity, pg.slides], [1920, 1080, '1', 1], pg.id + ' page');
      eq(pg.step, await page.evaluate((id) => window.__deck.stepsOf(id), pg.id), pg.id + ' is at its final step');
    }
    const detail = await page.evaluate(() => {
      const q = (id, sel) => document.querySelector('.slide[data-slide-id="' + id + '"] ' + sel);
      return {
        stamp: getComputedStyle(q('demo-reveals', '[data-anim="stamp"]')).visibility,
        stepOut: getComputedStyle(q('demo-reveals', '[data-step-out="1"]')).visibility,
        counter: q('demo-counter', '[data-demo="main-count"]').textContent,
        counter2: q('demo-counter', '[data-demo="second-count"]').textContent,
        timer: q('demo-timer', '.timer-digits').textContent,
        canvas: !!q('demo-scene', 'canvas')
      };
    });
    eq(detail, { stamp: 'visible', stepOut: 'hidden', counter: '$3,600', counter2: '4.3 seconds', timer: '2:00', canvas: true }, 'final states');
    // (file:// stylesheets cannot be read from script, so the @page rule is checked in the file and in the PDF)
    const css = fs.readFileSync(path.join(ROOT, 'deck', 'engine', 'deck.css'), 'utf8');
    assert(/@page\s*\{[^}]*size:\s*1920px\s+1080px;[^}]*margin:\s*0;[^}]*\}/.test(css), 'deck.css has @page { size: 1920px 1080px; margin: 0 }');
    eq(await sceneLog(page, 'demo-orbit'), [['mount', 'demo-orbit'], ['step', 'demo-orbit', 2, 0]], 'scenes are mounted and stepped to the last step');
    const unexpected = (await page.evaluate(() => window.__deck.errors())).filter((e) => !e.expected && /^demo-/.test(e.slide || ''));
    eq(unexpected, [], 'engine errors on demo slides');

    const pdf = await page.pdf({ width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
    const raw = pdf.toString('latin1');
    const pageCount = (raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
    eq(pageCount, ids.length, 'PDF has one page per slide');
    // 1920 x 1080 CSS px = 1440 x 810 pt
    const boxes = (raw.match(/\/MediaBox\s*\[[^\]]*\]/g) || []).map((b) => b.replace(/\s+/g, ' '));
    assert(boxes.length > 0 && boxes.every((b) => /\[ ?0 0 1440 810 ?\]/.test(b)), 'every PDF page is 1920x1080 px (1440x810 pt): ' + boxes.slice(0, 2).join(' '));
    if (problems.length) { console.log('      note: console output in print mode: ' + problems.join(' | ')); }
  } finally { await context.close(); }
});

test('?fast: 20x motion, instant CSS, settles quickly; settle() really waits without it; 5 s cap', async () => {
  const fast = await open({ flags: 'fast' });
  try {
    const p = fast.page;
    eq(await p.evaluate(() => [window.Motion.timeScale, document.documentElement.classList.contains('mode-fast')]), [20, true], '?fast sets Motion.timeScale and the mode class');
    const dur = await p.evaluate(() => getComputedStyle(document.querySelector('.deck-slides > .slide.is-current [data-step="1"]')).transitionDuration);
    assert(dur.split(',').every((d) => parseFloat(d) <= 0.001), 'CSS transitions are instant: ' + dur);

    const ids = await p.evaluate(() => window.__deck.ids());
    const demo = ids.filter((id) => /^demo-/.test(id));
    let worst = 0;
    const began = Date.now();
    for (const id of demo) {
      const steps = await p.evaluate((i) => window.__deck.stepsOf(i), id);
      for (let s = 0; s <= steps; s++) {
        const t0 = Date.now();
        eq(await goto(p, id, s), true, id + '/' + s + ' settles');
        worst = Math.max(worst, Date.now() - t0);
      }
    }
    assert(worst < 700, 'slowest settle in ?fast was ' + worst + ' ms');
    console.log('      ' + demo.length + ' demo slides, every step: ' + (Date.now() - began) + ' ms total, slowest settle ' + worst + ' ms');
    // a Motion tween runs 20x faster
    const took = await p.evaluate(async () => {
      const t0 = performance.now();
      await window.Motion.tween({ from: 0, to: 1, duration: 4 }).finished;
      return performance.now() - t0;
    });
    assert(took < 900, 'a 4 s tween took ' + Math.round(took) + ' ms in ?fast');
    eq(fast.problems, [], 'console errors');
  } finally { await fast.close(); }

  const slow = await open({});
  try {
    const p = slow.page;
    // without ?fast a reveal takes real time, and settle() waits for it
    const t0 = Date.now();
    await p.keyboard.press('ArrowRight');
    const midway = (await look(p, '[data-step="1"]')).opacity;
    eq(await settle(p), true, 'settle resolves true');
    const waited = Date.now() - t0;
    assert(midway < 1, 'the reveal was still running right after the key press (opacity ' + midway + ')');
    assert(waited >= 300 && waited < 3000, 'settle() waited for the transition: ' + waited + ' ms');
    eq((await look(p, '[data-step="1"]')).opacity, 1, 'finished when settle() resolved');

    // infinite loops are ignored: the scene slide (raf loop) settles
    eq(await goto(p, 'demo-scene', 0), true, 'a slide with an endless loop still settles');

    // the cap: a tween that can never finish (frozen clock) makes settle() give up after 5 s
    await p.evaluate(() => { window.Motion.useManualClock(); window.Motion.tween({ from: 0, to: 1, duration: 1 }); });
    const t1 = Date.now();
    eq(await settle(p), false, 'settle resolves false at the cap');
    const capped = Date.now() - t1;
    assert(capped >= 4800 && capped < 6500, 'the cap is 5 s: ' + capped + ' ms');
  } finally { await slow.close(); }
});

test('keys are ignored inside input, textarea, select, contenteditable and data-keys="own"', async () => {
  const t = await open({ flags: 'fast' });
  try {
    const p = t.page;
    await p.evaluate(() => {
      const slide = document.querySelector('.deck-slides > .slide.is-current');
      const box = document.createElement('div');
      box.innerHTML = '<input id="t-input" type="text"><textarea id="t-area"></textarea>' +
        '<select id="t-select"><option>a</option><option>b</option></select>' +
        '<div id="t-edit" contenteditable="true">edit</div>' +
        '<div data-keys="own"><div id="t-own" tabindex="0">own keys</div></div>' +
        '<input id="t-range" type="range" min="0" max="10" value="5"><button id="t-button" type="button">a button</button>';
      slide.appendChild(box);
      window.__clicks = 0;
      document.getElementById('t-button').addEventListener('click', () => { window.__clicks++; });
    });
    const keys = ['ArrowRight', 'PageDown', 'Space', 'Enter', '3', 'b', 'o', 'End', 'n'];
    for (const id of ['t-input', 't-area', 't-select', 't-edit', 't-own']) {
      await p.focus('#' + id);
      for (const k of keys) { await p.keyboard.press(k); }
      await expectAt(p, 'demo-reveals', 0, 'keys typed in #' + id + ' do not navigate');
      eq(await p.evaluate(() => [window.__deck.blackout(), window.__deck.overview(), document.querySelector('.deck-jump').hidden]), [false, false, true], 'no blackout / overview / jump from #' + id);
    }
    assert((await p.evaluate(() => document.getElementById('t-input').value)).includes('3b'), 'the input received the characters');

    // Escape hands the keyboard back from a text field
    await p.focus('#t-input');
    await p.keyboard.press('Escape');
    eq(await p.evaluate(() => document.activeElement === document.body), true, 'Escape leaves the text field');
    eq(await p.evaluate(() => window.__deck.overview()), false, 'and does not open the overview');
    await p.keyboard.press('ArrowRight');
    await expectAt(p, 'demo-reveals', 1, 'keys work again');

    // Space on a focused button presses the button; it does not also advance
    await p.focus('#t-button');
    await p.keyboard.press('Space');
    eq(await p.evaluate(() => window.__clicks), 1, 'Space activated the button');
    await expectAt(p, 'demo-reveals', 1, 'and did not advance');

    // clicker safety: after CLICKING a button or dragging a slider, PageDown still advances
    await p.click('#t-button');
    await p.waitForTimeout(30);
    await p.keyboard.press('PageDown');
    await expectAt(p, 'demo-reveals', 2, 'PageDown after clicking a button');
    await p.click('#t-range');
    await p.waitForTimeout(30);
    await p.keyboard.press('PageDown');
    await expectAt(p, 'demo-reveals', 3, 'PageDown after using a slider');
    // ...but a clicked text field keeps the keyboard
    await p.click('#t-input');
    await p.waitForTimeout(30);
    await p.keyboard.press('PageDown');
    await expectAt(p, 'demo-reveals', 3, 'a clicked text field keeps the keys');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('mouse: a click on the stage does not advance; prev/next buttons appear on mouse move', async () => {
  const t = await open({});
  try {
    const p = t.page;
    const navOpacity = () => p.evaluate(() => Number(getComputedStyle(document.querySelector('.deck-nav-next')).opacity));
    eq(await navOpacity(), 0, 'buttons are hidden while the mouse is still');
    await p.mouse.click(640, 360);
    await p.mouse.click(1200, 300);
    await expectAt(p, 'demo-reveals', 0, 'clicking the stage does not advance');
    await p.mouse.move(600, 300);
    await p.mouse.move(620, 320);
    await settle(p);
    assert((await navOpacity()) > 0.5, 'buttons faded in after mouse movement');
    const box = await p.evaluate(() => {
      const n = document.querySelector('.deck-nav-next').getBoundingClientRect();
      const b = document.querySelector('.deck-nav-prev').getBoundingClientRect();
      return { next: [n.right > innerWidth - 100, n.bottom > innerHeight - 100, n.width <= 64], prev: [b.left < 100, b.bottom > innerHeight - 100] };
    });
    eq(box, { next: [true, true, true], prev: [true, true] }, 'small buttons in the bottom corners');
    await p.click('.deck-nav-next');
    await expectAt(p, 'demo-reveals', 1, 'next button');
    await p.click('.deck-nav-prev');
    await expectAt(p, 'demo-reveals', 0, 'prev button');
    await p.keyboard.press('Space');
    await expectAt(p, 'demo-reveals', 1, 'Space still advances after using a button (focus was released)');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('touch: tap the left/right edge, or swipe', async () => {
  const t = await open({ touch: true, flags: 'fast' });
  try {
    const p = t.page;
    await p.touchscreen.tap(1280 * 0.95, 300);
    await expectAt(p, 'demo-reveals', 1, 'tap right edge');
    await p.touchscreen.tap(640, 300);
    await expectAt(p, 'demo-reveals', 1, 'tap in the middle does nothing');
    await p.touchscreen.tap(1280 * 0.05, 300);
    await expectAt(p, 'demo-reveals', 0, 'tap left edge');

    const swipe = (x0, x1, y1) => p.evaluate(([a, b, c]) => {
      const target = document.querySelector('.deck-slides');
      const touch = (x, y) => new Touch({ identifier: 1, target, clientX: x, clientY: y });
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(a, 300)], changedTouches: [touch(a, 300)] }));
      target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(b, c)] }));
    }, [x0, x1, y1]);
    await swipe(800, 500, 310);
    await expectAt(p, 'demo-reveals', 1, 'swipe left = next');
    await swipe(500, 800, 290);
    await expectAt(p, 'demo-reveals', 0, 'swipe right = back');
    await swipe(600, 640, 700);
    await expectAt(p, 'demo-reveals', 0, 'a vertical drag does nothing');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('progress bar (P), notes overlay (N), fullscreen key (F)', async () => {
  const t = await open({ flags: 'fast' });
  try {
    const p = t.page;
    const ids = await p.evaluate(() => window.__deck.ids());
    const bar = () => p.evaluate(() => {
      const root = document.querySelector('.deck-progress');
      const r = root.querySelector('.deck-progress-track').getBoundingClientRect();
      const stage = document.querySelector('.deck-stage').getBoundingClientRect();
      return {
        segments: root.querySelectorAll('.deck-progress-act').length,
        fills: Array.from(root.querySelectorAll('.deck-progress-fill')).map((f) => parseFloat(f.style.width)),
        num: root.querySelector('.deck-progress-num').textContent,
        hidden: root.classList.contains('is-hidden'),
        atBottom: Math.abs(r.bottom - stage.bottom) < 1.5,
        thin: r.height / stage.height < 0.02
      };
    });
    await goto(p, 'demo-reveals', 0);
    let b = await bar();
    assert(b.segments >= 1, 'one segment per act');
    eq(b.num, (ids.indexOf('demo-reveals') + 1) + ' / ' + ids.length, 'slide number');
    eq([b.atBottom, b.thin, b.hidden], [true, true, false], 'a thin bar at the bottom of the stage');
    const before = b.fills.reduce((x, y) => x + y, 0);
    await goto(p, 'demo-throws', 0);
    b = await bar();
    assert(b.fills.reduce((x, y) => x + y, 0) > before, 'the bar fills as the deck advances');
    eq(b.fills[b.fills.length - 1], 100, 'full on the last slide');

    await p.keyboard.press('p');
    eq((await bar()).hidden, true, 'P hides it');
    await p.keyboard.press('p');
    eq((await bar()).hidden, false, 'P shows it again');

    await goto(p, 'demo-counter', 0);
    await p.keyboard.press('n');
    let notes = await p.evaluate(() => { const n = document.querySelector('.deck-notes-overlay'); return { hidden: n.hidden, text: n.textContent }; });
    assert(!notes.hidden && notes.text.includes('deliberately long notes'), 'N shows this slide\'s notes');
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    notes = await p.evaluate(() => document.querySelector('.deck-notes-overlay').textContent);
    assert(notes.includes('T starts and pauses'), 'the overlay follows the slide');
    await p.keyboard.press('n');
    eq(await p.evaluate(() => document.querySelector('.deck-notes-overlay').hidden), true, 'N hides it');

    await p.keyboard.press('f');     // headless Chromium may refuse fullscreen; it must not throw either way
    await p.waitForTimeout(100);
    await p.keyboard.press('f');
    await p.waitForTimeout(100);
    await expectAt(p, 'demo-timer', 0, 'F does not navigate');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('Motion in the browser: manual clock, splitText, same random numbers as Node', async () => {
  const t = await open({ flags: 'fast' });
  try {
    const p = t.page;
    const NodeMotion = require(path.join(ROOT, 'deck', 'lib', 'motion.js'));
    const nodeRng = NodeMotion.rng(2026);
    const expected = [nodeRng.next(), nodeRng.next(), nodeRng.int(1, 8), nodeRng.normal(), nodeRng.shuffle([1, 2, 3, 4, 5])];
    const got = await p.evaluate(() => { const r = window.Motion.rng(2026); return [r.next(), r.next(), r.int(1, 8), r.normal(), r.shuffle([1, 2, 3, 4, 5])]; });
    eq(got, expected, 'rng(2026) gives the same numbers in the browser and in Node');

    const split = await p.evaluate(() => {
      const host = document.querySelector('.deck-slides > .slide.is-current');
      const make = (html) => { const el = document.createElement('p'); el.style.width = '700px'; el.innerHTML = html; host.appendChild(el); return el; };
      const a = make('Say <em>no</em> twice');
      const chars = window.Motion.splitText(a, 'chars');
      const b = make('Say no twice');
      const words = window.Motion.splitText(b, 'words');
      const c = make('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen');
      const lines = window.Motion.splitText(c, 'lines');
      const out = {
        chars: chars.length, charLabel: a.getAttribute('aria-label'), charText: a.textContent, emKept: !!a.querySelector('em .char'),
        charHidden: chars.every((s) => s.getAttribute('aria-hidden') === 'true'), index: chars[3].style.getPropertyValue('--i'),
        words: words.map((w) => w.textContent), wordLabel: b.getAttribute('aria-label'),
        lines: lines.length, lineLabel: c.getAttribute('aria-label').split(' ').length, lineText: c.textContent.split(/\s+/).length
      };
      chars.revert();
      out.reverted = a.innerHTML;
      out.revertedLabel = a.hasAttribute('aria-label');
      [a, b, c].forEach((el) => el.remove());
      return out;
    });
    eq([split.chars, split.charLabel, split.charText, split.emKept, split.charHidden, split.index], [10, 'Say no twice', 'Say no twice', true, true, '3'], 'splitText chars');
    eq([split.words, split.wordLabel], [['Say', 'no', 'twice'], 'Say no twice'], 'splitText words');
    assert(split.lines >= 2 && split.lineLabel === 18, 'splitText lines: ' + split.lines + ' lines');
    eq([split.reverted, split.revertedLabel], ['Say <em>no</em> twice', false], 'revert() restores the markup');

    const count = await p.evaluate(() => {
      window.Motion.useManualClock(50);
      const el = document.createElement('span');
      const seen = [];
      window.Motion.count(el, 0, 1500, { duration: 2, ease: 'linear', format: '$,d', suffix: '/yr', onUpdate: (v, text) => seen.push(text) });
      window.Motion.setTime(51);
      const mid = el.textContent;
      window.Motion.setTime(53);
      const end = el.textContent;
      window.Motion.useRealClock();
      return { mid, end, pending: window.Motion.stats().pending };
    });
    eq(count, { mid: '$750/yr', end: '$1,500/yr', pending: 0 }, 'Motion.count on the manual clock');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

/* ===================================================================== run */

(async () => {
  const args = ARGS;
  if (!fs.existsSync(DECK_FILE)) { console.error('Not found: ' + DECK_FILE); process.exit(2); }
  if (args.includes('--list')) { tests.forEach((t) => console.log(t.name)); return; }
  const filter = args.filter((a) => !a.startsWith('--')).join(' ').toLowerCase();
  const selected = tests.filter((t) => !filter || t.name.toLowerCase().includes(filter));
  if (!selected.length) { console.error('No test matches "' + filter + '". Try --list.'); process.exit(2); }

  console.log('Deck engine tests  ' + DECK_URL + '?demo\n');
  browser = await chromium.launch();
  let failed = 0;
  const startedAt = Date.now();
  for (const t of selected) {
    const t0 = Date.now();
    try {
      await t.fn();
      console.log('PASS  ' + t.name + '  (' + (Date.now() - t0) + ' ms)');
    } catch (err) {
      failed++;
      console.log('FAIL  ' + t.name);
      console.log('      ' + String(err && err.message ? err.message : err).split('\n').join('\n      '));
    }
  }
  await browser.close();
  console.log('\n' + (selected.length - failed) + ' passed, ' + failed + ' failed, ' + selected.length + ' total  (' + ((Date.now() - startedAt) / 1000).toFixed(1) + ' s)');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('The test run itself crashed:', err);
  process.exit(2);
});
