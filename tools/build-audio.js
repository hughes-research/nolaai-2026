#!/usr/bin/env node
/*
 * tools/build-audio.js: synthesize the title film's sound.  ->  48 kHz stereo WAV
 *
 *   node tools/build-audio.js [--out out/video/title-audio.wav]
 *
 * Every sound here is made from scratch in this file: no samples, no
 * recordings, no downloaded or licensed music. It is a small jazz combo
 * imagined for the room, not an imitation of any record: a plucked upright
 * bass walking a minor blues in C (Karplus-Strong strings), brushes on a
 * snare (low-passed noise), a ride cymbal tick (a few inharmonic partials,
 * kept soft), a little electric-piano comping (two-operator FM), and a
 * vibraphone-like figure that climbs as the boring idea passes each gate.
 *
 * THE SOUND IS CUT FROM THE PICTURE'S TIMELINE. Every event comes from
 * video/score.js, the same file video/title-sequence.js draws from:
 *   - the walking bass, ride and brushes play the score's sections, on its 120 BPM grid;
 *   - each NO shutter lands with a slam (a low hit, a body thump, the
 *     shutter's slats rattling, a short ringing chord) on the exact sample of
 *     the frame it lands on, and the band stops dead for the stop-time hold;
 *   - the held breath before the boring idea is true silence;
 *   - every gate it passes lifts on a rising note, and the title resolves.
 *
 * Mix: band and effects summed with a small room reverb, high-passed at 30 Hz,
 * gently low-passed (nothing harsh up top), faded at the tail, normalized to
 * a sample peak of -3 dBFS so the AAC encode stays under -1 dBTP. Written as
 * 16-bit PCM with triangular dither. Deterministic: the same file every run.
 *
 * It then checks itself: each slam must land on a beat and on a whole frame,
 * and the waveform energy must jump at that exact time. Exit code 0 only if so.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCORE = require(path.join(ROOT, 'video', 'score.js'));

const args = process.argv.slice(2);
let OUT = path.join(ROOT, 'out', 'video', 'title-audio.wav');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { OUT = path.resolve(args[++i]); }
  else if (args[i] === '--help' || args[i] === '-h') { console.log('Usage: node tools/build-audio.js [--out file.wav]'); process.exit(0); }
  else { console.error('Unknown option: ' + args[i]); process.exit(2); }
}

const SR = 48000;
const DUR = SCORE.duration;
const N = Math.round(DUR * SR);
const BEAT = SCORE.beat;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ tools */

function rng(seed) {             // mulberry32: the same "random" every run
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noiseRand = rng(1956);
function noise() { return noiseRand() * 2 - 1; }

function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function S(t) { return Math.round(t * SR); }
function dB(x) { return 20 * Math.log10(Math.max(1e-12, x)); }

/* RBJ biquad, run in place over a Float32Array */
function biquad(buf, type, f0, q) {
  const w = TAU * f0 / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * (q || 0.7071));
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }                 // band-pass, 0 dB peak
  a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

/* ------------------------------------------------------------------ buses */

function stereo() { return [new Float32Array(N), new Float32Array(N)]; }
const band = stereo();        // the combo: stops dead in every stop-time
const sfx = stereo();         // the shutters: never gated
const send = stereo();        // into the room

function panGains(pan) {
  const th = (pan + 1) * Math.PI / 4;
  return [Math.cos(th) * Math.SQRT2, Math.sin(th) * Math.SQRT2].map((g) => g * 0.7071);
}

/* Add a mono sound (Float32Array) to a bus at time t. */
function put(bus, t, sig, gain, pan, rev) {
  const s0 = S(t);
  const [gl, gr] = panGains(pan || 0);
  for (let i = 0; i < sig.length; i++) {
    const j = s0 + i;
    if (j < 0) { continue; }
    if (j >= N) { break; }
    const v = sig[i] * gain;
    bus[0][j] += v * gl; bus[1][j] += v * gr;
    if (rev) { send[0][j] += v * gl * rev; send[1][j] += v * gr * rev; }
  }
}

