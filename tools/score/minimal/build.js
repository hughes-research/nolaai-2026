#!/usr/bin/env node
/*
 * tools/score/minimal/build.js: the "minimal" candidate, from nothing to final.wav.
 *
 *   node tools/score/minimal/build.js
 *
 * Reads the composition from chart.js, performs it (seeded, so every build is
 * the same), renders recorded instruments through the kit's sampler, mixes,
 * masters, writes the files of BRIEF.md section 5 and exits 0 only if the
 * kit's self-checks and this candidate's own chart checks pass.
 *
 * Two instruments carry the film: an upright bass and a pair of brushes.
 * The piano plays eight times: it only ever says PASS.
 *
 * Revised after the three judges (see the report, "Revision"): a new gate motif, the winner's chord, a title
 * line of its own, a continuous stir under the brush strokes, every stroke a little different, accents with
 * a pattern, a second recording for repeated bass pitches, a break before each hit, a darker top.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const kit = require('../lib');
const chart = require('./chart.js');
const checkChart = require('./check-chart.js');

const { SR, N } = kit.const;
const dsp = kit.dsp, mix = kit.mix, synth = kit.synth, sampler = kit.sampler, wav = kit.wav;
const HERE = __dirname;
const STARTED = Date.now();
function log(s) { console.log('[' + ((Date.now() - STARTED) / 1000).toFixed(1).padStart(5) + ' s] ' + s); }
function need(cond, msg) { if (!cond) { throw new Error('minimal/build: ' + msg); } }
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

const SEED = 20261113;
const tl = kit.timeline.load();
const BEAT = tl.beat;

/* ------------------------------------------------------------------ the instruments (chosen from lib/audition; see the report) */
const INST = {
  bass: { font: 'musescore', bank: 0, program: 32, name: 'MuseScore General 000-032 Acoustic Bass', octave: 0 },   // key 31 sounds G1 (49.0 Hz): written pitch
  keys: { font: 'musescore', bank: 8, program: 0, name: 'MuseScore General 008-000 Mellow Grand Piano', octave: 0 },
  drums: { font: 'musescore', bank: 128, program: 40, name: 'MuseScore General 128-040 Brush kit' }
};
/* Brush kit keys: 40 is the brush swirl, 38 and 39 two different brush taps, 44 the hi-hat closed with the foot, 36 the bass drum, 51 the ride. */
const DRUM_KEY = { swirl: 40, tapA: 38, tapB: 39, hat: 44, kick: 36, ride: 51, slap: 39, slap2: 38, drag: 40 };
/* The three doors let go here and land 0.375 s later: the band is out in between (video/score.js has the times). */
const DROPS = [
  { name: 'NO 1', drop: tl.score.ideas[0].gates[0].drop, hit: tl.hard.no1, back: 9.9 },
  { name: 'NO 2', drop: tl.score.ideas[1].gates[1].drop, hit: tl.hard.no2, back: 21.9 },
  { name: 'the slab', drop: tl.score.title.drop, hit: tl.hard.slab, back: 37.9 }
];

/* ------------------------------------------------------------------ the mix, in one place */
const MIX = {
  bass: {
    pan: 0, send: -24,
    harmonics: { inLp: 120, drive: 3.2, bias: 0.22, lo: 150, hi: 1000, db: 0 },
    /* the middle of the mix (800 to 1600 Hz) is filled from the bass, not from the cymbals: +4.5 dB at 800 Hz (was +3) */
    eq: [{ type: 'lowshelf', f: 90, db: -6.5 }, { type: 'peak', f: 400, q: 0.8, db: -1.5 }, { type: 'peak', f: 800, q: 0.8, db: 4.5 }, { type: 'peak', f: 1600, q: 0.9, db: 4 }, { type: 'lp', f: 5000, q: 0.7071 }]
  },
  keys: {
    /* One place on the stage for every note: the recording is folded to mono before it is panned, and the room's answer
     * (whose left and right differ, more at some pitches than others: the F5 sat 2.5 dB further right than the G4) is
     * lower (-14 dB, was -11) and half as wide. */
    pan: -0.3, send: -14, width: 0, roomWidth: 0.5, underBass: 8,            // RMS under the bass while the four PASS notes play
    chordUnderBass: { winner: 6, slab: 2.6, last: 5 },         // and the three chords, each against the bass in its own window
    eq: [{ type: 'hp', f: 140, q: 0.7071 }, { type: 'peak', f: 3000, q: 1.1, db: -3 }, { type: 'lp', f: 6000, q: 0.7071 }]
  },
  drums: {
    underBass: 12.5,                                         // RMS under the bass, 30 to 36.5 s (it was 10.5: the stir fills the holes, so the same kit measures more)
    peakUnderBass: 0,                                        // no stroke may stand higher than the bass's own peaks (a brush tap is all peak)
    touch: { swirl: 0.12, tap: -0.13, skip: -0.09, hat: 0.08, ride: -0.04, kick: 0 },   // more stir than tap: the brushes' level comes from the swirl, not from spikes
    brush: { db: -4, pan: 0.24, send: -9, eq: [{ type: 'hp', f: 170, q: 0.7071 }, { type: 'peak', f: 3600, q: 1, db: -4 }, { type: 'lp', f: 9000, q: 0.7071 }] },
    /* The ride recording has three steady partials (judge: 3512.7 Hz stood 20.8 dB over its third octave in 85 percent
     * of the frames from 30 to 36 s; also 6334 and 7497 Hz): a narrow notch on each. Both low-passes are about 1 kHz lower. */
    cym: {
      db: -4.5, pan: 0.34, send: -12,
      eq: [{ type: 'hp', f: 450, q: 0.7071 }, { type: 'peak', f: 3505, q: 8, db: -10 }, { type: 'peak', f: 6334, q: 8, db: -5 }, { type: 'peak', f: 7497, q: 8, db: -5 },
        { type: 'peak', f: 2680, q: 5, db: -5 },            // and the pair that stood next once those were down: 2643 and 2710 Hz, 9.7 dB over their third octave, in 91 percent of the frames
        { type: 'lp', f: 5600, q: 0.7071 }, { type: 'lp', f: 9000, q: 0.7071 }]
    },
    kick: { db: -9, hitDb: -8, pan: 0.08, send: -20, eq: [{ type: 'hp', f: 38, q: 0.7071 }, { type: 'lp', f: 2200, q: 0.7071 }] },   // under a thud the bass drum only doubles it: 8 dB lower there, so the master has less to clamp
    /* the brush slap of the two shutters: dark (the brief allows a rattle only under 3 kHz), its peak at the level of the bass's
     * own peaks, and more of the room than anything else gets: the room's answer is what lasts long enough for a phone to give */
    slap: { pan: 0.12, send: -4, peakUnderBass: -3, dragDb: 5, tipUnderBass: 3, eq: [{ type: 'hp', f: 170, q: 0.7071 }, { type: 'lp', f: 2600, q: 0.7071 }, { type: 'lp', f: 4000, q: 0.7071 }] },
    /* every struck stroke is a little different: its own speed (so its own pitch and length) and its own brightness */
    vary: { speed: 0.03, shelfHz: 2000, shelfDb: 2, hardSpeed: 0.012 },
    /* the stir: a continuous bed made from the key 40 recording itself, under the struck strokes */
    bed: { vel: 0.8, from: 0.03, to: 0.33, grain: [0.06, 0.09], hop: 0.015, depth: [4, 5.5], crest: [0.09, 0.16], underStroke: -2, darkLp: 3200, lp: 10000, fade: 0.07, seed: 7, speed: 0.07,
      eq: [{ type: 'hp', f: 170, q: 0.7071 }, { type: 'peak', f: 3600, q: 1, db: -4.5 }, { type: 'lp', f: 12000, q: 0.7071 }] },
    /* the quiet passages against a room full of people: the brushes of the dock (bar 2) and of the restart (bar 6) */
    lift: [{ from: 2, to: 4, db: 2.5 }, { from: 10, to: 12, db: 1.5 }]
  },
  thud: { send: -18 },                                      // each thud's own level and body (the 100 to 200 Hz partials, 1 in the first version) are in THUDS
  room: { decay: 0.75, damp: 0.6, predelay: 0.014, seed: 2 },
  tone: { db: -68, seed: 5, lp: 1500 },                      // where the room tone sits in final.wav; darker than the kit's (low-passed)
  master: { hp: 30, shelf: { f: 8000, db: -3 }, comp: { threshold: -18, ratio: 2 }, lufs: -16, ceilingDb: -2 }
};
/* The three NOs: each thud is tuned to the bass note it lands with. */
const THUDS = [
  { name: 'NO 1', t: tl.hard.no1, note: 'Ab1', size: 1.0, rattle: 0.45, seed: 1, db: -13.5, body: 1.8 },
  { name: 'NO 2', t: tl.hard.no2, note: 'F#1', size: 0.85, rattle: 0.4, seed: 2, db: -13, body: 1.5 },
  { name: 'the slab', t: tl.hard.slab, note: 'G1', size: 1.4, rattle: 0.12, seed: 3, db: -16.5, body: 1.8 }
];

