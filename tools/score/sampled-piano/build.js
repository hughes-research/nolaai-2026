#!/usr/bin/env node
/*
 * tools/score/sampled-piano/build.js: the candidate "sampled-piano".
 *
 *   node tools/score/sampled-piano/build.js
 *
 * A cool-jazz piano trio in D minor for the 46-second title film, played by
 * RECORDED instruments through the kit's offline sampler (fluidsynth, its own
 * reverb and chorus off):
 *   upright bass   MuseScore General 000-032 "Acoustic Bass"
 *   piano          MuseScore General 008-000 "Mellow Grand Piano"
 *   brushes, ride  FluidR3 GM 128-040 "Brush" (brush snare 38 and 39, brush swirl 40,
 *                  ride 51, second ride 59, pedal hi-hat 44, bass drum 36)
 * The only synthesized sounds are the kit's own: the three low NO thuds
 * (synth.thud) and the room tone (synth.roomTone).
 *
 * The chart (chords, bass line, piano events, drum part) is in chart.js, as
 * data. This file performs it (seeded humanising), renders one sampler pass
 * per voice, mixes four stems through the kit's small-club room, masters, runs
 * the self-checks and writes the files of the contract (BRIEF.md section 5):
 *   final.wav, stems/{bass,keys,drums,fx}.wav, arrangement.json, analysis/
 * Every picture time comes from the kit's timeline (video/score.js).
 * Deterministic: the same files every run. Exit 0 only if every check passes.
 *
 * REVISION (after the three judges' measurements; the notes are in chart.js):
 *   - the brushes: under the struck swirl strokes lies a continuous bed made from the recorded swirl itself
 *     (grains of the key-40 recording, overlapped), and no two struck strokes are the same waveform
 *   - time drifts with memory instead of jittering (bass, brushes, ride, feet)
 *   - the ride and the hi-hat foot are darker, with notches on the ride recording's three steady partials
 *   - the piano chord (and at NO 1 the brush slap) of the hits at 8 and 37 s is 3 dB up; the slab's thud is short
 *   - a darker room tone; a level ride from PASS 3 to the slab (chart.SHAPE)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const kit = require('../lib');
const chart = require('./chart.js');

const { SR, N, SECONDS } = kit.const;
const dsp = kit.dsp, mix = kit.mix, synth = kit.synth, sampler = kit.sampler, wav = kit.wav, checks = kit.checks;
const tl = kit.timeline.load();
const HERE = __dirname;
/* The files of the contract are written beside this script. SCORE_OUT=<dir> sends them elsewhere (a trial build that
 * leaves the delivered files alone); SCORE_FAST=1 skips the analysis pictures; SCORE_DEBUG=1 also writes each voice. */
const OUT = process.env.SCORE_OUT ? path.resolve(process.env.SCORE_OUT) : HERE;
const T0 = Date.now();
function log(msg) { console.log(msg); }
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function fx2(x, d) { return Number.isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : String(x); }

/* ================================================================ presets */

const BASS = { font: 'musescore', bank: 0, program: 32 };      // sounds at pitch: MIDI 38 = D2 = 73.4 Hz (audition: C2 = 65.37 Hz)
const PIANO = { font: 'musescore', bank: 8, program: 0 };      // the darkest piano of the audition
const DRUMS = { font: 'fluidr3', bank: 128, program: 40 };     // the Brush kit, stereo recordings
const KEY = { tap: 38, tap2: 39, swirl: 40, ride: 51, ride2: 59, hat: 44, kick: 36 };

/* ================================================================ picture times (never typed in) */

const SWING = chart.SWING;
const at = (bar, beat) => tl.at(bar, beat, { swing: SWING });
const tAt = (bar, beat) => (bar - 1) * tl.bar + (beat - 1) * tl.beat;     // a place in a bar as written (no swing; beat 5 is the next bar line)
const SYNC = {
  no1: tl.hard.no1, no2: tl.hard.no2, slab: tl.hard.slab,
  pass1: tl.passes[0], pass2: tl.passes[1], pass3: tl.passes[2], pass4: tl.passes[3],
  winner: tl.winner, sleeve: tl.sleeve, positive: tl.positive,
  nod: tl.score.ideas[1].gates[0].lift
};
const HARD = new Set(['no1', 'no2', 'slab']);
/* A HARD hit is several sounds, each with its own attack. Every one is started early by its own measured delay
 * (note-on to 10 percent of its peak) plus HIT_LEAD, so the weight of the hit, not its first trace, falls on the frame.
 * The result is measured on final.wav by the checks (onset within 10 ms; this build asks for 5). */
const HIT_LEAD = 0.0005;
function onPicture(bar, beat, name) {
  const t = at(bar, beat);
  if (!(name in SYNC)) { throw new Error('chart: unknown sync name "' + name + '"'); }
  if (Math.abs(t - SYNC[name]) > 1e-9) { throw new Error('chart: bar ' + bar + ' beat ' + beat + ' (' + t + ' s) is not the picture\'s "' + name + '" (' + SYNC[name] + ' s)'); }
  return SYNC[name];
}

/* ================================================================ measured onsets
 * A sample does not speak at its note-on. For the three HARD hits each sampled
 * note is started early by the delay measured here (note-on to 10 percent of
 * the peak), on a probe render of exactly the keys and velocities used. */
function measureOnsets(preset, list) {
  if (!list.length) { return []; }
  const notes = list.map((x, i) => ({ t: 0.5 + i * 1.5, dur: 1.0, midi: x.midi, vel: x.vel }));     // 0.5 s is a block boundary
  const st = sampler.render(Object.assign({}, preset, { notes: notes, seconds: 0.5 + list.length * 1.5 }));
  return list.map((x, i) => {
    const rec = sampler.onsetIn(st, 0.5 + i * 1.5, 1.0);
    if (rec.silent) { throw new Error('onset probe: key ' + x.midi + ' is silent'); }
    return rec.t10;
  });
}

/* ================================================================ the performance (seeded) */

const rBass = dsp.rng(1959), rPiano = dsp.rng(1957), rDrums = dsp.rng(1961);
const g = (r) => clamp(dsp.gauss(r), -2, 2);

/* TIME WITH MEMORY. A player's time does not jitter around the grid: it leans, and comes back over a few notes.
 * Each voice has a walk of its own: the next on-beat note is `rho` of the way from where the last one was, plus a
 * fresh step (lag-1 correlation rho, standard deviation sd), and never further out than lo..hi. An off-beat eighth
 * sits where the walk is now, give or take `spread`, so the swing ratio stays inside the brief's 62 to 66 percent.
 * The three HARD hits do not use this at all. */
function drifter(seed, sd, rho, lo, hi) {
  const r = dsp.rng(seed), k = Math.sqrt(1 - rho * rho);
  let x = null;
  return {
    next: function () { const z = clamp(dsp.gauss(r), -2.5, 2.5); x = clamp(x === null ? sd * z : rho * x + k * sd * z, lo, hi); return x; },
    near: function (spread, lo2, hi2) { const z = clamp(dsp.gauss(r), -2, 2); return clamp((x === null ? 0 : x) + spread * z, lo2, hi2); }
  };
}
const TIME = {                                                   // seconds: sd, lag-1, the furthest the walk may go
  bass: drifter(2059, 0.0040, 0.68, -0.0078, 0.0082),            // around 8.2 ms behind the beat
  swirl: drifter(2061, 0.0041, 0.72, -0.0072, 0.0072),           // around 5 ms ahead (the brush starts its sweep early)
  tap: drifter(2182, 0.0044, 0.72, -0.0070, 0.0070),
  ride: drifter(2137, 0.0029, 0.68, -0.0052, 0.0052),            // around 3.4 ms ahead
  hat: drifter(2064, 0.0027, 0.66, -0.0052, 0.0052),
  kick: drifter(2065, 0.0027, 0.66, -0.0052, 0.0052)
};
const isOff = (beat) => Math.abs(beat - Math.round(beat)) > 1e-6;
/* A walk this short does not average out by itself (the ride's first walk sat 2.5 ms late on average and was no longer
 * ahead of the beat). Once a voice is written, the mean of its on-beat leanings is taken off every note of it, so each
 * voice sits where it is meant to on average and keeps its drift. `list` holds { lean, on } and a time field. */
function centre(list, field) {
  const on = list.filter((x) => x.on && typeof x.lean === 'number');
  if (!on.length) { return 0; }
  const mean = on.reduce((s2, x) => s2 + x.lean, 0) / on.length;
  list.forEach((x) => { if (typeof x.lean === 'number') { x[field] -= mean; x.lean -= mean; } });
  return mean;
}

/* ---- bass ---------------------------------------------------------------
 * The preset's sample zones are not equally loud (audition, vel 0.6, K-weighted:
 * F#2..Bb2 3.8 dB under C#2..F2, and so on). A player evens that out with the
 * right hand; here the velocity does (40 log10 of velocity is the level). */
