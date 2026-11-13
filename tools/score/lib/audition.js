/*
 * tools/score/lib/audition.js: every preset worth considering, measured.
 *
 *   node tools/score/lib/audition.js            render, measure, write audition/audition.md and audition/data.json
 *   node tools/score/lib/audition.js --pictures also write the spectrogram PNGs of the shortlist (audition/png/)
 *   node tools/score/lib/audition.js --only bass,brushes   (a part of the plan, for a quick look; writes nothing)
 *
 * Nobody on this team can hear, so the table is the audition. Each row is one
 * key of one preset; the columns are defined at the top of audition.md.
 *
 * As a module it runs nothing. It exports:
 *   measure : the small analysis functions (also used by test-sampler.js)
 *   sf      : a reader for the structure of a SoundFont (which samples a key and a velocity really play)
 *   run     : the audition itself
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { SR } = require('./const.js');

/* ======================================================================
 * measure: analysis for people who cannot hear
 * ==================================================================== */
const measure = {};

measure.db = function (x) { return x > 0 ? 20 * Math.log10(x) : -Infinity; };
measure.db10 = function (x) { return x > 0 ? 10 * Math.log10(x) : -Infinity; };

/* a part of a Stereo, as a new Stereo */
measure.slice = function (st, t0, t1) {
  const a = Math.max(0, Math.round(t0 * SR)), b = Math.min(st[0].length, Math.round(t1 * SR));
  return [st[0].subarray(a, b), st[1].subarray(a, b)];
};
measure.mono = function (st) {
  const n = st[0].length, m = new Float32Array(n);
  for (let i = 0; i < n; i++) { m[i] = 0.5 * (st[0][i] + st[1][i]); }
  return m;
};
measure.peak = function (st) {
  let p = 0;
  for (let c = 0; c < 2; c++) { const x = st[c]; for (let i = 0; i < x.length; i++) { const a = x[i] < 0 ? -x[i] : x[i]; if (a > p) { p = a; } } }
  return p;
};
/* RMS over both channels, linear */
measure.rms = function (st) {
  let e = 0;
  for (let c = 0; c < 2; c++) { const x = st[c]; for (let i = 0; i < x.length; i++) { e += x[i] * x[i]; } }
  return Math.sqrt(e / Math.max(1, 2 * st[0].length));
};
measure.firstNonzero = function (st, from) {
  for (let i = from || 0; i < st[0].length; i++) { if (st[0][i] !== 0 || st[1][i] !== 0) { return i; } }
  return -1;
};
measure.lastNonzero = function (st) {
  for (let i = st[0].length - 1; i >= 0; i--) { if (st[0][i] !== 0 || st[1][i] !== 0) { return i; } }
  return -1;
};
measure.identical = function (a, b) {
  if (a[0].length !== b[0].length) { return false; }
  for (let c = 0; c < 2; c++) { for (let i = 0; i < a[c].length; i++) { if (a[c][i] !== b[c][i]) { return false; } } }
  return true;
};
/* energy of (a - b) relative to the energy of a, in dB (-Infinity when identical) */
measure.differenceDb = function (a, b) {
  let d = 0, e = 0;
  const n = Math.min(a[0].length, b[0].length);
  for (let c = 0; c < 2; c++) { for (let i = 0; i < n; i++) { const x = a[c][i], y = b[c][i]; d += (x - y) * (x - y); e += x * x; } }
  return d === 0 ? -Infinity : 10 * Math.log10(d / Math.max(e, 1e-300));
};

/* in-place radix-2 FFT */
measure.fft = function (re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) { j ^= bit; }
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
};

/* Long-term power spectrum of a mono signal: Hann windows of nfft, half
 * overlapped, averaged (a signal shorter than nfft is zero-padded).
 * -> { power: Float64Array(nfft/2+1), hz: bin width }. Scaled so that the sum
 * of power over the bins is the mean square of the signal (Parseval, roughly). */
measure.spectrum = function (x, nfft) {
  const n = nfft || 16384, hop = n >> 1;
  const win = new Float64Array(n);
  let wsum = 0;
  for (let i = 0; i < n; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); wsum += win[i] * win[i]; }
  const power = new Float64Array(n / 2 + 1);
  const re = new Float64Array(n), im = new Float64Array(n);
  let frames = 0;
  const last = Math.max(1, Math.ceil((x.length - n) / hop) + 1);
  for (let f = 0; f < last; f++) {
    const off = f * hop;
    for (let i = 0; i < n; i++) { const v = off + i < x.length ? x[off + i] : 0; re[i] = v * win[i]; im[i] = 0; }
    measure.fft(re, im);
    for (let k = 0; k <= n / 2; k++) { power[k] += (re[k] * re[k] + im[k] * im[k]) * (k === 0 || k === n / 2 ? 1 : 2); }
    frames++;
  }
  const scale = 1 / (frames * wsum * n);
  for (let k = 0; k <= n / 2; k++) { power[k] *= scale; }
  return { power: power, hz: SR / n };
};

/* energy between two frequencies, linear */
measure.band = function (spec, f0, f1) {
  let e = 0;
  const a = Math.max(0, Math.ceil(f0 / spec.hz)), b = Math.min(spec.power.length - 1, Math.floor(f1 / spec.hz));
  for (let k = a; k <= b; k++) { e += spec.power[k]; }
  return e;
};

/* spectral centroid in Hz, 20 Hz to 20 kHz, weighted by magnitude (the square root of the long-term power) */
measure.centroid = function (spec) {
  let num = 0, den = 0;
  for (let k = Math.ceil(20 / spec.hz); k * spec.hz <= 20000 && k < spec.power.length; k++) {
    const m = Math.sqrt(spec.power[k]); num += m * k * spec.hz; den += m;
  }
  return den > 0 ? num / den : 0;
};

/* third-octave band levels in dB relative to the total, 25 Hz to 16 kHz (28 bands) */
measure.thirdOctaves = function (spec) {
  const out = [];
  let total = 0;
  for (let i = -16; i <= 12; i++) {
    const fc = 1000 * Math.pow(2, i / 3);
    const e = measure.band(spec, fc * Math.pow(2, -1 / 6), fc * Math.pow(2, 1 / 6));
    out.push({ hz: fc, e: e }); total += e;
  }
  return out.map(function (b) { return { hz: b.hz, db: measure.db10(b.e / Math.max(total, 1e-300)) }; });
};

/* How different are two sounds once loudness is taken out: the RMS difference,
 * in dB, between their third-octave spectra (each relative to its own total),
 * over the bands that matter (within 40 dB of the strongest in either).
 * About 0 means "the same sample, only louder". */
measure.spectralDifference = function (specA, specB) {
  const a = measure.thirdOctaves(specA), b = measure.thirdOctaves(specB);
  const top = Math.max.apply(null, a.concat(b).map(function (x) { return x.db; }));
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.max(a[i].db, b[i].db) < top - 40) { continue; }
    const d = Math.max(a[i].db, top - 60) - Math.max(b[i].db, top - 60);
    s += d * d; n++;
  }
  return n ? Math.sqrt(s / n) : 0;
};

/* one biquad, direct form 1, on a Float64Array copy */
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/* the two K-weighting filters of ITU-R BS.1770 at 48 kHz */
measure.kWeight = function (x) {
  const s1 = biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585);
  return biquad(s1, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
};
/* Integrated loudness, ITU-R BS.1770 (K-weighting, 400 ms blocks every 100 ms,
 * gates at -70 LUFS and at 10 LU under the gated mean). For one short hit this
 * is close to its energy spread over 0.4 s. -> LUFS, or -Infinity for silence. */
measure.lufs = function (st) {
  const kl = measure.kWeight(st[0]), kr = measure.kWeight(st[1]);
  const n = kl.length, block = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { cum[i + 1] = cum[i] + kl[i] * kl[i] + kr[i] * kr[i]; }
  const z = [];
  for (let s = 0; s + block <= n; s += hop) { z.push((cum[s + block] - cum[s]) / block); }
  if (z.length === 0) { return -Infinity; }
  const loud = function (p) { return -0.691 + 10 * Math.log10(p); };
  const abs = z.filter(function (p) { return p > 0 && loud(p) > -70; });
  if (abs.length === 0) { return -Infinity; }
  const mean = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
  const gate = loud(mean(abs)) - 10;
  const rel = abs.filter(function (p) { return loud(p) > gate; });
  return rel.length ? loud(mean(rel)) : -Infinity;
};

/* Short-term level: RMS of both channels in windows of `win` seconds every `hop` seconds.
 * -> { db: Float64Array, hop, win } ; db[i] is the window that STARTS at i * hop. */
measure.envelope = function (st, win, hop) {
  const w = Math.max(1, Math.round((win || 0.02) * SR)), h = Math.max(1, Math.round((hop || 0.005) * SR));
  const n = st[0].length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { cum[i + 1] = cum[i] + st[0][i] * st[0][i] + st[1][i] * st[1][i]; }
  const count = Math.max(0, Math.floor((n - w) / h) + 1);
  const db = new Float64Array(count);
  for (let i = 0; i < count; i++) { db[i] = measure.db10((cum[i * h + w] - cum[i * h]) / (2 * w)); }
  return { db: db, hop: h / SR, win: w / SR };
};

/* The pitch of a steady tone. First the period, by the YIN difference function
 * (so a weak fundamental is still found), then the frequency of the partial
 * nearest to it in a long FFT, by parabolic interpolation of the peak.
 * -> { hz, period: hz from the period alone, clarity: 0 (a clear pitch) .. 1 (noise), partialDb: the
 *      fundamental partial relative to the strongest partial } or null. */
measure.pitch = function (x, opts) {
  const o = opts || {};
  const fmin = o.fmin || 25, fmax = o.fmax || 2500;
  const tauMax = Math.min(Math.floor(SR / fmin), Math.floor(x.length / 2) - 1), tauMin = Math.max(2, Math.floor(SR / fmax));
  const W = Math.min(x.length - tauMax - 1, Math.round(0.25 * SR));
  if (W < 256 || tauMax <= tauMin) { return null; }
  const d = new Float64Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i += 2) { const v = x[i] - x[i + tau]; s += v * v; }     // every second sample is plenty
    d[tau] = s;
  }
  const cm = new Float64Array(tauMax + 2);
  let run = 0;
  cm[0] = 1;
  for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cm[tau] < 0.15) { while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) { tau++; } best = tau; break; }
  }
  if (best < 0) {                       // no clear dip: take the deepest
    best = tauMin;
    for (let tau = tauMin; tau <= tauMax; tau++) { if (cm[tau] < cm[best]) { best = tau; } }
  }
  const clarity = cm[best];
  let period = best;
  if (best > 1 && best < tauMax) {
    const a = cm[best - 1], b = cm[best], c = cm[best + 1], den = a - 2 * b + c;
    if (den > 0) { period = best + 0.5 * (a - c) / den; }
  }
  const fromPeriod = SR / period;
  /* refine on the fundamental partial */
  let nfft = 32768;
  while (nfft > x.length && nfft > 4096) { nfft >>= 1; }
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const len = Math.min(nfft, x.length);
  for (let i = 0; i < len; i++) { re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / len)); }
  measure.fft(re, im);
  const mag = function (k) { return Math.sqrt(re[k] * re[k] + im[k] * im[k]); };
  const binHz = SR / nfft;
  const k0 = fromPeriod / binHz, span = Math.max(2, Math.round(k0 * 0.04));
  let kp = Math.round(k0), top = 0;
  for (let k = Math.max(1, Math.round(k0) - span); k <= Math.min(nfft / 2 - 1, Math.round(k0) + span); k++) { if (mag(k) > top) { top = mag(k); kp = k; } }
  let all = 0;
  for (let k = 1; k < nfft / 2; k++) { if (mag(k) > all) { all = mag(k); } }
  let hz = fromPeriod;
  const partialDb = measure.db(top / Math.max(all, 1e-300));
  if (kp > 1 && kp < nfft / 2 - 1 && partialDb > -40) {
    const a = Math.log(mag(kp - 1) + 1e-300), b = Math.log(mag(kp) + 1e-300), c = Math.log(mag(kp + 1) + 1e-300), den = a - 2 * b + c;
    hz = (kp + (den < 0 ? 0.5 * (a - c) / den : 0)) * binHz;
  }
  return { hz: hz, period: fromPeriod, clarity: clarity, partialDb: partialDb };
};

