/*
 * tools/score/lib/synth.js: the few sounds that are not instruments.
 *
 *   const synth = require('./synth.js');
 *   synth.thud({ hz: 55, size: 1, rattle: 0.3, seed: 1 })   -> Stereo, about 1.5 s: the NO shutter
 *   synth.roomTone({ db: -68, seed: 1 })                     -> Stereo, N long: soft pink noise
 *
 * Place a thud with mix.add(dest, synth.thud({...}), { at: 8, db: -3 }).
 *
 * The thud is the modelled build's (tools/score/modelled/build.js, "The NO"),
 * lifted, with three changes so it meets BRIEF.md section 4.3 by measurement:
 * two harmonic body partials (the octave and the twelfth, 2x and 3x the
 * fundamental: 110 and 165 Hz at 55 Hz) so the pitch survives a small speaker,
 * a 24 dB an octave low-pass at 3 kHz over all of it, and a known peak level.
 */
'use strict';

const { SR, N } = require('./const.js');
const dsp = require('./dsp.js');
const TAU = Math.PI * 2;

function num(v, lo, hi, what) {
  if (!Number.isFinite(v) || v < lo || v > hi) { throw new Error(what + ' must be a number from ' + lo + ' to ' + hi + ', not ' + v); }
  return v;
}
function peakOf(b) { let p = 0; for (let i = 0; i < b.length; i++) { const v = Math.abs(b[i]); if (v > p) { p = v; } } return p; }
function noiseBuf(n, r) { const b = new Float64Array(n); for (let i = 0; i < n; i++) { b[i] = r() * 2 - 1; } return b; }
/* A de-click: a raised-cosine fade over the first `a` and last `z` seconds (the modelled build's edges()). */
function edges(buf, a, z) {
  const na = Math.max(1, Math.round(a * SR)), nz = Math.max(1, Math.round(z * SR));
  for (let i = 0; i < Math.min(na, buf.length); i++) { buf[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / na); }
  for (let i = 0; i < Math.min(nz, buf.length); i++) { buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / nz); }
  return buf;
}

/*
 * The NO: a pitched low drum with a fast pitch drop, and a short dark rattle.
 *
 *   hz:     the fundamental it settles on. 45 to 60 is the brief's range (default 55, the note A1).
 *           It starts 1.9 times higher and falls with a 20 ms time constant: within 5 percent of hz after 60 ms.
 *   size:   how big the shutter is: 1 is NO 1. Bigger rings longer (the fundamental's decay is 0.22 + 0.1 * size
 *           seconds), is a little louder (0.8 + 0.2 * size) and longer (1.1 + 0.4 * size seconds).
 *   rattle: 0 to 1: the slats settling, a few short metal ticks in the first third of a second, panned a
 *           little left and right. 0 is none; 0.3 is the modelled build's level; it is always low-passed at 3 kHz.
 *   body:   0 to 2 (default 1): the level of the two harmonic partials at 2 and 3 times hz, which carry the
 *           pitch on speakers that cannot play the fundamental.
 *   seed:   a whole number: another mallet and another rattle.
 *
 * Returns a Stereo that starts at its first sample (the level reaches half its peak within about 3 ms; see
 * README-mix.md for the measured onset) and peaks at exactly -6 dBFS times (0.8 + 0.2 * size). The drum is
 * the same in both channels (the low end stays centred); only the rattle is spread.
 */
