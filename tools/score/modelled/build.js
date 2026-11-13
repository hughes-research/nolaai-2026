#!/usr/bin/env node
/*
 * tools/score/modelled/build.js: the MODELLED candidate for the title film's score.
 *
 *   node tools/score/modelled/build.js        rebuild everything; exit 0 only if every self-check passes
 *
 * A cool-jazz trio, dry and understated: upright bass, brushes and ride, a few piano chords,
 * D minor, 120 BPM, eighths swung at 65 %. Every sound is synthesized here from physical
 * models: no samples, no fluidsynth, no libraries, nothing but Node. The arrangement is original.
 *
 * It writes, beside this file:
 *   final.wav                      48 kHz, stereo, 24-bit, exactly 2,208,000 samples a channel
 *   stems/{bass,keys,drums,fx}.wav each as it sits in the mix before the master bus; their sum,
 *                                  through the master, is final.wav (checked on every build)
 *   arrangement.json               the notes as actually played, after humanising
 *   analysis/self-checks.md        the table of checks printed below
 *
 * THE INSTRUMENTS
 *   Upright bass   A plucked string as a sum of its modes: each partial has its own level (where the
 *                  finger plucks, how soft the finger is, how hard it pulls), its own decay, and two
 *                  polarisations that beat slowly. The pitch starts sharp and settles; long notes get
 *                  a slow vibrato. A finger thump and a release tick, different on every note; the
 *                  left hand setting down. The next note stops this one the way a player does (the
 *                  same string: cut; another string: a short overlap). The other three open strings
 *                  ring in sympathy. All of it drives a body of 26 resonances.
 *   Piano          Each key has its own tuning, its own three strings a hair apart, its own uneven
 *                  partials (fixed for the instrument). Stiff-string inharmonicity measured from a
 *                  recorded grand. A felt hammer whose hardness follows the velocity, so soft and loud
 *                  differ in colour and not only in level. Every partial has its own decay and an
 *                  aftersound. Hammer thump and key-bed knock on every strike. The strings drive a
 *                  soundboard of 27 resonances (different left and right); with the pedal down the
 *                  rest of the harp rings.
 *   Brushes        A swirl whose loudness and colour follow the hand: one gesture a beat, never two
 *                  alike, the band-pass tracking the speed of the sweep, grainy like wire on a coated
 *                  head. Taps made of a dozen bristles landing over a few milliseconds on a head with
 *                  its own modes and snare wires.
 *   Ride           One cymbal: 282 resonances (the low ones in beating pairs) struck by every hit, so
 *                  a hit lands on a cymbal that is still ringing. Each hit excites the modes
 *                  differently (where the stick lands), and feeds the wash. A hi-hat foot, a
 *                  feathered bass drum.
 *   The NO         A pitched low drum (55 and 49 Hz, the pitch falling fast), seven membrane modes
 *                  between 80 and 200 Hz so a small speaker still gives it, felt, and on the two
 *                  dock shutters a short dark rattle (low-passed at 3 kHz).
 *   The room       A 16-line feedback delay network: a small dark club, about 0.75 s. And a steady,
 *                  very quiet room tone under everything, the held breath included.
 *
 * THE SOUND IS CUT FROM THE PICTURE'S TIMELINE. score.js beside this file is the candidate's copy of
 * video/score.js plus a music block; the build refuses to run if the picture times differ.
 *
 * Deterministic: every random number comes from a seeded generator, so every build is the same file.
 * `require('./build.js')` runs nothing and exports the instruments (lab.js renders them alone).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..', '..', '..');
const SCORE = require(path.join(HERE, 'score.js'));

const SR = 48000;
const DUR = SCORE.duration;
const N = Math.round(DUR * SR);
const BEAT = SCORE.beat;
const BAR = 4 * BEAT;
const TAU = Math.PI * 2;
const MUSIC = SCORE.music;
const SWUNG = MUSIC.swingRatio * BEAT;                 // the "and": 0.65 of a beat late
const I1 = SCORE.ideas[0], I2 = SCORE.ideas[1], I3 = SCORE.ideas[2], T = SCORE.title;
const NO1 = I1.gates[0].land, NO2 = I2.gates[1].land, SLAB = T.land;      // the three HARD times
const PASS = I3.gates.map((g) => g.lift);                                 // the four PASS lifts

/* ====================================================================== tools */

function rng(seed) {                 // mulberry32: the same "random" every run
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(text) {              // FNV-1a: a name becomes a seed
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function gauss(r) { return (r() + r() + r() + r() - 2) * 1.7320508; }     // unit variance
function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function S(t) { return Math.round(t * SR); }
function dB(x) { return 20 * Math.log10(Math.max(1e-12, x)); }
function dBp(x) { return 10 * Math.log10(Math.max(1e-24, x)); }
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function noise(n, r) { const b = new Float64Array(n); for (let i = 0; i < n; i++) { b[i] = r() * 2 - 1; } return b; }
function peakOf(b, from, to) {
  let p = 0;
  for (let i = from || 0, e = Math.min(b.length, to === undefined ? b.length : to); i < e; i++) { const v = Math.abs(b[i]); if (v > p) { p = v; } }
  return p;
}
function rmsOf(b, from, to) {
  let s = 0;
  const a = Math.max(0, from || 0), e = Math.min(b.length, to === undefined ? b.length : to);
  for (let i = a; i < e; i++) { s += b[i] * b[i]; }
  return Math.sqrt(s / Math.max(1, e - a));
}

/* RBJ biquad coefficients [b0, b1, b2, a1, a2] */
function coefs(type, f0, q, gainDb) {
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
  } else { throw new Error('filter ' + type); }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
/* run a biquad in place over buf[from..to) */
function biquad(buf, type, f0, q, gainDb, from, to) {
  const c = coefs(type, f0, q, gainDb), b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = from || 0, e = to === undefined ? buf.length : to; i < e; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}
/* A resonant body: y = direct * x + the sum of g_k * bandpass_k(x) over [from, to).
 * Each band-pass has unity gain at its centre; modes are [Hz, Q, gain]. */
function modalBank(x, modes, direct, from, to) {
  const y = new Float32Array(x.length);
  for (let i = from; i < to; i++) { y[i] = direct * x[i]; }
  for (let k = 0; k < modes.length; k++) {
    const w = TAU * modes[k][0] / SR, al = Math.sin(w) / (2 * modes[k][1]), a0 = 1 + al;
    const b0 = al / a0 * modes[k][2], a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = from; i < to; i++) {
      const xi = x[i];
      const yi = b0 * (xi - x2) - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi;
      y[i] += yi;
    }
  }
  return y;
}
/* y[i] += amp * rho^i * cos(w i + phase): one decaying partial, computed until it has fallen 100 dB */
function addPartial(y, f, amp, dbPerSec, phase) {
  const w = TAU * f / SR;
  const rho = Math.pow(10, -dbPerSec / (20 * SR));
  const c1 = 2 * rho * Math.cos(w), c2 = rho * rho;
  let s1 = amp * Math.cos(phase - w) / rho, s2 = amp * Math.cos(phase - 2 * w) / (rho * rho);
  const n = dbPerSec > 0 ? Math.min(y.length, Math.ceil(100 / dbPerSec * SR)) : y.length;
  for (let i = 0; i < n; i++) { const s = c1 * s1 - c2 * s2; s2 = s1; s1 = s; y[i] += s; }
}
/* raised-cosine fades over the first `a` and the last `z` seconds */
function fadeEdges(buf, a, z) {
  const na = Math.max(1, Math.round(a * SR)), nz = Math.max(1, Math.round(z * SR));
  for (let i = 0; i < Math.min(na, buf.length); i++) { buf[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / na); }
  for (let i = 0; i < Math.min(nz, buf.length); i++) { buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / nz); }
  return buf;
}
/* add a mono sound to a mono bus; `at` is a sample index and may be negative */
function putMono(dest, at, sig, gain) {
  const n = dest.length;
  for (let i = Math.max(0, -at), e = Math.min(sig.length, n - at); i < e; i++) { dest[at + i] += sig[i] * gain; }
}
/* add a mono sound to a stereo bus, equal-power pan, centre = unity */
function putStereo(L, R, at, sig, gain, pan) {
  const th = (clamp(pan || 0, -1, 1) + 1) * Math.PI / 4;
  const gl = Math.cos(th) * Math.SQRT2 * gain, gr = Math.sin(th) * Math.SQRT2 * gain, n = L.length;
  for (let i = Math.max(0, -at), e = Math.min(sig.length, n - at); i < e; i++) { L[at + i] += sig[i] * gl; R[at + i] += sig[i] * gr; }
}
/* the stretches of a signal that are not silent, each extended by `tail` seconds, merged */
function activeRanges(chans, tail, lead) {
  const n = chans[0].length, step = 480, out = [];
  let open = -1, last = -1;
  for (let b = 0; b < n; b += step) {
    let live = false;
    for (const ch of chans) { for (let i = b, e = Math.min(n, b + step); i < e; i++) { if (ch[i] !== 0) { live = true; break; } } if (live) { break; } }
    if (live) { if (open < 0) { open = b; } last = b + step; }
    else if (open >= 0 && b - last > tail * SR) { out.push([Math.max(0, open - Math.round((lead || 0) * SR)), Math.min(n, last + Math.round(tail * SR))]); open = -1; }
  }
  if (open >= 0) { out.push([Math.max(0, open - Math.round((lead || 0) * SR)), Math.min(n, last + Math.round(tail * SR))]); }
  return out;
}

/* ====================================================================== the upright bass */

const BASS_OPEN = [28, 33, 38, 43];                    // E1 A1 D2 G2
const BASS_LEAD = Math.round(0.04 * SR);               // every note buffer starts 40 ms early (the left hand)
function bassStringOf(m) { return m >= 43 ? 3 : (m >= 38 ? 2 : (m >= 33 ? 1 : 0)); }

/* The body: the air resonance, the top, and a run of plate modes, [Hz, Q, gain]. Neighbours mostly
 * alternate in sign, as a radiated response does, so there is no hole between them. */
const BASS_BODY = (function () {
  const f = [63, 104, 118, 149, 173, 201, 236, 262, 291, 327, 366, 412, 463, 521, 590, 672, 760, 865, 985, 1120, 1280, 1460, 1670, 1910, 2180, 2500];
  const g = [0.55, 1.0, 0.6, 0.9, 0.75, 0.95, 0.8, 0.62, 0.72, 0.52, 0.56, 0.44, 0.46, 0.34, 0.36, 0.27, 0.25, 0.2, 0.17, 0.15, 0.12, 0.1, 0.085, 0.07, 0.06, 0.05];
  const q = [8, 11, 13, 12, 13, 12, 12, 11, 11, 10, 10, 10, 9, 9, 9, 8, 8, 8, 8, 7, 7, 7, 7, 7, 7, 7];
  return f.map((fk, k) => [fk, q[k], g[k] * (k % 2 ? -1 : 1) * (k === 6 || k === 13 || k === 19 ? -1 : 1)]);
}());
const BASS_DIRECT = 0.16;
const BASS_SYMPATHY = 0.035;

/* One plucked note, before the body. ev: { m, dur, vel, ghost, slide, vib, dampTau }.
 * The buffer starts BASS_LEAD samples before the note sounds. */
function bassNote(ev, r) {
  const m = ev.m, vel = ev.vel, ghost = !!ev.ghost;
  const s = bassStringOf(m), k = m - BASS_OPEN[s], Lrel = Math.pow(2, -k / 12);
  const f0 = hz(m) * Math.pow(2, clamp(2.6 * gauss(r), -6.5, 6.5) / 1200);      // a player's intonation
  const nDur = Math.max(1, Math.round(ev.dur * SR));
  const dampTau = ev.dampTau || 0.04;
  const total = nDur + Math.round(Math.min(0.3, 7 * dampTau + 0.02) * SR);
  const y = new Float64Array(Math.ceil(total * 1.012) + 64);
  // where the finger plucks (as a share of the sounding length), how soft it is, how stiff the string
  const beta = clamp((0.165 + 0.03 * gauss(r)) / Lrel, 0.09, 0.42);
  const fc = (260 + 1050 * Math.pow(vel, 1.3)) * (1 + 0.08 * gauss(r));
  const inh = 4e-5 / (Lrel * Lrel);
  const nP = Math.min(64, Math.floor(3600 / f0));
  const free = k === 0 ? 0.62 : 1;                                             // an open string rings longer
  const split = (0.0010 + 0.0022 * r()) * (r() < 0.5 ? -1 : 1);                 // the two polarisations are a hair apart
  for (let n = 1; n <= nP; n++) {
    const fn = n * f0 * Math.sqrt(1 + inh * n * n) * (1 + 0.0005 * gauss(r));
    const a = Math.sin(n * Math.PI * beta) / n / (1 + (fn / fc) * (fn / fc)) * Math.exp(0.24 * gauss(r));
    const d = free * (9.5 + 5.2 * Math.pow(fn / 100, 1.3)) * Math.exp(0.18 * gauss(r)) * (ghost ? 14 : 1);   // dB a second
    addPartial(y, fn, 0.8 * a, 1.2 * d, 0.55 * gauss(r));
    addPartial(y, fn * (1 + split * (0.6 + 0.8 * r())), a * (0.22 + 0.22 * r()), 0.5 * d, 1.2 * gauss(r));
  }
  // the pitch: sharp while the string is pulled far, settling as it calms; a scoop on a few notes; vibrato on long ones
  const out = new Float32Array(BASS_LEAD + total);
  const g0 = 5 + 16 * vel * vel, g1 = 2.5 * vel, LN = Math.LN2 / 1200;
  const vibDepth = ev.vib ? 5 + 3 * r() : 0, vibRate = 4.7 + 0.5 * r();
  let vph = r() * TAU, pos = 1;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let c = g0 * Math.exp(-t / 0.04) + g1 * Math.exp(-t / 0.35);
    if (ev.slide && t < 0.075) { c -= 70 * (0.5 + 0.5 * Math.cos(Math.PI * t / 0.075)); }
    if (vibDepth && t > 0.3) { vph += TAU * vibRate * (1 + 0.04 * Math.sin(TAU * 0.31 * t)) / SR; c += vibDepth * Math.min(1, (t - 0.3) / 0.6) * Math.sin(vph); }
    const i0 = pos | 0, fr = pos - i0;
    const ym = y[i0 - 1], y0 = y[i0], y1 = y[i0 + 1], y2 = y[i0 + 2];
    out[BASS_LEAD + i] = y0 + 0.5 * fr * (y1 - ym + fr * (2 * ym - 5 * y0 + 4 * y1 - y2 + fr * (3 * (y0 - y1) + y2 - ym)));
    pos += 1 + c * LN;
  }
  // level by energy (a peak would punish the bright notes), the attack, the hand damping the string
  const nE = Math.min(total, Math.round(0.2 * SR));
  const level = ghost ? 0.42 * vel / (peakOf(out, BASS_LEAD, BASS_LEAD + nE) || 1) : 0.25 * Math.pow(vel, 1.15) / (rmsOf(out, BASS_LEAD, BASS_LEAD + nE) || 1);
  const nA = Math.round((0.0018 + 0.004 * (1 - vel)) * SR), dk = Math.exp(-1 / (dampTau * SR));
  let damp = 1;
  for (let i = 0; i < total; i++) {
    let g = level;
    if (i < nA) { g *= 0.5 - 0.5 * Math.cos(Math.PI * i / nA); }
    if (i > nDur) { damp *= dk; g *= damp; }
    out[BASS_LEAD + i] *= g;
  }
  // the finger: a soft thump under the pluck and a short tick as the string lets go, never twice the same
  const th = noise(Math.round(0.08 * SR), r);
  biquad(th, 'lp', 150 + 60 * r(), 0.7); biquad(th, 'lp', 190, 0.7);
  const thG = (ghost ? 0.5 : 0.17) * vel * (0.7 + 0.6 * r()) / (peakOf(th) || 1);
  for (let i = 0; i < th.length && i < total; i++) { const t = i / SR; out[BASS_LEAD + i] += th[i] * thG * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.018); }
  const tk = noise(Math.round(0.02 * SR), r);
  biquad(tk, 'bp', 900 + 1400 * r(), 1.2);
  const tkG = 0.05 * Math.pow(vel, 1.6) * (0.4 + 1.2 * r()) / (peakOf(tk) || 1);
  for (let i = 0; i < tk.length && i < total; i++) { const t = i / SR; out[BASS_LEAD + i] += tk[i] * tkG * (1 - Math.exp(-t / 0.0004)) * Math.exp(-t / 0.0035); }
  // the left hand sets a finger down a moment before the pluck (not every time)
  if (!ghost && r() < 0.6) {
    const w = Math.round(0.012 * SR), c = BASS_LEAD - Math.round((0.022 + 0.008 * r()) * SR);
    const pn = noise(2 * w, r);
    biquad(pn, 'lp', 420, 0.7);
    const pg = (0.012 + 0.018 * r()) * vel / (peakOf(pn) || 1);
    for (let i = 0; i < 2 * w; i++) { const j = c - w + i; if (j >= 0) { out[j] += pn[i] * pg * (0.5 - 0.5 * Math.cos(TAU * i / (2 * w))); } }
  }
  const nz = Math.round(0.006 * SR);
  for (let i = 0; i < nz; i++) { out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / nz); }
  return out;
}