measure.noteHz = function (midiNote) { return 440 * Math.pow(2, (midiNote - 69) / 12); };
measure.cents = function (hz, ref) { return 1200 * Math.log2(hz / ref); };
measure.noteName = function (m) { return ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12] + (Math.floor(m / 12) - 1); };

/* The partial of a steady tone nearest to a frequency you expect (within `cents`, default 120):
 * its exact frequency (parabolic interpolation of a 65536-point spectrum, good to about 0.05 Hz)
 * and its level against the strongest partial. Robust where a period finder is not (low piano
 * strings, weak fundamentals). -> { hz, db, found } */
measure.partialNear = function (x, hz, cents) {
  const nfft = 65536, len = Math.min(nfft, x.length);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (let i = 0; i < len; i++) { re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / len)); }
  measure.fft(re, im);
  const p = function (k) { return re[k] * re[k] + im[k] * im[k]; };
  const bin = SR / nfft, span = Math.pow(2, (cents || 120) / 1200);
  const a = Math.max(2, Math.floor(hz / span / bin)), b = Math.min(nfft / 2 - 2, Math.ceil(hz * span / bin));
  let top = 0;
  for (let k = Math.ceil(20 / bin); k < nfft / 2 - 1; k++) { if (p(k) > top) { top = p(k); } }
  let best = -1;
  for (let k = a; k <= b; k++) { if (p(k) >= p(k - 1) && p(k) > p(k + 1) && (best < 0 || p(k) > p(best))) { best = k; } }
  if (best < 0 || top === 0) { return { hz: null, db: -Infinity, found: false }; }
  const u = Math.log(p(best - 1) + 1e-300), v = Math.log(p(best) + 1e-300), w = Math.log(p(best + 1) + 1e-300), den = u - 2 * v + w;
  return { hz: (best + (den < 0 ? 0.5 * (u - w) / den : 0)) * bin, db: 10 * Math.log10(p(best) / top), found: true };
};

/* L/R: correlation (1 = mono, 0 = unrelated) and balance in dB (above 0 = louder on the left) */
measure.stereo = function (st) {
  let ll = 0, rr = 0, lr = 0;
  for (let i = 0; i < st[0].length; i++) { const l = st[0][i], r = st[1][i]; ll += l * l; rr += r * r; lr += l * r; }
  return {
    corr: ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : (ll > 0 || rr > 0 ? 0 : 1),
    balanceDb: ll > 0 && rr > 0 ? 10 * Math.log10(ll / rr) : (ll > 0 ? Infinity : (rr > 0 ? -Infinity : 0)),
    monoLossDb: ll + rr > 0 ? 10 * Math.log10(Math.max(ll + rr + 2 * lr, 1e-300) / (2 * (ll + rr))) : 0   // power of (L+R)/2 against the mean power of L and R: 0 for mono, -3 for unrelated channels
  };
};

/* K-weighted level of a whole slice, ungated, in dB (for comparing notes in slots of one length) */
measure.kLevel = function (st) {
  const kl = measure.kWeight(st[0]), kr = measure.kWeight(st[1]);
  let e = 0;
  for (let i = 0; i < kl.length; i++) { e += kl[i] * kl[i] + kr[i] * kr[i]; }
  return e > 0 ? -0.691 + 10 * Math.log10(e / kl.length) : -Infinity;
};

/* ======================================================================
 * sf: what a SoundFont says it will play
 *
 * Reads the preset, instrument and sample headers (the "pdta" list) of an
 * SF2 or SF3 file, never the audio. zones(font, bank, program, key, vel)
 * lists the samples that one note starts, with the facts that matter here:
 * which sample (its name), how far it is transposed from the pitch it was
 * recorded at, whether and where it loops, its release time, its exclusive
 * class (a hi-hat that chokes another), its pan.
 * ==================================================================== */
const sf = {};
const sfCache = new Map();

const GEN = {
  startAddrsOffset: 0, endAddrsOffset: 1, startloopAddrsOffset: 2, endloopAddrsOffset: 3, startAddrsCoarseOffset: 4,
  initialFilterFc: 8, initialFilterQ: 9, endAddrsCoarseOffset: 12, chorusEffectsSend: 15, reverbEffectsSend: 16, pan: 17,
  delayVolEnv: 33, attackVolEnv: 34, holdVolEnv: 35, decayVolEnv: 36, sustainVolEnv: 37, releaseVolEnv: 38,
  instrument: 41, keyRange: 43, velRange: 44, startloopAddrsCoarseOffset: 45, keynum: 46, velocity: 47,
  initialAttenuation: 48, endloopAddrsCoarseOffset: 50, coarseTune: 51, fineTune: 52, sampleID: 53, sampleModes: 54,
  scaleTuning: 56, exclusiveClass: 57, overridingRootKey: 58
};
const GEN_DEFAULT = {};
GEN_DEFAULT[GEN.initialFilterFc] = 13500; GEN_DEFAULT[GEN.delayVolEnv] = -12000; GEN_DEFAULT[GEN.attackVolEnv] = -12000;
GEN_DEFAULT[GEN.holdVolEnv] = -12000; GEN_DEFAULT[GEN.decayVolEnv] = -12000; GEN_DEFAULT[GEN.releaseVolEnv] = -12000;
GEN_DEFAULT[GEN.keynum] = -1; GEN_DEFAULT[GEN.velocity] = -1; GEN_DEFAULT[GEN.scaleTuning] = 100; GEN_DEFAULT[GEN.overridingRootKey] = -1;

function sfString(b, off, len) {
  let end = off;
  while (end < off + len && b[end] !== 0) { end++; }
  return b.toString('latin1', off, end).trim();
}

/* -> { file, compressed, presets: [{ name, bank, program, zones }], instruments, samples } */
sf.load = function (file) {
  if (sfCache.has(file)) { return sfCache.get(file); }
  const fd = fs.openSync(file, 'r');
  let pdta = null;
  try {
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    if (head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'sfbk') { throw new Error('audition: ' + file + ' is not a SoundFont'); }
    const size = fs.fstatSync(fd).size;
    let pos = 12;
    const h = Buffer.alloc(12);
    while (pos + 12 <= size) {
      fs.readSync(fd, h, 0, 12, pos);
      const id = h.toString('latin1', 0, 4), len = h.readUInt32LE(4), type = h.toString('latin1', 8, 12);
      if (id !== 'LIST') { throw new Error('audition: ' + file + ' is not laid out as a SoundFont (found "' + id + '" at byte ' + pos + ')'); }
      if (type === 'pdta') { pdta = Buffer.alloc(len - 4); fs.readSync(fd, pdta, 0, len - 4, pos + 12); break; }
      pos += 8 + len;
      if (len & 1) {                                   // a chunk of odd length should be padded; the SF3 here is not
        fs.readSync(fd, h, 0, 4, pos);
        if (h.toString('latin1', 0, 4) !== 'LIST') { pos += 1; }
      }
    }
  } finally { fs.closeSync(fd); }
  if (!pdta) { throw new Error('audition: no preset data in ' + file); }
  const chunks = {};
  for (let p = 0; p + 8 <= pdta.length;) {
    const id = pdta.toString('latin1', p, p + 4), len = pdta.readUInt32LE(p + 4);
    chunks[id] = pdta.subarray(p + 8, p + 8 + len);
    p += 8 + len + (len & 1);
  }
  for (const id of ['phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr']) { if (!chunks[id]) { throw new Error('audition: ' + file + ' has no ' + id + ' chunk'); } }

  const readGens = function (genChunk, from, to) {      // -> Map(oper -> amount), ranges as [lo, hi]
    const g = new Map();
    for (let i = from; i < to; i++) {
      const oper = genChunk.readUInt16LE(4 * i);
      if (oper === GEN.keyRange || oper === GEN.velRange) { g.set(oper, [genChunk[4 * i + 2], genChunk[4 * i + 3]]); }
      else if (oper === GEN.instrument || oper === GEN.sampleID || oper === GEN.sampleModes) { g.set(oper, genChunk.readUInt16LE(4 * i + 2)); }
      else { g.set(oper, genChunk.readInt16LE(4 * i + 2)); }
    }
    return g;
  };
  const readZones = function (bag, genChunk, bagFrom, bagTo, terminal) {      // -> { global: Map or null, zones: [Map] }
    let global = null;
    const zones = [];
    for (let b = bagFrom; b < bagTo; b++) {
      const g = readGens(genChunk, bag.readUInt16LE(4 * b), bag.readUInt16LE(4 * (b + 1)));
      if (g.has(terminal)) { zones.push(g); } else if (b === bagFrom) { global = g; }
    }
    return { global: global, zones: zones };
  };

  const samples = [];
  for (let i = 0; i + 46 <= chunks.shdr.length - 46; i += 46) {
    const c = chunks.shdr;
    samples.push({
      name: sfString(c, i, 20), start: c.readUInt32LE(i + 20), end: c.readUInt32LE(i + 24), startloop: c.readUInt32LE(i + 28), endloop: c.readUInt32LE(i + 32),
      rate: c.readUInt32LE(i + 36), pitch: c[i + 40], correction: c.readInt8(i + 41), link: c.readUInt16LE(i + 42), type: c.readUInt16LE(i + 44)
    });
  }
  const instruments = [];
  for (let i = 0; i + 22 <= chunks.inst.length - 22; i += 22) {
    const z = readZones(chunks.ibag, chunks.igen, chunks.inst.readUInt16LE(i + 20), chunks.inst.readUInt16LE(i + 42), GEN.sampleID);
    instruments.push({ name: sfString(chunks.inst, i, 20), global: z.global, zones: z.zones });
  }
  const presets = [];
  for (let i = 0; i + 38 <= chunks.phdr.length - 38; i += 38) {
    const c = chunks.phdr;
    const z = readZones(chunks.pbag, chunks.pgen, c.readUInt16LE(i + 24), c.readUInt16LE(i + 62), GEN.instrument);
    presets.push({ name: sfString(c, i, 20), program: c.readUInt16LE(i + 20), bank: c.readUInt16LE(i + 22), global: z.global, zones: z.zones });
  }
  const out = { file: file, compressed: samples.some(function (s) { return (s.type & 0x10) !== 0; }), presets: presets, instruments: instruments, samples: samples };
  sfCache.set(file, out);
  return out;
};

sf.preset = function (file, bank, program) {
  const font = sf.load(file);
  return font.presets.find(function (p) { return p.bank === bank && p.program === program; }) || null;
};

