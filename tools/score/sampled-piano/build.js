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
 *                  ride 51, pedal hi-hat 44, bass drum 36)
 * The only synthesized sounds are the kit's own: the three low NO thuds
 * (synth.thud) and the room tone (synth.roomTone).
 *
 * The chart (chords, bass line, piano events, drum part) is in chart.js, as
 * data. This file performs it (seeded humanising), renders one sampler pass
 * per voice, mixes four stems through the kit's small-club room, masters, runs
 * the self-checks and writes the files of the contract (BRIEF.md section 5):
 *   final.wav, stems/{bass,keys,drums,fx}.wav, arrangement.json
 * Every picture time comes from the kit's timeline (video/score.js).
 * Deterministic: the same files every run. Exit 0 only if every check passes.
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
const T0 = Date.now();
function log(msg) { console.log(msg); }
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function fx2(x, d) { return Number.isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : String(x); }

/* ================================================================ presets */

const BASS = { font: 'musescore', bank: 0, program: 32 };      // sounds at pitch: MIDI 38 = D2 = 73.4 Hz (audition: C2 = 65.37 Hz)
const PIANO = { font: 'musescore', bank: 8, program: 0 };      // the darkest piano of the audition
const DRUMS = { font: 'fluidr3', bank: 128, program: 40 };     // the Brush kit, stereo recordings
const KEY = { tap: 38, tap2: 39, swirl: 40, ride: 51, hat: 44, kick: 36 };

/* ================================================================ picture times (never typed in) */

const SWING = chart.SWING;
const at = (bar, beat) => tl.at(bar, beat, { swing: SWING });
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

/* ---- bass ---------------------------------------------------------------
 * The preset's sample zones are not equally loud (audition, vel 0.6, K-weighted:
 * F#2..Bb2 3.8 dB under C#2..F2, and so on). A player evens that out with the
 * right hand; here the velocity does (40 log10 of velocity is the level). */
