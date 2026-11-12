#!/usr/bin/env node
/*
 * check-theme.js: the theme's numbers, checked.
 *
 *     node tools/check-theme.js            check deck/theme/tokens.css
 *     node tools/check-theme.js --quiet    print failures only
 *
 * What it checks (the rules are in docs/TOKENS.md and docs/DIRECTION.md Part 1):
 *
 *   1. Every canonical token of docs/TOKENS.md is defined.
 *   2. Contrast (WCAG 2 relative luminance) for every pair that carries text or
 *      a mark, against the threshold the token's role states.
 *   3. Before / after differ in lightness, not only in hue.
 *   4. The categorical ramp (--c-data-1..5) is in strict lightness order, so
 *      the series can be told apart in greyscale.
 *   5. The heat ramp (--c-heat-0..5) is monotonic in lightness. FAILS if not.
 *   6. Type floors: body 36px, labels 32px, source lines 28px.
 *   7. Motion tokens exist and are times / curves.
 *   8. deck/theme/fonts.css exists and is under 1.5 MB.
 *
 * It reads the CSS as text (no browser), resolves var() references between
 * tokens, and exits 1 if anything fails. No dependencies.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var TOKENS = path.join(ROOT, 'deck', 'theme', 'tokens.css');
var FONTS = path.join(ROOT, 'deck', 'theme', 'fonts.css');
var QUIET = process.argv.indexOf('--quiet') !== -1;

/* ------------------------------------------------------------------ parsing */

function readTokens(file) {
  var css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  var raw = {};
  var re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g;
  var m;
  while ((m = re.exec(css))) { raw[m[1]] = m[2].trim(); }
  return raw;
}

function resolve(raw, name, seen) {
  var value = raw[name];
  if (value == null) { return null; }
  seen = seen || {};
  if (seen[name]) { throw new Error('circular reference at ' + name); }
  seen[name] = true;
  return value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]+))?\)/g, function (_, ref, fallback) {
    var v = resolve(raw, ref, Object.assign({}, seen));
    if (v == null) { return fallback != null ? fallback.trim() : 'MISSING(' + ref + ')'; }
    return v;
  });
}

/* ------------------------------------------------------------------- colour */

function parseHex(str) {
  var s = String(str).trim();
  var m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) { return m[1].split('').map(function (c) { return parseInt(c + c, 16); }); }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); }); }
  m = /^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/i.exec(s);
  if (m) { return [Number(m[1]), Number(m[2]), Number(m[3])]; }
  return null;
}