/* ------------------------------------------------------------------ the chart must still fit the picture */
const same = (a, b) => Math.abs(a - b) < 1e-9;
need(same(tl.at(5, 1), tl.hard.no1) && same(tl.at(9, 3), tl.hard.no2) && same(tl.at(19, 3), tl.hard.slab),
  'the chart lands its hits on bar 5 beat 1, bar 9 beat 3 and bar 19 beat 3, but video/score.js has them at ' + JSON.stringify(tl.hard));
tl.passes.forEach((t, i) => need(same(tl.at(12 + i, 2), t), 'PASS ' + (i + 1) + ' is at ' + t + ' s, not on beat 2 of bar ' + (12 + i)));
tl.bays.forEach((t, i) => need(same(i < 3 ? tl.at(1, 2 + i) : tl.at(2, 1), t), 'bay ' + (i + 1) + ' is at ' + t + ' s, not where bar 1 puts its note'));
need(same(tl.at(8, 2), tl.score.ideas[1].gates[0].lift), 'idea 2 passes COST at ' + tl.score.ideas[1].gates[0].lift + ' s, not on beat 2 of bar 8');
need(same(tl.at(16, 1), tl.winner) && same(tl.at(20, 1), tl.positive) && tl.bars === 23 && chart.CHORDS.length === 23, 'the winner, the tag or the bar count has moved');
THUDS.forEach((th) => {
  const b = chart.BASS.find((n) => n.hard && same(tl.at(n.bar, n.beat), th.t));
  need(b && b.note === th.note, th.name + ': the thud is tuned to ' + th.note + ' but the bass plays ' + (b && b.note));
  th.hz = chart.hzOf(chart.midiOf(th.note));
  need(th.hz >= 45 && th.hz <= 60, th.name + ': ' + th.hz.toFixed(1) + ' Hz is outside the 45 to 60 Hz the brief asks of a thud');
});

/* ------------------------------------------------------------------ the performance */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function when(bar, beat, kind, swing) { return kind === 'swung' ? tl.at(bar, beat, { swing: swing }) : tl.at(bar, beat); }
function kindOf(beat) {
  const frac = beat - Math.floor(beat + 1e-9);
  return frac < 1e-6 ? 'beat' : (Math.abs(frac - 0.5) < 1e-6 ? 'swung' : 'trip');
}
const onsetOf = (inst, midi, vel) => sampler.onset({ font: inst.font, bank: inst.bank, program: inst.program, midi: midi, vel: vel });

/* A second recording for a repeated pitch. This preset has one recording per zone of keys (30 to 36, 37 to 41,
 * 42 to 46, 47 to 54, 55 up, and another below 30), so the same pitch is always the same pluck. A pitch within two
 * semitones of a zone's edge can be played from the NEIGHBOURING zone's recording instead: the neighbouring key is
 * rendered and the result is read faster or slower by the interval (in the same zone this gives the identical
 * waveform, measured r = 1.0000; across an edge it is another recording, r = 0.47 to 0.90). ALT maps a sounding pitch
 * to the key it borrows, and the level by which the borrowed note stands over the direct one in this mix's bass tone
 * (measured at equal velocity), which the velocity takes back. Every second occurrence of a pitch borrows; the three
 * HARD hits never do. Not used: the recording below key 30 for F#1 and G1 (it measured half as bright again as the
 * one those notes have, centroid 110 Hz against 74 Hz, and 2 dB louder: too different for the lone G1 at 22 s), and
 * any pitch more than two semitones from an edge (Ab1 to Bb1, Eb2, Ab2, C#3 to E3). */
const ALT = {
  35: [37, 0.4], 36: [37, 0.5], 37: [36, -0.6], 38: [36, -0.6], 40: [42, -1.4], 41: [42, -1.4],
  42: [41, 1.5], 43: [41, 1.5], 45: [47, 1.6], 46: [47, 1.6], 47: [46, -1.7], 48: [46, -1.7], 53: [55, 0.2], 54: [55, 0.3], 55: [54, -0.4]
};

/* The bass. Behind the beat by 4 to 12 ms, drifting as a player drifts (not jumping from note to note);
 * the swing breathes a little; velocities lean where the chart's ACCENTS say and wobble; quarters are nearly legato. */
function playBass() {
  const r = dsp.rng(SEED + 1);
  /* The seven recordings of this preset are not equally loud, and this mix's bass tone (less fundamental, more
   * middle) makes the upper ones stand out more. Measured on the finished bass stem at equal velocity, against
   * the C3 recording (keys 30 to 36): F3 recording (37 to 41) +2.4 dB, A#3 (42 to 46) +0.6, F#4 (47 to 54) +5.4,
   * C5 (55 up) +6.3. Left alone, a scale steps 3.6 dB louder between Bb2 and C3. Each zone's velocity is scaled
   * (9 dB a doubling in this preset: a factor of 10^(dB/30)) so that what is left is a smooth rise of about
   * 1.5 dB an octave: +0.5, +1.0, +2.5 and +3.0 dB. */
  const ZONE_DB = (m) => (m <= 36 ? 0 : (m <= 41 ? -1.9 : (m <= 46 ? 0.4 : (m <= 54 ? -2.9 : -3.3))));
  const zone = (m) => Math.pow(10, ZONE_DB(m) / 30);
  const hasHard = {}, seen = {};
  for (const n of chart.BASS) { if (n.hard) { hasHard[n.midi] = true; } }
  let lag = 0.008;
  const out = chart.BASS.map((n) => {
    const midi = n.midi + 12 * INST.bass.octave;
    if (n.hard) {
      const t = tl.at(n.bar, n.beat);
      return { src: n, midi: midi, key: midi, shift: 0, vel: n.vel, touch: n.vel, t: t - onsetOf(INST.bass, midi, n.vel), lands: t };
    }
    lag = clamp(lag + dsp.gauss(r) * 0.0011, 0.0046, 0.0114);
    const swing = chart.SWING + (r() - 0.5) * 0.012;
    const t = when(n.bar, n.beat, n.kind, swing) + lag + (r() - 0.5) * 0.0008;
    const touch = n.vel + chart.accentOf(n.bar, n.beat) + dsp.gauss(r) * 0.02;       // what the player means
    const k = seen[n.midi] = (seen[n.midi] || 0) + 1;                                // 1, 2, 3 ... among the notes that are not hits
    const borrow = ALT[n.midi] && (hasHard[n.midi] ? k % 2 === 1 : k % 2 === 0);
    const key = borrow ? ALT[n.midi][0] + 12 * INST.bass.octave : midi;
    const level = zone(midi) * (borrow ? Math.pow(10, -ALT[n.midi][1] / 30) : 1);
    return { src: n, midi: midi, key: key, shift: midi - key, vel: clamp(touch * level, 0.2, 1), touch: touch, t: t };
  });
  out.forEach((e, i) => {
    const n = e.src, next = out[i + 1];
    const written = n.len * BEAT;
    if (n.choke || n.ring || n.stac || n.hard) { e.dur = written; return; }
    const quick = n.kind !== 'beat' || n.len < 1;
    const gap = quick ? 0.012 + r() * 0.008 : 0.024 + r() * 0.02;       // the finger leaving the string
    const toNext = next ? next.t - e.t : Infinity;
    /* ... unless the next note is on another string (E from E1, A from A1, D from D2, G from G2 up): then this one is
     * not stopped by the next finger and rings 60 to 120 ms into it, as a walking line does */
    const string = (m) => (m < 33 ? 0 : (m < 38 ? 1 : (m < 43 ? 2 : 3)));
    const crosses = next && !quick && !next.src.hard && toNext <= written + 0.12 && string(n.midi) !== string(next.src.midi);
    const over = 0.06 + r() * 0.06;
    e.dur = Math.max(0.05, (toNext <= written + 0.12 ? toNext : written) + (crosses ? over : -gap));
    e.rings = crosses ? over : 0;
  });
  /* where each note really starts: a borrowed note is rendered at t times the reading speed, on the sampler's 64-sample grid */
  return out.map((e) => {
    const rho = Math.pow(2, e.shift / 12);
    return { t: sampler.startOf(e.t * rho) / rho, dur: e.dur, inst: 'bass', midi: e.midi, key: e.key, shift: e.shift, vel: e.vel, touch: e.touch, note: e.src.note, lands: e.lands, bar: e.src.bar, beat: e.src.beat, rings: e.rings || 0 };
  });
}

