/*
 * tools/score/lib/mix.js: the mix bus. Summing, the room, the master, the meters.
 *
 *   mix.add(dest, src, { db: 0, pan: 0, at: 0 })      sum src into dest (in place)
 *   mix.room(send, { decay: 0.8, damp: 0.5, predelay: 0.012, seed: 1 })   -> Stereo, wet only
 *   mix.master(stereo, { hp: 30, shelf: { f: 8000, db: -3 }, comp: { threshold: -18, ratio: 2 }, lufs: -16, ceilingDb: -2 })
 *                                                      -> a new Stereo, with .info
 *   mix.lufs(stereo), mix.lra(stereo), mix.truePeakDb(stereo)   BS.1770-4 / EBU R128 meters
 *   mix.loudness(stereo)                               -> all the loudness numbers in one pass
 *
 * The K-weighting and gating, the compressor, the Hadamard feedback-delay-network
 * room and the idea of the limiter are lifted from the modelled build
 * (tools/score/modelled/build.js). What changed, and why, is in README-mix.md.
 */
'use strict';

const { SR } = require('./const.js');
const dsp = require('./dsp.js');
const TAU = Math.PI * 2;

function isBuf(b) { return b instanceof Float32Array || b instanceof Float64Array; }
function needStereo(st, who) {
  if (!Array.isArray(st) || st.length !== 2 || !isBuf(st[0]) || !isBuf(st[1]) || st[0].length !== st[1].length) {
    throw new Error(who + ': expected a Stereo ([Float32Array, Float32Array] of equal length)');
  }
  return st;
}
function num(v, lo, hi, what) {
  if (!Number.isFinite(v) || v < lo || v > hi) { throw new Error(what + ' must be a number from ' + lo + ' to ' + hi + ', not ' + v); }
  return v;
}

/* ================================================================== summing */

/*
 * Sum src into dest, in place. src is a Stereo or one mono buffer.
 *   db:  gain in dB.
 *   pan: -1 (left) to 1 (right), constant power, centre = unity on both sides
 *        (the modelled build's law). A mono source is placed; a stereo source is
 *        balanced (its left channel gets the left gain, its right the right).
 *   at:  where src starts in dest, in seconds (may be negative; what falls outside dest is dropped).
 */
function add(dest, src, opts) {
  needStereo(dest, 'mix.add (dest)');
  const o = opts || {};
  const gainDb = o.db === undefined ? 0 : o.db, pan = o.pan === undefined ? 0 : o.pan, at = o.at === undefined ? 0 : o.at;
  if (!Number.isFinite(gainDb) && gainDb !== -Infinity) { throw new Error('mix.add: db must be a number'); }
  num(pan, -1, 1, 'mix.add: pan');
  if (!Number.isFinite(at)) { throw new Error('mix.add: at must be a time in seconds'); }
  const mono = isBuf(src);
  if (!mono) { needStereo(src, 'mix.add (src)'); }
  const sl = mono ? src : src[0], sr = mono ? src : src[1];
  const g = dsp.lin(gainDb);
  const th = (pan + 1) * Math.PI / 4;
  const gl = Math.cos(th) * Math.SQRT2 * g, gr = Math.sin(th) * Math.SQRT2 * g;
  const s0 = Math.round(at * SR), n = dest[0].length;
  const from = Math.max(0, -s0), to = Math.min(sl.length, n - s0);
  const dl = dest[0], dr = dest[1];
  for (let i = from; i < to; i++) { dl[s0 + i] += sl[i] * gl; dr[s0 + i] += sr[i] * gr; }
  return dest;
}

/* ================================================================== loudness (BS.1770-4, EBU R128) */

