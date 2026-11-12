#!/usr/bin/env node
/*
 * tools/bundle.js: make a single self-contained HTML file.
 *
 *   node tools/bundle.js                         deck/index.html      -> dist/deck.html
 *   node tools/bundle.js screener/index.html     screener/index.html  -> dist/screener.html
 *   node tools/bundle.js page.html --out x.html  choose the output file
 *   node tools/bundle.js --no-verify             skip the browser check
 *
 * What it inlines (local files only):
 *   <script src="...">             -> <script> with the code
 *   <link rel="stylesheet" href>   -> <style> with the CSS
 *   url(...) and @import in CSS    -> data: URIs (fonts, images) / the imported CSS
 *   <img src>, <source src>, <video src|poster>, <audio src>, <link rel="icon">
 *                                  -> data: URIs
 *   src="..." / url(...) inside the scripts (slide markup is written in JS)
 *                                  -> data: URIs, when the file exists
 *
 * Any http(s) reference is an error: the deck must run with no network.
 *
 * Then it VERIFIES the result: opens the file through file:// in headless
 * Chromium and fails if there is a console error, an uncaught error, or a
 * request for any other file. If the page is a deck (window.__deck exists)
 * it also visits every slide.
 *
 * Exit code: 0 good, 1 the bundle has a problem, 2 bad usage.
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

const MIME = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript'
};

/* ------------------------------------------------------------------ helpers */

const stats = { scripts: 0, styles: 0, assets: 0 };
const errors = [];

/** A path for messages: relative to where the command was run, unless that would climb out of it. */
function show(file) {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith('..') ? rel : file;
}

/** A reference we can inline: a relative or absolute file path, not a URL with a scheme. */
function isLocal(ref) {
  return !!ref && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref.trim());
}

function isRemote(ref) {
  return /^(?:https?:)?\/\//i.test((ref || '').trim());
}

function resolveRef(ref, baseDir) {
  const clean = ref.trim().split('#')[0].split('?')[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch (e) { /* keep as written */ }
  return path.resolve(baseDir, decoded);
}

function readOrReport(file, from) {
  if (!fs.existsSync(file)) {
    errors.push('Missing file: ' + show(file) + ' (referenced from ' + show(from) + ')');
    return null;
  }
  return fs.readFileSync(file);
}

function dataUri(file, from) {
  const buf = readOrReport(file, from);
  if (!buf) { return null; }
  const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  stats.assets++;
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

/** Read one attribute from a tag's source text. */
function attr(tag, name) {
  const m = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag);
  return m ? (m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3])) : null;
}

function setAttr(tag, name, value) {
  return tag.replace(new RegExp('(\\s' + name + '\\s*=\\s*)(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i'), function (m, head) {
    return head + '"' + value + '"';
  });
}

function dropAttr(tag, name) {
  return tag.replace(new RegExp('\\s' + name + '\\s*=\\s*(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i'), '');
}

/* ---------------------------------------------------------------------- CSS */

/** Inline @import and url(...) in a stylesheet. cssFile is used to resolve relative paths. */
function inlineCss(css, cssFile, seen) {
  seen = seen || new Set();
  const dir = path.dirname(cssFile);

  css = css.replace(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?([^;]*);/gi, function (whole, ref, media) {
    if (isRemote(ref)) { errors.push('External @import in ' + show(cssFile) + ': ' + ref); return whole; }
    if (!isLocal(ref)) { return whole; }
    const file = resolveRef(ref, dir);
    if (seen.has(file)) { return ''; }
    seen.add(file);
    const buf = readOrReport(file, cssFile);
    if (!buf) { return whole; }
    const inner = inlineCss(buf.toString('utf8'), file, seen);
    return media.trim() ? '@media ' + media.trim() + ' {\n' + inner + '\n}' : inner;
  });

  css = css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi, function (whole, a, b, c) {
    const ref = a !== undefined ? a : (b !== undefined ? b : c);
    if (isRemote(ref)) { errors.push('External URL in ' + show(cssFile) + ': ' + ref); return whole; }
    if (!isLocal(ref)) { return whole; }                // data:, #fragment
    const uri = dataUri(resolveRef(ref, dir), cssFile);
    return uri ? 'url("' + uri + '")' : whole;
  });
  return css;
}

/* --------------------------------------------------------------------- HTML */

/* Text that would end a <script> block early if it appeared inside one. The
 * replacements mean the same thing to JavaScript inside strings and regexes. */