function make(seconds, fn) {
  const n = Math.max(1, Math.round(seconds * SR));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { out[i] = fn(i / SR, i); }
  return out;
}

/* ------------------------------------------------------------ instruments */

/* Upright bass: a Karplus-Strong string, plucked with soft filtered noise,
 * with a little sine body under it, muted by the next note. */
function bass(m, len, vel) {
  const f = midi(m);
  const P = Math.max(2, Math.round(SR / f));
  const total = Math.round((len + 0.08) * SR);
  const y = new Float32Array(total);
  const r = rng(m * 131 + Math.round(len * 1000));
  for (let i = 0; i < P; i++) { y[i] = (r() * 2 - 1); }
  for (let k = 0; k < 3; k++) { for (let i = 1; i < P; i++) { y[i] = 0.5 * (y[i] + y[i - 1]); } }   // a thumb, not a pick
  const rho = len > 1 ? 0.9985 : 0.996;
  for (let i = P; i < total; i++) { y[i] = rho * 0.5 * (y[i - P] + y[i - P - 1 < 0 ? 0 : i - P - 1]); }
  const rel = Math.round(len * SR);
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let v = y[i] * 0.9 + Math.sin(TAU * f * t) * Math.exp(-t / 0.22) * 0.55;
    v *= Math.min(1, t / 0.003);
    if (i > rel) { v *= Math.exp(-(i - rel) / (0.025 * SR)); }
    y[i] = v * (vel || 1);
  }
  biquad(y, 'lp', 1100, 0.6);
  return y;
}

/* Ride cymbal: a soft stick tick, a short wash of band-passed noise, and a
 * cloud of inharmonic partials that die fast, so it reads as metal, not as a
 * pitch. Low-passed at 6.5 kHz: nothing harsh. Two versions, made once. */
const RIDE = (function () {
  const r = rng(7);
  const parts = [];
  for (let k = 0; k < 14; k++) { parts.push([2300 + r() * 4200, 0.25 + r() * 0.75, r() * TAU, 0.12 + r() * 0.22]); }
  const sig = make(0.6, (t) => {
    let v = 0;
    for (const [f, a, ph, d] of parts) { v += a * Math.sin(TAU * f * t + ph) * Math.exp(-t / d); }
    return v * 0.09;
  });
  const wash = make(0.6, (t) => noise() * Math.exp(-t / 0.16));
  biquad(wash, 'bp', 4800, 0.7);
  const tick = make(0.03, (t) => noise() * Math.exp(-t / 0.004));
  biquad(tick, 'bp', 3000, 1);
  for (let i = 0; i < sig.length; i++) { sig[i] += wash[i] * 0.9 + (i < tick.length ? tick[i] * 0.8 : 0); }
  biquad(sig, 'lp', 6500, 0.7);
  biquad(sig, 'hp', 1200, 0.7);
  return sig;
}());
function ride(accent) { return { sig: RIDE, gain: accent ? 0.11 : 0.08 }; }

/* Brush tap on the snare: band-passed noise, a soft body. */
function brushTap(gain) {
  const sig = make(0.25, (t) => noise() * Math.exp(-t / 0.08) * Math.min(1, t / 0.003) + Math.sin(TAU * 190 * t) * 0.35 * Math.exp(-t / 0.05));
  biquad(sig, 'bp', 1800, 0.8);
  biquad(sig, 'lp', 4500, 0.7);
  return { sig, gain };
}

/* The brush sweep: one circle of the brush per beat, soft noise. */
function brushSweep(t0, t1, gain) {
  const sig = make(t1 - t0, (t) => {
    const ph = (t % BEAT) / BEAT;
    return noise() * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * ph), 2));
  });
  biquad(sig, 'bp', 2100, 0.6);
  biquad(sig, 'lp', 4200, 0.7);
  put(band, t0, sig, gain, -0.25, 0.25);
}

