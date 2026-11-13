/*
 * tools/score/lib/example/build.js: a complete miniature candidate, to copy from.
 *
 *   node tools/score/lib/example/build.js      rebuilds everything here from scratch; exits 0 only if the checks pass
 *
 * It is NOT a score: eight bars of trio (bars 1 to 8 of the film) and the three
 * HARD hits, so that every step a candidate needs is here once and working:
 *
 *   times from the timeline -> notes (seeded humanising) -> the sampler, one
 *   render per instrument -> each stem treated and placed -> the room -> levels
 *   set by measuring -> thuds and room tone -> the master -> the files of the
 *   contract (BRIEF.md section 5) -> the kit's checks -> the kit's analysis.
 *
 * A candidate lives in tools/score/<key>/ and writes require('../lib').
 * Every choice of preset and key below is taken from lib/audition/audition.md.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const kit = require('..');
const { N } = kit.const;
const { dsp, mix, synth, sampler, wav } = kit;
const tl = kit.timeline.load();

const OUT = __dirname;
const SWING = 0.64;                              // the "and" sits 64 percent of the way through the beat
const started = Date.now();

/* ------------------------------------------------------------ the players */
const BASS = { font: 'musescore', bank: 0, program: 32 };    // Acoustic Bass: 0.40 s release, so notes ring into each other
const KEYS = { font: 'musescore', bank: 8, program: 0 };     // Mellow Grand: the darkest piano, two velocity layers
const KIT = { font: 'fluidr3', bank: 128, program: 40 };     // Brush: 38 tap, 39 slap, 40 swirl; 51 ride; 44 pedal hat; 35/36 kick

const rnd = dsp.rng(1959);                       // every "random" number comes from here: the build is the same every time
const late = function (ms) { return dsp.gauss(rnd) * ms / 1000; };      // seconds, about `ms` of spread
const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
const at = function (bar, beat) { return tl.at(bar, beat, { swing: SWING }); };

const notes = [];                                // arrangement.json: what was actually played, after humanising
const hits = [];
const played = { bass: [], bassHit: [], keys: [], keysHit: [], brush: [], cymbal: [], kick: [] };
function play(list, inst, t, dur, midi, vel) {
  const n = { t: t, dur: dur, midi: midi, vel: clamp(vel, 0.05, 1) };
  played[list].push(n);
  notes.push({ t: +t.toFixed(4), dur: +dur.toFixed(4), inst: inst, midi: midi, vel: +n.vel.toFixed(3) });
}
function strike(list, kind, t, key, vel) {
  const n = { t: t, midi: key, vel: clamp(vel, 0.05, 1) };
  played[list].push(n);
  hits.push({ t: +t.toFixed(4), inst: 'drums', kind: kind, vel: +n.vel.toFixed(3) });
}
/* A HARD hit: start the note early by its own measured attack, so that it SOUNDS on the frame. */
function onTheFrame(preset, list, inst, T, dur, midi, vel) {
  const lead = sampler.onset({ font: preset.font, bank: preset.bank, program: preset.program, midi: midi, vel: vel });
  play(list, inst, T - lead, dur, midi, vel);
}

/* ------------------------------------------------------------ the chart */
const CHORDS = ['Cm9', 'Cm9', 'Fm9', 'G7b13', 'Cm9 (NO 1: stop-time)', '-', 'Cm9', 'G7b13', 'G7b13 (NO 2)',
  '-', '-', '-', '-', '-', '-', '-', '-', '-', 'Cm6/9 (the slab)', '-', '-', '-', '-'];
const VOICING = { Cm9: [51, 55, 58, 62], Fm9: [51, 55, 56, 60], G7b13: [53, 59, 63], Cm69: [51, 55, 57, 62] };   // rootless
const WALK = { 1: [36, 39, 43, 35], 2: [36, 31, 34, 40], 3: [41, 44, 48, 42], 4: [43, 47, 50, 37], 7: [36, 43, 39, 38], 8: [43, 41, 38, 35] };
const NO1 = tl.hard.no1, NO2 = tl.hard.no2, SLAB = tl.hard.slab;

/* the bass: four to the bar, a hair behind the beat. The zones on keys 30-36 and 42-46 are about 3 dB
 * quieter than their neighbours (audition.md, section 4): a little more velocity there evens the line out. */