function bassZoneDb(m) { return m <= 29 ? 0 : m <= 36 ? 2.4 : m <= 41 ? 0 : m <= 46 ? 3.8 : m <= 54 ? 2.2 : 0.9; }
const BASS_BASE = 0.70;
const BASS_BEHIND = 0.0082;
const bassPlan = [];
Object.keys(chart.BASS).map(Number).sort((a, b) => a - b).forEach((bar) => {
  chart.BASS[bar].forEach(([beat, midi, len, accent, flag]) => {
    const over = beat >= 5;                                       // "beat 5" is the next bar's downbeat
    const b2 = over ? bar + 1 : bar, bt = over ? beat - 4 : beat;
    bassPlan.push({ bar: b2, beat: bt, midi, len, accent, flag: flag || '', t0: at(b2, bt) });
  });
});
bassPlan.sort((a, b) => a.t0 - b.t0);
const bassHard = bassPlan.filter((n) => n.flag === 'hit' || n.flag === 'slab');
const BASS_HIT_VEL = { hit: 0.72, slab: 0.78 };
const bassOn = measureOnsets(BASS, bassHard.map((n) => ({ midi: n.midi, vel: BASS_HIT_VEL[n.flag] })));
const hardTimes = [SYNC.no1, SYNC.no2, SYNC.slab];
const bassNotes = [];
bassPlan.forEach((n, i) => {
  const hard = n.flag === 'hit' || n.flag === 'slab';
  const next = bassPlan.slice(i + 1).find((x) => x.flag !== 'ghost');
  let t, vel, dur;
  if (hard) {
    if (!hardTimes.some((h) => Math.abs(h - n.t0) < 1e-9)) { throw new Error('chart: the bass hit in bar ' + n.bar + ' is not on a HARD time'); }
    t = n.t0 - bassOn[bassHard.indexOf(n)] - HIT_LEAD;         // not humanised
    vel = BASS_HIT_VEL[n.flag];
  } else {
    n.on = !isOff(n.beat);
    n.lean = n.on ? TIME.bass.next() : TIME.bass.near(0.0008, -0.0050, 0.0082);
    t = n.t0 + BASS_BEHIND + n.lean;                           // behind the beat, drifting
    vel = n.flag === 'ghost' ? n.accent * (1 + 0.05 * g(rBass)) : BASS_BASE * n.accent * (1 + 0.035 * g(rBass));
    vel = clamp(vel * Math.pow(10, bassZoneDb(n.midi) / 40), 0.08, 0.97);
  }
  if (n.flag === 'ghost') { dur = 0.055 + 0.01 * rBass(); }
  else if (n.flag === 'hit') { dur = n.len * tl.beat; }        // short, then the left hand damps it
  else {
    const full = n.len * tl.beat;
    const room = next ? next.t0 - n.t0 : full;
    const gap = 0.022 + 0.016 * rBass();                       // nearly legato: a tiny gap before the next note
    dur = Math.min(full, room - gap);
  }
  dur = Math.min(dur, SECONDS - 0.9 - t);
  bassNotes.push({ t, dur, midi: n.midi, vel, bar: n.bar, beat: n.beat, flag: n.flag, nominal: n.t0, lean: hard ? undefined : n.lean, on: n.on });
});
centre(bassNotes, 't');
bassNotes.forEach((n) => { if (typeof n.lean === 'number') { n.t = Math.max(n.t, n.nominal + 0.0005); } });   // behind the beat or on it, never ahead

/* ---- piano ---------------------------------------------------------------
 * Level trims by key, so the line on top reads evenly. The audition warns that one recording of this preset
 * ("Piano MF C4", keys 70 to 72: Bb4, B4, C5) is 4 to 6 dB louder than its neighbours; this candidate's own probe
 * (RMS at vel 0.55) has keys 70 to 75 at 1.5 to 2.6 dB over A4 and E5, F5 about 1 dB under it. Velocities stay
 * under 0.84, where the preset's harder FF recording would start. The keys F#3, G3, Ab3 are a special case: see the mix. */
function pianoKeyDb(m) { return (m >= 70 && m <= 72) ? -3.0 : (m >= 73 && m <= 75) ? -2.0 : (m === 76 || m === 77) ? 1.5 : 0; }
const WEAK_KEYS = new Set([54, 55, 56]);
const pianoHardList = [];
chart.PIANO.forEach((ev) => { if (ev.sync && HARD.has(ev.sync)) { ev.notes.forEach((m) => pianoHardList.push({ midi: m, vel: ev.vel, ev: ev })); } });
const pianoOn = measureOnsets(PIANO, pianoHardList);
const pianoNotes = [];
chart.PIANO.forEach((ev) => {
  const t0 = ev.sync ? onPicture(ev.bar, ev.beat, ev.sync) : at(ev.bar, ev.beat);
  const hard = ev.sync && HARD.has(ev.sync);
  // a comp stab is sometimes a hair late; anything that marks the picture is not
  const late = hard ? 0 : (ev.sync || ev.pass) ? clamp(0.0015 * g(rPiano), -0.003, 0.003) : (rPiano() < 0.3 ? 0.006 + 0.007 * rPiano() : clamp(0.0025 * g(rPiano), -0.004, 0.005));
  const offBeat = Math.abs(ev.beat - Math.round(ev.beat)) > 1e-6;
  const lateBy = offBeat ? Math.min(late, 0.008) : late;      // a pushed chord is already early in the bar: at most 8 ms late, so the swing stays inside 62 to 66 percent
  ev.notes.forEach((m, k) => {
    let t, vel;
    if (hard) {
      const p = pianoHardList.findIndex((x) => x.ev === ev && x.midi === m);
      t = t0 - pianoOn[p] - HIT_LEAD;
      vel = ev.vel * (k === ev.notes.length - 1 ? 1.06 : 1);
    } else {
      t = t0 + lateBy + k * (ev.roll || 0) + (ev.notes.length > 1 ? clamp(0.0018 * g(rPiano), -0.003, 0.003) : 0);   // the fingers do not land as one
      vel = ev.vel * (1 + 0.045 * g(rPiano)) * (k === ev.notes.length - 1 && ev.notes.length > 1 ? 1.08 : 1) * (k === 0 && ev.notes.length > 2 ? 0.95 : 1);
    }
    vel = clamp(vel * Math.pow(10, pianoKeyDb(m) / 40), 0.15, 0.84);
    const dur = Math.min(ev.hold * tl.beat, SECONDS - 1.0 - t);
    pianoNotes.push({ t, dur, midi: m, vel, bar: ev.bar, beat: ev.beat, what: ev.what, pass: ev.pass || 0, top: !!ev.top && k === ev.notes.length - 1, nominal: t0 + k * (ev.roll || 0) });
  });
});

/* ---- drums ---------------------------------------------------------------
 * Passes (one sampler render each, so each voice gets its own EQ):
 *   swirl0..4  the brush's struck strokes on the snare, dealt between five variants of the recording (see the mix)
 *   tap    the brush taps                        rideA  the ride on the beat      rideB  the ride's skip notes
 *   ride2  the second ride cymbal (the tag)      hat    the hi-hat foot           kick   the feathered bass drum
 *   hit    the bass drum and brush slap of a HARD hit (never choked, never humanised)
 *   slabRide  the one ride note on the slab, left to ring
 * The continuous brush bed is not a sampler pass: it is made in the mix, from these strokes. */
const SWIRL_VARIANTS = [                                         // one recording, five ways: played 3 % slower to 3 % faster, a little duller or brighter above 2 kHz
  { speed: 0.970, shelf: -1.5 }, { speed: 0.985, shelf: 1.7 }, { speed: 1.000, shelf: 0.5 }, { speed: 1.015, shelf: -0.5 }, { speed: 1.030, shelf: 2.5 }
];
const rVariant = dsp.rng(1962);
let lastVariants = [-1, -1];
function swirlPass() {                                           // never the variant of either of the two strokes before
  let v;
  do { v = Math.floor(rVariant() * SWIRL_VARIANTS.length); } while (v === lastVariants[0] || v === lastVariants[1]);
  lastVariants = [lastVariants[1], v];
  return 'swirl' + v;
}
const drumHits = [];
const lastVel = {};
function drum(pass, kind, key, t, vel, exact) {
  let v = clamp(Math.round(clamp(vel, 0.02, 1) * 127), 3, 127);
  const id = kind.split(' (')[0] + ':' + key;                    // one voice, as check-chart.js counts it
  if (lastVel[id] === v) { v += (v > 64 ? -2 : 2); }             // never the identical velocity twice running
  lastVel[id] = v;
  const hit = { t, key, vel: v / 127, pass, kind, exact: !!exact };
  drumHits.push(hit);
  return hit;
}
/* A time-keeping stroke: where it is written, where that voice sits against the beat, and how its walk leans now. */
function kept(voice, pass, kind, key, bar, beat, sits, offLo, offHi, vel) {
  const on = !isOff(beat), lean = on ? TIME[voice].next() : TIME[voice].near(voice === 'ride' ? 0.0006 : 0.0009, offLo, offHi);
  const hit = drum(pass, kind, key, at(bar, beat) + sits + lean, vel);
  hit.voice = voice; hit.lean = lean; hit.on = on;
  return hit;
}
/* The brush slap of NO 1 is 3 dB harder than NO 2's (40 log10 of velocity is the level): after a 150 Hz high-pass the
 * first 300 ms of NO 1 measured 3 dB UNDER the bar before it (signal judge), NO 2 3 dB over. */
