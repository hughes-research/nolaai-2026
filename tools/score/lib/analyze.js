#!/usr/bin/env node
/*
 * tools/score/lib/analyze.js: numbers and pictures, for people who cannot hear.
 *
 *   node tools/score/lib/analyze.js final.wav --out analysis [--stems stems] [--ref other.wav] [--no-pictures]
 *
 *   const numbers = require('./analyze.js').run(file, { outDir, stemsDir, ref });
 *
 * Writes into outDir (default: "analysis" beside the file):
 *   numbers.md    for people: ONE table with every target of BRIEF.md section 4.3 beside the measured value
 *                 and PASS or FAIL, then the detail (loudness, spectrum, stereo, bar by bar, stems)
 *   numbers.json  the same numbers for programs
 *   spectrogram.png, spectrogram-00-12s.png, spectrogram-20-32s.png, spectrogram-30-46s.png
 *                 log frequency, drawn by spectro.py (Python 3, numpy, Pillow); the time axis shows the
 *                 film's own seconds in every window
 *   waveform.png  left over right, a grid line every bar (2 s), the three HARD hits marked
 *   ref-spectrogram.png   with --ref
 *
 * With --stems DIR (bass.wav, keys.wav, drums.wav, fx.wav): each stem's RMS overall and in the full-trio
 * window (30 to 36 s) relative to the bass, band energies, spectral centroid, left/right balance, the
 * small-speaker test for the bass, and the NO thuds measured on fx.wav.
 * With --ref FILE: the reference's numbers in a second column.
 *
 * What each number means is written under its table in numbers.md. The spectra are computed here (Welch's
 * method, Hann, 16384 points, 50 percent overlap); the loudness is the kit's BS.1770 meter with ffmpeg's
 * ebur128 beside it as a cross-check.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { SR, N } = require('./const.js');
const dsp = require('./dsp.js');
const mix = require('./mix.js');
const wav = require('./wav.js');
const checks = require('./checks.js');

const BANDS = [
  ['sub', 'sub, under 60 Hz', 0, 60], ['bass', 'bass, 60 to 250 Hz', 60, 250], ['lowMid', 'low-mid, 250 to 500 Hz', 250, 500],
  ['mid', 'mid, 500 Hz to 2 kHz', 500, 2000], ['presence', 'presence, 2 to 5 kHz', 2000, 5000],
  ['brilliance', 'brilliance, 5 to 8 kHz', 5000, 8000], ['air', 'air, over 8 kHz', 8000, SR / 2]
];
const TRIO = [30, 36];           // the full-trio window of BRIEF.md 4.3
const SMALL_HZ = 150;            // the small-speaker high-pass
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

function isBuf(b) { return b instanceof Float32Array || b instanceof Float64Array; }
function db10(x) { return x > 0 ? 10 * Math.log10(x) : -Infinity; }
function f(v, digits) { return Number.isFinite(v) ? v.toFixed(digits === undefined ? 1 : digits) : (v === -Infinity ? '-inf' : 'n/a'); }
function signed(v, digits) { return Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(digits === undefined ? 1 : digits) : f(v); }

function load(file) {
  const w = wav.read(file);
  if (w.sr !== SR) { throw new Error('analyze: ' + file + ' is at ' + w.sr + ' Hz; the kit works at ' + SR + ' Hz'); }
  const st = w.channels.length >= 2 ? [w.channels[0], w.channels[1]] : [w.channels[0], w.channels[0]];
  return { st, format: { sr: w.sr, channelCount: w.channels.length, bits: w.bits, float: w.float, frames: w.frames } };
}

/* A straight line through (x, y): the slope, least squares, over the finite points. */
function slopeOf(x, y) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(y[i])) { continue; }
    n++; sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i];
  }
  return n >= 3 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : NaN;
}

/*
 * The long-term spectrum of a Stereo and what is read from it.
 *   bands[key]        each band's energy in dB relative to the total
 *   below50Db         energy under 50 Hz relative to the total
 *   slopeDbPerOct     a straight line through the power spectral DENSITY (dB per Hz) at the 17 third-octave
 *                     centres from 200 Hz to 8 kHz; negative = falling. (Pink noise is -3, brown noise -6.)
 *   slopeBandsDbPerOct  the same line through third-octave BAND levels: 3 dB per octave shallower by construction
 *   centroidHz        the energy's centre of gravity, 20 Hz to 20 kHz
 *   stereo            per band: left/right correlation and what the mono sum loses
 */