const zoneTrim = function (key) { return (key >= 30 && key <= 36) || (key >= 42 && key <= 46) ? 1.25 : 1; };
for (const bar of Object.keys(WALK).map(Number)) {
  WALK[bar].forEach(function (key, i) {
    const t = at(bar, i + 1) + 0.006 + late(3);
    let dur = 0.47 + late(12);
    if (t + dur > NO1 - 0.08 && t < NO1) { dur = NO1 - 0.08 - t; }           // nothing is held across the NO
    play('bass', 'bass', t, dur, key, (0.62 + (i === 0 ? 0.07 : 0) + late(30)) * zoneTrim(key));
  });
}
onTheFrame(BASS, 'bassHit', 'bass', NO1, 0.5, 36, 0.9);
onTheFrame(BASS, 'bassHit', 'bass', NO2, 0.5, 31, 0.85);
onTheFrame(BASS, 'bassHit', 'bass', SLAB, 1.5, 36, 0.9);

/* the piano: a few stabs, rolled a little from the bottom; under vel 0.85 it stays on the MF recording */
const STABS = [[1, 2.5, 'Cm9', 0.30, 0.50], [2, 4, 'Cm9', 0.22, 0.44], [3, 1.5, 'Fm9', 0.35, 0.55], [3, 4, 'Fm9', 0.20, 0.46],
  [4, 2.5, 'G7b13', 0.30, 0.60], [4, 4, 'G7b13', 0.18, 0.62], [7, 2.5, 'Cm9', 0.30, 0.45], [8, 3, 'G7b13', 0.40, 0.42]];
for (const [bar, beat, chord, dur, vel] of STABS) {
  const t0 = at(bar, beat) + late(5);
  VOICING[chord].forEach(function (key, i, all) {
    play('keys', 'keys', t0 + i * 0.004 + late(1.5), dur + late(15), key, vel + (i === all.length - 1 ? 0.05 : 0) + late(25));
  });
}
for (const [T, chord, dur, vel] of [[NO1, 'Cm9', 0.6, 0.8], [NO2, 'G7b13', 0.6, 0.72], [SLAB, 'Cm69', 2.0, 0.8]]) {
  for (const key of VOICING[chord]) { onTheFrame(KEYS, 'keysHit', 'keys', T, dur, key, vel); }
}

/* the drums. The swirl (key 40) is a 0.6 s one-shot, so the "shhh" is a stroke on every swung eighth, each
 * at its own velocity; taps (38) on 2 and 4; the ride, the pedal hat and a feathered kick only in bars 3 and 4. */
for (const bar of [1, 2, 3, 4, 7, 8]) {
  for (let beat = 1; beat <= 4; beat++) {
    strike('brush', 'swirl', at(bar, beat) + late(4), 40, 0.36 + late(30));
    strike('brush', 'swirl', at(bar, beat + 0.5) + late(5), 40, 0.27 + late(30));
    if (beat === 2 || beat === 4) { strike('brush', bar === 4 && beat === 4 ? 'slap' : 'tap', at(bar, beat) + late(3), bar === 4 && beat === 4 ? 39 : 38, 0.52 + late(40)); }
    if (bar === 3 || bar === 4) {
      strike('cymbal', 'ride', at(bar, beat) + late(3), 51, (beat % 2 === 0 ? 0.36 : 0.28) + late(25));
      if (beat % 2 === 0) { strike('cymbal', 'ride', at(bar, beat + 0.5) + late(4), 51, 0.24 + late(25)); strike('cymbal', 'pedal hat', at(bar, beat) + late(3), 44, 0.3 + late(25)); }
      strike('kick', 'kick', at(bar, beat) + late(3), beat % 2 ? 36 : 35, 0.27 + late(20));    // 35 and 36: one recording a semitone apart
    }
  }
}

/* ------------------------------------------------------------ render: one fluidsynth run per list */
const render = function (preset, list) { return sampler.render(Object.assign({ notes: played[list] }, preset)); };   // -> Stereo, N long
const raw = {
  bass: render(BASS, 'bass'), bassHit: render(BASS, 'bassHit'), keys: render(KEYS, 'keys'), keysHit: render(KEYS, 'keysHit'),
  brush: render(KIT, 'brush'), cymbal: render(KIT, 'cymbal'), kick: render(KIT, 'kick')
};

/* stop-time: the band stops for the NO; only the hit and its tail go on. The running parts are choked (a
 * 30 ms fade) so that the last 45 ms before the hit are air, and kept shut until bar 7; the hits were rendered
 * apart, so they ring. The air is not decoration: checks.js calls a HARD hit found only where 2 ms are 12 dB
 * above the 40 ms before them, and a band at full level right up to the frame hides the hit from it (with the
 * band cut 1 ms before the hit this build failed "sync: NO 1"). */