/* Bass drum, feathered: barely there, on every beat. */
function feather() {
  let ph = 0;
  return make(0.18, (t) => { ph += TAU * (52 + 30 * Math.exp(-t / 0.02)) / SR; return Math.sin(ph) * Math.exp(-t / 0.1); });
}

/* Hi-hat foot on two and four. */
function chick() {
  const sig = make(0.08, (t) => noise() * Math.exp(-t / 0.025));
  biquad(sig, 'bp', 3400, 1.1);
  biquad(sig, 'lp', 6500, 0.7);
  return sig;
}

/* Electric piano: two-operator FM, carrier and modulator in unison, the
 * brightness falling away fast. */
function ep(m, len, bright) {
  const f = midi(m);
  const sig = make(len + 0.4, (t) => {
    const I = (bright || 1.1) * Math.exp(-t / 0.22) + 0.12;
    let v = Math.sin(TAU * f * t + I * Math.sin(TAU * f * t)) * Math.exp(-t / 1.1) * Math.min(1, t / 0.004);
    if (t > len) { v *= Math.exp(-(t - len) / 0.07); }
    return v;
  });
  biquad(sig, 'lp', 3200, 0.7);
  return sig;
}

/* Vibraphone-ish: a sine with a quick fourth partial and a slow tremolo. */
function vibe(m, len) {
  const f = midi(m);
  const sig = make(len, (t) => {
    const v = Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * 4 * f * t) * Math.exp(-t / 0.18);
    return v * Math.exp(-t / 1.5) * Math.min(1, t / 0.002) * (1 - 0.2 * (0.5 + 0.5 * Math.sin(TAU * 5.2 * t)));
  });
  biquad(sig, 'lp', 5000, 0.7);
  return sig;
}

/* ------------------------------------------------------------ the shutters */

/* A NO: a heavy low hit, the thump of the shutter's body, the slats
 * rattling against each other, the sheet ringing, and the band's stop-time
 * chord. Starts on the exact sample of t. */
function slam(t, big, chord, bassNote) {
  const k = big ? 1.25 : 1;
  // the low hit: a sine falling from 110 Hz to about 42 Hz
  let ph = 0;
  const low = make(big ? 1.4 : 1.0, (u) => {
    ph += TAU * (42 + 70 * Math.exp(-u / 0.045)) / SR;
    return Math.sin(ph) * Math.exp(-u / (big ? 0.55 : 0.4)) * Math.min(1, u / 0.0015);
  });
  put(sfx, t, low, 0.62 * k, 0);
  // the body: low noise, short
  const body = make(0.4, (u) => noise() * Math.exp(-u / 0.07) * Math.min(1, u / 0.001));
  biquad(body, 'lp', 380, 0.7); biquad(body, 'lp', 380, 0.7);
  put(sfx, t, body, 1.1 * k, 0);
  // the strike: a short mid click, no higher than it needs to be
  const strike = make(0.06, (u) => noise() * Math.exp(-u / 0.01));
  biquad(strike, 'bp', 900, 0.8);
  put(sfx, t, strike, 0.45, 0);
  // the slats: a run of small metallic clicks, closer together then further apart, dying away
  const r = rng(big ? 77 : Math.round(t * 100));
  const partials = [523, 811, 1187, 1603, 2141];
  let u = 0.004, gap = 0.016, n = 0;
  while (u < (big ? 0.75 : 0.55)) {
    const amp = Math.exp(-u / (big ? 0.26 : 0.2)) * (0.6 + 0.4 * r());
    const det = 1 + (r() - 0.5) * 0.06;
    const click = make(0.08, (v) => {
      let s = 0;
      for (let p = 0; p < partials.length; p++) { s += Math.sin(TAU * partials[p] * det * v + p) * (1 - p * 0.17); }
      return s * Math.exp(-v / 0.022) * Math.min(1, v / 0.0008);
    });
    biquad(click, 'lp', 4000, 0.7);
    put(sfx, t + u, click, 0.05 * amp * k, n % 2 ? 0.35 : -0.35, 0.3);
    u += gap * (0.7 + 0.6 * r());
    gap *= 1.13;
    n++;
  }
  // the sheet rings, tuned to the key so the slam stays musical
  const ring = make(big ? 2.2 : 1.4, (v) => {
    const e = Math.exp(-v / (big ? 0.8 : 0.5));
    return e * (Math.sin(TAU * 130.8 * v) * 0.5 + Math.sin(TAU * 196.4 * v + 1) * 0.35 + Math.sin(TAU * 261.2 * v + 2) * 0.25 + Math.sin(TAU * 311.5 * v) * 0.15);
  });
  put(sfx, t, ring, 0.05 * k, 0, 0.4);
  // the band's last chord before the stop: bass and piano together, on the hit
  put(sfx, t, bass(bassNote, big ? 1.6 : 1.0, 1.2), 0.36, 0);
  chord.forEach((m, i) => put(sfx, t, ep(m, big ? 1.4 : 0.9, 1.6), 0.07, (i - 2) * 0.12, 0.35));
}