/* K-weighting at 48 kHz: the BS.1770 pre-filter (a high shelf) then the RLB high-pass. */
function kWeighted(x) {
  const y = Float64Array.from(x);
  const run = (b, a) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = y[i];
      const o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
    }
  };
  run([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  run([1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  return y;
}

const HOP = Math.round(0.1 * SR);          // every block below starts on a 100 ms step, as ffmpeg's ebur128 does

/* The K-weighted mean square (left plus right) of each whole 100 ms step. */
function stepPowers(st) {
  const l = kWeighted(st[0]), r = kWeighted(st[1]);
  const steps = Math.floor(l.length / HOP);
  const p = new Float64Array(steps);
  for (let s = 0; s < steps; s++) {
    let a = 0;
    for (let i = s * HOP; i < (s + 1) * HOP; i++) { a += l[i] * l[i] + r[i] * r[i]; }
    p[s] = a / HOP;
  }
  return p;
}
/* Mean power of every block of `width` steps, one block per step (75 percent overlap for 400 ms blocks). */
function blocks(p, width) {
  const count = Math.max(0, p.length - width + 1);
  const z = new Float64Array(count);
  let a = 0;
  for (let s = 0; s < p.length; s++) {
    a += p[s];
    if (s >= width) { a -= p[s - width]; }
    if (s >= width - 1) { z[s - width + 1] = Math.max(a, 0) / width; }
  }
  return z;
}
function lk(power) { return power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity; }
function meanOf(list) { let s = 0; for (const v of list) { s += v; } return list.length ? s / list.length : 0; }

/*
 * Every loudness number in one pass:
 *   lufs           integrated loudness: 400 ms blocks, 75 percent overlap, absolute gate -70 LUFS, relative gate -10 LU
 *   lra            loudness range (EBU Tech 3342): 3 s blocks every 100 ms, gates -70 LUFS and -20 LU, 10th to 95th percentile
 *   lraLow, lraHigh, momentaryMax, shortTermMax, and the momentary and shortTerm series (one value per 100 ms)
 * A sound with nothing above the absolute gate has lufs = -Infinity and lra = 0.
 */
function loudness(st) {
  needStereo(st, 'mix.loudness');
  const p = stepPowers(st);
  const m = blocks(p, 4), s = blocks(p, 30);
  // integrated
  const abs = Array.from(m).filter((e) => lk(e) > -70);
  let integrated = -Infinity, threshold = -Infinity;
  if (abs.length) {
    threshold = lk(meanOf(abs)) - 10;
    const kept = abs.filter((e) => lk(e) > threshold);
    integrated = kept.length ? lk(meanOf(kept)) : -Infinity;
  }
  // range
  let lraLow = -Infinity, lraHigh = -Infinity, range = 0;
  const sabs = Array.from(s).filter((e) => lk(e) >= -70);
  if (sabs.length) {
    const rel = lk(meanOf(sabs)) - 20;
    const kept = sabs.map(lk).filter((v) => v >= rel).sort((a, b) => a - b);
    if (kept.length) {
      const at = (pc) => kept[Math.max(0, Math.min(kept.length - 1, Math.floor(pc * kept.length / 100 + 0.5) - 1))];
      lraLow = at(10); lraHigh = at(95); range = lraHigh - lraLow;
    }
  }
  const momentary = Float64Array.from(m, lk), shortTerm = Float64Array.from(s, lk);
  let mMax = -Infinity, sMax = -Infinity;
  for (const v of momentary) { if (v > mMax) { mMax = v; } }
  for (const v of shortTerm) { if (v > sMax) { sMax = v; } }
  return { lufs: integrated, threshold, lra: range, lraLow, lraHigh, momentaryMax: mMax, shortTermMax: sMax, momentary, shortTerm };
}
function lufs(st) { return loudness(st).lufs; }
function lra(st) { return loudness(st).lra; }

/* ================================================================== true peak (4x oversampled) */

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 60; k++) { term *= (x / (2 * k)) * (x / (2 * k)); sum += term; if (term < 1e-16 * sum) { break; } }
  return sum;
}
/*
 * The three in-between phases of a 4x interpolator: 32 taps a phase, a sinc under a
 * Kaiser window (beta 9), each phase scaled to unity gain. This is the filter
 * ffmpeg's ebur128 uses for its true peak (libswresample's default resampler,
 * 48 kHz to 192 kHz), so the two meters read the same: within 0.005 dB on the
 * film's files and on tones up to 19 kHz. They differ only at an abrupt start or
 * end at full level, where ffmpeg mirrors the signal and this treats what is
 * outside as silence.
 */
const TP_TAPS = 32, TP_CENTER = 15;
const TP_FIR = [1, 2, 3].map((ph) => {
  const h = new Float64Array(TP_TAPS);
  let norm = 0;
  for (let i = 0; i < TP_TAPS; i++) {
    const d = (i - TP_CENTER) - ph / 4, w = 2 * d / TP_TAPS;
    h[i] = Math.sin(Math.PI * d) / (Math.PI * d) * besselI0(9 * Math.sqrt(Math.max(1 - w * w, 0)));
    norm += h[i];
  }
  for (let i = 0; i < TP_TAPS; i++) { h[i] /= norm; }
  return h;
});
const TP_L1 = Math.max(...TP_FIR.map((h) => h.reduce((a, v) => a + Math.abs(v), 0)));   // no in-between value can exceed this times the samples around it
const TP_BLOCK = 64;

/* The largest of |x[n]| and the three interpolated values after it, for the samples of one block. */
function interpPeak(x, n) {
  let p = Math.abs(x[n]);
  const i0 = n - TP_CENTER;
  if (i0 >= 0 && i0 + TP_TAPS <= x.length) {
    for (let ph = 0; ph < 3; ph++) {
      const h = TP_FIR[ph];
      let s = 0;
      for (let i = 0; i < TP_TAPS; i++) { s += h[i] * x[i0 + i]; }
      if (s < 0) { s = -s; }
      if (s > p) { p = s; }
    }
  } else {
    for (let ph = 0; ph < 3; ph++) {
      const h = TP_FIR[ph];
      let s = 0;
      for (let i = 0; i < TP_TAPS; i++) { const j = i0 + i; if (j >= 0 && j < x.length) { s += h[i] * x[j]; } }
      if (s < 0) { s = -s; }
      if (s > p) { p = s; }
    }
  }
  return p;
}
function blockMaxima(x) {
  const nb = Math.ceil(x.length / TP_BLOCK);
  const bm = new Float32Array(nb + 2);                  // one empty block of padding at each end
  for (let b = 0; b < nb; b++) {
    let m = 0;
    for (let i = b * TP_BLOCK, e = Math.min(x.length, i + TP_BLOCK); i < e; i++) { const v = Math.abs(x[i]); if (v > m) { m = v; } }
    bm[b + 1] = m;
  }
  return bm;
}

/* The true peak of a Stereo (or one buffer), linear. Exact for the filter above: a block is skipped only when it cannot hold the peak. */
function truePeak(st) {
  const chs = isBuf(st) ? [st] : needStereo(st, 'mix.truePeakDb');
  let peak = 0;
  for (const x of chs) { for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > peak) { peak = v; } } }
  for (const x of chs) {
    const bm = blockMaxima(x);
    for (let b = 0; b < bm.length - 2; b++) {
      const local = Math.max(bm[b], bm[b + 1], bm[b + 2]);
      if (local * TP_L1 <= peak) { continue; }
      for (let n = b * TP_BLOCK, e = Math.min(x.length, n + TP_BLOCK); n < e; n++) {
        const p = interpPeak(x, n);
        if (p > peak) { peak = p; }
      }
    }
  }
  return peak;
}
function truePeakDb(st) { return dsp.db(truePeak(st)); }