const AIR = 0.045;
for (const name of ['bass', 'keys', 'brush', 'cymbal', 'kick']) {
  dsp.fade(raw[name], NO1 - AIR - 0.03, NO1 - AIR, 1, 0);
  dsp.fade(raw[name], NO1 - AIR, at(7, 1) - 0.02, 0, 0);
}

/* ------------------------------------------------------------ treat and place each stem */
const stems = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo() };

// bass: centre. Its low notes have 1 percent of their energy above 150 Hz and the brief wants a quarter of the
// stem's energy there (small speakers). So: harmonics from a saturated copy, kept to 150-1200 Hz, added until the
// MEASURED share is 30 percent. (dsp.saturate(stem, 0.35) on its own left this line at 9 percent.)
mix.add(stems.bass, raw.bass); mix.add(stems.bass, raw.bassHit);
dsp.eq(stems.bass, [{ type: 'hp', f: 35, q: 0.7 }]);
const shareAbove = function (st, hz) { const hi = dsp.copy(st); dsp.butter(hi, 'hp', hz, 4); return Math.pow(dsp.rms(hi) / dsp.rms(st), 2); };
const bassShareBefore = shareAbove(stems.bass, 150);
const grit = dsp.copy(stems.bass);
dsp.saturate(grit, 1); dsp.butter(grit, 'hp', 150, 4); dsp.butter(grit, 'lp', 1200, 4);
let gLow = 0, gHigh = 16;                         // the linear gain of the added harmonics, found by bisection
for (let i = 0; i < 12; i++) {
  const g = (gLow + gHigh) / 2, probe = dsp.copy(stems.bass);
  mix.add(probe, grit, { db: dsp.db(g) });
  if (shareAbove(probe, 150) < 0.30) { gLow = g; } else { gHigh = g; }
}
mix.add(stems.bass, grit, { db: dsp.db(gHigh) });
const bassShare = shareAbove(stems.bass, 150);

// keys: the piano is a wide recording whose notes lean left and right, so it is folded to one channel and then placed.
const piano = dsp.stereo();
mix.add(piano, raw.keys); mix.add(piano, raw.keysHit);
mix.add(stems.keys, dsp.mono(piano), { pan: -0.25 });
dsp.eq(stems.keys, [{ type: 'hp', f: 110, q: 0.7 }]);

// drums: brushes high-passed (the swirl rumbles under 60 Hz) and dipped where they are harsh; cymbals darkened; kick as it is.
dsp.eq(raw.brush, [{ type: 'hp', f: 180, q: 0.7 }, { type: 'peak', f: 3500, q: 1, db: -3 }]);
dsp.butter(raw.cymbal, 'lp', 7000, 4);
dsp.eq(raw.cymbal, [{ type: 'highshelf', f: 5000, q: 0.7, db: -6 }]);
mix.add(stems.drums, raw.brush, { pan: 0.25 });
mix.add(stems.drums, raw.cymbal, { pan: 0.3, db: -4 });
mix.add(stems.drums, raw.kick, { pan: 0.1, db: -3 });

// levels by measuring, not by ear: in the full trio (bars 3 and 4) the keys sit 6.5 dB and the drums 12 dB under the bass.
const trio = [at(3, 1), at(5, 1)];
const under = function (stem, by) { dsp.gain(stem, -by - (dsp.rmsDb(stem, trio[0], trio[1]) - dsp.rmsDb(stems.bass, trio[0], trio[1]))); };
under(stems.keys, 6.5);
under(stems.drums, 12);

// the NO: the kit's thud, on the frame, a little bigger each time
const thuds = [[NO1, { hz: 55, size: 1, rattle: 0.3, seed: 1 }], [NO2, { hz: 55, size: 1.15, rattle: 0.25, seed: 2 }], [SLAB, { hz: 49, size: 1.4, rattle: 0.15, seed: 3 }]];
for (const [T, opts] of thuds) {
  mix.add(stems.fx, synth.thud(opts), { at: T, db: dsp.rmsDb(stems.bass, trio[0], trio[1]) + 22 });
  hits.push({ t: T, inst: 'fx', kind: 'thud', vel: 1 });
}

/* ------------------------------------------------------------ the room: each stem carries its own share of it */
const ROOM = { decay: 0.75, damp: 0.6, predelay: 0.012, seed: 7 };
const SEND = { bass: -26, keys: -11, drums: -9, fx: -16 };        // dB: the bass almost dry
for (const name of Object.keys(stems)) {
  const send = dsp.copy(stems[name]);
  dsp.gain(send, SEND[name]);
  mix.add(stems[name], mix.room(send, ROOM));
}