function bassZoneDb(m) { return m <= 29 ? 0 : m <= 36 ? 2.4 : m <= 41 ? 0 : m <= 46 ? 3.8 : m <= 54 ? 2.2 : 0.9; }
const BASS_BASE = 0.70;
const bassPlan = [];
Object.keys(chart.BASS).map(Number).sort((a, b) => a - b).forEach((bar) => {
  chart.BASS[bar].forEach(([beat, midi, len, accent, flag]) => {
    bassPlan.push({ bar, beat, midi, len, accent, flag: flag || '', t0: at(bar, beat) });
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
    t = n.t0 + clamp(0.008 + 0.002 * g(rBass), 0.004, 0.012);  // 4 to 12 ms behind the beat
    vel = n.flag === 'ghost' ? n.accent * (1 + 0.05 * g(rBass)) : BASS_BASE * n.accent * (1 + 0.035 * g(rBass));
    vel = clamp(vel * Math.pow(10, bassZoneDb(n.midi) / 40), 0.2, 0.97);
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
  bassNotes.push({ t, dur, midi: n.midi, vel, bar: n.bar, beat: n.beat, flag: n.flag, nominal: n.t0 });
});

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
 *   swirl  the brush circling on the snare       tap    the brush taps
 *   rideA  the ride on the beat                  rideB  the ride's skip notes
 *   hat    the hi-hat foot                       kick   the feathered bass drum
 *   hit    the bass drum and brush slap of a HARD hit (never choked, never humanised)
 *   slabRide  the one ride note on the slab, left to ring */
const drumHits = [];
const lastVel = {};
function drum(pass, kind, key, t, vel, exact) {
  let v = clamp(Math.round(clamp(vel, 0.02, 1) * 127), 3, 127);
  const id = pass + ':' + key;
  if (lastVel[id] === v) { v += (v > 64 ? -2 : 2); }           // never the identical velocity twice running
  lastVel[id] = v;
  drumHits.push({ t, key, vel: v / 127, pass, kind, exact: !!exact });
}
const drumOn = measureOnsets(DRUMS, [{ midi: KEY.kick, vel: 0.85 }, { midi: KEY.tap, vel: 0.78 }, { midi: KEY.tap2, vel: 0.66 }, { midi: KEY.ride, vel: 0.6 }]);
const ON = { kick: drumOn[0], tap: drumOn[1], tap2: drumOn[2], ride: drumOn[3] };
let tapCount = 0;
Object.keys(chart.DRUMS).map(Number).sort((a, b) => a - b).forEach((bar) => {
  const d = chart.DRUMS[bar];
  if (d.swirl && !d.roll) {
    const [from, to, level] = d.swirl;
    for (let b = from; b < to; b++) {
      // the left hand circles: a longer sweep on the beat, a shorter one back on the swung "and"
      drum('swirl', 'swirl', KEY.swirl, at(bar, b) - 0.005 + 0.003 * g(rDrums), level * (b % 2 === 1 ? 0.62 : 0.54) * (1 + 0.06 * g(rDrums)));
      if (b + 0.5 < to) { drum('swirl', 'swirl', KEY.swirl, at(bar, b + 0.5) - 0.005 + 0.003 * g(rDrums), level * 0.36 * (1 + 0.08 * g(rDrums))); }
    }
  }
  if (d.roll) {
    // a swell of brush strokes in eighth-note triplets through two beats; the last one 167 ms before the hit
    const [from, to] = d.roll, level = d.swirl ? d.swirl[2] : 1;
    const count = Math.round((to - from) * 3);
    for (let k = 0; k < count; k++) {
      const t = at(bar, from) + k * tl.beat / 3 + 0.002 * g(rDrums);
      const rise = 0.22 + 0.34 * (k / (count - 1));
      drum('swirl', 'roll stroke', KEY.swirl, t - 0.004, level * rise * (1 + 0.05 * g(rDrums)));
      if (k >= 1) { drum('tap', 'roll tap', k % 2 ? KEY.tap : KEY.tap2, t + 0.001, level * (0.10 + 0.20 * (k / (count - 1))) * (1 + 0.06 * g(rDrums))); }
    }
  }
  (d.taps || []).forEach(([beat, level]) => {
    const key = (tapCount++ % 2) ? KEY.tap2 : KEY.tap;          // two brush strokes in turn: no machine-gun
    drum('tap', 'brush tap', key, at(bar, beat) + clamp(0.003 * g(rDrums), -0.006, 0.006), level * (1 + 0.07 * g(rDrums)));
  });
  (d.ride || []).forEach(([beat, level]) => {
    const skip = Math.abs(beat - Math.round(beat)) > 1e-6;
    drum(skip ? 'rideB' : 'rideA', 'ride', KEY.ride, at(bar, beat) - clamp(0.003 + 0.0015 * g(rDrums), 0, 0.006), level * (1 + 0.06 * g(rDrums)));   // 0 to 6 ms ahead
  });
  (d.hat || []).forEach(([beat, level]) => { drum('hat', 'hi-hat foot', KEY.hat, at(bar, beat) + clamp(0.002 * g(rDrums), -0.004, 0.004), level * (1 + 0.06 * g(rDrums))); });
  (d.kick || []).forEach(([beat, level]) => { drum('kick', 'bass drum', KEY.kick, at(bar, beat) + clamp(0.0025 * g(rDrums), -0.005, 0.005), level * (1 + 0.06 * g(rDrums))); });
  if (d.hit) {
    const T = SYNC[d.hit];
    if (d.hit === 'slab') {
      drum('hit', 'bass drum (slab)', KEY.kick, T - ON.kick - HIT_LEAD, 0.85, true);
      drum('slabRide', 'ride (slab, left to ring)', KEY.ride, T - ON.ride - HIT_LEAD, 0.60, true);
    } else {
      drum('hit', 'bass drum (NO)', KEY.kick, T - ON.kick - HIT_LEAD, 0.85, true);
      drum('hit', 'brush slap (NO)', KEY.tap, T - ON.tap - HIT_LEAD, 0.78, true);
      drum('hit', 'brush slap (NO)', KEY.tap2, T - ON.tap2 - HIT_LEAD, 0.66, true);
    }
  }
});
drumHits.sort((a, b) => a.t - b.t);

/* ================================================================ render */

function render(preset, notes) {
  return sampler.render(Object.assign({}, preset, { seconds: SECONDS, notes: notes.map((n) => ({ t: n.t, dur: n.dur, midi: n.midi, vel: n.vel })) }));
}
function renderDrums(pass) {
  return sampler.render(Object.assign({}, DRUMS, { seconds: SECONDS, notes: drumHits.filter((h) => h.pass === pass).map((h) => ({ t: h.t, dur: 0.1, midi: h.key, vel: h.vel })) }));
}
const raw = {
  bass: render(BASS, bassNotes),
  piano: render(PIANO, pianoNotes.filter((n) => !WEAK_KEYS.has(n.midi))),
  pianoWeak: render(PIANO, pianoNotes.filter((n) => WEAK_KEYS.has(n.midi))),
  swirl: renderDrums('swirl'), tap: renderDrums('tap'), rideA: renderDrums('rideA'), rideB: renderDrums('rideB'),
  hat: renderDrums('hat'), kick: renderDrums('kick'), hit: renderDrums('hit'), slabRide: renderDrums('slabRide')
};
log('rendered ' + Object.keys(raw).length + ' sampler passes (' + bassNotes.length + ' bass notes, ' + pianoNotes.length + ' piano notes, ' + drumHits.length + ' drum hits) in ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');

/* ================================================================ the mix */

/* Narrow a stereo recording: keep the middle, scale the side. */
function narrow(st, w) {
  const L = st[0], R = st[1];
  for (let i = 0; i < L.length; i++) { const m = 0.5 * (L[i] + R[i]), s = 0.5 * (L[i] - R[i]) * w; L[i] = m + s; R[i] = m - s; }
  return st;
}
/* The break and the stop-time: the drummer's hand is on the cymbal 70 ms after the door lets go, and stays there
 * (the bass drum and brush slap of the hit itself are another pass and are not choked). */
const DROP = { no1: tl.score.ideas[0].gates[0].drop, no2: tl.score.ideas[1].gates[1].drop, slab: tl.score.title.drop };   // the doors let go here, 0.375 s before they land
function choke(st) {
  [[DROP.no1, 9.95], [DROP.no2, 21.9]].forEach(([a, b]) => { dsp.fade(st, a, a + 0.07, 1, 0); dsp.fade(st, a + 0.07, b, 0, 0); });
  return st;
}

/* BASS: centre, almost dry. The samples are nearly all fundamental and second
 * harmonic (probe: third harmonic 19 dB down), so on a small speaker the low
 * notes would vanish: gentle harmonics (dsp.saturate), less shelf under 100 Hz,
 * a wide lift around 230 Hz and a little finger at 800 Hz. */
dsp.saturate(raw.bass, 0.55, { ref: dsp.peak(raw.bass) * 0.5 });
dsp.eq(raw.bass, [
  { type: 'hp', f: 36, q: 0.7071 },
  { type: 'lowshelf', f: 105, db: -5.5 },
  { type: 'peak', f: 230, q: 0.8, db: 2 },
  { type: 'peak', f: 900, q: 0.7, db: 5 },
  { type: 'lp', f: 4500, q: 0.6 }
]);
/* A plucked note blooms 80 ms after it starts and its peak stands 14 dB over the line's RMS: left alone, every
 * bass note would lean on the master's limiter and pull the piano and brushes down with it. The bass gets its own
 * gentle compressor instead (the kit's, 3:1 above the line's own level), so the master is left with almost nothing to do. */
const bassComp = mix.compress(raw.bass, { threshold: dsp.rmsDb(raw.bass, 22, 36) + 1, ratio: 3, knee: 6, attack: 0.006, release: 0.14 });
/* ... and the kit's look-ahead limiter to itself, 10.5 dB over the line's RMS, for the few notes that still stand out. */
const bassLimit = mix.limitPass(raw.bass, dsp.lin(dsp.rmsDb(raw.bass, 22, 36) + 10.5), 0.005, 0.08);

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
  { type: 'peak', f: 280, q: 1.0, db: -1.5 },
  { type: 'highshelf', f: 1000, q: 0.6, db: 4.5 }       // the preset is very dark (audition: centroid about 600 Hz); this keeps the whole mix's tilt inside the brief
]);