/* The piano. Eight events. A single note is a hair late; the chords are rolled; the slab chord's lowest note is exact. */
function playKeys() {
  const r = dsp.rng(SEED + 2);
  const out = [];
  const SLAB_ROLL = [0, 0.011, 0.024, 0.041];          // two hands do not land four notes on one sample: uneven, 41 ms in all, bottom note on the frame
  for (const ev of chart.KEYS) {
    const T = tl.at(ev.bar, ev.beat);
    const count = ev.midis.length;
    ev.midis.forEach((m, i) => {
      const midi = m + 12 * INST.keys.octave;
      const top = i === count - 1, bottom = i === 0;
      let t, vel, lift = 0;
      if (ev.hard) {                                   // not humanised: voiced (top and bottom a little out front); the bottom note started early by its own measured onset
        vel = clamp(ev.vel + (top ? 0.03 : (bottom ? 0 : -0.05)), 0.1, 0.84);
        t = T - onsetOf(INST.keys, midi, vel) + SLAB_ROLL[i];
      } else if (ev.roll) {                            // bottom to top, about 25 ms a note
        vel = clamp(ev.vel + (top ? 0.05 : (bottom ? -0.01 : -0.06)) + dsp.gauss(r) * 0.012, 0.1, 0.84);
        t = T + 0.004 + i * (0.02 + r() * 0.012);
        if (ev.last) { lift = i * 0.4; }               // the last chord: the top note is let go first, the bottom one last, 0.4 s apart
      } else {
        vel = clamp(ev.vel + dsp.gauss(r) * 0.01, 0.1, 0.84);
        t = T + 0.002 + r() * 0.007 + (ev.nod ? 0.01 : 0);     // the nod of idea 2 is a hair later, and softer, than a PASS
      }
      out.push({ t: sampler.startOf(t), dur: ev.len * BEAT - lift, inst: 'keys', midi: midi, vel: vel, note: ev.notes[i], lands: ev.hard && bottom ? T : undefined, event: ev });
    });
  }
  return out;
}

/* The kit. Brushes a hair either side of the beat, the ride 0 to 6 ms ahead (drifting), the hi-hat 6 ms early
 * (its "chick" comes about 20 ms after the foot moves, but the foot itself is heard from the start).
 * Every struck stroke also gets its own speed and brightness (applied when it is rendered). */
function playDrums() {
  const r = dsp.rng(SEED + 3), rv = dsp.rng(SEED + 4);
  const hits = [];
  let lead = 0.003, taps = 0, skips = 1, count = 0;
  const lastVel = {};
  const V = MIX.drums.vary;
  const bars = Object.keys(chart.DRUMS).map(Number).sort((a, b) => a - b);
  for (const bar of bars) {
    const part = chart.DRUMS[bar];
    const rows = [];
    for (const voice of Object.keys(part)) { for (const h of part[voice]) { rows.push({ voice: voice, beat: h[0], vel: h[1], hard: h[2] === 'hard' }); } }
    rows.sort((a, b) => a.beat - b.beat);
    for (const h of rows) {
      const kind = kindOf(h.beat);
      const T = when(bar, h.beat, kind, chart.SWING + (r() - 0.5) * 0.01);
      let key, t, vel = h.vel + (h.hard ? 0 : MIX.drums.touch[h.voice] || 0) + dsp.gauss(r) * 0.03;
      if (h.voice === 'swirl') { key = DRUM_KEY.swirl; t = T - 0.012 + (r() - 0.5) * 0.008; }
      else if (h.voice === 'tap') { key = taps++ % 2 ? DRUM_KEY.tapB : DRUM_KEY.tapA; t = T + (r() - 0.4) * 0.005; }
      else if (h.voice === 'skip') { key = skips++ % 2 ? DRUM_KEY.tapB : DRUM_KEY.tapA; t = T + (r() - 0.4) * 0.005; }      // the two tap recordings, the other way round
      else if (h.voice === 'hat') { key = DRUM_KEY.hat; t = T - 0.006 + (r() - 0.5) * 0.004; }       // was 18 ms early for its late "chick"; the stem then rose 17 ms before the PASS it marks (judge), so now 6
      else if (h.voice === 'ride') { lead = clamp(lead + dsp.gauss(r) * 0.0007, 0.0004, 0.0056); key = DRUM_KEY.ride; t = T - lead; }
      else if (h.voice === 'kick') { key = DRUM_KEY.kick; t = T + (r() - 0.5) * 0.006; }
      else if (h.voice === 'slap' || h.voice === 'slap2' || h.voice === 'drag') { key = DRUM_KEY[h.voice]; t = T; }
      else { throw new Error('minimal/build: the chart has a drum voice this build does not know: ' + h.voice); }
      if (h.hard) {                                                        // on the frame; the second brush and the drag a few milliseconds behind the first, and not by the same amount twice
        const flam = h.voice === 'slap2' ? (bar === 5 ? 0.003 : 0.0065) : (h.voice === 'drag' ? (bar === 5 ? 0.0015 : 0.004) : 0);
        vel = h.vel; t = T - onsetOf(INST.drums, key, vel) + flam;
      }
      vel = clamp(vel, 0.14, 1);
      let v127 = Math.max(1, Math.round(vel * 127));
      if (lastVel[h.voice] === v127) { v127 += v127 < 120 ? 2 : -2; }       // never the same stroke twice running
      lastVel[h.voice] = v127;
      /* its own speed: spread by the golden ratio, so strokes that follow each other are far apart and no two are the same */
      const u = ((++count) * 0.6180339887) % 1;
      const speed = 1 + (u - 0.5) * 2 * (h.hard && h.voice === 'kick' ? V.hardSpeed : V.speed);
      const shelf = (rv() - 0.5) * 2 * (h.hard ? 0 : V.shelfDb);
      hits.push({ t: sampler.startOf(t), inst: 'drums', kind: h.voice, midi: key, vel: v127 / 127, lands: h.hard ? T : undefined, hard: h.hard, speed: speed, shelfDb: shelf, bar: bar, beat: h.beat });
    }
  }
  return hits.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ small mixing tools of this build */
function toMono(st) { const m = dsp.mono(st); return [m, Float32Array.from(m)]; }
function narrow(st, w) {
  const L = st[0], R = st[1];
  for (let i = 0; i < L.length; i++) { const m = 0.5 * (L[i] + R[i]), s = 0.5 * (L[i] - R[i]) * w; L[i] = m + s; R[i] = m - s; }
  return st;
}
/* Read a buffer at another speed (cubic interpolation): out[i] = x(i * speed). Speed above 1 is higher and shorter. */
function reread(x, speed, n) {
  const len = n === undefined ? Math.floor((x.length - 4) / speed) : n;
  const y = new Float32Array(len);
  const last = x.length - 3;
  for (let i = 0; i < len; i++) {
    const p = i * speed, k = Math.floor(p);
    if (k >= last) { break; }
    const f = p - k, xm = x[k > 0 ? k - 1 : 0], x0 = x[k], x1 = x[k + 1], x2 = x[k + 2];
    y[i] = x0 + 0.5 * f * (x1 - xm + f * (2 * xm - 5 * x0 + 4 * x1 - x2 + f * (3 * (x0 - x1) + x2 - xm)));
  }
  return y;
}
/*
 * Harmonics for the lowest bass notes, so the line is still there on a speaker that cannot play 50 Hz.
 * The low end of the bass (under about 120 Hz) is followed by an envelope, shaped by a soft lopsided curve
 * at the same depth whatever the note's level (so a quiet note gets the same share as a loud one), and only
 * what the curve adds between 150 Hz and 1 kHz is mixed back in: the octave, the twelfth and a few more
 * partials of each low note, in proportion to that note. Notes that are already above 150 Hz are left nearly alone.
 */
function harmonics(st, o) {
  const src = Float64Array.from(st[0]);
  dsp.biquad(src, 'lp', o.inLp, 0.7071);
  const n = src.length, add = new Float64Array(n);
  const up = Math.exp(-1 / (0.004 * SR)), down = Math.exp(-1 / (0.16 * SR)), floor = dsp.lin(-66);
  const t0 = Math.tanh(o.drive * o.bias);
  let env = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(src[i]);
    env = a > env ? up * env + (1 - up) * a : down * env + (1 - down) * a;
    const u = src[i] / (env + floor);
    add[i] = (Math.tanh(o.drive * (u + o.bias)) - t0) * env;
  }
  dsp.biquad(add, 'hp', o.lo, 0.7071); dsp.biquad(add, 'hp', o.lo, 0.7071);
  dsp.biquad(add, 'lp', o.hi, 0.7071); dsp.biquad(add, 'lp', o.hi, 0.7071);
  const g = dsp.lin(o.db);
  for (const ch of st) { for (let i = 0; i < n; i++) { ch[i] += g * add[i]; } }
  return st;
}
/* How much of a sound's energy is left after a 150 Hz high-pass (24 dB an octave). */
function above150(st) {
  const hp = dsp.copy(st);
  dsp.butter(hp, 'hp', 150, 4);
  const a = dsp.rms(hp), b = dsp.rms(st);
  return b > 0 ? (a * a) / (b * b) : 0;
}
/* The break and the stop-time: the hand is on the strings, the head or the cymbal 70 ms after each door lets go, and
 * stays there until `until(d)` (the hit itself is rendered apart, or starts after it). */
