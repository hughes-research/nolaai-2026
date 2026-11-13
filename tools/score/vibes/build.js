/*
 * tools/score/vibes/build.js: candidate "vibes" for the 46-second title film.
 *
 *   node tools/score/vibes/build.js
 *
 * Upright bass, brushes and vibraphone (no piano), A minor, 120 BPM, swing 0.64.
 * The chart is ./chart.js (written first, as data); this file performs it
 * (humanising from seeded generators, so every build is the same), renders
 * the recorded instruments through the kit's sampler, mixes, masters, writes
 * the files of the contract (BRIEF.md section 5) and exits 0 only if the
 * kit's self-checks and this candidate's own checks (./check-chart.js) pass.
 *
 * Nothing here types a picture time: bars and beats become seconds through
 * the kit's timeline (video/score.js).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const kit = require('../lib');
const C = require('./chart.js');

const { SR, N } = kit.const;
const { dsp, mix, synth, sampler, wav, checks } = kit;
const tl = kit.timeline.load();
const HERE = __dirname;
const started = Date.now();
const lap = (what) => console.log('  [' + ((Date.now() - started) / 1000).toFixed(1).padStart(5) + ' s] ' + what);

const SEED = 1957;
const SW = C.SWING;
const at = (bar, beat) => tl.at(bar, beat, { swing: SW });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r3 = (x) => Math.round(x * 1000) / 1000;
const r5 = (x) => Math.round(x * 100000) / 100000;

/* ------------------------------------------------------------------ the instruments
 * Chosen from the kit's audition measurements (lib/audition/data.json) and this
 * candidate's own probe renders; the reasons are in the report. */
const PRESET = {
  bass: { font: 'musescore', bank: 0, program: 32 },     // MuseScore General, Acoustic Bass
  vibes: { font: 'fluidr3', bank: 0, program: 11 },      // FluidR3 GM, Vibraphone (a stereo pair of samples)
  drums: { font: 'fluidr3', bank: 128, program: 40 }     // FluidR3 GM, Brush kit
};
const DRUM = { kick: [35, 36], tap: 38, slap: 39, swirl: 40, hat: 44, ride: 51, rideSkip: 59 };
/* the three HARD hits, by bar: written dynamics (the big block, the middle block, the slab: weight, less slap) */
const HIT = { 5: { kick: 0.44, slap: 0.38, bass: 0.88, vibes: 0.64 }, 9: { kick: 0.4, slap: 0.34, bass: 0.84, vibes: 0.6 }, 19: { kick: 0.47, slap: 0.3, bass: 0.9, vibes: 0.62 } };

/* ------------------------------------------------------------------ measuring the samples
 * One render of every pitch a part uses, at six velocities: the K-weighted
 * level of each (so the part can be played evenly across the libraries'
 * uneven sample zones, as a player evens out an instrument) and the delay
 * from note-on to the audible onset (so the HARD hits land on their frame). */