function tone(st, from, to) {
  const w = dsp.welch(st, { size: 16384, from, to });
  const df = w.df, half = w.power[0].length, top = SR / 2;
  const PL = w.power[0], PR = w.power[1] || w.power[0];
  const p = new Float64Array(half);
  for (let k = 0; k < half; k++) { p[k] = 0.5 * (PL[k] + PR[k]); }
  const total = dsp.bandPower(p, df, 0, top);
  const out = { totalDb: db10(total), bands: {}, stereo: {} };
  const cross = w.cross ? w.cross.re : PL;
  const pair = (f0, f1) => {
    const l = dsp.bandPower(PL, df, f0, f1), r = dsp.bandPower(PR, df, f0, f1), x = dsp.bandPower(cross, df, f0, f1);
    return {
      shareDb: db10((l + r) / (2 * total)),
      correlation: l > 0 && r > 0 ? x / Math.sqrt(l * r) : NaN,
      monoLossDb: l + r > 0 ? db10(2 * (l + r) / Math.max(l + r + 2 * x, 1e-30)) : NaN
    };
  };
  for (const [key, , a, b] of BANDS) {
    out.bands[key] = db10(dsp.bandPower(p, df, a, b) / total);
    out.stereo[key] = pair(a, b);
  }
  out.below50Db = db10(dsp.bandPower(p, df, 0, 50) / total);
  out.lowEnd = pair(20, SMALL_HZ);
  const centres = [], bandDb = [], densityDb = [];
  for (let k = -7; k <= 9; k++) {
    const fc = 1000 * Math.pow(2, k / 3), lo = fc * Math.pow(2, -1 / 6), hi = fc * Math.pow(2, 1 / 6);
    const pw = dsp.bandPower(p, df, lo, hi);
    centres.push(fc); bandDb.push(db10(pw / total)); densityDb.push(db10(pw / (hi - lo)));
  }
  out.thirdOctave = { centres: centres.map((c) => Math.round(c)), db: bandDb };
  out.slopeDbPerOct = slopeOf(centres.map(Math.log2), densityDb);
  out.slopeBandsDbPerOct = slopeOf(centres.map(Math.log2), bandDb);
  let a = 0, b = 0;
  for (let k = Math.ceil(20 / df); k < half && k * df <= 20000; k++) { a += k * df * p[k]; b += p[k]; }
  out.centroidHz = b > 0 ? a / b : NaN;
  return out;
}

/* Whole-signal stereo numbers: correlation, balance (left minus right, dB), and what the mono sum loses. */
function stereoNumbers(st) {
  const L = st[0], R = st[1];
  let sl = 0, sr = 0, x = 0;
  for (let i = 0; i < L.length; i++) { sl += L[i] * L[i]; sr += R[i] * R[i]; x += L[i] * R[i]; }
  return {
    correlation: sl > 0 && sr > 0 ? x / Math.sqrt(sl * sr) : NaN,
    balanceDb: sl > 0 && sr > 0 ? db10(sl / sr) : NaN,
    monoLossDb: sl + sr > 0 ? db10(2 * (sl + sr) / Math.max(sl + sr + 2 * x, 1e-30)) : NaN
  };
}

/* After a 150 Hz high-pass (24 dB an octave): how much is left. */
function smallSpeaker(st, withLufs) {
  const hp = dsp.copy(st);
  dsp.butter(hp, 'hp', SMALL_HZ, 4);
  const full = dsp.rms(st), left = dsp.rms(hp);
  const out = { keptDb: full > 0 ? dsp.db(left / full) : NaN, keptShare: full > 0 ? (left * left) / (full * full) : NaN };
  if (withLufs) { out.lufsAfter = mix.lufs(hp); }
  return out;
}

/* Bar by bar (2 s): the level and the spectral centroid of the mid signal. */
function perBar(st) {
  const m = dsp.mono(st);
  const size = 4096, hop = 2048, bar = 2 * SR, df = SR / size;
  const bars = Math.ceil(m.length / bar);
  const num = new Float64Array(bars), den = new Float64Array(bars);
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size); }
  const re = new Float64Array(size), im = new Float64Array(size);
  const k0 = Math.ceil(20 / df), k1 = Math.floor(20000 / df);
  for (let s = 0; s + size <= m.length; s += hop) {
    for (let i = 0; i < size; i++) { re[i] = m[s + i] * win[i]; im[i] = 0; }
    dsp.fft(re, im);
    const b = Math.min(bars - 1, Math.floor((s + size / 2) / bar));
    for (let k = k0; k <= k1; k++) { const pw = re[k] * re[k] + im[k] * im[k]; num[b] += k * df * pw; den[b] += pw; }
  }
  const out = [];
  for (let b = 0; b < bars; b++) {
    out.push({ bar: b + 1, from: 2 * b, rmsDb: dsp.rmsDb(st, 2 * b, 2 * b + 2), centroidHz: den[b] > 0 ? num[b] / den[b] : NaN });
  }
  return out;
}

/*
 * Measure a low drum that starts at time t (the NO thud), on a Stereo or one buffer:
 *   fundamentalHz  the strongest frequency between 30 and 120 Hz once it has settled (80 to 500 ms after t)
 *   startRatio     the same partial's frequency in the first 40 ms, divided by fundamentalHz (the pitch drop)
 *   bodyDb         the energy from 100 to 200 Hz relative to all of the thud's energy (t to t + 0.7 s)
 *   above3kDb      the energy above 3 kHz, likewise
 */