/* ================================================================== the room */

function isPrime(n) {
  if (n < 2) { return false; }
  for (let d = 2; d * d <= n; d++) { if (n % d === 0) { return false; } }
  return true;
}
function primeNear(n, taken) {
  for (let k = 0; ; k++) {
    for (const c of [n + k, n - k]) { if (c > 2 && isPrime(c) && !taken.has(c)) { taken.add(c); return c; } }
  }
}

const ROOM = {
  lines: 32,                 // delay lines in the feedback network
  minMs: 21, maxMs: 79,      // their lengths, spread geometrically between these (1.4 s of delay in all)
  diffusers: [[23, 0.5], [37, 0.5], [53, 0.5], [71, 0.5]],         // input allpasses: samples, gain. Short on purpose (see README-mix.md)
  early: [[0.0071, 0.42, 0], [0.0113, 0.35, 1], [0.0167, 0.30, 0], [0.0229, 0.26, 1], [0.0293, 0.2, 0], [0.0371, 0.16, 1]],
  earlyGain: 0.7,              // early-to-late energy as in the modelled build (about +3 dB in the first 40 ms)
  width: 0.8,                // how much of the side pattern each output takes: L/R correlation of the tail about 0.2
  midHz: 700, shelfHz: 3000, topRatio: 0.25    // the decay is set at midHz; above shelfHz it shortens toward decay * topRatio^damp
};