/* The whole bass part: notes [{ t, m, dur, vel, ghost, slide, vib }] in time order -> mono, through the body. */
function renderBass(notes, n) {
  const sum = new Float32Array(n);
  const own = [0, 1, 2, 3].map(() => new Float32Array(n));          // what is played on each string
  const held = [0, 1, 2, 3].map(() => new Uint8Array(n));           // 1 while that string is under the fingers
  const bufs = [];
  let first = n, last = 0;
  notes.forEach((e, i) => {
    const r = rng(seedOf('bass note ' + i + ' ' + e.m));
    const s = bassStringOf(e.m);
    let next = null;
    for (let j = i + 1; j < notes.length; j++) { if (!notes[j].ghost) { next = notes[j]; break; } }
    let dur = e.dur, dampTau = 0.035 + 0.02 * r();                   // lifted by the left hand
    if (!e.ghost && next) {
      const gap = next.t - e.t;
      if (bassStringOf(next.m) === s) {
        if (dur > gap - 0.03) { dur = gap - 0.012 - 0.006 * r(); dampTau = 0.007 + 0.004 * r(); }   // the same string: the finger lands and cuts it
      } else if (dur > gap - 0.03) { dur = gap + 0.02 + 0.05 * r(); dampTau = 0.022 + 0.02 * r(); } // another string: they overlap a moment
    }
    dur = Math.max(0.03, Math.min(dur, n / SR - e.t));
    e.played = dur;
    const buf = bassNote({ m: e.m, dur, vel: e.vel, ghost: e.ghost, slide: e.slide, vib: e.vib, dampTau }, r);
    const at = S(e.t) - BASS_LEAD;
    putMono(sum, at, buf, 1);
    putMono(own[s], at, buf, 1);
    for (let j = Math.max(0, at), end = Math.min(n, S(e.t + dur + 4 * dampTau)); j < end; j++) { held[s][j] = 1; }
    first = Math.min(first, Math.max(0, at)); last = Math.max(last, Math.min(n, at + buf.length));
    bufs.push({ key: e.m, t: e.t, buf, from: BASS_LEAD });
  });
  if (!notes.length) { return { out: sum, bufs }; }
  // sympathy: an open string that is not being played picks up what the others do
  const end = Math.min(n, last + Math.round(2.5 * SR));
  const symp = new Float32Array(n);
  for (let s = 0; s < 4; s++) {
    const fo = hz(BASS_OPEN[s]), mine = own[s], hold = held[s];
    for (let p = 1; p <= 6; p++) {
      const f = p * fo * Math.sqrt(1 + 4e-5 * p * p), q = Math.PI * f * (2.6 / (1 + 0.3 * (p - 1)) / 6.91);
      const w = TAU * f / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
      const b0 = al / a0 / Math.pow(p, 0.8), a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = first; i < end; i++) {
        const xi = sum[i] - mine[i];
        let yi = b0 * (xi - x2) - a1 * y1 - a2 * y2;
        x2 = x1; x1 = xi;
        if (hold[i]) { yi *= 0.995; y1 *= 0.995; }
        y2 = y1; y1 = yi;
        symp[i] += yi;
      }
    }
  }
  for (let i = first; i < end; i++) { sum[i] += BASS_SYMPATHY * symp[i]; }
  const out = modalBank(sum, BASS_BODY, BASS_DIRECT, first, end);
  biquad(out, 'hp', 34, 0.7, 0, first, end);
  biquad(out, 'lp', 3000, 0.6, 0, first, end);
  return { out, bufs, sympathy: symp };
}

/* ====================================================================== the piano */

const PIANO_KEYS = new Map();
/* What belongs to the key and not to the strike: its tuning, its three strings, its uneven partials. */
function pianoKey(m) {
  let k = PIANO_KEYS.get(m);
  if (k) { return k; }
  const r = rng(seedOf('piano key ' + m));
  k = { tune: 1.1 * gauss(r) + (m >= 60 ? 1.3 : 0.7) * (m - 60) / 12, det: [0, 0.35 + 0.95 * r(), -(0.35 + 0.95 * r())], amp: [1], dec: [1] };
  for (let n = 1; n <= 48; n++) { k.amp.push(Math.exp(0.26 * gauss(r))); k.dec.push(Math.exp(0.38 * gauss(r))); }
  PIANO_KEYS.set(m, k);
  return k;
}
/* The soundboard: [Hz, Q, gain left, gain right], fixed for the instrument. */
const SOUNDBOARD = (function () {
  const r = rng(seedOf('soundboard'));
  const out = [];
  let f = 92, k = 0;
  while (f < 4300) {
    const tilt = Math.pow(f / 300, f > 300 ? -0.35 : 0.25);
    const sign = (k % 2 ? -1 : 1) * (r() < 0.2 ? -1 : 1);
    out.push([f, 14 - 4.5 * Math.min(1, Math.log2(f / 92) / 5.5), sign * tilt * (0.7 + 0.6 * r()), sign * tilt * (0.7 + 0.6 * r())]);
    f *= 1.125 + 0.05 * r(); k++;
  }
  return out;
}());
const SOUNDBOARD_DIRECT = 0.62, SOUNDBOARD_MODES = 0.5;
const PIANO_PAN = -0.3;
function pianoPan(m) { return PIANO_PAN + clamp((m - 60) * 0.012, -0.2, 0.25); }

/* One struck note, before the soundboard. ev: { m, dur, vel }. */
function pianoNote(ev, r) {
  const m = ev.m, vel = ev.vel, K = pianoKey(m);
  const f0 = hz(m) * Math.pow(2, K.tune / 1200);
  const B = Math.max(1.1e-4, 3.1e-4 * Math.pow(2, (m - 60) / 7.7));            // measured on a recorded grand: 3.1e-4 at C4, 1.7e-4 at F3
  const fcH = 420 * (1 + 6 * Math.pow(vel, 1.5)) * Math.pow(f0 / 261.6, 0.25);  // the felt: harder when struck harder
  const d1 = 6.0 * Math.pow(2, (m - 60) / 13);                                  // dB a second for the first partial
  const tauD = 0.03 + 0.055 * Math.pow(2, (60 - m) / 12);                       // the damper
  const nDur = Math.max(1, Math.round(ev.dur * SR));
  const total = nDur + Math.round(Math.min(0.9, 7 * tauD + 0.03) * SR);
  const sig = new Float64Array(total);
  const parts = [];
  let amax = 0;
  for (let n = 1; n <= 48; n++) {
    const fn = n * f0 * Math.sqrt(1 + B * n * n);
    if (fn > 10000) { break; }
    const a = (0.18 + 0.82 * Math.abs(Math.sin(n * Math.PI * 0.122))) * Math.pow(n, -0.55) / (1 + (fn / fcH) * (fn / fcH)) * K.amp[n];
    parts.push([n, fn, a]);
    if (a > amax) { amax = a; }
  }
  for (const [n, fn, a0] of parts) {
    if (a0 < amax * 2e-4) { continue; }
    const a = a0 * Math.exp(0.2 * gauss(r));                                    // the hammer never lands quite the same
    const d = d1 * (1 + 0.2 * Math.pow(n - 1, 1.4)) * K.dec[n];
    for (let s = 0; s < 3; s++) {                                               // three strings, struck together, a hair apart
      addPartial(sig, fn * Math.pow(2, K.det[s] * (1 + 0.2 * gauss(r)) / 1200), a / 3 * (0.8 + 0.4 * r()), 1.15 * d, -Math.PI / 2 + 0.45 * gauss(r));
    }
    if (n <= 14) { addPartial(sig, fn * Math.pow(2, 0.9 * gauss(r) / 1200), a * 0.2 * (0.5 + r()), 0.3 * d, r() * TAU); }   // the aftersound
  }
  const ta = 0.0007 + 0.0016 * (1 - vel), dk = Math.exp(-1 / (tauD * SR));
  let damp = 1;
  for (let i = 0; i < total; i++) {
    let g = 1 - Math.exp(-i / (ta * SR));
    if (i > nDur) { damp *= dk; g *= damp; }
    sig[i] *= g;
  }
  const level = (0.12 + 0.88 * Math.pow(vel, 1.6)) / (peakOf(sig, 0, Math.round(0.1 * SR)) || 1);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) { out[i] = sig[i] * level; }
  // the hammer's thump and, a few milliseconds later, the key reaching its bed
  const hn = noise(Math.round(0.04 * SR), r);
  biquad(hn, 'lp', 350 + 900 * vel, 0.7); biquad(hn, 'hp', 120, 0.7);
  const hg = 0.10 * Math.pow(vel, 0.8) * (0.8 + 0.4 * r()) / (peakOf(hn) || 1) * (0.12 + 0.88 * Math.pow(vel, 1.6));
  for (let i = 0; i < hn.length && i < total; i++) { const t = i / SR; out[i] += hn[i] * hg * (1 - Math.exp(-t / 0.0006)) * Math.exp(-t / 0.006); }
  const kn = noise(Math.round(0.07 * SR), r);
  biquad(kn, 'bp', 130 + 40 * r(), 0.9);
  const kg = 0.035 * (0.5 + vel) * (0.7 + 0.6 * r()) / (peakOf(kn) || 1) * (0.25 + 0.75 * vel);
  const k0 = Math.round((0.004 + 0.004 * r()) * SR);
  for (let i = 0; i < kn.length && k0 + i < total; i++) { const t = i / SR; out[k0 + i] += kn[i] * kg * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.02); }
  const nz = Math.round(0.006 * SR);
  for (let i = 0; i < nz && i < total; i++) { out[total - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / nz); }
  return out;
}

/* The whole piano part: notes [{ t, m, dur, vel }], pedals [[down, up]] -> stereo, through the soundboard. */
function renderPiano(notes, pedals, n) {
  const L = new Float32Array(n), R = new Float32Array(n), bufs = [];
  notes.forEach((e, i) => {
    const buf = pianoNote(e, rng(seedOf('piano note ' + i + ' ' + e.m)));
    putStereo(L, R, S(e.t), buf, 1, pianoPan(e.m));
    bufs.push({ key: e.m, t: e.t, buf, from: 0 });
  });
  const ranges = activeRanges([L, R], 0.6);
  // with the pedal down every string is free: the rest of the harp answers
  const pedL = new Float32Array(n), pedR = new Float32Array(n);
  for (const [down, up, heldKeys] of (pedals || [])) {
    const a = Math.max(0, S(down)), b = Math.min(n, S(up + 0.5)), rel = S(up), ramp = Math.round(0.02 * SR);
    const dry = new Float32Array(b - a);
    for (let i = a; i < b; i++) { dry[i - a] = 0.5 * (L[i] + R[i]) * (i - a < ramp ? (i - a) / ramp : 1) * (i < rel ? 1 : 0); }
    for (let m = 36; m <= 96; m++) {
      if (heldKeys && heldKeys.indexOf(m) >= 0) { continue; }                     // a held key's strings are the source, not the answer
      const f = hz(m) * Math.pow(2, pianoKey(m).tune / 1200);
      for (let p = 1; p <= (m < 60 ? 2 : 1); p++) {
        const fp = p * f * Math.sqrt(1 + 2e-4 * p * p), t60 = 6 * Math.pow(2, -(m - 36) / 24) / p;
        const w = TAU * fp / SR, q = Math.PI * fp * t60 / 6.91, al = Math.sin(w) / (2 * q), a0 = 1 + al;
        const b0 = al / a0 / p, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
        const th = (clamp(pianoPan(m), -1, 1) + 1) * Math.PI / 4, gl = Math.cos(th) * Math.SQRT2, gr = Math.sin(th) * Math.SQRT2;
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = a; i < b; i++) {
          const xi = dry[i - a];
          let yi = b0 * (xi - x2) - a1 * y1 - a2 * y2;
          x2 = x1; x1 = xi;
          if (i >= rel) { yi *= 0.9995; y1 *= 0.9995; }                          // the dampers come down
          y2 = y1; y1 = yi;
          pedL[i] += yi * gl; pedR[i] += yi * gr;
        }
      }
    }
  }
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const ml = SOUNDBOARD.map((x) => [x[0], x[1], x[2] * SOUNDBOARD_MODES]), mr = SOUNDBOARD.map((x) => [x[0], x[1], x[3] * SOUNDBOARD_MODES]);
  for (let i = 0; i < n; i++) { L[i] += PEDAL_LEVEL * pedL[i]; R[i] += PEDAL_LEVEL * pedR[i]; }
  for (const [a, b] of ranges) {
    const yl = modalBank(L, ml, SOUNDBOARD_DIRECT, a, b), yr = modalBank(R, mr, SOUNDBOARD_DIRECT, a, b);
    for (let i = a; i < b; i++) { outL[i] = yl[i]; outR[i] = yr[i]; }
  }
  return { L: outL, R: outR, bufs };
}
const PEDAL_LEVEL = 0.5;

/* ====================================================================== brushes */

const BRUSH_PAN = 0.2;
/* A gesture of the hand: a quick rise and a slower fall, added to an envelope. */
function gesture(env, t0, centre, amp, rise, fall) {
  const a = Math.max(0, S(centre - rise - t0)), c = S(centre - t0), b = Math.min(env.length, S(centre + fall - t0));
  for (let i = a; i < b; i++) {
    const x = i < c ? (i - a) / Math.max(1, c - a) : 1 - (i - c) / Math.max(1, b - c);
    env[i] += amp * (0.5 - 0.5 * Math.cos(Math.PI * x));
  }
}
/* The swirl from t0 to t1: wire on a coated head. Loudness and colour follow the hand: a push on
 * every beat (more on 2 and 4), a lighter one on the swung "and", none of them alike. */