/* DRUMS: quiet and dark. The brush samples have most of their energy at 2 to
 * 5 kHz and the cymbals above 5 kHz (audition), which is exactly what the
 * first soundtrack was faulted for, so each voice is low-passed and the brush
 * gets a dip at 3.2 kHz. */
dsp.eq(raw.swirl, [{ type: 'hp', f: 200, q: 0.7071 }, { type: 'lp', f: 6000, q: 0.6 }, { type: 'lp', f: 9500, q: 0.7071 }]);
dsp.eq(raw.tap, [{ type: 'hp', f: 170, q: 0.7071 }, { type: 'peak', f: 3200, q: 0.9, db: -1.5 }, { type: 'lp', f: 5500, q: 0.6 }, { type: 'lp', f: 9000, q: 0.7071 }]);
dsp.eq(raw.hit, [{ type: 'peak', f: 3200, q: 0.9, db: -4 }, { type: 'lp', f: 5500, q: 0.6 }, { type: 'lp', f: 9000, q: 0.7071 }]);
/* The ride sample has one partial near 3.4 kHz that stands well over its neighbours (seen as a steady line in the
 * spectrogram, the same in every hit because it is the same recording): a narrow dip takes 4 dB off it. */
const RIDE_EQ = [{ type: 'hp', f: 320, q: 0.7071 }, { type: 'peak', f: 3400, q: 2.5, db: -4 }, { type: 'lp', f: 6500, q: 0.6 }, { type: 'lp', f: 9000, q: 0.7071 }];
dsp.eq(raw.rideA, RIDE_EQ);
dsp.eq(raw.slabRide, RIDE_EQ);
dsp.eq(raw.rideB, [{ type: 'hp', f: 320, q: 0.7071 }, { type: 'peak', f: 3400, q: 2.5, db: -4 }, { type: 'peak', f: 4200, q: 0.8, db: -1 }, { type: 'lp', f: 5600, q: 0.6 }, { type: 'lp', f: 8000, q: 0.7071 }]);   // a lighter stroke: darker
dsp.eq(raw.hat, [{ type: 'hp', f: 400, q: 0.7071 }, { type: 'lp', f: 5200, q: 0.6 }, { type: 'lp', f: 7500, q: 0.7071 }]);
dsp.eq(raw.kick, [{ type: 'hp', f: 40, q: 0.7071 }, { type: 'lp', f: 450, q: 0.6 }]);
/* The brush samples start with a spike 25 to 30 dB over their own RMS. Left alone those spikes, not the music, would set
 * how hard the master's limiter works. Each brush pass gets the kit's look-ahead limiter to itself (2 ms ahead, 40 ms
 * release), which takes the tip off the spike and touches nothing else. */