function safeForScriptTag(js) {
  return js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

/*
 * Slide markup lives in JavaScript template strings, so an <img src="art/x.png">
 * or a url(art/x.png) in there is invisible to the HTML pass. This looks for
 * such references inside a script and inlines the ones that exist on disk
 * (paths are relative to the HTML page, as the browser resolves them).
 */
const ASSET_EXT = '(?:png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mp3|wav|ogg|woff2?|ttf|otf)';

function inlineAssetsInJs(js, htmlDir, fromFile) {
  const swap = function (whole, head, ref, tail) {
    if (!isLocal(ref)) { return whole; }
    const file = resolveRef(ref, htmlDir);
    if (!fs.existsSync(file)) { return whole; }
    const uri = dataUri(file, fromFile);
    return uri ? head + uri + tail : whole;
  };
  js = js.replace(new RegExp('(\\b(?:src|poster|href)\\s*=\\s*\\\\?["\'])([^"\'\\\\<>]+\\.' + ASSET_EXT + ')(\\\\?["\'])', 'gi'), swap);
  js = js.replace(new RegExp('(url\\(\\s*\\\\?["\']?)([^"\'\\\\()<>]+\\.' + ASSET_EXT + ')(\\\\?["\']?\\s*\\))', 'gi'), swap);
  return js;
}

function bundle(entryFile) {
  const dir = path.dirname(entryFile);
  const html = fs.readFileSync(entryFile, 'utf8');

  // Walk the tags that can reference files. Comments and existing inline
  // <script>/<style> blocks are matched too, so nothing inside them is rewritten by accident.
  const TAGS = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<link\b[^>]*>|<(?:img|source|video|audio)\b[^>]*>/gi;

  return html.replace(TAGS, function (tag) {
    if (tag.startsWith('<!--')) { return tag; }
    const name = /^<([a-z]+)/i.exec(tag)[1].toLowerCase();

    if (name === 'script') {
      const open = /^<script\b[^>]*>/i.exec(tag)[0];
      const src = attr(open, 'src');
      if (src === null) { return tag; }
      if (isRemote(src)) { errors.push('External script: ' + src); return tag; }
      if (!isLocal(src)) { return tag; }
      const file = resolveRef(src, dir);
      const buf = readOrReport(file, entryFile);
      if (!buf) { return tag; }
      stats.scripts++;
      const openInline = dropAttr(open, 'src').replace(/>$/, ' data-src="' + src + '">');
      return openInline + '\n' + safeForScriptTag(inlineAssetsInJs(buf.toString('utf8'), dir, file)) + '\n</script>';
    }

    if (name === 'style') {
      const m = /^(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)$/i.exec(tag);
      return m[1] + inlineCss(m[2], entryFile) + m[3];
    }

    if (name === 'link') {
      const href = attr(tag, 'href');
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      if (href === null) { return tag; }
      if (isRemote(href)) { errors.push('External <link>: ' + href); return tag; }
      if (!isLocal(href)) { return tag; }
      const file = resolveRef(href, dir);
      if (/\bstylesheet\b/.test(rel)) {
        const buf = readOrReport(file, entryFile);
        if (!buf) { return tag; }
        stats.styles++;
        const media = attr(tag, 'media');
        return '<style data-href="' + href + '"' + (media ? ' media="' + media + '"' : '') + '>\n' +
          inlineCss(buf.toString('utf8'), file).replace(/<\/style/gi, '<\\/style') + '\n</style>';
      }
      const uri = dataUri(file, entryFile);       // icons and the like
      return uri ? setAttr(tag, 'href', uri) : tag;
    }

    // img, source, video, audio
    let out = tag;
    for (const key of ['src', 'poster']) {
      const ref = attr(out, key);
      if (ref === null) { continue; }
      if (isRemote(ref)) { errors.push('External <' + name + '>: ' + ref); continue; }
      if (!isLocal(ref)) { continue; }
      const uri = dataUri(resolveRef(ref, dir), entryFile);
      if (uri) { out = setAttr(out, key, uri); }
    }
    return out;
  });
}

/* ------------------------------------------------------------------- verify */

async function verify(outFile) {
  const { chromium } = requirePlaywright();
  const problems = [];
  const self = pathToFileURL(outFile).href;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (msg) => { if (msg.type() === 'error') { problems.push('console.error: ' + msg.text()); } });
  page.on('pageerror', (err) => { problems.push('uncaught: ' + err.message); });
  page.on('request', (req) => {
    const url = req.url();
    if (/^(data|blob|about):/.test(url)) { return; }
    if (url.split('#')[0].split('?')[0] === self) { return; }
    problems.push('not self-contained, it asked for: ' + url);
  });

  let summary = 'loaded';
  try {
    await page.goto(self + '?fast', { waitUntil: 'load' });
    const isDeck = await page.evaluate(() => !!window.__deck);
    if (!isDeck) {
      await page.waitForTimeout(500);
      eqProtocol(await page.evaluate(() => location.protocol), problems);
    } else {
      await page.waitForFunction(() => window.__deck.count() > 0 && window.__deck.current().index >= 0, null, { timeout: 15000 });
      eqProtocol(await page.evaluate(() => location.protocol), problems);
      const count = await page.evaluate(() => window.__deck.count());
      for (let i = 0; i < count; i++) {
        await page.evaluate((n) => window.__deck.goto(n, window.__deck.stepsOf(n)), i);
      }
      const caught = await page.evaluate(() => window.__deck.errors().filter((e) => !e.expected));
      caught.forEach((e) => problems.push((e.slide ? '[' + e.slide + '] ' : '') + e.where + ': ' + e.message));
      summary = 'visited ' + count + ' slide' + (count === 1 ? '' : 's');
    }
  } catch (err) {
    problems.push('could not verify: ' + err.message);
  }
  await browser.close();
  return { problems, summary };
}