function brushSwirl(t0, t1, level, r) {
  const n = S(t1) - S(t0);
  const hand = new Float32Array(n);
  const kb0 = Math.floor(t0 / BEAT) - 1, kb1 = Math.ceil(t1 / BEAT) + 1;
  for (let kb = kb0; kb <= kb1; kb++) {
    const tb = kb * BEAT, inBar = ((kb % 4) + 4) % 4;
    const accent = (inBar === 1 || inBar === 3) ? 1 : 0.68;
    gesture(hand, t0, tb - 0.012 + 0.007 * gauss(r), 0.44 * accent * (1 + 0.14 * gauss(r)), 0.07 * (1 + 0.2 * gauss(r)), 0.16 * (1 + 0.2 * gauss(r)));
    if (r() > 0.14) { gesture(hand, t0, tb + SWUNG + 0.009 * gauss(r), 0.2 * (1 + 0.25 * gauss(r)), 0.05, 0.09 * (1 + 0.2 * gauss(r))); }
  }
  const drift = noise(n, r); biquad(drift, 'lp', 0.7, 0.7); biquad(drift, 'lp', 0.7, 0.7);
  const dg = 0.07 / (rmsOf(drift) || 1);
  const grain = noise(n, r); biquad(grain, 'bp', 90, 0.5);
  const gg = 0.5 / (rmsOf(grain) || 1);
  const white = noise(n, r), wires = noise(n, r);
  biquad(wires, 'bp', 3300, 0.9);
  const L = new Float32Array(n), R = new Float32Array(n), mono = new Float64Array(n);
  let low = 0, band = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.max(0.05, 0.3 + dg * drift[i] + hand[i]);
    const fc = 950 * (0.7 + 1.5 * e);
    const f = 2 * Math.sin(Math.PI * fc / SR), q = 1.25;
    const high = white[i] - low - q * band;
    band += f * high; low += f * band;
    const g = Math.max(0.25, 1 + gg * grain[i]);
    mono[i] = (0.85 * band + 0.16 * high + 0.5 * wires[i] * e * e) * e * g * level(t0 + i / SR);
  }
  biquad(mono, 'hp', 380, 0.7); biquad(mono, 'lp', 6000, 0.7);
  const ph0 = r() * TAU, fin = Math.round(0.08 * SR), fout = Math.round(0.12 * SR);
  for (let i = 0; i < n; i++) {
    const t = t0 + i / SR;
    let v = mono[i];
    if (i < fin) { v *= 0.5 - 0.5 * Math.cos(Math.PI * i / fin); }
    if (n - 1 - i < fout) { v *= 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / fout); }
    const th = (clamp(BRUSH_PAN + 0.06 * Math.sin(TAU * t / (2 * BEAT) + ph0), -1, 1) + 1) * Math.PI / 4;
    L[i] = v * Math.cos(th) * Math.SQRT2; R[i] = v * Math.sin(th) * Math.SQRT2;
  }
  return { L, R };
}
/* One brush tap: a dozen bristles land over a few milliseconds on a head with its own modes and wires. */
function brushTap(vel, r) {
  const len = Math.round(0.4 * SR);
  const spread = (0.005 + 0.006 * r()) * SR, K = 9 + Math.floor(8 * r());
  const hits = [];
  for (let k = 0; k < K; k++) { const u = Math.pow(r(), 1.5) * spread; hits.push([Math.floor(u), (0.35 + 0.65 * r()) * (1 - 0.5 * u / spread)]); }
  const tauN = 0.02 * (0.8 + 0.5 * r()), tauW = 0.045 * (0.8 + 0.5 * r());
  const envN = new Float64Array(len), envW = new Float64Array(len);
  const kN = Math.exp(-1 / (tauN * SR)), kW = Math.exp(-1 / (tauW * SR));
  let eN = 0, eW = 0, h = 0;
  hits.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < len; i++) {
    while (h < K && hits[h][0] === i) { eN += hits[h][1]; eW += hits[h][1]; h++; }
    envN[i] = eN; envW[i] = eW; eN *= kN; eW *= kW;
  }
  const hiss = noise(len, r), wires = noise(len, r);
  const bright = 0.85 + 0.3 * r();
  biquad(hiss, 'hp', 420, 0.7); biquad(hiss, 'lp', 5200 * bright, 0.7); biquad(hiss, 'peak', 2800 * bright, 0.8, 3);
  biquad(wires, 'bp', 2600 * bright, 0.7); biquad(wires, 'lp', 5000, 0.7);
  const sig = new Float32Array(len);
  for (let i = 0; i < len; i++) { sig[i] = 0.26 * hiss[i] * envN[i] / K * 4 + 0.14 * wires[i] * envW[i] / K * 4; }
  // the head: a membrane's modes, each bristle setting them going
  const f1 = 296 * (0.97 + 0.06 * r());
  const modes = [[0.66, 0.5, 0.034], [1, 1, 0.027], [1.59, 0.45, 0.017], [2.14, 0.3, 0.013], [2.3, 0.26, 0.011], [2.65, 0.18, 0.009]];
  for (const [ratio, amp, tau] of modes) {
    const f = f1 * ratio * (1 + 0.012 * gauss(r)), a = amp * (0.75 + 0.5 * r()) / K * 2.2, d = 8.686 / (tau * (0.85 + 0.3 * r()));
    for (let k = 0; k < K; k++) {
      const tmp = new Float64Array(Math.min(len - hits[k][0], Math.round(tau * 9 * SR)));
      addPartial(tmp, f, a * hits[k][1], d, -Math.PI / 2);
      for (let i = 0; i < tmp.length; i++) { sig[hits[k][0] + i] += tmp[i]; }
    }
  }
  for (let i = 0; i < len; i++) { sig[i] *= vel; }
  return fadeEdges(sig, 0.0004, 0.02);
}
/* The brushes: swirls [{ t0, t1, level(t) }], taps [{ t, vel }], swishes [{ t, vel }] -> stereo. */
function renderBrushes(swirls, taps, swishes, n) {
  const L = new Float32Array(n), R = new Float32Array(n), bufs = [];
  swirls.forEach((s, i) => {
    const y = brushSwirl(s.t0, s.t1, s.level, rng(seedOf('swirl ' + i)));
    const at = S(s.t0);
    for (let j = 0; j < y.L.length && at + j < n; j++) { L[at + j] += y.L[j] * SWIRL_LEVEL; R[at + j] += y.R[j] * SWIRL_LEVEL; }
  });
  taps.forEach((e, i) => {
    const buf = brushTap(e.vel, rng(seedOf('tap ' + i)));
    putStereo(L, R, S(e.t), buf, 1, BRUSH_PAN + 0.05 * Math.sin(i * 2.4));
    bufs.push({ key: 0, t: e.t, buf, from: 0 });
  });
  (swishes || []).forEach((e, i) => {                                 // one sweep of the brush across the head
    const r = rng(seedOf('swish ' + i)), len = Math.round(0.34 * SR);
    const sig = noise(len, r);
    biquad(sig, 'bp', 1500 + 400 * r(), 0.7); biquad(sig, 'lp', 4800, 0.7);
    const out = new Float32Array(len);
    for (let j = 0; j < len; j++) { const x = Math.sin(Math.PI * j / len); out[j] = sig[j] * x * x * e.vel; }
    putStereo(L, R, S(e.t - 0.09), out, 1, BRUSH_PAN);
  });
  return { L, R, bufs };
}
const SWIRL_LEVEL = 0.34;

/* ====================================================================== the ride, the hi-hat foot, the bass drum */

function curveAt(pts, f) {            // piecewise-linear in log frequency
  if (f <= pts[0][0]) { return pts[0][1]; }
  for (let i = 1; i < pts.length; i++) {
    if (f <= pts[i][0]) { const u = Math.log(f / pts[i - 1][0]) / Math.log(pts[i][0] / pts[i - 1][0]); return pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1]); }
  }
  return pts[pts.length - 1][1];
}
/* The cymbal: its resonances, fixed. The low ones come in pairs a fraction of a hertz apart (a
 * cymbal's modes are doublets), which is what makes it shimmer. */
const CYMBAL = (function () {
  const r = rng(seedOf('ride cymbal'));
  const LEVEL = [[280, -15], [500, -10], [1000, -6], [2000, -3], [3500, 0], [5000, -1.5], [7000, -6], [9000, -11], [11000, -17]];
  const RING = [[280, 2.6], [1000, 2.3], [2000, 1.8], [4000, 1.2], [8000, 0.75], [11000, 0.6]];
  const modes = [];
  const NLOW = 56, NHIGH = 170;
  for (let k = 0; k < NLOW; k++) {
    const f = 280 * Math.pow(2600 / 280, Math.pow((k + r()) / NLOW, 0.9));
    const a = Math.pow(10, curveAt(LEVEL, f) / 20) * (0.6 + 0.8 * r()), t60 = curveAt(RING, f) * (0.7 + 0.6 * r());
    modes.push({ f, a, t60, wash: f > 1500 ? 0.35 : 0 });
    modes.push({ f: f * (1 + 0.0006 + 0.0035 * r()), a: a * (0.5 + 0.5 * r()), t60: t60 * (0.8 + 0.4 * r()), wash: f > 1500 ? 0.35 : 0 });
  }
  for (let k = 0; k < NHIGH; k++) {
    const f = 2600 * Math.pow(11000 / 2600, (k + r()) / NHIGH);
    modes.push({ f, a: Math.pow(10, curveAt(LEVEL, f) / 20) * (0.6 + 0.8 * r()) * 0.75, t60: curveAt(RING, f) * (0.7 + 0.6 * r()), wash: 1 });
  }
  return modes;
}());
const RIDE_PAN = 0.4, HAT_PAN = 0.3, KICK_PAN = 0.08;
const RIDE_WASH = 0.5;
const RIDE_OUT = 0.05;                                 // 282 resonators add up: bring a full stroke to about unity

/* The ride part: hits [{ t, vel, kind: 'tip' | 'mallet' }] -> mono. The cymbal is one bank of
 * resonators running through the whole stretch; a hit adds energy to whatever is still ringing. */
function renderRide(hits, chokes, n) {
  const out = new Float32Array(n);
  if (!hits.length) { return { out, weights: [] }; }
  const sorted = hits.slice().sort((a, b) => a.t - b.t);
  const M = CYMBAL.length;
  const weights = [];
  // every hit excites every mode a little differently (where the stick lands, how hard, with what)
  const wash = new Float32Array(n);
  sorted.forEach((h, i) => {
    const r = rng(seedOf('ride hit ' + i));
    const soft = h.kind === 'mallet';
    const fcStick = soft ? 420 : 4200 * (0.6 + 0.8 * h.vel);
    const w = new Float32Array(M);
    for (let k = 0; k < M; k++) {
      const md = CYMBAL[k], x = md.f / fcStick;
      w[k] = md.a * h.vel * Math.pow(Math.max(h.vel, 0.05), 0.3 * Math.log2(md.f / 1000)) / Math.sqrt(1 + x * x * x * x) * (0.45 + 1.1 * r()) * (r() < 0.5 ? -1 : 1);
    }
    weights.push(w);
    // the wash: after the stick, the cymbal's own turbulence feeds the upper modes for a while
    const s0 = S(h.t), len = Math.round((soft ? 1.6 : 1.3) * SR), rise = soft ? 0.05 : 0.012, fall = soft ? 0.34 : 0.26;
    const g = Math.pow(h.vel, 1.6) * (soft ? 0.7 : 1);
    for (let i2 = 0; i2 < len && s0 + i2 < n; i2++) { const t = i2 / SR; if (s0 + i2 >= 0) { wash[s0 + i2] += g * (1 - Math.exp(-t / rise)) * Math.exp(-t / fall); } }
  });
  const from = Math.max(0, S(sorted[0].t) - 8), to = n;
  const nr = rng(seedOf('ride wash'));
  for (let i = from; i < to; i++) { wash[i] *= (nr() * 2 - 1) * 1.7320508; }
  const stops = (chokes || []).map((c) => S(c)).filter((c) => c > from).sort((a, b) => a - b);
  const hitAt = sorted.map((h) => Math.max(from, S(h.t)));
  for (let k = 0; k < M; k++) {
    const md = CYMBAL[k];
    const w = TAU * md.f / SR, rho = Math.pow(10, -3 / (md.t60 * SR));
    const c1 = 2 * rho * Math.cos(w), c2 = rho * rho, sw = Math.sin(w);
    // the gain that makes white noise come out of this resonator at unit power
    const gw = md.wash * RIDE_WASH * md.a * Math.sqrt((1 - c2) * (1 + c2 * c2 - 2 * c2 * Math.cos(2 * w)) / (1 + c2));
    let y1 = 0, y2 = 0, i = from, h = 0, c = 0;
    while (i < to) {
      const hs = h < hitAt.length ? hitAt[h] : to, cs = c < stops.length ? stops[c] : to;
      const stop = Math.min(to, hs, cs);
      if (gw > 0) { for (; i < stop; i++) { const y = c1 * y1 - c2 * y2 + gw * wash[i]; y2 = y1; y1 = y; out[i] += y; } }
      else { for (; i < stop; i++) { const y = c1 * y1 - c2 * y2; y2 = y1; y1 = y; out[i] += y; } }
      if (i >= to) { break; }
      if (i === cs) { y1 = 0; y2 = 0; c++; continue; }                          // a hand on the cymbal
      let stick = 0;                                                            // the stick lands on this sample
      while (h < hitAt.length && hitAt[h] === i) { stick += weights[h][k] * sw; h++; }
      const y = c1 * y1 - c2 * y2 + gw * wash[i] + stick;
      y2 = y1; y1 = y; out[i] += y; i++;
    }
  }
  biquad(out, 'hp', 300, 0.7, 0, from, to);
  for (let i = from; i < to; i++) { out[i] *= RIDE_OUT; }
  return { out, weights };
}
/* The hi-hat closing under the foot: a short chick and the clunk of the pedal. */
function hatChick(vel, r) {
  const len = Math.round(0.16 * SR);
  const x = noise(len, r);
  const sig = new Float64Array(len);
  for (let k = 0; k < 9; k++) {
    const f = 2300 * Math.pow(7000 / 2300, (k + r()) / 9), tmp = Float64Array.from(x);
    biquad(tmp, 'bp', f, 9 + 6 * r());
    const g = (0.6 + 0.8 * r()) * Math.pow(f / 3500, -0.5);
    for (let i = 0; i < len; i++) { sig[i] += tmp[i] * g; }
  }
  const out = new Float32Array(len);
  const tau = 0.02 + 0.012 * r(), pk = peakOf(sig) || 1, fc = 240 + 50 * r();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = vel * (sig[i] / pk * (1 - Math.exp(-t / 0.0025)) * Math.exp(-t / tau) + 0.35 * Math.sin(TAU * fc * t) * Math.exp(-t / 0.014) * (1 - Math.exp(-t / 0.001)));
  }
  return fadeEdges(out, 0.0004, 0.01);
}
/* The feathered bass drum: felt on a loose head, more felt than heard. */
function kickHit(vel, r) {
  const len = Math.round(0.42 * SR);
  const out = new Float32Array(len);
  const f = 46 + 11 * r(), drop = 8 + 14 * r(), tau = 0.065 + 0.05 * r(), t2 = 0.05 + 0.03 * r();
  const ratio = 1.45 + 0.3 * r(), a2 = 0.36 + 0.3 * r();                     // the second mode of the head: where the beater lands
  const fl = noise(Math.round(0.04 * SR), r);
  biquad(fl, 'lp', 220 + 120 * r(), 0.7);
  const fg = (0.2 + 0.25 * r()) / (peakOf(fl) || 1);
  let ph = 1.4 * r(), ph2 = r() * TAU;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += TAU * (f + drop * Math.exp(-t / 0.03)) / SR; ph2 += TAU * ratio * f / SR;
    const att = t < 0.004 ? 0.5 - 0.5 * Math.cos(Math.PI * t / 0.004) : 1;
    out[i] = vel * att * (Math.sin(ph) * Math.exp(-t / tau) + a2 * Math.sin(ph2) * Math.exp(-t / t2) + (i < fl.length ? fl[i] * fg * Math.exp(-t / 0.012) : 0));
  }
  biquad(out, 'lp', 320, 0.7);
  return fadeEdges(out, 0.0005, 0.03);
}
function renderHits(hits, make, name, n, pan) {
  const L = new Float32Array(n), R = new Float32Array(n), bufs = [];
  hits.forEach((e, i) => {
    const buf = make(e.vel, rng(seedOf(name + ' ' + i)));
    putStereo(L, R, S(e.t), buf, 1, pan);
    bufs.push({ key: 0, t: e.t, buf, from: 0 });
  });
  return { L, R, bufs };
}

