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
 * The piano plays seven times.
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
const DRUM_KEY = { swirl: 40, tapA: 38, tapB: 39, skip: 38, hat: 44, kick: 36, ride: 51 };

/* ------------------------------------------------------------------ the mix, in one place */
const MIX = {
  bass: {
    pan: 0, send: -24,
    harmonics: { inLp: 120, drive: 3.2, bias: 0.22, lo: 150, hi: 1000, db: 0 },
    eq: [{ type: 'lowshelf', f: 90, db: -6.5 }, { type: 'peak', f: 800, q: 0.8, db: 3 }, { type: 'peak', f: 1600, q: 0.9, db: 4 }, { type: 'lp', f: 5000, q: 0.7071 }]
  },
  keys: {
    pan: -0.3, send: -11, width: 0.5, underBass: 8,          // RMS under the bass while the four PASS notes play
    chordUnderBass: { slab: 4.5, last: 5 },                  // and the two chords, each against the bass in its own window
    eq: [{ type: 'hp', f: 140, q: 0.7071 }, { type: 'peak', f: 3000, q: 1.1, db: -3 }, { type: 'lp', f: 6000, q: 0.7071 }]
  },
  drums: {
    underBass: 10.5,                                         // RMS under the bass, 30 to 36.5 s
    peakUnderBass: 0,                                        // no stroke may stand higher than the bass's own peaks (a brush tap is all peak)
    touch: { swirl: 0.12, tap: -0.07, skip: -0.05, hat: 0, ride: 0, kick: 0 },   // more stir than tap: the brushes' level comes from the swirl, not from spikes
    brush: { db: 0, pan: 0.24, send: -9, eq: [{ type: 'hp', f: 170, q: 0.7071 }, { type: 'peak', f: 3600, q: 1, db: -2 }, { type: 'lp', f: 9000, q: 0.7071 }] },
    cym: { db: -2.5, pan: 0.34, send: -12, eq: [{ type: 'hp', f: 450, q: 0.7071 }, { type: 'lp', f: 7000, q: 0.7071 }, { type: 'lp', f: 9000, q: 0.7071 }] },
    kick: { db: -9, pan: 0.08, send: -20, eq: [{ type: 'hp', f: 38, q: 0.7071 }, { type: 'lp', f: 2200, q: 0.7071 }] }
  },
  thud: { send: -18 },                                      // each thud's own level is in THUDS
  room: { decay: 0.75, damp: 0.6, predelay: 0.014, seed: 2 },
  tone: { db: -68, seed: 5 },                                // where the room tone sits in final.wav
  master: { hp: 30, shelf: { f: 8000, db: -3 }, comp: { threshold: -18, ratio: 2 }, lufs: -16, ceilingDb: -2 }
};
/* The three NOs: each thud is tuned to the bass note it lands with. */
const THUDS = [
  { name: 'NO 1', t: tl.hard.no1, note: 'Ab1', size: 1.0, rattle: 0.3, seed: 1, db: -14 },
  { name: 'NO 2', t: tl.hard.no2, note: 'F#1', size: 0.85, rattle: 0.25, seed: 2, db: -13 },
  { name: 'the slab', t: tl.hard.slab, note: 'G1', size: 1.4, rattle: 0.12, seed: 3, db: -15 }
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

/* The bass. Behind the beat by 4 to 12 ms, drifting as a player drifts (not jumping from note to note);
 * the swing breathes a little; velocities lean where the chart says and wobble; quarters are nearly legato. */
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
  let lag = 0.008;
  const out = chart.BASS.map((n) => {
    const midi = n.midi + 12 * INST.bass.octave;
    if (n.hard) {
      const t = tl.at(n.bar, n.beat);
      return { src: n, midi: midi, vel: n.vel, t: t - onsetOf(INST.bass, midi, n.vel), lands: t };
    }
    lag = clamp(lag + dsp.gauss(r) * 0.0011, 0.0046, 0.0114);
    const swing = chart.SWING + (r() - 0.5) * 0.012;
    const t = when(n.bar, n.beat, n.kind, swing) + lag + (r() - 0.5) * 0.0008;
    return { src: n, midi: midi, vel: clamp((n.vel + dsp.gauss(r) * 0.02) * zone(midi), 0.2, 1), t: t };
  });
  out.forEach((e, i) => {
    const n = e.src, next = out[i + 1];
    const written = n.len * BEAT;
    if (n.choke || n.ring || n.stac || n.hard) { e.dur = written; return; }
    const quick = n.kind !== 'beat' || n.len < 1;
    const gap = quick ? 0.012 + r() * 0.008 : 0.024 + r() * 0.02;       // the finger leaving the string
    const toNext = next ? next.t - e.t : Infinity;
    e.dur = Math.max(0.05, (toNext <= written + 0.12 ? toNext : written) - gap);
  });
  return out.map((e) => ({ t: sampler.startOf(e.t), dur: e.dur, inst: 'bass', midi: e.midi, vel: e.vel, note: e.src.note, lands: e.lands }));
}