/* The raw network: wet only, not yet level-calibrated. */
function roomCore(inL, inR, p) {
  const n = inL.length;
  const r = dsp.rng(p.seed * 7919 + 17);
  const K = p.lines;
  const pre = Math.round(p.predelay * SR);
  // delay lengths: all prime, a little different for every seed
  const taken = new Set();
  const len = new Int32Array(K);
  for (let k = 0; k < K; k++) {
    const ms = p.minMs * Math.pow(p.maxMs / p.minMs, K === 1 ? 0 : k / (K - 1)) * (1 + 0.05 * (r() - 0.5));
    len[k] = primeNear(Math.round(ms * 0.001 * SR), taken);
  }
  // Per line: a first-order high shelf (a cut) and a gain, so every line loses the same dB per
  // second at midHz (the requested decay) and, above the shelf, the damped decay. A shelf, not
  // the modelled build's one-pole low-pass: its curve keeps nearly the same shape whatever the
  // depth of the cut, so long and short lines agree at every frequency and no group of modes
  // outlasts its neighbours (which is what rings).
  const decayHi = p.decay * Math.pow(p.topRatio, p.damp);
  const wm = TAU * p.midHz / SR;
  const c = 2 * SR, wc = c * Math.tan(Math.PI * p.shelfHz / SR);
  const b0 = new Float64Array(K), b1 = new Float64Array(K), a1 = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    const gm = Math.pow(10, -3 * len[k] / (SR * p.decay)), gh = Math.pow(10, -3 * len[k] / (SR * decayHi));
    // H(s) = (G s + sqrt(G) wc) / (s + sqrt(G) wc), bilinear: unity at the bottom, G at the top, half way (in dB) at shelfHz
    const G = gh / gm, q = Math.sqrt(G) * wc;
    const f0 = (G * c + q) / (c + q), f1 = (q - G * c) / (c + q), f2 = (q - c) / (c + q);
    const nr = f0 + f1 * Math.cos(wm), ni = -f1 * Math.sin(wm), dr = 1 + f2 * Math.cos(wm), di = -f2 * Math.sin(wm);
    const g = Math.min(0.99995, gm / Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di)));   // the whole loop loses exactly gm at midHz
    b0[k] = g * f0; b1[k] = g * f1; a1[k] = f2;
  }
  const off = new Int32Array(K + 1);
  for (let k = 0; k < K; k++) { off[k + 1] = off[k] + len[k]; }
  const buf = new Float64Array(off[K]);
  const idx = new Int32Array(K);
  const x1 = new Float64Array(K), y1 = new Float64Array(K), s = new Float64Array(K);
  // Sign patterns for what goes in and what comes out. The modelled build fed equal gains into
  // every line, which a Hadamard matrix folds straight into one line; mixed signs spread the
  // sound over all of them. Mid (L+R) and side (L-R) have their own patterns, so a centred
  // source reaches every line and the two outputs differ without cancelling in mono.
  const sign = () => (r() < 0.5 ? -1 : 1);
  const inM = new Float64Array(K), inS = new Float64Array(K), outM = new Float64Array(K), outS = new Float64Array(K);
  const inGain = 0.5 * Math.sqrt(8 / K), outGain = 0.25 * Math.sqrt(8 / K);
  for (let k = 0; k < K; k++) { inM[k] = sign() * inGain; inS[k] = sign() * inGain * 0.6; outM[k] = sign() * outGain; outS[k] = sign() * outGain * p.width; }
  // input diffusion: allpasses in series, their lengths jittered by the seed; mid and side get their own
  const aps = [0, 1].map(() => p.diffusers.map(([v, gain]) => ({ b: new Float64Array(primeNear(Math.round(v * (1 + 0.1 * (r() - 0.5))), taken)), i: 0, g: gain })));
  function diffuse(chain, x) {
    for (let q = 0; q < chain.length; q++) {
      const ap = chain[q];
      const o = ap.b[ap.i], v = x + o * ap.g;
      ap.b[ap.i] = v;
      ap.i = ap.i + 1 === ap.b.length ? 0 : ap.i + 1;
      x = o - v * ap.g;
    }
    return x;
  }
  const er = p.early.map(([t, gain, side]) => [pre + Math.round(t * (1 + 0.04 * (r() - 0.5)) * SR), gain * 0.5 * p.earlyGain, side]);
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const norm = 1 / Math.sqrt(K);
  for (let t = 0; t < n; t++) {
    const j = t - pre;
    let xm = 0, xs = 0;
    if (j >= 0) { xm = diffuse(aps[0], 0.5 * (inL[j] + inR[j])); xs = diffuse(aps[1], 0.5 * (inL[j] - inR[j])); }
    let ym = 0, ys = 0;
    for (let k = 0; k < K; k++) {
      const o = buf[off[k] + idx[k]];
      const v = b0[k] * o + b1[k] * x1[k] - a1[k] * y1[k];
      x1[k] = o; y1[k] = v; s[k] = v;
      ym += outM[k] * v; ys += outS[k] * v;
    }
    // Hadamard, in place
    for (let h = 1; h < K; h <<= 1) {
      for (let q = 0; q < K; q += h << 1) {
        for (let b = q; b < q + h; b++) { const u = s[b], v = s[b + h]; s[b] = u + v; s[b + h] = u - v; }
      }
    }
    for (let k = 0; k < K; k++) {
      buf[off[k] + idx[k]] = s[k] * norm + inM[k] * xm + inS[k] * xs;
      idx[k] = idx[k] + 1 === len[k] ? 0 : idx[k] + 1;
    }
    let yl = ym + ys, yr = ym - ys;
    for (let e = 0; e < er.length; e++) {
      const q = t - er[e][0];
      if (q >= 0) { if (er[e][2]) { yr += inR[q] * er[e][1]; } else { yl += inL[q] * er[e][1]; } }
    }
    outL[t] = yl; outR[t] = yr;
  }
  // the wet is kept out of the low end (the bass stays dry and centred) and dark
  const lp = 5200 * Math.pow(2, (0.5 - p.damp) * 2);
  for (const o of [outL, outR]) { dsp.biquad(o, 'hp', 140, 0.7); dsp.biquad(o, 'lp', Math.min(lp, 20000), 0.6); }
  return [outL, outR];
}