/* ====================================================================== the NO */

/* A pitched low drum: the fundamental falls fast from nearly an octave above to f0; seven membrane
 * modes give it a body between 80 and 200 Hz; felt; on a dock shutter the slats settle after it. */
function thudSound(f0, size, rattle, r) {
  const len = Math.round(3.0 * SR);
  const L = new Float32Array(len), R = new Float32Array(len);
  const modes = [[1, 1, 0.2 + 0.1 * size, 0.9], [1.59, 0.5, 0.12, 0.3], [2.14, 0.62, 0.105, 0.3], [2.3, 0.42, 0.09, 0.25], [2.65, 0.44, 0.075, 0.25],
    [2.92, 0.3, 0.062, 0.2], [3.16, 0.22, 0.052, 0.2], [3.5, 0.16, 0.045, 0.2]];
  const ph = modes.map(() => 0);
  const dt = modes.map((md) => 1 + 0.01 * gauss(r));
  const felt = noise(Math.round(0.06 * SR), r);
  biquad(felt, 'lp', 600, 0.7); biquad(felt, 'lp', 600, 0.7);
  const fg = 0.18 / (peakOf(felt) || 1);
  const g = 0.9 * (0.78 + 0.22 * size);
  for (let i = 0; i < len; i++) {
    const u = i / SR, e18 = Math.exp(-u / 0.018);
    const att = u < 0.0025 ? 0.5 - 0.5 * Math.cos(Math.PI * u / 0.0025) : 1;
    let v = 0;
    for (let k = 0; k < modes.length; k++) {
      ph[k] += TAU * f0 * modes[k][0] * dt[k] * (1 + modes[k][3] * e18) / SR;
      v += Math.sin(ph[k]) * modes[k][1] * Math.exp(-u / modes[k][2]);
    }
    if (i < felt.length) { v += felt[i] * fg * Math.exp(-u / 0.012); }
    L[i] = R[i] = v * att * g;
  }
  if (rattle) {
    // the slats settling: a few short metal ticks, closer then further apart, dying away
    const parts = [640, 1013, 1377, 1904, 2470];
    let u = 0.006, gap = 0.022, k = 0;
    while (u < 0.34) {
      const amp = Math.exp(-u / 0.12) * (0.6 + 0.4 * r()), det = 1 + (r() - 0.5) * 0.08;
      const len2 = Math.round(0.07 * SR), tick = new Float32Array(len2);
      for (let i = 0; i < len2; i++) {
        const v = i / SR;
        let s = 0;
        for (let p = 0; p < parts.length; p++) { s += Math.sin(TAU * parts[p] * det * v + p) * (1 - p * 0.16) * Math.exp(-v / (0.03 - p * 0.004)); }
        tick[i] = s * (1 - Math.exp(-v / 0.0007));
      }
      biquad(tick, 'lp', 3000, 0.7); biquad(tick, 'lp', 3000, 0.7);
      fadeEdges(tick, 0.0003, 0.01);
      putStereo(L, R, S(u), tick, 0.024 * amp, k % 2 ? 0.25 : -0.25);
      u += gap * (0.7 + 0.6 * r()); gap *= 1.18; k++;
    }
  }
  const nz = Math.round(0.3 * SR);
  for (let i = 0; i < nz; i++) { const w = 0.5 - 0.5 * Math.cos(Math.PI * i / nz); L[len - 1 - i] *= w; R[len - 1 - i] *= w; }
  for (const ch of [L, R]) { biquad(ch, 'hp', 28, 0.7); }
  return { L, R };
}

/* ====================================================================== the room */

/* Room tone: soft pink noise, a little of it shared between the sides. Unit RMS; the mix sets its level. */
function roomTone(n, r) {
  function pink() {
    const b = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      b[i] = b0 + b1 + b2 + w * 0.1848;
    }
    biquad(b, 'hp', 45, 0.7); biquad(b, 'lp', 2600, 0.5);
    return b;
  }
  const a = pink(), b = pink(), c = pink();
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = a[i] + 0.6 * c[i]; R[i] = b[i] + 0.6 * c[i]; }
  const g = 1 / Math.sqrt(0.5 * (rmsOf(L) * rmsOf(L) + rmsOf(R) * rmsOf(R)));
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return { L, R };
}

/* A small dark club: 16 delay lines fed back through a Hadamard matrix, each with its own damping,
 * three all-passes of diffusion on the way in, a handful of early reflections. Wet only. */
const ROOM = { t60: 0.75, t60hi: 0.34, fhi: 5000, pre: 0.012,
  delays: [347, 419, 521, 631, 743, 857, 977, 1103, 1231, 1367, 1511, 1657, 1811, 1973, 2143, 2311],
  early: [[0.0061, 0.40, 0], [0.0097, 0.33, 1], [0.0139, 0.30, 0], [0.0181, 0.27, 1], [0.0233, 0.22, 0], [0.0289, 0.19, 1], [0.0347, 0.15, 0], [0.0409, 0.12, 1]] };
function room(inL, inR) {
  const n = inL.length;
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const pre = Math.round(ROOM.pre * SR), wh = TAU * ROOM.fhi / SR, NL = 16;
  for (const [a, b] of activeRanges([inL, inR], 2.2)) {
    const lines = ROOM.delays.map((d) => {
      const gdc = Math.pow(10, -3 * d / (SR * ROOM.t60)), want = Math.pow(10, -3 * d / (SR * ROOM.t60hi)) / gdc;
      let lo = 0, hi = 0.999;
      for (let k = 0; k < 40; k++) {
        const c = (lo + hi) / 2;
        if ((1 - c) / Math.sqrt(1 - 2 * c * Math.cos(wh) + c * c) > want) { lo = c; } else { hi = c; }
      }
      return { buf: new Float64Array(d), i: 0, g: gdc, a: (lo + hi) / 2, z: 0 };
    });
    const mk = (len, g) => ({ buf: new Float64Array(len), i: 0, g });
    const apL = [mk(113, 0.62), mk(241, 0.58), mk(397, 0.55)], apR = [mk(127, 0.62), mk(263, 0.58), mk(419, 0.55)];
    const s = new Float64Array(NL);
    for (let i = a; i < b; i++) {
      const j = i - pre;
      let xl = j >= a ? inL[j] : 0, xr = j >= a ? inR[j] : 0;
      for (let q = 0; q < 3; q++) {
        let A = apL[q], o = A.buf[A.i], v = xl + o * A.g; A.buf[A.i] = v; A.i = A.i + 1 === A.buf.length ? 0 : A.i + 1; xl = o - v * A.g;
        A = apR[q]; o = A.buf[A.i]; v = xr + o * A.g; A.buf[A.i] = v; A.i = A.i + 1 === A.buf.length ? 0 : A.i + 1; xr = o - v * A.g;
      }
      let yl = 0, yr = 0;
      for (let k = 0; k < NL; k++) {
        const Ln = lines[k];
        Ln.z = (1 - Ln.a) * Ln.buf[Ln.i] * Ln.g + Ln.a * Ln.z;
        s[k] = Ln.z;
        if (k & 1) { yr += (k & 2) ? -Ln.z : Ln.z; } else { yl += (k & 2) ? -Ln.z : Ln.z; }
      }
      for (let h = 1; h < NL; h <<= 1) {
        for (let p = 0; p < NL; p += h << 1) {
          for (let q = p; q < p + h; q++) { const u = s[q], v = s[q + h]; s[q] = u + v; s[q + h] = u - v; }
        }
      }
      for (let k = 0; k < NL; k++) {
        const Ln = lines[k];
        Ln.buf[Ln.i] = s[k] * 0.25 + ((k & 1) ? xr : xl) * ((k & 4) ? -0.5 : 0.5);
        Ln.i = Ln.i + 1 === Ln.buf.length ? 0 : Ln.i + 1;
      }
      for (let e = 0; e < ROOM.early.length; e++) {
        const er = ROOM.early[e], q = i - pre - Math.round(er[0] * SR);
        if (q >= a) { if (er[2]) { yr += inR[q] * er[1] * 1.4 + inL[q] * er[1] * 0.5; } else { yl += inL[q] * er[1] * 1.4 + inR[q] * er[1] * 0.5; } }
      }
      outL[i] = yl * 0.3; outR[i] = yr * 0.3;
    }
    for (const o of [outL, outR]) { biquad(o, 'hp', 150, 0.7, 0, a, b); biquad(o, 'lp', 5200, 0.6, 0, a, b); }
  }
  return [outL, outR];
}

/* ====================================================================== the chart */

/* Where in the bar: beat 0..3, with .65 for the swung "and". */
function at(bar, beat) {
  const whole = Math.floor(beat + 1e-9), frac = beat - whole;
  return bar * BAR + whole * BEAT + (frac > 0.01 ? SWUNG : 0);
}

/* THE WALKING BASS, composed bar by bar: chord tones on the strong beats, a chromatic or scale
 * approach into the next bar's root, never the same bar twice, E1 to G3.
 * [beat, midi, length in beats, velocity, flag]  ('g' a dead ghost note, 's' a scoop up into the note). MIDI 38 = D2. */
const BASS = [
  [0, [[1, 38, 1, 0.62], [2, 41, 1, 0.64], [3, 45, 1, 0.68]]],                                              // Dm   the dock: one note a bay, D F A ...
  [1, [[0, 50, 1, 0.74], [1, 48, 1, 0.62], [2, 46, 1, 0.66], [3, 45, 1, 0.62]]],                            // Dm   ... D for the fourth bay, then down the scale; brushes in
  [2, [[0, 43, 1, 0.92, 's'], [1, 50, 1, 0.80], [1.65, 50, 0, 0.34, 'g'], [2, 46, 1, 0.86], [3, 53, 1, 0.84]]],   // Gm9  idea 1 swaggers: leaps
  [3, [[0, 52, 1, 0.90], [1, 50, 1, 0.80], [2, 49, 1, 0.88], [3, 46, 1, 0.84], [3.65, 46, 0, 0.36, 'g']]],  // Em7b5 A7: down to the hit
  [4, [[0, 45, 0.4, 1.0]]],                                                                                  // NO 1: the hit, then stop-time
  [5, [[0, 43, 2, 0.58], [2, 45, 1, 0.56], [3, 49, 1, 0.60]]],                                              // Gm7 A7  the bass alone, in two
  [6, [[0, 50, 2, 0.70], [2, 45, 1, 0.62], [3, 44, 1, 0.60]]],                                              // Dm9  idea 2: a two-feel, higher, lighter
  [7, [[0, 43, 2, 0.70], [1.65, 43, 0, 0.28, 'g'], [2, 50, 1, 0.64], [3, 41, 1, 0.62]]],                    // Gm7
  [8, [[0, 40, 1, 0.74], [1, 46, 1, 0.68], [2, 39, 0.4, 1.0]]],                                             // Em7b5 | NO 2 on beat 3: Eb7
  [11, [[0, 38, 1, 0.56], [1, 40, 1, 0.52], [2, 41, 1, 0.56], [3, 42, 1, 0.54]]],                           // Dm   idea 3: plain, one step at a time
  [12, [[0, 43, 1, 0.62], [1, 45, 1, 0.58], [2, 46, 1, 0.62], [3, 50, 1, 0.60]]],                           // Gm
  [13, [[0, 52, 1, 0.68], [1, 50, 1, 0.62], [2, 46, 1, 0.66], [3, 44, 1, 0.64]]],                           // Em7b5: round the A from above and below
  [14, [[0, 45, 1, 0.82], [1, 43, 1, 0.76], [2, 40, 1, 0.80], [3, 37, 1, 0.82]]],                           // A9: down the chord to the leading note
  [15, [[0, 38, 1, 0.86], [1, 41, 1, 0.70], [2, 45, 1, 0.74], [3, 44, 1, 0.70]]],                           // Dm9  the winner: the low D
  [16, [[0, 43, 1, 0.80, 's'], [1, 46, 1, 0.74], [2, 50, 1, 0.80], [3, 53, 1, 0.80]]],                      // Gm9  the title builds: straight up the chord
  [17, [[0, 52, 1, 0.86], [1, 46, 1, 0.80], [1.65, 46, 0, 0.32, 'g'], [2, 45, 1, 0.86], [3, 40, 1, 0.84]]], // Em7b5 A7: falling
  [18, [[0, 39, 1, 0.88], [1, 33, 1, 0.90], [2, 38, 2.4, 0.98]]],                                           // Eb7, A, and home on the slab (37 s)
  [19, [[0, 40, 2, 0.66], [2, 33, 2, 0.70]]],                                                               // tag: Em7b5 A7
  [20, [[0, 38, 9.2, 0.80]]]                                                                                 // D: ring out
];