function hush(st, until) {
  for (const d of DROPS) {
    const end = until(d);
    dsp.fade(st, d.drop, d.drop + 0.07, 1, 0); dsp.fade(st, d.drop + 0.07, end - 0.002, 0, 0); dsp.fade(st, end - 0.002, end, 0, 1);
  }
  return st;
}
/* The loudest 10 ms (RMS, dB) of a mono buffer between two times. */
function peak10(x, t0, t1) {
  const w = Math.round(0.01 * SR), a = Math.max(0, Math.round(t0 * SR)), b = Math.min(x.length, Math.round(t1 * SR));
  let best = 0;
  for (let i = a; i + w <= b; i += Math.round(w / 5)) { let s = 0; for (let j = i; j < i + w; j++) { s += x[j] * x[j]; } if (s > best) { best = s; } }
  return 10 * Math.log10(best / w + 1e-30);
}

/* ------------------------------------------------------------------ the kit, stroke by stroke
 * The library has one recording per brush sound, so a stroke restruck every beat is the same waveform every beat
 * (judge: 43 of 43 isolated swirl pairs over r 0.995). Every stroke is therefore rendered where nothing else sounds
 * (a few passes over the kit, strokes at least 0.66 s apart in each), cut out, read at its own speed (up to 3 percent
 * either way) through its own shelf (up to 2 dB either way above 2 kHz), and put where it belongs. The velocity
 * still does what it does in the recording. */
function renderStrokes(strokes) {
  const SEG = 0.64, APART = 0.66;
  const passes = [];
  for (const h of strokes) {
    let p = passes.find((q) => q.last + APART <= h.t);
    if (!p) { p = { last: -Infinity, list: [] }; passes.push(p); }
    p.list.push(h); p.last = h.t;
  }
  const out = {};
  for (const p of passes) {
    const st = sampler.render({ font: INST.drums.font, bank: INST.drums.bank, program: INST.drums.program,
      notes: p.list.map((h) => ({ t: h.t, dur: h.kind === 'kick' ? 0.3 : 0.4, midi: h.midi, vel: h.vel })) });
    const m = dsp.mono(st);                                      // these recordings are mono in this library (L/R correlation 1.00)
    for (const h of p.list) {
      const a = Math.round(h.t * SR), n = Math.min(Math.round(SEG * SR), m.length - a);
      const seg = Float32Array.from(m.subarray(a, a + n));
      for (let i = 0, f = Math.round(0.02 * SR); i < f; i++) { seg[n - 1 - i] *= i / f; }
      const y = reread(seg, h.speed);
      if (Math.abs(h.shelfDb) > 0.05) { dsp.biquad(y, 'highshelf', MIX.drums.vary.shelfHz, 0.7071, h.shelfDb); }
      const bus = h.hard ? h.kind + 'Hit' : h.kind;
      if (!out[bus]) { out[bus] = new Float32Array(N); }
      const dest = out[bus];
      for (let i = 0; i < y.length && a + i < N; i++) { dest[a + i] += y[i]; }
    }
  }
  out.passes = passes.length;
  return out;
}

/* The stir. A brush on a snare head is never silent between strokes: it keeps moving. Neither library has a
 * continuous swirl, so one is made from the swirl recording itself: short pieces of it (60 to 90 ms, from 0.03 to
 * 0.33 s into the stroke, each brought to the same level) laid over each other at seeded random places, so it is
 * the recording's own noise and not a noise generator. Its level sweeps once a beat (the hand going round: the
 * crest a little after each struck stroke, 5 to 7 dB down between, never twice the same) and it is darker in the
 * troughs. It only runs on beats where the chart has a swirl stroke. */