const brushLimit = {
  swirl: mix.limitPass(raw.swirl, dsp.lin(dsp.rmsDb(raw.swirl, 30, 36) + 17), 0.002, 0.04),
  tap: mix.limitPass(raw.tap, dsp.peak(raw.tap, 22, 36) * dsp.lin(-5), 0.002, 0.04)
};
['swirl', 'tap', 'rideA', 'rideB', 'hat', 'kick'].forEach((k) => choke(raw[k]));

/* The faders (dB on the raw renders), the stage (pan) and the room sends (dB under the dry sound). */
const FADER = {
  bass: { db: 0, pan: 0, send: -27 },
  piano: { db: -5.2, pan: -0.25, send: -13 },
  swirl: { db: 11.5, pan: 0.24, send: -13 },
  tap: { db: 6, pan: 0.20, send: -13 },
  rideA: { db: -0.5, pan: 0.30, send: -15 },
  rideB: { db: -1.0, pan: 0.30, send: -15 },
  hat: { db: 2, pan: 0.18, send: -15 },
  kick: { db: -1, pan: 0.06, send: -24 },
  hit: { db: -16, pan: 0.12, send: -13 },
  slabRide: { db: -3, pan: 0.30, send: -14 },
  thud: { db: -16.5, pan: 0, send: -17 }
};
const ROOM = { decay: 0.75, damp: 0.6, predelay: 0.012, seed: 3 };      // a small club, dark