/* PIANO: rootless voicings in the middle of the keyboard. */
const V = {
  Gm9: [53, 57, 58, 62], Gm9b: [57, 58, 62, 65], Gm9up: [58, 62, 65, 69], Bbmaj9: [62, 65, 69, 72],
  Em7b5: [55, 58, 62, 64], Em7b5thin: [55, 58, 62],
  A7b9: [55, 58, 61, 65], A7b9hit: [49, 55, 58, 65],
  Dm9thin: [53, 57, 64], Eb7hit: [55, 61, 65], Eb7s11: [55, 61, 65, 69],
  Dm69land: [53, 57, 59, 64, 69], Dm69end: [50, 53, 57, 59, 64, 69, 74]
};
const CLIMB = MUSIC.climb;
/* [time, notes, seconds held, velocity, roll (seconds between notes), 'ped' = with the pedal] */
const PIANO = [
  [I1.kickerAt, V.Gm9, 0.24, 0.66, 0.007],                 // idea 1 is announced: a stab
  [at(2, 0.65), V.Gm9up, 0.20, 0.56, 0.004],               // "A chatbot": higher
  [at(2, 1.65), V.Bbmaj9, 0.50, 0.64, 0.014],              // "for everything": higher still, rolled, held: pleased with itself
  [at(2, 3.65), V.Em7b5, 0.34, 0.58, 0],                   // pushed, as the block comes in
  [I1.enter[1], V.Em7b5, 0.14, 0.50, 0],                   // the block stops dead at the post
  [at(3, 2.65), V.A7b9, 0.22, 0.62, 0.004],                // pushed again; then air before the hit
  [NO1, V.A7b9hit, 0.15, 0.78, 0],                         // NO 1: the stop-time hit
  [I2.titleAt[0], V.Dm9thin, 0.28, 0.50, 0.008],           // idea 2: one thin stab
  [I2.gates[0].lift, [69], 0.8, 0.42, 0],                  // COST lifts for idea 2: a nod, one note (the note the climb will start from)
  [at(8, 0), V.Em7b5thin, 0.30, 0.42, 0],
  [NO2, V.Eb7hit, 0.15, 0.72, 0],                          // NO 2: the stop-time hit
  [PASS[0], [CLIMB[0].from], 0.3, 0.44, 0], [PASS[0] + SWUNG, CLIMB[0].to, 1.1, 0.48, 0.012],     // PASS 1: F up to A
  [PASS[1], [CLIMB[1].from], 0.3, 0.47, 0], [PASS[1] + SWUNG, CLIMB[1].to, 1.1, 0.51, 0.012],     // PASS 2: G up to B flat, on two notes
  [PASS[2], [CLIMB[2].from], 0.3, 0.50, 0], [PASS[2] + SWUNG, CLIMB[2].to, 1.1, 0.54, 0.014],     // PASS 3: B flat up to D, on three
  [PASS[3], [CLIMB[3].from], 0.3, 0.58, 0], [PASS[3] + SWUNG, CLIMB[3].to, 1.05, 0.63, 0.014],    // PASS 4: C sharp up to E, on four
  [I3.winner, MUSIC.resolve, 1.75, 0.64, 0.03, 'ped'],     // the winner: the climb comes home, F over D
  [T.cover, V.Gm9, 0.3, 0.50, 0.006],                      // the sleeve
  [at(16, 2), V.Gm9, 0.16, 0.48, 0], [at(16, 2.65), V.Gm9b, 0.14, 0.38, 0],                      // the four title lines cut in:
  [at(16, 3), V.Gm9up, 0.16, 0.52, 0], [at(16, 3.65), V.Bbmaj9, 0.26, 0.46, 0.006],              // four stabs, each higher
  [at(17, 0), V.Em7b5, 0.4, 0.50, 0],
  [T.name, V.A7b9, 0.4, 0.54, 0],
  [at(17, 3.65), V.Eb7s11, 0.6, 0.58, 0.006],              // pushed, and held while the slab lets go
  [SLAB, V.Dm69land, 0.95, 0.72, 0.012, 'ped'],            // THE SLAB: the home chord
  [T.positive, V.Em7b5, 0.8, 0.44, 0.01],                  // tag
  [at(19, 2), V.A7b9, 0.72, 0.46, 0.01],
  [at(19, 3), [70], 0.24, 0.40, 0],                        // a little line home: B flat, C sharp, D
  [at(19, 3.65), [73], 0.2, 0.42, 0],
  [at(20, 0), V.Dm69end, 4.85, 0.56, 0.045, 'ped']         // the last chord, rolled, left to ring, let go
];

/* The ride, bar by bar: spang-a-lang, but not the same bar four times. [beat, velocity] */
const RIDE_BARS = [
  [[0, 0.55], [1, 0.68], [1.65, 0.32], [2, 0.56], [3, 0.68], [3.65, 0.30]],
  [[0, 0.58], [1, 0.64], [1.65, 0.28], [2, 0.52], [3, 0.70]],
  [[0, 0.54], [1, 0.70], [1.65, 0.34], [2, 0.58], [3, 0.66], [3.65, 0.26]],
  [[0, 0.52], [1, 0.70], [2, 0.56], [2.65, 0.26], [3, 0.66], [3.65, 0.34]]
];

/* ====================================================================== the performance */

function playing(t, who) { return MUSIC.sections.some((s) => t >= s.from - 1e-6 && t < s.to - 1e-6 && s.play.indexOf(who) >= 0); }
function sectionAt(t) { return MUSIC.sections.find((s) => t >= s.from - 1e-6 && t < s.to - 1e-6); }
function isSync(t) { return [NO1, NO2, SLAB].some((x) => Math.abs(x - t) < 1e-9); }
/* How hard the drummer leans in: up through idea 3, up again into the slab. */
function lean(t) {
  if (t >= PASS[1] && t < I3.winner) { return 0.8 + 0.2 * (t - PASS[1]) / (I3.winner - PASS[1]); }
  if (t >= T.cover && t < SLAB) { return 0.95 + 0.25 * (t - T.cover) / (SLAB - T.cover); }
  if (t >= I1.out && t < NO2) { return 0.8; }
  return 1;
}

/* Turn the chart into what the players do: timing and touch from one seeded generator. */
function perform() {
  const human = rng(seedOf('three players, 1959'));
  const P = { bass: [], piano: [], pedals: [], taps: [], swirls: [], swishes: [], ride: [], hats: [], kicks: [], thuds: [] };

  // bass: a few milliseconds behind the beat
  BASS.forEach(([bar, notes]) => notes.forEach(([beat, m, len, vel, flag]) => {
    const t0 = at(bar, beat), exact = isSync(t0), ghost = flag === 'g';
    P.bass.push({
      t0, t: exact ? t0 : t0 + (ghost ? 0.004 : 0.011) + 0.003 * gauss(human), m,
      dur: ghost ? 0.05 : len * BEAT, vel: exact ? vel : clamp(vel * (1 + 0.045 * gauss(human)), 0.2, 1),
      ghost, slide: flag === 's', vib: len >= 2, exact
    });
  }));
  P.bass.sort((a, b) => a.t - b.t);

  // piano: the hand lands a touch late and never quite together; the top note sings
  PIANO.forEach(([t0, notes, hold, vel, roll, flag]) => {
    const exact = isSync(t0);
    const tc = exact ? t0 : t0 + 0.002 + 0.004 * gauss(human), vc = exact ? vel : vel * (1 + 0.05 * gauss(human));
    notes.forEach((m, k) => {
      const t = tc + k * roll + (exact && k === 0 ? 0 : 0.0015 * Math.abs(gauss(human)));
      const voice = notes.length > 1 ? (k === notes.length - 1 ? 1.08 : (k === 0 ? 1 : 0.94)) : 1;
      P.piano.push({ t0, t, m, dur: Math.max(0.05, Math.min(hold - (t - t0), DUR - t)), vel: clamp(vc * voice * (1 + 0.03 * gauss(human)), 0.15, 1), exact: exact && k === 0 });
    });
    if (flag === 'ped') { P.pedals.push([t0 - 0.005, t0 + hold, notes.slice()]); }
  });
  P.piano.sort((a, b) => a.t - b.t);

  // drums
  const bars = Math.ceil(DUR / BAR);
  for (let b = 0; b < bars; b++) {
    for (const [beat, vel] of RIDE_BARS[b % RIDE_BARS.length]) {
      const t0 = at(b, beat);
      if (t0 < DUR && playing(t0, 'ride') && !isSync(t0)) {
        P.ride.push({ t0, t: t0 - 0.005 + 0.0025 * gauss(human), vel: clamp(vel * lean(t0) * (1 + 0.07 * gauss(human)), 0.05, 1), kind: 'tip' });
      }
    }
    for (let beat = 0; beat < 4; beat++) {
      const t0 = at(b, beat);
      if (t0 >= DUR || isSync(t0)) { continue; }
      const sec = sectionAt(t0);
      if (playing(t0, 'hat') && (beat === 1 || beat === 3)) { P.hats.push({ t0, t: t0 - 0.003 + 0.003 * gauss(human), vel: clamp(0.5 * lean(t0) * (1 + 0.1 * gauss(human)), 0.1, 1) }); }
      if (playing(t0, 'kick')) { P.kicks.push({ t0, t: t0 + 0.003 * gauss(human), vel: clamp((beat % 2 === 0 ? 0.30 : 0.22) * lean(t0) * (1 + 0.08 * gauss(human)), 0.05, 1) }); }
      if (playing(t0, 'brush') && (beat === 1 || beat === 3)) {
        P.taps.push({ t0, t: t0 + 0.004 * gauss(human), vel: clamp(0.42 * (0.55 + 0.45 * (sec.level || 1)) * lean(t0) * (1 + 0.09 * gauss(human)), 0.05, 1) });
      }
    }
    const tg = at(b, 3.65);                                           // a ghosted tap before the bar line, every other bar
    if (b % 2 === 1 && tg < DUR && playing(tg, 'brush') && !playing(tg, 'ride')) { P.taps.push({ t0: tg, t: tg + 0.004 * gauss(human), vel: 0.13 * (1 + 0.1 * gauss(human)) }); }
  }
  // the fill into NO 1: the brush leans in, two quick taps
  P.taps.push({ t0: at(3, 3.65), t: at(3, 3.65) + 0.003 * gauss(human), vel: 0.34 });
  // the hits: a slap of the brush and the bass drum with each NO; the ride and the bass drum on the slab
  [NO1, NO2].forEach((t) => { P.taps.push({ t0: t, t, vel: 0.7, exact: true }); P.kicks.push({ t0: t, t, vel: 0.5, exact: true }); });
  P.ride.push({ t0: SLAB, t: SLAB, vel: 0.6, kind: 'tip', exact: true });
  P.kicks.push({ t0: SLAB, t: SLAB, vel: 0.42, exact: true });
  // a soft mallet roll on the ride, rising into the slab
  for (let t = SLAB - 1.5; t < SLAB - 0.04; t += 0.071 + 0.006 * human()) {
    const p = (t - (SLAB - 1.5)) / 1.5;
    P.ride.push({ t0: t, t: t + 0.004 * gauss(human), vel: 0.07 + 0.4 * p * p, kind: 'mallet' });
  }
  // tag: the ride softly on the beat, one last touch under the final chord
  [0, 1, 2, 3].forEach((k) => { const t = at(19, k); P.ride.push({ t0: t, t: t - 0.005 + 0.0025 * gauss(human), vel: 0.34 - 0.03 * k, kind: 'tip' }); });
  P.ride.push({ t0: at(20, 0), t: at(20, 0) + 0.004, vel: 0.33, kind: 'tip' });
  P.ride.sort((a, b) => a.t - b.t); P.taps.sort((a, b) => a.t - b.t); P.kicks.sort((a, b) => a.t - b.t);

  // the swirl: one continuous sweep under every stretch the brushes play
  const spans = [];
  MUSIC.sections.filter((s) => s.play.indexOf('brush') >= 0).forEach((s) => {
    const last = spans[spans.length - 1];
    if (last && Math.abs(last.t1 - s.from) < 1e-6) { last.t1 = s.to; } else { spans.push({ t0: s.from, t1: s.to }); }
  });
  spans.forEach((sp) => {
    P.swirls.push({ t0: sp.t0, t1: sp.t1, level: (t) => {
      const s = sectionAt(Math.min(t, sp.t1 - 1e-4)) || {};
      let g = (s.level || 1) * lean(t);
      if (t > NO1 - 0.5 && t < NO1) { g *= 1 + 0.9 * (t - (NO1 - 0.5)) / 0.5; }          // leaning into the first NO
      if (t > NO2 - 0.375 && t < NO2) { g *= 1 + 0.5 * (t - (NO2 - 0.375)) / 0.375; }
      if (t > SLAB - 1.5 && t < SLAB) { g *= 1 + 0.6 * (t - (SLAB - 1.5)) / 1.5; }        // and into the slab
      return g;
    } });
  });
  P.swirls.push({ t0: T.positive, t1: at(20, 1.5), level: (t) => 0.5 * Math.max(0, 1 - (t - T.positive) / (at(20, 1.5) - T.positive)) });   // tag: fading
  // a single sweep as the dock is wiped for idea 2 and as the sleeve covers the stage
  P.swishes.push({ t: I1.out, vel: 0.2 }, { t: T.cover, vel: 0.2 });

  // the NOs and the slab
  P.thuds.push({ t: NO1, hz: MUSIC.thudHz[0], size: 1, rattle: true }, { t: NO2, hz: MUSIC.thudHz[1], size: 1.15, rattle: true }, { t: SLAB, hz: MUSIC.thudHz[2], size: 0.75, rattle: false });
  return P;
}

/* ====================================================================== the mix */

const LEVEL = { bass: 1.25, piano: 0.44, brush: 0.5, ride: 0.225, hat: 0.56, kick: 0.3, thud: 0.25 };      // each instrument in the trio
const SEND = { bass: 0.05, piano: 0.28, brush: 0.22, ride: 0.26, hat: 0.22, kick: 0.04, thud: 0.2 };    // how much of it reaches the room
const STEM_GAIN = 1.0;                                 // the level of the whole mix before the master

