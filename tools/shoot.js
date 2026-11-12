#!/usr/bin/env node
/*
 * tools/shoot.js: screenshot the deck, slide by slide.
 *
 *   node tools/shoot.js [options]
 *
 *   --only id,id      only these slide ids
 *   --act n           only slides of act n (0-5)
 *   --steps final     one shot per slide, at its last step (default)
 *   --steps all       one shot per step, starting at step 0
 *   --out dir         where to write (default: out/shots)
 *   --contact         also write contact sheets: labelled thumbnails, 12 per sheet
 *   --demo            force the engine demo slides on (adds ?demo)
 *   --entry file      shoot another build, e.g. --entry dist/deck.html
 *
 * Opens the deck through file:// with ?fast, in headless Chromium at
 * 1920x1080. Files are named NN-id-sK.png (NN = slide number, K = step).
 * Prints one line per file.
 *
 * Exit code 1 when any slide logged a console error, threw an uncaught
 * error, or had a slide/scene hook fail (the engine catches those quietly;
 * this tool asks it for the list). The problems are printed per slide.
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

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { only: null, act: null, steps: 'final', out: path.join(ROOT, 'out', 'shots'), contact: false, demo: false, entry: path.join(ROOT, 'deck', 'index.html') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) { fail('Missing value after ' + a); }
      return argv[++i];
    };
    if (a === '--only') { opts.only = value().split(',').map((s) => s.trim()).filter(Boolean); }
    else if (a === '--act') { opts.act = Number(value()); }
    else if (a === '--steps') { opts.steps = value(); }
    else if (a === '--out') { opts.out = path.resolve(value()); }
    else if (a === '--entry') { opts.entry = path.resolve(value()); }
    else if (a === '--contact') { opts.contact = true; }
    else if (a === '--demo') { opts.demo = true; }
    else if (a === '--help' || a === '-h') { usage(0); }
    else { fail('Unknown option: ' + a); }
  }
  if (opts.steps !== 'final' && opts.steps !== 'all') { fail('--steps must be "final" or "all"'); }
  if (opts.act !== null && !(opts.act >= 0)) { fail('--act needs a number'); }
  return opts;
}

function usage(code) {
  console.log('Usage: node tools/shoot.js [--only id,id] [--act n] [--steps final|all] [--out dir] [--contact] [--demo] [--entry file]');
  process.exit(code);
}

function fail(message) {
  console.error(message);
  usage(2);
}

/* ------------------------------------------------------------ contact sheets */

const SHEET_COLUMNS = 4;
const SHEET_ROWS = 3;
const SHEET_WIDTH = 2400;

/** One sheet = up to 12 screenshots in a 4 x 3 grid, each with its file name underneath. */
async function writeContactSheets(browser, shots, outDir) {
  const perSheet = SHEET_COLUMNS * SHEET_ROWS;
  const written = [];
  // a short viewport: the full-page screenshot then ends where the grid ends
  const page = await browser.newPage({ viewport: { width: SHEET_WIDTH, height: 200 }, deviceScaleFactor: 1 });
  for (let n = 0; n * perSheet < shots.length; n++) {
    const group = shots.slice(n * perSheet, (n + 1) * perSheet);
    const cells = group.map((shot) => {
      const data = fs.readFileSync(shot.file).toString('base64');
      return '<figure><img src="data:image/png;base64,' + data + '"><figcaption>' + shot.label + '</figcaption></figure>';
    }).join('');
    const html = '<!doctype html><meta charset="utf-8"><style>' +
      'body{margin:0;padding:16px;background:#2a2d33;font:600 22px/1.2 ui-monospace,Menlo,Consolas,monospace;color:#fff}' +
      '.grid{display:grid;grid-template-columns:repeat(' + SHEET_COLUMNS + ',1fr);gap:16px}' +
      'figure{margin:0}img{display:block;width:100%;outline:1px solid #555}' +
      'figcaption{padding:8px 2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '</style><div class="grid">' + cells + '</div>';
    await page.setContent(html, { waitUntil: 'load' });
    const file = path.join(outDir, 'contact-' + String(n + 1).padStart(2, '0') + '.png');
    await page.screenshot({ path: file, fullPage: true });
    written.push(file);
  }
  await page.close();
  return written;
}