const CAL_VELS = [0.25, 0.4, 0.55, 0.7, 0.85, 1.0];
function measure(preset, keys, o) {
  const slots = [], notes = [];
  keys.forEach((key) => CAL_VELS.forEach((v) => {
    const t = 0.25 + o.gap * slots.length;
    slots.push({ key, t });
    notes.push({ t, dur: o.hold, midi: key, vel: v });
  }));
  const st = sampler.render(Object.assign({}, preset, { notes, seconds: 0.25 + o.gap * slots.length + 0.25 }));
  const kw = [mix.kWeighted(st[0]), mix.kWeighted(st[1])];
  const out = {};
  for (const s of slots) {
    const a = Math.round(sampler.startOf(s.t) * SR), b = a + Math.round(o.win * SR), w = a + Math.round(0.25 * SR);
    let e = 0;
    for (let i = a; i < b; i++) { e += kw[0][i] * kw[0][i] + kw[1][i] * kw[1][i]; }
    let peak = 0;
    for (let i = a; i < w; i++) { const v = Math.max(Math.abs(st[0][i]), Math.abs(st[1][i])); if (v > peak) { peak = v; } }
    let i10 = a;
    while (i10 < w && Math.max(Math.abs(st[0][i10]), Math.abs(st[1][i10])) < 0.1 * peak) { i10++; }
    if (!out[s.key]) { out[s.key] = { level: [], t10: [] }; }
    out[s.key].level.push(10 * Math.log10(e / (2 * (b - a)) + 1e-30));
    out[s.key].t10.push((i10 - a) / SR);
  }
  return out;
}
function interp(xs, ys, x) {              // piecewise linear through (xs, ys), xs rising; extended past the ends
  let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]) { i++; }
  const span = xs[i + 1] - xs[i];
  return span === 0 ? ys[i] : ys[i] + (x - xs[i]) / span * (ys[i + 1] - ys[i]);
}
/* -> velFor(key, dyn): the velocity that makes this key as loud as the average key is at velocity `dyn`. */
function evenly(cal) {
  const keys = Object.keys(cal);
  const avg = CAL_VELS.map((_, i) => keys.reduce((s, k) => s + cal[k].level[i], 0) / keys.length);
  return function velFor(key, dyn) {
    const want = interp(CAL_VELS, avg, clamp(dyn, 0.12, 1));
    return clamp(interp(cal[key].level, CAL_VELS, want), 0.1, 1);
  };
}
const onsetOf = (cal, key) => cal[key].t10.reduce((s, v) => s + v, 0) / cal[key].t10.length;

/* ------------------------------------------------------------------ the performance */

function performBass(velFor, cal, rnd) {
  const src = C.BASS.map((r) => ({ bar: r[0], beat: r[1], name: r[2], midi: C.midiOf(r[2]), len: r[3], acc: r[4], kind: r[5], nominal: at(r[0], r[1]) }));
  return src.map((n, i) => {
    const next = src[i + 1];
    const hit = n.kind === 'hit';
    let dyn, late;
    if (hit) { dyn = HIT[n.bar].bass; late = -onsetOf(cal, n.midi); }                      // HARD sync: not humanised, started early by the measured onset
    else if (n.kind === 'ring') { dyn = 0.5; late = 0.004 + 0.008 * rnd(); }
    else {
      dyn = clamp(C.LEVEL[n.bar - 1] * 0.95 + n.acc + (rnd() - 0.5) * 0.07, 0.22, 0.98);
      late = n.kind === 'skip' ? 0.004 + 0.005 * rnd() : 0.004 + 0.008 * rnd();   // 4 to 12 ms behind the beat
    }
    const t = n.nominal + late;
    let end = n.nominal + n.len * tl.beat;
    if (n.kind === 'walk') { end -= 0.012 + 0.022 * rnd(); }                    // nearly legato: a tiny gap
    else if (n.kind === 'long') { end -= 0.03 + 0.03 * rnd(); }
    else if (n.kind === 'skip') { end += late; }
    if (next && next.nominal < end - 0.004) { end = next.nominal - 0.004; }      // a ghost note takes over
    if (next && next.kind === 'hit') { end = Math.min(end, next.nominal - 0.2); }   // the player lifts before the hit
    return { t, dur: Math.max(0.06, end - t), inst: 'bass', midi: n.midi, vel: velFor(n.midi, dyn), bar: n.bar, beat: n.beat, kind: n.kind, name: n.name, ev: 'b' + i };
  });
}

