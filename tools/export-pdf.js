#!/usr/bin/env node
/*
 * tools/export-pdf.js: write the deck as a PDF, one slide per page.
 *
 *   node tools/export-pdf.js                     deck/index.html?print -> dist/deck.pdf
 *   node tools/export-pdf.js --out file.pdf      choose the output file
 *   node tools/export-pdf.js --entry dist/deck.html   export from another build
 *   node tools/export-pdf.js --demo              include the engine demo slides (?demo)
 *
 * Uses the deck's print mode: every slide that is not skipped, at its final
 * step, scenes mounted, on a 1920x1080 page (so 20 x 11.25 inches in the PDF).
 * Animated scenes are captured at whatever frame they are on.
 *
 * Exit code 1 if the page count does not match the slide count, or if the
 * page logged an error (they are printed).
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

(async () => {
  const args = process.argv.slice(2);
  let entry = path.join(ROOT, 'deck', 'index.html');
  let out = path.join(ROOT, 'dist', 'deck.pdf');
  let demo = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') { out = path.resolve(args[++i] || ''); }
    else if (a === '--entry') { entry = path.resolve(args[++i] || ''); }
    else if (a === '--demo') { demo = true; }
    else if (a === '--help' || a === '-h') { console.log('Usage: node tools/export-pdf.js [--out file.pdf] [--entry file.html] [--demo]'); return; }
    else { console.error('Unknown option: ' + a); process.exit(2); }
  }
  if (!fs.existsSync(entry)) { console.error('Not found: ' + entry); process.exit(2); }

  const { chromium } = requirePlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('console', (msg) => { if (msg.type() === 'error') { problems.push('console.error: ' + msg.text()); } });
  page.on('pageerror', (err) => { problems.push('uncaught: ' + err.message); });

  await page.goto(pathToFileURL(entry).href + '?print' + (demo ? '&demo' : ''));
  try {
    await page.waitForFunction(() => window.__deck && window.__deck.count() > 0, null, { timeout: 15000 });
  } catch (e) {
    console.error('The deck did not start in print mode (no slides?).');
    problems.forEach((p) => console.error('  ' + p));
    await browser.close();
    process.exit(1);
  }

  // Let entrance animations and scene tweens finish, then give canvases two frames to paint.
  const settled = await page.evaluate(() => window.__deck.settle());
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const slideCount = await page.evaluate(() => window.__deck.count());
  // A slide may ask for more than one page (printSteps), so the right number of
  // pages is the number of print pages the deck laid out, not the slide count.
  const expectedPages = (await page.evaluate(() => document.querySelectorAll('.deck-print-page').length)) || slideCount;
  const caught = await page.evaluate(() => window.__deck.errors().filter((e) => !e.expected));
  caught.forEach((e) => problems.push((e.slide ? '[' + e.slide + '] ' : '') + e.where + ': ' + e.message));

  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.pdf({ path: out, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  await browser.close();

  const raw = fs.readFileSync(out).toString('latin1');
  const pageCount = (raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  const mb = (fs.statSync(out).size / (1024 * 1024)).toFixed(1);
  const rel = path.relative(process.cwd(), out);
  console.log((rel && !rel.startsWith('..') ? rel : out) + '  ' + pageCount + ' pages, ' + mb + ' MB' + (settled ? '' : '  (some animation was still running after 5 s)'));

  let bad = false;
  if (pageCount !== expectedPages) {
    console.error('Page count is wrong: ' + pageCount + ' pages, expected ' + expectedPages + ' (' + slideCount + ' slides).');
    bad = true;
  }
  if (problems.length) {
    console.error(problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ' while rendering:');
    problems.forEach((p) => console.error('  ' + p));
    bad = true;
  }
  process.exit(bad ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