/* ------------------------------------------------------------ the master, and room tone that ends up at -68 dBFS */
const MASTER = { hp: 30, shelf: { f: 8000, db: -3 }, comp: { threshold: -18, ratio: 2 }, lufs: -16, ceilingDb: -2 };
const sum = function () { const m = dsp.stereo(); for (const name of Object.keys(stems)) { mix.add(m, stems[name]); } return m; };
const trial = mix.master(sum(), MASTER);            // only to learn the master's gain: the tone moves with it
mix.add(stems.fx, synth.roomTone({ db: -68 - trial.info.gainDb, seed: 1 }));
for (const name of Object.keys(stems)) { dsp.fade(stems[name], tl.duration - 0.3, tl.duration, 1, 0); }    // the 300 ms safety fade
const final = mix.master(sum(), MASTER);            // the stems' sum, through the master, is final.wav

/* ------------------------------------------------------------ the files of the contract */
fs.mkdirSync(path.join(OUT, 'stems'), { recursive: true });
let clipped = wav.write(path.join(OUT, 'final.wav'), final, { bits: 24 });
for (const name of Object.keys(stems)) { clipped += wav.write(path.join(OUT, 'stems', name + '.wav'), stems[name], { bits: 24 }); }
notes.sort(function (a, b) { return a.t - b.t; });
hits.sort(function (a, b) { return a.t - b.t; });
fs.writeFileSync(path.join(OUT, 'arrangement.json'), JSON.stringify({
  key: 'C minor', bpm: tl.bpm, swing: SWING, chords: CHORDS, notes: notes, hits: hits,
  sync: tl.sync.map(function (s) { return { t: s.t, what: s.name }; })
}, null, 1) + '\n');

/* ------------------------------------------------------------ the self-checks, then the analysis */
const result = kit.checks.run({ file: path.join(OUT, 'final.wav'), sync: tl.sync, breath: [20.3, 22], lufs: [-16.5, -15.5], ceilingDb: -2, lra: [5, 12] });
const failures = result.failures.slice();
if (clipped) { failures.push(clipped + ' samples clipped when the files were written'); }
if (final[0].length !== N) { failures.push('final is ' + final[0].length + ' samples, not ' + N); }
const rel = function (name) { return dsp.rmsDb(stems[name], trio[0], trio[1]) - dsp.rmsDb(stems.bass, trio[0], trio[1]); };
if (bassShare < 0.25) { failures.push('only ' + (100 * bassShare).toFixed(0) + ' percent of the bass stem is above 150 Hz (wanted a quarter)'); }
if (rel('keys') > -3 || rel('keys') < -10) { failures.push('keys are ' + rel('keys').toFixed(1) + ' dB against the bass in the trio (wanted -3 to -10)'); }
if (rel('drums') > -8 || rel('drums') < -16) { failures.push('drums are ' + rel('drums').toFixed(1) + ' dB against the bass in the trio (wanted -8 to -16)'); }

let analysis = 'not made';
try {
  kit.analyze.run(path.join(OUT, 'final.wav'), { outDir: path.join(OUT, 'analysis'), stemsDir: path.join(OUT, 'stems') });
  analysis = 'analysis/numbers.md and the pictures beside it';
} catch (e) { failures.push('the analysis failed: ' + e.message); }