function roomParams(opts) {
  const o = opts || {};
  const p = {
    decay: o.decay === undefined ? 0.8 : o.decay, damp: o.damp === undefined ? 0.5 : o.damp,
    predelay: o.predelay === undefined ? 0.012 : o.predelay, seed: o.seed === undefined ? 1 : o.seed
  };
  num(p.decay, 0.1, 5, 'mix.room: decay (seconds)');
  num(p.damp, 0, 1, 'mix.room: damp');
  num(p.predelay, 0, 0.25, 'mix.room: predelay (seconds)');
  if (!Number.isInteger(p.seed) || p.seed < 0) { throw new Error('mix.room: seed must be a whole number, 0 or more'); }
  return Object.assign({}, ROOM, o._internal || {}, p);
}

/* The level calibration: the gain that makes pink noise (100 Hz to 8 kHz) come back as loud as it went in. */
const ROOM_GAIN = new Map();
function roomGain(p) {
  const key = [p.decay, p.damp, p.predelay, p.seed, p.lines, p.minMs, p.maxMs, p.earlyGain, p.width, p.shelfHz, p.topRatio, JSON.stringify(p.diffusers)].join('|');
  if (ROOM_GAIN.has(key)) { return ROOM_GAIN.get(key); }
  const size = 1 << Math.ceil(Math.log2((p.predelay + p.decay * 1.6 + 0.3) * SR));
  const imp = new Float32Array(size);
  imp[0] = 1;
  const ir = roomCore(imp, imp, p);
  let num = 0, den = 0;
  const df = SR / size;
  const spec = ir.map((ch) => {
    const re = Float64Array.from(ch), im = new Float64Array(size);
    dsp.fft(re, im);
    return [re, im];
  });
  for (let k = Math.ceil(100 / df); k <= Math.floor(8000 / df); k++) {
    const w = 1 / k;                                    // pink: equal power per octave
    const pw = 0.5 * (spec[0][0][k] * spec[0][0][k] + spec[0][1][k] * spec[0][1][k] + spec[1][0][k] * spec[1][0][k] + spec[1][1][k] * spec[1][1][k]);
    num += w * pw; den += w;
  }
  const gain = 1 / Math.sqrt(num / den);
  ROOM_GAIN.set(key, gain);
  return gain;
}