const SLAP_VEL = { no1: [0.93, 0.785], no2: [0.78, 0.66] };
const HIT_KICK_VEL = 0.62;                                       // was 0.85: the thud is the low drum of the hit; a softer bass drum under it leaves the limiter room for the chord and the slap
const drumOn = measureOnsets(DRUMS, [{ midi: KEY.kick, vel: HIT_KICK_VEL }, { midi: KEY.ride, vel: 0.6 },
  { midi: KEY.tap, vel: SLAP_VEL.no1[0] }, { midi: KEY.tap2, vel: SLAP_VEL.no1[1] }, { midi: KEY.tap, vel: SLAP_VEL.no2[0] }, { midi: KEY.tap2, vel: SLAP_VEL.no2[1] }]);
const ON = { kick: drumOn[0], ride: drumOn[1], slap: { no1: [drumOn[2], drumOn[3]], no2: [drumOn[4], drumOn[5]] } };
let tapCount = 0;
Object.keys(chart.DRUMS).map(Number).sort((a, b) => a - b).forEach((bar) => {
  const d = chart.DRUMS[bar];
  const inRoll = (b) => !!d.roll && b >= d.roll[0] - 1e-9 && b < d.roll[1] - 1e-9;
  if (d.swirl) {
    const [from, to, level] = d.swirl;
    for (let b = from; b < to; b++) {
      if (inRoll(b)) { continue; }                               // the roll has both the hand and the beat
      // the left hand circles: a longer sweep on the beat, a shorter one back on the swung "and"
      kept('swirl', swirlPass(), 'swirl', KEY.swirl, bar, b, -0.005, 0, 0, level * (b % 2 === 1 ? 0.62 : 0.54) * (1 + 0.10 * g(rDrums)));
      if (b + 0.5 < to && !inRoll(b + 0.5) && (!d.ands || d.ands.indexOf(b) >= 0)) {
        kept('swirl', swirlPass(), 'swirl', KEY.swirl, bar, b + 0.5, -0.005, -0.0050, 0.0072, level * 0.36 * (1 + 0.12 * g(rDrums)));
      }
    }
  }
  if (d.roll) {
    // brush strokes in eighth-note triplets, rising from the first level to the last; the last one is 125 ms before the door lets go
    const [from, to, v0, v1, hands] = d.roll, level = d.swirl ? d.swirl[2] : 1;
    const count = Math.round((to - from) * 3);
    for (let k = 0; k < count; k++) {
      const t = tAt(bar, from) + k * tl.beat / 3 + 0.002 * g(rDrums);
      const rise = v0 + (v1 - v0) * (count > 1 ? k / (count - 1) : 1);
      drum(swirlPass(), 'roll stroke', KEY.swirl, t - 0.004, level * rise * (1 + 0.05 * g(rDrums))).roll = true;
      if (hands !== 'one hand' && k >= 1) { drum('tap', 'roll tap', k % 2 ? KEY.tap : KEY.tap2, t + 0.001, level * 0.36 * rise * (1 + 0.06 * g(rDrums))); }
    }
  }
  (d.taps || []).forEach(([beat, level]) => {
    const key = (tapCount++ % 2) ? KEY.tap2 : KEY.tap;          // two brush strokes in turn: no machine-gun
    kept('tap', 'tap', 'brush tap', key, bar, beat, 0, -0.0048, 0.0070, level * (1 + 0.10 * g(rDrums)));
  });
  (d.ride || []).forEach(([beat, level, key]) => {
    const skip = isOff(beat);
    const pass = key === KEY.ride2 ? 'ride2' : (skip ? 'rideB' : 'rideA');
    kept('ride', pass, 'ride', key || KEY.ride, bar, beat, -0.0034, -0.0048, 0.0052, level * (1 + 0.06 * g(rDrums)));   // ahead of the beat, drifting
  });
  (d.hat || []).forEach(([beat, level]) => { kept('hat', 'hat', 'hi-hat foot', KEY.hat, bar, beat, 0, 0, 0, level * (1 + 0.06 * g(rDrums))); });
  (d.kick || []).forEach(([beat, level]) => { kept('kick', 'kick', 'bass drum', KEY.kick, bar, beat, 0, 0, 0, level * (1 + 0.06 * g(rDrums))); });
  if (d.hit) {
    const T = SYNC[d.hit];
    if (d.hit === 'slab') {
      drum('hit', 'bass drum (slab)', KEY.kick, T - ON.kick - HIT_LEAD, HIT_KICK_VEL, true);
      drum('slabRide', 'ride (slab, left to ring)', KEY.ride, T - ON.ride - HIT_LEAD, 0.60, true);
    } else {
      drum('hit', 'bass drum (NO)', KEY.kick, T - ON.kick - HIT_LEAD, HIT_KICK_VEL, true);
      drum('hit', 'brush slap (NO)', KEY.tap, T - ON.slap[d.hit][0] - HIT_LEAD, SLAP_VEL[d.hit][0], true);
      drum('hit', 'brush slap (NO)', KEY.tap2, T - ON.slap[d.hit][1] - HIT_LEAD, SLAP_VEL[d.hit][1], true);
    }
  }
});
const leanMeans = {};
Object.keys(TIME).filter((v) => v !== 'bass').forEach((v) => { leanMeans[v] = centre(drumHits.filter((h) => h.voice === v), 't'); });
drumHits.sort((a, b) => a.t - b.t);

/* ================================================================ render */

function render(preset, notes) {
  return sampler.render(Object.assign({}, preset, { seconds: SECONDS, notes: notes.map((n) => ({ t: n.t, dur: n.dur, midi: n.midi, vel: n.vel })) }));
}
function renderDrums(pass) {
  return sampler.render(Object.assign({}, DRUMS, { seconds: SECONDS, notes: drumHits.filter((h) => h.pass === pass).map((h) => ({ t: h.t, dur: 0.1, midi: h.key, vel: h.vel })) }));
}
/* One variant of the struck swirl: the strokes are rendered on a clock that runs `speed` times as fast and the result is
 * read back at that speed (cubic interpolation), so each stroke lands where it was written and the recording itself is
 * played that much faster (shorter and higher) or slower. */
function renderSwirlVariant(v) {
  const speed = SWIRL_VARIANTS[v].speed;
  const y = sampler.render(Object.assign({}, DRUMS, { seconds: 48, notes: drumHits.filter((h) => h.pass === 'swirl' + v).map((h) => ({ t: h.t * speed, dur: 0.1, midi: h.key, vel: h.vel })) }));
  const out = dsp.stereo();
  for (let c = 0; c < 2; c++) {
    const src = y[c], dst = out[c], last = src.length - 3;
    for (let i = 0; i < N; i++) {
      const x = i * speed, k = Math.floor(x), f = x - k;
      if (k < 1 || k > last) { continue; }
      const a = src[k - 1], b = src[k], cc = src[k + 1], dd = src[k + 2];
      dst[i] = b + 0.5 * f * (cc - a + f * (2 * a - 5 * b + 4 * cc - dd + f * (3 * (b - cc) + dd - a)));
    }
  }
  return out;
}
const raw = {
  bass: render(BASS, bassNotes),
  piano: render(PIANO, pianoNotes.filter((n) => !WEAK_KEYS.has(n.midi))),
  pianoWeak: render(PIANO, pianoNotes.filter((n) => WEAK_KEYS.has(n.midi))),
  tap: renderDrums('tap'), rideA: renderDrums('rideA'), rideB: renderDrums('rideB'), ride2: renderDrums('ride2'),
  hat: renderDrums('hat'), kick: renderDrums('kick'), hit: renderDrums('hit'), slabRide: renderDrums('slabRide')
};
const swirlVariants = SWIRL_VARIANTS.map((x, v) => renderSwirlVariant(v));
log('rendered ' + (Object.keys(raw).length + swirlVariants.length) + ' sampler passes (' + bassNotes.length + ' bass notes, ' + pianoNotes.length + ' piano notes, ' + drumHits.length + ' drum hits) in ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');

/* ================================================================ the mix */