function thud(stereo, t) {
  const chs = isBuf(stereo) ? [stereo] : stereo;
  const n = chs[0].length;
  const seg = (from, to) => {
    const a = Math.max(0, Math.round(from * SR)), b = Math.min(n, Math.round(to * SR));
    const x = new Float64Array(Math.max(0, b - a));
    for (let i = 0; i < x.length; i++) { let v = 0; for (const c of chs) { v += c[a + i]; } x[i] = v / chs.length; }
    return x;
  };
  const spec = (x, fadeIn, fadeOut) => {           // the power spectrum of a stretch, its two ends eased in and out
    const size = 65536, re = new Float64Array(size), im = new Float64Array(size);
    const na = Math.max(1, Math.round(fadeIn * SR)), nz = Math.max(1, Math.round(fadeOut * SR)), len = Math.min(x.length, size);
    for (let i = 0; i < len; i++) {
      let g = 1;
      if (i < na) { g *= 0.5 - 0.5 * Math.cos(Math.PI * i / na); }
      if (len - 1 - i < nz) { g *= 0.5 - 0.5 * Math.cos(Math.PI * (len - 1 - i) / nz); }
      re[i] = x[i] * g;
    }
    dsp.fft(re, im);
    const p = new Float64Array(size / 2 + 1);
    for (let k = 0; k <= size / 2; k++) { p[k] = re[k] * re[k] + im[k] * im[k]; }
    return { p, df: SR / size };
  };
  const peakHz = (s, f0, f1) => {
    let best = -1, bk = 0;
    for (let k = Math.max(1, Math.ceil(f0 / s.df)); k <= Math.floor(f1 / s.df); k++) { if (s.p[k] > best) { best = s.p[k]; bk = k; } }
    if (!(best > 0)) { return NaN; }
    const a = Math.log(s.p[bk - 1] + 1e-300), b = Math.log(s.p[bk]), c = Math.log(s.p[bk + 1] + 1e-300);
    const d = (a - 2 * b + c) !== 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
    return (bk + Math.max(-1, Math.min(1, d))) * s.df;
  };
  const band = (s, f0, f1) => { let e = 0; for (let k = Math.max(0, Math.ceil(f0 / s.df)); k <= Math.min(s.p.length - 1, Math.floor(f1 / s.df)); k++) { e += s.p[k]; } return e; };
  const whole = spec(seg(t - 0.01, t + 0.7), 0.008, 0.15);
  const late = spec(seg(t + 0.08, t + 0.5), 0.21, 0.21);
  const early = spec(seg(t, t + 0.04), 0.02, 0.02);
  const fundamentalHz = peakHz(late, 30, 120);
  const startHz = peakHz(early, 0.8 * fundamentalHz, 1.95 * fundamentalHz);
  const total = band(whole, 0, SR / 2);
  let peak = 0;
  for (const c of chs) { for (let i = Math.max(0, Math.round(t * SR)); i < Math.min(n, Math.round((t + 0.7) * SR)); i++) { const v = Math.abs(c[i]); if (v > peak) { peak = v; } } }
  return {
    t, fundamentalHz, startHz, startRatio: startHz / fundamentalHz,
    bodyDb: db10(band(whole, 100, 200) / total), above3kDb: db10(band(whole, 3000, SR / 2) / total), peakDb: dsp.db(peak)
  };
}

/* ffmpeg's EBU R128 reading of a file: the cross-check. */
function ebur128(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true:metadata=1,ametadata=print:file=-', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) { throw new Error('analyze: ffmpeg could not run: ' + r.error.message); }
  if (r.status !== 0) { throw new Error('analyze: ffmpeg ebur128 failed: ' + String(r.stderr).trim().slice(-400)); }
  const last = (key) => { const re = new RegExp('lavfi\\.r128\\.' + key + '=(\\S+)', 'g'); let m, v = NaN; while ((m = re.exec(r.stdout))) { v = Number(m[1]); } return v; };
  const tp = last('true_peak');
  return { lufs: last('I'), lra: last('LRA'), truePeakDb: tp > 0 ? 20 * Math.log10(tp) : -Infinity };
}

/* Everything measured on one file (or one Stereo). */
function measure(file) {
  const { st, format } = load(file);
  const c = checks.run({ stereo: st, quiet: true }).numbers;
  const rmsDb = dsp.rmsDb(st);
  const out = {
    file, format, seconds: st[0].length / SR,
    lufs: c.lufs, lra: c.lra, truePeakDb: c.truePeakDb, samplePeakDb: c.samplePeakDb, rmsDb, crestDb: c.samplePeakDb - rmsDb,
    momentaryMax: c.momentaryMax, shortTermMax: c.shortTermMax,
    ffmpeg: ebur128(file),
    tone: tone(st), stereo: stereoNumbers(st), smallSpeaker: smallSpeaker(st, true), bars: perBar(st),
    clickCount: c.clickCount, clicks: c.clicks.slice(0, 20), largestJump: c.largestJump, dc: c.dc, clipped: c.clipped,
    breathDb: c.breathDb, quietestDb: c.quietestDb, quietestAt: c.quietestAt, tailDb: c.tailDb, seam: c.seam, sync: c.sync
  };
  out.below50 = { db: out.tone.below50Db };
  return { numbers: out, st };
}

function measureStem(file) {
  const { st, format } = load(file);
  const t = tone(st), s = stereoNumbers(st);
  return {
    numbers: {
      file, format, rmsDb: dsp.rmsDb(st), trioDb: dsp.rmsDb(st, TRIO[0], TRIO[1]), samplePeakDb: dsp.db(dsp.peak(st)),
      bands: t.bands, centroidHz: t.centroidHz, balanceDb: s.balanceDb, correlation: s.correlation,
      above150Share: smallSpeaker(st, false).keptShare
    },
    st
  };
}

/* ------------------------------------------------------------------ the targets of BRIEF.md 4.3 */

const THUD_BODY_DB = -15, THUD_ABOVE_3K_DB = -40, THUD_START = 1.15;