function eqProtocol(protocol, problems) {
  if (protocol !== 'file:') { problems.push('expected to be loaded from file://, got ' + protocol); }
}

/* --------------------------------------------------------------------- main */

(async () => {
  const args = process.argv.slice(2);
  let entry = null;
  let out = null;
  let doVerify = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') { out = args[++i]; }
    else if (a === '--no-verify') { doVerify = false; }
    else if (a === '--help' || a === '-h') { console.log('Usage: node tools/bundle.js [entry.html] [--out file] [--no-verify]'); return; }
    else if (a.startsWith('--')) { console.error('Unknown option: ' + a); process.exit(2); }
    else if (!entry) { entry = a; }
    else { console.error('Only one entry file, please.'); process.exit(2); }
  }

  const entryFile = path.resolve(entry || path.join(ROOT, 'deck', 'index.html'));
  if (!fs.existsSync(entryFile)) { console.error('Not found: ' + entryFile); process.exit(2); }

  // deck/index.html -> dist/deck.html;  screener/index.html -> dist/screener.html;  foo/page.html -> dist/page.html
  const base = path.basename(entryFile, path.extname(entryFile));
  const name = base === 'index' ? path.basename(path.dirname(entryFile)) : base;
  const outFile = path.resolve(out || path.join(ROOT, 'dist', name + '.html'));
  if (outFile === entryFile) { console.error('The output would overwrite the entry file.'); process.exit(2); }

  let html = bundle(entryFile);
  const relEntry = path.relative(ROOT, entryFile);
  const note = '<!-- Single-file build of ' + (relEntry.startsWith('..') ? path.basename(entryFile) : relEntry.split(path.sep).join('/')) +
    ', made by tools/bundle.js. Do not edit this file: edit the sources and run the tool again. -->\n';
  html = /^\s*<!doctype[^>]*>/i.test(html) ? html.replace(/^(\s*<!doctype[^>]*>\s*)/i, '$1' + note) : note + html;

  if (errors.length) {
    console.error('Cannot bundle ' + show(entryFile) + ':');
    errors.forEach((e) => console.error('  ' + e));
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(show(outFile) + '  ' + kb + ' kB  (' + stats.scripts + ' scripts, ' + stats.styles + ' stylesheets, ' + stats.assets + ' fonts/images inlined)');

  // Anything still pointing at a file would break when the bundle is copied somewhere else.
  const leftovers = [];
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(?:script|link|img|source|video|audio)\b[^>]*>/gi, function (tag) {
    for (const key of ['src', 'href', 'poster']) {
      const ref = attr(tag, key);
      if (ref && isLocal(ref)) { leftovers.push(tag.slice(0, 100)); }
    }
    return tag;
  });
  if (leftovers.length) {
    console.error('Still references local files:');
    leftovers.forEach((t) => console.error('  ' + t));
    process.exit(1);
  }

  if (!doVerify) { console.log('not verified (--no-verify)'); return; }
  const result = await verify(outFile);
  if (result.problems.length) {
    console.error('Verification FAILED (' + result.summary + '):');
    result.problems.forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  console.log('verified from file://: ' + result.summary + ', no console errors, no outside requests');
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