/* The samples one note starts. key and vel are MIDI numbers (vel 1..127). */
sf.zones = function (file, bank, program, key, vel) {
  const font = sf.load(file);
  const preset = sf.preset(file, bank, program);
  if (!preset) { throw new Error('audition: no preset ' + bank + '-' + program + ' in ' + file); }
  const inRange = function (g, k, v) {
    const kr = g.get(GEN.keyRange) || [0, 127], vr = g.get(GEN.velRange) || [0, 127];
    return k >= kr[0] && k <= kr[1] && v >= vr[0] && v <= vr[1];
  };
  const out = [];
  for (const pz of preset.zones) {
    if (!inRange(pz, key, vel)) { continue; }
    const inst = font.instruments[pz.get(GEN.instrument)];
    if (!inst) { continue; }
    for (const iz of inst.zones) {
      if (!inRange(iz, key, vel)) { continue; }
      /* instrument level: the zone's value, else the instrument's global zone, else the default; preset level adds */
      const gen = function (oper) {
        let v = iz.has(oper) ? iz.get(oper) : (inst.global && inst.global.has(oper) ? inst.global.get(oper) : (GEN_DEFAULT[oper] !== undefined ? GEN_DEFAULT[oper] : 0));
        const add = pz.has(oper) ? pz.get(oper) : (preset.global && preset.global.has(oper) ? preset.global.get(oper) : 0);
        return v + add;
      };
      const instOnly = function (oper) { return iz.has(oper) ? iz.get(oper) : (inst.global && inst.global.has(oper) ? inst.global.get(oper) : (GEN_DEFAULT[oper] !== undefined ? GEN_DEFAULT[oper] : 0)); };
      const sample = font.samples[iz.get(GEN.sampleID)];
      if (!sample) { continue; }
      const compressed = (sample.type & 0x10) !== 0;
      const root = instOnly(GEN.overridingRootKey) >= 0 ? instOnly(GEN.overridingRootKey) : sample.pitch;
      const playKey = instOnly(GEN.keynum) >= 0 ? instOnly(GEN.keynum) : key;
      const cents = (playKey - root) * instOnly(GEN.scaleTuning) + 100 * gen(GEN.coarseTune) + gen(GEN.fineTune) + sample.correction;
      const speed = Math.pow(2, cents / 1200);              // how much faster than recorded the sample runs
      const start = (compressed ? 0 : sample.start) + instOnly(GEN.startAddrsOffset) + 32768 * instOnly(GEN.startAddrsCoarseOffset);
      const end = compressed ? null : sample.end + instOnly(GEN.endAddrsOffset) + 32768 * instOnly(GEN.endAddrsCoarseOffset);
      const ls = sample.startloop + instOnly(GEN.startloopAddrsOffset) + 32768 * instOnly(GEN.startloopAddrsCoarseOffset);
      const le = sample.endloop + instOnly(GEN.endloopAddrsOffset) + 32768 * instOnly(GEN.endloopAddrsCoarseOffset);
      const mode = instOnly(GEN.sampleModes) & 3;
      const loops = mode === 1 || mode === 3;
      const tc = function (v) { return Math.pow(2, v / 1200); };
      out.push({
        instrument: inst.name, sample: sample.name, sampleId: iz.get(GEN.sampleID),
        channel: (sample.type & 0xf) === 2 ? 'R' : ((sample.type & 0xf) === 4 ? 'L' : 'mono'),
        rootKey: root, transpose: cents / 100,                          // semitones away from the recorded pitch
        seconds: end === null ? null : (end - start) / sample.rate / speed,   // the whole sample at this pitch (SF2 only)
        loop: loops ? { mode: mode === 3 ? 'until release' : 'forever', from: (ls - start) / sample.rate / speed, length: (le - ls) / sample.rate / speed } : null,
        exclusiveClass: instOnly(GEN.exclusiveClass),
        pan: Math.max(-500, Math.min(500, gen(GEN.pan))) / 500,         // -1 left .. 1 right
        attenuationDb: 0.4 * gen(GEN.initialAttenuation) / 10,          // fluidsynth takes 0.4 of the file's centibels
        attack: tc(gen(GEN.attackVolEnv)), hold: tc(gen(GEN.holdVolEnv)), decay: tc(gen(GEN.decayVolEnv)),
        sustainDb: -gen(GEN.sustainVolEnv) / 10, release: tc(gen(GEN.releaseVolEnv)), delay: tc(gen(GEN.delayVolEnv)),
        filterHz: 8.176 * Math.pow(2, Math.max(1500, Math.min(13500, gen(GEN.initialFilterFc))) / 1200),
        fixedVelocity: instOnly(GEN.velocity) >= 0 ? instOnly(GEN.velocity) : null,
        keyRange: iz.get(GEN.keyRange) || [0, 127], velRange: iz.get(GEN.velRange) || [0, 127]
      });
    }
  }
  return out;
};

/* The velocity layers of one key: [{ from, to, samples: [names] }], where the set of samples changes. */
sf.layers = function (file, bank, program, key) {
  const out = [];
  let last = null;
  for (let v = 1; v <= 127; v++) {
    const z = sf.zones(file, bank, program, key, v);
    const id = z.map(function (x) { return x.sampleId; }).sort().join(',');
    if (last && last.id === id) { last.to = v; } else { last = { id: id, from: v, to: v, samples: z.map(function (x) { return x.sample; }) }; out.push(last); }
  }
  return out.filter(function (l) { return l.id !== ''; }).map(function (l) { return { from: l.from, to: l.to, samples: l.samples }; });
};

/* instantaneous frequency of the low end (below 300 Hz), early and late: does a drum's pitch drop?
 * -> { early: Hz over 10..70 ms, late: Hz over 200..400 ms } (null where it cannot be told) */
measure.glide = function (x) {
  const lp = function (v) {            // two one-pole low-passes at 300 Hz, forwards
    const a = Math.exp(-2 * Math.PI * 300 / SR), y = new Float64Array(v.length);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < v.length; i++) { s1 = (1 - a) * v[i] + a * s1; s2 = (1 - a) * s1 + a * s2; y[i] = s2; }
    return y;
  };
  const y = lp(x), cross = [];
  for (let i = 1; i < y.length; i++) { if (y[i - 1] < 0 && y[i] >= 0) { cross.push(i - 1 + y[i - 1] / (y[i - 1] - y[i])); } }
  const mean = function (t0, t1) {
    const c = cross.filter(function (v) { return v >= t0 * SR && v <= t1 * SR; });
    return c.length >= 2 ? SR * (c.length - 1) / (c[c.length - 1] - c[0]) : null;
  };
  return { early: mean(0.01, 0.07), late: mean(0.2, 0.4) };
};

/* the strongest peak of a spectrum between two frequencies, and the lowest peak within `within` dB of it */
measure.lowPartials = function (spec, f0, f1, within) {
  const a = Math.max(2, Math.ceil(f0 / spec.hz)), b = Math.min(spec.power.length - 2, Math.floor(f1 / spec.hz));
  const P = spec.power;
  const refine = function (k) {
    const x = Math.log(P[k - 1] + 1e-300), y = Math.log(P[k] + 1e-300), z = Math.log(P[k + 1] + 1e-300), den = x - 2 * y + z;
    return (k + (den < 0 ? 0.5 * (x - z) / den : 0)) * spec.hz;
  };
  let main = -1;
  for (let k = a; k <= b; k++) { if (P[k] >= P[k - 1] && P[k] > P[k + 1] && (main < 0 || P[k] > P[main])) { main = k; } }
  if (main < 0) { return null; }
  let low = main;
  const floor = P[main] * Math.pow(10, -(within || 12) / 10);
  for (let k = a; k < main; k++) { if (P[k] >= P[k - 1] && P[k] > P[k + 1] && P[k] >= floor) { low = k; break; } }
  return { mainHz: refine(main), lowHz: refine(low) };
};

/* ======================================================================
 * the audition
 * ==================================================================== */
const OUT_DIR = path.join(__dirname, 'audition');
const VELS = [0.3, 0.6, 0.9];
const FONT_NAMES = ['fluidr3', 'musescore'];
const GM_DRUM = {
  35: 'Acoustic Bass Drum', 36: 'Bass Drum 1', 37: 'Side Stick', 38: 'Acoustic Snare', 39: 'Hand Clap', 40: 'Electric Snare',
  41: 'Low Floor Tom', 42: 'Closed Hi-Hat', 43: 'High Floor Tom', 44: 'Pedal Hi-Hat', 45: 'Low Tom', 46: 'Open Hi-Hat',
  47: 'Low-Mid Tom', 48: 'Hi-Mid Tom', 49: 'Crash Cymbal 1', 50: 'High Tom', 51: 'Ride Cymbal 1', 53: 'Ride Bell', 57: 'Crash Cymbal 2', 59: 'Ride Cymbal 2'
};
const KIT_KEYS = [35, 36, 37, 38, 39, 40, 42, 44, 46, 51, 53, 59, 49, 57, 41, 43, 45, 47, 48, 50];
const KITS = [0, 32, 40, 41, 42];
const pad3 = function (n) { return String(n).padStart(3, '0'); };
const presetId = function (bank, program) { return pad3(bank) + '-' + pad3(program); };

function thePlan() {
  const P = [];
  const add = function (job, kind, font, bank, program, keys, extra) { P.push(Object.assign({ job: job, kind: kind, font: font, bank: bank, program: program, keys: keys }, extra || {})); };
  for (const font of FONT_NAMES) {
    /* the zones of the acoustic bass are 0-28, 29, 30-36, 37-41, 42-46, 47-54, 55-60: the top and the bottom key of each */
    add('bass', 'pitched', font, 0, 32, [24, 28, 29, 30, 33, 36, 37, 41, 42, 46, 47, 50, 54, 55, 57, 60], { map: [24, 60] });
    add('bass', 'pitched', font, 0, 45, [28, 33, 36, 40, 45, 50, 55]);
    if (font === 'musescore') { add('bass', 'pitched', font, 50, 45, [28, 33, 36, 40, 45, 50, 55]); }
    add('piano', 'pitched', font, 0, 0, [36, 43, 48, 51, 55, 58, 60, 62, 65, 67, 70, 72, 77, 84]);
    if (font === 'musescore') { add('piano', 'pitched', font, 8, 0, [36, 43, 48, 51, 55, 58, 60, 62, 65, 67, 70, 72, 77, 84]); }
    add('vibraphone', 'pitched', font, 0, 11, [53, 57, 58, 60, 63, 65, 67, 72, 77, 84]);
    add('electric piano', 'pitched', font, 0, 4, [36, 43, 48, 55, 60, 65, 72, 79]);
    add('electric piano', 'pitched', font, 0, 5, [36, 43, 48, 55, 60, 65, 72, 79]);
    add('celesta', 'pitched', font, 0, 8, [60, 67, 72, 79, 84, 91]);
    for (const kit of KITS) { add('drums', 'drum', font, 128, kit, KIT_KEYS); }
    /* low drums for the NO thuds: the keys are chosen by a scan (the ones whose lowest strong partial is nearest 45, 52 and 60 Hz) */
    add('thud', 'drum', font, 0, 47, null, { scan: [24, 60] });
    add('thud', 'drum', font, 0, 116, null, { scan: [24, 72] });
    add('thud', 'drum', font, 8, 116, null, { scan: [24, 72] });
    add('thud', 'drum', font, 0, 117, null, { scan: [12, 60] });
    add('thud', 'drum', font, 128, 48, [35, 36, 41, 43, 45, 47]);
  }
  return P;
}

/* ---------------------------------------------------------------- rendering in batches
 * Many notes, one after another in their own slots, in as few fluidsynth runs
 * as memory allows. Every slot starts on a multiple of 0.5 s, which is a
 * multiple of 64 samples: each voice starts exactly at the start of its slot.
 * groups: [[{ id, midi, vel, dur, slot, also: [{ at, vel, dur }] }, ...], ...]; a group is never split.
 * onGroup(group, slices) with slices[id] = Stereo (views; copy what you keep). */
const MAX_BATCH_SECONDS = 150;
function batch(sampler, preset, groups, onGroup) {
  let i = 0;
  while (i < groups.length) {
    const chunk = [];
    let t = 0.5;
    const notes = [];
    while (i < groups.length) {
      const len = groups[i].reduce(function (s, n) { return s + n.slot; }, 0);
      if (chunk.length && t + len > MAX_BATCH_SECONDS) { break; }
      const placed = [];
      for (const n of groups[i]) {
        if (Math.abs(n.slot * 2 - Math.round(n.slot * 2)) > 1e-9) { throw new Error('audition: a slot must be a multiple of 0.5 s'); }
        notes.push({ t: t, dur: n.dur, midi: n.midi, vel: n.vel });
        for (const more of n.also || []) { notes.push({ t: t + more.at, dur: more.dur, midi: n.midi, vel: more.vel }); }
        placed.push({ note: n, t0: t, t1: t + n.slot });
        t += n.slot;
      }
      chunk.push({ group: groups[i], placed: placed });
      i++;
    }
    const st = sampler.render({ font: preset.font, bank: preset.bank, program: preset.program, notes: notes, seconds: t });
    for (const c of chunk) {
      const slices = {};
      for (const pl of c.placed) { slices[pl.note.id] = measure.slice(st, pl.t0, pl.t1); }
      onGroup(c.group, slices);
    }
  }
}

function hashStereo(list) {
  const h = require('crypto').createHash('sha1');
  for (const st of list) { for (const ch of st) { h.update(Buffer.from(ch.buffer, ch.byteOffset, ch.byteLength)); } }
  return h.digest('hex').slice(0, 16);
}