/* Narrow a stereo recording: keep the middle, scale the side. */
function narrow(st, w) {
  const L = st[0], R = st[1];
  for (let i = 0; i < L.length; i++) { const m = 0.5 * (L[i] + R[i]), s = 0.5 * (L[i] - R[i]) * w; L[i] = m + s; R[i] = m - s; }
  return st;
}
/* The break and the stop-time: the drummer's hands are off 70 ms after the door lets go, and stay off
 * (the bass drum and brush slap of the hit itself are another pass and are not choked). After NO 1 and NO 2 the kit is
 * out until the band comes back; after the last door lets go it is out until the tag at 38 s. */
const DROP = { no1: tl.score.ideas[0].gates[0].drop, no2: tl.score.ideas[1].gates[1].drop, slab: tl.score.title.drop };   // the doors let go here, 0.375 s before they land
function choke(st) {
  [[DROP.no1, 9.95], [DROP.no2, 21.9], [DROP.slab, SYNC.positive - 0.05]].forEach(([a, b]) => { dsp.fade(st, a, a + 0.07, 1, 0); dsp.fade(st, a + 0.07, b, 0, 0); });
  return st;
}
/* The loudest 10 ms (RMS over both channels, dB) between two times: how loud a stroke is. */
function loudest10ms(st, a, b) {
  const w = Math.round(0.010 * SR), i0 = Math.max(0, Math.round(a * SR)), i1 = Math.min(N - w, Math.round(b * SR));
  let best = 0;
  for (let i = i0; i <= i1; i += 48) {
    let s = 0;
    for (let j = i; j < i + w; j++) { s += st[0][j] * st[0][j] + st[1][j] * st[1][j]; }
    if (s > best) { best = s; }
  }
  return 10 * Math.log10(best / (2 * w) + 1e-30);
}
/* chart.SHAPE as a level ride: straight lines in dB between the points, nothing before the first or after the last. */
const shapePoints = chart.SHAPE.map(([bar, beat, d]) => [tAt(bar, beat), d]);
function shapeDb(t) {
  if (t <= shapePoints[0][0] || t >= shapePoints[shapePoints.length - 1][0]) { return 0; }
  for (let k = 1; k < shapePoints.length; k++) {
    if (t <= shapePoints[k][0]) { const [t0, d0] = shapePoints[k - 1], [t1, d1] = shapePoints[k]; return t1 > t0 ? d0 + (d1 - d0) * (t - t0) / (t1 - t0) : d1; }
  }
  return 0;
}
const shapeGain = new Float32Array(N).fill(1);
{
  const i0 = Math.round(shapePoints[0][0] * SR), i1 = Math.round(shapePoints[shapePoints.length - 1][0] * SR);
  for (let i = i0; i < i1; i++) { shapeGain[i] = Math.pow(10, shapeDb(i / SR) / 20); }
}
function ride(st) { for (const ch of st) { for (let i = 0; i < N; i++) { if (shapeGain[i] !== 1) { ch[i] *= shapeGain[i]; } } } return st; }

/* BASS: centre, almost dry. The samples are nearly all fundamental and second
 * harmonic (probe: third harmonic 19 dB down), so on a small speaker the low
 * notes would vanish: gentle harmonics (dsp.saturate), less shelf under 100 Hz,
 * a wide lift around 230 Hz and a little finger at 800 Hz. */
dsp.saturate(raw.bass, 0.55, { ref: dsp.peak(raw.bass) * 0.5 });
dsp.eq(raw.bass, [
  { type: 'hp', f: 36, q: 0.7071 },
  { type: 'lowshelf', f: 105, db: -5.5 },
  { type: 'peak', f: 205, q: 1.2, db: -5 },               // was +2 dB at 230 Hz. With the cymbals darker the mix keeps its tilt by midrange, not by treble: the bass's harmonics sit an octave higher than they did,
  { type: 'peak', f: 450, q: 0.8, db: 2.5 },              // less around 200 Hz (the bottom of the fitted range), more around 450 and 900 Hz,
  { type: 'peak', f: 900, q: 0.7, db: 7 },                // which is also where a small speaker still plays (was +5)
  { type: 'lp', f: 4500, q: 0.6 }
]);
/* A plucked note blooms 80 ms after it starts and its peak stands 14 dB over the line's RMS: left alone, every
 * bass note would lean on the master's limiter and pull the piano and brushes down with it. The bass gets its own
 * gentle compressor instead (the kit's, 3:1 above the line's own level), so the master is left with almost nothing to do. */
const bassComp = mix.compress(raw.bass, { threshold: dsp.rmsDb(raw.bass, 22, 36) + 1, ratio: 3, knee: 6, attack: 0.006, release: 0.14 });
/* ... and the kit's look-ahead limiter to itself, 10.5 dB over the line's RMS, for the few notes that still stand out. */
const bassLimit = mix.limitPass(raw.bass, dsp.lin(dsp.rmsDb(raw.bass, 22, 36) + 10.5), 0.005, 0.08);
ride(raw.bass);                                                  // after its compressor, so the ride is what is heard
/* The last D2 dies away under the last chord (chart.BASS_END, straight lines in dB as chart.SHAPE): the recording decays
 * at about 9 dB a second and stood 5 to 8 dB over the piano while the card held. */
{
  const pts = chart.BASS_END.map(([bar, beat, d]) => [tAt(bar, beat), d]);
  pts.push([SECONDS, pts[pts.length - 1][1]]);                  // the last level holds to the end
  for (let k = 1; k < pts.length; k++) {
    const i0 = Math.round(pts[k - 1][0] * SR), i1 = Math.min(N, Math.round(pts[k][0] * SR));
    for (let i = i0; i < i1; i++) { const gn = Math.pow(10, (pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * (i - i0) / (i1 - i0)) / 20); raw.bass[0][i] *= gn; raw.bass[1][i] *= gn; }
  }
}

/* PIANO: the preset's stereo pair is out of phase on three keys (probe: F#3, G3
 * and Ab3 have a left-right correlation of -0.23 and lose 4 dB in mono). The pair
 * is narrowed to 40 percent of its side, which makes every key fold to mono
 * cleanly, and those three keys, rendered apart, get back the 2.5 dB the
 * narrowing costs them. */
narrow(raw.piano, 0.4); narrow(raw.pianoWeak, 0.4);
dsp.gain(raw.pianoWeak, 2.5);
const pianoBus = dsp.stereo();
mix.add(pianoBus, raw.piano); mix.add(pianoBus, raw.pianoWeak);
dsp.eq(pianoBus, [
  { type: 'hp', f: 95, q: 0.7071 },
  { type: 'lowshelf', f: 450, q: 0.7071, db: -5.5 },     // the same reason: less of the piano's low-mid (it had more there than the bass)
  { type: 'peak', f: 280, q: 0.7, db: -3 },              // was -1.5 at q 1
  { type: 'highshelf', f: 1000, q: 0.6, db: 4.5 }       // the preset is very dark (audition: centroid about 600 Hz); this keeps the whole mix's tilt inside the brief
]);
ride(pianoBus);
/* The hits on small speakers (signal judge): at 8 and 37 s the chord is 3 dB up. The gain comes up inside the silence
 * of the break and goes back while the chord rings. So that the master's limiter has no more to do than before, the
 * keys stem gets the kit's look-ahead limiter to itself (below, once the stems are at their level): the body of the
 * two chords is 3 dB up, the first milliseconds of their attack are not. */
const HIT_CHORD_DB = { no1: 3, no2: 2, slab: 3.5 };              // NO 2 was not asked for: it keeps the lift it had over a bar that the brush bed has made fuller
const HIT_CHORD_HOLD = { no1: [1.4, 0.3], no2: [1.4, 0.3], slab: [0.55, 0.38] };  // seconds after the hit the gain is held, then the length of its way back
Object.keys(HIT_CHORD_DB).forEach((name) => {
  const T = SYNC[name], up = dsp.lin(HIT_CHORD_DB[name]), [hold, back] = HIT_CHORD_HOLD[name];
  dsp.fade(pianoBus, T - 0.06, T - 0.02, 1, up); dsp.fade(pianoBus, T - 0.02, T + hold, up, up); dsp.fade(pianoBus, T + hold, T + hold + back, up, 1);
});

/* DRUMS: quiet and dark. The brush samples have most of their energy at 2 to
 * 5 kHz and the cymbals above 5 kHz (audition), which is exactly what the
 * first soundtrack was faulted for, so each voice is low-passed and the brush
 * gets a dip at 3.2 kHz. */
