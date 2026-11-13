/*
 * tools/score/lib/dsp.js: small pure functions. No dependencies.
 *
 * Everything works IN PLACE and returns what it was given, unless noted.
 * A Stereo is [Float32Array, Float32Array] (left, right) at 48 kHz.
 *
 *   dsp.rng(seed)                         -> function returning 0..1 (the same sequence every run)
 *   dsp.stereo(n = N)                     -> a new silent Stereo
 *   dsp.copy(stereo)                      -> a new Stereo with the same samples
 *   dsp.biquad(buf, type, f0, q, gainDb)  one channel; lp, hp, bp, peak, lowshelf, highshelf
 *   dsp.eq(stereo, [{ type, f, q, db }])  both channels, the bands in order
 *   dsp.gain(stereo, db)
 *   dsp.fade(stereo, t0, t1, from, to)    a gain ramp between t0 and t1 seconds; nothing outside is touched
 *   dsp.rms(stereo, t0, t1)               -> linear RMS over both channels (dsp.rmsDb for dBFS)
 *   dsp.peak(stereo, t0, t1)              -> largest |sample|, linear
 *   dsp.saturate(stereo, amount)          gentle harmonics, 0 (none) to 1
 *   dsp.db(x), dsp.lin(db)                20*log10 and back
 *   dsp.fft(re, im), dsp.welch(channels, opts)   spectra, for the checks and the analysis
 *
 * rng and biquad are lifted from the modelled build (tools/score/modelled/build.js).
 */
'use strict';

const { SR, N } = require('./const.js');
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ basics */

function rng(seed) {             // mulberry32: the same "random" every run
  let a = (Number.isFinite(seed) ? seed : 1) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { return (r() + r() + r() + r() - 2) * 1.7320508; }   // about unit variance, from four uniforms

function db(x) { return x > 0 ? 20 * Math.log10(x) : -Infinity; }
function lin(d) { return Math.pow(10, d / 20); }

function isBuf(b) { return b instanceof Float32Array || b instanceof Float64Array; }
/* A Stereo, checked. A single buffer is accepted where a function says so and treated as one channel. */
function chans(x, who) {
  if (isBuf(x)) { return [x]; }
  if (Array.isArray(x) && x.length >= 1 && x.every(isBuf) && x.every((c) => c.length === x[0].length)) { return x; }
  throw new Error((who || 'dsp') + ': expected a Stereo ([Float32Array, Float32Array] of equal length)');
}
function stereo(n) {
  const len = n === undefined ? N : n;
  if (!Number.isInteger(len) || len < 0) { throw new Error('dsp.stereo: the length must be a whole number of samples, not ' + n); }
  return [new Float32Array(len), new Float32Array(len)];
}
function copy(st) { return chans(st, 'dsp.copy').map((c) => Float32Array.from(c)); }
function mono(st) {
  const c = chans(st, 'dsp.mono');
  if (c.length === 1) { return Float32Array.from(c[0]); }
  const out = new Float32Array(c[0].length);
  for (let i = 0; i < out.length; i++) { out[i] = 0.5 * (c[0][i] + c[1][i]); }
  return out;
}
/* Seconds to a sample range inside a buffer of length n. */
function span(n, t0, t1, who) {
  const a = t0 === undefined ? 0 : Math.round(t0 * SR), b = t1 === undefined ? n : Math.round(t1 * SR);
  if (!Number.isFinite(a) || !Number.isFinite(b)) { throw new Error(who + ': times must be numbers (seconds)'); }
  return [Math.max(0, Math.min(n, a)), Math.max(0, Math.min(n, b))];
}

/* ------------------------------------------------------------------ filters */

/* The RBJ coefficients, normalised: [b0, b1, b2, a1, a2]. */
function biquadCoeffs(type, f0, q, gainDb) {
  if (!(f0 > 0 && f0 < SR / 2)) { throw new Error('dsp.biquad: the frequency must be between 0 and ' + SR / 2 + ' Hz, not ' + f0); }
  const A = Math.pow(10, (gainDb || 0) / 40);
  const w = TAU * f0 / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * (q || 0.7071));
  const sA = 2 * Math.sqrt(A) * al;
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else if (type === 'lowshelf') {
    b0 = A * ((A + 1) - (A - 1) * cw + sA); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sA);
    a0 = (A + 1) + (A - 1) * cw + sA; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sA;
  } else if (type === 'highshelf') {
    b0 = A * ((A + 1) + (A - 1) * cw + sA); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sA);
    a0 = (A + 1) - (A - 1) * cw + sA; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sA;
  } else { throw new Error('dsp.biquad: unknown filter type "' + type + '" (lp, hp, bp, peak, lowshelf, highshelf)'); }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/* RBJ biquad, run in place over one channel (Float32Array or Float64Array). */