/* ---------------------------------------------------------------- one sound, measured */
function decayTimes(st, win, hop, until) {
  /* level in short windows; the peak; when it has fallen 20 and 60 dB for good (within `until` seconds) */
  const env = measure.envelope(st, win, hop);
  const last = Math.min(env.db.length, until === undefined ? env.db.length : Math.max(1, Math.floor((until - env.win) / env.hop) + 1));
  let peak = -Infinity, at = 0;
  for (let i = 0; i < last; i++) { if (env.db[i] > peak) { peak = env.db[i]; at = i; } }
  const fallen = function (by) {          // after this moment the level stays more than `by` dB under the peak
    let idx = null;
    for (let i = last - 1; i >= at; i--) { if (env.db[i] >= peak - by) { idx = i + 1; break; } }
    if (idx === null) { idx = at; }
    return idx >= last ? null : idx * env.hop + env.win / 2;       // null: not within the time looked at
  };
  return { env: env, peakDb: peak, tPeak: at * env.hop + env.win / 2, t20: fallen(20), t60: fallen(60), last: last };
}

function slopeDbPerSecond(env, t0, t1) {
  const a = Math.max(0, Math.ceil(t0 / env.hop)), b = Math.min(env.db.length - 1, Math.floor((t1 - env.win) / env.hop));
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = a; i <= b; i++) {
    if (!isFinite(env.db[i])) { return null; }
    const x = i * env.hop; n++; sx += x; sy += env.db[i]; sxx += x * x; sxy += x * env.db[i];
  }
  if (n < 8) { return null; }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

function round(x, d) { if (x === null || x === undefined || !isFinite(x)) { return x === undefined ? null : x; } const m = Math.pow(10, d === undefined ? 2 : d); return Math.round(x * m) / m; }

function structure(file, bank, program, key) {
  const z = sf.zones(file, bank, program, key, 76);
  const layers = sf.layers(file, bank, program, key);
  if (!z.length) { return { samples: [], layers: layers }; }
  const uniq = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); };
  const first = z[0];
  return {
    samples: uniq(z.map(function (x) { return x.sample; })),
    layers: layers.map(function (l) { return { from: l.from, to: l.to, samples: uniq(l.samples) }; }),
    rootKey: first.rootKey, transpose: round(first.transpose, 2),
    seconds: first.seconds === null ? null : round(first.seconds, 3),
    loop: first.loop ? { mode: first.loop.mode, from: round(first.loop.from, 3), length: round(first.loop.length, 4) } : null,
    exclusiveClass: first.exclusiveClass, release: round(first.release, 2), decay: round(first.decay, 1), sustainDb: round(first.sustainDb, 0),
    filterHz: Math.round(first.filterHz), pans: uniq(z.map(function (x) { return round(x.pan, 2); }))
  };
}

/* a pitched key: A (vel 0.3, held 2 s), B (vel 0.6, held 5 s), C (vel 0.9, held 2 s), D (vel 0.6, 0.4 s long: the release) */
const PITCHED = { holdShort: 2, holdLong: 5, durD: 0.4 };
function pitchedGroup(key) {
  return [
    { id: 'A', midi: key, vel: VELS[0], dur: PITCHED.holdShort, slot: 4 },
    { id: 'B', midi: key, vel: VELS[1], dur: PITCHED.holdLong, slot: 8 },
    { id: 'C', midi: key, vel: VELS[2], dur: PITCHED.holdShort, slot: 4 },
    { id: 'D', midi: key, vel: VELS[1], dur: PITCHED.durD, slot: 3.5 }
  ];
}
function analysePitched(item, key, sl, sampler) {
  const row = { job: item.job, kind: 'pitched', font: item.font, bank: item.bank, program: item.program, key: key, keyName: measure.noteName(key) };
  if (measure.peak(sl.B) === 0) { row.silent = true; return row; }
  const hz = measure.noteHz(key);
  const win = Math.max(0.02, 2.5 / hz), hop = 0.005;
  /* onset, loudness, brightness at the three velocities */
  row.onset = {}; row.lufs = []; row.centroid = [];
  const specs = [];
  ['A', 'B', 'C'].forEach(function (id, i) {
    row.onset[VELS[i]] = sampler.onsetIn(sl[id], 0, 1.0);
    row.lufs.push(round(measure.lufs(measure.slice(sl[id], 0, 3)), 1));
    const sp = measure.spectrum(measure.mono(measure.slice(sl[id], 0, 1)), 16384);
    specs.push(sp); row.centroid.push(Math.round(measure.centroid(sp)));
  });
  row.peakDb = round(measure.db(measure.peak(measure.slice(sl.C, 0, 2))), 1);
  const total = measure.band(specs[1], 20, 24000);
  row.hf25 = round(measure.db10(measure.band(specs[1], 2000, 5000) / total), 1);
  row.hf8 = round(measure.db10(measure.band(specs[1], 8000, 24000) / total), 1);
  row.specDiff = round(measure.spectralDifference(specs[0], specs[2]), 1);
  /* pitch: the fundamental partial (or, where it is too weak to find, half the second); and is there anything an octave below? */
  const steady = measure.mono(measure.slice(sl.B, 0.15, 1.15));
  const f1 = measure.partialNear(steady, hz), f2 = measure.partialNear(steady, 2 * hz), fSub = measure.partialNear(steady, hz / 2);
  row.partials = { octaveBelow: round(fSub.db, 1), fundamental: round(f1.db, 1), second: round(f2.db, 1) };
  if (f1.found && f1.db > -45) { row.pitchHz = round(f1.hz, 2); } else if (f2.found && f2.db > -45) { row.pitchHz = round(f2.hz / 2, 2); row.pitchFrom = 'second partial'; }
  if (row.pitchHz) { row.cents = round(measure.cents(row.pitchHz, hz), 1); }
  row.hash = hashStereo([sl.A, sl.B, sl.C]);
  /* the held note: how it decays, where it stops, the floor */
  const d = decayTimes(sl.B, win, hop, PITCHED.holdLong);
  row.t20 = round(d.t20, 2); row.t60 = round(d.t60, 2);
  const s = structure(sampler.fonts[item.font], item.bank, item.program, key);
  Object.assign(row, { samples: s.samples, layers: s.layers, rootKey: s.rootKey, transpose: s.transpose, loop: s.loop, structRelease: s.release, filterHz: s.filterHz, pans: s.pans });
  const from = s.loop ? Math.max(1.0, s.loop.from + 0.05) : PITCHED.holdLong - 2;
  const levelAtEnd = d.env.db[Math.max(0, d.last - 1)] - d.peakDb;
  row.levelAtHoldEnd = round(levelAtEnd, 1);
  if (from < PITCHED.holdLong - 0.5 && levelAtEnd > -80) { row.slope = round(slopeDbPerSecond(d.env, from, PITCHED.holdLong - 0.02), 1); }
  /* the hiss between the partials: median spectral density 0.5-8 kHz, taken as flat noise over that band, against the note */
  const late = measure.spectrum(measure.mono(measure.slice(sl.B, 0.3, 1.3)), 32768);
  const bins = [];
  for (let k = Math.ceil(500 / late.hz); k * late.hz <= 8000; k++) { bins.push(late.power[k]); }
  bins.sort(function (a, b) { return a - b; });
  row.floorDb = round(measure.db10(bins[bins.length >> 1] * bins.length / measure.band(late, 20, 24000)), 1);
  /* the release: a 0.4 s note; from its note-off, the time to fall 20 dB and to be gone */
  const env = measure.envelope(sl.D, win, hop);
  const iOff = Math.max(0, Math.floor((PITCHED.durD - env.win) / env.hop));
  const lOff = env.db[iOff];
  let r20 = null;
  for (let i = env.db.length - 1; i > iOff; i--) { if (env.db[i] >= lOff - 20) { r20 = (i + 1) * env.hop + env.win / 2 - PITCHED.durD; break; } }
  row.rel20 = round(r20 === null ? 0 : r20, 2);
  const end = measure.lastNonzero(sl.D);
  row.relEnd = end < 0 || end >= sl.D[0].length - 1 ? null : round((end + 1) / SR - PITCHED.durD, 2);
  const stereo = measure.stereo(measure.slice(sl.B, 0, 1));
  row.corr = round(stereo.corr, 2); row.balanceDb = round(stereo.balanceDb, 1); row.monoLossDb = round(stereo.monoLossDb, 1);
  return row;
}

/* a drum key: A, B, C (vel 0.3, 0.6, 0.9; 0.1 s long), D (vel 0.6, held), E (vel 0.6 twice, 0.24 s apart) */
function drumGroup(key, slot) {
  return [
    { id: 'A', midi: key, vel: VELS[0], dur: 0.1, slot: slot },
    { id: 'B', midi: key, vel: VELS[1], dur: 0.1, slot: slot },
    { id: 'C', midi: key, vel: VELS[2], dur: 0.1, slot: slot },
    { id: 'D', midi: key, vel: VELS[1], dur: slot - 0.5, slot: slot },
    { id: 'E', midi: key, vel: VELS[1], dur: 0.1, slot: slot, also: [{ at: 0.24, vel: VELS[1], dur: 0.1 }] }
  ];
}
function analyseDrum(item, key, sl, sampler) {
  const row = { job: item.job, kind: 'drum', font: item.font, bank: item.bank, program: item.program, key: key, keyName: item.bank === 128 ? (GM_DRUM[key] || 'key ' + key) : measure.noteName(key) };
  const s = structure(sampler.fonts[item.font], item.bank, item.program, key);
  Object.assign(row, { samples: s.samples, layers: s.layers, rootKey: s.rootKey, transpose: s.transpose, loop: s.loop, structSeconds: s.seconds, structRelease: s.release, exclusiveClass: s.exclusiveClass, filterHz: s.filterHz, pans: s.pans });
  if (measure.peak(sl.B) === 0) { row.silent = true; return row; }
  row.hash = hashStereo([sl.A, sl.B, sl.C]);
  row.onset = {}; row.lufs = []; row.centroid = [];
  const specs = [];
  ['A', 'B', 'C'].forEach(function (id, i) {
    row.onset[VELS[i]] = sampler.onsetIn(sl[id], 0, 1.0);
    row.lufs.push(round(measure.lufs(sl[id]), 1));
    const sp = measure.spectrum(measure.mono(measure.slice(sl[id], 0, 1)), 8192);
    specs.push(sp); row.centroid.push(Math.round(measure.centroid(sp)));
  });
  row.peakDb = round(measure.db(measure.peak(sl.C)), 1);
  const total = measure.band(specs[1], 20, 24000);
  row.hf25 = round(measure.db10(measure.band(specs[1], 2000, 5000) / total), 1);
  row.hf8 = round(measure.db10(measure.band(specs[1], 8000, 24000) / total), 1);
  row.specDiff = round(measure.spectralDifference(specs[0], specs[2]), 1);
  const d = decayTimes(sl.B, 0.01, 0.0025);
  row.t20 = round(d.t20, 3); row.t60 = round(d.t60, 3);
  const end = measure.lastNonzero(sl.B);
  row.stillSounding = end >= sl.B[0].length - 2;
  row.endsAt = row.stillSounding ? null : round((end + 1) / SR, 3);
  /* how far it has fallen when it runs out: the last 30 ms before the end, against the peak */
  if (!row.stillSounding && end > 0.04 * SR) {
    const tail = [sl.B[0].subarray(end - Math.round(0.03 * SR), end), sl.B[1].subarray(end - Math.round(0.03 * SR), end)];
    row.floorDb = round(measure.db(measure.rms(tail)) - d.peakDb, 1);
  }
  const stereo = measure.stereo(measure.slice(sl.B, 0, 1));
  row.corr = round(stereo.corr, 2); row.balanceDb = round(stereo.balanceDb, 1); row.monoLossDb = round(stereo.monoLossDb, 1);
  /* does holding the key change it?  does striking it again cut the first hit? */
  row.holdDiffDb = round(measure.differenceDb(sl.B, sl.D), 1);
  if (isFinite(row.holdDiffDb)) { row.holdLufs = round(measure.lufs(sl.D) - measure.lufs(sl.B), 1); const e2 = measure.lastNonzero(sl.D); row.holdEndsAt = e2 >= sl.D[0].length - 2 ? null : round((e2 + 1) / SR, 3); }
  const shift = Math.round(0.24 * SR), n = sl.B[0].length;
  const sum = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) { for (let i = 0; i < n; i++) { sum[c][i] = sl.B[c][i] + (i >= shift ? sl.B[c][i - shift] : 0); } }
  row.restrikeDiffDb = round(measure.differenceDb(sum, sl.E), 1);
  /* the low end, for kicks, toms and thuds */
  const m = measure.mono(measure.slice(sl.B, 0, 0.6));
  const sp = measure.spectrum(m, 32768);
  const low = measure.lowPartials(sp, 25, 400, 12);
  const whole = measure.spectrum(measure.mono(measure.slice(sl.B, 0, Math.min(2, sl.B[0].length / SR))), 16384);
  const tot = measure.band(whole, 20, 24000);
  row.bands = {
    sub: round(measure.db10(measure.band(whole, 20, 60) / tot), 1), low: round(measure.db10(measure.band(whole, 60, 100) / tot), 1),
    body: round(measure.db10(measure.band(whole, 100, 200) / tot), 1), above3k: round(measure.db10(measure.band(whole, 3000, 24000) / tot), 1),
    below400: round(measure.db10(measure.band(whole, 20, 400) / tot), 1)
  };
  if (low && row.bands.below400 > -6) {
    row.lowHz = round(low.lowHz, 1); row.mainHz = round(low.mainHz, 1);
    const g = measure.glide(m);
    row.glide = { early: round(g.early, 1), late: round(g.late, 1) };
  }
  return row;
}