/* Render every instrument, send it to the room, and gather the four stems (each with its own share of the room). */
function renderStems(P, log) {
  const t0 = Date.now();
  const tick = (what) => { if (log) { log('  ' + what.padEnd(34) + ((Date.now() - t0) / 1000).toFixed(1) + ' s'); } };
  const bass = renderBass(P.bass, N); tick('bass (' + P.bass.length + ' notes)');
  const piano = renderPiano(P.piano, P.pedals, N); tick('piano (' + P.piano.length + ' notes)');
  const brush = renderBrushes(P.swirls, P.taps, P.swishes, N); tick('brushes (' + P.taps.length + ' taps)');
  const ride = renderRide(P.ride, MUSIC.stops.map((s) => s[0] + 0.03), N); tick('ride (' + P.ride.length + ' hits)');
  const hat = renderHits(P.hats, hatChick, 'hat', N, HAT_PAN);
  const kick = renderHits(P.kicks, kickHit, 'kick', N, KICK_PAN); tick('hi-hat, bass drum');
  const thudL = new Float32Array(N), thudR = new Float32Array(N), thudBufs = [];
  P.thuds.forEach((e) => {
    const y = thudSound(e.hz, e.size, e.rattle, rng(seedOf('thud ' + e.t)));
    for (let i = 0, a = S(e.t); i < y.L.length && a + i < N; i++) { thudL[a + i] += y.L[i]; thudR[a + i] += y.R[i]; }
    thudBufs.push({ key: 0, t: e.t, buf: y.L, from: 0 });
  });
  tick('the NO thuds');

  // each instrument's own tone, gently
  biquad(bass.out, 'peak', 850, 1.0, -1.5);
  for (const ch of [piano.L, piano.R]) { biquad(ch, 'hp', 70, 0.7); biquad(ch, 'lp', 7000, 0.5); }
  const rideS = { L: new Float32Array(N), R: new Float32Array(N) };
  biquad(ride.out, 'lp', 7500, 0.6);
  putStereo(rideS.L, rideS.R, 0, ride.out, 1, RIDE_PAN);
  for (const ch of [hat.L, hat.R]) { biquad(ch, 'lp', 6500, 0.6); }

  // stop-time: the drummer lays a hand on the snare and the cymbal with the hit, and stops
  const choke = new Float32Array(N).fill(1);
  MUSIC.stops.forEach(([a, b]) => {
    const sa = S(a) + Math.round(0.11 * SR), sb = S(b), ramp = Math.round(0.05 * SR);
    for (let i = sa; i < sb && i < N; i++) { choke[i] = i - sa < ramp ? 0.5 + 0.5 * Math.cos(Math.PI * (i - sa) / ramp) : 0; }
  });
  for (const ch of [brush.L, brush.R, rideS.L, rideS.R, hat.L, hat.R, kick.L, kick.R]) { for (let i = 0; i < N; i++) { ch[i] *= choke[i]; } }

  const dry = {
    bass: [[bass.out, bass.out, LEVEL.bass, SEND.bass]],
    keys: [[piano.L, piano.R, LEVEL.piano, SEND.piano]],
    drums: [[brush.L, brush.R, LEVEL.brush, SEND.brush], [rideS.L, rideS.R, LEVEL.ride, SEND.ride], [hat.L, hat.R, LEVEL.hat, SEND.hat], [kick.L, kick.R, LEVEL.kick, SEND.kick]],
    fx: [[thudL, thudR, LEVEL.thud, SEND.thud]]
  };
  // the held breath: the band and its tails are gone before it; this only makes sure (the room tone is added after)
  const gate = new Float32Array(N).fill(1);
  {
    const a = S(I2.out), b = S(MUSIC.breath[0]), c = S(MUSIC.breath[1] - 0.05), d = S(MUSIC.breath[1] - 0.042);
    for (let i = a; i < d; i++) { gate[i] = i < b ? 0.5 + 0.5 * Math.cos(Math.PI * (i - a) / (b - a)) : (i < c ? 0 : (i - c) / (d - c)); }
  }
  const stems = {}, parts = {};
  for (const name of Object.keys(dry)) {
    const L = new Float32Array(N), R = new Float32Array(N), sL = new Float32Array(N), sR = new Float32Array(N);
    for (const [l, r, g, send] of dry[name]) {
      for (let i = 0; i < N; i++) { const a = l[i] * g, b = r[i] * g; L[i] += a; R[i] += b; sL[i] += a * send; sR[i] += b * send; }
    }
    const wet = room(sL, sR);
    for (let i = 0; i < N; i++) { L[i] = (L[i] + wet[0][i]) * gate[i] * STEM_GAIN; R[i] = (R[i] + wet[1][i]) * gate[i] * STEM_GAIN; }
    stems[name] = [L, R];
    tick('room for ' + name);
  }
  parts.brush = brush; parts.ride = rideS; parts.hat = hat; parts.kick = kick; parts.bass = bass; parts.piano = piano;
  parts.thud = { L: thudL, R: thudR, bufs: thudBufs }; parts.rideWeights = ride.weights;
  return { stems, parts };
}

/* ---- measuring: BS.1770 loudness, loudness range, true peak --------------------------------------------- */

function kWeighted(x) {
  const y = Float64Array.from(x);
  const run = (b, a) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < y.length; i++) { const v = y[i]; const o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; } };
  run([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  run([1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  return y;
}
/* integrated loudness (LUFS, gated) and loudness range (LU, EBU Tech 3342) */
function loudness(L, R) {
  const l = kWeighted(L), r = kWeighted(R), n = l.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { cum[i + 1] = cum[i] + l[i] * l[i] + r[i] * r[i]; }
  const blocks = (win, hop) => { const z = []; for (let s = 0; s + win <= n; s += hop) { z.push((cum[s + win] - cum[s]) / win); } return z; };
  const lk = (e) => -0.691 + 10 * Math.log10(Math.max(e, 1e-30));
  const mean = (a) => a.reduce((p, c) => p + c, 0) / Math.max(1, a.length);
  let z = blocks(Math.round(0.4 * SR), Math.round(0.1 * SR)).filter((e) => lk(e) > -70);
  const rel = lk(mean(z)) - 10;
  const integrated = lk(mean(z.filter((e) => lk(e) > rel)));
  z = blocks(3 * SR, Math.round(0.1 * SR)).filter((e) => lk(e) > -70);
  const rel2 = lk(mean(z)) - 20;
  const st = z.filter((e) => lk(e) > rel2).map(lk).sort((a, b) => a - b);
  const pct = (p) => { if (!st.length) { return 0; } const x = (st.length - 1) * p, i = Math.floor(x); return st[i] + (st[Math.min(st.length - 1, i + 1)] - st[i]) * (x - i); };
  return { lufs: integrated, lra: pct(0.95) - pct(0.10) };
}
const TP_FIR = (function () {       // 3 fractional phases of a windowed sinc, 16 taps each: 4x oversampling
  const taps = 16, out = [];
  for (let ph = 1; ph < 4; ph++) {
    const h = [];
    for (let k = -taps / 2 + 1; k <= taps / 2; k++) {
      const x = k - ph / 4;
      const w = 0.42 + 0.5 * Math.cos(Math.PI * x / (taps / 2)) + 0.08 * Math.cos(2 * Math.PI * x / (taps / 2));
      h.push((x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w);
    }
    out.push(h);
  }
  return out;
}());
function truePeakAt(ch, i) {
  let p = Math.abs(ch[i]);
  const n = ch.length;
  for (const h of TP_FIR) {
    let s = 0;
    for (let k = 0; k < h.length; k++) { const j = i + k - 7; if (j >= 0 && j < n) { s += ch[j] * h[k]; } }
    if (Math.abs(s) > p) { p = Math.abs(s); }
  }
  return p;
}
function truePeak(L, R, floor) {
  let tp = 0;
  for (const ch of [L, R]) { for (let i = 0; i < ch.length; i++) { if (Math.abs(ch[i]) > floor) { const v = truePeakAt(ch, i); if (v > tp) { tp = v; } } } }
  return tp;
}

/* ---- the master bus ------------------------------------------------------------------------------------- */

const MASTER = { lufs: -16.0, ceilingDb: -2.0, hp: 30, shelfHz: 8000, shelfDb: -4, lp: 15000, thr: -21, ratio: 2.0, knee: 8, attack: 0.008, release: 0.25, warmHz: 1600, warmDb: -3 };
/* the master's filters: high-pass 30 Hz (24 dB an octave), a broad warm shelf, a shelf down above 8 kHz, a low-pass at 15 kHz */
function masterFilters(ch) {
  biquad(ch, 'hp', MASTER.hp, 0.5412); biquad(ch, 'hp', MASTER.hp, 1.3066);
  biquad(ch, 'highshelf', MASTER.warmHz, 0.5, MASTER.warmDb);
  biquad(ch, 'highshelf', MASTER.shelfHz, 0.7, MASTER.shelfDb);
  biquad(ch, 'lp', MASTER.lp, 0.5);
  return ch;
}

/* High-pass 30 Hz, a broad warm shelf (-3 dB above 1.6 kHz), a shelf down above 8 kHz, a soft-knee
 * compressor that only leans on the loudest moments, the loudness set to -16 LUFS, a true-peak limiter
 * under -2 dBTP, the fades at the ends. */
function master(inL, inR) {
  const L = Float32Array.from(inL), R = Float32Array.from(inR), n = L.length;
  for (const ch of [L, R]) { masterFilters(ch); }
  const scale = (g) => { for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } };
  const g1 = Math.pow(10, (MASTER.lufs - loudness(L, R).lufs) / 20);
  scale(g1);
  let maxGr = 0;
  {
    const att = Math.exp(-1 / (MASTER.attack * SR)), rel = Math.exp(-1 / (MASTER.release * SR)), det = Math.exp(-1 / (0.01 * SR));
    const ratio = MASTER.ratio, knee = MASTER.knee;
    let ms = 0, gr = 0;
    for (let i = 0; i < n; i++) {
      ms = det * ms + (1 - det) * 0.5 * (L[i] * L[i] + R[i] * R[i]);
      const over = 10 * Math.log10(ms + 1e-12) - MASTER.thr;
      let want = 0;
      if (over > knee / 2) { want = over * (1 - 1 / ratio); }
      else if (over > -knee / 2) { want = (1 - 1 / ratio) * (over + knee / 2) * (over + knee / 2) / (2 * knee); }
      gr = want > gr ? att * gr + (1 - att) * want : rel * gr + (1 - rel) * want;
      if (gr > maxGr) { maxGr = gr; }
      const g = Math.pow(10, -gr / 20);
      L[i] *= g; R[i] *= g;
    }
  }
  const g2 = Math.pow(10, (MASTER.lufs - loudness(L, R).lufs) / 20);
  scale(g2);
  // true-peak limiter: 4x oversampled peak estimate, 3 ms look-ahead, slow release; twice, to catch what the ramp let through
  const ceiling = Math.pow(10, MASTER.ceilingDb / 20);
  let limited = 0;
  for (let pass = 0; pass < 2; pass++) {
    const look = Math.round(0.003 * SR), rel = Math.exp(-1 / (0.15 * SR));
    const need = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      if (Math.max(Math.abs(L[i]), Math.abs(R[i])) < ceiling * 0.7) { continue; }
      const a = Math.max(truePeakAt(L, i), truePeakAt(R, i));
      if (a > ceiling) { need[i] = ceiling / a * 0.999; }
    }
    const g = new Float32Array(n), dq = [];
    let head = 0;
    for (let i = 0; i < n + look; i++) {
      if (i < n) { while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) { dq.pop(); } dq.push(i); }
      const k = i - look;
      if (k < 0) { continue; }
      while (dq[head] < k - look) { head++; }
      g[k] = need[dq[head]];
    }
    let hold = 1;
    for (let i = 0; i < n; i++) {
      hold = g[i] < hold ? g[i] : g[i] + (hold - g[i]) * rel;
      if (hold < 0.999) { limited++; }
      L[i] *= hold; R[i] *= hold;
    }
  }
  // the ends: 5 ms in; the last 300 ms fade (the music is gone before it)
  const fa = SCORE.fadeOut[0], fb = SCORE.fadeOut[1];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let g = i < 240 ? 0.5 - 0.5 * Math.cos(Math.PI * i / 240) : 1;
    if (t >= fa) { g *= t >= fb ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (t - fa) / (fb - fa)); }
    L[i] *= g; R[i] *= g;
  }
  return { L, R, gainDb: dB(g1 * g2), maxGrDb: maxGr, limitedShare: limited / (2 * n) };
}

/* ---- WAV, 24-bit, TPDF dither --------------------------------------------------------------------------- */

function writeWav(file, chans, seed) {
  const frames = chans[0].length, data = Buffer.alloc(frames * 6), d = rng(seed), FS = 8388607;
  let clipped = 0, o = 0;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < 2; ch++) {
      let v = Math.round(chans[ch][i] * FS + (d() - d()));
      if (v > FS) { v = FS; clipped++; }
      if (v < -FS - 1) { v = -FS - 1; clipped++; }
      data[o++] = v & 255; data[o++] = (v >> 8) & 255; data[o++] = (v >> 16) & 255;
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 6, 28); h.writeUInt16LE(6, 32); h.writeUInt16LE(24, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
  return clipped;
}
function readWav24(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.readUInt16LE(34) !== 24 || b.readUInt16LE(22) !== 2 || b.readUInt32LE(24) !== SR) { throw new Error(file + ': not a 48 kHz stereo 24-bit WAV'); }
  const frames = b.readUInt32LE(40) / 6, L = new Float32Array(frames), R = new Float32Array(frames);
  for (let i = 0, o = 44; i < frames; i++, o += 6) { L[i] = b.readIntLE(o, 3) / 8388607; R[i] = b.readIntLE(o + 3, 3) / 8388607; }
  return [L, R];
}

/* ====================================================================== the self-checks */

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) { j ^= bit; }
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const NFFT = 16384;
const HANN = (function () { const w = new Float64Array(NFFT); for (let i = 0; i < NFFT; i++) { w[i] = 0.5 - 0.5 * Math.cos(TAU * i / NFFT); } return w; }());
/* long-term power spectrum: Hann windows, half overlap; for [L, R] also the spectrum of the mono sum */
function spectrum(chans, from, to) {
  const a = from || 0, b = to === undefined ? chans[0].length : to;
  const p = new Float64Array(NFFT / 2 + 1), pm = new Float64Array(NFFT / 2 + 1);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), mr = new Float64Array(NFFT), mi = new Float64Array(NFFT);
  let count = 0;
  for (let s = a; s + NFFT <= b; s += NFFT / 2) {
    mr.fill(0); mi.fill(0);
    for (const ch of chans) {
      for (let i = 0; i < NFFT; i++) { re[i] = ch[s + i] * HANN[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k <= NFFT / 2; k++) { p[k] += (re[k] * re[k] + im[k] * im[k]) / chans.length; mr[k] += re[k] / chans.length; mi[k] += im[k] / chans.length; }
    }
    for (let k = 0; k <= NFFT / 2; k++) { pm[k] += mr[k] * mr[k] + mi[k] * mi[k]; }
    count++;
  }
  return { p, pm, count };
}
function bandPower(p, lo, hi) {
  let s = 0;
  for (let k = Math.max(0, Math.ceil(lo * NFFT / SR)); k <= NFFT / 2 && k * SR / NFFT < hi; k++) { s += p[k]; }
  return s;
}
/* The tilt from 200 Hz to 8 kHz: a straight line through third-octave band levels (dB per octave). */
function tilt(p) {
  const xs = [], ys = [];
  for (let k = 0; k <= 16; k++) {
    const c = 200 * Math.pow(2, k / 3);
    xs.push(Math.log2(c)); ys.push(dBp(bandPower(p, c * Math.pow(2, -1 / 6), c * Math.pow(2, 1 / 6))));
  }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
  return num / den;
}
/* Isolated discontinuities. A click is a sample the three before it do not predict, far above what
 * surrounds it within 2 ms. A steep note attack is not one: its high frequencies carry on after it. */
function findClicks(chans) {
  const found = [];
  chans.forEach((v, c) => {
    const n = v.length;
    let last = -1e9;
    for (let i = 3; i < n; i++) {
      const e = Math.abs(v[i] - 3 * v[i - 1] + 3 * v[i - 2] - v[i - 3]);
      if (e <= 0.006 || i - last < 96) { continue; }
      let pk = 0, sa = 0, na = 0;
      for (let j = Math.max(3, i - 96); j < Math.min(n, i + 97); j++) {
        const d = Math.abs(v[j] - 3 * v[j - 1] + 3 * v[j - 2] - v[j - 3]);
        if (Math.abs(j - i) <= 2) { if (d > pk) { pk = d; } } else if (Math.abs(j - i) >= 6) { sa += d * d; na++; }
      }
      if (pk > 12 * Math.max(1e-9, Math.sqrt(sa / Math.max(1, na)))) { found.push({ t: i / SR, channel: c, size: pk }); last = i; }
    }
  });
  return found;
}
/* When a hit starts to sound: 2 ms RMS frames every 0.25 ms on the mono sum; the first frame that is
 * 6 dB above the level just before the hit and has reached a tenth of the peak of the next 80 ms. */