/*
 * The small club: a 32-line feedback delay network (Hadamard), four short allpasses of input
 * diffusion on the mid and on the side, six early reflections, a first-order shelf in every
 * loop so the highs die sooner. WET ONLY: add it to the dry mix yourself.
 *
 *   send:     a Stereo: what goes to the room (each instrument at its send level)
 *   decay:    seconds for the tail to fall 60 dB, at mid frequencies (700 Hz). 0.6 to 0.9 is the small club.
 *   damp:     0 to 1: how dark. Above about 3 kHz the tail dies sooner, toward decay * 0.25^damp at the
 *             very top (measured at the default 0.5: 0.53 s in the 2.8 to 5.7 kHz band of a 0.8 s room),
 *             and the wet's low-pass moves from 10.4 kHz (0) through 5.2 kHz (0.5) to 2.6 kHz (1).
 *             Tested from 0.2 to 0.8; above 0.8 a short room comes close to ringing.
 *   predelay: seconds before the room answers.
 *   seed:     a whole number: another room of the same size (other delay lengths).
 *
 * Level: pink noise sent in comes back at the same RMS, so a send at -14 dB
 * puts sustained sound's reverb 14 dB under it. The wet has a 140 Hz high-pass:
 * the low end stays dry and centred. The output is as long as the send; a tail
 * that would run past the end is cut there.
 */
function room(send, opts) {
  needStereo(send, 'mix.room');
  const p = roomParams(opts);
  const wet = roomCore(send[0], send[1], p);
  const gain = roomGain(p);
  for (const ch of wet) { for (let i = 0; i < ch.length; i++) { ch[i] *= gain; } }
  return wet;
}

/* ================================================================== the master */

/* The soft-knee bus compressor of the modelled build: stereo linked, RMS detector (20 ms). In place. */
function compress(st, c) {
  const thr = c.threshold, ratio = c.ratio, knee = c.knee;
  const att = Math.exp(-1 / (c.attack * SR)), rel = Math.exp(-1 / (c.release * SR)), det = Math.exp(-1 / (0.02 * SR));
  const L = st[0], R = st[1], n = L.length, slope = 1 - 1 / ratio;
  let ms = 0, gr = 0, maxGr = 0, sumGr = 0;
  for (let i = 0; i < n; i++) {
    const x = 0.5 * (L[i] * L[i] + R[i] * R[i]);
    ms = det * ms + (1 - det) * x;
    const over = 10 * Math.log10(ms + 1e-12) - thr;
    let want = 0;
    if (over > knee / 2) { want = over * slope; }
    else if (over > -knee / 2) { want = slope * (over + knee / 2) * (over + knee / 2) / (2 * knee); }
    gr = want > gr ? att * gr + (1 - att) * want : rel * gr + (1 - rel) * want;
    if (gr > maxGr) { maxGr = gr; }
    sumGr += gr;
    if (gr > 1e-6) { const g = Math.pow(10, -gr / 20); L[i] *= g; R[i] *= g; }
  }
  return { maxReductionDb: maxGr, meanReductionDb: n ? sumGr / n : 0 };
}

/*
 * One pass of the look-ahead true-peak limiter, in place. For every sample it
 * works out the gain that would bring the 4x-oversampled peak there down to
 * the ceiling, takes the lowest such gain over the look-ahead that follows,
 * lets it recover exponentially (release), and smooths the result with two
 * running means that together span the look-ahead. So the gain glides down
 * before a peak, is exactly low enough when the peak arrives, and never steps.
 */