/* A PASS check: the shutter comes down to the floor (no further). A soft thud. */
function check(t) {
  let ph = 0;
  const thud = make(0.35, (u) => { ph += TAU * (52 + 45 * Math.exp(-u / 0.03)) / SR; return Math.sin(ph) * Math.exp(-u / 0.14) * Math.min(1, u / 0.002); });
  put(sfx, t, thud, 0.34, 0);
  const brush = make(0.15, (u) => noise() * Math.exp(-u / 0.035));
  biquad(brush, 'lp', 1300, 0.7);
  put(sfx, t, brush, 0.12, 0);
}

/* A shutter lifting: a faint rising swish. */
function liftSwish(t) {
  const len = BEAT;
  const sig = make(len, (u) => noise() * Math.sin(Math.PI * u / len));
  // sweep a band-pass upward in four steps (cheap, and smooth enough this quiet)
  const parts = 4, n = sig.length / parts;
  const out = new Float32Array(sig.length);
  for (let p = 0; p < parts; p++) {
    const piece = sig.slice(Math.floor(p * n), Math.floor((p + 1) * n));
    biquad(piece, 'bp', 500 * Math.pow(1.5, p), 1.2);
    out.set(piece, Math.floor(p * n));
  }
  biquad(out, 'lp', 3000, 0.7);
  put(sfx, t, out, 0.03, 0.1, 0.3);
}

function swish(t, gain) {
  const len = 0.375;
  const sig = make(len, (u) => noise() * Math.sin(Math.PI * u / len));
  biquad(sig, 'bp', 1500, 0.8);
  biquad(sig, 'lp', 3500, 0.7);
  put(sfx, t, sig, gain, -0.1, 0.3);
}

/* ------------------------------------------------------------ the band */

const CHORD = {
  Cm: { root: 36, third: 3, seventh: 10, comp: [51, 55, 58, 62] },        // Eb G Bb D  (Cm9)
  Fm: { root: 41, third: 3, seventh: 10, comp: [51, 56, 60, 63] },        // Eb Ab C Eb (Fm7)
  Ab7: { root: 44, third: 4, seventh: 10, comp: [54, 58, 60, 65] },       // Gb Bb C F  (Ab13)
  G7: { root: 43, third: 4, seventh: 10, comp: [53, 59, 63, 68] }         // F B Eb Ab  (G7 b9 #5)
};

function inSilence(t) { return SCORE.silences.some((s) => t >= s[0] - 1e-9 && t < s[1] - 1e-9); }
function sectionAt(t) { return SCORE.sections.find((s) => t >= s.from - 1e-9 && t < s.to - 1e-9) || null; }
function lvl(sec) { return !sec ? 0 : (sec.level === 'bass' ? 0.5 : (sec.level === 'tag' ? 1 : sec.level)); }
function chordAt(t) { return CHORD[SCORE.chords[Math.min(SCORE.chords.length - 1, Math.floor(t / 2))]]; }