function biquad(buf, type, f0, q, gainDb) {
  if (!isBuf(buf)) { throw new Error('dsp.biquad: expected one channel (a Float32Array); use dsp.eq for a Stereo'); }
  const c = biquadCoeffs(type, f0, q, gainDb);
  const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

/* The filter's gain in dB at a frequency (for documentation and tests). */
function biquadGainDb(type, f0, q, gainDb, f) {
  const c = biquadCoeffs(type, f0, q, gainDb);
  const w = TAU * f / SR;
  const nr = c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w), ni = -(c[1] * Math.sin(w) + c[2] * Math.sin(2 * w));
  const dr = 1 + c[3] * Math.cos(w) + c[4] * Math.cos(2 * w), di = -(c[3] * Math.sin(w) + c[4] * Math.sin(2 * w));
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/* Several bands over every channel: [{ type, f, q, db }]. q defaults to 0.7071, db to 0. */
function eq(st, bands) {
  const c = chans(st, 'dsp.eq');
  if (!Array.isArray(bands)) { throw new Error('dsp.eq: the bands must be an array of { type, f, q, db }'); }
  for (const b of bands) {
    if (!b || typeof b.type !== 'string') { throw new Error('dsp.eq: every band needs a type and a frequency f'); }
    for (const ch of c) { biquad(ch, b.type, b.f, b.q, b.db); }
  }
  return st;
}

/* A Butterworth high-pass or low-pass of an even order (2, 4, 6, 8), as cascaded biquads. */
function butter(st, type, f, order) {
  const c = chans(st, 'dsp.butter');
  const ord = order || 4;
  if (type !== 'hp' && type !== 'lp') { throw new Error('dsp.butter: type must be hp or lp'); }
  if (ord % 2 || ord < 2 || ord > 8) { throw new Error('dsp.butter: the order must be 2, 4, 6 or 8'); }
  for (let k = 0; k < ord / 2; k++) {
    const q = 1 / (2 * Math.cos(Math.PI * (2 * k + 1) / (2 * ord)));
    for (const ch of c) { biquad(ch, type, f, q); }
  }
  return st;
}

/* ------------------------------------------------------------------ level */

function gain(st, d) {
  if (!Number.isFinite(d) && d !== -Infinity) { throw new Error('dsp.gain: the gain must be a number of dB'); }
  const g = lin(d);
  for (const ch of chans(st, 'dsp.gain')) { for (let i = 0; i < ch.length; i++) { ch[i] *= g; } }
  return st;
}

/*
 * A gain ramp: `from` at t0 to `to` at t1 (linear gains, 1 = unchanged), along a
 * raised cosine so there is no corner at either end. Only the samples between
 * t0 and t1 are touched: fade(st, 45.7, 46, 1, 0) is a fade-out at the end,
 * fade(st, 0, 0.005, 0, 1) a fade-in at the start, fade(st, 9, 10, 0.5, 0.5)
 * halves one second.
 */
function fade(st, t0, t1, from, to) {
  if (![t0, t1, from, to].every(Number.isFinite)) { throw new Error('dsp.fade: needs (stereo, t0, t1, from, to) as numbers'); }
  if (t1 < t0) { throw new Error('dsp.fade: t1 (' + t1 + ') is before t0 (' + t0 + ')'); }
  const c = chans(st, 'dsp.fade');
  const s0 = Math.round(t0 * SR), s1 = Math.round(t1 * SR), len = s1 - s0;
  for (const ch of c) {
    for (let i = Math.max(0, s0); i < Math.min(ch.length, s1); i++) {
      const u = (i - s0) / len;
      ch[i] *= from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
  }
  return st;
}

/* Linear RMS over every channel between t0 and t1 seconds (default: all of it). */
function rms(st, t0, t1) {
  const c = chans(st, 'dsp.rms');
  const [a, b] = span(c[0].length, t0, t1, 'dsp.rms');
  let s = 0;
  for (const ch of c) { for (let i = a; i < b; i++) { s += ch[i] * ch[i]; } }
  return b > a ? Math.sqrt(s / ((b - a) * c.length)) : 0;
}
function rmsDb(st, t0, t1) { return db(rms(st, t0, t1)); }

function peak(st, t0, t1) {
  const c = chans(st, 'dsp.peak');
  const [a, b] = span(c[0].length, t0, t1, 'dsp.peak');
  let p = 0;
  for (const ch of c) { for (let i = a; i < b; i++) { const v = Math.abs(ch[i]); if (v > p) { p = v; } } }
  return p;
}

/*
 * Gentle harmonics, for a bass that has to survive small speakers. amount 0
 * leaves the sound exactly as it is; 1 is the thickest this goes.
 *
 * What it does: a soft, slightly lopsided curve (tanh with a small bias)
 * turns part of each note into its second and third harmonics. Small signals
 * pass at unity gain; only the loud part of a note is rounded, so a note's
 * attack carries more harmonics than its tail, as an overdriven string or
 * tube does. The added part alone goes through a 20 Hz high-pass (the bias
 * makes a little DC), so the original keeps its phase. "Loud" is measured
 * against opts.ref (a linear level); by default that is the buffer's own
 * peak, so the amount means the same whatever gain the stem is at.
 * It lowers peaks a little (about 2 dB at 0.3) and changes loudness slightly:
 * set levels after it, not before.
 */
function saturate(st, amount, opts) {
  if (!(amount >= 0 && amount <= 1)) { throw new Error('dsp.saturate: the amount must be between 0 and 1, not ' + amount); }
  const c = chans(st, 'dsp.saturate');
  const ref = opts && opts.ref !== undefined ? opts.ref : peak(c);
  if (!(ref > 0) || amount === 0) { return st; }
  const K = 2.5, B = 0.12;
  const t0 = Math.tanh(K * B), slope = K * (1 - t0 * t0);
  for (const ch of c) {
    const add = new Float64Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const u = ch[i] / ref;
      add[i] = (Math.tanh(K * (u + B)) - t0) / slope - u;        // what the curve adds to the signal
    }
    biquad(add, 'hp', 20, 0.7071);
    for (let i = 0; i < ch.length; i++) { ch[i] += amount * add[i] * ref; }
  }
  return st;
}

/* ------------------------------------------------------------------ spectra */

const TWIDDLES = new Map();
function twiddles(n) {
  let t = TWIDDLES.get(n);
  if (!t) {
    t = { cos: new Float64Array(n / 2), sin: new Float64Array(n / 2), rev: new Uint32Array(n) };
    for (let i = 0; i < n / 2; i++) { t.cos[i] = Math.cos(TAU * i / n); t.sin[i] = Math.sin(TAU * i / n); }
    const bits = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) { r |= ((i >>> b) & 1) << (bits - 1 - b); }
      t.rev[i] = r >>> 0;
    }
    TWIDDLES.set(n, t);
  }
  return t;
}