function performVibes(velFor, cal, rnd) {
  const notes = [];
  C.VIBES.forEach((r, i) => {
    const bar = r[0], beat = r[1], names = r[2], damp = r[3], off = r[4], kind = r[6];
    const nominal = at(bar, beat);
    const hit = kind === 'hit';
    const end = Array.isArray(damp) ? at(damp[0], damp[1]) : nominal + damp * tl.beat;
    const late = hit ? 0 : (kind === 'stab' && rnd() < 0.45 ? 0.003 + 0.005 * rnd() : 0.002 * rnd());   // a stab is sometimes a hair late
    let roll = 0;
    names.forEach((name, j) => {
      const midi = C.midiOf(name);
      const voice = names.length < 2 ? 0 : (j === names.length - 1 ? 0.035 : (j === 0 ? -0.015 : -0.03));   // the top of a voicing sings
      const dyn = hit ? HIT[bar].vibes + voice : clamp((C.LEVEL[bar - 1] || 0.5) * 0.9 + off + voice + (rnd() - 0.5) * 0.06, 0.2, 0.95);
      if (!hit && j > 0) { roll += 0.001 + 0.002 * rnd(); }                     // four mallets never land in the same instant
      const t = hit ? nominal - onsetOf(cal, midi) : nominal + late + roll;
      notes.push({ t, dur: Math.max(0.08, end - t), inst: 'vibes', midi, vel: velFor(midi, dyn), bar, beat, kind, name, ev: 'v' + i });
    });
  });
  /* a bar struck again is not held twice: the earlier note ends there (as the MIDI writer would do anyway) */
  notes.sort((a, b) => a.t - b.t);
  const sounding = new Map();
  for (const n of notes) {
    const prev = sounding.get(n.midi);
    if (prev && prev.t + prev.dur > n.t) { prev.dur = Math.max(0.02, n.t - prev.t); }
    sounding.set(n.midi, n);
  }
  return notes;
}