/* The piano. Seven events. A single note is a hair late; the last chord is rolled; the slab chord is exact. */
function playKeys() {
  const r = dsp.rng(SEED + 2);
  const out = [];
  for (const ev of chart.KEYS) {
    const T = tl.at(ev.bar, ev.beat);
    const count = ev.midis.length;
    ev.midis.forEach((m, i) => {
      const midi = m + 12 * INST.keys.octave;
      const top = i === count - 1, bottom = i === 0;
      let t, vel;
      if (ev.hard) {                                   // not humanised: voiced (top and bottom a little out front), each note started early by its own measured onset
        vel = clamp(ev.vel + (top ? 0.03 : (bottom ? 0 : -0.05)), 0.1, 0.84);
        t = T - onsetOf(INST.keys, midi, vel);
      } else if (ev.roll) {                            // bottom to top, about 25 ms a note
        vel = clamp(ev.vel + (top ? 0.05 : (bottom ? -0.01 : -0.06)) + dsp.gauss(r) * 0.012, 0.1, 0.84);
        t = T + 0.004 + i * (0.02 + r() * 0.012);
      } else {
        vel = clamp(ev.vel + dsp.gauss(r) * 0.01, 0.1, 0.84);
        t = T + 0.002 + r() * 0.007;
      }
      out.push({ t: sampler.startOf(t), dur: ev.len * BEAT, inst: 'keys', midi: midi, vel: vel, note: ev.notes[i], lands: ev.hard ? T : undefined, event: ev });
    });
  }
  return out;
}

/* The kit. Brushes a hair either side of the beat, the ride 0 to 6 ms ahead (drifting), the hi-hat started early
 * because its "chick" comes 20 ms after the foot moves (audition: the peak is 21 to 25 ms after the note-on). */