/* the lowest strong partial of each key of a low drum, to choose the keys worth a full look */
function scanLowDrum(sampler, item) {
  const out = [];
  const groups = [];
  for (let k = item.scan[0]; k <= item.scan[1]; k++) { groups.push([{ id: 'S', midi: k, vel: 0.8, dur: 0.5, slot: 4 }]); }
  batch(sampler, item, groups, function (group, sl) {
    const key = group[0].midi;
    if (measure.peak(sl.S) === 0) { return; }
    const sp = measure.spectrum(measure.mono(measure.slice(sl.S, 0, 0.6)), 32768);
    const low = measure.lowPartials(sp, 25, 400, 12);
    if (low) { out.push({ key: key, lowHz: round(low.lowHz, 1), mainHz: round(low.mainHz, 1) }); }
  });
  return out;
}

/* ---------------------------------------------------------------- the run */
function slotFor(file, bank, program, key) {
  const z = sf.zones(file, bank, program, key, 76);
  let seconds = z.length && z[0].seconds !== null ? z[0].seconds : null;
  if (seconds === null) {                       // SF3: the header does not give the length; the same samples in the SF2 do
    const known = { 49: 8.6, 57: 5.8, 51: 2.6, 59: 3.0, 53: 3.3, 46: 3.2, 52: 3.6, 55: 2.7, 37: 1.5 };
    seconds = bank === 128 ? (known[key] || 1.2) : 4;
  }
  return Math.max(2.5, Math.ceil((seconds + 1.2) * 2) / 2);
}