function stir(swirls) {
  const B = MIX.drums.bed, r = dsp.rng(SEED + B.seed);
  const T0 = 0.5;
  const rec = dsp.mono(sampler.render({ font: INST.drums.font, bank: INST.drums.bank, program: INST.drums.program, seconds: 1.5,
    notes: [{ t: T0, dur: 0.6, midi: DRUM_KEY.swirl, vel: B.vel }] }));
  const noise = new Float32Array(N);
  const first = Math.max(0, Math.round((swirls[0].t - 0.2) * SR)), lastS = Math.min(N, Math.round((swirls[swirls.length - 1].t + 1) * SR));
  const active = new Uint8Array(N);                     // only where a swirl stroke is within a beat
  for (const h of swirls) { const a = Math.max(0, Math.round((h.t - 0.1) * SR)), b = Math.min(N, Math.round((h.t + BEAT + 0.1) * SR)); active.fill(1, a, b); }
  const hop = Math.round(B.hop * SR);
  for (let pos = first; pos < lastS; pos += hop) {
    const len = Math.round((B.grain[0] + r() * (B.grain[1] - B.grain[0])) * SR);
    const speed = 1 + (r() - 0.5) * 2 * B.speed;        // each piece read a little faster or slower: the head's own ring (steady lines near 650 to 900 Hz in the picture) is smeared, as a moving brush smears it
    const from = (T0 + B.from + r() * (B.to - B.from - (len / SR) * (1 + B.speed))) * SR;
    if (!active[Math.min(N - 1, pos + (len >> 1))]) { continue; }
    const piece = new Float32Array(len);
    let e = 0;
    for (let i = 0; i < len; i++) { const q = from + i * speed, k = Math.floor(q), fr = q - k; const v = rec[k] + (rec[k + 1] - rec[k]) * fr; piece[i] = v; e += v * v; }
    const g = 1 / Math.sqrt(e / len + 1e-18);
    for (let i = 0; i < len && pos + i < N; i++) { noise[pos + i] += piece[i] * g * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / len)); }
  }
  /* the sweep: anchors at each crest (0 dB, moved by that stroke's velocity) and at each trough (the depth), joined by half cosines */
  const pts = [];
  swirls.forEach((h, i) => {
    const next = swirls[i + 1];
    const crest = h.t + B.crest[0] + r() * (B.crest[1] - B.crest[0]);
    const lvl = 14 * (h.vel - 0.5);                                         // a harder stroke, a louder turn of the hand
    const depth = B.depth[0] + r() * (B.depth[1] - B.depth[0]);
    pts.push([crest, lvl]);
    const gapToNext = next ? next.t - h.t : Infinity;
    if (gapToNext < BEAT * 1.3) { pts.push([crest + 0.5 * gapToNext + (r() - 0.5) * 0.04, lvl - depth]); }
    else { pts.push([h.t + BEAT * 0.8, lvl - depth - 3], [h.t + BEAT, lvl - 30]); }                 // the last stroke of a run: the hand stops
  });
  const envDb = new Float32Array(N).fill(-120);
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ta, da] = pts[k], [tb, dbb] = pts[k + 1];
    if (tb - ta > BEAT * 1.2) { continue; }                                   // a rest: nothing between two runs
    const a = Math.max(0, Math.round(ta * SR)), b = Math.min(N, Math.round(tb * SR));
    for (let i = a; i < b; i++) { const x = (i - a) / (b - a); envDb[i] = da + (dbb - da) * (0.5 - 0.5 * Math.cos(Math.PI * x)); }
  }
  /* the start of each run: up from nothing with the first struck stroke */
  swirls.forEach((h, i) => {
    const prev = swirls[i - 1];
    if (prev && h.t - prev.t < BEAT * 1.3) { return; }
    const a = Math.max(0, Math.round(h.t * SR)), crest = pts.find((q) => q[0] > h.t);
    const b = Math.min(N, Math.round(crest[0] * SR));
    for (let i2 = a; i2 < b; i2++) { const x = (i2 - a) / (b - a); envDb[i2] = crest[1] - 30 * (0.5 + 0.5 * Math.cos(Math.PI * x)); }
  });
  /* darker in the troughs: two copies, one low-passed hard, crossed by the sweep */
  const dark = Float32Array.from(noise), bright = Float32Array.from(noise);
  dsp.biquad(dark, 'lp', B.darkLp, 0.7071); dsp.biquad(bright, 'lp', B.lp, 0.7071);
  const out = new Float32Array(N);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { if (envDb[i] > -100) { if (envDb[i] < lo) { lo = envDb[i]; } if (envDb[i] > hi) { hi = envDb[i]; } } }
  for (let i = 0; i < N; i++) {
    if (envDb[i] <= -100) { continue; }
    const g = Math.pow(10, envDb[i] / 20);
    const mixB = clamp((envDb[i] - (hi - 14)) / 14, 0, 1);                    // 1 at the loudest crest, 0 from 14 dB under it
    const w = 0.4 + 0.6 * mixB;                                              // mostly the recording as it is; a little duller where the hand slows
    out[i] = g * (dark[i] * (1 - w) + bright[i] * w);
  }
  return out;
}