const SWIRL_EQ = [{ type: 'hp', f: 200, q: 0.7071 }, { type: 'lp', f: 6500, q: 0.6 }, { type: 'lp', f: 9500, q: 0.7071 }];
raw.swirl = dsp.stereo();
swirlVariants.forEach((st, v) => { dsp.eq(st, SWIRL_EQ.concat(SWIRL_VARIANTS[v].shelf ? [{ type: 'highshelf', f: 2000, q: 0.7071, db: SWIRL_VARIANTS[v].shelf }] : [])); mix.add(raw.swirl, st); });
dsp.eq(raw.tap, [{ type: 'hp', f: 170, q: 0.7071 }, { type: 'peak', f: 3200, q: 0.9, db: -1.5 }, { type: 'lp', f: 5500, q: 0.6 }, { type: 'lp', f: 9000, q: 0.7071 }]);
dsp.eq(raw.hit, [{ type: 'peak', f: 3200, q: 0.9, db: -4 }, { type: 'lp', f: 5500, q: 0.6 }, { type: 'lp', f: 9000, q: 0.7071 }]);
/* The ride is one recording, so every stroke has the same partials, and three of them stand as steady lines over
 * their neighbours (signal judge, on the first mix: 3512.7 Hz 17.9 dB over the median of its third octave, 6334 Hz
 * 16.7 dB, 7497 Hz 19.0 dB). A narrow notch on each, and one on 2710 Hz, the partial that came forward once those
 * were down (and the ride's largest share of the 2 to 5 kHz peaks). The first low-pass is where the judge put it
 * (5.6 kHz, was 6.5). The second is at 8.5 kHz (was 9; the judge asked for 7.5): at 7.5 the whole mix measured a tilt
 * of 6.70 dB per octave, outside the brief's 6.5, because the fitted line ends at 8 kHz. */
const RIDE_NOTCHES = [{ type: 'peak', f: 2710, q: 10, db: -6 }, { type: 'peak', f: 3512, q: 12, db: -13 }, { type: 'peak', f: 6334, q: 12, db: -9 }, { type: 'peak', f: 7497, q: 12, db: -11 }];
const RIDE_EQ = [{ type: 'hp', f: 320, q: 0.7071 }].concat(RIDE_NOTCHES, [{ type: 'lp', f: 5600, q: 0.6 }, { type: 'lp', f: 8500, q: 0.7071 }]);
dsp.eq(raw.rideA, RIDE_EQ);
dsp.eq(raw.slabRide, RIDE_EQ);
dsp.eq(raw.rideB, [{ type: 'hp', f: 320, q: 0.7071 }].concat(RIDE_NOTCHES, [{ type: 'peak', f: 4200, q: 0.8, db: -1 }, { type: 'lp', f: 4900, q: 0.6 }, { type: 'lp', f: 6800, q: 0.7071 }]));   // a lighter stroke: darker
dsp.eq(raw.ride2, [{ type: 'hp', f: 320, q: 0.7071 }, { type: 'lp', f: 5000, q: 0.6 }, { type: 'lp', f: 7000, q: 0.7071 }]);     // the second cymbal of the tag: another recording, a darker place on the stage
dsp.eq(raw.hat, [{ type: 'hp', f: 400, q: 0.7071 }, { type: 'lp', f: 4500, q: 0.6 }, { type: 'lp', f: 7500, q: 0.7071 }]);       // the first low-pass was at 5.2 kHz
dsp.eq(raw.kick, [{ type: 'hp', f: 40, q: 0.7071 }, { type: 'lp', f: 450, q: 0.6 }]);
/* The brush samples start with a spike 25 to 30 dB over their own RMS. Left alone those spikes, not the music, would set
 * how hard the master's limiter works. Each brush pass gets the kit's look-ahead limiter to itself (2 ms ahead, 40 ms
 * release), which takes the tip off the spike and touches nothing else. */
const brushLimit = {
  swirl: mix.limitPass(raw.swirl, dsp.lin(dsp.rmsDb(raw.swirl, 30, 36) + 17), 0.002, 0.04),
  tap: mix.limitPass(raw.tap, dsp.peak(raw.tap, 22, 36) * dsp.lin(-5), 0.002, 0.04)
};

/* THE BRUSH BED. The swirl of this kit is a 0.6 s one-shot: struck on every beat and every swung "and" it left 30 dB
 * of dead air between strokes, the same shape every bar (realism judge). A brush never leaves the head. Under the struck
 * strokes lies a bed made of the recording itself, so the sound stays a brush on a snare:
 *   - three takes of key 40 (three velocities), with the strokes' EQ and then BED.eq (darker, and a dip on the
 *     recording's 900 Hz resonance); each take's own decay is divided out, so any stretch of it is as loud as any other;
 *   - grains of 60 to 90 ms from seeded places between 0.05 and 0.45 s of a take, read 6 % slower to 6 % faster (so the
 *     recording's own resonances, near 640 and 900 Hz, do not stand as steady lines), each fading in as the one before
 *     fades out (equal power), so the bed has no gaps and never repeats;
 *   - the hand: the bed sits BED.under dB below the loudest 10 ms of the struck strokes around it (measured on the
 *     strokes as they stand in the mix), dips once a beat as the brush turns under the struck stroke, 7 to 10 dB and
 *     never twice the same, and wanders a little from beat to beat;
 *   - it exists only where the chart has a swirl or a roll, it is cut with the band at each break (choke), and it has
 *     the strokes' fader, pan and room send. */
const BED = { under: 8, seed: 1963, takes: [0.42, 0.58, 0.74], from: 0.05, to: 0.45, piece: [0.030, 0.045], dip: [7, 10],
  eq: [{ type: 'hp', f: 320, q: 0.7071 }, { type: 'peak', f: 900, q: 3, db: -5 }, { type: 'lp', f: 3400, q: 0.6 }, { type: 'highshelf', f: 3200, q: 0.7071, db: -4 }] };   // darker than the strokes: the body of a sweep, not its accent, and nothing new in the 2 to 5 kHz band