function targets(n, stems, thuds) {
  const rows = [];
  const add = (group, name, wanted, measured, pass) => rows.push({ group, name, wanted, measured, pass: pass === null ? null : !!pass });
  const need = 'needs --stems';
  const t = n.tone, fall = -t.slopeDbPerOct;
  add('Loudness', 'Integrated loudness', '-16.0 +/- 0.5 LUFS', f(n.lufs, 2) + ' LUFS', n.lufs >= -16.5 && n.lufs <= -15.5);
  add('Loudness', 'True peak', 'at most -2.0 dBTP', f(n.truePeakDb, 2) + ' dBTP', n.truePeakDb <= -2 + 0.005);
  add('Loudness', 'Loudness range', '5 to 12 LU', f(n.lra, 1) + ' LU', n.lra >= 5 && n.lra <= 12);
  add('Warm tilt', 'Spectrum, 200 Hz to 8 kHz (spectral density)', 'falls 4.5 to 6.5 dB per octave', (fall >= 0 ? 'falls ' : 'rises ') + f(Math.abs(fall), 2) + ' dB per octave', fall >= 4.5 && fall <= 6.5);
  add('Warm tilt', 'the same line through third-octave band levels', 'information: 3 dB per octave shallower by construction', (t.slopeBandsDbPerOct <= 0 ? 'falls ' : 'rises ') + f(Math.abs(t.slopeBandsDbPerOct), 2) + ' dB per octave', null);
  add('Warm tilt', 'Energy above 8 kHz', 'at least 30 dB below the total', f(t.bands.air, 1) + ' dB', t.bands.air <= -30);
  add('Warm tilt', 'The 2 to 5 kHz band', 'at least 14 dB below the total', f(t.bands.presence, 1) + ' dB', t.bands.presence <= -14);
  const rel = (name) => (stems && stems[name] && stems.bass ? stems[name].trioDb - stems.bass.trioDb : NaN);
  if (stems && stems.bass && stems.keys) { const v = rel('keys'); add('Balance', 'Keys relative to bass, 30 to 36 s', '-10 to -3 dB', signed(v, 1) + ' dB', v >= -10 && v <= -3); }
  else { add('Balance', 'Keys relative to bass, 30 to 36 s', '-10 to -3 dB', need, null); }
  if (stems && stems.bass && stems.drums) { const v = rel('drums'); add('Balance', 'Drums relative to bass, 30 to 36 s', '-16 to -8 dB', signed(v, 1) + ' dB', v >= -16 && v <= -8); }
  else { add('Balance', 'Drums relative to bass, 30 to 36 s', '-16 to -8 dB', need, null); }
  add('Translation', 'Mono: the L+R sum loses', 'less than 1.5 dB', f(n.stereo.monoLossDb, 2) + ' dB', n.stereo.monoLossDb < 1.5);
  let worst = null;
  for (const [key, label] of BANDS) { const s = t.stereo[key]; if (s.shareDb >= -40 && Number.isFinite(s.monoLossDb) && (!worst || s.monoLossDb > worst.loss)) { worst = { loss: s.monoLossDb, label }; } }
  add('Translation', 'Mono: nothing cancels (the band that loses most)', 'under 3 dB in every band', worst ? f(worst.loss, 2) + ' dB (' + worst.label + ')' : 'n/a', worst ? worst.loss < 3 : false);
  add('Translation', 'Low end centred (L/R correlation, 20 to 150 Hz)', 'at least 0.90', f(t.lowEnd.correlation, 3), t.lowEnd.correlation >= 0.9);
  if (stems && stems.bass) { const v = stems.bass.above150Share; add('Translation', 'Small speakers: the bass stem\'s energy above 150 Hz', 'at least 25 percent', f(100 * v, 0) + ' percent', v >= 0.25); }
  else { add('Translation', 'Small speakers: the bass stem\'s energy above 150 Hz', 'at least 25 percent', need, null); }
  add('Translation', 'Nothing vital below 50 Hz (the energy there)', 'at least 10 dB below the total', f(t.below50Db, 1) + ' dB', t.below50Db <= -10);
  add('Clean', 'Clicks (isolated discontinuities)', '0', String(n.clickCount) + (n.clickCount ? ' (first at ' + n.clicks.slice(0, 3).map((k) => k.t.toFixed(3) + ' s').join(', ') + ')' : ''), n.clickCount === 0);
  add('Clean', 'DC offset', 'within 0.0001', 'L ' + n.dc[0].toExponential(1) + ', R ' + n.dc[1].toExponential(1), Math.abs(n.dc[0]) <= 1e-4 && Math.abs(n.dc[1]) <= 1e-4);
  add('Clean', 'Clipping', '0 samples', n.clipped + ' samples (sample peak ' + f(n.samplePeakDb, 2) + ' dBFS)', n.clipped === 0);
  add('Room tone', 'The held breath, 20.3 to 22.0 s', 'below -60 dBFS RMS', f(n.breathDb, 1) + ' dBFS', n.breathDb < -60);
  add('Room tone', 'Never digital silence (the quietest 100 ms)', 'above -80 dBFS RMS', f(n.quietestDb, 1) + ' dBFS at ' + f(n.quietestAt, 1) + ' s', n.quietestDb > -80);
  add('Room and stage', 'Room: 0.6 to 0.9 s decay, dark', 'set in the build', 'not measurable from a mix: see mix.room({ decay }) in build.js', null);
  const stage = (name, label, wanted, test) => {
    if (stems && stems[name]) { const v = stems[name].balanceDb; add('Room and stage', label, wanted, 'left minus right ' + signed(v, 2) + ' dB', test(v)); }
    else { add('Room and stage', label, wanted, need, null); }
  };
  stage('bass', 'Stage: bass centre', 'left and right within 0.5 dB', (v) => Math.abs(v) <= 0.5);
  stage('keys', 'Stage: keys slightly left', 'left louder, by under 6 dB', (v) => v > 0.1 && v < 6);
  stage('drums', 'Stage: drums slightly right', 'right louder, by under 6 dB', (v) => v < -0.1 && v > -6);
  const wantThud = '45 to 60 Hz, starts ' + THUD_START + 'x higher or more, 100-200 Hz at least ' + THUD_BODY_DB + ' dB, above 3 kHz at most ' + THUD_ABOVE_3K_DB + ' dB';
  if (thuds && thuds.length) {
    for (const th of thuds) {
      add('The NO thuds', 'Thud at ' + th.t + ' s (' + th.name + '), on fx.wav', wantThud,
        f(th.fundamentalHz, 1) + ' Hz, starts ' + f(th.startRatio, 2) + 'x higher, 100-200 Hz ' + f(th.bodyDb, 1) + ' dB, above 3 kHz ' + f(th.above3kDb, 1) + ' dB',
        th.fundamentalHz >= 45 && th.fundamentalHz <= 60 && th.startRatio >= THUD_START && th.bodyDb >= THUD_BODY_DB && th.above3kDb <= THUD_ABOVE_3K_DB);
    }
  } else { add('The NO thuds', 'The three thuds, on fx.wav', wantThud, need + ' (fx.wav)', null); }
  return rows;
}