function limitPass(st, ceiling, lookS, releaseS) {
  const L = st[0], R = st[1], n = L.length;
  const need = new Float32Array(n).fill(1);
  let any = false;
  for (const x of st) {
    const bm = blockMaxima(x);
    for (let b = 0; b < bm.length - 2; b++) {
      if (Math.max(bm[b], bm[b + 1], bm[b + 2]) * TP_L1 <= ceiling) { continue; }
      for (let i = b * TP_BLOCK, e = Math.min(n, i + TP_BLOCK); i < e; i++) {
        const p = interpPeak(x, i);
        if (p > ceiling) {
          const v = ceiling / p;
          // an in-between peak belongs to the samples on both sides of it
          if (v < need[i]) { need[i] = v; }
          if (i + 1 < n && v < need[i + 1]) { need[i + 1] = v; }
          any = true;
        }
      }
    }
  }
  if (!any) { return { limitedSamples: 0, maxReductionDb: 0 }; }
  const look = Math.max(2, Math.round(lookS * SR));
  // the lowest need over [i, i + look]: a sliding minimum
  const m = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0, j = 0; i < n; i++) {
    for (; j < n && j <= i + look; j++) {
      while (tail > head && need[dq[tail - 1]] >= need[j]) { tail--; }
      dq[tail++] = j;
    }
    while (dq[head] < i) { head++; }
    m[i] = need[dq[head]];
  }
  // release: recover toward the target exponentially, never above it
  const rel = Math.exp(-1 / (releaseS * SR));
  let held = 1;
  for (let i = 0; i < n; i++) {
    held = m[i] < held ? m[i] : m[i] + (held - m[i]) * rel;
    m[i] = held;
  }
  // two running means, w1 + w2 - 1 = look samples in all
  const w1 = Math.ceil((look + 1) / 2), w2 = look + 1 - w1;
  const g = Float64Array.from(m);
  for (const w of [w1, w2]) {
    if (w < 2) { continue; }
    const src = Float64Array.from(g);
    let acc = w;                                          // before the start the gain is 1
    for (let i = 0; i < n; i++) {
      acc += src[i] - (i >= w ? src[i - w] : 1);
      g[i] = acc / w;
    }
  }
  let limited = 0, minG = 1;
  for (let i = 0; i < n; i++) {
    const v = g[i];
    if (v < 0.9995) { limited++; }
    if (v < minG) { minG = v; }
    L[i] *= v; R[i] *= v;
  }
  return { limitedSamples: limited, maxReductionDb: -dsp.db(minG) };
}

const MASTER_DEFAULTS = {
  hp: 30, shelf: { f: 8000, db: -3 }, lp: false,
  comp: { threshold: -18, ratio: 2, knee: 8, attack: 0.03, release: 0.3 },
  lufs: -16, ceilingDb: -2,
  limiter: { lookahead: 0.005, release: 0.15 }
};
const TP_MARGIN_DB = 0.05;       // the limiter aims this far under the ceiling, so another meter's rounding cannot read over it

/*
 * The master bus. Returns a NEW Stereo (the input is not touched) with an
 * .info property saying what it did. In this order:
 *
 *   1. high-pass at `hp` Hz, 24 dB an octave (Butterworth). hp: false skips it.
 *   2. the optional high shelf { f, db }. shelf: false skips it. (lp: Hz adds a 12 dB an octave low-pass; off by default.)
 *   3. a gentle soft-knee compressor: stereo linked, a 20 ms RMS detector, 8 dB knee, 30 ms attack, 300 ms
 *      release. The sound is first set to the loudness target, so `threshold` (dBFS RMS) means the same
 *      whatever level the mix arrives at. comp: false turns it off.
 *   4. gain to the loudness target `lufs` (BS.1770 integrated).
 *   5. a look-ahead true-peak limiter (4x oversampled, 5 ms look-ahead, 150 ms release) at `ceilingDb`.
 *   6. measure again; if the limiter moved the loudness, change the gain into the limiter and limit again,
 *      until the result is within 0.05 LU of the target (it throws if it cannot get within 0.2 LU).
 *      The true peak of what comes back is measured and is never over the ceiling.
 *
 * .info: { inputLufs, gainDb (all the plain gain, compressor and limiter aside), comp, limiter:
 *          { maxReductionDb, limitedPercent }, lufs, truePeakDb, lra, passes }
 */