function channel(c) {
  var s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2 relative luminance, 0 (black) to 1 (white). */
function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG 2 contrast ratio, 1 to 21. */
function contrast(a, b) {
  var la = luminance(a);
  var lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** CIE L*, 0 to 100: perceptual lightness, what a greyscale projector keeps. */
function lightness(rgb) {
  var y = luminance(rgb);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/* ------------------------------------------------------------------ reporting */

var failures = 0;
var lines = [];

function pass(text) { if (!QUIET) { lines.push('ok    ' + text); } }
function fail(text) { failures++; lines.push('FAIL  ' + text); }
function info(text) { if (!QUIET) { lines.push('      ' + text); } }
function head(text) { if (!QUIET) { lines.push(''); lines.push(text); } }

/* --------------------------------------------------------------------- main */

if (!fs.existsSync(TOKENS)) {
  console.error('FAIL  not found: ' + path.relative(ROOT, TOKENS));
  process.exit(1);
}

var raw = readTokens(TOKENS);
function token(name) { return resolve(raw, name); }
function colour(name) {
  var v = token(name);
  var rgb = v == null ? null : parseHex(v);
  if (!rgb) { fail(name + ' is not a plain colour (' + v + ')'); }
  return rgb;
}

/* 1. every canonical token ---------------------------------------------------- */

var CANONICAL = [
  '--c-bg', '--c-bg-alt', '--c-ink', '--c-ink-soft', '--c-muted', '--c-line', '--c-accent', '--c-accent-ink',
  '--c-no', '--c-no-ink', '--c-pass', '--c-pass-ink', '--c-warn', '--c-before', '--c-after',
  '--c-data-1', '--c-data-2', '--c-data-3', '--c-data-4', '--c-data-5',
  '--c-heat-0', '--c-heat-1', '--c-heat-2', '--c-heat-3', '--c-heat-4', '--c-heat-5',
  '--f-display', '--f-body', '--f-mono',
  '--t-mega', '--t-hero', '--t-h1', '--t-h2', '--t-body', '--t-label', '--t-small',
  '--m-x', '--m-y', '--s-1', '--s-2', '--s-3', '--s-4', '--s-5', '--s-6', '--s-7', '--s-8',
  '--w-hair', '--w-rule', '--w-bold', '--r-1', '--r-2',
  '--d-fast', '--d-base', '--d-slow', '--e-out', '--e-in-out', '--e-snap'
];

head('1. Canonical tokens (docs/TOKENS.md)');
var missing = CANONICAL.filter(function (n) { return raw[n] == null; });
if (missing.length) { fail('missing: ' + missing.join(', ')); }
else { pass('all ' + CANONICAL.length + ' canonical tokens are defined (' + Object.keys(raw).length + ' tokens in the file)'); }
var unresolved = Object.keys(raw).filter(function (n) { return /MISSING\(/.test(token(n) || ''); });
if (unresolved.length) { fail('these tokens point at a token that does not exist: ' + unresolved.join(', ')); }

/* 2. contrast ----------------------------------------------------------------- */

/* [foreground, background, minimum ratio, what the pair is for] */
var PAIRS = [
  ['--c-ink', '--c-bg', 7, 'primary text on the stage'],
  ['--c-ink', '--c-bg-alt', 7, 'primary text on a panel'],
  ['--c-bg', '--c-ink', 7, 'text on a Lampblack field'],
  ['--c-ink-soft', '--c-bg', 4.5, 'secondary text, 32px and above'],
  ['--c-ink-soft', '--c-bg-alt', 4.5, 'secondary text on a panel'],
  ['--c-accent-ink', '--c-accent', 7, 'text on the accent'],
  ['--c-accent', '--c-ink', 7, 'accent as display type on a Lampblack field'],
  ['--c-no-ink', '--c-no', 7, 'text on a NO block'],
  ['--c-pass-ink', '--c-pass', 7, 'text on a PASS block'],
  ['--c-no', '--c-bg', 7, 'a NO mark on the stage'],
  ['--c-pass', '--c-bg', 7, 'a PASS mark on the stage'],
  ['--c-line', '--c-bg', 3, 'rules, axes, rack outlines'],
  ['--c-warn', '--c-bg', 3, 'caution marks'],
  ['--c-muted', '--c-bg', 3, 'de-emphasised marks (not small text)'],
  ['--c-before', '--c-bg', 3, 'the "before" mark'],
  ['--c-after', '--c-bg', 3, 'the "after" mark'],
  ['--c-data-1', '--c-bg', 3, 'series 1 as a mark'],
  ['--c-data-2', '--c-bg', 3, 'series 2 as a mark'],
  ['--c-data-3', '--c-bg', 3, 'series 3 as a mark']
];

head('2. Contrast (WCAG 2)');
PAIRS.forEach(function (p) {
  var fg = colour(p[0]);
  var bg = colour(p[1]);
  if (!fg || !bg) { return; }
  var ratio = contrast(fg, bg);
  var text = pad(p[0], 16) + ' on ' + pad(p[1], 12) + ' ' + pad(ratio.toFixed(2) + ' : 1', 10) + ' (needs ' + p[2] + ')  ' + p[3];
  // compare on the two decimals that are printed, so 7.00 never fails as 6.999
  if (Math.round(ratio * 100) / 100 >= p[2]) { pass(text); } else { fail(text); }
});

var accent = colour('--c-accent');
var bg = colour('--c-bg');
if (accent && bg) {
  info(pad('--c-accent', 16) + ' on ' + pad('--c-bg', 12) + ' ' + pad(contrast(accent, bg).toFixed(2) + ' : 1', 10) +
    ' shape only, by rule: blocks and bands, never text or a thin line');
}
['--c-data-4', '--c-data-5'].forEach(function (n) {
  var c = colour(n);
  if (c && bg) {
    info(pad(n, 16) + ' on ' + pad('--c-bg', 12) + ' ' + pad(contrast(c, bg).toFixed(2) + ' : 1', 10) +
      ' light screens: draw them with a rule or a pattern (THEME.draw.bar pattern)');
  }
});

/* 3. before / after ----------------------------------------------------------- */

head('3. Before / after differ in lightness');
var before = colour('--c-before');
var after = colour('--c-after');
if (before && after) {
  var dl = Math.abs(lightness(before) - lightness(after));
  var t3 = '--c-before L* ' + lightness(before).toFixed(1) + '  --c-after L* ' + lightness(after).toFixed(1) + '  difference ' + dl.toFixed(1) + ' (needs 20)';
  if (dl >= 20) { pass(t3); } else { fail(t3); }
}

/* 4. and 5. ramps --------------------------------------------------------------- */

function ramp(prefix, from, to) {
  var out = [];
  for (var i = from; i <= to; i++) {
    var name = prefix + i;
    var rgb = colour(name);
    if (rgb) { out.push({ name: name, value: token(name), l: lightness(rgb), contrast: bg ? contrast(rgb, bg) : 0 }); }
  }
  return out;
}

function monotonic(list) {
  var dir = 0;
  for (var i = 1; i < list.length; i++) {
    var d = list[i].l - list[i - 1].l;
    if (d === 0) { return 0; }
    var s = d > 0 ? 1 : -1;
    if (dir && s !== dir) { return 0; }
    dir = s;
  }
  return dir;
}

function minStep(list) {
  var least = Infinity;
  for (var i = 1; i < list.length; i++) { least = Math.min(least, Math.abs(list[i].l - list[i - 1].l)); }
  return least;
}

function printRamp(list) {
  list.forEach(function (s) {
    info(pad(s.name, 12) + pad(s.value, 9) + ' L* ' + pad(s.l.toFixed(1), 6) + bar(s.l) + '  ' + s.contrast.toFixed(2) + ' : 1 on the stage');
  });
}

head('4. Categorical ramp: lightness order (greyscale must still tell the series apart)');
var data = ramp('--c-data-', 1, 5);
printRamp(data);
if (data.length === 5) {
  var dirData = monotonic(data);
  var stepData = minStep(data);
  if (!dirData) { fail('--c-data-1..5 are not in strict lightness order'); }
  else if (stepData < 10) { fail('--c-data-1..5: two neighbours are only ' + stepData.toFixed(1) + ' L* apart (needs 10)'); }
  else { pass('--c-data-1..5 run ' + (dirData < 0 ? 'light to dark' : 'dark to light') + ', smallest step ' + stepData.toFixed(1) + ' L*'); }
}

head('5. Heat ramp: cold to hot, monotonic in lightness');
var heatRamp = ramp('--c-heat-', 0, 5);
printRamp(heatRamp);
if (heatRamp.length === 6) {
  var dirHeat = monotonic(heatRamp);
  var stepHeat = minStep(heatRamp);
  if (!dirHeat) { fail('--c-heat-0..5 is NOT monotonic in lightness'); }
  else if (stepHeat < 8) { fail('--c-heat-0..5: two neighbours are only ' + stepHeat.toFixed(1) + ' L* apart (needs 8)'); }
  else { pass('--c-heat-0..5 is monotonic (' + (dirHeat < 0 ? 'hot is dark' : 'hot is light') + '), smallest step ' + stepHeat.toFixed(1) + ' L*'); }
  var hot = heatRamp[5];
  if (hot.contrast < 7) { fail('the hottest stop must stand out on the stage: ' + hot.contrast.toFixed(2) + ' : 1 (needs 7)'); }
  else { pass('the hottest stop is ' + hot.contrast.toFixed(2) + ' : 1 on the stage; the coldest is ' + heatRamp[0].contrast.toFixed(2) + ' : 1 (pair the ramp with dot size)'); }
}

/* 6. type floors ---------------------------------------------------------------- */

head('6. Type floors (stage pixels)');
[['--t-body', 36], ['--t-label', 32], ['--t-small', 28], ['--t-h2', 54], ['--t-h1', 96], ['--t-hero', 120], ['--t-mega', 240]].forEach(function (f) {
  var v = parseFloat(token(f[0]));
  var t6 = pad(f[0], 10) + pad(token(f[0]), 8) + '(floor ' + f[1] + 'px)';
  if (v >= f[1]) { pass(t6); } else { fail(t6); }
});
Object.keys(raw).filter(function (n) { return /^--t-/.test(n); }).forEach(function (n) {
  var v = parseFloat(token(n));
  if (!isNaN(v) && v < 28) { fail(n + ' is ' + token(n) + ': nothing on stage is below 28px'); }
});
[['--w-hair', 3], ['--w-rule', 6], ['--w-bold', 8]].forEach(function (f) {
  var v = parseFloat(token(f[0]));
  var t = pad(f[0], 10) + pad(token(f[0]), 8) + '(floor ' + f[1] + 'px)';
  if (v >= f[1]) { pass(t); } else { fail(t); }
});

/* 7. motion --------------------------------------------------------------------- */

head('7. Motion');
['--d-fast', '--d-base', '--d-slow'].forEach(function (n) {
  var v = token(n);
  if (/^[\d.]+m?s$/.test(v || '')) { pass(pad(n, 12) + v); } else { fail(n + ' is not a time: ' + v); }
});
['--e-out', '--e-in-out', '--e-snap'].forEach(function (n) {
  var v = token(n);
  var curve = /^cubic-bezier\(([^)]+)\)$/.exec(v || '');
  if (curve) {
    var p = curve[1].split(',').map(Number);
    // an easing that overshoots has a control point outside 0..1 on the y axis
    if (p[1] < 0 || p[1] > 1 || p[3] < 0 || p[3] > 1) { fail(n + ' overshoots (' + v + '): the direction forbids it'); }
    else { pass(pad(n, 12) + v); }
  } else if (/^(steps\(|linear|ease)/.test(v || '')) { pass(pad(n, 12) + v); }
  else { fail(n + ' is not an easing: ' + v); }
});
Object.keys(raw).filter(function (n) { return /^--e-/.test(n); }).forEach(function (n) {
  var curve = /^cubic-bezier\(([^)]+)\)$/.exec(token(n) || '');
  if (!curve) { return; }
  var p = curve[1].split(',').map(Number);
  if (p[1] < 0 || p[1] > 1 || p[3] < 0 || p[3] > 1) { fail(n + ' overshoots (' + token(n) + '): the direction forbids it'); }
});

/* 8. fonts ---------------------------------------------------------------------- */

head('8. Fonts');
if (!fs.existsSync(FONTS)) { fail('deck/theme/fonts.css is missing: run node tools/build-fonts.js'); }
else {
  var bytes = fs.statSync(FONTS).size;
  var limit = 1.5 * 1024 * 1024;
  var fontsCss = fs.readFileSync(FONTS, 'utf8');
  var faces = (fontsCss.match(/@font-face/g) || []).length;
  var external = /url\(\s*(?!["']?data:)/.test(fontsCss);
  var t8 = 'fonts.css is ' + (bytes / 1024).toFixed(0) + ' KB with ' + faces + ' embedded face' + (faces === 1 ? '' : 's') + ' (limit 1536 KB)';
  if (bytes > limit) { fail(t8); } else { pass(t8); }
  if (external) { fail('fonts.css points at a file or a network address: every font must be a data URI'); }
  else { pass('every font is a data URI: nothing is fetched'); }
  ['Archivo', 'Fraunces'].forEach(function (family) {
    if (fontsCss.indexOf('font-family: "' + family + '"') === -1) { fail('fonts.css has no @font-face for ' + family); }
  });
}

/* ------------------------------------------------------------------- output */

function pad(s, n) { s = String(s); while (s.length < n) { s += ' '; } return s; }
function bar(l) {
  var n = Math.round(l / 5);
  var out = '';
  for (var i = 0; i < 20; i++) { out += i < n ? '#' : '.'; }
  return ' ' + out;
}

console.log('check-theme: ' + path.relative(ROOT, TOKENS));
console.log(lines.join('\n'));
console.log('');
if (failures) {
  console.error(failures + ' check' + (failures === 1 ? '' : 's') + ' failed');
  process.exit(1);
}
console.log('theme ok');