function onsetMs(L, R, t) {
  const hop = 12, win = 96, s0 = S(t - 0.06), frames = [];
  for (let k = 0; k < Math.floor(0.16 * SR / hop); k++) {
    let s = 0;
    for (let i = s0 + k * hop; i < s0 + k * hop + win; i++) { const m = 0.5 * (L[i] + R[i]); s += m * m; }
    frames.push([s0 + k * hop, Math.sqrt(s / win)]);
  }
  let pre = 1e-9, peak = 0;
  for (const [s, v] of frames) { if (s + win <= S(t - 0.012)) { pre = Math.max(pre, v); } if (s >= S(t - 0.01)) { peak = Math.max(peak, v); } }
  const thr = Math.max(pre * 2, peak * 0.1);
  for (const [s, v] of frames) { if (s + win > S(t - 0.04) && v > thr) { return { ms: (s + win - t * SR) / SR * 1000, pre, peak }; } }
  return { ms: NaN, pre, peak };
}
/* the largest normalised correlation between any two sounds of one kind (same key), searched +/- 2 ms */
function likeness(bufs, seconds) {
  let worst = 0, identical = 0, pairs = 0;
  const len = Math.round(seconds * SR), lagMax = 96;
  const norm = bufs.map((b) => { let s = 0; for (let i = b.from; i < Math.min(b.buf.length, b.from + len); i++) { s += b.buf[i] * b.buf[i]; } return Math.sqrt(s) || 1; });
  for (let a = 0; a < bufs.length; a++) {
    for (let b = a + 1; b < bufs.length; b++) {
      if (bufs[a].key !== bufs[b].key) { continue; }
      pairs++;
      const x = bufs[a].buf, y = bufs[b].buf, xa = bufs[a].from, ya = bufs[b].from;
      const m = Math.min(len, x.length - xa, y.length - ya);
      if (m < 64) { continue; }
      let same = x.length === y.length;
      if (same) { for (let i = 0; i < x.length; i++) { if (x[i] !== y[i]) { same = false; break; } } }
      if (same) { identical++; }
      let best = 0;
      for (let lag = -lagMax; lag <= lagMax; lag += 2) {
        let s = 0;
        const i0 = Math.max(0, -lag), i1 = Math.min(m, m - lag);
        for (let i = i0; i < i1; i += 2) { s += x[xa + i] * y[ya + i + lag]; }
        s = Math.abs(2 * s / (norm[a] * norm[b]));
        if (s > best) { best = s; }
      }
      if (best > worst) { worst = best; }
    }
  }
  return { worst, identical, pairs };
}
/* The room's impulse response: decay time from a Schroeder integral in the 500 Hz to 2 kHz band. */
function roomDecay() {
  const n = Math.round(2.5 * SR), x = new Float32Array(n);
  x[0] = 1;
  const y = room(x, Float32Array.from(x));
  const m = new Float64Array(n);
  for (let i = 0; i < n; i++) { m[i] = y[0][i]; }
  biquad(m, 'hp', 500, 0.7); biquad(m, 'lp', 2000, 0.7);
  const e = new Float64Array(n + 1);
  for (let i = n - 1; i >= 0; i--) { e[i] = e[i + 1] + m[i] * m[i]; }
  let i5 = -1, i35 = -1;
  for (let i = 0; i < n; i++) { const d = 10 * Math.log10(e[i] / e[0] + 1e-30); if (i5 < 0 && d < -5) { i5 = i; } if (i35 < 0 && d < -35) { i35 = i; break; } }
  return 2 * (i35 - i5) / SR;
}