const stems = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo() };
const sends = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo() };
function place(stem, src, f, when) {
  mix.add(stems[stem], src, { db: f.db, pan: f.pan, at: when || 0 });
  mix.add(sends[stem], src, { db: f.db + f.send, pan: f.pan, at: when || 0 });
}
place('bass', raw.bass, FADER.bass);
place('keys', pianoBus, FADER.piano);
['swirl', 'tap', 'rideA', 'rideB', 'hat', 'kick', 'hit', 'slabRide'].forEach((k) => place('drums', raw[k], FADER[k]));

/* The NO thuds: the kit's pitched low drum, placed on the frame. */
const THUD_LEAD = HIT_LEAD;                                      // the thud's own attack is a 2.5 ms rise
const thudHits = [];
[['no1', SYNC.no1], ['no2', SYNC.no2], ['slab', SYNC.slab]].forEach(([name, T]) => {
  const o = chart.THUDS[name];
  place('fx', synth.thud({ hz: o.hz, size: o.size, rattle: o.rattle, body: o.body, seed: o.seed }), FADER.thud, T - THUD_LEAD);
  thudHits.push({ t: T, inst: 'fx', kind: 'thud ' + o.hz + ' Hz (' + name + ')', vel: o.size });
});

let tRoom = Date.now();
Object.keys(stems).forEach((name) => { mix.add(stems[name], mix.room(sends[name], ROOM)); });
log('the room (4 stems) in ' + ((Date.now() - tRoom) / 1000).toFixed(1) + ' s');

/* Level: bring the whole mix to the target loudness before the master, so the
 * stems sit at their final level and the room tone can be set in real dBFS. */
const TARGET_LUFS = -16;
const TONE_DB = -68;
const MASTER = { hp: 30, shelf: false, comp: { threshold: -16, ratio: 1.6 }, lufs: TARGET_LUFS, ceilingDb: -2 };   // no shelf: every voice is already low-passed, and the mix must not end up darker than the brief's tilt
function sumStems() { const s = dsp.stereo(); Object.keys(stems).forEach((k) => mix.add(s, stems[k])); return s; }
const preLufs = mix.lufs(sumStems());
Object.keys(stems).forEach((k) => dsp.gain(stems[k], TARGET_LUFS - preLufs));
/* the edges: 5 ms in, and the 300 ms safety fade at the very end (on every stem, so the stems still sum to the mix) */
function edges(st) { dsp.fade(st, 0, 0.005, 0, 1); dsp.fade(st, SECONDS - 0.3, SECONDS, 1, 0); return st; }
Object.keys(stems).forEach((k) => edges(stems[k]));
let tMaster = Date.now();
/* The master adds some plain gain of its own (what its filters and compressor take away, it gives back).
 * A first pass measures it, so the room tone can be added that much lower and sits at TONE_DB in final.wav. */
const masterGain = mix.master(sumStems(), MASTER).info.gainDb;
mix.add(stems.fx, edges(synth.roomTone({ db: TONE_DB - masterGain, seed: 5 })));
const final = mix.master(sumStems(), MASTER);
log('the master in ' + ((Date.now() - tMaster) / 1000).toFixed(1) + ' s: ' + JSON.stringify({
  inputLufs: +fx2(final.info.inputLufs, 2), gainDb: +fx2(final.info.gainDb, 2),
  compMaxDb: final.info.comp ? +fx2(final.info.comp.maxReductionDb, 2) : 0, compMeanDb: final.info.comp ? +fx2(final.info.comp.meanReductionDb, 2) : 0,
  limiterMaxDb: +fx2(final.info.limiter.maxReductionDb, 2), limitedPercent: +fx2(final.info.limiter.limitedPercent, 3),
  lufs: +fx2(final.info.lufs, 2), truePeakDb: +fx2(final.info.truePeakDb, 2), lra: +fx2(final.info.lra, 1)
}));

/* ================================================================ write */

fs.mkdirSync(path.join(HERE, 'stems'), { recursive: true });
let clipped = wav.write(path.join(HERE, 'final.wav'), final, { bits: 24 });
Object.keys(stems).forEach((k) => { clipped += wav.write(path.join(HERE, 'stems', k + '.wav'), stems[k], { bits: 24 }); });