function thud(opts) {
  const o = opts || {};
  const hz = num(o.hz === undefined ? 55 : o.hz, 30, 120, 'synth.thud: hz');
  const size = num(o.size === undefined ? 1 : o.size, 0.25, 2.5, 'synth.thud: size');
  const rattle = num(o.rattle === undefined ? 0.3 : (o.rattle === false ? 0 : (o.rattle === true ? 0.3 : o.rattle)), 0, 1, 'synth.thud: rattle');
  const body = num(o.body === undefined ? 1 : o.body, 0, 2, 'synth.thud: body');
  const seed = o.seed === undefined ? 1 : o.seed;
  if (!Number.isInteger(seed) || seed < 0) { throw new Error('synth.thud: seed must be a whole number, 0 or more'); }
  const r = dsp.rng(seed * 1000003 + 8000);
  const len = Math.round((1.1 + 0.4 * size) * SR);
  const sig = new Float32Array(len);
  // [frequency ratio, level, decay in seconds]: the membrane (lifted), then the harmonic body
  const modes = [[1, 1, 0.22 + 0.1 * size], [1.59, 0.32, 0.1], [2.14, 0.14, 0.05], [2, 0.55 * body, 0.16], [3, 0.34 * body, 0.11]];
  const ph = modes.map(() => 0);
  const mallet = noiseBuf(Math.round(0.06 * SR), r);
  dsp.biquad(mallet, 'lp', 600, 0.7); dsp.biquad(mallet, 'lp', 600, 0.7);
  const mp = peakOf(mallet) || 1;
  for (let i = 0; i < len; i++) {
    const u = i / SR;
    const bend = 1 + 0.9 * Math.exp(-u / 0.02);
    const att = u < 0.0025 ? 0.5 - 0.5 * Math.cos(Math.PI * u / 0.0025) : 1;
    let v = 0;
    for (let k = 0; k < modes.length; k++) {
      ph[k] += TAU * hz * modes[k][0] * bend / SR;
      v += Math.sin(ph[k]) * modes[k][1] * Math.exp(-u / modes[k][2]);
    }
    if (i < mallet.length) { v += mallet[i] / mp * 0.16 * Math.exp(-u / 0.012); }
    sig[i] = v * att;
  }
  edges(sig, 0.0003, 0.3);
  const out = [new Float32Array(len), new Float32Array(len)];
  const g = 0.9 * (0.8 + 0.2 * size);
  for (let i = 0; i < len; i++) { out[0][i] = sig[i] * g; out[1][i] = sig[i] * g; }
  if (rattle > 0) {
    // the slats settling: a few short metal ticks, closer then further apart, dying away
    const parts = [640, 1013, 1377, 1904, 2470];
    let u = 0.006, gap = 0.022, k = 0;
    while (u < 0.34) {
      const amp = Math.exp(-u / 0.12) * (0.6 + 0.4 * r());
      const det = 1 + (r() - 0.5) * 0.08;
      const len2 = Math.round(0.07 * SR);
      const tick = new Float32Array(len2);
      for (let i = 0; i < len2; i++) {
        const v = i / SR;
        let s = 0;
        for (let p = 0; p < parts.length; p++) { s += Math.sin(TAU * parts[p] * det * v + p) * (1 - p * 0.16) * Math.exp(-v / (0.03 - p * 0.004)); }
        tick[i] = s * (1 - Math.exp(-v / 0.0007));
      }
      dsp.biquad(tick, 'lp', 3000, 0.7); dsp.biquad(tick, 'lp', 3000, 0.7);
      edges(tick, 0.0003, 0.01);
      const level = 0.022 * (rattle / 0.3) * amp;
      const th = ((k % 2 ? 0.25 : -0.25) + 1) * Math.PI / 4;
      const gl = Math.cos(th) * Math.SQRT2 * level, gr = Math.sin(th) * Math.SQRT2 * level;
      const s0 = Math.round(u * SR);
      for (let i = 0; i < len2 && s0 + i < len; i++) { out[0][s0 + i] += tick[i] * gl; out[1][s0 + i] += tick[i] * gr; }
      u += gap * (0.7 + 0.6 * r()); gap *= 1.18; k++;
    }
  }
  dsp.butter(out, 'lp', 3000, 4);                 // nothing above 3 kHz: never a crash
  for (const ch of out) { dsp.biquad(ch, 'hp', 28, 0.7); }   // as the modelled build's sfx bus
  const pk = dsp.peak(out) || 1;
  const want = 0.5 * (0.8 + 0.2 * size);
  for (const ch of out) { for (let i = 0; i < len; i++) { ch[i] *= want / pk; } edges(ch, 0.0002, 0.05); }
  return out;
}

/* Pink noise (3 dB an octave down), unit-ish level: white Gaussian noise through Paul Kellet's filter. */
function pink(n, r) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  const warm = 4800;                              // let the filter settle before the first sample that is kept
  for (let i = -warm; i < n; i++) {
    const w = dsp.gauss(r);
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    if (i >= 0) { out[i] = v * 0.11; }
  }
  return out;
}

/*
 * Room tone: soft, steady pink noise, so no stretch of the film is digital silence.
 *
 *   db:      the level, dBFS RMS over both channels (default -68). It is set exactly, after the filters.
 *   seed:    a whole number: another stretch of noise.
 *   seconds: the length (default the whole film: N samples).
 *
 * High-passed at 80 Hz and low-passed at 6 kHz (24 dB an octave each). Left and right are a common part plus
 * and minus a separate part that has no low end (it is high-passed at 300 Hz), so the two channels differ
 * (correlation about 0.6) yet the tone folds to mono without holes (it loses about 1 dB) and its low end is
 * centred. Measured numbers are in README-mix.md.
 *
 * It is NOT faded: it is steady from the first sample to the last. Remember that the master's gain moves it
 * with everything else: at -68 dBFS before a master that adds 4 dB it sits at -64 dBFS in final.wav.
 */
function roomTone(opts) {
  const o = opts || {};
  const level = o.db === undefined ? -68 : o.db;
  num(level, -120, -20, 'synth.roomTone: db');
  const seed = o.seed === undefined ? 1 : o.seed;
  if (!Number.isInteger(seed) || seed < 0) { throw new Error('synth.roomTone: seed must be a whole number, 0 or more'); }
  const n = o.seconds === undefined ? N : Math.round(num(o.seconds, 0.05, 3600, 'synth.roomTone: seconds') * SR);
  const r = dsp.rng(seed * 2654435761 + 97);
  const mid = pink(n, r), side = pink(n, r);
  dsp.biquad(side, 'hp', 300, 0.7071);
  const out = [new Float32Array(n), new Float32Array(n)];
  const K = 0.6;
  for (let i = 0; i < n; i++) { out[0][i] = mid[i] + K * side[i]; out[1][i] = mid[i] - K * side[i]; }
  dsp.butter(out, 'hp', 80, 4);
  dsp.butter(out, 'lp', 6000, 4);
  const g = dsp.lin(level) / (dsp.rms(out) || 1);
  for (const ch of out) { for (let i = 0; i < n; i++) { ch[i] *= g; } }
  return out;
}

module.exports = { thud, roomTone, pink };