const walk = rng(120);
function clampBass(m) { while (m > 55) { m -= 12; } while (m < 31) { m += 12; } return m; }

const bars = Math.ceil(DUR / 2);
for (let b = 0; b < bars; b++) {
  const ch = chordAt(b * 2);
  const next = chordAt(b * 2 + 2);
  for (let i = 0; i < 4; i++) {
    const t = b * 2 + i * BEAT;
    if (t >= DUR - 0.01 || inSilence(t)) { continue; }
    const sec = sectionAt(t);
    if (!sec) { continue; }
    const tag = sec.level === 'tag';

    // the walking bass: root, a chord tone, another, then a half step into the next bar
    if (!(tag && t < 40) || (tag && t === 38)) {
      let m;
      if (i === 0) { m = ch.root; }
      else if (i === 1) { m = ch.root + (walk() < 0.5 ? ch.third : 7); }
      else if (i === 2) { m = ch.root + (walk() < 0.5 ? 7 : (walk() < 0.5 ? ch.seventh : 12)); }
      else { m = next.root + (walk() < 0.5 ? -1 : 1); }
      const long = tag && t === 38;
      put(band, t, bass(clampBass(m), long ? 1.9 : BEAT * 0.94, long ? 1.15 : (i === 0 ? 1 : 0.85)), tag && !long ? 0.26 : 0.34, 0);
    }
    // feathered bass drum on every beat
    put(band, t, feather(), 0.09, 0);
    if (lvl(sec) >= 1) {
      // ride: ding, ding-da ding, ding-da (the "da" a swung eighth late)
      const r = ride(i % 2 === 1);
      put(band, t, r.sig, r.gain * (tag ? 0.8 : 1), 0.35, 0.15);
      if (i % 2 === 1) { const r2 = ride(false); put(band, t + SCORE.swing, r2.sig, r2.gain * 0.75 * (tag ? 0.8 : 1), 0.35, 0.15); }
      if (i % 2 === 1) { put(band, t, chick(), 0.05, 0.2); }
    }
    if (lvl(sec) >= 2 && !tag) {
      if (i % 2 === 1) { const bt = brushTap(0.11); put(band, t, bt.sig, bt.gain, -0.15, 0.2); }
      if (sec.busy) { const g = brushTap(0.04); put(band, t + SCORE.swing, g.sig, g.gain, -0.15, 0.2); }
    }
    if (lvl(sec) >= 3 && !tag) {
      // comping: Charleston on even bars, pushed off-beats on odd ones
      const hits = b % 2 === 0 ? [[0, 0.3], [BEAT + SCORE.swing, 0.25]] : [[SCORE.swing, 0.22], [2 * BEAT + SCORE.swing, 0.4]];
      hits.forEach(([off, len]) => {
        if (i !== Math.floor(off / BEAT)) { return; }
        const at = b * 2 + off;
        if (inSilence(at) || at >= DUR) { return; }
        ch.comp.forEach((m, k) => put(band, at, ep(m, len), 0.042, (k - 1.5) * 0.12, 0.3));
      });
    }
  }
}

// brush sweeps under the level-2-and-up sections
SCORE.sections.forEach((s) => {
  if (lvl(s) >= 2 && s.level !== 'tag') { brushSweep(s.from, s.to, s.busy ? 0.03 : 0.022); }
  if (s.level === 'tag') { brushSweep(s.from, s.to, 0.016); }
});

/* ------------------------------------------------------------ the cues */