function brushBed(strokes) {
  const r = dsp.rng(BED.seed);
  // the takes, flattened
  const src = sampler.render(Object.assign({}, DRUMS, { seconds: 0.5 + 1.5 * BED.takes.length, notes: BED.takes.map((v, i) => ({ t: 0.5 + 1.5 * i, dur: 0.1, midi: KEY.swirl, vel: v })) }));
  dsp.eq(src, SWIRL_EQ.concat(BED.eq));
  const n = src[0].length, w = Math.round(0.012 * SR);
  const power = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { power[i + 1] = power[i] + 0.5 * (src[0][i] * src[0][i] + src[1][i] * src[1][i]); }
  const flat = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w), e = Math.sqrt((power[b] - power[a]) / (b - a));
    if (e > 1e-7) { flat[0][i] = src[0][i] / e; flat[1][i] = src[1][i] / e; }
  }
  // where the hand is on the snare: every bar's swirl and roll, joined where they touch
  const spans = [];
  Object.keys(chart.DRUMS).map(Number).sort((a, b) => a - b).forEach((bar) => {
    const d = chart.DRUMS[bar];
    [d.swirl, d.roll].forEach((x) => {
      if (!x) { return; }
      const a = tAt(bar, x[0]), b = tAt(bar, x[1]), last = spans[spans.length - 1];
      if (last && a <= last[1] + 1e-6) { last[1] = Math.max(last[1], b); } else { spans.push([a, b]); }
    });
  });
  // the texture, at unit level
  const bed = dsp.stereo();
  spans.forEach(([t0, t1]) => {
    let b0 = t0 - 0.04, d0 = BED.piece[0] + (BED.piece[1] - BED.piece[0]) * r();
    while (b0 < t1 + 0.2) {
      const d1 = BED.piece[0] + (BED.piece[1] - BED.piece[0]) * r();
      const take = Math.floor(r() * BED.takes.length), rate = 0.94 + 0.12 * r();
      const len = Math.round((d0 + d1) * SR), nIn = Math.round(d0 * SR);
      const pos = (0.5 + 1.5 * take + BED.from + r() * (BED.to - BED.from - (d0 + d1) * rate)) * SR;
      const level = dsp.lin(-0.6 + 1.2 * r()), s0 = Math.round(b0 * SR);
      for (let i = 0; i < len; i++) {
        const j = s0 + i;
        if (j < 0 || j >= N) { continue; }
        const x = pos + i * rate, k = Math.floor(x), f = x - k;
        const win = (i < nIn ? Math.sin(0.5 * Math.PI * i / nIn) : Math.cos(0.5 * Math.PI * (i - nIn) / (len - nIn))) * level;
        bed[0][j] += (flat[0][k] + f * (flat[0][k + 1] - flat[0][k])) * win;
        bed[1][j] += (flat[1][k] + f * (flat[1][k + 1] - flat[1][k])) * win;
      }
      b0 += d0; d0 = d1;
    }
  });
  // the hand: a level in dB for every millisecond
  const CTL = 1000, ctl = new Float32Array(Math.round(SECONDS * CTL) + 2).fill(-200);
  const report = [];
  spans.forEach(([t0, t1]) => {
    const all = strokes.filter((h) => h.t > t0 - 0.03 && h.t < t1 + 0.01);
    const lead = all.filter((h) => h.on || h.roll);                // the strokes that set the level: on the beat, and the roll's
    if (!lead.length) { return; }
    const loud = lead.map((h) => loudest10ms(raw.swirl, h.t - 0.002, h.t + 0.045));
    let wander = 0;
    const points = lead.map((h, i) => {
      const near = (loud[Math.max(0, i - 1)] + 2 * loud[i] + loud[Math.min(lead.length - 1, i + 1)]) / 4;      // not the zigzag of strong and weak beats
      wander = 0.5 * wander + 0.6 * clamp(dsp.gauss(r), -2, 2);                                                // about 0.7 dB, with memory
      return [h.t, near - BED.under + wander];
    });
    // the dip falls as the struck stroke speaks (not before it) and comes back as the stroke dies; the short return stroke and the roll's strokes hardly dent it
    const dips = all.map((h) => (h.on ? { c: h.t + 0.022, d: BED.dip[0] + (BED.dip[1] - BED.dip[0]) * r(), a: 0.008, b: 0.040 }
      : h.roll ? { c: h.t + 0.016, d: 1.5 + 1.5 * r(), a: 0.007, b: 0.020 } : { c: h.t + 0.018, d: 0.5 + 1.0 * r(), a: 0.007, b: 0.025 }));
    const first = lead[0].t, i0 = Math.max(0, Math.round((first - 0.02) * CTL)), i1 = Math.min(ctl.length - 1, Math.round((t1 + 0.15) * CTL));
    let p = 0, q = 0;
    for (let i = i0; i <= i1; i++) {
      const t = i / CTL;
      while (p < points.length - 2 && t > points[p + 1][0]) { p++; }
      let v;
      if (t <= points[0][0] || points.length === 1) { v = points[0][1]; }
      else if (t >= points[points.length - 1][0]) { v = points[points.length - 1][1]; }
      else { const [ta, va] = points[p], [tb, vb] = points[p + 1]; v = va + (vb - va) * (0.5 - 0.5 * Math.cos(Math.PI * (t - ta) / (tb - ta))); }
      while (q < dips.length - 1 && dips[q].c + 0.2 < t) { q++; }
      for (let k = q; k < dips.length && dips[k].c - 0.1 < t; k++) { const u = (t - dips[k].c) / (t < dips[k].c ? dips[k].a : dips[k].b); v -= dips[k].d * Math.exp(-0.5 * u * u); }
      // the hand comes down with the first stroke and lifts off at the end
      const fadeIn = clamp((t - (first - 0.02)) / 0.09, 0, 1), fadeOut = clamp(((t1 + 0.15) - t) / 0.17, 0, 1);
      const fade = (0.5 - 0.5 * Math.cos(Math.PI * fadeIn)) * (0.5 - 0.5 * Math.cos(Math.PI * fadeOut));
      ctl[i] = fade > 1e-6 ? v + 20 * Math.log10(fade) : -200;
    }
    report.push(fx2(t0, 2) + '-' + fx2(t1, 2) + ' s: ' + fx2(Math.min(...points.map((x) => x[1]))) + ' to ' + fx2(Math.max(...points.map((x) => x[1]))) + ' dB');
  });
  for (let i = 0; i < N; i++) {
    const x = i * CTL / SR, k = Math.floor(x), f = x - k, d = ctl[k] + f * (ctl[k + 1] - ctl[k]);
    const gain = d > -150 ? Math.pow(10, d / 20) : 0;
    bed[0][i] *= gain; bed[1][i] *= gain;
  }
  return { bed, spans, report };
}
const bedMade = brushBed(drumHits.filter((h) => h.kind === 'swirl' || h.kind === 'roll stroke'));
raw.bed = bedMade.bed;
['swirl', 'bed', 'tap', 'rideA', 'rideB', 'ride2', 'hat', 'kick'].forEach((k) => { choke(raw[k]); ride(raw[k]); });

/* The faders (dB on the raw renders), the stage (pan) and the room sends (dB under the dry sound). */
const FADER = {
  bass: { db: 0, pan: 0, send: -27 },
  piano: { db: -4.2, pan: -0.25, send: -13 },                    // 1 dB up: part of what the low-mid cut took from its level
  swirl: { db: 6.5, pan: 0.24, send: -13 },                      // 5 dB under the first mix: the bed now carries the brush between the strokes
  bed: { db: 6.5, pan: 0.24, send: -13 },                        // the strokes' fader: BED.under is measured against them
  tap: { db: 2.5, pan: 0.20, send: -13 },
  rideA: { db: -1.5, pan: 0.30, send: -15 },                     // the cymbals a little down: this mix takes about 2 dB more gain than the first to reach -16 LUFS (it is darker), and they should not ride all the way up with it
  rideB: { db: -2.5, pan: 0.30, send: -15 },
  ride2: { db: -1.5, pan: 0.36, send: -15 },
  hat: { db: 0.5, pan: 0.18, send: -15 },
  kick: { db: -4, pan: 0.06, send: -24 },                        // feathered: 3 dB softer, it was as loud as the ride
  hit: { db: -16, pan: 0.12, send: -13 },
  slabRide: { db: 0, pan: 0.30, send: -14 },                     // 3 dB up: the slab is the hit that rings
  thud: { db: -16.5, pan: 0, send: -17 }
};
const ROOM = { decay: 0.75, damp: 0.6, predelay: 0.012, seed: 3 };      // a small club, dark
const DRUM_VOICES = ['swirl', 'bed', 'tap', 'rideA', 'rideB', 'ride2', 'hat', 'kick', 'hit', 'slabRide'];
const HIT_VOICES = ['hit', 'slabRide'];                          // the drums of the three HARD hits: they join the drums stem once the levels are set (see "Level")

const stems = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo(), hits: dsp.stereo() };
const sends = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo(), hits: dsp.stereo() };
function place(stem, src, f, when) {
  mix.add(stems[stem], src, { db: f.db, pan: f.pan, at: when || 0 });
  mix.add(sends[stem], src, { db: f.db + f.send, pan: f.pan, at: when || 0 });
}
place('bass', raw.bass, FADER.bass);
place('keys', pianoBus, FADER.piano);
DRUM_VOICES.forEach((k) => place(HIT_VOICES.indexOf(k) >= 0 ? 'hits' : 'drums', raw[k], FADER[k]));

/* The NO thuds: the kit's pitched low drum, placed on the frame. */
const THUD_LEAD = HIT_LEAD;                                      // the thud's own attack is a 2.5 ms rise
const thudHits = [];
[['no1', SYNC.no1], ['no2', SYNC.no2], ['slab', SYNC.slab]].forEach(([name, T]) => {
  const o = chart.THUDS[name];
  const thud = synth.thud({ hz: o.hz, size: o.size, rattle: o.rattle, body: o.body, seed: o.seed });
  if (o.cut) {                                                   // the slab: the drum is stopped, so the bass's D2 sustains alone
    dsp.fade(thud, o.cut[0], o.cut[1], 1, 0);
    for (const ch of thud) { ch.fill(0, Math.round(o.cut[1] * SR)); }
  }
  place('fx', thud, FADER.thud, T - THUD_LEAD);
  thudHits.push({ t: T, inst: 'fx', kind: 'thud ' + o.hz + ' Hz (' + name + ')', vel: o.size });
});

let tRoom = Date.now();
Object.keys(stems).forEach((name) => { mix.add(stems[name], mix.room(sends[name], ROOM)); });
log('the room (' + Object.keys(stems).length + ' buses) in ' + ((Date.now() - tRoom) / 1000).toFixed(1) + ' s');

/* Level: bring the whole mix to the target loudness before the master, so the
 * stems sit at their final level and the room tone can be set in real dBFS. */
const TARGET_LUFS = -16;
const TONE_DB = -68;
const TONE_LP = 1500;                                            // the kit's tone runs flat-pink to 6 kHz, which is a hiss; a room is darker
const MASTER = { hp: 30, shelf: false, comp: { threshold: -16, ratio: 1.6 }, lufs: TARGET_LUFS, ceilingDb: -2 };   // no shelf: every voice is already low-passed, and the mix must not end up darker than the brief's tilt
function sumStems() { const s = dsp.stereo(); Object.keys(stems).forEach((k) => mix.add(s, stems[k])); return s; }
const preLufs = mix.lufs(sumStems());
/* The band is brought to the target loudness. The three HARD hits are not: their thuds, bass drum, brush slaps and
 * the slab's ride get the gain the FIRST mix took to reach -16 LUFS (16.13 dB, measured back from the thud peaks in
 * that mix's fx.wav). This mix is darker and takes about 2.5 dB more; riding up with it, the hits made the master's
 * limiter work up to 5.8 dB where it had worked 4.0, and what the limiter took it took from the whole hit (the hits
 * measured WEAKER on small speakers that way). So the thuds stand in fx.wav where they stood (-6.3, -5.9, -6.4 dBFS,
 * the fader untouched), and what is louder at the hits is what was asked for: the piano chord and the slap. */