/* ----------------------------------------------------------------------- main */

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.entry)) { console.error('Not found: ' + opts.entry); process.exit(2); }
  const { chromium } = requirePlaywright();

  const url = pathToFileURL(opts.entry).href + '?fast' + (opts.demo ? '&demo' : '');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  // Everything that goes wrong is filed under the slide that was on screen at the time.
  const problems = [];             // { slide, text }
  let currentSlide = '(loading)';
  page.on('console', (msg) => { if (msg.type() === 'error') { problems.push({ slide: currentSlide, text: 'console.error: ' + msg.text() }); } });
  page.on('pageerror', (err) => { problems.push({ slide: currentSlide, text: 'uncaught: ' + err.message }); });

  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__deck && window.__deck.count() > 0 && window.__deck.current().index >= 0, null, { timeout: 15000 });
  } catch (e) {
    console.error('The deck did not start (no slides, or window.__deck is missing): ' + url);
    problems.forEach((p) => console.error('  ' + p.text));
    await browser.close();
    process.exit(1);
  }

  const slides = await page.evaluate(() => window.__deck.ids().map((id, i) => {
    const info = window.__deck.info(i);
    return { index: i, id: id, act: info.act, steps: info.steps };
  }));

  // --only / --act
  if (opts.only) {
    const unknown = opts.only.filter((id) => !slides.some((s) => s.id === id));
    if (unknown.length) {
      console.error('Unknown slide id' + (unknown.length > 1 ? 's' : '') + ': ' + unknown.join(', '));
      console.error('Known ids: ' + slides.map((s) => s.id).join(', '));
      await browser.close();
      process.exit(2);
    }
  }
  const wanted = slides.filter((s) => (!opts.only || opts.only.includes(s.id)) && (opts.act === null || s.act === opts.act));
  if (!wanted.length) {
    console.error('No slides match.');
    await browser.close();
    process.exit(2);
  }

  fs.mkdirSync(opts.out, { recursive: true });
  // A full run replaces the folder's earlier shots, so renamed slides do not leave strays behind.
  if (!opts.only && opts.act === null) {
    for (const name of fs.readdirSync(opts.out)) {
      if (/^\d{2,3}-.+-s\d+\.png$/.test(name) || /^contact-\d+\.png$/.test(name)) { fs.unlinkSync(path.join(opts.out, name)); }
    }
  }

  const digits = Math.max(2, String(slides.length).length);
  const shots = [];
  let engineErrorsSeen = 0;        // start at 0: problems recorded while the deck loaded count too
  const wantedIds = new Set(wanted.map((s) => s.id));
  // paths are printed relative to where you ran the command, unless that would climb out of it
  const relative = (file) => {
    const rel = path.relative(process.cwd(), file);
    return rel && !rel.startsWith('..') ? rel : file;
  };

  for (const slide of wanted) {
    currentSlide = slide.id;
    const steps = opts.steps === 'all' ? Array.from({ length: slide.steps + 1 }, (_, k) => k) : [slide.steps];
    for (const step of steps) {
      const settled = await page.evaluate(([i, s]) => window.__deck.goto(i, s), [slide.index, step]);
      // two more frames, so canvases have painted what they were just told
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const label = String(slide.index + 1).padStart(digits, '0') + '-' + slide.id + '-s' + step;
      const file = path.join(opts.out, label + '.png');
      await page.screenshot({ path: file });
      shots.push({ file, label });
      console.log(relative(file) + (settled ? '' : '   (still animating after 5 s)'));
    }
    // hooks the engine caught quietly while this slide was up
    const caught = await page.evaluate(() => window.__deck.errors());
    for (const e of caught.slice(engineErrorsSeen)) {
      if (e.expected) { continue; }                           // the demo slide that throws on purpose
      if (e.slide && !wantedIds.has(e.slide)) { continue; }   // a slide this run was not asked about
      problems.push({ slide: e.slide || '(deck)', text: e.where + ': ' + e.message });
    }
    engineErrorsSeen = caught.length;
  }
  currentSlide = '(after the last slide)';

  if (opts.contact) {
    const sheets = await writeContactSheets(browser, shots, opts.out);
    sheets.forEach((file) => console.log(relative(file)));
  }

  await browser.close();

  console.log('\n' + shots.length + ' screenshot' + (shots.length === 1 ? '' : 's') + ' of ' + wanted.length + ' slide' + (wanted.length === 1 ? '' : 's') + ' in ' + relative(opts.out));
  if (problems.length) {
    console.error('\n' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ':');
    for (const p of problems) { console.error('  [' + p.slide + '] ' + p.text); }
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