// the figure that climbs one step per gate the boring idea passes, and resolves
const CLIMB = [67, 68, 72, 74];          // G, Ab, C, D ...
const RESOLVE = [72, 75];                // ... C and Eb: home
const cues = SCORE.cues();
const slams = [];
cues.forEach((c) => {
  if (c.type === 'slam') {
    const title = !!c.title;
    const chord = title ? [53, 59, 63, 68, 70] : [48, 51, 55, 58, 61];   // the title holds the dominant; the gates a dark Cm(b9)
    slam(c.t, title, chord, title ? 31 : 36);
    slams.push(c);
  } else if (c.type === 'check') {
    check(c.t);
  } else if (c.type === 'lift') {
    liftSwish(c.t);
    if (c.step >= 0) { put(sfx, c.t, vibe(CLIMB[c.step], 2.2), 0.15, 0.15, 0.4); }
    else { put(sfx, c.t, vibe(67, 1.6), 0.08, 0.15, 0.4); }        // the easy one gets one note, and no more
  } else if (c.type === 'winner') {
    RESOLVE.forEach((m, k) => put(sfx, c.t + k * 0.06, vibe(m, 3), 0.15, 0.15, 0.45));
  } else if (c.type === 'wipe') {
    if (!c.quiet) { swish(c.t, 0.035); }
  } else if (c.type === 'sleeve') {
    swish(c.t, 0.045);
  } else if (c.type === 'resolve') {
    // the title, resolved: a rolled C minor arpeggio up to the octave, over a held Cm9
    [48, 55, 60, 63, 67, 72].forEach((m, k) => put(sfx, c.t + k * 0.07, vibe(m, 4.5), 0.12, -0.2 + k * 0.08, 0.45));
    [51, 55, 58, 62].forEach((m, k) => put(sfx, c.t, ep(m, 3.2, 0.8), 0.05, (k - 1.5) * 0.15, 0.4));
  }
});
// arrivals: the big idea lands with weight, the easy one with a tap; the boring one in silence
SCORE.ideas.forEach((idea) => {
  if (idea.size === 'big') { let ph = 0; put(sfx, idea.enter[1], make(0.4, (u) => { ph += TAU * (48 + 40 * Math.exp(-u / 0.04)) / SR; return Math.sin(ph) * Math.exp(-u / 0.18); }), 0.32, 0); }
  if (idea.size === 'mid') { const tp = brushTap(0.08); put(sfx, idea.enter[1], tp.sig, tp.gain, -0.1, 0.2); }
});
// a brush roll that swells into the title's NO, and stops a sixteenth before it
(function () {
  const t0 = SCORE.title.land - 1, t1 = SCORE.title.land - SCORE.sixteenth;
  const sig = make(t1 - t0, (u) => noise() * Math.pow(u / (t1 - t0), 2) * (0.6 + 0.4 * Math.abs(Math.sin(TAU * 12 * u))));
  biquad(sig, 'bp', 1900, 0.7); biquad(sig, 'lp', 4000, 0.7);
  put(band, t0, sig, 0.09, -0.15, 0.3);
}());

/* ------------------------------------------------------------ the room */

function room(input, offset) {
  const out = new Float32Array(N);
  const combs = [1116, 1188, 1277, 1356].map((d) => ({ buf: new Float32Array(d + offset), i: 0, z: 0 }));
  const aps = [556, 441].map((d) => ({ buf: new Float32Array(d + Math.round(offset / 2)), i: 0 }));
  const fb = 0.8, damp = 0.35;
  for (let n = 0; n < N; n++) {
    const x = input[n];
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.z = o * (1 - damp) + c.z * damp;
      c.buf[c.i] = x + c.z * fb;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    y *= 0.25;
    for (const a of aps) {
      const o = a.buf[a.i];
      const v = y + o * 0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.buf.length;
      y = o - v * 0.5;
    }
    out[n] = y;
  }
  biquad(out, 'lp', 5000, 0.7);
  biquad(out, 'hp', 150, 0.7);
  return out;
}
const wetL = room(send[0], 0), wetR = room(send[1], 23);

/* ------------------------------------------------------------ the mix */