function playDrums() {
  const r = dsp.rng(SEED + 3);
  const hits = [];
  let lead = 0.003, taps = 0;
  const lastVel = {};
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
      else if (h.voice === 'skip') { key = DRUM_KEY.skip; t = T + (r() - 0.4) * 0.005; }
      else if (h.voice === 'hat') { key = DRUM_KEY.hat; t = T - 0.018 + (r() - 0.5) * 0.004; }
      else if (h.voice === 'ride') { lead = clamp(lead + dsp.gauss(r) * 0.0007, 0.0004, 0.0056); key = DRUM_KEY.ride; t = T - lead; }
      else if (h.voice === 'kick') { key = DRUM_KEY.kick; t = T + (r() - 0.5) * 0.006; }
      else { throw new Error('minimal/build: the chart has a drum voice this build does not know: ' + h.voice); }
      if (h.hard) { vel = h.vel; t = T - onsetOf(INST.drums, key, vel); }
      vel = clamp(vel, 0.14, 1);
      let v127 = Math.max(1, Math.round(vel * 127));
      if (lastVel[h.voice] === v127) { v127 += v127 < 120 ? 2 : -2; }       // never the same stroke twice running
      lastVel[h.voice] = v127;
      hits.push({ t: sampler.startOf(t), inst: 'drums', kind: h.voice, midi: key, vel: v127 / 127, lands: h.hard ? T : undefined });
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

/* ------------------------------------------------------------------ build */
function main() {
  log('minimal: ' + chart.KEY + ', ' + chart.BPM + ' BPM, swing ' + chart.SWING + ', seed ' + SEED);
  const bassNotes = playBass(), keysNotes = playKeys(), drumHits = playDrums();
  log('performed: ' + bassNotes.length + ' bass notes, ' + keysNotes.length + ' piano notes in ' + chart.KEYS.length + ' events, ' + drumHits.length + ' drum strokes');

  /* --- render: recorded instruments, dry (the kit turns fluidsynth's reverb and chorus off) --- */
  const plain = (list) => list.map((n) => ({ t: n.t, dur: n.dur, midi: n.midi, vel: n.vel }));
  const renderKit = (kinds, dur) => sampler.render(Object.assign({}, pick(INST.drums), { notes: drumHits.filter((h) => kinds.includes(h.kind)).map((h) => ({ t: h.t, dur: dur(h), midi: h.midi, vel: h.vel })) }));
  function pick(inst) { return { font: inst.font, bank: inst.bank, program: inst.program }; }
  const bass = toMono(sampler.render(Object.assign({}, pick(INST.bass), { notes: plain(bassNotes) })));
  log('rendered the bass');
  const keys = sampler.render(Object.assign({}, pick(INST.keys), { notes: plain(keysNotes) }));
  log('rendered the piano');
  /* one kit, three passes over it, so the brushes, the cymbals and the bass drum can each have their own tone control */
  const brush = renderKit(['swirl', 'tap', 'skip'], () => 0.4);
  const cym = renderKit(['hat', 'ride'], (h) => (h.kind === 'ride' ? 1.6 : 0.25));
  const kick = renderKit(['kick'], () => 0.3);
  log('rendered the kit (brushes, cymbals, bass drum)');

  /* --- the bass: mono, harmonics for small speakers, tone --- */
  const bassRaw150 = above150(bass);
  dsp.eq(bass, [{ type: 'hp', f: 33, q: 0.7071 }]);
  harmonics(bass, MIX.bass.harmonics);
  dsp.eq(bass, MIX.bass.eq);
  const bass150 = above150(bass);
  log('bass: ' + f1(100 * bassRaw150) + ' percent of its energy above 150 Hz as sampled, ' + f1(100 * bass150) + ' percent after harmonics and tone');

  /* --- the piano: narrowed, darkened, and each lone note brought to the level the chart means --- */
  narrow(keys, MIX.keys.width);
  dsp.eq(keys, MIX.keys.eq);
  const rides = [];
  {
    /* The Mellow Grand's samples are uneven (audition: Bb4 and C5 are 4 dB louder than G4 at the same velocity).
     * A fader ride per lone note: each is set to the level of the first PASS note plus 0.7 dB a step, so the four climb evenly. */
    const lone = chart.KEYS.filter((ev) => ev.midis.length === 1).map((ev) => ({ ev: ev, t: tl.at(ev.bar, ev.beat) }));
    const level = (t) => dsp.rmsDb(keys, t, t + 1.0);
    const first = lone.find((x) => x.ev.pass);
    const ref = level(first.t);
    let step = 0;
    for (const x of lone) {
      const want = ref + (x.ev.pass ? 0.7 * step++ : -2.5);            // the nod of idea 2 sits under the PASS notes
      const g = want - level(x.t);
      const a = x.t - 0.08, b = x.t + x.ev.len * BEAT + 0.75;
      rides.push({ note: x.ev.notes[0], t: x.t, db: g });
      const lin = dsp.lin(g);
      dsp.fade(keys, a, a + 0.03, 1, lin); dsp.fade(keys, a + 0.03, b, lin, lin); dsp.fade(keys, b, b + 0.03, lin, 1);
    }
    log('piano fader rides: ' + rides.map((x) => x.note + ' ' + (x.db >= 0 ? '+' : '') + f1(x.db) + ' dB').join(', '));
  }

  /* --- the kit --- */
  dsp.eq(brush, MIX.drums.brush.eq); dsp.eq(cym, MIX.drums.cym.eq); dsp.eq(kick, MIX.drums.kick.eq);
  const drums = dsp.stereo();
  mix.add(drums, brush, { db: MIX.drums.brush.db, pan: MIX.drums.brush.pan });
  mix.add(drums, cym, { db: MIX.drums.cym.db, pan: MIX.drums.cym.pan });
  mix.add(drums, kick, { db: MIX.drums.kick.db, pan: MIX.drums.kick.pan });
  log('kit, before its gain: brushes peak ' + f1(dsp.db(dsp.peak(brush)) + MIX.drums.brush.db) + ' dBFS (RMS 30 to 36.5 s ' + f1(dsp.rmsDb(brush, 30, 36.5) + MIX.drums.brush.db) + '), cymbals ' +
    f1(dsp.db(dsp.peak(cym)) + MIX.drums.cym.db) + ' (' + f1(dsp.rmsDb(cym, 30, 36.5) + MIX.drums.cym.db) + '), bass drum ' + f1(dsp.db(dsp.peak(kick)) + MIX.drums.kick.db) + ' (' + f1(dsp.rmsDb(kick, 30, 36.5) + MIX.drums.kick.db) + ')');
  const drumSend = dsp.stereo();
  mix.add(drumSend, brush, { db: MIX.drums.brush.db + MIX.drums.brush.send, pan: MIX.drums.brush.pan });
  mix.add(drumSend, cym, { db: MIX.drums.cym.db + MIX.drums.cym.send, pan: MIX.drums.cym.pan });
  mix.add(drumSend, kick, { db: MIX.drums.kick.db + MIX.drums.kick.send, pan: MIX.drums.kick.pan });

  /* --- balance, by measurement: the bass is the reference --- */
  const gains = { bass: 0 };
  gains.drums = (dsp.rmsDb(bass, 30, 36.5) - MIX.drums.underBass) - dsp.rmsDb(drums, 30, 36.5);
  gains.keys = (dsp.rmsDb(bass, 22.5, 30) - MIX.keys.underBass) - dsp.rmsDb(keys, 22.5, 30);
  dsp.gain(keys, gains.keys);
  log('gains: drums ' + f1(gains.drums) + ' dB, piano ' + f1(gains.keys) + ' dB (bass 0)');
  for (const [name, a, b, under] of [['slab chord', tl.hard.slab, tl.hard.slab + 1, MIX.keys.chordUnderBass.slab], ['last chord', tl.at(21, 1), tl.at(21, 1) + 3, MIX.keys.chordUnderBass.last]]) {
    const g = (dsp.rmsDb(bass, a, b) - under) - dsp.rmsDb(keys, a, b);
    const lin = dsp.lin(g), from = a - 0.1, to = Math.min(46, a + 6.2);
    dsp.fade(keys, from, from + 0.03, 1, lin); dsp.fade(keys, from + 0.03, to, lin, lin);
    if (to < 46) { dsp.fade(keys, to, to + 0.03, lin, 1); }
    rides.push({ note: name, t: a, db: g });
    log('piano fader ride, ' + name + ': ' + (g >= 0 ? '+' : '') + f1(g) + ' dB');
  }

  /* --- stems: each instrument as it sits in the mix, with its own share of the room --- */
  const numbersDrums = {};
  const stems = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo() };
  const wetOf = (send) => mix.room(send, MIX.room);
  mix.add(stems.bass, bass, { db: gains.bass, pan: MIX.bass.pan });
  { const s = dsp.stereo(); mix.add(s, stems.bass, { db: MIX.bass.send }); mix.add(stems.bass, wetOf(s)); }
  mix.add(stems.keys, keys, { pan: MIX.keys.pan });
  { const s = dsp.stereo(); mix.add(s, stems.keys, { db: MIX.keys.send }); mix.add(stems.keys, wetOf(s)); }
  mix.add(stems.drums, drums, { db: gains.drums });
  {
    /* A brush tap is a spike a few milliseconds long: balanced by RMS it stands far above the bass and would make the
     * master's limiter duck the whole band on every stroke. So the spikes are shaved here, on the kit alone
     * (the kit's own look-ahead limiter, 2 ms ahead, 40 ms release), and the master is left with little to do. */
    const ceiling = dsp.peak(bass, 30, 36.5) * dsp.lin(-MIX.drums.peakUnderBass);
    const before = dsp.peak(stems.drums);
    const lim = mix.limitPass(stems.drums, ceiling, 0.002, 0.04);
    numbersDrums.peakBeforeDb = dsp.db(before); numbersDrums.ceilingDb = dsp.db(ceiling); numbersDrums.maxReductionDb = lim.maxReductionDb;
    numbersDrums.limitedPercent = 100 * lim.limitedSamples / N; numbersDrums.rmsChangeDb = dsp.rmsDb(stems.drums, 30, 36.5) - (dsp.rmsDb(drums, 30, 36.5) + gains.drums);
    log('kit: strokes peaked at ' + f1(dsp.db(before)) + ' dBFS, shaved to ' + f1(dsp.db(ceiling)) + ' (up to ' + f1(lim.maxReductionDb) + ' dB, ' + f2(numbersDrums.limitedPercent) + ' percent of the film); RMS changed by ' + f2(numbersDrums.rmsChangeDb) + ' dB');
  }
  { const s = dsp.stereo(); mix.add(s, drumSend, { db: gains.drums }); mix.add(stems.drums, wetOf(s)); }
  log('room: ' + JSON.stringify(MIX.room));

  /* --- the NO thuds --- */
  const thudsOnly = dsp.stereo();
  for (const th of THUDS) { mix.add(thudsOnly, synth.thud({ hz: th.hz, size: th.size, rattle: th.rattle, seed: th.seed }), { at: th.t, db: th.db }); }
  { const s = dsp.stereo(); mix.add(s, thudsOnly, { db: MIX.thud.send }); mix.add(thudsOnly, wetOf(s)); }

  /* --- the two ends: nothing starts or stops on a step; the last 300 ms fade to nothing (the loop point) --- */
  const ends = (st) => { dsp.fade(st, 0, 0.004, 0, 1); dsp.fade(st, 45.7, 46, 1, 0); return st; };
  ends(stems.bass); ends(stems.keys); ends(stems.drums); ends(thudsOnly);

  /* --- master. The room tone has to sit at -68 dBFS in final.wav, so its level before the master depends on
   *     the gain the master adds: master once to learn that gain, place the tone, master again. --- */
  const sumOf = (fx) => { const s = dsp.stereo(); for (const k of ['bass', 'keys', 'drums']) { mix.add(s, stems[k]); } mix.add(s, fx); return s; };
  let toneDb = MIX.tone.db - (MIX.master.lufs - mix.lufs(sumOf(thudsOnly)));
  let final = null;
  for (let pass = 1; pass <= 3; pass++) {
    stems.fx = dsp.copy(thudsOnly);
    mix.add(stems.fx, ends(synth.roomTone({ db: toneDb, seed: MIX.tone.seed })));
    final = mix.master(sumOf(stems.fx), MIX.master);
    const got = dsp.rmsDb(final, 20.4, 21.9);
    log('master pass ' + pass + ': room tone at ' + f1(toneDb) + ' dBFS before the master is ' + f1(got) + ' dBFS in the held breath; master gain ' + f1(final.info.gainDb) + ' dB');
    if (Math.abs(got - MIX.tone.db) <= 0.6) { break; }
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

  const hits = drumHits.map((h) => ({ t: round(h.t), inst: 'drums', kind: h.kind, vel: round(h.vel), midi: h.midi, lands: h.lands }))
    .concat(THUDS.map((th) => ({ t: th.t, inst: 'fx', kind: 'thud', vel: 1, hz: round(th.hz), note: th.note, lands: th.t })))
    .sort((a, b) => a.t - b.t);
  const arrangement = {
    key: chart.KEY, bpm: chart.BPM, swing: chart.SWING, seed: SEED,
    chords: chart.CHORDS,
    notes: bassNotes.concat(keysNotes).sort((a, b) => a.t - b.t).map((n) => ({ t: round(n.t), dur: round(n.dur), inst: n.inst, midi: n.midi, vel: round(n.vel), note: n.note, lands: n.lands })),
    hits: hits,
    sync: [
      { t: tl.hard.no1, what: 'HARD: NO 1. Thud at 51.9 Hz, bass Ab1 (choked), bass drum; then the band is out' },
      { t: tl.hard.no2, what: 'HARD: NO 2. Thud at 46.2 Hz, bass F#1 (choked), bass drum; then the band is out' },
      { t: tl.hard.slab, what: 'HARD: the slab. Thud at 49.0 Hz, bass G1 (ringing), bass drum, piano Gm9' }
    ].concat(tl.passes.map((t, i) => ({ t: t, what: 'SOFT: PASS ' + (i + 1) + '. Piano ' + chart.GATE_NOTES[i] + '; one more layer of the kit starts' })))
      .concat([
        { t: tl.score.ideas[1].gates[0].lift, what: 'idea 2 passes COST: piano G4, once' },
        { t: tl.winner, what: 'SOFT: the winner. Bass G3, the top of its range; the ride enters' },
        { t: tl.sleeve, what: 'SOFT: the sleeve. The bass drum joins (feathered); the brushes meet the four title lines' },
        { t: tl.positive, what: 'SOFT: back to positive. The tag: D3 C3 Bb2, a rest, then G2 and the last chord at 40 s' }
      ]).sort((a, b) => a.t - b.t),
    instruments: { bass: INST.bass.name, keys: INST.keys.name, drums: INST.drums.name, fx: 'kit synth: three tuned thuds and the room tone' },
    bassMidiOffset: 12 * INST.bass.octave, keysMidiOffset: 12 * INST.keys.octave
  };
  fs.writeFileSync(path.join(HERE, 'arrangement.json'), JSON.stringify(arrangement, null, 1) + '\n');
  function round(x) { return Math.round(x * 1e5) / 1e5; }

  /* --- what this build measured about itself, for the report --- */
  const numbers = {
    seed: SEED, instruments: INST, mix: MIX, thuds: THUDS, gains: gains, rides: rides, toneDbBeforeMaster: toneDb, kitPeaks: numbersDrums,
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
