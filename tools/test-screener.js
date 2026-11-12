#!/usr/bin/env node
/*
 * tools/test-screener.js: automated test of the four-gate screener and Act 3.
 *
 *   node tools/test-screener.js            run everything (about 40 seconds)
 *   node tools/test-screener.js live       only tests whose name contains "live"
 *   node tools/test-screener.js --list     list the test names
 *
 * Opens deck/index.html and screener/index.html through file:// in headless
 * Chromium (Playwright, installed globally) and checks:
 *
 *   - the worked example (slide "worked-example") shows, beat by beat, exactly
 *     what Gates.evaluate says about each example candidate, and after a NO
 *     every later gate reads NOT YET, never PASS;
 *   - the live scorecard (slide "ex-screen") follows every control: after each
 *     click or keystroke the verdicts and figures on screen equal Gates.rank
 *     on the same inputs; unusable input never passes a gate; Reset works;
 *   - the exercise slides have their copy, their minutes and their clocks;
 *   - the standalone page has no sideways scroll at 360, 768 and 1440 px, its
 *     results match Gates, it saves locally, it works with saving blocked, and
 *     it asks the network for nothing;
 *   - the QR encoder (deck/lib/qr.js) is read back by an independent decoder
 *     from PNG screenshots, including off the real slide.
 *
 * THE ONE SOURCE OF TRUTH IS Gates. This file never recomputes a dollar
 * figure. It asks Gates in the page, with the inputs the screener says it has
 * (instance.snapshot()), and compares that with what is on screen. The only
 * rule it restates is the display rule: a candidate stops at its first NO.
 *
 * The QR round-trip needs a decoder, which is not part of this repository.
 * Install it once into the scratch folder (git-ignored):
 *     npm install --prefix out/qr-verify jsqr
 * Without it that one test prints SKIP and the run still passes.
 *
 * Prints one PASS / FAIL (or SKIP) line per test and exits 1 if anything failed.
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
const DECK_URL = pathToFileURL(path.join(ROOT, 'deck', 'index.html')).href;
const PAGE_FILE = path.join(ROOT, 'screener', 'index.html');
const PAGE_URL = pathToFileURL(PAGE_FILE).href;
const JSQR_FILE = path.join(ROOT, 'out', 'qr-verify', 'node_modules', 'jsqr', 'dist', 'jsQR.js');
const ACT3 = ['ex-inventory', 'ex-pick-three', 'worked-example', 'ex-screen', 'share-out'];

/* ------------------------------------------------------------------ harness */

let browser;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

class Skip extends Error {}

function assert(cond, message) {
  if (!cond) { throw new Error(message || 'assertion failed'); }
}
function eq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { throw new Error((message ? message + ': ' : '') + 'expected ' + e + ', got ' + a); }
}

function watch(page, problems, requests) {
  page.on('console', (msg) => { if (msg.type() === 'error') { problems.push('console.error: ' + msg.text()); } });
  page.on('pageerror', (err) => { problems.push('uncaught: ' + err.message); });
  if (requests) {
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) { requests.push(u); } });
  }
}

/** Open the deck on a slide. opts: { flags, hash, init } */
async function openDeck(opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  if (opts.init) { await context.addInitScript(opts.init); }
  const page = await context.newPage();
  const problems = [];
  watch(page, problems);
  await page.goto(DECK_URL + '?' + (opts.flags || 'fast') + (opts.hash ? '#/' + opts.hash : ''));
  await page.waitForFunction(() => window.__deck && window.__deck.count() > 0);
  await page.evaluate(() => window.__deck.settle());
  return {
    page, problems, context,
    goto: (id, step) => page.evaluate(([i, s]) => window.__deck.goto(i, s), [id, step || 0]),
    hookErrors: () => page.evaluate(() => window.__deck.errors().filter((e) => !e.expected).map((e) => (e.slide || '') + ' ' + e.where + ': ' + e.message)),
    close: () => context.close()
  };
}

/** Open the standalone page. opts: { width, height, init, touch } */
async function openPage(opts) {
  opts = opts || {};
  const context = await browser.newContext({
    viewport: { width: opts.width || 360, height: opts.height || 740 },
    hasTouch: !!opts.touch
  });
  if (opts.init) { await context.addInitScript(opts.init); }
  const page = await context.newPage();
  const problems = [];
  const requests = [];
  watch(page, problems, requests);
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => !!window.screenerApp);
  await page.evaluate(() => document.fonts.ready);
  return { page, problems, requests, context, close: () => context.close() };
}

/*
 * Runs IN THE PAGE. Compares the live scorecard on screen with Gates.rank on
 * the inputs the screener reports. `getInstance` is a function body string so
 * the same check serves the deck (the engine's scene) and the page.
 * Returns a list of mismatches (empty = the screen tells the truth).
 */