function run(options) {
  const o = options || {};
  const sampler = require('./sampler.js');
  const log = o.quiet ? function () {} : function (msg) { process.stderr.write(msg + '\n'); };
  const only = o.only || null;
  const rows = [], bassMap = [], scans = [], onsets = [];
  const t0 = Date.now();
  for (const item of thePlan()) {
    if (only && only.indexOf(item.job) < 0) { continue; }
    const file = sampler.fonts[item.font];
    const preset = sf.preset(file, item.bank, item.program);
    if (!preset) { log('  no preset ' + presetId(item.bank, item.program) + ' in ' + item.font + ': skipped'); continue; }
    item.presetName = preset.name;
    const started = Date.now();
    let keys = item.keys;
    if (item.scan) {
      const scan = scanLowDrum(sampler, item);
      scans.push({ font: item.font, bank: item.bank, program: item.program, presetName: preset.name, keys: scan });
      keys = [];
      for (const target of [45, 52, 60]) {
        let best = null;
        for (const s of scan) { if (best === null || Math.abs(Math.log(s.lowHz / target)) < Math.abs(Math.log(best.lowHz / target))) { best = s; } }
        if (best && keys.indexOf(best.key) < 0) { keys.push(best.key); }
      }
      keys.sort(function (a, b) { return a - b; });
    }
    const groups = keys.map(function (key) { return item.kind === 'pitched' ? pitchedGroup(key) : drumGroup(key, slotFor(file, item.bank, item.program, key)); });
    batch(sampler, item, groups, function (group, sl) {
      const key = group[0].midi;
      const row = item.kind === 'pitched' ? analysePitched(item, key, sl, sampler) : analyseDrum(item, key, sl, sampler);
      row.presetName = preset.name;
      rows.push(row);
      if (row.onset) { for (const v of VELS) { onsets.push({ font: item.font, bank: item.bank, program: item.program, midi: key, vel: v, record: row.onset[v] }); } }
    });
    if (item.map) {                             // every key of the bass, briefly
      const mg = [];
      for (let k = item.map[0]; k <= item.map[1]; k++) { mg.push([{ id: 'M', midi: k, vel: 0.6, dur: 1.5, slot: 3 }]); }
      batch(sampler, item, mg, function (group, sl) {
        const key = group[0].midi, hz = measure.noteHz(key);
        const on = sampler.onsetIn(sl.M, 0, 1.0);
        const sp = measure.spectrum(measure.mono(measure.slice(sl.M, 0, 1)), 16384);
        const z = sf.zones(file, item.bank, item.program, key, 76)[0];
        const d = decayTimes(sl.M, Math.max(0.02, 2.5 / hz), 0.005, 1.5);
        const above150 = measure.band(sp, 150, 24000) / measure.band(sp, 20, 24000);
        const steady = measure.mono(measure.slice(sl.M, 0.15, 1.15));
        const p = measure.partialNear(steady, hz), p2 = measure.partialNear(steady, 2 * hz);
        bassMap.push({ font: item.font, key: key, keyName: measure.noteName(key), sample: z ? z.sample : '', transpose: z ? round(z.transpose, 0) : null,
          t10: on.t10, t50: on.t50, lufs: round(measure.lufs(measure.slice(sl.M, 0, 2.5)), 1), peakDb: round(measure.db(measure.peak(sl.M)), 1),
          centroid: Math.round(measure.centroid(sp)), above150: round(100 * above150, 0), t20: round(d.t20, 2), cents: p.found && p.db > -45 ? round(measure.cents(p.hz, hz), 1) : null,
          fundamentalDb: round(p.db, 1), secondDb: round(p2.db, 1) });
        onsets.push({ font: item.font, bank: item.bank, program: item.program, midi: key, vel: 0.6, record: on });
      });
    }
    log('  ' + item.font.padEnd(9) + ' ' + presetId(item.bank, item.program) + ' ' + preset.name.padEnd(22) + ' ' + keys.length + ' keys  ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
  }
  const result = { made: 'node tools/score/lib/audition.js', fluidsynth: sampler.version(), gain: sampler.DEFAULT_GAIN, velocities: VELS, rows: rows, bassMap: bassMap, scans: scans };
  log('  measured ' + rows.length + ' sounds in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  if (!only) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify(result, null, 1) + '\n');
    sampler.storeOnsets(onsets.filter(function (e) { return e.record && !e.record.silent; }));
  }
  return result;
}

/* ---------------------------------------------------------------- the report: audition/audition.md */
function fx(x, d) { return x === null || x === undefined || (typeof x === 'number' && !isFinite(x)) ? '-' : (typeof x === 'number' ? x.toFixed(d === undefined ? 1 : d) : String(x)); }
function msOf(s) { return fx(s * 1000, 1); }
function sampleLabel(row) {
  const names = (row.samples || []).map(function (n) { return n.replace(/\(L\)$|\(R\)$|-L$|-R$/, '').trim(); });
  let out = names.filter(function (v, i) { return names.indexOf(v) === i; }).join(' + ') || '-';
  const t = Math.round(row.transpose || 0);
  if (t !== 0) { out += ' (' + (t > 0 ? '+' : '') + t + ')'; }
  return out;
}
function signature(row) { return row.hash || JSON.stringify([row.lufs, row.centroid, row.t20, row.onset]); }

function notesFor(row, same) {
  const n = [];
  if (same.length) { n.push('same render in ' + same.join(', ')); }
  const o = row.onset[VELS[1]];
  if (o.t50 > 0.015) { n.push('slow attack'); }
  if (row.kind === 'pitched') {
    if (row.pitchHz === undefined || row.pitchHz === null) { n.push('pitch not found'); }
    else if (Math.abs(row.cents) > 10) { n.push((row.cents > 0 ? 'SHARP ' : 'FLAT ') + Math.abs(row.cents).toFixed(0) + ' cents'); }
    if (row.loop && typeof row.slope === 'number' && row.slope > -1.5) { n.push('LOOP: the sustain does not decay'); }
    if (row.floorDb > -55) { n.push('noisy'); }
    if (row.relEnd !== null && row.relEnd <= 0.13) { n.push('stops dead at the note-off'); }
    if (row.relEnd === null || row.relEnd > 1.5) { n.push('rings on after the note-off'); }
  } else {
    if (row.exclusiveClass) { n.push('hi-hat group: one key cuts the other'); }
    if (!row.stillSounding && typeof row.floorDb === 'number' && row.floorDb > -50) { n.push('recording cut off only ' + (-row.floorDb).toFixed(0) + ' dB down: fade it'); }
    if (row.stillSounding) { n.push('longer than its slot'); }
    if (row.loop) { n.push('LOOPED'); }
  }
  if ((row.layers || []).length <= 1 && row.specDiff < 1 && Math.max.apply(null, row.centroid) <= 1.03 * Math.min.apply(null, row.centroid)) { n.push('velocity is gain only'); }
  if (row.corr < 0.5) { n.push('WIDE: L+R loses ' + (-row.monoLossDb).toFixed(1) + ' dB'); }
  if (Math.abs(row.balanceDb) > 3) { n.push('leans ' + (row.balanceDb > 0 ? 'left ' : 'right ') + Math.abs(row.balanceDb).toFixed(1) + ' dB'); }
  if (row.hf8 > -20) { n.push('BRIGHT'); } else if (row.hf25 > -10) { n.push('2-5 kHz heavy'); }
  return n.join('; ');
}

function tableOf(result) {
  const lines = [];
  lines.push('| job | library | preset | key | recording (semitones moved) | pitch | onset 10% / 50% ms | LUFS at 0.3 / 0.6 / 0.9 | centroid Hz at 0.3 / 0.6 / 0.9 | 2-5 kHz / above 8 kHz dB | 20 dB down after s | length s | velocity: layers, spectral change dB | stereo: correlation, balance dB | floor dB | loop | notes |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const rows = result.rows.filter(function (r) { return !r.silent; });
  const first = new Map();
  for (const r of rows) {
    const id = r.font + '|' + r.key + '|' + r.job + '|' + signature(r);
    if (first.has(id)) { first.get(id).same.push(presetId(r.bank, r.program)); } else { first.set(id, { row: r, same: [] }); }
  }
  for (const e of first.values()) {
    const r = e.row, o = r.onset[VELS[1]];
    let pitch = '-';
    if (r.kind === 'pitched' && typeof r.pitchHz === 'number') { pitch = fx(r.pitchHz, 2) + ' Hz (' + (r.cents >= 0 ? '+' : '') + fx(r.cents, 1) + ' c)'; }
    else if (r.kind === 'drum' && typeof r.lowHz === 'number') { pitch = (r.mainHz !== r.lowHz ? fx(r.lowHz, 1) + ' and ' : '') + fx(r.mainHz, 1) + ' Hz' + (r.glide && r.glide.early && r.glide.late ? ' (zero crossings ' + fx(r.glide.early, 0) + ' then ' + fx(r.glide.late, 0) + ')' : ''); }
    const length = r.kind === 'pitched' ? 'release ' + fx(r.rel20, 2) + ' / ' + (r.relEnd === null ? 'over 3' : fx(r.relEnd, 2)) : (r.stillSounding ? 'over its slot' : 'ends ' + fx(r.endsAt, 2));
    const lay = (r.layers || []).length;
    const layers = lay + (lay > 1 ? ' (' + r.layers.map(function (l) { return l.from + '-' + l.to; }).join(', ') + ')' : '') + ', ' + fx(r.specDiff, 1);
    const loop = r.loop ? 'from ' + fx(r.loop.from, 2) + ' s, ' + fx(r.loop.length * 1000, 0) + ' ms' + (typeof r.slope === 'number' ? ', ' + fx(r.slope, 1) + ' dB/s' : '') : 'no';
    lines.push('| ' + [r.job, r.font, presetId(r.bank, r.program) + ' ' + r.presetName, r.key + (r.kind === 'pitched' || r.bank !== 128 ? ' ' + measure.noteName(r.key) : ''), sampleLabel(r), pitch,
      msOf(o.t10) + ' / ' + msOf(o.t50), r.lufs.map(function (v) { return fx(v, 1); }).join(' / '), r.centroid.join(' / '), fx(r.hf25, 0) + ' / ' + fx(r.hf8, 0),
      r.t20 === null ? 'over ' + (r.kind === 'pitched' ? '5' : 'its slot') : fx(r.t20, 2), length, layers, fx(r.corr, 2) + ', ' + (r.balanceDb >= 0 ? '+' : '') + fx(r.balanceDb, 1), fx(r.floorDb, 0), loop, notesFor(r, e.same)].join(' | ') + ' |');
  }
  return lines;
}

function zonesOf(result) {
  const lines = ['| library | keys | recording | LUFS at 0.6 | 50% point ms | centroid Hz | energy above 150 Hz | 20 dB down after s (held 1.5 s; - is longer) |', '|---|---|---|---|---|---|---|---|'];
  for (const font of FONT_NAMES) {
    const groups = [];
    for (const m of result.bassMap.filter(function (x) { return x.font === font; })) {
      const g = groups.length && groups[groups.length - 1].sample === m.sample ? groups[groups.length - 1] : null;
      if (g) { g.items.push(m); } else { groups.push({ sample: m.sample, items: [m] }); }
    }
    for (const g of groups) {
      const range = function (f, d) { const v = g.items.map(f).filter(function (x) { return typeof x === 'number'; }); return v.length ? fx(Math.min.apply(null, v), d) + ' to ' + fx(Math.max.apply(null, v), d) : '-'; };
      lines.push('| ' + [font, g.items[0].key + ' ' + g.items[0].keyName + ' to ' + g.items[g.items.length - 1].key + ' ' + g.items[g.items.length - 1].keyName, g.sample,
        range(function (x) { return x.lufs; }, 1), range(function (x) { return x.t50 * 1000; }, 0), range(function (x) { return x.centroid; }, 0),
        range(function (x) { return x.above150; }, 0) + ' %', range(function (x) { return x.t20; }, 2)].join(' | ') + ' |');
    }
  }
  return lines;
}

function tuningOf(result) {
  const lines = [];
  for (const sc of result.scans) {
    const keys = sc.keys.filter(function (k) { return k.mainHz >= 43 && k.mainHz <= 68; });
    lines.push('- ' + sc.font + ' ' + presetId(sc.bank, sc.program) + ' ' + sc.presetName + ': ' + keys.map(function (k) { return k.key + ': ' + (k.lowHz !== k.mainHz ? fx(k.lowHz, 1) + ' and ' : '') + fx(k.mainHz, 1); }).join(', ') + ' Hz');
  }
  return lines;
}

const SHORTLIST = `
## 2. The shortlist, job by job

Numbers are at velocity 0.6 and gain 0.5 unless a line says otherwise. Every statement below is a measurement from the table or from the SoundFont's own structure; nobody has heard any of this.

### Bass: musescore 000-032 Acoustic Bass

fluidr3 000-032 is the same seven recordings (the samples carry the same names and measure the same pitch, onset and decay). The differences decide it.

- **Octave.** MIDI 40 sounds 82.4 Hz, which is E2, in both libraries: the bass sounds where it is written, not an octave lower. MIDI 28 sounds 41.2 Hz (E1).
- **Lowest usable note: MIDI 28 (E1).** It is the lowest recording and plays untransposed. Keys under 28 are that recording slowed down (MIDI 24: 32.7 Hz, 4 semitones down, 50 percent point at 20 ms). G3 (55), the top of the brief's range, is the top recording moved 5 semitones down.
- **Why musescore.** After a note-off its notes take 0.40 s to die (20 dB down in 0.08 to 0.10 s). The fluidr3 notes are gone in 0.12 s (20 dB down in 0.03 to 0.05 s): each walking note is cut off instead of ringing into the next. The musescore floor between the partials is lower (-73 to -83 dB against -68 to -78 dB). Its soft notes are a little darker (centroid at C4: 425, 522, 612 Hz at velocity 0.3, 0.6, 0.9); fluidr3 plays the identical spectrum at every velocity (0.0 dB change).
- **One recording per zone, no velocity layers, in both.** A harder note is the same pluck, louder. Variety has to come from note lengths, timing and level.
- **Attack.** 10 percent of the peak after 1.6 to 4.4 ms, but 50 percent only after 8 to 28 ms, and the peak after 13 to 97 ms. Keys 42 to 46 are the slowest (50 percent at 22 to 28 ms). On a HARD hit ask sampler.onsetDetail() for that key and velocity and start the note early.
- **Level steps between zones.** The zones on keys 30 to 36 and 42 to 46 are about 3 dB quieter than their neighbours at the same velocity (section 4 has every zone). A line that crosses 29/30, 36/37, 41/42 or 46/47 jumps 2 to 3.5 dB unless the velocity makes up for it: 3 dB is about 20 percent more velocity in fluidr3 (11.5 dB per doubling) and about 25 percent in musescore (9 dB per doubling).
- **Held notes.** 20 dB down after 3.6 s (E1), 2.3 s (A1, C2), 2.0 s (F2), 0.9 to 1.1 s (F#2 to Bb2), 0.65 to 0.96 s (B2 to C4). Each note reaches a short loop (11 to 61 ms long) 0.8 to 2.2 s after its start and is one frozen cycle from there, still decaying 3 to 12 dB a second. A quarter note at 120 BPM never gets there; a long last note does.
- **Small speakers: the low notes have almost nothing above 150 Hz.** From E1 to D2 only 1 percent of a note's energy is above 150 Hz, from Eb2 to F2 17 percent, from F#2 to D3 4 to 9 percent; only from Eb3 up, where the fundamental itself is above 150 Hz, nearly all of it (section 4). The brief wants the bass stem to keep a quarter of its energy there: a walking line in the low octave needs the harmonics added (dsp.saturate in the mix half) and then measured.
- **Mono, centred** (correlation 1.00) in both.
- **Not the pizzicato presets** (000-045 in both, and musescore 050-045, which measures the same as its 000-045): a string section, in stereo, 50 percent point at 48 to 77 ms, E1 17 to 21 cents flat, A1 11 to 13 cents flat, floor -42 to -69 dB.

### Piano: musescore 008-000 Mellow Grand Piano (or musescore 000-000 Grand Piano)

- **Dark enough for the brief.** Centroid at C4: Mellow 570 Hz, Grand 701 Hz, fluidr3 000-000 1491 Hz. The 2-5 kHz band sits 27 to 40 dB under the note's total in the Mellow Grand (20 dB at C6), 23 to 35 dB in the Grand, and only 5 to 19 dB in fluidr3 (9 dB at F4 and C5, 7 dB at F5). Above 8 kHz: musescore -77 to -95 dB, fluidr3 -30 to -62 dB.
- **Velocity changes the tone.** Both musescore pianos have two recorded layers, MF up to MIDI velocity 107 (vel 0.84) and FF from 108 (vel 0.85), and a filter that opens with velocity: the spectra at 0.3 and 0.9 differ by 8 to 16 dB. fluidr3 has one recording and the same spectrum at every velocity. Stay under 0.85 unless the FF recording is wanted.
- **Cleaner.** Floor between the partials: musescore -57 to -77 dB, fluidr3 -39 to -58 dB.
- **Attack.** musescore: 10 percent after 0.6 to 4.5 ms, 50 percent after 2.2 to 12 ms. fluidr3: 1.7 to 4.1 ms and 4.0 to 9.1 ms.
- **Release.** musescore: 20 dB down 0.13 to 0.19 s after the note-off, gone after 0.74 to 1.02 s. fluidr3: 0.12 s and 0.60 s.
- **A held note** from C4 up is 20 dB down after 0.6 to 1.1 s (it then lingers: not 60 dB down within 5 s); lower notes take 1.3 to 4.4 s.
- **The Mellow Grand is the Grand's recordings moved two keys down** (key 60 plays the D4 recording 2 semitones lower), which is where its darker tone comes from.
- **Trap, stereo.** All three pianos are wide stereo recordings whose notes sit in different places. fluidr3: correlation -0.54 to +0.77 (C4 -0.04, F4 -0.48, C5 -0.54): those notes lose up to 6 dB when L and R are summed. musescore Grand: -0.23 to +0.95 (from C4 up 0.68 to 0.95, below mostly under 0.5), and single notes lean up to 6.5 dB to one side (D4 6.5 dB right, F4 4.8 dB left, C6 6.2 dB left). Narrow the piano before panning it and measure the keys stem's mono loss.
- **Trap, level.** The "Piano MF C4" recording (Grand keys 72 to 74, Mellow keys 70 to 72) is 4 to 6 dB louder than its neighbours at the same velocity (Grand at 0.6: C5 -36.7 LUFS, Bb4 -42.3, C4 -42.4).
- **Trap, tuning.** The musescore pianos are stretch tuned like a real piano: C2 about 17 cents flat, G2 11 to 12 cents flat, C3 to C5 within 5 cents, A3 219.6 Hz. The bass is within 1.1 cents of equal temperament, so a low piano note against the bass will beat. fluidr3 is within 6 cents everywhere.
- **Trap, silence.** MIDI velocities 1 and 2 (vel under 0.02) play nothing in the musescore pianos.
- **fluidr3 000-000 is the wrong piano for this brief** by its measurements: bright, the noisiest floor, one layer, and notes that cancel in mono.

### Vibraphone: musescore 000-011 (mono, centred) or fluidr3 000-011 (the same recordings in mild stereo, correlation 0.64 to 0.88)

- Dark: 2-5 kHz band 22 to 46 dB under the total, above 8 kHz -63 to -84 dB. Centroid 431 Hz (F3) to 1179 Hz (C6).
- Velocity opens a filter: the spectra at 0.3 and 0.9 differ by 9 to 20 dB. One recording per zone.
- Attack: 10 percent after 2.2 to 3.9 ms. 50 percent after 2.3 to 4.0 ms in fluidr3 and 3.0 to 12.6 ms in musescore.
- Held note: 20 dB down after 1.75 s (F3) to 0.8 s (C6), 60 dB down after 4.85 s to 2.5 s.
- Release: fluidr3 20 dB down in 0.15 s, gone in 0.57 s; musescore 0.21 s and 0.95 s.
- Tuning within 6 cents (F4 4.5 flat, G4 5.7 sharp).
- **Motor tremolo is built in.** The preset has an LFO on the level (4.2 Hz, the same in both libraries): a held C4 ripples 3.9 dB peak to peak at a measured 4.26 Hz. It is not tied to the tempo (120 BPM is 2 Hz a beat, 4 Hz an eighth), so it drifts slowly against the beat.
- **Warning: static tone.** Under that tremolo every note reaches a loop 0.12 to 0.42 s after the attack (2.5 to 86 ms long) and is one frozen cycle from there, decaying 13 to 15 dB a second.
- **Warning: F4.** The recording on keys 64 to 66 is about 4 dB quieter than its neighbours and brighter (centroid at F4 628 Hz against 493 and 566 Hz at Eb4 and G4).

### Electric pianos and celesta (colours, not the main keys)

- **000-004 (Rhodes; musescore "Tine Electric Piano" is the same recordings in mono).** Dark (2-5 kHz 27 to 58 dB under the total) and the fastest attack here (10 percent after 0.2 to 0.5 ms). But velocity is gain only (0.0 to 1.9 dB change), low notes do not decay (G2 -0.3 dB/s and C3 -0.5 dB/s once in the loop: a drone if held), and a note stops 0.12 s after its note-off. In fluidr3 it is panned by key: C2 11 dB to the left, G5 4.5 dB to the right.
- **000-005: not recommended.** fluidr3 "Legend EP 2": one recording stretched over every key up to 53 with no loop, its peak 139 to 279 ms late on low notes, 4 to 8 cents flat from C3 up. musescore "FM Electric Piano": an FM synthesiser's recordings ("DX7 Strike", "DX7 Wave"), which is the synthetic sound the speaker complained about.
- **000-008 Celesta** (the same in both; musescore mono): 10 percent after 1.1 to 1.9 ms, 20 dB down after 0.63 to 0.70 s, and it rings on for 1.9 to 2.0 s after the note-off whatever the note length. C6 is 10 cents sharp. Its 2-5 kHz band is 23 to 43 dB under the total.

### Brushes: kit 128-040 Brush, keys 38, 39, 40

fluidr3 128-040 is the stereo original (correlation 0.87 to 0.97); musescore 128-040 is the same three recordings in mono and about 6 dB louder at the same gain. Kits 128-041 and 128-042 render these keys identically (see the notes column): the three Brush kits differ only in their kick.

- **Key 38 is the TAP** ("Brush Snr 1"). The recording is 0.34 s long; 10 percent after 1.6 ms, 50 percent after 4.4 ms; 20 dB down after 0.08 s. Centroid 3.5 kHz.
- **Key 39 is the SLAP** ("Brush Snr 2"). 0.59 s long, 2.3 dB louder than the tap at the same velocity; 10 percent after 1.8 ms, 50 percent after 6.8 ms; 20 dB down after 0.09 s, 60 dB after 0.38 s. Centroid 4.0 kHz.
- **Key 40 is the SWIRL** ("Brush Swirl"). A one-shot 0.60 s long, 4.3 dB quieter than the tap, with the slowest attack (10 percent after 4.1 ms, 50 percent after 10.6 ms). It is 20 dB down after 0.18 s and 60 dB down after 0.56 s. **Holding the key does not lengthen it** (a held note and a 0.1 s note differ by -66 dB). It cannot make a continuous swirl alone. A second strike does not cut the first (the two add), but six strokes 0.25 s apart are still six separate bursts in the spectrogram (png/brushes-fluidr3.png, right-hand side). For a steady "shhh", make the steady part from filtered noise in the mix half and use key 40 for the strokes.
- **Trap: the wrong kit.** In Standard 128-000 and Jazz 128-032, keys 38 and 40 are stick snares and **key 39 is a hand clap**. The Jazz kit has no brushes at all.
- **Trap: machine-gun.** One recording per key at every velocity; between 0.3 and 0.9 the spectrum changes only 1.4 to 1.9 dB (centroid of the tap 3527 Hz, then 4059 Hz at 0.9). Two equal hits are the same waveform. Vary velocity and timing, and alternate 38 and 39.
- **Trap: the harsh band.** The 2-5 kHz band is only 5 to 6 dB under each brush hit's total, and above 8 kHz 19 to 22 dB under. Keep them low and consider a dip there.
- **Trap: rumble.** The swirl has 5 percent of its energy under 60 Hz (-13 dB re its total). High-pass the brushes.
- Velocity range: 21 dB between 0.3 and 0.9 in fluidr3 (tap -55.4 to -34.2 LUFS), 18 dB in musescore (-47.3 to -29.3).

### Kick (feathered at most): 128-040 keys 35 and 36

- **128-040 and 128-032, "Std Kick 7":** the darkest (centroid 403 to 409 Hz, above 3 kHz -46 dB in fluidr3 and -40 dB in musescore), lowest partial 39 to 41 Hz, 20 dB down after 0.09 to 0.10 s, over at 0.38 to 0.40 s. 10 percent after 3.4 to 3.7 ms, 50 percent after 8.1 to 8.3 ms. About 80 percent of its energy is under 60 Hz and the 100-200 Hz band is 10 dB under the total: it adds weight and will be nearly absent on small speakers, which is what feathering wants.
- **128-041, "Std Kick 5":** the shortest (20 dB down after 0.07 s, over at 0.24 s) with the most 60-100 Hz (3 to 5 dB under its total): the one to pick if the kick must be found on small speakers.
- **128-042, "Std Kick 1":** the clickiest (centroid 819 to 829 Hz, above 3 kHz -32 dB), lowest partial 44 to 47 Hz.
- Keys 35 and 36 are one recording a semitone apart: alternate them against machine-gun repeats. One recording at every velocity.

### Ride: key 51 ("Ride1")

- The same recording in every kit. Its level differs: in fluidr3 it is 3.2 dB quieter in the Standard kit than in the Jazz and Brush kits, in musescore 9.4 dB quieter.
- 10 percent after 1.1 ms, 50 percent after 1.5 ms. 2.58 s long, 20 dB down after 0.50 s, 60 dB after 1.95 s. A note-off hardly damps it.
- **Warning: it is the brightest thing in the kit.** Centroid 7.0 to 7.2 kHz; the 2-5 kHz band is 3 to 4 dB under its total and the band above 8 kHz 5 to 6 dB under. The brief wants the mix's energy above 8 kHz 30 dB under the total: play it softly, filter it, and check the drums stem.
- Velocity is gain only (0.0 dB change): no difference between a soft and a hard stroke except level.
- **Key 53, the bell** ("BellRide"): centroid 4.9 kHz (fluidr3) and 5.7 kHz (musescore), the 2-5 kHz band only 2 dB under its total, 3.29 s long, wide in fluidr3 (correlation 0.50). **Key 59** ("Ride2"): 2.94 s long, 20 dB down after 0.43 s, about 1.2 dB quieter than key 51 and with more above 8 kHz (3 to 4 dB under its total).

### Pedal hat: key 44 ("Hi-Hat Foot")

- 0.51 s long, 20 dB down after 0.09 to 0.10 s. 10 percent after 0.5 to 0.6 ms, 50 percent after 2.2 ms.
- **Warning: almost all of it is above 8 kHz** (that band is 2 dB under its total; centroid 10.7 kHz). At any useful level it needs a low-pass.
- Keys 42, 44 and 46 are one exclusive group: a pedal hat cuts a ringing open hat, and a second pedal hat cuts the first.
- fluidr3: wide (correlation 0.37) and 2.9 dB to the right. musescore: mono.

### The NO thud

The brief asks for a pitched low drum with a 45 to 60 Hz fundamental, a fast pitch drop, body at 100 to 200 Hz and at most a short dark rattle. synth.thud() in the mix half is built to those numbers. If a sampled drum is wanted, alone or under it:

- **musescore 008-116 Concert Bass Drum, keys 45 to 62** (main partial 49.8 to 60.5 Hz, about 0.6 Hz a key; a weaker partial at 0.71 of that). The best body of the candidates: sub, 60-100 Hz and 100-200 Hz bands each 4 to 7 dB under the total, so small speakers still give it. 20 dB down after 0.34 to 0.35 s, 60 dB after 0.93 to 1.04 s. 10 percent after 3.6 to 4.3 ms, 50 percent after 5.5 to 8.4 ms. It has a beater: 2-5 kHz 26 dB under the total, above 3 kHz -38 to -40 dB; low-pass it at 3 kHz as the brief says. Mono. (fluidr3 008-116 is the same drum in wide stereo, correlation 0.65: its low end is not centred. The Orchestra kit 128-048 keys 35 and 36 are this drum at 42.6 to 45.1 Hz, under the target.)
- **000-116 Taiko, keys 39 to 49** (45.5 to 60.7 Hz, the same in both libraries). A real pitch drop: the low band's zero-crossing rate falls from 69 to 45 Hz (key 39), 75 to 53 Hz (key 44), 92 to 61 Hz (key 49). Nothing above 3 kHz (-74 dB), centroid 170 to 218 Hz. But the 100-200 Hz band is 11 to 13 dB under the total: on its own it is mostly sub. 20 dB down after 0.47 to 0.58 s. 10 percent after 4.7 to 6.2 ms, 50 percent after 5.8 to 7.8 ms.
- **000-047 Timpani, keys 30 to 35** (46 to 58 Hz, at written pitch: key 31 is G1 at 49 Hz). The most "musical" and the longest: 20 dB down after 0.5 to 0.8 s, 60 dB after 1.8 to 2.8 s, ringing 3.6 to 5.2 s. Strong body (100-200 Hz 3 to 10 dB under the total), very dark (above 3 kHz -52 to -60 dB). A steady pitch, no drop. Slowest attack: 10 percent after 4.6 to 6.6 ms, 50 percent after 8.5 to 12.5 ms.
- **Kit key 41, the low floor tom** (52.4 Hz, zero-crossing rate 111 then 52 Hz, stick attack: 50 percent after 1.3 ms). The recording stops at 1.00 s while only 43 dB down: fade it out.
- **000-117 Melodic Tom, keys 12 to 22** (45.8 to 60.5 Hz): a high tom slowed 14 to 19 semitones. It measures like a low drum but is a recording played 2.2 to 3 times too slowly. Last choice.
- **Never keys 49, 57 (crashes) or 128-048 keys 57, 59 ("Orchcrash")**: 5.7 to 8.5 s of energy centred at 6.4 kHz.
- For the three HARD hits: every candidate reaches 10 percent within 3.4 to 8.0 ms and 50 percent within 5.5 to 12.5 ms of its note-on. Start it early by its own onset.

## 3. Warnings, in one place

1. **Key 39 is a hand clap** in the Standard and Jazz kits. Brushes exist only in 128-040, 128-041, 128-042.
2. **The swirl is a 0.6 s one-shot**, 20 dB down after 0.18 s. Holding the key does nothing.
3. **One recording per drum key.** Equal hits are identical waveforms.
4. **Ride and hats are far brighter than the brief's mix target** (ride centroid 7 kHz, pedal hat 10.7 kHz).
5. **fluidr3 000-000 piano:** bright, noisy, one velocity layer, and notes whose channels cancel when summed.
6. **musescore pianos:** FF recording from vel 0.85; one recording 4 to 6 dB too loud; stretch tuning in the bass register; vel under 0.02 silent; wide stereo with notes leaning up to 6.5 dB.
7. **Bass:** the fluidr3 note stops within 0.12 s of its note-off; both libraries step about 3 dB between zones; 50 percent point 8 to 28 ms; no velocity layers.
8. **Rhodes 000-004:** low notes do not decay; notes stop 0.12 s after the note-off; fluidr3 pans it by key.
9. **Vibraphone:** a frozen loop from 0.12 to 0.42 s on, under a built-in 4.2 Hz tremolo of 3.9 dB.
10. **Low floor tom (key 41):** cut off at 1.00 s, 43 dB down.
11. **Hi-hat keys 42, 44, 46 cut each other.**
12. **The two libraries are not level-matched.** The same preset at the same gain and velocity differs by up to 10 dB between them (musescore pianos 3 to 7 dB quieter than fluidr3's, musescore Brush kit about 6 dB louder). Set every stem's level by measuring it.
13. **A preset that does not exist is an Error** (fluidsynth alone would quietly play another). 008-000 Mellow Grand exists only in musescore.
14. **Celesta rings about 2 s after its note-off.**
`;

/* What the builder of this kit saw in the pictures (2026-11-13). It is a record of one look, not a measurement:
 * if the pictures are drawn again from changed presets, look again and rewrite it. */
const LOOKED = [
  'What was seen in them (eight of the ten were opened and looked at; `bass-fluidr3.png` and `thud-timpani-musescore.png` were drawn but not looked at):',
  '',
  '- `bass-musescore.png`: ten walking notes, each a clean stack of partials with black between them (no hiss band), then a C2 held 4 s: from about 1.2 s into it the picture turns into perfectly even horizontal bands that only fade. That is the loop the table gives at 1.17 s.',
  '- `piano-mellow-musescore.png`: one chord at velocity 0.3, 0.6, 0.9. The partials reach about 1.5 kHz, then 4 kHz, then 9 kHz: the velocity changes the tone, as measured. Black between the partials.',
  '- `piano-fluidr3.png`: the same chord. The partials reach 7 to 10 kHz at every velocity and only get fainter, and there is a haze between them from 1 to 6 kHz that the musescore picture does not have: one recording, brighter, noisier.',
  '- `vibraphone-musescore.png`: C4, G4, C5. One strong band at the fundamental and a few thin lines far above it, and the fundamental is beaded at an even rate: the 4.2 Hz tremolo.',
  '- `brushes-fluidr3.png`: tap, slap and swirl at three velocities, then six swirls 0.25 s apart. The tap and the slap are short broadband bursts with their weight at 150 to 600 Hz; the slap has a ringing band near 400 Hz for about 0.3 s. The swirl is noise from 400 Hz to 8 kHz for about half a second, with energy under 100 Hz as well (the rumble). The six swirls stay six bursts with gaps.',
  '- `ride-hat-kick-fluidr3.png`: three ride strokes with the same pattern, only brighter in colour as the velocity rises; their energy runs from 300 Hz to the top of the picture and is densest from 2 to 10 kHz. The bell is a few strong lines at 2 to 3 kHz ringing about 2.5 s. The pedal hats are thin lines that reach 16 kHz. The kicks are a short patch under 200 Hz. Nothing repeats periodically: no loops.',
  '- `thud-concert-bass-drum-musescore.png`: a beater attack up to 6 to 10 kHz that is gone above 1 kHz within 0.3 s, body from 100 to 250 Hz, and a low end that rings 1 to 1.5 s.',
  '- `thud-taiko-musescore.png`: nothing above about 2.4 kHz even at the attack; nearly all of it under 200 Hz, ringing 1.4 to 1.8 s.'
];

function report(result) {
  const out = [];
  out.push('# The audition: every preset worth considering, measured');
  out.push('');
  out.push('Made by `node tools/score/lib/audition.js` (fluidsynth ' + result.fluidsynth + ', 48 kHz, reverb and chorus off, 7th-order interpolation, master gain ' + result.gain + '). The numbers are in `data.json` beside this file; the onsets are also in `onsets.json`, where `sampler.onset()` finds them. Nobody has heard any of this: it is all measurement. The shortlist is section 2, the warnings section 3.');
  out.push('');
  out.push('## 1. The table');
  out.push('');
  out.push('How to read a row (' + result.rows.filter(function (r) { return !r.silent; }).length + ' sounds were measured; rows that render bit for bit like another kit\'s are folded into one, see notes):');
  out.push('');
  out.push('- **key**: the MIDI note. For a drum kit it is the drum key; the recording\'s own name is given because General MIDI key names mislead here.');
  out.push('- **recording (semitones moved)**: the sample the SoundFont plays for this key, and how far it is transposed from the pitch it was recorded at.');
  out.push('- **pitch**: tuned instruments: the measured fundamental and its error in cents against equal temperament at A = 440. Low drums: the strongest partial under 400 Hz (and a lower one within 12 dB if there is one), and the zero-crossing rate of the band under 300 Hz in the first 70 ms and then at 0.2 to 0.4 s (a falling pair is a pitch drop).');
  out.push('- **onset 10% / 50% ms**: from the note-on to 10 and to 50 percent of the peak of max(|L|, |R|), at velocity 0.6. `sampler.onset()` returns the 10 percent figure.');
  out.push('- **LUFS**: BS.1770 integrated loudness of one note at velocity 0.3, 0.6, 0.9 (MIDI 38, 76, 114): the first 3 s of a held note, or the whole drum hit. For comparing, not for setting levels.');
  out.push('- **centroid**: spectral centroid of the first second, 20 Hz to 20 kHz, weighted by magnitude, at the three velocities. Three equal numbers mean the velocity changes nothing but the level.');
  out.push('- **2-5 kHz / above 8 kHz**: the energy of those bands against the sound\'s total, velocity 0.6.');
  out.push('- **20 dB down after**: tuned instruments: a note held 5 s; from then on its level (20 ms windows) stays more than 20 dB under its peak. Drums: the same for one hit (10 ms windows).');
  out.push('- **length**: tuned instruments: "release a / b": after the note-off of a 0.4 s note, a seconds to fall 20 dB and b seconds to digital silence. Drums: when the hit ends in digital silence.');
  out.push('- **velocity**: how many different recordings the velocities 1 to 127 reach (from the SoundFont), and how much the third-octave spectrum changes between velocity 0.3 and 0.9 once the level is taken out. "1, 0.0" is one recording at a different gain.');
  out.push('- **stereo**: L/R correlation of the first second (1.00 is mono) and the level of L against R.');
  out.push('- **floor**: tuned instruments: the median spectral density between the partials (0.5 to 8 kHz, taken as flat noise over that band) against the note, 0.3 to 1.3 s into it: the lower, the cleaner. Drums: the level of the last 30 ms before the recording ends, against its peak (a recording that stops before about -50 dB is cut off).');
  out.push('- **loop**: where the loop starts, how long it is, and how fast the note decays once in it. A short loop with a slope near 0 dB/s is a drone.');
  out.push('');
  for (const l of tableOf(result)) { out.push(l); }
  out.push(SHORTLIST);
  out.push('## 4. Two reference lists');
  out.push('');
  out.push('### The acoustic bass zone by zone (every key from 24 to 60 at velocity 0.6)');
  out.push('');
  for (const l of zonesOf(result)) { out.push(l); }
  out.push('');
  out.push('"Energy above 150 Hz" is the share of one note\'s energy above 150 Hz in its first second (the brief wants the bass stem to keep a quarter there).');
  out.push('');
  out.push('### Tuning the low drums (key: strongest partial under 400 Hz, with a lower partial within 12 dB of it where there is one; velocity 0.8; keys that land between 43 and 68 Hz)');
  out.push('');
  for (const l of tuningOf(result)) { out.push(l); }
  out.push('');
  const pics = path.join(OUT_DIR, 'png');
  if (fs.existsSync(pics) && fs.readdirSync(pics).some(function (f) { return /\.png$/.test(f); })) {
    out.push('## 5. Pictures');
    out.push('');
    out.push('Spectrograms of the shortlist (log frequency 20 Hz to 16 kHz, 90 dB range), made by `node tools/score/lib/audition.js --pictures`:');
    out.push('');
    for (const f of fs.readdirSync(pics).filter(function (x) { return /\.png$/.test(x); }).sort()) { out.push('- `png/' + f + '`'); }
    out.push('');
    for (const l of LOOKED) { out.push(l); }
    out.push('');
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'audition.md'), out.join('\n') + '\n');
  return path.join(OUT_DIR, 'audition.md');
}

/* ---------------------------------------------------------------- pictures of the shortlist */
function writeFloatWav(file, st) {
  const n = st[0].length, b = Buffer.alloc(44 + n * 8);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + n * 8, 4); b.write('WAVEfmt ', 8, 'latin1'); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36, 'latin1'); b.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { b.writeFloatLE(st[0][i], 44 + 8 * i); b.writeFloatLE(st[1][i], 48 + 8 * i); }
  fs.writeFileSync(file, b);
}
const PICTURES = [
  { name: 'bass-musescore', font: 'musescore', bank: 0, program: 32, seconds: 10, notes: [28, 31, 33, 36, 40, 43, 45, 48, 52, 55].map(function (k, i) { return { t: 0.25 + 0.5 * i, dur: 0.45, midi: k, vel: 0.5 + 0.04 * (i % 4) }; }).concat([{ t: 5.5, dur: 4, midi: 36, vel: 0.6 }]) },
  { name: 'bass-fluidr3', font: 'fluidr3', bank: 0, program: 32, seconds: 10, notes: [28, 31, 33, 36, 40, 43, 45, 48, 52, 55].map(function (k, i) { return { t: 0.25 + 0.5 * i, dur: 0.45, midi: k, vel: 0.5 + 0.04 * (i % 4) }; }).concat([{ t: 5.5, dur: 4, midi: 36, vel: 0.6 }]) },
  { name: 'piano-mellow-musescore', font: 'musescore', bank: 8, program: 0, seconds: 9, notes: [0.3, 0.6, 0.9].reduce(function (a, v, i) { return a.concat([51, 55, 58, 62].map(function (k) { return { t: 0.25 + 3 * i, dur: 1.5, midi: k, vel: v }; })); }, []) },
  { name: 'piano-fluidr3', font: 'fluidr3', bank: 0, program: 0, seconds: 9, notes: [0.3, 0.6, 0.9].reduce(function (a, v, i) { return a.concat([51, 55, 58, 62].map(function (k) { return { t: 0.25 + 3 * i, dur: 1.5, midi: k, vel: v }; })); }, []) },
  { name: 'vibraphone-musescore', font: 'musescore', bank: 0, program: 11, seconds: 9, notes: [60, 67, 72].map(function (k, i) { return { t: 0.25 + 3 * i, dur: 2.5, midi: k, vel: 0.6 }; }) },
  { name: 'brushes-fluidr3', font: 'fluidr3', bank: 128, program: 40, seconds: 9, notes: [38, 39, 40].reduce(function (a, k, i) { return a.concat([0.3, 0.6, 0.9].map(function (v, j) { return { t: 0.25 + 0.75 * (3 * i + j), midi: k, vel: v }; })); }, []).concat([0, 1, 2, 3, 4, 5].map(function (i) { return { t: 7.25 + 0.25 * i, midi: 40, vel: 0.4 + 0.05 * (i % 3) }; })) },
  { name: 'ride-hat-kick-fluidr3', font: 'fluidr3', bank: 128, program: 40, seconds: 12, notes: [{ t: 0.25, midi: 51, vel: 0.3 }, { t: 1.25, midi: 51, vel: 0.6 }, { t: 2.25, midi: 51, vel: 0.9 }, { t: 5, midi: 53, vel: 0.6 }, { t: 8.5, midi: 44, vel: 0.6 }, { t: 9.25, midi: 44, vel: 0.9 }, { t: 10, midi: 36, vel: 0.4 }, { t: 10.75, midi: 35, vel: 0.7 }] },
  { name: 'thud-concert-bass-drum-musescore', font: 'musescore', bank: 8, program: 116, seconds: 7.5, notes: [{ t: 0.25, dur: 1, midi: 48, vel: 0.6 }, { t: 2.75, dur: 1, midi: 55, vel: 0.9 }, { t: 5.25, dur: 1, midi: 61, vel: 0.9 }] },
  { name: 'thud-taiko-musescore', font: 'musescore', bank: 0, program: 116, seconds: 7.5, notes: [{ t: 0.25, dur: 1, midi: 39, vel: 0.9 }, { t: 2.75, dur: 1, midi: 44, vel: 0.9 }, { t: 5.25, dur: 1, midi: 49, vel: 0.9 }] },
  { name: 'thud-timpani-musescore', font: 'musescore', bank: 0, program: 47, seconds: 12, notes: [{ t: 0.25, dur: 3, midi: 31, vel: 0.9 }, { t: 6.25, dur: 3, midi: 34, vel: 0.9 }] }
];
function pictures() {
  const sampler = require('./sampler.js');
  const dir = path.join(OUT_DIR, 'png');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kit-audition-'));
  const made = [];
  try {
    for (const p of PICTURES) {
      const st = sampler.render({ font: p.font, bank: p.bank, program: p.program, notes: p.notes, seconds: p.seconds });
      const wav = path.join(tmp, p.name + '.wav'), png = path.join(dir, p.name + '.png');
      writeFloatWav(wav, st);
      const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-lavfi', 'showspectrumpic=s=1400x560:mode=combined:color=intensity:scale=log:fscale=log:drange=90:legend=1:start=20:stop=16000', png], { encoding: 'utf8' });
      if (r.status !== 0) { throw new Error('audition: ffmpeg could not draw ' + p.name + ': ' + (r.stderr || '')); }
      made.push(png);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return made;
}

module.exports = { measure: measure, sf: sf, run: run, report: report, pictures: pictures, thePlan: thePlan };

if (require.main === module) {
  const args = process.argv.slice(2);
  const onlyAt = args.indexOf('--only');
  if (onlyAt >= 0) {
    console.log(JSON.stringify(run({ only: args[onlyAt + 1].split(',') }).rows, null, 1));
  } else {
    if (args.indexOf('--pictures') >= 0) { for (const f of pictures()) { console.log('wrote ' + f); } }
    /* --report: write audition.md again from the stored data.json, without rendering anything */
    const result = args.indexOf('--report') >= 0 || args.indexOf('--pictures') >= 0 ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'data.json'), 'utf8')) : run();
    console.log('wrote ' + report(result));
  }
}