/* ------------------------------------------------------------------ build */
function main() {
  log('minimal: ' + chart.KEY + ', ' + chart.BPM + ' BPM, swing ' + chart.SWING + ', seed ' + SEED);
  const bassNotes = playBass(), keysNotes = playKeys(), drumHits = playDrums();
  log('performed: ' + bassNotes.length + ' bass notes (' + bassNotes.filter((n) => n.shift !== 0).length + ' from a neighbouring recording), ' + keysNotes.length + ' piano notes in ' + chart.KEYS.length + ' events, ' + drumHits.length + ' drum strokes');
  DROPS.forEach((d) => {
    need(same(d.hit - d.drop, 0.375), d.name + ': the door falls for ' + (d.hit - d.drop) + ' s, not 0.375');
    const late = bassNotes.filter((n) => !n.lands && n.t > d.drop && n.t < d.hit).concat(drumHits.filter((h) => !h.hard && h.t > d.drop - 0.05 && h.t < d.hit));
    need(late.length === 0, d.name + ': the chart plays ' + late.length + ' notes while the door falls');
  });

  /* --- render: recorded instruments, dry (the kit turns fluidsynth's reverb and chorus off) --- */
  function pick(inst) { return { font: inst.font, bank: inst.bank, program: inst.program }; }
  /* the bass: one pass for the notes played from their own key, and one for each interval a note borrows over */
  const bassM = new Float32Array(N);
  {
    const shifts = Array.from(new Set(bassNotes.map((n) => n.shift))).sort((a, b) => a - b);
    for (const sh of shifts) {
      const rho = Math.pow(2, sh / 12);
      const list = bassNotes.filter((n) => n.shift === sh).map((n) => ({ t: n.t * rho, dur: n.dur * rho, midi: n.key, vel: n.vel }));
      const st = sampler.render(Object.assign({}, pick(INST.bass), { notes: list, seconds: Math.ceil(46 * rho + 1) }));
      const m = dsp.mono(st);
      const y = sh === 0 ? m : reread(m, rho, N);
      for (let i = 0; i < N; i++) { bassM[i] += y[i]; }
    }
    log('rendered the bass (' + shifts.length + ' passes: read at ' + shifts.map((sh) => (sh > 0 ? '+' : '') + sh).join(', ') + ' semitones)');
  }
  const bass = [bassM, Float32Array.from(bassM)];
  /* the piano: two passes, the events alternating, so each event is alone in its pass and can have its own fader */
  const keysEvents = chart.KEYS.map((ev, i) => ({ ev: ev, t: tl.at(ev.bar, ev.beat), notes: keysNotes.filter((n) => n.event === ev), pass: i % 2 }));
  {
    const pass = [0, 1].map((k) => {
      const st = sampler.render(Object.assign({}, pick(INST.keys), { notes: keysEvents.filter((e) => e.pass === k).flatMap((e) => e.notes).map((n) => ({ t: n.t, dur: n.dur, midi: n.midi, vel: n.vel })) }));
      narrow(st, MIX.keys.width); dsp.eq(st, MIX.keys.eq);
      return st;
    });
    keysEvents.forEach((e) => {
      const nextSame = keysEvents.find((x) => x.pass === e.pass && x.t > e.t);
      const a = Math.max(0, Math.round((e.t - 0.03) * SR)), b = nextSame ? Math.round((nextSame.t - 0.03) * SR) : N;
      e.a = a; e.seg = [Float32Array.from(pass[e.pass][0].subarray(a, b)), Float32Array.from(pass[e.pass][1].subarray(a, b))];
      e.rmsDb = (t0, t1) => dsp.rmsDb(e.seg, Math.max(0, t0 - a / SR), Math.max(0.001, t1 - a / SR));
    });
  }
  log('rendered the piano (2 passes, ' + keysEvents.length + ' events, each alone in its pass)');
  /* the kit: every struck stroke on its own; the cymbals in one pass */
  const struck = drumHits.filter((h) => ['swirl', 'tap', 'skip', 'kick', 'slap', 'slap2', 'drag'].includes(h.kind));
  const strokes = renderStrokes(struck);
  const swirls = drumHits.filter((h) => h.kind === 'swirl' && !h.hard);
  const bed = stir(swirls);
  const cym = sampler.render(Object.assign({}, pick(INST.drums), { notes: drumHits.filter((h) => h.kind === 'hat' || h.kind === 'ride').map((h) => ({ t: h.t, dur: h.kind === 'ride' ? 1.6 : 0.25, midi: h.midi, vel: h.vel })) }));
  log('rendered the kit: ' + struck.length + ' struck strokes one by one (' + strokes.passes + ' passes), the stir, the cymbals');

  /* --- the bass: mono, harmonics for small speakers, tone; the hand on the strings while each door falls --- */
  const bassRaw150 = above150(bass);
  dsp.eq(bass, [{ type: 'hp', f: 33, q: 0.7071 }]);
  harmonics(bass, MIX.bass.harmonics);
  dsp.eq(bass, MIX.bass.eq);
  hush(bass, (d) => bassNotes.find((n) => n.lands === d.hit).t - 0.001);
  const bass150 = above150(bass);
  log('bass: ' + f1(100 * bassRaw150) + ' percent of its energy above 150 Hz as sampled, ' + f1(100 * bass150) + ' percent after harmonics and tone');

  /* --- the piano: each event brought to the level the chart means --- */
  const rides = [];
  const keys = dsp.stereo();
  {
    /* The Mellow Grand's samples are uneven (audition: Bb4 and C5 are 4 dB louder than G4 at the same velocity).
     * A fader per lone note: each is set to the level of the first PASS note (its first 0.6 s), so the four are one level and
     * only the pitch climbs; then the four together are set 8 dB under the bass, and each chord against the bass in its own window. */
    const lone = keysEvents.filter((e) => e.ev.midis.length === 1);
    const first = lone.find((e) => e.ev.pass);
    const ref = first.rmsDb(first.t, first.t + 0.6);
    for (const e of lone) { e.db = (ref + (e.ev.pass ? 0 : -2.5)) - e.rmsDb(e.t, e.t + 0.6); }      // the nod of idea 2 sits under the PASS notes
    const passes = dsp.stereo();
    for (const e of lone.filter((x) => x.ev.pass)) { mix.add(passes, e.seg, { at: e.a / SR, db: e.db }); }
    const all = (dsp.rmsDb(bass, 22.5, 30) - MIX.keys.underBass) - dsp.rmsDb(passes, 22.5, 30);
    for (const e of lone) { e.db += all; }
    for (const e of keysEvents.filter((x) => x.ev.midis.length > 1)) {
      const [name, a, b, under] = e.ev.winner ? ['winner chord', e.t, e.t + 1, MIX.keys.chordUnderBass.winner]
        : (e.ev.hard ? ['slab chord', e.t, e.t + 1, MIX.keys.chordUnderBass.slab] : ['last chord', e.t, e.t + 1.3, MIX.keys.chordUnderBass.last]);
      e.name = name;
      e.db = (dsp.rmsDb(bass, a, b) - under) - e.rmsDb(a, b);
    }
    /* The last chord is not left to sit: this preset falls 20 dB in its first second and then holds almost level
     * (judge: the keys stem flat at -61 dBFS for 3.5 s, then switched off). From 0.9 s after it is struck the fader
     * comes down 4 dB a second, so it goes on dying as a piano does. */
    for (const e of keysEvents.filter((x) => x.ev.last)) {
      const from = Math.round((e.t + 0.9) * SR) - e.a;
      for (const ch of e.seg) { for (let i = from; i < ch.length; i++) { ch[i] *= Math.pow(10, -4 * ((i - from) / SR) / 20); } }
    }
    for (const e of keysEvents) { mix.add(keys, e.seg, { at: e.a / SR, db: e.db }); rides.push({ note: e.name || e.ev.notes[0], t: e.t, db: e.db }); }
    log('piano faders: ' + rides.map((x) => x.note + ' at ' + f1(x.t) + ' s ' + (x.db >= 0 ? '+' : '') + f1(x.db) + ' dB').join(', '));
  }
  const gains = { bass: 0, keys: 0 };

  /* --- the kit --- */
  const D = MIX.drums;
  const stereoOf = (m) => [m, Float32Array.from(m)];
  const zero = () => new Float32Array(N);
  /* the stir sits under the struck swirl: its crest a set distance under the loudest 10 ms of a middling stroke */
  const swirlBus = strokes.swirl || zero();
  const mids = swirls.filter((h) => h.t > 12 && h.t < 16.4).map((h) => peak10(swirlBus, h.t, h.t + 0.08)).sort((a, b) => a - b);
  const strokeDb = mids[mids.length >> 1];
  const bedCrestDb = (function () { const xs = swirls.filter((h) => h.t > 12 && h.t < 16.4).map((h) => peak10(bed, h.t + 0.05, h.t + 0.25)).sort((a, b) => a - b); return xs[xs.length >> 1]; })();
  const bedGain = (strokeDb - D.bed.underStroke) - bedCrestDb;
  const brushM = zero();
  for (const k of ['swirl', 'tap', 'skip']) { if (strokes[k]) { for (let i = 0; i < N; i++) { brushM[i] += strokes[k][i]; } } }
  const brush = stereoOf(brushM);
  dsp.eq(brush, D.brush.eq);                             // the struck strokes: the dip at 3.6 kHz (their spikes were the hottest 20 ms of the film), low-pass 9 kHz
  { const st = stereoOf(Float32Array.from(bed)); dsp.eq(st, D.bed.eq); mix.add(brush, st, { db: bedGain }); }      // the stir: its own dip there (it is on all the time), and its top left open to 12 kHz
  for (const L of D.lift) { const g = dsp.lin(L.db); dsp.fade(brush, L.from - 0.25, L.from, 1, g); dsp.fade(brush, L.from, L.to - 0.12, g, g); dsp.fade(brush, L.to - 0.12, L.to - 0.02, g, 1); }
  hush(brush, (d) => d.back);
  dsp.eq(cym, D.cym.eq); hush(cym, (d) => d.back);
  const kick = stereoOf(strokes.kick || zero()); dsp.eq(kick, D.kick.eq); hush(kick, (d) => d.back);
  const kickHit = stereoOf(strokes.kickHit || zero()); dsp.eq(kickHit, D.kick.eq);
  const slapM = zero();
  for (const k of ['slapHit', 'slap2Hit', 'dragHit']) { if (strokes[k]) { const g = k === 'dragHit' ? dsp.lin(D.slap.dragDb) : 1; for (let i = 0; i < N; i++) { slapM[i] += g * strokes[k][i]; } } }
  const slap = stereoOf(slapM); dsp.eq(slap, D.slap.eq);
  const rmsOf = (m, a, b) => dsp.rmsDb([m, m], a, b);
  log('kit parts, RMS before the faders (12 to 16 s / 24 to 30 s / 30 to 36.5 s): struck brushes ' + ['swirl', 'tap', 'skip'].map((k) => k + ' ' + [[12, 16], [24, 30], [30, 36.5]].map(([a, b]) => f1(rmsOf(strokes[k] || zero(), a, b))).join('/')).join(', ') +
    '; stir ' + [[12, 16], [24, 30], [30, 36.5]].map(([a, b]) => f1(rmsOf(bed, a, b) + bedGain)).join('/') + '; brush bus ' + [[12, 16], [24, 30], [30, 36.5]].map(([a, b]) => f1(dsp.rmsDb(brush, a, b) + D.brush.db)).join('/') +
    '; cymbals ' + [[24, 30], [30, 36.5]].map(([a, b]) => f1(dsp.rmsDb(cym, a, b) + D.cym.db)).join('/') + '; bass drum ' + f1(dsp.rmsDb(kick, 30, 36.5) + D.kick.db));
  log('the stir: a middling struck swirl peaks at ' + f1(strokeDb) + ' dB (10 ms); the stir\'s crest is set ' + f1(-D.bed.underStroke) + ' dB over that (gain ' + f1(bedGain) + ' dB)');
  const drums = dsp.stereo();
  mix.add(drums, brush, { db: D.brush.db, pan: D.brush.pan });
  mix.add(drums, cym, { db: D.cym.db, pan: D.cym.pan });
  mix.add(drums, kick, { db: D.kick.db, pan: D.kick.pan });
  const drumSend = dsp.stereo();
  mix.add(drumSend, brush, { db: D.brush.db + D.brush.send, pan: D.brush.pan });
  mix.add(drumSend, cym, { db: D.cym.db + D.cym.send, pan: D.cym.pan });
  mix.add(drumSend, kick, { db: D.kick.db + D.kick.send, pan: D.kick.pan });
  /* the hits of the kit (the bass drum under each thud, the brush slap of the two shutters) are apart: never hushed, never shaved */
  const drumHitsBus = dsp.stereo(), drumHitsSend = dsp.stereo();
  mix.add(drumHitsBus, kickHit, { db: D.kick.db + D.kick.hitDb, pan: D.kick.pan });
  mix.add(drumHitsSend, kickHit, { db: D.kick.db + D.kick.hitDb + D.kick.send, pan: D.kick.pan });

  /* --- balance, by measurement: the bass is the reference --- */
  gains.drums = (dsp.rmsDb(bass, 30, 36.5) - D.underBass) - dsp.rmsDb(drums, 30, 36.5);
  log('gains: drums ' + f1(gains.drums) + ' dB (bass 0; the piano has a fader per event)');

  /* --- stems: each instrument as it sits in the mix, with its own share of the room --- */
  const numbersDrums = {};
  const stems = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo() };
  const wetOf = (send) => mix.room(send, MIX.room);
  mix.add(stems.bass, bass, { db: gains.bass, pan: MIX.bass.pan });
  { const s = dsp.stereo(); mix.add(s, stems.bass, { db: MIX.bass.send }); mix.add(stems.bass, wetOf(s)); }
  mix.add(stems.keys, keys, { pan: MIX.keys.pan });
  { const s = dsp.stereo(); mix.add(s, stems.keys, { db: MIX.keys.send }); mix.add(stems.keys, narrow(wetOf(s), MIX.keys.roomWidth)); }
  mix.add(stems.drums, drums, { db: gains.drums });
  {
    /* A brush tap is a spike a few milliseconds long: balanced by RMS it stands far above the bass and would make the
     * master's limiter duck the whole band on every stroke. So the spikes are shaved here, on the kit alone
     * (the kit's own look-ahead limiter, 2 ms ahead, 40 ms release), and the master is left with little to do. */
    const ceiling = dsp.peak(bass, 30, 36.5) * dsp.lin(-D.peakUnderBass);
    const before = dsp.peak(stems.drums);
    const lim = mix.limitPass(stems.drums, ceiling, 0.002, 0.04);
    numbersDrums.peakBeforeDb = dsp.db(before); numbersDrums.ceilingDb = dsp.db(ceiling); numbersDrums.maxReductionDb = lim.maxReductionDb;
    numbersDrums.limitedPercent = 100 * lim.limitedSamples / N; numbersDrums.rmsChangeDb = dsp.rmsDb(stems.drums, 30, 36.5) - (dsp.rmsDb(drums, 30, 36.5) + gains.drums);
    log('kit: strokes peaked at ' + f1(dsp.db(before)) + ' dBFS, shaved to ' + f1(dsp.db(ceiling)) + ' (up to ' + f1(lim.maxReductionDb) + ' dB, ' + f2(numbersDrums.limitedPercent) + ' percent of the film); RMS changed by ' + f2(numbersDrums.rmsChangeDb) + ' dB');
    /* the slap: its peak set against the bass's own peaks, so it is a strike a small speaker can play and not a crash */
    const slapDb = (dsp.db(ceiling) - D.slap.peakUnderBass) - dsp.db(dsp.peak(slap));
    numbersDrums.slapDb = slapDb;
    dsp.gain(slap, slapDb);
    /* ... and then only the tip of it is taken off (the same look-ahead limiter, on the slap alone), so that the master
     * does not have to duck the thud and the bass for it: the strike keeps its body and its room, and loses a few milliseconds */
    const tip = mix.limitPass(slap, ceiling * dsp.lin(-D.slap.tipUnderBass), 0.002, 0.04);
    numbersDrums.slapTipDb = tip.maxReductionDb;
    log('the slap: set to peak at ' + f1(dsp.db(ceiling) - D.slap.peakUnderBass) + ' dBFS, its tip shaved by ' + f1(tip.maxReductionDb) + ' dB to ' + f1(dsp.db(ceiling) - D.slap.tipUnderBass));
    mix.add(drumHitsBus, slap, { db: -gains.drums, pan: D.slap.pan });
    mix.add(drumHitsSend, slap, { db: -gains.drums + D.slap.send, pan: D.slap.pan });
    mix.add(stems.drums, drumHitsBus, { db: gains.drums });
  }
  { const s = dsp.stereo(); mix.add(s, drumSend, { db: gains.drums }); mix.add(s, drumHitsSend, { db: gains.drums }); mix.add(stems.drums, wetOf(s)); }
  log('room: ' + JSON.stringify(MIX.room));

  /* --- the NO thuds --- */
  const thudsOnly = dsp.stereo();
  for (const th of THUDS) { mix.add(thudsOnly, synth.thud({ hz: th.hz, size: th.size, rattle: th.rattle, body: th.body, seed: th.seed }), { at: th.t, db: th.db }); }
  { const s = dsp.stereo(); mix.add(s, thudsOnly, { db: MIX.thud.send }); mix.add(thudsOnly, wetOf(s)); }

  /* --- the two ends: nothing starts or stops on a step; the last 300 ms fade to nothing (the loop point) --- */
  const ends = (st) => { dsp.fade(st, 0, 0.004, 0, 1); dsp.fade(st, 45.7, 46, 1, 0); return st; };
  ends(stems.bass); ends(stems.keys); ends(stems.drums); ends(thudsOnly);

  /* --- master. The room tone has to sit at -68 dBFS in final.wav, so its level before the master depends on
   *     the gain the master adds: master once to learn that gain, place the tone, master again.
   *     The tone is the kit's, made darker here (a low-pass at 1.5 kHz, 12 dB an octave): a room, not a hiss. --- */
  const sumOf = (fx) => { const s = dsp.stereo(); for (const k of ['bass', 'keys', 'drums']) { mix.add(s, stems[k]); } mix.add(s, fx); return s; };
  const darkTone = (db) => { const t = synth.roomTone({ db: db, seed: MIX.tone.seed }); dsp.eq(t, [{ type: 'lp', f: MIX.tone.lp, q: 0.7071 }]); return t; };
  let toneDb = MIX.tone.db - (MIX.master.lufs - mix.lufs(sumOf(thudsOnly))) + 3;
  let final = null;
  for (let pass = 1; pass <= 4; pass++) {
    stems.fx = dsp.copy(thudsOnly);
    mix.add(stems.fx, ends(darkTone(toneDb)));
    final = mix.master(sumOf(stems.fx), MIX.master);
    const got = dsp.rmsDb(final, 20.4, 21.9);
    log('master pass ' + pass + ': room tone at ' + f1(toneDb) + ' dBFS (before its low-pass) before the master is ' + f1(got) + ' dBFS in the held breath; master gain ' + f1(final.info.gainDb) + ' dB');
    if (Math.abs(got - MIX.tone.db) <= 0.4) { break; }
    toneDb += MIX.tone.db - got;
  }
  const info = final.info;
  log('master: in ' + f1(info.inputLufs) + ' LUFS, gain ' + f1(info.gainDb) + ' dB, compressor up to ' + f1(info.comp ? info.comp.maxReductionDb : 0) + ' dB (mean ' + f2(info.comp ? info.comp.meanReductionDb : 0) +
    '), limiter up to ' + f1(info.limiter.maxReductionDb) + ' dB on ' + f2(info.limiter.limitedPercent) + ' percent; out ' + f2(info.lufs) + ' LUFS, ' + f2(info.truePeakDb) + ' dBTP, LRA ' + f1(info.lra));

  const tone = kit.analyze.tone(final);
  log('tone: tilt ' + f2(tone.slopeDbPerOct) + ' dB per octave (200 Hz to 8 kHz), 2 to 5 kHz ' + f1(tone.bands.presence) + ' dB, above 8 kHz ' + f1(tone.bands.air) + ' dB, under 50 Hz ' + f1(tone.below50Db) + ' dB');
  log('third-octaves 200 Hz to 8 kHz: ' + tone.thirdOctave.db.map((v) => v.toFixed(0)).join(' '));

  /* --- write --- */
  fs.mkdirSync(path.join(HERE, 'stems'), { recursive: true });
  let clipped = wav.write(path.join(HERE, 'final.wav'), final, { bits: 24 });
  for (const k of ['bass', 'keys', 'drums', 'fx']) { clipped += wav.write(path.join(HERE, 'stems', k + '.wav'), stems[k], { bits: 24 }); }
  need(clipped === 0, clipped + ' samples clipped on the way to disk');

  const hits = drumHits.map((h) => ({ t: round(h.t), inst: 'drums', kind: h.kind, vel: round(h.vel), midi: h.midi, lands: h.lands, speed: round(h.speed), shelfDb: round(h.shelfDb) }))
    .concat(THUDS.map((th) => ({ t: th.t, inst: 'fx', kind: 'thud', vel: 1, hz: round(th.hz), note: th.note, lands: th.t })))
    .sort((a, b) => a.t - b.t);
  const arrangement = {
    key: chart.KEY, bpm: chart.BPM, swing: chart.SWING, seed: SEED,
    chords: chart.CHORDS,
    notes: bassNotes.concat(keysNotes).sort((a, b) => a.t - b.t).map((n) => ({
      t: round(n.t), dur: round(n.dur), inst: n.inst, midi: n.midi, vel: round(n.vel), note: n.note, lands: n.lands,
      touch: n.touch === undefined ? undefined : round(n.touch), playedFromKey: n.shift ? n.key : undefined, ringsOver: n.rings ? round(n.rings) : undefined
    })),
    hits: hits,
    sync: [
      { t: tl.hard.no1, what: 'HARD: NO 1. Out of 0.375 s of silence: thud at 51.9 Hz, bass Ab1 (choked), bass drum, one brush slap; then the band is out' },
      { t: tl.hard.no2, what: 'HARD: NO 2. Out of 0.375 s of silence: thud at 46.2 Hz, bass F#1 (choked), bass drum, one brush slap; then the band is out' },
      { t: tl.hard.slab, what: 'HARD: the slab. Out of 0.375 s of silence: thud at 49.0 Hz, bass G1 (ringing), bass drum, piano Gm9 (rolled over 41 ms from the frame)' }
    ].concat(tl.passes.map((t, i) => ({ t: t, what: 'SOFT: PASS ' + (i + 1) + '. Piano ' + chart.GATE_NOTES[i] + '; one more layer of the kit starts' })))
      .concat([
        { t: tl.score.ideas[1].gates[0].lift, what: 'idea 2 passes COST: piano G4, once' },
        { t: tl.winner, what: 'SOFT: the winner. Bass G3, the top of its range; the piano strikes the four gate notes together (G4 Bb4 D5 F5), once; the ride enters' },
        { t: tl.sleeve, what: 'SOFT: the sleeve. The title line starts (C3); the brushes meet the four title lines' },
        { t: tl.positive, what: 'SOFT: back to positive. The tag in half notes: F3, D3, Bb2, a rest, then G2 and the last chord at 42 s, and G1 once more at 44 s' }
      ]).sort((a, b) => a.t - b.t),
    instruments: { bass: INST.bass.name, keys: INST.keys.name, drums: INST.drums.name + ' (struck strokes, and a continuous stir made from its key 40 recording)', fx: 'kit synth: three tuned thuds and the room tone (low-passed at ' + MIX.tone.lp + ' Hz)' },
    bassMidiOffset: 12 * INST.bass.octave, keysMidiOffset: 12 * INST.keys.octave
  };
  fs.writeFileSync(path.join(HERE, 'arrangement.json'), JSON.stringify(arrangement, null, 1) + '\n');
  function round(x) { return Math.round(x * 1e5) / 1e5; }

  /* --- what this build measured about itself, for the report --- */
  const numbers = {
    seed: SEED, instruments: INST, mix: MIX, thuds: THUDS, gains: gains, rides: rides, toneDbBeforeMaster: toneDb, kitPeaks: numbersDrums,
    stir: { strokePeak10Db: strokeDb, crestUnderStrokeDb: D.bed.underStroke, gainDb: bedGain }, strokePasses: strokes.passes,
    bassBorrowed: bassNotes.filter((n) => n.shift !== 0).map((n) => ({ t: round(n.t), note: n.note, fromKey: n.key })),
    tone: { tiltDbPerOct: tone.slopeDbPerOct, presenceDb: tone.bands.presence, airDb: tone.bands.air, below50Db: tone.below50Db },
    bassAbove150: { sampled: bassRaw150, mixed: bass150, stem: above150(stems.bass) },
    master: { inputLufs: info.inputLufs, gainDb: info.gainDb, comp: info.comp, limiter: info.limiter, lufs: info.lufs, truePeakDb: info.truePeakDb, lra: info.lra, passes: info.passes },
    seconds: (Date.now() - STARTED) / 1000
  };
  fs.writeFileSync(path.join(HERE, 'build-numbers.json'), JSON.stringify(numbers, null, 1) + '\n');
  log('wrote final.wav, stems/, arrangement.json, build-numbers.json');

  /* --- the checks: the kit's, then this candidate's own --- */
  const kitResult = kit.checks.run({ file: path.join(HERE, 'final.wav'), sync: tl.sync, breath: [20.3, 22], lufs: [-16.5, -15.5], ceilingDb: -2, lra: [5, 12] });
  const own = checkChart.run({ dir: HERE });
  console.log('chart checks:');
  for (const r of own.rows) { console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.what + ': ' + r.measured + (r.ok || !r.note ? '' : '  [' + r.note + ']')); }
  console.log(own.ok ? '  all ' + own.rows.length + ' chart checks passed' : '  ' + own.rows.filter((r) => !r.ok).length + ' of ' + own.rows.length + ' chart checks FAILED');
  fs.writeFileSync(path.join(HERE, 'check-results.json'), JSON.stringify({ kit: { ok: kitResult.ok, rows: kitResult.rows, failures: kitResult.failures, numbers: kitResult.numbers }, chart: { ok: own.ok, rows: own.rows, played: own.played, sound: own.sound } }, null, 1) + '\n');
  log('done in ' + ((Date.now() - STARTED) / 1000).toFixed(1) + ' s');
  return kitResult.ok && own.ok;
}

let ok = false;
try { ok = main(); }
catch (e) { console.error(e && e.stack ? e.stack : String(e)); process.exit(2); }
process.exit(ok ? 0 : 1);