const r5 = (x) => Math.round(x * 1e5) / 1e5;
const arrangement = {
  key: 'D minor', bpm: tl.bpm, swing: SWING, chords: chart.CHORDS,
  notes: bassNotes.map((n) => ({ t: r5(n.t), dur: r5(n.dur), inst: 'bass', midi: n.midi, vel: r5(n.vel), bar: n.bar, beat: n.beat, nominal: r5(n.nominal), flag: n.flag || undefined }))
    .concat(pianoNotes.map((n) => ({ t: r5(n.t), dur: r5(n.dur), inst: 'piano', midi: n.midi, vel: r5(n.vel), bar: n.bar, beat: n.beat, nominal: r5(n.nominal), pass: n.pass || undefined, top: n.top || undefined })))
    .sort((a, b) => a.t - b.t),
  hits: drumHits.map((h) => ({ t: r5(h.t), inst: 'drums', kind: h.kind, vel: r5(h.vel), key: h.key, exact: h.exact || undefined })).concat(thudHits).sort((a, b) => a.t - b.t),
  sync: [
    { t: SYNC.no1, what: 'HARD: NO 1. A7b9 hit (bass A1, piano, bass drum, brush slap, thud), then stop-time' },
    { t: SYNC.nod, what: 'idea 2 passes COST: the piano\'s two-note nod (A4, B4)' },
    { t: SYNC.no2, what: 'HARD: NO 2. Eb7 hit (bass Eb2, piano, bass drum, brush slap, thud), then stop-time and the held breath' },
    { t: SYNC.pass1, what: 'SOFT: PASS 1. The piano joins: F4 G4 A4' },
    { t: SYNC.pass2, what: 'SOFT: PASS 2. The brushes join; the piano in fourths up to Bb4' },
    { t: SYNC.pass3, what: 'SOFT: PASS 3. The ride joins; the piano in triads up to D5' },
    { t: SYNC.pass4, what: 'SOFT: PASS 4. The hi-hat foot and bass drum join; the piano in four voices up to E5' },
    { t: SYNC.winner, what: 'SOFT: the winner. Dm9 rolled, top F5, left to ring under the text' },
    { t: SYNC.sleeve, what: 'SOFT: the sleeve. Gm9 stab; the top line starts its climb D E F G A' },
    { t: SYNC.slab, what: 'HARD: the slab. Eb9#11 falls to the home chord Dm6/9 (bass D2, piano, bass drum, ride, thud)' },
    { t: SYNC.positive, what: 'SOFT: back to positive. The tag: Em11b5, A7b9, the last chord at 40 s' }
  ]
};
fs.writeFileSync(path.join(HERE, 'arrangement.json'), JSON.stringify(arrangement, null, 1) + '\n');

/* ================================================================ check */