const info = final.info, num = result.numbers;
const f1 = function (x) { return typeof x === 'number' && isFinite(x) ? x.toFixed(1) : String(x); };
fs.writeFileSync(path.join(OUT, 'report.md'), [
  '# The example: a miniature candidate',
  '',
  '## The idea',
  '',
  'Not a score. Eight bars of trio (bars 1 to 8) and the three HARD hits, built with every step a candidate needs:',
  'the timeline, seeded humanising, one sampler render per instrument, stems, the room, levels set by measuring,',
  'the thuds, room tone, the master, the contract\'s files, the checks and the analysis.',
  'The band is choked 45 ms before NO 1 (8.000 s) and comes back thin in bar 7; NO 2 and the slab are a thud, a bass note and a chord.',
  'Copy the method, not the notes.',
  '',
  '## The instruments',
  '',
  '| part | library, preset | why (lib/audition/audition.md) |',
  '|---|---|---|',
  '| bass | musescore 000-032 Acoustic Bass | notes take 0.40 s to die after the note-off (fluidr3: 0.12 s); MIDI 36 is C2, 65.4 Hz |',
  '| keys | musescore 008-000 Mellow Grand Piano | the darkest piano (centroid 570 Hz at C4), two velocity layers; folded to one channel because single notes lean up to 6.5 dB |',
  '| drums | fluidr3 128-040 Brush | 38 tap, 39 slap, 40 swirl (a 0.6 s one-shot, struck on every swung eighth); 51 ride; 44 pedal hat; 35 and 36 kick |',
  '| the NO | synth.thud | 55, 55 and 49 Hz, each a little bigger |',
  '',
  '## The chart',
  '',
  '| bar | chord | bass | what happens |',
  '|---|---|---|---|',
].concat(CHORDS.map(function (c, i) {
  const bar = i + 1;
  const what = bar <= 2 ? 'bass, brushes, a piano stab' : bar <= 4 ? 'the full trio: ride, pedal hat, feathered kick' : bar === 5 ? 'NO 1 at 8.000 s: thud, C2 and the chord; the band is cut' : bar === 7 || bar === 8 ? 'thin again: bass, brushes, one stab' : bar === 9 ? 'NO 2 at 17.000 s: thud, G1 and the chord' : bar === 19 ? 'the slab at 37.000 s: thud, C2 and the home chord, left to ring' : 'room tone';
  return '| ' + bar + ' | ' + c + ' | ' + (WALK[bar] ? WALK[bar].join(' ') : '-') + ' | ' + what + ' |';
})).concat([
  '',
  '## The mix chain',
  '',
  '- bass: centre, high-pass 35 Hz, harmonics (a saturated copy, 150 to 1200 Hz) added at ' + f1(dsp.db(gHigh)) + ' dB so that ' + (100 * bassShare).toFixed(0) + ' percent of the stem is above 150 Hz (it was ' + (100 * bassShareBefore).toFixed(0) + ' percent), room send ' + SEND.bass + ' dB.',
  '- keys: folded to mono, pan -0.25, high-pass 110 Hz, set ' + f1(-rel('keys')) + ' dB under the bass in bars 3 and 4, room send ' + SEND.keys + ' dB.',
  '- drums: brushes high-passed at 180 Hz with a 3 dB dip at 3.5 kHz; cymbals low-passed at 7 kHz with a -6 dB shelf from 5 kHz; pan 0.1 to 0.3; set ' + f1(-rel('drums')) + ' dB under the bass; room send ' + SEND.drums + ' dB.',
  '- fx: three thuds on the frame, room send ' + SEND.fx + ' dB; room tone added at ' + f1(-68 - trial.info.gainDb) + ' dBFS so that it is at -68 dBFS after the master\'s ' + f1(info.gainDb) + ' dB.',
  '- room: mix.room decay ' + ROOM.decay + ' s, damp ' + ROOM.damp + '; each stem carries its own share.',
  '- master: high-pass 30 Hz, shelf -3 dB at 8 kHz, compressor 2:1 at -18, to -16 LUFS under -2 dBTP (the limiter took off at most ' + f1(info.limiter.maxReductionDb) + ' dB).',
  '',
  '## The measurements (checks.js on final.wav)',
  '',
  '| check | measured | target | |',
  '|---|---|---|---|',
]).concat(result.rows.map(function (r) { return '| ' + r.name + ' | ' + r.measured + ' | ' + r.target + ' | ' + (r.ok ? 'pass' : 'FAIL') + ' |'; })).concat([
  '',
  'In the trio (bars 3 and 4), against the bass stem: keys ' + f1(rel('keys')) + ' dB, drums ' + f1(rel('drums')) + ' dB. Integrated loudness ' + f1(num.lufs) + ' LUFS, range ' + f1(num.lra) + ' LU.',
  '',
  '## What was looked at',
  '',
  'Nothing was heard. This script looks at nothing either: it measures. The pictures and the long list of numbers are in ' + analysis + '.',
  '',
  '## Known weaknesses',
  '',
  '- It is an example of the method. The music is 16 seconds long and was not composed to the brief\'s shape.',
  '- Thirty seconds of it are room tone, so the loudness range and the long-term spectrum say little about a real candidate, and the analysis targets that look at 30 to 36 s (the stem balance) find no music there. The targets that fail in analysis/numbers.md fail for that reason or because nobody balanced the tone of 16 seconds.',
  '- The brushes are one recording per key: the swirl strokes differ only in level and timing.',
  ''
]).join('\n'));

console.log('example: ' + notes.length + ' notes, ' + hits.length + ' hits; master gain ' + f1(info.gainDb) + ' dB; built in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
if (failures.length) { console.error('FAILED:\n  - ' + failures.join('\n  - ')); process.exit(1); }
console.log('All checks passed.');