function selfCheck(ctx) {
  const rows = [];
  const add = (name, value, target, ok) => rows.push({ name, value, target, ok: !!ok });
  const { final, stems, P, parts, info, music } = ctx;
  const L = final[0], R = final[1];
  const stemRms = (name, a, b) => Math.sqrt(0.5 * (Math.pow(rmsOf(stems[name][0], S(a), S(b)), 2) + Math.pow(rmsOf(stems[name][1], S(a), S(b)), 2)));
  const winRms = (a, b) => Math.sqrt(0.5 * (Math.pow(rmsOf(L, S(a), S(b)), 2) + Math.pow(rmsOf(R, S(a), S(b)), 2)));

  // the picture
  const video = require(path.join(REPO, 'video', 'score.js'));
  const pic = (o) => JSON.stringify({ bpm: o.bpm, beat: o.beat, eighth: o.eighth, sixteenth: o.sixteenth, swing: o.swing, drop: o.drop, fps: o.fps, duration: o.duration, gates: o.gates, intro: o.intro, ideas: o.ideas, title: o.title, cues: o.cues() });
  add('picture times in score.js', pic(SCORE) === pic(video) ? 'identical to video/score.js' : 'DIFFERENT', 'identical', pic(SCORE) === pic(video));
  add('length', L.length + ' samples a channel', '2208000', L.length === 2208000 && R.length === 2208000);

  // loudness
  const ld = loudness(L, R), tp = dB(truePeak(L, R, 0.3));
  add('integrated loudness', ld.lufs.toFixed(2) + ' LUFS', '-16.0 +/- 0.5', Math.abs(ld.lufs + 16) <= 0.5);
  add('true peak', tp.toFixed(2) + ' dBTP', '<= -2.0', tp <= -2.0 + 0.005);
  add('loudness range', ld.lra.toFixed(1) + ' LU', '5 to 12', ld.lra >= 5 && ld.lra <= 12);
  add('master', 'gain ' + info.gainDb.toFixed(1) + ' dB, compressor at most ' + info.maxGrDb.toFixed(1) + ' dB, limiter on ' + (100 * info.limitedShare).toFixed(2) + ' % of samples', 'limiter under 3 %', info.limitedShare < 0.03);

  // tone
  const sp = spectrum([L, R]), total = bandPower(sp.p, 0, 24001);
  const slope = tilt(sp.p), air = dBp(bandPower(sp.p, 8000, 24001) / total), pres = dBp(bandPower(sp.p, 2000, 5000) / total), sub50 = dBp(bandPower(sp.p, 0, 50) / total);
  add('tilt, 200 Hz to 8 kHz (third-octave band levels)', slope.toFixed(2) + ' dB/octave', '-4.5 to -6.5', slope <= -4.5 && slope >= -6.5);
  add('energy above 8 kHz', air.toFixed(1) + ' dB re total', '<= -30', air <= -30);
  add('2-5 kHz band', pres.toFixed(1) + ' dB re total', '<= -14', pres <= -14);
  add('energy below 50 Hz', sub50.toFixed(1) + ' dB re total', 'nothing vital: <= -10', sub50 <= -10);

  // balance, in the full trio (30 to 36 s), stems before the master
  const bRms = stemRms('bass', 30, 36), keysDb = dB(stemRms('keys', 30, 36) / bRms), drumsDb = dB(stemRms('drums', 30, 36) / bRms);
  add('keys in the full trio, re bass', keysDb.toFixed(1) + ' dB', '-3 to -10', keysDb <= -3 && keysDb >= -10);
  add('drums in the full trio, re bass', drumsDb.toFixed(1) + ' dB', '-8 to -16', drumsDb <= -8 && drumsDb >= -16);
  const brushDb = dB(Math.sqrt(0.5 * (Math.pow(rmsOf(parts.brush.L, S(30), S(36)), 2) + Math.pow(rmsOf(parts.brush.R, S(30), S(36)), 2))) * LEVEL.brush * STEM_GAIN / bRms);
  add('brushes alone in the full trio, re bass', brushDb.toFixed(1) + ' dB', 'quiet but present: -12 to -26', brushDb <= -12 && brushDb >= -26);

  // translation
  const monoLoss = dBp(bandPower(sp.pm, 0, 24001) / total);
  add('mono fold-down', monoLoss.toFixed(2) + ' dB', 'loses < 1.5 dB', monoLoss > -1.5);
  let worst = 0, worstName = '';
  for (const [name, lo, hi] of [['<60', 0, 60], ['60-250', 60, 250], ['250-500', 250, 500], ['500-2k', 500, 2000], ['2-5k', 2000, 5000], ['5-8k', 5000, 8000]]) {
    const d = dBp(bandPower(sp.pm, lo, hi) / bandPower(sp.p, lo, hi));
    if (d < worst) { worst = d; worstName = name; }
  }
  add('worst band in mono', worstName + ' Hz: ' + worst.toFixed(2) + ' dB', 'nothing cancels: > -3', worst > -3);
  const lowMono = dBp(bandPower(sp.pm, 0, 150) / bandPower(sp.p, 0, 150));
  add('low end centred (below 150 Hz, mono against stereo)', lowMono.toFixed(2) + ' dB', '> -0.3', lowMono > -0.3);
  const bs = spectrum(stems.bass), bassHi = bandPower(bs.p, 150, 24001) / bandPower(bs.p, 0, 24001);
  add('bass stem energy above 150 Hz', (100 * bassHi).toFixed(0) + ' %', '>= 25 %', bassHi >= 0.25);

  // clean
  const clicks = findClicks([L, R]);
  add('clicks (isolated discontinuities)', clicks.length + (clicks.length ? ' (first at ' + clicks[0].t.toFixed(4) + ' s)' : ''), '0', clicks.length === 0);
  let dcL = 0, dcR = 0, pk = 0;
  for (let i = 0; i < L.length; i++) { dcL += L[i]; dcR += R[i]; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
  add('DC offset', 'L ' + (dcL / L.length).toExponential(1) + ', R ' + (dcR / L.length).toExponential(1), '< 1e-4', Math.abs(dcL / L.length) < 1e-4 && Math.abs(dcR / L.length) < 1e-4);
  add('clipping', ctx.clipped + ' samples clipped, sample peak ' + dB(pk).toFixed(2) + ' dBFS', '0', ctx.clipped === 0);

  // the room tone and the held breath
  const breath = dB(winRms(music.breath[0], music.breath[1]));
  let zeros = 0;
  for (let i = S(music.breath[0]); i < S(music.breath[1]); i++) { if (L[i] === 0 && R[i] === 0) { zeros++; } }
  add('held breath, ' + music.breath[0] + ' to ' + music.breath[1] + ' s', breath.toFixed(1) + ' dBFS RMS, ' + zeros + ' zero samples', 'below -60, not digital zero; room tone about -68', breath < -60 && breath > -72 && zeros < 10);
  const bEnd = music.breath[1] - 0.05;                    // the last 50 ms belong to the entrance: the left hand finding its note
  const bandMusic = dB(Math.sqrt(0.5 * (Math.pow(rmsOf(ctx.musicOnly[0], S(music.breath[0]), S(bEnd)), 2) + Math.pow(rmsOf(ctx.musicOnly[1], S(music.breath[0]), S(bEnd)), 2))));
  add('the band during the breath, to 50 ms before the entrance (before the master)', bandMusic.toFixed(1) + ' dBFS RMS', 'gone: below -90', bandMusic < -90);
  add('room tone under the whole piece', 'quietest 400 ms of the piece: ' + ctx.quietest.toFixed(1) + ' dBFS (outside the end fade)', 'never below -72', ctx.quietest > -72);
  const t60 = roomDecay();
  add('room decay (500 Hz to 2 kHz)', t60.toFixed(2) + ' s', '0.6 to 0.9', t60 >= 0.6 && t60 <= 0.9);

  // the start and the end
  const head = dB(winRms(0, 0.25));
  add('first 0.25 s', head.toFixed(1) + ' dBFS RMS', 'nothing important: below -50', head < -50);
  const bays = SCORE.intro.bays.map((t) => P.bass.filter((e) => Math.abs(e.t0 - t) < 1e-6).map((e) => 1000 * (e.t - t))[0]);
  const bayDb = SCORE.intro.bays.map((t) => dB(Math.sqrt(0.5 * (Math.pow(rmsOf(stems.bass[0], S(t), S(t + 0.25)), 2) + Math.pow(rmsOf(stems.bass[1], S(t), S(t + 0.25)), 2)))));
  add('the four bays (' + SCORE.intro.bays.join(', ') + ' s)', 'a bass note ' + bays.map((x) => x === undefined ? 'MISSING' : '+' + x.toFixed(0) + ' ms').join(', ') + ' after each (' + bayDb.map((x) => x.toFixed(0)).join(', ') + ' dBFS)',
    'one note each, 0 to 25 ms late', bays.every((x) => x !== undefined && x > -3 && x < 25) && bayDb.every((x) => x > -45));
  const tail = dB(winRms(45.9, 46)), before = dB(winRms(45.4, 45.7));
  add('tail', '45.4-45.7 s ' + before.toFixed(1) + ' dBFS, 45.9-46.0 s ' + tail.toFixed(1) + ' dBFS', 'music gone by 45.7 (below -62), inaudible by 45.9 (below -70)', before < -62 && tail < -70);
  add('fade at the end', (SCORE.fadeOut[1] - SCORE.fadeOut[0]).toFixed(3) + ' s, last sample ' + Math.max(Math.abs(L[L.length - 1]), Math.abs(R[R.length - 1])).toExponential(1), '0.300 s', Math.abs(SCORE.fadeOut[1] - SCORE.fadeOut[0] - 0.3) < 1e-9);

  // sync
  [[NO1, 'NO 1'], [NO2, 'NO 2'], [SLAB, 'the slab']].forEach(([t, name]) => {
    const o = onsetMs(L, R, t), frame = t * SCORE.fps, beat = t / BEAT;
    const whole = Math.abs(frame - Math.round(frame)) < 1e-9 && Math.abs(beat - Math.round(beat)) < 1e-9;
    add('HARD sync: ' + name + ' at ' + t.toFixed(3) + ' s', 'onset ' + (o.ms >= 0 ? '+' : '') + o.ms.toFixed(2) + ' ms, frame ' + frame + ', rises ' + (dB(o.peak) - dB(o.pre)).toFixed(0) + ' dB', 'within +/- 10 ms, on a whole frame', whole && Math.abs(o.ms) <= 10);
  });

  // the NO thuds, measured on the thuds alone
  P.thuds.forEach((e, i) => {
    const a = S(e.t), re = new Float64Array(NFFT * 2), im = new Float64Array(NFFT * 2), buf = parts.thud.L;
    for (let k = 0; k < NFFT; k++) { re[k] = buf[a + S(0.12) + k] * HANN[k]; }
    fft(re, im);
    let bk = 0, bv = 0;
    for (let k = Math.ceil(30 * 2 * NFFT / SR); k * SR / (2 * NFFT) < 90; k++) { const v = re[k] * re[k] + im[k] * im[k]; if (v > bv) { bv = v; bk = k; } }
    const f = bk * SR / (2 * NFFT);
    re.fill(0); im.fill(0);
    for (let k = 0; k < NFFT; k++) { re[k] = buf[a + k] * (k < NFFT - 2000 ? 1 : (NFFT - k) / 2000); }
    fft(re, im);
    const band = (lo, hi) => { let s = 0; for (let k = Math.ceil(lo * 2 * NFFT / SR); k * SR / (2 * NFFT) < hi; k++) { s += re[k] * re[k] + im[k] * im[k]; } return s; };
    const tot = band(0, 24000), body = band(100, 200) / tot, hi3 = dBp(band(3000, 24000) / tot);
    add('thud ' + (i + 1) + ' at ' + e.t + ' s', 'fundamental ' + f.toFixed(1) + ' Hz, ' + (100 * body).toFixed(0) + ' % of its energy at 100-200 Hz, above 3 kHz ' + hi3.toFixed(0) + ' dB',
      '45-60 Hz; body >= 15 %; above 3 kHz <= -40 dB', f >= 45 && f <= 60 && body >= 0.15 && hi3 <= -40);
  });
  const slabKeys = dB(stemRms('keys', SLAB, SLAB + 0.5)), slabFx = dB(stemRms('fx', SLAB, SLAB + 0.5)), slabBass = dB(stemRms('bass', SLAB, SLAB + 0.5));
  add('the slab: thud AND home chord', 'first half second: fx ' + slabFx.toFixed(1) + ', keys ' + slabKeys.toFixed(1) + ', bass ' + slabBass.toFixed(1) + ' dBFS', 'all three above -45', slabKeys > -45 && slabFx > -45 && slabBass > -45);

  // no machine guns
  const like = (name, bufs, seconds) => {
    const k = likeness(bufs, seconds);
    add('no two ' + name + ' alike', 'most alike pair ' + k.worst.toFixed(3) + ' of ' + k.pairs + ' pairs, ' + k.identical + ' identical', 'correlation < 0.98, none identical', k.worst < 0.98 && k.identical === 0);
  };
  like('bass notes of one pitch', parts.bass.bufs, 0.3);
  like('piano notes of one key', parts.piano.bufs, 0.25);
  like('brush taps', parts.brush.bufs, 0.12);
  like('bass-drum strokes', parts.kick.bufs, 0.2);
  like('hi-hat chicks', parts.hat.bufs, 0.08);
  like('thuds', parts.thud.bufs, 0.4);
  {
    let w = 0;
    const ws = parts.rideWeights;
    for (let a = 0; a < ws.length; a++) {
      for (let b = a + 1; b < ws.length; b++) {
        let s = 0, na = 0, nb = 0;
        for (let k = 0; k < ws[a].length; k++) { s += ws[a][k] * ws[b][k]; na += ws[a][k] * ws[a][k]; nb += ws[b][k] * ws[b][k]; }
        w = Math.max(w, Math.abs(s) / Math.sqrt(na * nb));
      }
    }
    add('no two ride hits alike', 'most alike pair of excitations ' + w.toFixed(3) + ' of ' + ws.length + ' hits', 'correlation < 0.98', w < 0.98);
  }

  // the chart
  const pitches = P.bass.map((e) => e.m), lo = Math.min.apply(null, pitches), hi = Math.max.apply(null, pitches);
  add('bass range', 'MIDI ' + lo + ' to ' + hi, 'E1 (28) to G3 (55)', lo >= 28 && hi <= 55);
  const barsSeen = BASS.map(([bar, notes]) => notes.filter((x) => x[4] !== 'g').map((x) => x[0] + ':' + x[1]).join(' '));
  add('bass bars', new Set(barsSeen).size + ' different of ' + barsSeen.length, 'never the same bar twice', new Set(barsSeen).size === barsSeen.length);
  add('swing', (100 * MUSIC.swingRatio).toFixed(0) + ' %', '62 to 66 %', MUSIC.swingRatio >= 0.62 && MUSIC.swingRatio <= 0.66);
  const textWindows = SCORE.ideas.map((idea) => [idea.voice.at, idea.out]);
  const crowd = textWindows.map(([a, b]) => P.piano.filter((e) => e.t0 > a - 1e-6 && e.t0 < b - 1e-6).length);
  add('piano onsets while a line is on screen', crowd.join(', ') + ' (windows ' + textWindows.map((w) => w.join('-')).join(', ') + ' s)', '0', crowd.every((c) => c === 0));
  const firstIn = (list, from) => { const e = list.filter((x) => x.t0 >= from - 1e-6)[0]; return e ? e.t0 : NaN; };
  const joins = [firstIn(P.piano, I3.gates[0].land), Math.min(firstIn(P.taps, I3.gates[0].land), P.swirls.map((s) => s.t0).filter((t) => t >= I3.gates[0].land)[0]), firstIn(P.ride, I3.gates[0].land), Math.min(firstIn(P.hats, I3.gates[0].land), firstIn(P.kicks, I3.gates[0].land))];
  add('idea 3: a layer joins at each PASS', 'piano ' + joins[0] + ', brushes ' + joins[1] + ', ride ' + joins[2] + ', feet ' + joins[3] + ' s', PASS.join(', ') + ' s', joins.every((t, k) => Math.abs(t - PASS[k]) < 1e-6));
  const tops = CLIMB.map((c) => Math.max.apply(null, c.to));
  add('idea 3: the four figures climb', 'each rises (' + CLIMB.map((c) => c.from + ' to ' + Math.max.apply(null, c.to)).join(', ') + '), then ' + Math.max.apply(null, MUSIC.resolve) + ' at the winner',
    'each rises, each higher than the last', CLIMB.every((c, k) => c.from < Math.max.apply(null, c.to) && (k === 0 || (tops[k] > tops[k - 1] && c.from > CLIMB[k - 1].from))) && Math.max.apply(null, MUSIC.resolve) > tops[3]);
  const rate = (a, b) => (P.bass.concat(P.piano, P.taps, P.ride, P.hats, P.kicks).filter((e) => e.t0 >= a - 1e-6 && e.t0 < b - 1e-6).length) / (b - a);
  const r1 = rate(I1.kickerAt, NO1), r2 = rate(I1.out, NO2), r3 = rate(I3.gates[0].land, PASS[1]);
  add('how busy: idea 1, idea 2, idea 3 at its start', r1.toFixed(1) + ', ' + r2.toFixed(1) + ', ' + r3.toFixed(1) + ' onsets a second', 'idea 1 the busiest, idea 3 starts with the least', r1 > r2 && r2 > r3);
  const secDb = [[I1.kickerAt, NO1], [I1.out, NO2], [I3.gates[0].land, PASS[0]], [I3.winner, I3.out], [T.cover, SLAB]].map(([a, b]) => dB(winRms(a, b)));
  add('how loud: idea 1, idea 2, idea 3 alone, winner, title build', secDb.map((x) => x.toFixed(1)).join(', ') + ' dBFS', 'idea 2 under idea 1; idea 3 starts lowest', secDb[1] < secDb[0] && secDb[2] < secDb[1]);
  const up = PASS.map((t, k) => dB(winRms(t, t + (k < 3 ? 2 : 1.5))));
  add('idea 3 grows PASS by PASS', up.map((x) => x.toFixed(1)).join(', ') + ' dBFS', 'rising', up.every((x, k) => k === 0 || x > up[k - 1] - 0.3));

  // the stems are the mix
  if (ctx.stemResidualDb !== undefined) { add('stems, summed, through the master = final.wav', 'difference ' + ctx.stemResidualDb.toFixed(1) + ' dBFS RMS', 'below -90', ctx.stemResidualDb < -90); }
  return rows;
}

/* ====================================================================== build */

function arrangementOf(P) {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const notes = [];
  P.bass.forEach((e) => notes.push({ t: r3(e.t), dur: r3(e.played || e.dur), inst: 'bass', midi: e.m, vel: r3(e.vel) }));
  P.piano.forEach((e) => notes.push({ t: r3(e.t), dur: r3(e.dur), inst: 'keys', midi: e.m, vel: r3(e.vel) }));
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  const hits = [];
  P.taps.forEach((e) => hits.push({ t: r3(e.t), inst: 'drums', kind: 'brush tap', vel: r3(e.vel) }));
  P.swirls.forEach((e) => hits.push({ t: r3(e.t0), inst: 'drums', kind: 'brush swirl', vel: r3(e.level(e.t0 + 0.2)), dur: r3(e.t1 - e.t0) }));
  P.swishes.forEach((e) => hits.push({ t: r3(e.t), inst: 'drums', kind: 'brush sweep', vel: r3(e.vel) }));
  P.ride.forEach((e) => hits.push({ t: r3(e.t), inst: 'drums', kind: e.kind === 'mallet' ? 'ride, soft mallet' : 'ride', vel: r3(e.vel) }));
  P.hats.forEach((e) => hits.push({ t: r3(e.t), inst: 'drums', kind: 'hi-hat foot', vel: r3(e.vel) }));
  P.kicks.forEach((e) => hits.push({ t: r3(e.t), inst: 'drums', kind: 'bass drum, feathered', vel: r3(e.vel) }));
  P.thuds.forEach((e) => hits.push({ t: r3(e.t), inst: 'fx', kind: 'thud ' + e.hz + ' Hz' + (e.rattle ? ' with rattle' : ''), vel: r3(Math.min(1, e.size)) }));
  hits.push({ t: 0, inst: 'fx', kind: 'room tone', vel: 0, dur: DUR });
  hits.sort((a, b) => a.t - b.t);
  const sync = [
    { t: NO1, what: 'HARD: NO 1. Thud (55 Hz), the band hits A7b9 with it and stops dead' },
    { t: NO2, what: 'HARD: NO 2. Thud (49 Hz), the band hits Eb7 with it and stops dead' },
    { t: SLAB, what: 'HARD: the slab. Thud (55 Hz) and the home chord, Dm6/9, left to ring' }
  ];
  SCORE.intro.bays.forEach((t, k) => sync.push({ t, what: 'bay ' + (k + 1) + ': one bass note (' + ['D2', 'F2', 'A2', 'D3'][k] + ')' }));
  PASS.forEach((t, k) => sync.push({ t, what: 'SOFT: PASS ' + (k + 1) + ': a rising third in the piano; ' + ['the piano joins', 'the brushes join', 'the ride joins', 'hi-hat and bass drum join'][k] }));
  sync.push({ t: I2.gates[0].lift, what: 'idea 2 passes COST: a nod, one piano note' });
  sync.push({ t: I3.winner, what: 'SOFT: the winner: the climb comes home, Dm9 with F on top, full trio' });
  sync.push({ t: T.cover, what: 'SOFT: the sleeve: a brush sweep and a stab' });
  sync.push({ t: T.positive, what: 'SOFT: back to positive: the tag begins (Em7b5, A7b9, home)' });
  sync.sort((a, b) => a.t - b.t);
  return { key: MUSIC.key, bpm: SCORE.bpm, swing: MUSIC.swingRatio, chords: MUSIC.chords, notes, hits, sync };
}

function main() {
  const started = Date.now();
  const log = (s) => console.log(s);
  log('tools/score/modelled: building the modelled score (' + DUR + ' s, ' + N + ' samples a channel)');
  const P = perform();
  const { stems, parts } = renderStems(P, log);

  // the room tone: placed so that it sits at roomToneDb in the finished file
  const names = ['bass', 'keys', 'drums', 'fx'];
  const sumOf = () => { const L = new Float32Array(N), R = new Float32Array(N); for (const k of names) { for (let i = 0; i < N; i++) { L[i] += stems[k][0][i]; R[i] += stems[k][1][i]; } } return [L, R]; };
  const musicOnly = sumOf();
  const first = master(musicOnly[0], musicOnly[1]);
  const tone = roomTone(N, rng(seedOf('room tone')));
  // what the master does to a signal this quiet: its filters, then its gain
  const probe = [Float32Array.from(tone.L.subarray(0, 4 * SR)), Float32Array.from(tone.R.subarray(0, 4 * SR))];
  for (const ch of probe) { masterFilters(ch); }
  const through = Math.sqrt(0.5 * (Math.pow(rmsOf(probe[0], SR, 4 * SR), 2) + Math.pow(rmsOf(probe[1], SR, 4 * SR), 2)));
  const toneGain = Math.pow(10, (MUSIC.roomToneDb - first.gainDb) / 20) / through;
  for (let i = 0; i < N; i++) { stems.fx[0][i] += tone.L[i] * toneGain; stems.fx[1][i] += tone.R[i] * toneGain; }
  const mix = sumOf();
  const out = master(mix[0], mix[1]);
  log('  master'.padEnd(36) + ((Date.now() - started) / 1000).toFixed(1) + ' s');

  // write
  const clipped = writeWav(path.join(HERE, 'final.wav'), [out.L, out.R], 13);
  let stemClip = 0;
  names.forEach((k, i) => { stemClip += writeWav(path.join(HERE, 'stems', k + '.wav'), stems[k], 101 + i); });
  fs.writeFileSync(path.join(HERE, 'arrangement.json'), JSON.stringify(arrangementOf(P), null, 1) + '\n');
  log('  written'.padEnd(36) + ((Date.now() - started) / 1000).toFixed(1) + ' s');

  // the stems, read back from disk and put through the master again, must be the final
  const back = names.map((k) => readWav24(path.join(HERE, 'stems', k + '.wav')));
  const bl = new Float32Array(N), br = new Float32Array(N);
  for (const st of back) { for (let i = 0; i < N; i++) { bl[i] += st[0][i]; br[i] += st[1][i]; } }
  const again = master(bl, br), fin = readWav24(path.join(HERE, 'final.wav'));
  let diff = 0;
  for (let i = 0; i < N; i++) { const a = again.L[i] - fin[0][i], b = again.R[i] - fin[1][i]; diff += a * a + b * b; }
  const stemResidualDb = 10 * Math.log10(diff / (2 * N) + 1e-30);

  // the quietest 400 ms outside the end fade (the room tone must hold everything up)
  let quietest = 0;
  for (let s = S(0.3); s + S(0.4) <= S(SCORE.fadeOut[0]); s += S(0.1)) {
    const v = dB(Math.sqrt(0.5 * (Math.pow(rmsOf(fin[0], s, s + S(0.4)), 2) + Math.pow(rmsOf(fin[1], s, s + S(0.4)), 2))));
    if (v < quietest) { quietest = v; }
  }
  const rows = selfCheck({ final: fin, stems, P, parts, info: out, music: MUSIC, clipped: clipped + stemClip, musicOnly, quietest, stemResidualDb });
  const w1 = Math.max.apply(null, rows.map((r) => r.name.length)), w2 = Math.max.apply(null, rows.map((r) => r.value.length));
  log('\nSelf-checks (measured on the files just written):');
  rows.forEach((r) => log('  ' + (r.ok ? 'ok   ' : 'FAIL ') + r.name.padEnd(w1 + 2) + r.value.padEnd(w2 + 2) + '[' + r.target + ']'));
  const md = ['# Self-checks of the last build', '', 'Written by `build.js`; measured on the files it had just written.', '', '| | check | measured | target |', '|---|---|---|---|']
    .concat(rows.map((r) => '| ' + (r.ok ? 'ok' : '**FAIL**') + ' | ' + r.name + ' | ' + r.value + ' | ' + r.target + ' |'));
  fs.mkdirSync(path.join(HERE, 'analysis'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'analysis', 'self-checks.md'), md.join('\n') + '\n');
  const bad = rows.filter((r) => !r.ok);
  log('\n' + (bad.length ? 'FAILED: ' + bad.length + ' of ' + rows.length + ' checks:\n  - ' + bad.map((r) => r.name + ': ' + r.value).join('\n  - ') : 'All ' + rows.length + ' checks passed.') +
    '  (' + ((Date.now() - started) / 1000).toFixed(1) + ' s)');
  process.exit(bad.length ? 1 : 0);
}

if (require.main === module) { main(); }
else {
  module.exports = { SR, N, SCORE, MUSIC, rng, seedOf, gauss, hz, S, dB, biquad, modalBank, bassNote, renderBass, pianoNote, renderPiano, brushSwirl, brushTap, renderBrushes,
    renderRide, hatChick, kickHit, renderHits, thudSound, roomTone, room, roomDecay, master, loudness, truePeak, writeWav, readWav24, perform, renderStems, arrangementOf,
    spectrum, bandPower, tilt, findClicks, likeness, CYMBAL, BASS_BODY, SOUNDBOARD, LEVEL, SEND, at, BEAT, SWUNG };
}