// stop-time: the band is cut dead at each silence (12 ms, under the slam) and comes back on the beat
const gate = new Float32Array(N).fill(1);
SCORE.silences.forEach(([a, b]) => {
  const sa = S(a), sb = S(b), ramp = Math.round(0.012 * SR);
  for (let n = sa; n < sb && n < N; n++) { gate[n] = n - sa < ramp ? 1 - (n - sa) / ramp : 0; }
});
// the held breath before the boring idea is silence for everything, the room included
const breath = SCORE.silences.find(([a]) => a === SCORE.ideas[1].out);

const mix = stereo();
for (let ch = 0; ch < 2; ch++) {
  const wet = ch ? wetR : wetL;
  for (let n = 0; n < N; n++) { mix[ch][n] = band[ch][n] * gate[n] + sfx[ch][n] + wet[n] * 0.32; }
  biquad(mix[ch], 'hp', 30, 0.7);
  biquad(mix[ch], 'lp', 11000, 0.7);
}
if (breath) {
  const sa = S(breath[0]), sb = S(breath[1]), ramp = Math.round(0.25 * SR);
  for (let n = sa; n < sb; n++) {
    const g = n - sa < ramp ? 0.5 + 0.5 * Math.cos(Math.PI * (n - sa) / ramp) : 0;   // the last of the room dies in a quarter second
    mix[0][n] *= g; mix[1][n] *= g;
  }
}
// tail fade, and a few samples of fade-in so the file does not start with a click
const [fa, fb2] = SCORE.fadeOut;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  let g = Math.min(1, n / 240);
  if (t >= fa) { g *= t >= fb2 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (t - fa) / (fb2 - fa)); }
  mix[0][n] *= g; mix[1][n] *= g;
}
// level: the band's loudest bars set the gain (MAKEUP above a -3 dBFS peak for
// the band alone), and a look-ahead limiter rounds off the slams' low hits
// so they sit at the ceiling instead of setting the level of everything else
const MAKEUP_DB = -1;
const CEILING = Math.pow(10, -2.5 / 20);
let peak = 0;
for (let ch = 0; ch < 2; ch++) { for (let n = 0; n < N; n++) { peak = Math.max(peak, Math.abs(band[ch][n] * gate[n])); } }
const norm = Math.pow(10, (-3 + MAKEUP_DB) / 20) / peak;
const target = CEILING;
(function limit() {
  const look = Math.round(0.005 * SR), rel = Math.exp(-1 / (0.12 * SR));
  const need = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const a = Math.max(Math.abs(mix[0][n]), Math.abs(mix[1][n])) * norm;
    need[n] = a > CEILING ? CEILING / a : 1;
  }
  // the gain at n is the smallest gain needed anywhere in the next 5 ms, released slowly
  const g = new Float32Array(N);
  const dq = [];                                        // sliding-window minimum over [k, k + look]
  let head = 0;
  for (let n = 0; n < N + look; n++) {
    if (n < N) { while (dq.length > head && need[dq[dq.length - 1]] >= need[n]) { dq.pop(); } dq.push(n); }
    const k = n - look;
    if (k < 0) { continue; }
    while (dq[head] < k) { head++; }
    g[k] = need[dq[head]];
  }
  // a trailing 5 ms average turns the step into a ramp and still meets every peak
  const smooth = new Float32Array(N);
  let acc = look + 1;                                   // before the start, the window is all 1s
  for (let n = 0; n < N; n++) {
    acc += g[n] - (n - look - 1 >= 0 ? g[n - look - 1] : 1);
    smooth[n] = acc / (look + 1);
  }
  let held = 1;
  for (let n = 0; n < N; n++) {
    const gn = smooth[n];
    held = gn < held ? gn : gn + (held - gn) * rel;
    const v = norm * held;
    mix[0][n] *= v; mix[1][n] *= v;
  }
}());
for (let ch = 0; ch < 2; ch++) { for (let n = 0; n < N; n++) { mix[ch][n] = Math.max(-CEILING, Math.min(CEILING, mix[ch][n])); } }