/* In-place radix-2 FFT of re + i*im (Float64Arrays, length a power of two). */
function fft(re, im) {
  const n = re.length;
  if (n < 2 || (n & (n - 1)) || im.length !== n) { throw new Error('dsp.fft: needs two arrays of the same power-of-two length'); }
  const t = twiddles(n);
  for (let i = 0; i < n; i++) {
    const j = t.rev[i];
    if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let s = 0; s < n; s += size) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const wr = t.cos[w], wi = -t.sin[w];
        const a = s + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

/*
 * Welch's averaged power spectrum (Hann window, 50 percent overlap by default).
 *   channels: a Stereo or one buffer.  opts: { size: 16384, hop, from, to } (from and to in seconds)
 * -> { df, size, frames, power: [Float64Array per channel], cross: { re, im } for a Stereo }
 * power[c][k] is the mean-square level in bin k (frequency k * df), scaled so
 * the bins add up to the mean square of the signal. Divide by df for a
 * density per Hz. cross is the left-right cross spectrum on the same scale.
 */
function welch(st, opts) {
  const c = chans(st, 'dsp.welch');
  const o = opts || {};
  const size = o.size || 16384, hop = o.hop || size / 2;
  if (size & (size - 1)) { throw new Error('dsp.welch: the size must be a power of two'); }
  const [a, b] = span(c[0].length, o.from, o.to, 'dsp.welch');
  const half = size / 2;
  const win = new Float64Array(size);
  let w2 = 0;
  for (let i = 0; i < size; i++) { win[i] = 0.5 - 0.5 * Math.cos(TAU * i / size); w2 += win[i] * win[i]; }
  const power = c.map(() => new Float64Array(half + 1));
  const cross = c.length === 2 ? { re: new Float64Array(half + 1), im: new Float64Array(half + 1) } : null;
  const re = c.map(() => new Float64Array(size)), im = c.map(() => new Float64Array(size));
  let frames = 0;
  // a stretch shorter than one window is zero-padded into a single frame
  const last = Math.max(a, b - size);
  for (let s = a; s <= last; s += hop) {
    for (let ch = 0; ch < c.length; ch++) {
      const x = c[ch], r = re[ch], m = im[ch];
      for (let i = 0; i < size; i++) { r[i] = s + i < b ? x[s + i] * win[i] : 0; m[i] = 0; }
      fft(r, m);
      const p = power[ch];
      for (let k = 0; k <= half; k++) { p[k] += r[k] * r[k] + m[k] * m[k]; }
    }
    if (cross) {
      for (let k = 0; k <= half; k++) {
        cross.re[k] += re[0][k] * re[1][k] + im[0][k] * im[1][k];
        cross.im[k] += im[0][k] * re[1][k] - re[0][k] * im[1][k];
      }
    }
    frames++;
  }
  const norm = 1 / (Math.max(1, frames) * size * w2);
  const scale = (p) => { for (let k = 0; k <= half; k++) { p[k] *= norm * (k === 0 || k === half ? 1 : 2); } };
  power.forEach(scale);
  if (cross) { scale(cross.re); scale(cross.im); }
  return { df: SR / size, size, frames, power, cross };
}

/* The power between two frequencies in one welch() power array (bins interpolated at the edges). */
function bandPower(p, df, f0, f1) {
  const lo = Math.max(0, f0) / df, hi = Math.min((p.length - 1) * df, f1) / df;
  let s = 0;
  for (let k = Math.max(0, Math.floor(lo - 0.5)); k <= Math.min(p.length - 1, Math.ceil(hi + 0.5)); k++) {
    const a = Math.max(lo, k - 0.5), b = Math.min(hi, k + 0.5);       // bin k covers k-0.5 .. k+0.5
    if (b > a) { s += p[k] * (b - a); }
  }
  return s;
}

module.exports = {
  rng, gauss, db, lin, stereo, copy, mono,
  biquad, biquadCoeffs, biquadGainDb, eq, butter,
  gain, fade, rms, rmsDb, peak, saturate,
  fft, welch, bandPower
};