function compareLive(where) {
  const inst = where === 'page' ? window.screenerApp : window.__deck.scene('screener');
  const G = window.Gates;
  const CM = window.CostMath;
  const snap = inst.snapshot();
  const ranked = G.rank(snap.candidates, snap.assumptions);
  const byIndex = [];
  ranked.forEach((r) => { byIndex[r.inputOrder] = r; });
  const bad = [];
  const words = { pass: 'pass', no: 'no', notyet: 'not yet' };
  const clean = (s) => String(s || '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const root = document.querySelector('.scr-live');
  byIndex.forEach((r, c) => {
    let stopped = false;
    G.ORDER.forEach((id) => {
      const gate = r.gates[id];
      const want = stopped ? 'notyet' : (gate.pass ? 'pass' : 'no');   // the display rule: stop at the first NO
      if (!gate.pass) { stopped = true; }
      const cell = root.querySelector('.scr-cell[data-cand="' + c + '"][data-gate="' + id + '"]');
      const at = 'candidate ' + c + ' ' + id;
      if (!cell) { bad.push(at + ': no cell'); return; }
      if (cell.getAttribute('data-state') !== want) { bad.push(at + ': state ' + cell.getAttribute('data-state') + ', Gates says ' + want); }
      const mark = cell.querySelector('.verdict');
      if (!mark || clean(mark.textContent) !== words[want]) { bad.push(at + ': the mark reads "' + (mark && mark.textContent) + '", wanted "' + words[want] + '"'); }
      if (mark && !mark.classList.contains('is-' + want)) { bad.push(at + ': the mark has the wrong shape (' + mark.className + ')'); }
      const wantMetric = want === 'notyet' ? '' : gate.metricText;
      if (cell.getAttribute('data-metric') !== wantMetric) { bad.push(at + ': figure "' + cell.getAttribute('data-metric') + '", Gates says "' + wantMetric + '"'); }
      if (clean(cell.querySelector('.scr-metric').textContent.replace(/([a-z%])([A-Z$0-9a-z])/g, '$1 $2')) !== clean(wantMetric) &&
          clean(cell.querySelector('.scr-metric').innerHTML.replace(/<br>/g, ' ').replace(/&amp;/g, '&')) !== clean(wantMetric)) {
        bad.push(at + ': the text on screen is "' + cell.querySelector('.scr-metric').textContent + '", Gates says "' + wantMetric + '"');
      }
    });
    const box = root.querySelector('.scr-result[data-cand="' + c + '"]');
    const outcome = r.verdict === 'YES' ? (r.winner ? 'winner' : 'pass') : 'no';
    if (box.getAttribute('data-outcome') !== outcome) { bad.push('candidate ' + c + ': outcome ' + box.getAttribute('data-outcome') + ', Gates says ' + outcome); }
    if (box.getAttribute('data-two-year') !== String(r.twoYearValue)) { bad.push('candidate ' + c + ': two-year value ' + box.getAttribute('data-two-year') + ', Gates says ' + r.twoYearValue); }
    const text = box.textContent;
    if (r.verdict === 'YES' && text.indexOf(CM.money(r.twoYearValue)) === -1) { bad.push('candidate ' + c + ': "' + text + '" does not show ' + CM.money(r.twoYearValue)); }
    if (r.verdict === 'YES' && r.cashFreed > 0 && text.indexOf(CM.aboutMoney(r.cashFreed)) === -1) { bad.push('candidate ' + c + ': cash freed ' + CM.aboutMoney(r.cashFreed) + ' is not shown'); }
    if (r.verdict === 'NO' && text.indexOf('Out at ' + r.gates[r.firstNo].label) === -1) { bad.push('candidate ' + c + ': "' + text + '" does not say Out at ' + r.gates[r.firstNo].label); }
    const tag = root.querySelector('[data-tag="' + c + '"]');
    if (tag.textContent !== (snap.example[c] ? 'Example' : 'Yours')) { bad.push('candidate ' + c + ': tag "' + tag.textContent + '"'); }
  });
  const winners = byIndex.filter((r) => r.winner).length;
  if (root.querySelectorAll('.scr-result[data-outcome="winner"]').length !== winners) { bad.push('winners on screen: ' + root.querySelectorAll('.scr-result[data-outcome="winner"]').length + ', Gates says ' + winners); }
  return { bad, verdicts: byIndex.map((r) => r.verdict + (r.firstNo ? ':' + r.firstNo : '')), snap };
}

/* ====================================================================== tests */

test('Act 3 is in the deck: five slides in order, 35 minutes, notes in the house format, no errors', async () => {
  const t = await openDeck({ hash: 'ex-inventory' });
  try {
    const info = await t.page.evaluate((ids) => {
      const all = window.__deck.ids();
      return { order: ids.map((id) => all.indexOf(id)), infos: ids.map((id) => window.__deck.info(id)) };
    }, ACT3);
    assert(info.order.every((i) => i >= 0), 'every Act 3 slide is in the running order: ' + JSON.stringify(info.order));
    eq(info.order.map((i) => i - info.order[0]), [0, 1, 2, 3, 4], 'they are consecutive and in the brief\'s order');
    eq(info.infos.map((s) => s.act), [3, 3, 3, 3, 3], 'all in act 3');
    eq(info.infos.map((s) => s.minutes), [10, 5, 5, 10, 5], 'minutes per slide');
    eq(info.infos.reduce((n, s) => n + s.minutes, 0), 35, 'the act\'s budget (minutes 25 to 60)');
    info.infos.forEach((s) => {
      assert(/(^|\n)SAY: /.test(s.notes.trim()) && /\nDO: /.test(s.notes) && /\nNEXT: /.test(s.notes), s.id + ': notes have SAY, DO and NEXT');
      assert(!/NaN|undefined|null/.test(s.notes), s.id + ': notes have no hole in them');
    });
    assert(/YOUR STORY: /.test(info.infos[2].notes), 'worked-example marks where the real three go');
    for (const id of ACT3) { await t.goto(id, 0); }
    eq(await t.hookErrors(), [], 'slide and scene hooks');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('exercise slides: the copy from the brief, a clock with the right minutes, T starts it', async () => {
  const t = await openDeck({ hash: 'ex-inventory' });
  try {
    const want = {
      'ex-inventory': { kicker: 'Exercise 1 · 10 minutes', head: 'Inventory two weeks of real work.', seconds: 600,
        items: ['What did you do more than twice?', 'What did you copy from one place to another?', 'What did you wait on?', 'What did you dread?'] },
      'ex-pick-three': { kicker: 'Exercise 2 · 5 minutes', head: 'Pick three.', seconds: 300,
        items: ['One you’d love to pitch', 'One that’s boring', 'One you’d be embarrassed to bring up'] }
    };
    for (const id of Object.keys(want)) {
      await t.goto(id, 0);
      const got = await t.page.evaluate(() => {
        const s = document.querySelector('.slide.is-current');
        return {
          kicker: s.querySelector('.kicker').textContent, head: s.querySelector('.headline').textContent,
          items: Array.from(s.querySelectorAll('ol > li')).map((li) => li.textContent.trim()),
          timer: window.__deck.scene('timer').state(),
          small: Array.from(s.querySelectorAll('ol > li, .kicker, .headline')).map((n) => parseFloat(getComputedStyle(n).fontSize)).filter((px) => px < 32)
        };
      });
      eq([got.kicker, got.head, got.items], [want[id].kicker, want[id].head, want[id].items], id + ' copy');
      eq([got.timer.total, got.timer.state], [want[id].seconds, 'idle'], id + ' clock');
      eq(got.small, [], id + ': nothing under 32px');
      await t.page.keyboard.press('t');
      eq(await t.page.evaluate(() => window.__deck.scene('timer').state().state), 'running', id + ': T starts the clock');
      await t.page.keyboard.press('t');
    }
    await t.goto('share-out', 0);
    let share = await t.page.evaluate(() => {
      const s = document.querySelector('.slide.is-current');
      const second = s.querySelector('[data-step="1"]');
      return { first: s.querySelector('.say').textContent, second: second.textContent, shown: second.classList.contains('is-visible'), steps: window.__deck.current().steps, timer: window.__deck.scene('timer').state().total };
    });
    eq([share.first, share.second, share.shown, share.steps, share.timer], ['Who killed their favorite?', 'Who’s keeping the boring one?', false, 1, 300], 'share-out, first state');
    await t.page.keyboard.press('ArrowRight');
    await t.page.evaluate(() => window.__deck.settle());
    eq(await t.page.evaluate(() => document.querySelector('.slide.is-current [data-step="1"]').classList.contains('is-visible')), true, 'the second question arrives on the next step');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('walkthrough: every beat shows what Gates.evaluate says; a candidate stops at its first NO', async () => {
  const t = await openDeck({ hash: 'worked-example' });
  try {
    // What Gates says, and the script of beats that follows from it (worked out here, independently of the scene).
    const truth = await t.page.evaluate(() => {
      const G = window.Gates;
      const CM = window.CostMath;
      const cands = (window.YOUR.candidates || []).slice(0, 3);
      const ranked = G.rank(cands);
      const results = [];
      ranked.forEach((r) => { results[r.inputOrder] = r; });
      return {
        ids: cands.map((c) => c.id),
        results: results.map((r) => ({
          name: r.name, verdict: r.verdict, firstNo: r.firstNo, winner: r.winner,
          gates: G.ORDER.map((id) => ({ id, label: r.gates[id].label, pass: r.gates[id].pass, metricText: r.gates[id].metricText, reason: r.gates[id].reason })),
          weeks: G.formatWeeks(r.paybackWeeks), twoYear: CM.aboutMoney(r.twoYearValue), cash: r.cashFreed > 0 ? CM.aboutMoney(r.cashFreed) : null
        })),
        beats: window.__deck.scene('screener').beats(),
        steps: window.__deck.current().steps
      };
    });
    const expected = [{ type: 'overview' }];
    truth.results.forEach((r, c) => {
      expected.push({ type: 'intro', c });
      for (let g = 0; g < 4; g++) {
        expected.push({ type: 'gate', c, g, verdict: r.gates[g].pass ? 'pass' : 'no' });
        if (!r.gates[g].pass) { break; }
      }
      if (r.verdict === 'YES') { expected.push({ type: 'payoff', c }); }
    });
    eq(truth.beats, expected, 'the script of beats');
    eq(truth.steps, expected.length - 1, 'the slide has one step per beat');

    // The story the brief tells, as long as the examples are the ones it describes.
    if (JSON.stringify(truth.ids) === JSON.stringify(['chatbot', 'notes', 'reminders'])) {
      eq(truth.results.map((r) => r.verdict + ':' + r.firstNo), ['NO:effort', 'NO:cost', 'YES:null'], 'chatbot stops at Effort, notes at Cost, reminders pass');
      assert(/never pays back/.test(truth.results[0].gates[2].metricText), 'the chatbot never pays back: ' + truth.results[0].gates[2].metricText);
      eq([truth.results[2].weeks, truth.results[2].twoYear, truth.results[2].cash], ['about 15 weeks', '$17,500', '$109,600'], 'the survivor\'s figures');
    }

    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const landed = [[], [], []];
    for (let k = 0; k < expected.length; k++) {
      const b = expected[k];
      if (b.type === 'gate') { landed[b.c][b.g] = true; }
      await t.goto('worked-example', k);
      const seen = await t.page.evaluate(() => {
        const s = document.querySelector('.slide.is-current');
        return {
          tabs: Array.from(s.querySelectorAll('.scr-tab')).map((tab) => ({
            status: tab.getAttribute('data-status'), result: tab.querySelector('.scr-tab-result').textContent,
            marks: Array.from(tab.querySelectorAll('.gate-glyph')).map((m) => m.classList.contains('is-pass') ? 'pass' : (m.classList.contains('is-no') ? 'no' : 'notyet'))
          })),
          gates: Array.from(s.querySelectorAll('.scr-dock .gate')).map((g) => ({
            state: g.getAttribute('data-state'), pass: g.classList.contains('is-pass'), no: g.classList.contains('is-no'),
            text: g.querySelector('.gate-q').textContent, why: g.querySelector('.gate-why').textContent, still: g.classList.contains('is-still')
          })),
          cap: s.querySelector('.scr-cap').textContent,
          cut: Array.from(s.querySelectorAll('.scr-tab-name, .scr-src')).filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
          band: s.querySelector('.scr-walk').getAttribute('data-band'),
          figures: Array.from(s.querySelectorAll('.scr-fig')).map((f) => f.textContent),
          source: s.querySelector('.scr-src').textContent,
          negative: s.classList.contains('is-negative')
        };
      });
      const at = 'beat ' + k + ' (' + b.type + (b.c != null ? ' ' + b.c : '') + (b.g != null ? ' gate ' + b.g : '') + ')';
      eq(seen.negative, false, at + ': the slide is back in positive');
      eq(seen.cut, [], at + ': no name and no source line is cut off');
      assert(/^Example candidates/.test(seen.source), at + ': labelled as examples: ' + seen.source);

      // the dock shows the candidate at the gates
      const cur = b.type === 'overview' ? null : b.c;
      let stopped = false;
      seen.gates.forEach((g, i) => {
        let want = 'vacant';
        if (cur != null) {
          if (landed[cur][i]) { want = truth.results[cur].gates[i].pass ? 'pass' : 'no'; if (want === 'no') { stopped = true; } }
          else if (stopped) { want = 'notyet'; }
        }
        eq(g.state, want, at + ', gate ' + i + ' state');
        eq([g.pass, g.no], [want === 'pass', want === 'no'], at + ', gate ' + i + ' shutter');
        if (want === 'pass') { assert(clean(g.text).indexOf(clean(truth.results[cur].gates[i].metricText.split(' (')[0])) === 0, at + ', gate ' + i + ' shows Gates\' figure: "' + g.text + '"'); }
        if (want === 'no') { eq(g.why, truth.results[cur].gates[i].metricText, at + ', gate ' + i + ' prints the figure that stopped it'); }
        if (want === 'notyet') { eq(clean(g.text), 'not yet', at + ', gate ' + i + ' reads NOT YET'); }
      });
      if (stopped) { assert(seen.gates.every((g, i) => !(g.pass && i > seen.gates.findIndex((x) => x.no))), at + ': no PASS after a NO'); }

      // the reason is Gates' own sentence
      if (b.type === 'gate') {
        const gate = truth.results[b.c].gates[b.g];
        eq(seen.cap, gate.label + '. ' + gate.reason, at + ' reason');
      } else { eq(seen.cap, '', at + ': no reason on screen'); }

      // tabs: who is up, and what became of the others
      seen.tabs.forEach((tab, c) => {
        const r = truth.results[c];
        const lastGate = r.gates.findIndex((g) => !g.pass) === -1 ? 3 : r.gates.findIndex((g) => !g.pass);
        const judged = !!landed[c][lastGate];
        eq(tab.status, c === cur ? 'current' : (judged ? 'done' : 'waiting'), at + ', tab ' + c);
        eq(tab.result, !judged ? '' : (r.verdict === 'YES' ? 'Passes all four' : 'No at ' + r.gates[lastGate].label), at + ', tab ' + c + ' result');
        tab.marks.forEach((m, i) => eq(m, landed[c][i] ? (r.gates[i].pass ? 'pass' : 'no') : 'notyet', at + ', tab ' + c + ' mark ' + i));
      });

      // the survivor's figures
      eq(seen.band, b.type === 'payoff' ? '1' : '0', at + ' band');
      if (b.type === 'payoff') {
        const r = truth.results[b.c];
        const all = clean(seen.figures.join(' | '));
        assert(all.indexOf(clean(r.weeks.replace(/^about /, ''))) !== -1, at + ': payback ' + r.weeks + ' in "' + all + '"');
        assert(all.indexOf(clean(r.twoYear)) !== -1, at + ': two-year value ' + r.twoYear + ' in "' + all + '"');
        if (r.cash) { assert(all.indexOf(clean(r.cash)) !== -1, at + ': cash freed ' + r.cash + ' in "' + all + '"'); }
      }
    }
    eq(await t.hookErrors(), [], 'slide and scene hooks');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('walkthrough with motion: stepping forward lands where jumping does; a NO prints in negative and comes back; nothing leaks', async () => {
  const t = await openDeck({ hash: 'worked-example' });
  try {
    const beats = await t.page.evaluate(() => window.__deck.scene('screener').beats());
    const snapshot = () => t.page.evaluate(() => {
      const s = document.querySelector('.slide.is-current');
      return JSON.stringify({
        gates: Array.from(s.querySelectorAll('.scr-dock .gate')).map((g) => [g.className.replace(/\s+/g, ' ').trim(), g.getAttribute('data-state'), g.getAttribute('data-scar'), g.querySelector('.gate-q').innerHTML, g.querySelector('.gate-why').textContent]),
        tabs: Array.from(s.querySelectorAll('.scr-tab')).map((tab) => tab.outerHTML.replace(/font-stretch:[^;"]*;?/g, '')),
        cap: s.querySelector('.scr-cap').innerHTML, band: s.querySelector('.scr-walk').getAttribute('data-band'),
        figs: Array.from(s.querySelectorAll('.scr-fig')).map((f) => f.getAttribute('data-shown') + f.textContent),
        negative: s.classList.contains('is-negative')
      });
    });
    // every beat reached by pressing the key equals the same beat reached by a jump
    for (let k = 1; k < beats.length; k++) {
      await t.goto('worked-example', k);
      const jumped = await snapshot();
      await t.goto('worked-example', k - 1);
      await t.page.keyboard.press('ArrowRight');
      await t.page.evaluate(() => window.__deck.settle());
      eq(await snapshot(), jumped, 'beat ' + k + ' (' + beats[k].type + ') stepped into');
    }
    // a NO: the slide is in negative while it holds, then comes back
    const noBeat = beats.findIndex((b) => b.type === 'gate' && b.verdict === 'no');
    if (noBeat !== -1) {
      const hit = await t.page.evaluate(async (k) => {
        const M = window.Motion;
        const scene = window.__deck.scene('screener');
        await window.__deck.goto('worked-example', k - 1);
        M.timeScale = 1;
        M.useManualClock(1000);
        window.Deck.next();
        const T = scene.timing;
        const slide = document.querySelector('.slide.is-current');
        const gate = slide.querySelector('.scr-dock .gate.is-no');
        const at = (s) => { M.setTime(1000 + s); return { negative: slide.classList.contains('is-negative'), cap: slide.querySelector('.scr-cap').textContent, moving: gate ? !gate.classList.contains('is-still') : null }; };
        const before = at(T.holdBefore * 0.5);
        const during = at(T.holdBefore + T.drop + T.hold * 0.5);
        const after = at(T.holdBefore + T.drop + T.hold + 0.2);
        M.useRealClock();
        M.timeScale = 20;
        return { before, during, after, isNo: !!gate };
      }, noBeat);
      eq([hit.isNo, hit.before.negative, hit.before.cap], [true, false, ''], 'before the drop: the bay is held, nothing else has changed');
      eq([hit.during.negative, hit.during.cap], [true, ''], 'during the hold: negative, and the reason has not cut in yet');
      assert(hit.after.negative === false && hit.after.cap.length > 10, 'after the hold: positive again, with the reason: ' + JSON.stringify(hit.after));
    }
    // stepping away in the middle of a move leaves nothing behind
    await t.goto('worked-example', Math.max(0, noBeat - 1));
    await t.page.keyboard.press('ArrowRight');
    await t.page.keyboard.press('ArrowRight');
    await t.page.keyboard.press('ArrowLeft');
    await t.goto('share-out', 0);
    await t.page.waitForTimeout(200);
    const left = await t.page.evaluate(() => ({ stats: window.Motion.stats(), negative: !!document.querySelector('.slide.is-negative') }));
    eq([left.stats.loops, left.stats.pending, left.negative], [0, 0, false], 'no loops, no tweens, no negative left after leaving');
    eq(await t.hookErrors(), [], 'slide and scene hooks');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('ex-screen: the four prompts and the clock, then the screener on the next step with the clock still running', async () => {
  const t = await openDeck({ hash: 'ex-screen' });
  try {
    const first = await t.page.evaluate(() => {
      const s = document.querySelector('.slide.is-current');
      const vis = (n) => !!n && getComputedStyle(n).visibility !== 'hidden' && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
      return {
        kicker: s.querySelector('.kicker').textContent, head: s.querySelector('.headline').textContent,
        prompts: Array.from(s.querySelectorAll('.yt-gates > li')).map((li) => [li.querySelector('.yt-gate').textContent, li.querySelector('.yt-ask').textContent]),
        want: window.Gates.GATES.map((g) => [g.label, g.question]),
        qr: vis(s.querySelector('.yt-qr')), live: vis(s.querySelector('.scr-live')), promptsShown: vis(s.querySelector('.yt-gates')),
        timer: window.__deck.scene('timer').state(), steps: window.__deck.current().steps
      };
    });
    eq([first.kicker, first.head], ['Exercise 3 · 10 minutes', 'Run your three through the gates.'], 'copy');
    eq(first.prompts, first.want, 'one prompt per gate, in Gates\' own words');
    eq([first.qr, first.live, first.promptsShown, first.timer.total, first.steps], [false, false, true, 600, 1], 'first state: prompts and a ten minute clock, no QR without a link');
    await t.page.keyboard.press('t');
    await t.page.keyboard.press('ArrowRight');
    await t.page.evaluate(() => window.__deck.settle());
    const second = await t.page.evaluate(() => {
      const s = document.querySelector('.slide.is-current');
      const vis = (n) => !!n && getComputedStyle(n).visibility !== 'hidden' && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
      const box = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
      const controls = Array.from(s.querySelectorAll('.scr-live button, .scr-live input')).filter(vis);
      return {
        live: vis(s.querySelector('.scr-live')), promptsShown: vis(s.querySelector('.yt-gates')), timer: window.__deck.scene('timer').state().state,
        timerShown: vis(s.querySelector('.timer-digits')),
        short: controls.filter((n) => (n.tagName === 'INPUT' ? n.parentNode.offsetHeight : n.offsetHeight) < 64).map((n) => n.outerHTML.slice(0, 80)),
        notOwn: Array.from(s.querySelectorAll('.scr-live input')).filter((n) => n.getAttribute('data-keys') !== 'own').length,
        cut: Array.from(s.querySelectorAll('.scr-live .scr-name')).filter((n) => n.scrollWidth > n.clientWidth).map((n) => n.value),
        fields: s.querySelectorAll('.scr-live input').length,
        // nothing in the scorecard is off the stage or under the spine
        out: Array.from(s.querySelectorAll('.scr-live .scr-board > *, .scr-live .scr-editor, .scr-live .scr-assume, .scr-live .scr-tools')).filter(vis).map(box)
          .filter((b) => b[0] < 88 || b[1] < 0 || b[2] > 1920 || b[3] > 1080),
        small: Array.from(s.querySelectorAll('.scr-live *')).filter((n) => vis(n) && n.children.length === 0 && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 28).map((n) => n.outerHTML.slice(0, 80))
      };
    });
    eq([second.live, second.promptsShown, second.timer, second.timerShown], [true, false, 'running', true], 'second state: the screener is up and the clock is still running');
    eq(second.short, [], 'every control is at least 64px tall');
    assert(second.fields >= 10 && second.notOwn === 0, 'every text field carries data-keys="own": ' + second.notOwn + ' of ' + second.fields + ' do not');
    eq(second.out, [], 'the scorecard is on the stage');
    eq(second.cut, [], 'no candidate name is cut off (long names are set narrower, not clipped)');
    eq(second.small, [], 'nothing under 28px');
    eq(await t.hookErrors(), [], 'slide and scene hooks');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('live scorecard: after every control the screen equals Gates.rank on the same inputs; NOT YET after a NO; Reset restores the examples', async () => {
  const t = await openDeck({ hash: 'ex-screen/1' });
  try {
    const page = t.page;
    const check = async (label, expectChange) => {
      const r = await page.evaluate(compareLive, 'deck');
      eq(r.bad, [], 'after ' + label);
      if (expectChange) { expectChange(r); }
      return r;
    };
    const field = (key) => '.scr-editor [data-ctl="' + key + '"]';
    const type = async (key, text) => { await page.fill(field(key) + ' input', text); };
    const press = async (key, dir, times) => { for (let i = 0; i < (times || 1); i++) { await page.click(field(key) + ' button[data-dir="' + dir + '"]'); } };
    const value = (c, key) => page.evaluate(([cc, k]) => window.__deck.scene('screener').snapshot().candidates[cc][k], [c, key]);

    const start = await check('opening');
    eq(start.snap.example, [true, true, true], 'it opens on the three examples');
    eq(start.snap.candidates.map((c) => c.id), await page.evaluate(() => window.YOUR.candidates.slice(0, 3).map((c) => c.id)), 'the examples are window.YOUR.candidates');
    const startStep = await page.evaluate(() => window.__deck.current());

    // --- candidate A, one control at a time -------------------------------------------------
    await page.click('.scr-pick[data-pick="0"]');
    await page.fill('.scr-name[data-cand="0"]', 'Quote follow-ups');
    eq(await value(0, 'name'), 'Quote follow-ups', 'the name box');
    await check('typing a name', (r) => eq(r.snap.example, [false, true, true], 'the edited column is no longer an example'));

    await press('minutesPerRun', 1, 2);
    eq(Number(await value(0, 'minutesPerRun')), start.snap.candidates[0].minutesPerRun + 2, 'plus on minutes');
    await check('minutes +2');
    await type('runsPerWeek', '200');
    eq(await value(0, 'runsPerWeek'), '200', 'typing times a week');
    await check('times a week = 200');

    const tiers = await page.evaluate(() => window.CostMath.tierIds());
    await press('tier', -1, tiers.length);
    eq(await value(0, 'tier'), tiers[0], 'cheaper, all the way down');
    await check('tool = ' + tiers[0]);
    await press('tier', 1, tiers.length);
    eq(await value(0, 'tier'), tiers[tiers.length - 1], 'dearer, all the way up');
    await check('tool = ' + tiers[tiers.length - 1]);

    await type('toolsPerMonth', '$1,000');
    await check('tools typed as $1,000', (r) => eq(Number(r.snap.candidates[0].toolsPerMonth.replace(/[$,]/g, '')), 1000));
    await press('toolsPerMonth', -1, 3);
    await check('tools minus three');
    await type('toolsPerMonth', '0');
    await check('tools = 0');

    await type('buildHours', '40');
    eq([await value(0, 'buildHours'), await value(0, 'rolloutHours')], ['40', 0], 'the one box holds build and rollout together');
    await check('build and rollout = 40');
    await type('upkeepHoursPerMonth', '2');
    await check('upkeep = 2', (r) => assert(r.verdicts[0] !== start.verdicts[0], 'A no longer stops where it did: ' + r.verdicts[0]));

    await page.click(field('ownerNamed') + ' button[data-value="true"]');
    eq(await value(0, 'ownerNamed'), true, 'owner named');
    await check('owner = yes', (r) => eq(r.verdicts[0], 'YES', 'A now passes all four'));

    await type('growth', '0.8');
    await check('growth = 0.8', (r) => eq(r.verdicts[0], 'NO:potential', 'shrinking fails Potential'));
    await press('growth', 1, 4);
    await check('growth back up', (r) => eq(r.verdicts[0], 'YES'));

    await page.click(field('touchesCashPath') + ' button[data-value="true"]');
    await press('daysOffCashCycle', 1, 3);
    eq(Number(await value(0, 'daysOffCashCycle')), start.snap.candidates[0].daysOffCashCycle + 3, 'days off the cash cycle');
    await check('on the cash path, three days');

    // the service lens brings its two inputs
    await page.click(field('lens') + ' button[data-value="service"]');
    eq(await page.evaluate(() => ['capacityConversion', 'billableMarginPerHour', 'daysOffCashCycle'].map((k) => !document.querySelector('.scr-editor [data-ctl="' + k + '"]').hidden)), [true, true, false], 'service shows its inputs and hides the cash days');
    await type('capacityConversion', '50');
    await type('billableMarginPerHour', '200');
    await check('service lens, half the time sold at $200', (r) => eq(r.snap.candidates[0].capacityConversion, '50%', 'a share box hands Gates a percentage'));
    await page.click(field('lens') + ' button[data-value="product"]');
    await check('product lens again');

    // an entry Gates cannot use never passes a gate, and says so
    await type('toolsPerMonth', '240/mo');
    const blocked = await check('an unusable entry');
    const warn = await page.evaluate(() => ({
      invalid: document.querySelector('.scr-editor [data-ctl="toolsPerMonth"]').getAttribute('aria-invalid'),
      line: document.querySelector('.scr-assume').textContent,
      cost: document.querySelector('.scr-cell[data-cand="0"][data-gate="cost"]').getAttribute('data-state')
    }));
    eq([warn.invalid, warn.cost, /^Check A: /.test(warn.line)], ['true', 'no', true], 'the box is marked, Cost says NO, and the line says what to fix: ' + warn.line);
    eq(blocked.verdicts[0], 'NO:cost');
    await type('toolsPerMonth', '20');
    await check('the entry is fixed');

    // --- the other two columns ----------------------------------------------------------------
    await page.click('.scr-pick[data-pick="1"]');
    eq(await page.evaluate(() => window.__deck.scene('screener').snapshot().selected), 1, 'B is in the editor');
    await type('toolsPerMonth', '10');
    await check('B: tools = 10', (r) => assert(r.verdicts[1] !== start.verdicts[1], 'B no longer stops at Cost: ' + r.verdicts[1]));
    await page.click('.scr-pick[data-pick="2"]');
    await type('upkeepHoursPerMonth', '40');
    await check('C: upkeep = 40', (r) => assert(r.verdicts[2].indexOf('NO') === 0, 'C is out: ' + r.verdicts[2]));

    // --- the house rules -----------------------------------------------------------------------
    await page.click('[data-act="rules"]');
    eq(await page.evaluate(() => [document.querySelector('.scr-rules').hidden, document.querySelector('[data-act="rules"]').getAttribute('aria-expanded')]), [false, 'true'], 'the drawer opens');
    const rule = (p) => '.scr-rules [data-ctl="' + p + '"]';
    for (const [p, text] of [['houseRules.costMaxShareOfReturn', '60'], ['houseRules.minReturnPerYear', '20,000'], ['houseRules.maxPaybackWeeks', '4'], ['houseRules.minGrowth', '2'],
      ['rates.loadedHourly', '60'], ['rates.builderHourly', '150'], ['rates.workWeeks', '48'], ['company.annualRevenue', '5,000,000']]) {
      await page.fill(rule(p) + ' input', text);
      const r = await check('rule ' + p + ' = ' + text);
      const [group, key] = p.split('.');
      assert(String(r.snap.assumptions[group][key]).replace(/[%,]/g, '') === text.replace(/,/g, ''), p + ' reached the assumptions: ' + r.snap.assumptions[group][key]);
    }
    await page.click(rule('houseRules.maxPaybackWeeks') + ' button[data-dir="1"]');
    await check('payback limit plus one', (r) => eq(Number(r.snap.assumptions.houseRules.maxPaybackWeeks), 5));
    await page.click('[data-act="rules"]');
    eq(await page.evaluate(() => document.querySelector('.scr-rules').hidden), true, 'the drawer closes');

    // typing in a box must not drive the deck
    await page.click('.scr-pick[data-pick="0"]');
    await page.click('.scr-name[data-cand="0"]');
    await page.keyboard.type(' and more', { delay: 5 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('PageDown');
    eq(await page.evaluate(() => window.__deck.current()), startStep, 'keys typed in a box stay in the box');
    await check('typing with spaces');
    await page.keyboard.press('Escape');

    // leaving the slide and coming back keeps the volunteer's numbers
    const before = await page.evaluate(() => JSON.stringify(window.__deck.scene('screener').snapshot().candidates));
    await t.goto('share-out', 0);
    await t.goto('ex-screen', 1);
    eq(await page.evaluate(() => JSON.stringify(window.__deck.scene('screener').snapshot().candidates)), before, 'the entries survive leaving the slide');
    await check('coming back to the slide');

    // --- reset ---------------------------------------------------------------------------------
    await page.click('[data-act="reset"]');
    const reset = await check('Reset');
    eq(JSON.stringify(reset.snap.candidates), JSON.stringify(start.snap.candidates), 'Reset restores the three examples');
    eq(JSON.stringify(reset.snap.assumptions), JSON.stringify(start.snap.assumptions), 'Reset restores the house rules and rates');
    eq([reset.snap.example, reset.verdicts], [[true, true, true], start.verdicts], 'and the verdicts are the opening ones');
    eq(await t.hookErrors(), [], 'slide and scene hooks');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('standalone page: no sideways scroll at 360, 768 and 1440; results match Gates; controls work; nothing on the network', async () => {
  assert(fs.existsSync(PAGE_FILE), 'screener/index.html exists');
  const html = fs.readFileSync(PAGE_FILE, 'utf8');
  assert(!/<script[^>]+type=["']module/i.test(html) && !/\bfetch\s*\(|XMLHttpRequest/.test(html), 'no modules, no fetch');
  assert(!/(src|href)=["']https?:/i.test(html), 'no external URLs');
  assert(/href="\.\.\/deck\/theme\/tokens\.css"/.test(html) && /src="\.\.\/deck\/lib\/gates-core\.js"/.test(html) && /src="\.\.\/deck\/scenes\/screener\.js"/.test(html), 'it loads the deck\'s own theme, math and component by relative path');
  for (const [width, height] of [[360, 740], [768, 1024], [1440, 900]]) {
    const t = await openPage({ width, height, touch: width < 700 });
    try {
      const page = t.page;
      const at = width + 'px';
      const size = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
      let s = await size();
      assert(s.sw <= s.cw && s.bw <= s.cw, at + ': no sideways scroll (' + JSON.stringify(s) + ')');
      const wide = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && n.getBoundingClientRect().right > window.innerWidth + 0.5 && getComputedStyle(n).position !== 'absolute').map((n) => n.className || n.tagName).slice(0, 5));
      eq(wide, [], at + ': nothing sticks out past the right edge');

      let r = await page.evaluate(compareLive, 'page');
      eq(r.bad, [], at + ': opening state');
      eq(r.snap.example, [true, true, true], at + ': it opens on the examples');
      const words = await page.evaluate(() => ({
        gates: Array.from(document.querySelectorAll('#pg-gates li')).map((li) => [li.querySelector('h3').textContent, li.querySelector('.pg-q').textContent, li.querySelector('.pg-rule').textContent]),
        want: window.Gates.GATES.map((g) => { const res = window.screenerApp.results()[0]; return [g.label, g.question, res.gates[g.id].rule]; }),
        thumb: document.getElementById('pg-thumb-h').textContent, rule: window.CostMath.money(window.Gates.minuteRule()),
        saved: document.getElementById('pg-saved').textContent
      }));
      eq(words.gates, words.want, at + ': the four gates are explained in Gates\' own words');
      assert(words.thumb.indexOf(words.rule) !== -1, at + ': the minute rule shows ' + words.rule + ': ' + words.thumb);
      assert(/saved in this browser/.test(words.saved), at + ': says where things are kept');

      // work it like a person: pick B, rename it, change numbers, change a rate
      await page.click('.scr-pick[data-pick="1"]');
      const nameBox = width < 760 ? '.scr-ctl-name input' : '.scr-name[data-cand="1"]';
      await page.fill(nameBox, 'Quote follow-ups');
      await page.click('.scr-editor [data-ctl="toolsPerMonth"] button[data-dir="-1"]');
      await page.fill('.scr-editor [data-ctl="minutesPerRun"] input', '12');
      await page.click('.scr-editor [data-ctl="ownerNamed"] button[data-value="true"]');
      r = await page.evaluate(compareLive, 'page');
      eq(r.bad, [], at + ': after editing B');
      eq([r.snap.candidates[1].name, r.snap.example], ['Quote follow-ups', [true, false, true]], at + ': the edits landed on B');
      await page.click('[data-act="rules"]');
      await page.fill('.scr-rules [data-ctl="rates.loadedHourly"] input', '60');
      r = await page.evaluate(compareLive, 'page');
      eq(r.bad, [], at + ': after changing the hourly rate');
      const thumb = await page.evaluate(() => [document.getElementById('pg-thumb-h').textContent, window.CostMath.money(window.Gates.minuteRule(60))]);
      assert(thumb[0].indexOf(thumb[1]) !== -1, at + ': the rule of thumb follows the rate: ' + thumb[0]);
      s = await size();
      assert(s.sw <= s.cw, at + ': still no sideways scroll with the rules open (' + JSON.stringify(s) + ')');
      const tiny = await page.evaluate(() => Array.from(document.querySelectorAll('.scr-live button')).filter((b) => b.getClientRects().length && Math.min(b.offsetWidth, b.offsetHeight) < 40).map((b) => b.outerHTML.slice(0, 70)));
      eq(tiny, [], at + ': every button is big enough for a thumb');

      // it remembers across a reload, and Reset forgets
      await page.reload();
      await page.waitForFunction(() => !!window.screenerApp);
      r = await page.evaluate(compareLive, 'page');
      eq(r.bad, [], at + ': after a reload');
      eq([r.snap.candidates[1].name, r.snap.example, String(r.snap.assumptions.rates.loadedHourly)], ['Quote follow-ups', [true, false, true], '60'], at + ': the entries were saved on the device');
      await page.click('[data-act="reset"]');
      r = await page.evaluate(compareLive, 'page');
      eq(r.bad, [], at + ': after Reset');
      eq([r.snap.example, r.snap.assumptions.rates.loadedHourly], [[true, true, true], await page.evaluate(() => window.Gates.defaultAssumptions().rates.loadedHourly)], at + ': Reset puts the examples and the rates back');
      await page.reload();
      await page.waitForFunction(() => !!window.screenerApp);
      eq((await page.evaluate(compareLive, 'page')).snap.example, [true, true, true], at + ': and nothing comes back after another reload');

      eq(t.requests, [], at + ': no network requests');
      eq(t.problems, [], at + ': console errors');
    } finally { await t.close(); }
  }
});

test('standalone page: works the same when the browser will not let it save', async () => {
  const t = await openPage({
    width: 360,
    init: () => {
      const refuse = () => { throw new Error('storage is blocked'); };
      Object.defineProperty(window, 'localStorage', { configurable: true, get: refuse });
    }
  });
  try {
    const page = t.page;
    let r = await page.evaluate(compareLive, 'page');
    eq(r.bad, [], 'opening state');
    await page.click('.scr-pick[data-pick="2"]');
    await page.click('.scr-editor [data-ctl="upkeepHoursPerMonth"] button[data-dir="1"]');
    await page.fill('.scr-ctl-name input', 'No storage here');
    r = await page.evaluate(compareLive, 'page');
    eq(r.bad, [], 'after editing');
    eq(r.snap.candidates[2].name, 'No storage here');
    assert(/not letting the page save/.test(await page.evaluate(() => document.getElementById('pg-saved').textContent)), 'the page says it cannot save');
    await page.click('[data-act="reset"]');
    eq((await page.evaluate(compareLive, 'page')).snap.example, [true, true, true], 'Reset still works');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); }
});

test('QR: codes for addresses of six lengths are read back from PNG screenshots, and off the real slide', async () => {
  if (!fs.existsSync(JSQR_FILE)) {
    throw new Skip('no decoder here. Install it once:  npm install --prefix out/qr-verify jsqr');
  }
  const pad = (n) => {
    let s = 'https://example.org/s/';
    const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~/?=&%#';
    for (let i = 0; s.length < n; i++) { s += abc[(i * 7 + n) % abc.length]; }
    return s.slice(0, n);
  };
  const urls = ['https://a.co', 'https://example.org/screener', 'https://example.org/noai-2026/four-gate-screener/', pad(72), pad(100), pad(160)];

  // a blank page that can decode: it gets the decoder, and PNG bytes to read
  const decoderContext = await browser.newContext();
  const decoder = await decoderContext.newPage();
  await decoder.setContent('<canvas id="c"></canvas>');
  await decoder.addScriptTag({ path: JSQR_FILE });
  const decode = (png) => decoder.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const c = document.getElementById('c');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const out = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    return out ? out.data : null;
  }, png.toString('base64'));

  const t = await openDeck({ hash: 'ex-screen' });
  try {
    // 1. the encoder on its own: SVG and canvas, in black on white and in the deck's inks, several sizes
    const versions = [];
    for (const url of urls) {
      for (const look of [{ px: 420, dark: '#000000', light: '#ffffff', how: 'svg' }, { px: 300, dark: '#050505', light: '#F4EDDE', how: 'svg' }, { px: 0, dark: '#050505', light: '#F4EDDE', how: 'canvas' }]) {
        const info = await t.page.evaluate(([u, l]) => {
          let box = document.getElementById('qr-test');
          if (!box) { box = document.createElement('div'); box.id = 'qr-test'; box.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;padding:0'; document.body.appendChild(box); }
          const code = window.QR.encode(u);
          if (l.how === 'svg') { box.innerHTML = window.QR.toSVG(code, { dark: l.dark, light: l.light }); box.firstChild.style.cssText = 'display:block;width:' + l.px + 'px;height:' + l.px + 'px'; }
          else { box.innerHTML = '<canvas></canvas>'; window.QR.drawCanvas(box.firstChild, code, { scale: 4, dark: l.dark, light: l.light }); box.firstChild.style.display = 'block'; }
          return { version: code.version, size: code.size, level: code.ecLevel };
        }, [url, look]);
        versions.push(info.version);
        eq(info.level, 'M', 'error correction level');
        const png = await t.page.locator('#qr-test').screenshot();
        eq(await decode(png), url, url.length + ' characters, version ' + info.version + ', ' + look.how + ' ' + look.dark);
      }
    }
    assert(Math.max(...versions) >= 6 && Math.min(...versions) === 1, 'small and large versions were covered: ' + versions.join(','));
    eq(await t.page.evaluate(() => { try { window.QR.encode(''); return 'encoded'; } catch (e) { return 'threw'; } }), 'threw', 'an empty address is refused, not drawn');
    await t.page.evaluate(() => document.getElementById('qr-test').remove());

    // 2. off the real slide: set the link, enter the slide, photograph the whole stage, read the code
    for (const url of [urls[2], pad(100)]) {
      await t.goto('share-out', 0);
      await t.page.evaluate((u) => { window.YOUR.links.screenerUrl = u; }, url);
      await t.goto('ex-screen', 0);
      const seen = await t.page.evaluate(() => {
        const s = document.querySelector('.slide.is-current');
        const qr = s.querySelector('.yt-qr');
        const r = qr.querySelector('.qr-code').getBoundingClientRect();
        return { hidden: qr.hidden, size: Math.round(r.width), text: s.querySelector('.yt-qr-url').textContent, bottom: Math.round(qr.getBoundingClientRect().bottom), timer: !!s.querySelector('.timer-digits') };
      });
      eq(seen.hidden, false, 'the QR code is shown once the link is filled in');
      assert(seen.size >= 300 && seen.bottom <= 1080 && seen.timer, 'it is large, on the stage, and the clock is still there: ' + JSON.stringify(seen));
      eq(seen.text, url.replace(/^https?:\/\//, ''), 'the address is printed beside it for people who cannot scan');
      eq(await decode(await t.page.screenshot()), url, 'read back from a screenshot of the slide (' + url.length + ' characters)');
    }
    eq(await t.hookErrors(), [], 'slide and scene hooks');
    eq(t.problems, [], 'console errors');
  } finally { await t.close(); await decoderContext.close(); }
});

/* ===================================================================== run */

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--list')) { tests.forEach((t) => console.log(t.name)); return; }
  const filter = args.filter((a) => !a.startsWith('--')).join(' ').toLowerCase();
  const selected = tests.filter((t) => !filter || t.name.toLowerCase().includes(filter));
  if (!selected.length) { console.error('No test matches "' + filter + '". Try --list.'); process.exit(2); }

  console.log('Screener and Act 3 tests  ' + DECK_URL + '\n');
  browser = await chromium.launch();
  let failed = 0;
  let skipped = 0;
  const startedAt = Date.now();
  for (const t of selected) {
    const t0 = Date.now();
    try {
      await t.fn();
      console.log('PASS  ' + t.name + '  (' + (Date.now() - t0) + ' ms)');
    } catch (err) {
      if (err instanceof Skip) {
        skipped++;
        console.log('SKIP  ' + t.name);
        console.log('      ' + err.message);
        continue;
      }
      failed++;
      console.log('FAIL  ' + t.name);
      console.log('      ' + String(err && err.message ? err.message : err).split('\n').join('\n      '));
    }
  }
  await browser.close();
  console.log('\n' + (selected.length - failed - skipped) + ' passed, ' + failed + ' failed, ' + skipped + ' skipped, ' + selected.length + ' total  (' + ((Date.now() - startedAt) / 1000).toFixed(1) + ' s)');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('The test run itself crashed:', err);
  process.exit(2);
});