/* ------------------------------------------------------------ write */

function writeWav(file, chans) {
  const frames = chans[0].length;
  const data = Buffer.alloc(frames * 4);
  const d = rng(13);
  let clipped = 0;
  for (let n = 0; n < frames; n++) {
    for (let ch = 0; ch < 2; ch++) {
      let v = chans[ch][n] * 32767 + (d() - d());          // TPDF dither
      v = Math.round(v);
      if (v > 32767) { v = 32767; clipped++; }
      if (v < -32768) { v = -32768; clipped++; }
      data.writeInt16LE(v, (n * 2 + ch) * 2);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
  return clipped;
}
const clipped = writeWav(OUT, mix);

/* ------------------------------------------------------------ check */

function rms(t0, t1) {
  let s = 0, n = 0;
  for (let i = Math.max(0, S(t0)); i < Math.min(N, S(t1)); i++) { s += mix[0][i] * mix[0][i] + mix[1][i] * mix[1][i]; n += 2; }
  return Math.sqrt(s / Math.max(1, n));
}
const bad = [];
console.log(path.relative(process.cwd(), OUT) + '  48 kHz, stereo, 16-bit, ' + DUR.toFixed(3) + ' s (' + N + ' samples per channel)');
let outPeak = 0;
for (let ch = 0; ch < 2; ch++) { for (let n = 0; n < N; n++) { outPeak = Math.max(outPeak, Math.abs(mix[ch][n])); } }
console.log('  sample peak ' + dB(outPeak).toFixed(2) + ' dBFS (limiter ceiling ' + dB(target).toFixed(1) + ' dBFS), clipped samples: ' + clipped);
if (clipped) { bad.push(clipped + ' samples clipped'); }
console.log('\n  The slams, from video/score.js (the same times the shutters land on):');
console.log('    time s   beat   frame   sample     RMS 40 ms before -> after   jump');
slams.forEach((c) => {
  const beat = c.t / BEAT, frame = c.t * SCORE.fps;
  const before = rms(c.t - 0.04, c.t), after = rms(c.t, c.t + 0.04);
  const jump = dB(after) - dB(before);
  const onBeat = Math.abs(beat - Math.round(beat)) < 1e-9, onFrame = Math.abs(frame - Math.round(frame)) < 1e-9;
  console.log('    ' + c.t.toFixed(3).padStart(6) + '   ' + String(beat).padStart(4) + '   ' + String(frame).padStart(5) + '   ' + String(S(c.t)).padStart(7) +
    '     ' + dB(before).toFixed(1).padStart(6) + ' dBFS -> ' + dB(after).toFixed(1).padStart(6) + ' dBFS   ' + (jump >= 0 ? '+' : '') + jump.toFixed(1) + ' dB  ' +
    (c.title ? '(the title NO)' : '(idea ' + c.idea + ', gate ' + SCORE.gates[c.gate].toUpperCase() + ')'));
  if (!onBeat) { bad.push('slam at ' + c.t + ' s is not on a beat'); }
  if (!onFrame) { bad.push('slam at ' + c.t + ' s is not on a whole frame'); }
  if (jump < 6) { bad.push('slam at ' + c.t + ' s: the energy only rises ' + jump.toFixed(1) + ' dB'); }
});
const bt = breath ? rms(breath[0] + 0.3, breath[1] - 0.01) : 0;
console.log('\n  the held breath ' + (breath ? breath[0] + '-' + breath[1] + ' s: RMS ' + (bt === 0 ? '-inf' : dB(bt).toFixed(1)) + ' dBFS (after the first 0.3 s)' : 'not found'));
if (breath && bt > 1e-4) { bad.push('the held breath is not silent'); }
if (bad.length) { console.error('\nFAILED:\n  - ' + bad.join('\n  - ')); process.exit(1); }
console.log('\nAll checks passed.');