function performDrums(cal, rnd) {
  const hits = [];
  const push = (kind, bar, beat, key, dyn, dt, hard) => {
    const nominal = at(bar, beat);
    hits.push({ t: nominal + dt, inst: 'drums', kind, key, vel: clamp(dyn, 0.08, 1), bar, beat, hard: !!hard });
  };
  for (let bar = 1; bar <= C.BARS; bar++) {
    const d = C.DRUMS[bar];
    if (!d) { continue; }
    const base = C.LEVEL[bar - 1] * (d.level || 1);
    (d.swirl || []).forEach((b) => push('swirl', bar, b, DRUM.swirl, base * 0.66 + (b === 1 ? 0.03 : 0) + (rnd() - 0.5) * 0.08, -0.008 + (rnd() - 0.5) * 0.006));   // the sweep speaks slowly: lead it
    (d.tap || []).forEach((b) => push('tap', bar, b, b === 4 && base >= 0.7 ? DRUM.slap : DRUM.tap, base * 0.62 + (b === 4 ? 0.07 : 0.03) + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.006));
    (d.ride || []).forEach((b) => {
      const skip = b % 1 !== 0, back = b === 2 || b === 4;
      push(skip ? 'ride-skip' : 'ride', bar, b, skip ? DRUM.rideSkip : DRUM.ride, base * (skip ? 0.5 : back ? 0.8 : 0.64) + (rnd() - 0.5) * 0.07, -0.006 * rnd());   // 0 to 6 ms ahead
    });
    (d.hat || []).forEach((b) => push('hat', bar, b, DRUM.hat, base * 0.48 + (b === 4 ? 0.03 : 0) + (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.005));
    (d.kick || []).forEach((b, i) => push('kick', bar, b, DRUM.kick[i % 2], base * 0.44 + (b === 1 ? 0.05 : 0) + (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.006));   // feathered
    (d.hit || []).forEach((b) => {                                              // HARD sync: bass drum and a brush slap, not humanised
      const h = HIT[bar];                                                        // each of the three has its own written dynamic
      push('hit-kick', bar, b, DRUM.kick[0], h.kick, -onsetOf(cal, DRUM.kick[0]), true);
      push('hit-slap', bar, b, DRUM.slap, h.slap, -onsetOf(cal, DRUM.slap), true);
    });
  }
  /* no drum hit at the same velocity twice running: neither in the kit as a whole nor on one drum */
  hits.sort((a, b) => a.t - b.t);
  let prev = -1;
  const last = new Map();
  for (const h of hits) {
    let m = clamp(Math.round(h.vel * 127), 1, 127);
    if (!h.hard) { for (let guard = 0; guard < 6 && (m === prev || m === last.get(h.key)); guard++) { m += m < 120 ? 1 : -3; } }
    h.vel = m / 127;
    prev = m; last.set(h.key, m);
  }
  return hits;
}

/* ------------------------------------------------------------------ helpers for the mix */

/* The harmonics a small speaker needs. The library's low bass notes are recordings played far below their
 * pitch and have almost nothing above 150 Hz (the audition: 1 percent from E1 to D2). This takes the low end
 * of the bass (under 260 Hz), folds it (|x|: the octave, and the sums of the partials that are there, so every
 * new partial is a harmonic of the note, and it is exactly as loud and as long as the note), keeps 150 to
 * 900 Hz of that, and mixes in as much as brings the share of the bass above 150 Hz to `share`.
 * The dry bass is untouched underneath. */
function addHarmonics(bass, share) {
  const folded = dsp.butter(dsp.copy(bass), 'lp', 260, 2);
  for (const ch of folded) { for (let i = 0; i < ch.length; i++) { ch[i] = Math.abs(ch[i]); } }
  dsp.butter(folded, 'hp', 150, 4);
  dsp.eq(folded, [{ type: 'lp', f: 900, q: 0.7071 }]);
  const above = (st) => { const h = dsp.butter(dsp.copy(st), 'hp', 150, 4); return Math.pow(dsp.rms(h) / dsp.rms(st), 2); };
  const before = above(bass);
  const mixed = (g) => { const m = dsp.copy(bass); mix.add(m, folded, { db: g }); return m; };
  let lo = -30, hi = 18;
  for (let k = 0; k < 12; k++) { const g = 0.5 * (lo + hi); if (above(mixed(g)) < share) { lo = g; } else { hi = g; } }
  const out = mixed(hi);
  return { out, gainDb: hi, before, after: above(out) };
}

/* Take the tips off the loudest strikes: a look-ahead limiter (the kit's) whose ceiling is `crestDb` above the
 * instrument's own level in the full-trio passage. Most notes never reach it. */
function shave(st, crestDb, W, look, release) {
  const ceiling = dsp.rms(st, W[0], W[1]) * dsp.lin(crestDb);
  const before = dsp.db(dsp.peak(st) / dsp.rms(st, W[0], W[1]));
  const info = mix.limitPass(st, ceiling, look, release);
  return 'crest ' + before.toFixed(1) + ' dB held to ' + crestDb + ' (up to ' + info.maxReductionDb.toFixed(1) + ' dB off, ' + (100 * info.limitedSamples / st[0].length).toFixed(1) + ' percent of the samples)';
}

/* A slow motor for the vibraphone. The sample has none (the audition: one frozen cycle from 0.12 to 0.42 s
 * on), so its long notes stand perfectly still; this turns the level gently, the two channels a quarter
 * turn apart, as the fans of the instrument do. */
function motor(st, hz, depthDb) {
  const d = Math.pow(10, depthDb / 20) - 1, w = 2 * Math.PI * hz / SR;
  for (let i = 0; i < st[0].length; i++) { st[0][i] *= 1 + d * Math.sin(w * i); st[1][i] *= 1 + d * Math.sin(w * i + Math.PI / 2); }
  return st;
}
const toSampler = (notes) => notes.map((n) => ({ t: n.t, dur: n.dur, midi: n.midi, vel: n.vel }));
function withRoom(dry, sendDb, room) {      // -> the stem as it sits in the mix: dry plus its own share of the room
  const send = dsp.gain(dsp.copy(dry), sendDb);
  const wet = mix.room(send, room);
  const out = dsp.copy(dry);
  mix.add(out, wet, {});
  return out;
}

function build() {
  console.log('vibes: bass, brushes and vibraphone in ' + C.KEY + ', ' + C.BPM + ' BPM, swing ' + SW);

  /* ---- 1. measure the samples */
  const bassKeys = Array.from(new Set(C.BASS.map((r) => C.midiOf(r[2])))).sort((a, b) => a - b);
  const vibesKeys = Array.from(new Set([].concat(...C.VIBES.map((r) => r[2].map(C.midiOf))))).sort((a, b) => a - b);
  const calBass = measure(PRESET.bass, bassKeys, { gap: 1.0, hold: 0.6, win: 0.4 });
  const calVibes = measure(PRESET.vibes, vibesKeys, { gap: 1.0, hold: 0.5, win: 0.3 });
  const calDrums = measure(PRESET.drums, [DRUM.kick[0], DRUM.slap], { gap: 1.0, hold: 0.1, win: 0.1 });
  lap('measured ' + bassKeys.length + ' bass pitches, ' + vibesKeys.length + ' vibraphone pitches, 2 drums');

  /* ---- 2. perform the chart */
  const bassNotes = performBass(evenly(calBass), calBass, dsp.rng(SEED + 1));
  const vibesNotes = performVibes(evenly(calVibes), calVibes, dsp.rng(SEED + 2));
  const drumHits = performDrums(calDrums, dsp.rng(SEED + 3));

  /* ---- 3. render: the bass, the vibraphone, and the drum kit in three groups so each can be treated on its own */
  let bass = sampler.render(Object.assign({}, PRESET.bass, { notes: toSampler(bassNotes) }));
  const vibes = sampler.render(Object.assign({}, PRESET.vibes, { notes: toSampler(vibesNotes) }));
  const group = (kinds, dur) => sampler.render(Object.assign({}, PRESET.drums, {
    notes: drumHits.filter((h) => kinds.includes(h.kind)).map((h) => ({ t: h.t, dur: dur, midi: h.key, vel: h.vel }))
  }));
  const kick = group(['kick', 'hit-kick'], 0.1);
  const skins = group(['tap', 'swirl', 'hit-slap'], 0.1);
  const cymbals = group(['ride', 'ride-skip', 'hat'], 0.17);
  lap('rendered ' + bassNotes.length + ' bass notes, ' + vibesNotes.length + ' vibraphone notes, ' + drumHits.length + ' drum hits');

  /* ---- 4. treat each instrument */
  const harm = addHarmonics(bass, MIX.bassShareAbove150);
  bass = harm.out;
  dsp.eq(bass, MIX.bassEq);
  dsp.gain(bass, -20 - dsp.rmsDb(bass, MIX.trioWindow[0], MIX.trioWindow[1]));     // a known level, so the compressor's threshold means something
  const bassComp = mix.compress(bass, MIX.bassComp);
  dsp.gain(bass, -20 - dsp.rmsDb(bass, MIX.trioWindow[0], MIX.trioWindow[1]));
  const bassShave = shave(bass, MIX.crest.bass, MIX.trioWindow, 0.005, 0.15);
  lap('bass: ' + (100 * harm.before).toFixed(0) + ' percent of its energy above 150 Hz as recorded, ' + (100 * harm.after).toFixed(0) + ' percent with the harmonics (at ' + harm.gainDb.toFixed(1) + ' dB); compressor up to ' + bassComp.maxReductionDb.toFixed(1) + ' dB, mean ' + bassComp.meanReductionDb.toFixed(1) + '; ' + bassShave);
  dsp.eq(vibes, MIX.vibesEq);
  motor(vibes, MIX.motor.hz, MIX.motor.depthDb);
  lap('vibraphone: ' + shave(vibes, MIX.crest.vibes, MIX.trioWindow, 0.003, 0.08));
  dsp.eq(kick, MIX.kickEq);
  dsp.eq(skins, MIX.skinsEq);
  dsp.eq(cymbals, MIX.cymbalsEq);
  dsp.butter(cymbals, 'lp', MIX.cymbalsLp, 8);          // 48 dB an octave: the ride and the hat keep their body and lose their glare

  const bassDry = dsp.stereo(), keysDry = dsp.stereo(), drumsDry = dsp.stereo(), fxDry = dsp.stereo();
  mix.add(bassDry, bass, { pan: 0 });
  mix.add(keysDry, vibes, { pan: MIX.vibesPan });
  mix.add(drumsDry, kick, { db: MIX.kickDb, pan: 0 });
  mix.add(drumsDry, skins, { db: MIX.skinsDb, pan: MIX.drumsPan });
  mix.add(drumsDry, cymbals, { db: MIX.cymbalsDb, pan: MIX.drumsPan + 0.08 });
  lap('drums: ' + shave(drumsDry, MIX.crest.drums, MIX.trioWindow, 0.003, 0.08));

  /* the NO thuds: each tuned to the bass note under it (G#1, Bb1, then A1: home) */
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const thuds = [
    { t: tl.hard.no1, name: 'NO 1', midi: C.midiOf('G#1'), size: 1.0, rattle: 0.3, db: MIX.thudDb, seed: 11 },
    { t: tl.hard.no2, name: 'NO 2', midi: C.midiOf('Bb1'), size: 0.9, rattle: 0.25, db: MIX.thudDb - 0.5, seed: 12 },
    { t: tl.hard.slab, name: 'the slab', midi: C.midiOf('A1'), size: 1.3, rattle: 0.12, db: MIX.thudDb + 0.5, seed: 13 }
  ];
  for (const th of thuds) {
    th.hz = hz(th.midi);
    mix.add(fxDry, synth.thud({ hz: th.hz, size: th.size, rattle: th.rattle, seed: th.seed }), { at: th.t, db: th.db });
  }

  /* ---- 5. the room (a small dark club), each stem with its own share; the bass almost dry */
  const room = MIX.room;
  let sBass = withRoom(bassDry, MIX.send.bass, room);
  let sKeys = withRoom(keysDry, MIX.send.keys, room);
  let sDrums = withRoom(drumsDry, MIX.send.drums, room);
  let sFx = withRoom(fxDry, MIX.send.fx, room);
  lap('mixed the stems and the room');

  /* ---- 6. balance, measured in the full-trio passage, then set the whole mix to the target loudness */
  const W = MIX.trioWindow;
  const rb = dsp.rmsDb(sBass, W[0], W[1]);
  dsp.gain(sKeys, rb + MIX.keysUnderBass - dsp.rmsDb(sKeys, W[0], W[1]));
  dsp.gain(sDrums, rb + MIX.drumsUnderBass - dsp.rmsDb(sDrums, W[0], W[1]));
  dsp.gain(sFx, MIX.thudOverBass + rb - dsp.db(dsp.peak(sFx)));               // the loudest thud's peak, relative to the bass
  const sum = () => { const s = dsp.stereo(); for (const x of [sBass, sKeys, sDrums, sFx]) { mix.add(s, x, {}); } return s; };
  const pre = MIX.lufs - mix.lufs(sum());
  for (const x of [sBass, sKeys, sDrums, sFx]) { dsp.gain(x, pre); }
  /* room tone: steady and very quiet under everything, the held breath included. The master's gain moves it with
   * everything else, so the master is run once to learn that gain and the tone goes in that much lower. */
  const trial = mix.master(sum(), MIX.master).info.gainDb;
  mix.add(sFx, synth.roomTone({ db: MIX.roomToneDb - trial, seed: 7 }), {});
  /* the ending: the last chord and the low A ring down by themselves; over the last second and a half the band
   * is also eased out (as the film's own timeline fades its ending), so the player's damping is never heard */
  for (const x of [sBass, sKeys, sDrums]) { dsp.fade(x, MIX.easeOut[0], MIX.easeOut[1], 1, 0); dsp.fade(x, MIX.easeOut[1], tl.duration, 0, 0); }
  /* the loop seam: 5 ms in, and the 300 ms safety fade at the very end */
  for (const x of [sBass, sKeys, sDrums, sFx]) { dsp.fade(x, 0, 0.005, 0, 1); dsp.fade(x, tl.duration - 0.3, tl.duration, 1, 0); }

  /* ---- 7. the master: the stems' sum, through the kit's master bus, is final.wav */
  const final = mix.master(sum(), MIX.master);
  lap('mastered: ' + JSON.stringify(final.info, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));

  /* ---- 8. write the contract */
  fs.mkdirSync(path.join(HERE, 'stems'), { recursive: true });
  const clipped = {
    final: wav.write(path.join(HERE, 'final.wav'), final),
    bass: wav.write(path.join(HERE, 'stems', 'bass.wav'), sBass),
    keys: wav.write(path.join(HERE, 'stems', 'keys.wav'), sKeys),
    drums: wav.write(path.join(HERE, 'stems', 'drums.wav'), sDrums),
    fx: wav.write(path.join(HERE, 'stems', 'fx.wav'), sFx)
  };
  const chords = [];
  for (let b = 1; b <= C.BARS; b++) { chords.push(C.chordString(b)); }
  const arrangement = {
    key: C.KEY, bpm: C.BPM, swing: SW, seed: SEED,
    instruments: { bass: PRESET.bass, vibes: PRESET.vibes, drums: PRESET.drums },
    chords,
    notes: bassNotes.concat(vibesNotes).sort((a, b) => a.t - b.t).map((n) => ({
      t: r5(n.t), dur: r5(n.dur), inst: n.inst, midi: n.midi, vel: r3(Math.max(1, Math.round(n.vel * 127)) / 127), name: n.name, bar: n.bar, beat: n.beat, kind: n.kind, ev: n.ev
    })),
    hits: drumHits.map((h) => ({ t: r5(h.t), inst: 'drums', kind: h.kind, vel: r3(h.vel), key: h.key, bar: h.bar, beat: h.beat }))
      .concat(thuds.map((th) => ({ t: th.t, inst: 'fx', kind: 'thud', vel: th.size, hz: r3(th.hz), name: th.name })))
      .sort((a, b) => a.t - b.t),
    sync: [
      { t: tl.hard.no1, what: 'HARD: NO 1 (bass G#1, thud ' + thuds[0].hz.toFixed(1) + ' Hz, vibraphone C4 F#4 B4 damped, bass drum and brush slap)' },
      { t: tl.hard.no2, what: 'HARD: NO 2 (bass Bb1, thud ' + thuds[1].hz.toFixed(1) + ' Hz, vibraphone G#3 D4 F#4 damped, bass drum and brush slap)' },
      { t: tl.hard.slab, what: 'HARD: the slab (bass A1, thud ' + thuds[2].hz.toFixed(1) + ' Hz, vibraphone C4 F#4 B4 E5 ringing: the home chord)' }
    ].concat(tl.bays.map((t, i) => ({ t, what: 'bay ' + (i + 1) + ' stands up: gate note ' + C.GATES[i] })))
      .concat(tl.passes.map((t, i) => ({ t, what: 'SOFT: PASS ' + (i + 1) + ': the figure reaches ' + C.GATES[i] })))
      .concat([
        { t: tl.winner, what: 'SOFT: the winner: the whole voicing over A (Am6/9), full trio' },
        { t: tl.sleeve, what: 'SOFT: the sleeve: Cmaj7#11, a new colour (G3) under the ringing voicing' },
        { t: tl.positive, what: 'SOFT: back to positive: the tag begins (the gates come back down, a half note each)' }
      ]).sort((a, b) => a.t - b.t)
  };
  fs.writeFileSync(path.join(HERE, 'arrangement.json'), JSON.stringify(arrangement, null, 1) + '\n');
  lap('wrote final.wav, stems/, arrangement.json');

  /* ---- 9. the self-checks */
  const failures = [];
  for (const k of Object.keys(clipped)) { if (clipped[k] !== 0) { failures.push(k + '.wav: ' + clipped[k] + ' samples clipped when written'); } }
  console.log('\nThe kit\'s self-checks (final.wav):');
  const kitResult = checks.run({ file: path.join(HERE, 'final.wav'), sync: tl.sync, breath: [20.3, 22], lufs: [-16.5, -15.5], ceilingDb: -2, lra: [5, 12] });
  failures.push(...kitResult.failures);
  console.log('\nThis candidate\'s own checks (the chart as data, the stems, final.wav):');
  const own = require('./check-chart.js').run({ info: final.info });
  failures.push(...own.failures);
  lap('checked');
  /* ---- 10. the kit's analysis: the numbers of BRIEF.md section 4.3 and the pictures, into analysis/ */
  try {
    const a = kit.analyze.run(path.join(HERE, 'final.wav'), { outDir: path.join(HERE, 'analysis'), stemsDir: path.join(HERE, 'stems'), ref: fs.existsSync(path.join(kit.const.LAB, 'ref', 'old.wav')) ? path.join(kit.const.LAB, 'ref', 'old.wav') : undefined });   // the first soundtrack, for a side-by-side column, when it is there
    const missed = (a.targets || []).filter((t) => t.pass === false);
    console.log('\nThe kit\'s analysis: ' + a.passed + ' of ' + a.measured + ' measured targets pass' + (missed.length ? '' : ' (analysis/numbers.md)'));
    for (const t of missed) { failures.push('analysis: ' + t.name + ': ' + t.measured + ' (wanted ' + t.wanted + ')'); }
  } catch (err) { failures.push('the kit\'s analysis did not run: ' + err.message); }
  lap('analysed');
  if (failures.length) {
    console.log('\nBUILD FAILED:\n  - ' + failures.join('\n  - '));
    return 1;
  }
  console.log('\nBuild OK in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s.');
  return 0;
}

/* ------------------------------------------------------------------ the mix, in one place */
const MIX = {
  lufs: -16,
  trioWindow: [30, 36],            // the full-trio passage the balance is measured in
  keysUnderBass: -6.0,             // vibraphone stem RMS relative to the bass stem (target -3 to -10)
  drumsUnderBass: -10,             // drum stem RMS relative to the bass stem (target -8 to -16)
  thudOverBass: 12.5,                // the loudest thud's peak above the bass stem's RMS in the trio passage
  thudDb: 0,
  bassShareAbove150: 0.27,         // of the bass's energy, after the harmonics are added (the brief: at least a quarter)
  bassEq: [{ type: 'hp', f: 38, q: 0.7071 }, { type: 'peak', f: 900, q: 0.9, db: 4 }, { type: 'lp', f: 3600, q: 0.7071 }],
  bassComp: { threshold: -24, ratio: 3.5, knee: 8, attack: 0.004, release: 0.14 },
  crest: { bass: 11, vibes: 14.5, drums: 17 },   // peak over the trio-passage RMS that each instrument is held to
  vibesEq: [{ type: 'hp', f: 170, q: 0.7071 }, { type: 'peak', f: 1700, q: 0.7, db: 2.5 }, { type: 'lp', f: 9000, q: 0.7071 }],
  motor: { hz: 3.3, depthDb: 1.2 },
  vibesPan: -0.25,
  kickEq: [{ type: 'hp', f: 45, q: 0.7071 }, { type: 'lp', f: 1800, q: 0.7071 }],
  skinsEq: [{ type: 'hp', f: 200, q: 0.7071 }, { type: 'peak', f: 3600, q: 0.8, db: -1.5 }, { type: 'lp', f: 8000, q: 0.7071 }],
  cymbalsEq: [{ type: 'hp', f: 500, q: 0.7071 }, { type: 'highshelf', f: 4000, q: 0.7071, db: -3 }],
  cymbalsLp: 8000,
  kickDb: 0, skinsDb: 2, cymbalsDb: -1,
  drumsPan: 0.35,
  send: { bass: -26, keys: -13, drums: -15, fx: -20 },
  room: { decay: 0.75, damp: 0.6, predelay: 0.012, seed: 3 },
  roomToneDb: -68,
  easeOut: [44.0, 45.6],
  master: { hp: 30, shelf: { f: 3000, db: 2.2 }, lp: 10000, comp: { threshold: -18, ratio: 2 }, lufs: -16, ceilingDb: -2 }
};

if (require.main === module) {
  let code = 1;
  try { code = build(); } catch (err) { console.error('build: ' + (err && err.stack || err)); }
  process.exit(code);
}
module.exports = { MIX, PRESET, DRUM, SEED };