const BAND_GAIN = TARGET_LUFS - preLufs, HIT_GAIN = 16.13;
['bass', 'keys', 'drums'].forEach((k) => dsp.gain(stems[k], BAND_GAIN));
['fx', 'hits'].forEach((k) => dsp.gain(stems[k], HIT_GAIN));
mix.add(stems.drums, stems.hits); delete stems.hits;
/* The piano's tallest attack stands 0.6 dB under where it stood in the first mix's keys.wav (-3.6 dBFS): the kit's
 * look-ahead limiter, on the keys stem alone, 3 ms ahead, 60 ms release. It works on the first milliseconds of the
 * loudest chords (the winner, and the two hit chords that are 3 dB up) and on nothing else. */
const KEYS_PEAK_DB = -4.2;
const pianoLimit = mix.limitPass(stems.keys, dsp.lin(KEYS_PEAK_DB), 0.003, 0.06);
/* the edges: 5 ms in, and the 300 ms safety fade at the very end (on every stem, so the stems still sum to the mix) */
function edges(st) { dsp.fade(st, 0, 0.005, 0, 1); dsp.fade(st, SECONDS - 0.3, SECONDS, 1, 0); return st; }
Object.keys(stems).forEach((k) => edges(stems[k]));
let tMaster = Date.now();
/* The master adds some plain gain of its own (what its filters and compressor take away, it gives back).
 * A first pass measures it, so the room tone can be added that much lower and sits at TONE_DB in final.wav.
 * The tone is the kit's, low-passed (12 dB an octave above TONE_LP) and brought back to the level it had. */
const masterGain = mix.master(sumStems(), MASTER).info.gainDb;
const tone = synth.roomTone({ db: TONE_DB, seed: 5 });
dsp.eq(tone, [{ type: 'lp', f: TONE_LP, q: 0.5 }]);
dsp.gain(tone, TONE_DB - masterGain - dsp.rmsDb(tone));
mix.add(stems.fx, edges(tone));
const final = mix.master(sumStems(), MASTER);
log('the master in ' + ((Date.now() - tMaster) / 1000).toFixed(1) + ' s: ' + JSON.stringify({
  inputLufs: +fx2(final.info.inputLufs, 2), gainDb: +fx2(final.info.gainDb, 2),
  compMaxDb: final.info.comp ? +fx2(final.info.comp.maxReductionDb, 2) : 0, compMeanDb: final.info.comp ? +fx2(final.info.comp.meanReductionDb, 2) : 0,
  limiterMaxDb: +fx2(final.info.limiter.maxReductionDb, 2), limitedPercent: +fx2(final.info.limiter.limitedPercent, 3),
  lufs: +fx2(final.info.lufs, 2), truePeakDb: +fx2(final.info.truePeakDb, 2), lra: +fx2(final.info.lra, 1)
}));

/* ================================================================ write */

fs.mkdirSync(path.join(OUT, 'stems'), { recursive: true });
let clipped = wav.write(path.join(OUT, 'final.wav'), final, { bits: 24 });
Object.keys(stems).forEach((k) => { clipped += wav.write(path.join(OUT, 'stems', k + '.wav'), stems[k], { bits: 24 }); });
if (process.env.SCORE_DEBUG) {                                    // each voice as it enters the mix (before its fader), for looking at
  fs.mkdirSync(path.join(OUT, 'debug'), { recursive: true });
  DRUM_VOICES.concat(['bass']).forEach((k) => wav.write(path.join(OUT, 'debug', k + '.wav'), raw[k], { bits: 24 }));
  wav.write(path.join(OUT, 'debug', 'piano.wav'), pianoBus, { bits: 24 });
}

const r5 = (x) => Math.round(x * 1e5) / 1e5;
const arrangement = {
  key: 'D minor', bpm: tl.bpm, swing: SWING, chords: chart.CHORDS,
  notes: bassNotes.map((n) => ({ t: r5(n.t), dur: r5(n.dur), inst: 'bass', midi: n.midi, vel: r5(n.vel), bar: n.bar, beat: n.beat, nominal: r5(n.nominal), flag: n.flag || undefined }))
    .concat(pianoNotes.map((n) => ({ t: r5(n.t), dur: r5(n.dur), inst: 'piano', midi: n.midi, vel: r5(n.vel), bar: n.bar, beat: n.beat, nominal: r5(n.nominal), pass: n.pass || undefined, top: n.top || undefined })))
    .sort((a, b) => a.t - b.t),
  hits: drumHits.map((h) => ({ t: r5(h.t), inst: 'drums', kind: h.kind, vel: r5(h.vel), key: h.key, exact: h.exact || undefined })).concat(thudHits).sort((a, b) => a.t - b.t),
  /* not notes: where the continuous brush bed lies under the struck strokes (seconds), and the level ride of chart.SHAPE */
  beds: bedMade.spans.map(([a, b]) => ({ from: r5(a), to: r5(b), inst: 'drums', kind: 'brush bed (grains of the recorded swirl, ' + BED.under + ' dB under the struck strokes)' })),
  shape: shapePoints.map(([t, d]) => ({ t: r5(t), db: d })),
  sync: [
    { t: SYNC.no1, what: 'HARD: NO 1. A7b9 hit (bass A1, piano, bass drum, brush slap, thud), then stop-time' },
    { t: SYNC.nod, what: 'idea 2 passes COST: the piano\'s two-note nod (A4, B4)' },
    { t: SYNC.no2, what: 'HARD: NO 2. Eb7 hit (bass Eb2, piano, bass drum, brush slap, thud), then stop-time and the held breath' },
    { t: SYNC.pass1, what: 'SOFT: PASS 1. The piano joins: F4 G4 A4' },
    { t: SYNC.pass2, what: 'SOFT: PASS 2. The brushes join; the piano in fourths up to Bb4' },
    { t: SYNC.pass3, what: 'SOFT: PASS 3. The ride joins; the piano in triads up to D5' },
    { t: SYNC.pass4, what: 'SOFT: PASS 4. The hi-hat foot and bass drum join; the piano in four voices up to E5' },
    { t: SYNC.winner, what: 'SOFT: the winner. Dm11 rolled, top F5, left to ring under the text' },
    { t: SYNC.sleeve, what: 'SOFT: the sleeve. Gm9 stab; the top line starts its climb D E F G A' },
    { t: SYNC.slab, what: 'HARD: the slab. Eb9#11 falls to the home chord Dm6/9 (bass D2, piano, bass drum, ride, thud)' },
    { t: SYNC.positive, what: 'SOFT: back to positive. The tag: Em11b5, A7b9, the last chord at 40 s' }
  ]
};
fs.writeFileSync(path.join(OUT, 'arrangement.json'), JSON.stringify(arrangement, null, 1) + '\n');

/* ================================================================ check */

log('');
const result = checks.run({ file: path.join(OUT, 'final.wav'), sync: tl.sync, breath: [20.3, 22], lufs: [-16.5, -15.5], ceilingDb: -2, lra: [5, 12] });
const failures = result.failures.slice();
const rows = [];
function own(name, measured, target, ok) { rows.push([ok ? 'PASS' : 'FAIL', name, measured, target]); if (!ok) { failures.push(name + ': ' + measured + ' (target ' + target + ')'); } }
const dbOf = (st, a, b) => dsp.rmsDb(st, a, b);