log('');
const result = checks.run({ file: path.join(HERE, 'final.wav'), sync: tl.sync, breath: [20.3, 22], lufs: [-16.5, -15.5], ceilingDb: -2, lra: [5, 12] });
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
});
// small speakers: what is left of the bass above 150 Hz
const hpBass = dsp.butter(dsp.copy(stems.bass), 'hp', 150, 4);
const bassShare = Math.pow(dsp.rms(hpBass) / dsp.rms(stems.bass), 2);
own('bass stem energy above 150 Hz', fx2(100 * bassShare) + ' %', 'at least 25 %', bassShare >= 0.25);
// the first instant, the breath, the mono sum
const head = dbOf(final, 0.01, 0.25);
own('before 0.25 s: room tone only', fx2(head) + ' dBFS', 'below -60', head < -60);
const tone = dbOf(final, 20.5, 21.9);
own('room tone in the held breath', fx2(tone) + ' dBFS', TONE_DB + ' within 1.5', Math.abs(tone - TONE_DB) <= 1.5);
const monoSum = [Float32Array.from(final[0], (v, i) => 0.5 * (v + final[1][i]))];
const monoLoss = dsp.rmsDb(monoSum) - dsp.rmsDb(final);
own('mono fold-down', fx2(monoLoss, 2) + ' dB', 'loses less than 1.5 dB', monoLoss > -1.5);
// the tone of the whole mix, measured as the kit's analysis does
const toneOf = kit.analyze.tone(final);
own('tilt, 200 Hz to 8 kHz', fx2(toneOf.slopeDbPerOct, 2) + ' dB per octave', '-6.5 to -4.5', toneOf.slopeDbPerOct >= -6.5 && toneOf.slopeDbPerOct <= -4.5);
own('energy above 8 kHz', fx2(toneOf.bands.air) + ' dB', 'at most -30', toneOf.bands.air <= -30);
own('the 2 to 5 kHz band', fx2(toneOf.bands.presence) + ' dB', 'at most -14', toneOf.bands.presence <= -14);
log('checks: this candidate\'s own');
const w1 = Math.max(...rows.map((r) => r[1].length)), w2 = Math.max(...rows.map((r) => r[2].length));
rows.forEach((r) => log('  ' + r[0] + '  ' + r[1].padEnd(w1) + '  ' + r[2].padEnd(w2) + '  (' + r[3] + ')'));
log('  measured onsets used for the HARD hits (ms): bass ' + bassOn.map((x) => (x * 1000).toFixed(1)).join(', ') + '; piano ' + pianoOn.map((x) => (x * 1000).toFixed(1)).join(', ') +
  '; bass drum ' + (ON.kick * 1000).toFixed(1) + ', brush ' + (ON.tap * 1000).toFixed(1) + ' and ' + (ON.tap2 * 1000).toFixed(1) + ', ride ' + (ON.ride * 1000).toFixed(1));
log('  bass compressor: up to ' + fx2(bassComp.maxReductionDb) + ' dB, ' + fx2(bassComp.meanReductionDb, 2) + ' dB on average; bass limiter up to ' + fx2(bassLimit.maxReductionDb) + ' dB on ' + fx2(100 * bassLimit.limitedSamples / N, 2) + ' % of samples; HARD hit onsets: ' + result.numbers.sync.map((x) => fx2(x.offsetMs) + ' ms').join(', '));
log('  third-octave levels 200 Hz..8 kHz: ' + toneOf.thirdOctave.db.map((v) => v.toFixed(1)).join(' ') + '; bands: ' + Object.keys(toneOf.bands).map((k) => k + ' ' + toneOf.bands[k].toFixed(1)).join(', '));
log('  brush limiters: swirl up to ' + fx2(brushLimit.swirl.maxReductionDb) + ' dB, taps up to ' + fx2(brushLimit.tap.maxReductionDb) + ' dB');
log('  drum voices in the mix, peak / RMS 30-36 s (dBFS): ' + ['swirl', 'tap', 'rideA', 'rideB', 'hat', 'kick', 'hit', 'slabRide'].map((k) => k + ' ' + fx2(dsp.db(dsp.peak(raw[k])) + FADER[k].db + TARGET_LUFS - preLufs) + ' / ' + fx2(dsp.rmsDb(raw[k], 30, 36) + FADER[k].db + TARGET_LUFS - preLufs)).join(', '));
log('  stem peaks (dBFS): ' + Object.keys(stems).map((k) => k + ' ' + fx2(dsp.db(dsp.peak(stems[k])))).join(', ') + '; thud peaks at 8, 17, 37 s: ' +
  [SYNC.no1, SYNC.no2, SYNC.slab].map((T) => fx2(dsp.db(dsp.peak(stems.fx, T, T + 0.3)))).join(', ') + '; bass peaks there: ' + [SYNC.no1, SYNC.no2, SYNC.slab].map((T) => fx2(dsp.db(dsp.peak(stems.bass, T, T + 0.3)))).join(', ') +
  '; bass loudest walking note ' + fx2(dsp.db(dsp.peak(stems.bass, 22, 36))));
log('  stems 30-36 s (dBFS RMS): bass ' + fx2(bassDb) + ', keys ' + fx2(dbOf(stems.keys, 30, 36)) + ', drums ' + fx2(dbOf(stems.drums, 30, 36)) + ', fx ' + fx2(dbOf(stems.fx, 30, 36)));
log('  built in ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');
if (failures.length) { console.error('\nFAILED:\n  - ' + failures.join('\n  - ')); process.exit(1); }
log('\nAll checks passed.');