function master(stereo, opts) {
  needStereo(stereo, 'mix.master');
  const o = Object.assign({}, MASTER_DEFAULTS, opts || {});
  const off = (v) => v === false || v === null || v === 0;
  const target = num(o.lufs, -40, -6, 'mix.master: lufs');
  const ceilingDb = num(o.ceilingDb, -20, 0, 'mix.master: ceilingDb');
  const comp = off(o.comp) ? null : Object.assign({}, MASTER_DEFAULTS.comp, o.comp === true ? {} : o.comp);
  const lim = Object.assign({}, MASTER_DEFAULTS.limiter, o.limiter || {});
  if (comp) {
    num(comp.threshold, -60, 0, 'mix.master: comp.threshold (dBFS)');
    num(comp.ratio, 1, 20, 'mix.master: comp.ratio');
    num(comp.knee, 0, 24, 'mix.master: comp.knee (dB)');
    num(comp.attack, 0.0005, 1, 'mix.master: comp.attack (seconds)');
    num(comp.release, 0.005, 5, 'mix.master: comp.release (seconds)');
  }
  num(lim.lookahead, 0.0005, 0.05, 'mix.master: limiter.lookahead (seconds)');
  num(lim.release, 0.005, 2, 'mix.master: limiter.release (seconds)');

  const x = dsp.copy(stereo);
  if (!off(o.hp)) { dsp.butter(x, 'hp', num(o.hp, 5, 300, 'mix.master: hp (Hz)'), 4); }
  if (!off(o.shelf)) {
    if (!o.shelf || !Number.isFinite(o.shelf.f) || !Number.isFinite(o.shelf.db)) { throw new Error('mix.master: shelf must be { f, db } or false'); }
    dsp.eq(x, [{ type: 'highshelf', f: o.shelf.f, q: o.shelf.q || 0.7071, db: o.shelf.db }]);
  }
  if (!off(o.lp)) { dsp.eq(x, [{ type: 'lp', f: num(o.lp, 1000, 23000, 'mix.master: lp (Hz)'), q: 0.7071 }]); }

  const inputLufs = lufs(x);
  if (!Number.isFinite(inputLufs)) { throw new Error('mix.master: the input is silent (nothing above the -70 LUFS gate), so it cannot be set to a loudness'); }
  let gainDb = target - inputLufs;
  dsp.gain(x, gainDb);
  let compInfo = null;
  if (comp) {
    compInfo = compress(x, comp);
    const after = lufs(x);
    dsp.gain(x, target - after);
    gainDb += target - after;
  }

  const ceiling = dsp.lin(ceilingDb - TP_MARGIN_DB);
  let out = null, limInfo = null, measured = NaN, trim = 0, passes = 0;
  for (; passes < 12; passes++) {
    out = dsp.copy(x);
    if (trim) { dsp.gain(out, trim); }
    limInfo = limitPass(out, ceiling, lim.lookahead, lim.release);
    for (let again = 0; again < 3 && truePeak(out) > ceiling * 1.0002; again++) {      // what the glide let through
      const more = limitPass(out, ceiling, lim.lookahead, lim.release);
      limInfo.limitedSamples = Math.max(limInfo.limitedSamples, more.limitedSamples);
      limInfo.maxReductionDb += more.maxReductionDb;
    }
    measured = lufs(out);
    const err = target - measured;
    if (Math.abs(err) <= 0.05) { passes++; break; }
    trim += err;
  }
  let tp = truePeak(out);
  if (tp > dsp.lin(ceilingDb)) {                          // a last resort that cannot break the ceiling: turn it all down
    dsp.gain(out, ceilingDb - dsp.db(tp));
    trim += ceilingDb - dsp.db(tp);
    tp = truePeak(out);
    measured = lufs(out);
  }
  if (!(Math.abs(target - measured) <= 0.2)) {
    throw new Error('mix.master: cannot reach ' + target + ' LUFS under a ' + ceilingDb + ' dBTP ceiling: got ' + measured.toFixed(2) +
      ' LUFS with the limiter taking off up to ' + limInfo.maxReductionDb.toFixed(1) + ' dB. The mix is too peaky for this loudness: lower its loudest hits.');
  }
  const all = loudness(out);
  Object.defineProperty(out, 'info', {
    enumerable: false, value: {
      inputLufs, gainDb: gainDb + trim, comp: compInfo,
      limiter: { maxReductionDb: limInfo.maxReductionDb, limitedPercent: 100 * limInfo.limitedSamples / out[0].length },
      lufs: all.lufs, truePeakDb: dsp.db(tp), lra: all.lra, passes
    }
  });
  return out;
}

module.exports = {
  add, room, master, lufs, lra, loudness, truePeakDb, truePeak,
  kWeighted, compress, limitPass, MASTER_DEFAULTS, ROOM,
  _roomCore: roomCore, _roomParams: roomParams, _roomGain: roomGain, _TP_FIR: TP_FIR
};