/* ------------------------------------------------------------------ pictures (ffmpeg) */

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y'].concat(args), { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.error) { throw new Error('analyze: ffmpeg could not run: ' + r.error.message); }
  if (r.status !== 0) { throw new Error('analyze: ffmpeg failed: ' + String(r.stderr).trim().slice(-500)); }
}
function spectrogram(file, png, from, to) {
  // Drawn by spectro.py (numpy and Pillow), not by ffmpeg: showspectrumpic with a log frequency
  // scale and start/stop (ffmpeg 6.1) draws the picture mirrored about a line near 520 Hz.
  // In these pictures the time axis shows the film's own seconds.
  const t0 = from === undefined ? 0 : from;
  const t1 = to === undefined ? (wav.info(file).frames / wav.info(file).sr) : to;
  const r = spawnSync('python3', [path.join(__dirname, 'spectro.py'), file, png, String(t0), String(t1), path.basename(file)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.error) { throw new Error('analyze: python3 could not run: ' + r.error.message); }
  if (r.status !== 0) { throw new Error('analyze: spectro.py failed: ' + String(r.stderr).trim().slice(-500)); }
}
function waveform(file, png, seconds, marks) {
  const pps = 35, w = Math.round(seconds * pps), h = 480;
  const font = fs.existsSync(FONT) ? FONT : null;
  let chain = '[0:a]aformat=channel_layouts=stereo,showwavespic=s=' + w + 'x' + h + ':split_channels=1:colors=0x6fb3ff|0xffb36f:scale=lin:draw=full:filter=peak[w];' +
    'color=c=0x12161c:s=' + w + 'x' + h + '[bg];[bg][w]overlay=format=auto,drawgrid=w=' + (2 * pps) + ':h=' + (h / 2) + ':t=1:c=white@0.18';
  for (const m of marks) { chain += ',drawbox=x=' + Math.round(m.t * pps) + ':y=0:w=1:h=ih:c=0xffe14d@0.9:t=fill'; }
  if (font) {
    for (let s = 0; s < seconds; s += 4) { chain += ',drawtext=fontfile=' + font + ':text=\'' + s + ' s\':x=' + (s * pps + 3) + ':y=h-15:fontsize=12:fontcolor=white@0.8'; }
    for (const m of marks) { chain += ',drawtext=fontfile=' + font + ':text=\'' + String(m.name).replace(/[^A-Za-z0-9 .]/g, '') + '\':x=' + (Math.round(m.t * pps) + 4) + ':y=4:fontsize=12:fontcolor=0xffe14d'; }
    chain += ',drawtext=fontfile=' + font + ':text=\'L\':x=3:y=' + (h / 4 - 6) + ':fontsize=12:fontcolor=white@0.8,drawtext=fontfile=' + font + ':text=\'R\':x=3:y=' + (3 * h / 4 - 6) + ':fontsize=12:fontcolor=white@0.8';
  }
  ffmpeg(['-i', file, '-filter_complex', chain, '-frames:v', '1', png]);
}

/* ------------------------------------------------------------------ numbers.md */

function table(headers, rows) {
  return ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|'].concat(rows.map((r) => '| ' + r.join(' | ') + ' |')).join('\n');
}

function markdown(R) {
  const n = R.final, r = R.ref;
  const L = [];
  const name = (p) => path.basename(p);
  L.push('# Analysis: ' + path.relative(process.cwd(), n.file));
  L.push('');
  L.push('Made by `tools/score/lib/analyze.js`. ' + f(n.seconds, 3) + ' s, ' + n.format.sr + ' Hz, ' + n.format.channelCount + ' channels, ' + n.format.bits + '-bit ' + (n.format.float ? 'float' : 'PCM') + ', ' + n.format.frames + ' samples a channel.' +
    (r ? ' Reference: `' + path.relative(process.cwd(), r.file) + '`.' : '') + (R.stemsDir ? ' Stems: `' + path.relative(process.cwd(), R.stemsDir) + '`.' : ''));
  L.push('');
  const done = R.targets.filter((t) => t.pass !== null), bad = done.filter((t) => !t.pass);
  L.push('**' + (done.length - bad.length) + ' of ' + done.length + ' measured targets pass' + (bad.length ? '; FAIL: ' + bad.map((t) => t.name).join('; ') : '') + '.** ' +
    (R.targets.length - done.length) + ' not measured (they say why).');
  L.push('');
  L.push('## The targets of BRIEF.md section 4.3');
  L.push('');
  L.push(table(['', 'target', 'wanted', 'measured', ''].concat(r ? ['reference'] : []),
    R.targets.map((t) => {
      const same = r ? R.refTargets.find((x) => x.name === t.name) : null;
      return [t.group, t.name, t.wanted, t.measured, t.pass === null ? '-' : (t.pass ? 'PASS' : '**FAIL**')].concat(r ? [same && same.pass !== null ? same.measured : ''] : []);
    })));
  L.push('');
  L.push('Nobody has heard this file. PASS means the number is inside the brief\'s range, nothing more. The tilt has two readings and the brief does not say which it means: the kit judges the spectral density (the usual analyser view: pink noise falls 3 dB per octave, brown noise 6) and prints the third-octave band-level reading under it, which is 3 dB per octave shallower for the same sound. Where the brief gives no number the kit chose one and the row says what it is: "nothing cancels" is read as no band losing 3 dB or more in mono (3 dB is left and right unrelated; more is cancelling), "low end centred" as a left/right correlation of 0.90 or more under 150 Hz, "nothing vital below 50 Hz" as less than a tenth of the energy there, the stage as which side of a stem is louder, and the thud as the four numbers in its row.');
  L.push('');
  L.push('## Also checked (BRIEF.md sections 2, 3 and 5)');
  L.push('');
  const also = [];
  also.push(['Length', n.format.frames + ' samples', String(N), n.format.frames === N ? 'PASS' : '**FAIL**']);
  also.push(['Format', n.format.sr + ' Hz, ' + n.format.channelCount + ' ch, ' + n.format.bits + '-bit ' + (n.format.float ? 'float' : 'PCM'), '48000 Hz, 2 ch, 24-bit PCM', n.format.sr === SR && n.format.channelCount === 2 && n.format.bits === 24 && !n.format.float ? 'PASS' : '**FAIL**']);
  for (const s of n.sync) {
    also.push(['HARD sync: ' + s.name + ' at ' + s.t + ' s', s.found ? 'onset ' + signed(s.offsetMs, 1) + ' ms (rise ' + f(s.riseDb, 1) + ' dB)' : 'no onset within 60 ms', 'within 10 ms, on a whole frame', s.found && Math.abs(s.offsetMs) <= 10 && s.onFrame ? 'PASS' : '**FAIL**']);
  }
  also.push(['Tail, 45.9 s to the end', f(n.tailDb, 1) + ' dBFS RMS', 'below -60', n.tailDb < -60 ? 'PASS' : '**FAIL**']);
  also.push(['Loop seam (first and last sample)', n.seam.toExponential(1), 'under 0.003', n.seam < 0.003 ? 'PASS' : '**FAIL**']);
  L.push(table(['check', 'measured', 'wanted', ''], also));
  L.push('');
  L.push('An onset is the first sample, within 60 ms of the time, where 2 ms of sound is more than 12 dB above the 40 ms before it.');
  L.push('');
  L.push('## Loudness and level');
  L.push('');
  const two = (label, get, unit) => [label, get(n) + (unit || '')].concat(r ? [get(r) + (unit || '')] : []);
  L.push(table(['', name(n.file)].concat(r ? [name(r.file) + ' (reference)'] : []), [
    two('Integrated loudness (kit)', (x) => f(x.lufs, 2), ' LUFS'),
    two('Integrated loudness (ffmpeg ebur128)', (x) => f(x.ffmpeg.lufs, 2), ' LUFS'),
    two('Loudness range (kit / ffmpeg)', (x) => f(x.lra, 1) + ' / ' + f(x.ffmpeg.lra, 1), ' LU'),
    two('True peak (kit / ffmpeg)', (x) => f(x.truePeakDb, 2) + ' / ' + f(x.ffmpeg.truePeakDb, 2), ' dBTP'),
    two('Sample peak', (x) => f(x.samplePeakDb, 2), ' dBFS'),
    two('RMS', (x) => f(x.rmsDb, 1), ' dBFS'),
    two('Crest factor (sample peak over RMS)', (x) => f(x.crestDb, 1), ' dB'),
    two('Loudest 400 ms (momentary)', (x) => f(x.momentaryMax, 1), ' LUFS'),
    two('Loudest 3 s (short-term)', (x) => f(x.shortTermMax, 1), ' LUFS')
  ]));
  L.push('');
  L.push('## Spectrum');
  L.push('');
  L.push('Band energies in dB relative to the whole (long-term average, both channels).');
  L.push('');
  L.push(table(['band', name(n.file)].concat(r ? ['reference'] : []),
    BANDS.map(([key, label]) => [label, f(n.tone.bands[key], 1)].concat(r ? [f(r.tone.bands[key], 1)] : [])).concat([
      two('under 50 Hz', (x) => f(x.tone.below50Db, 1)),
      two('tilt 200 Hz to 8 kHz, spectral density (dB per octave)', (x) => f(x.tone.slopeDbPerOct, 2)),
      two('the same line through third-octave band levels', (x) => f(x.tone.slopeBandsDbPerOct, 2)),
      two('spectral centroid (Hz)', (x) => f(x.tone.centroidHz, 0))
    ])));
  L.push('');
  L.push('The tilt is a straight line fitted through the power spectral density at the 17 third-octave centres from 200 Hz to 8 kHz. Pink noise reads -3, brown noise -6. The brief wants -4.5 to -6.5.');
  L.push('');
  L.push('Third-octave levels, dB relative to the whole:');
  L.push('');
  L.push(table(['Hz'].concat(n.tone.thirdOctave.centres.map(String)), [[name(n.file)].concat(n.tone.thirdOctave.db.map((v) => f(v, 1)))].concat(r ? [['reference'].concat(r.tone.thirdOctave.db.map((v) => f(v, 1)))] : [])));
  L.push('');
  L.push('## Stereo and translation');
  L.push('');
  L.push(table(['', name(n.file)].concat(r ? ['reference'] : []), [
    two('Left/right correlation (1 = mono, 0 = unrelated, below 0 = cancelling)', (x) => f(x.stereo.correlation, 3)),
    two('Balance, left minus right', (x) => signed(x.stereo.balanceDb, 2), ' dB'),
    two('Mono fold-down loses', (x) => f(x.stereo.monoLossDb, 2), ' dB'),
    two('Low end, 20 to 150 Hz: correlation', (x) => f(x.tone.lowEnd.correlation, 3)),
    two('Small speakers: level left after a 150 Hz high-pass', (x) => f(x.smallSpeaker.keptDb, 1), ' dB'),
    two('Small speakers: loudness after the high-pass', (x) => f(x.smallSpeaker.lufsAfter, 1) + ' LUFS (' + signed(x.smallSpeaker.lufsAfter - x.lufs, 1) + ' LU)')
  ]));
  L.push('');
  L.push('Mono, band by band (correlation / what the mono sum loses in dB):');
  L.push('');
  L.push(table(['band', 'correlation', 'mono loss dB'], BANDS.map(([key, label]) => [label, f(n.tone.stereo[key].correlation, 2), f(n.tone.stereo[key].monoLossDb, 2)])));
  L.push('');
  L.push('## Bar by bar');
  L.push('');
  L.push('A bar is 2 s. RMS in dBFS and the spectral centroid of each bar: the shape of the piece (BRIEF.md section 3).');
  L.push('');
  L.push(table(['bar', 'from s', 'RMS dBFS', 'centroid Hz'].concat(r ? ['reference RMS', 'reference centroid'] : []),
    n.bars.map((b, i) => [String(b.bar), String(b.from), f(b.rmsDb, 1), f(b.centroidHz, 0)].concat(r ? [r.bars[i] ? f(r.bars[i].rmsDb, 1) : '', r.bars[i] ? f(r.bars[i].centroidHz, 0) : ''] : []))));
  L.push('');
  if (R.stems) {
    const names = Object.keys(R.stems), bass = R.stems.bass;
    L.push('## Stems');
    L.push('');
    L.push('Each stem as it sits in the mix before the master bus. "re bass" is the stem\'s RMS minus the bass stem\'s.');
    L.push('');
    L.push(table(['stem', 'RMS dBFS', 're bass', 'RMS 30-36 s', 're bass 30-36 s', 'peak dBFS', 'left minus right dB', 'L/R correlation', 'centroid Hz', 'energy above 150 Hz'],
      names.map((k) => { const s = R.stems[k]; return [k, f(s.rmsDb, 1), bass ? signed(s.rmsDb - bass.rmsDb, 1) : 'n/a', f(s.trioDb, 1), bass ? signed(s.trioDb - bass.trioDb, 1) : 'n/a', f(s.samplePeakDb, 1), signed(s.balanceDb, 2), f(s.correlation, 2), f(s.centroidHz, 0), f(100 * s.above150Share, 0) + ' %']; })));
    L.push('');
    L.push('Band energies of each stem, dB relative to that stem\'s own total:');
    L.push('');
    L.push(table(['stem'].concat(BANDS.map((b) => b[1])), names.map((k) => [k].concat(BANDS.map(([key]) => f(R.stems[k].bands[key], 1))))));
    L.push('');
    if (bass) {
      L.push('Small-speaker test: after a 150 Hz high-pass the bass stem keeps ' + f(100 * bass.above150Share, 0) + ' percent of its energy (' + f(db10(bass.above150Share), 1) + ' dB). The brief wants at least 25 percent; if it has less, add gentle harmonics with `dsp.saturate(bass, amount)`.');
      L.push('');
    }
    if (R.thuds && R.thuds.length) {
      L.push('The NO thuds, measured on `fx.wav` at the HARD times of `video/score.js`:');
      L.push('');
      L.push(table(['hit', 'peak dBFS', 'fundamental Hz', 'first 40 ms Hz', 'starts x higher', '100-200 Hz dB', 'above 3 kHz dB'],
        R.thuds.map((t) => [t.name + ' at ' + t.t + ' s', f(t.peakDb, 1), f(t.fundamentalHz, 1), f(t.startHz, 1), f(t.startRatio, 2), f(t.bodyDb, 1), f(t.above3kDb, 1)])));
      L.push('');
    }
  }
  if (R.pictures.length) {
    L.push('## Pictures');
    L.push('');
    for (const p of R.pictures) { L.push('- `' + p.file + '`: ' + p.what); }
    L.push('');
    L.push('Spectrograms: frequency runs up the left side on a log scale (20 Hz to 20 kHz), time along the bottom, colour is level over a 100 dB range. A warm mix is bright at the bottom and dark above 5 kHz; a harsh one glows between 2 and 8 kHz. A click is a thin vertical line from top to bottom.');
    L.push('');
  }
  return L.join('\n');
}

/* ------------------------------------------------------------------ run */

function run(file, opts) {
  const o = opts || {};
  if (typeof file !== 'string' || !file) { throw new Error('analyze.run: give the path of a WAV file'); }
  const started = Date.now();
  const abs = path.resolve(file);
  const outDir = path.resolve(o.outDir || path.join(path.dirname(abs), 'analysis'));
  fs.mkdirSync(outDir, { recursive: true });
  const timing = { file: 0, stems: 0, ref: 0, pictures: 0 };
  const clock = (key, fn) => { const t0 = Date.now(); const v = fn(); timing[key] += (Date.now() - t0) / 1000; return v; };
  const main = clock('file', () => measure(abs));
  const R = { file: abs, final: main.numbers, ref: null, stems: null, stemsDir: null, thuds: null, pictures: [], timing };

  if (o.stemsDir) {
    const dir = path.resolve(o.stemsDir);
    if (!fs.existsSync(dir)) { throw new Error('analyze.run: no such stems directory: ' + dir); }
    const order = ['bass', 'keys', 'drums', 'fx'];
    const found = fs.readdirSync(dir).filter((x) => /\.wav$/i.test(x)).map((x) => x.replace(/\.wav$/i, ''));
    found.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) || a.localeCompare(b));
    if (!found.length) { throw new Error('analyze.run: no .wav files in ' + dir); }
    R.stems = {}; R.stemsDir = dir;
    for (const k of found) {
      const s = clock('stems', () => measureStem(path.join(dir, k + '.wav')));
      R.stems[k] = s.numbers;
      if (k === 'fx') { R.thuds = main.numbers.sync.map((h) => Object.assign({ name: h.name }, thud(s.st, h.t))); }
    }
  }
  if (o.ref) {
    const refFile = path.resolve(o.ref);
    R.ref = clock('ref', () => measure(refFile).numbers);
    R.refTargets = targets(R.ref, null, null);
  }
  R.targets = targets(R.final, R.stems, R.thuds);

  if (o.pictures !== false) {
    const pic = (name, what, make) => { clock('pictures', () => make(path.join(outDir, name))); R.pictures.push({ file: name, what }); };
    pic('spectrogram.png', 'the whole piece', (p) => spectrogram(abs, p));
    for (const [a, b] of [[0, 12], [20, 32], [30, 46]]) {
      const tag = String(a).padStart(2, '0') + '-' + String(b).padStart(2, '0');
      pic('spectrogram-' + tag + 's.png', a + ' to ' + b + ' s', (p) => spectrogram(abs, p, a, Math.min(b, R.final.seconds)));
    }
    pic('waveform.png', 'left over right, a grid line every bar (2 s), the HARD hits marked', (p) => waveform(abs, p, Math.ceil(R.final.seconds), R.final.sync));
    if (R.ref) { pic('ref-spectrogram.png', 'the reference, whole piece', (p) => spectrogram(R.ref.file, p)); }
  }
  const done = R.targets.filter((t) => t.pass !== null);
  R.passed = done.filter((t) => t.pass).length; R.measured = done.length; R.ok = R.passed === R.measured;
  R.tookSeconds = (Date.now() - started) / 1000;
  fs.writeFileSync(path.join(outDir, 'numbers.md'), markdown(R) + '\n');
  fs.writeFileSync(path.join(outDir, 'numbers.json'), JSON.stringify(R, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 1) + '\n');
  R.outDir = outDir;
  if (!o.quiet) {
    console.log('analyze: ' + path.relative(process.cwd(), abs) + ' -> ' + path.relative(process.cwd(), outDir) + '/numbers.md (' + R.tookSeconds.toFixed(1) + ' s: the file ' +
      timing.file.toFixed(1) + ', stems ' + timing.stems.toFixed(1) + ', reference ' + timing.ref.toFixed(1) + ', pictures ' + timing.pictures.toFixed(1) + ')');
    for (const t of R.targets) { console.log('  ' + (t.pass === null ? '  - ' : (t.pass ? 'PASS' : 'FAIL')) + '  ' + t.name + ': ' + t.measured + '  (wanted ' + t.wanted + ')'); }
    console.log('  ' + R.passed + ' of ' + R.measured + ' measured targets pass');
  }
  return R;
}

module.exports = { run, measure, measureStem, tone, stereoNumbers, smallSpeaker, perBar, thud, ebur128, targets, BANDS };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const pos = [], o = {};
  const usage = 'Usage: node tools/score/lib/analyze.js final.wav --out analysis [--stems stems] [--ref other.wav] [--no-pictures]';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') { o.outDir = argv[++i]; }
    else if (argv[i] === '--stems') { o.stemsDir = argv[++i]; }
    else if (argv[i] === '--ref') { o.ref = argv[++i]; }
    else if (argv[i] === '--no-pictures') { o.pictures = false; }
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log(usage); process.exit(0); }
    else if (argv[i].startsWith('--')) { console.error('analyze: unknown option ' + argv[i] + '\n' + usage); process.exit(2); }
    else { pos.push(argv[i]); }
  }
  if (pos.length !== 1) { console.error(usage); process.exit(2); }
  try { run(pos[0], o); }
  catch (e) { console.error('analyze: ' + e.message); process.exit(1); }
}