own('clipped samples (final and stems)', String(clipped), '0', clipped === 0);
result.numbers.sync.forEach((x) => own('HARD hit lands: ' + x.name, (x.found ? (x.offsetMs >= 0 ? '+' : '') + fx2(x.offsetMs) + ' ms' : 'not found'), 'within 5 ms', x.found && Math.abs(x.offsetMs) <= 5));
// the balance in the full trio (30 to 36 s), stems before the master
const bassDb = dbOf(stems.bass, 30, 36), keysRel = dbOf(stems.keys, 30, 36) - bassDb, drumsRel = dbOf(stems.drums, 30, 36) - bassDb;
own('keys against bass, 30-36 s', fx2(keysRel) + ' dB', '-10 to -3', keysRel >= -10 && keysRel <= -3);
own('drums against bass, 30-36 s', fx2(drumsRel) + ' dB', '-16 to -8', drumsRel >= -16 && drumsRel <= -8);
// stop-time: the band is really out
[['after NO 1', [9.0, 9.9], [6, 8]], ['after NO 2', [18.5, 19.9], [15, 17]]].forEach(([name, out, before]) => {
  ['bass', 'keys', 'drums'].forEach((k) => {
    const drop = dbOf(stems[k], before[0], before[1]) - dbOf(stems[k], out[0], out[1]);
    own(k + ' stem is out ' + name, (Number.isFinite(drop) ? fx2(drop) + ' dB under ' : 'silent; ') + before[0] + '-' + before[1] + ' s', 'at least 30 dB', drop >= 30);
  });
});
// the break: while each door falls (the 300 ms before it lands) the mix is well under the bar before it
[['NO 1', SYNC.no1], ['NO 2', SYNC.no2], ['the slab', SYNC.slab]].forEach(([name, T]) => {
  const drop = dbOf(final, T - 2, T - 0.4) - dbOf(final, T - 0.3, T - 0.01);
  own('the break before ' + name, fx2(drop) + ' dB under the bar before', 'at least 10 dB', drop >= 10);
  // the brushes (the bed with them) stop with the band: the drums stem in the last 250 ms before the hit
  const kit2 = dbOf(stems.drums, T - 2, T - 0.4) - dbOf(stems.drums, T - 0.25, T - 0.01);
  own('the brushes are off before ' + name, fx2(kit2) + ' dB under the bar before (drums stem)', 'at least 20 dB', kit2 >= 20);
});
// the held breath: no brush bed, no band
const breathKit = dbOf(stems.drums, 20.3, 22);
own('no brushes in the held breath (drums stem, 20.3-22 s)', fx2(breathKit) + ' dBFS', 'below -120', breathKit < -120);
// no bass note is held into the frozen loop of its recording (it begins about 1.45 s after the pluck)
const longestBass = Math.max(...bassNotes.map((n) => n.dur));
own('longest bass note', fx2(longestBass, 2) + ' s', 'at most 1.35 s', longestBass <= 1.35);
// small speakers: what is left of the bass above 150 Hz
const hpBass = dsp.butter(dsp.copy(stems.bass), 'hp', 150, 4);
const bassShare = Math.pow(dsp.rms(hpBass) / dsp.rms(stems.bass), 2);
own('bass stem energy above 150 Hz', fx2(100 * bassShare) + ' %', 'at least 25 %', bassShare >= 0.25);
// the first instant, the breath, the mono sum
const head = dbOf(final, 0.01, 0.25);
own('before 0.25 s: room tone only', fx2(head) + ' dBFS', 'below -60', head < -60);
const toneDb = dbOf(final, 20.5, 21.9);
own('room tone in the held breath', fx2(toneDb) + ' dBFS', TONE_DB + ' within 1.5', Math.abs(toneDb - TONE_DB) <= 1.5);
const monoSum = [Float32Array.from(final[0], (v, i) => 0.5 * (v + final[1][i]))];
const monoLoss = dsp.rmsDb(monoSum) - dsp.rmsDb(final);
own('mono fold-down', fx2(monoLoss, 2) + ' dB', 'loses less than 1.5 dB', monoLoss > -1.5);
// the tone of the whole mix, measured as the kit's analysis does
const toneOf = kit.analyze.tone(final);
own('tilt, 200 Hz to 8 kHz', fx2(toneOf.slopeDbPerOct, 2) + ' dB per octave', '-6.5 to -4.5', toneOf.slopeDbPerOct >= -6.5 && toneOf.slopeDbPerOct <= -4.5);
own('energy above 8 kHz', fx2(toneOf.bands.air) + ' dB', 'at most -30', toneOf.bands.air <= -30);
own('the 2 to 5 kHz band', fx2(toneOf.bands.presence) + ' dB', 'at most -14', toneOf.bands.presence <= -14);
// the shape after 32 s: the slab's first half second is the loudest half second (0.5 s steps from 32 s; RMS of the mix)
const halves = []; for (let t = 32; t < 45.9; t += 0.5) { halves.push([t, dbOf(final, t, t + 0.5)]); }
const slabHalf = dbOf(final, SYNC.slab, SYNC.slab + 0.5), rival = halves.filter((h) => Math.abs(h[0] - SYNC.slab) > 1e-6).sort((a, b) => b[1] - a[1])[0];
own('the slab is the loudest half second after 32 s', fx2(slabHalf) + ' dBFS; next ' + fx2(rival[1]) + ' at ' + rival[0] + ' s', 'the loudest', slabHalf > rival[1]);
log('checks: this candidate\'s own');
const w1 = Math.max(...rows.map((r) => r[1].length)), w2 = Math.max(...rows.map((r) => r[2].length));
rows.forEach((r) => log('  ' + r[0] + '  ' + r[1].padEnd(w1) + '  ' + r[2].padEnd(w2) + '  (' + r[3] + ')'));
log('  measured onsets used for the HARD hits (ms): bass ' + bassOn.map((x) => (x * 1000).toFixed(1)).join(', ') + '; piano ' + pianoOn.map((x) => (x * 1000).toFixed(1)).join(', ') +
  '; bass drum ' + (ON.kick * 1000).toFixed(1) + ', brush slaps ' + ON.slap.no1.concat(ON.slap.no2).map((x) => (x * 1000).toFixed(1)).join(', ') + ', ride ' + (ON.ride * 1000).toFixed(1));
log('  bass compressor: up to ' + fx2(bassComp.maxReductionDb) + ' dB, ' + fx2(bassComp.meanReductionDb, 2) + ' dB on average; bass limiter up to ' + fx2(bassLimit.maxReductionDb) + ' dB on ' + fx2(100 * bassLimit.limitedSamples / N, 2) + ' % of samples; piano limiter up to ' + fx2(pianoLimit.maxReductionDb) + ' dB on ' + fx2(100 * (pianoLimit.limitedSamples || 0) / N, 3) + ' % of samples; HARD hit onsets: ' + result.numbers.sync.map((x) => fx2(x.offsetMs) + ' ms').join(', '));
log('  third-octave levels 200 Hz..8 kHz: ' + toneOf.thirdOctave.db.map((v) => v.toFixed(1)).join(' ') + '; bands: ' + Object.keys(toneOf.bands).map((k) => k + ' ' + toneOf.bands[k].toFixed(1)).join(', '));
log('  brush limiters: swirl up to ' + fx2(brushLimit.swirl.maxReductionDb) + ' dB, taps up to ' + fx2(brushLimit.tap.maxReductionDb) + ' dB; the brush bed (dB re the swirl bus, the level it sits at): ' + bedMade.report.join('; '));
log('  where each time-keeping voice sat before it was centred (ms): ' + Object.keys(leanMeans).map((v) => v + ' ' + fx2(leanMeans[v] * 1000, 2)).join(', '));
log('  gain to the loudness: the band ' + fx2(BAND_GAIN, 2) + ' dB, the hits ' + fx2(HIT_GAIN, 2) + ' dB (the first mix\'s)');
log('  drum voices in the mix, peak / RMS 30-36 s (dBFS): ' + DRUM_VOICES.map((k) => { const gn = HIT_VOICES.indexOf(k) >= 0 ? HIT_GAIN : BAND_GAIN; return k + ' ' + fx2(dsp.db(dsp.peak(raw[k])) + FADER[k].db + gn) + ' / ' + fx2(dsp.rmsDb(raw[k], 30, 36) + FADER[k].db + gn); }).join(', '));
log('  stem peaks (dBFS): ' + Object.keys(stems).map((k) => k + ' ' + fx2(dsp.db(dsp.peak(stems[k])))).join(', ') + '; thud peaks at 8, 17, 37 s: ' +
  [SYNC.no1, SYNC.no2, SYNC.slab].map((T) => fx2(dsp.db(dsp.peak(stems.fx, T, T + 0.3)))).join(', ') + '; bass peaks there: ' + [SYNC.no1, SYNC.no2, SYNC.slab].map((T) => fx2(dsp.db(dsp.peak(stems.bass, T, T + 0.3)))).join(', ') +
  '; bass loudest walking note ' + fx2(dsp.db(dsp.peak(stems.bass, 22, 36))));
log('  stems 30-36 s (dBFS RMS): bass ' + fx2(bassDb) + ', keys ' + fx2(dbOf(stems.keys, 30, 36)) + ', drums ' + fx2(dbOf(stems.drums, 30, 36)) + ', fx ' + fx2(dbOf(stems.fx, 30, 36)));
log('  half seconds from 32 s (dBFS RMS): ' + halves.slice(0, 18).map((h) => fx2(h[1])).join(' '));

/* The kit's analysis of the files just written: every target of BRIEF.md section 4.3, and the pictures. */
log('');
const analysis = kit.analyze.run(path.join(OUT, 'final.wav'), { outDir: path.join(OUT, 'analysis'), stemsDir: path.join(OUT, 'stems'), ref: fs.existsSync(path.join(kit.const.LAB, 'ref', 'old.wav')) ? path.join(kit.const.LAB, 'ref', 'old.wav') : undefined, pictures: !process.env.SCORE_FAST });
analysis.targets.filter((t) => t.pass === false).forEach((t) => failures.push('analysis: ' + t.name + ': ' + t.measured + ' (wanted ' + t.wanted + ')'));
log('  built in ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');
if (failures.length) { console.error('\nFAILED:\n  - ' + failures.join('\n  - ')); process.exit(1); }
log('\nAll checks passed.');
