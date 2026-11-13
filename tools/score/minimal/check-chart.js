/*
 * tools/score/minimal/check-chart.js: the chart, checked as data.
 *
 *   node check-chart.js            checks chart.js alone if nothing is built yet,
 *                                  and arrangement.json, stems/ and final.wav when they exist
 *
 * Every row is { id, what, measured, target, ok, note }. run() returns
 * { ok, rows, tables } and never throws for a failed check: build.js decides.
 * Nothing here is taken on trust from the build: the played notes come from
 * arrangement.json and the sound from the WAV files.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const chart = require('./chart.js');

const HERE = __dirname;
const BEAT = 60 / chart.BPM, BAR = 4 * BEAT;
const LOW = chart.midiOf('E1'), HIGH = chart.midiOf('G3');
const HARD = [8, 17, 37];
const PASSES = [22.5, 24.5, 26.5, 28.5];

function row(rows, id, what, measured, target, ok, note) { rows.push({ id: id, what: what, measured: measured, target: target, ok: !!ok, note: note || '' }); }
function f(x, d) { return Number.isFinite(x) ? x.toFixed(d === undefined ? 2 : d) : String(x); }
function nominal(bar, beat) { return (bar - 1) * BAR + (beat - 1) * BEAT; }     // straight, unswung

/* ------------------------------------------------------------------ the chart alone */
function checkChart(rows) {
  const bass = chart.BASS;
  const bars = [];
  for (let b = 1; b <= 23; b++) { bars.push(bass.filter((n) => n.bar === b)); }

  // 1. chord tones on beats 1 and 3
  const strong = [];
  let bad = 0;
  for (let b = 1; b <= 23; b++) {
    for (const beat of [1, 3]) {
      const n = bars[b - 1].find((x) => Math.abs(x.beat - beat) < 1e-6);
      if (!n) { continue; }
      const ch = chart.chordAt(b, beat);
      const ok = !!ch && ch.tones.has(n.midi % 12);
      if (!ok) { bad++; }
      strong.push({ bar: b, beat: beat, note: n.note, chord: ch ? ch.symbol : 'N.C.', ok: ok });
    }
  }
  row(rows, 'chord-tones', 'bass notes on beats 1 and 3 are chord tones', strong.length - bad + ' of ' + strong.length, 'all', bad === 0,
    strong.filter((s) => !s.ok).map((s) => 'bar ' + s.bar + ' beat ' + s.beat + ': ' + s.note + ' over ' + s.chord).join('; '));

  // 2. the approach into every bar
  const approach = [];
  let leaps = 0, unexplained = 0;
  let prev = null;
  for (let b = 1; b <= 23; b++) {
    const here = bars[b - 1];
    if (!here.length) { continue; }
    if (prev) {
      const last = prev.notes[prev.notes.length - 1], first = here[0];
      const semis = Math.abs(first.midi - last.midi);
      const step = semis === 1 || semis === 2;
      const why = step ? '' : (chart.APPROACH_EXCEPTIONS[prev.bar] || '');
      if (!step) { leaps++; if (!why) { unexplained++; } }
      approach.push({ from: prev.bar, to: b, last: last.note, first: first.note, semis: semis, step: step, why: why });
    }
    prev = { bar: b, notes: here };
  }
  row(rows, 'approach', 'last note of a bar reaches the next bar by a half or whole step', (approach.length - leaps) + ' of ' + approach.length + ' (' + leaps + ' stated exceptions)',
    'all, or a stated reason', unexplained === 0,
    approach.filter((a) => !a.step).map((a) => 'bar ' + a.from + ' to ' + a.to + ' (' + a.last + ' to ' + a.first + ', ' + a.semis + ' semitones): ' + (a.why || 'NO REASON GIVEN')).join(' | '));

  // 3. no bar twice
  const seen = new Map();
  const twins = [];
  for (let b = 1; b <= 23; b++) {
    if (!bars[b - 1].length) { continue; }
    const sig = bars[b - 1].map((n) => n.midi).join(',');
    if (seen.has(sig)) { twins.push('bars ' + seen.get(sig) + ' and ' + b); }
    seen.set(sig, b);
  }
  row(rows, 'no-twin-bars', 'no two bars hold the same bass pitches', twins.length ? twins.join('; ') : seen.size + ' bars, all different', 'none the same', twins.length === 0);

  // 4. range (sounding pitch, as written; the octave is confirmed from the sound below)
  let lo = Infinity, hi = -Infinity;
  for (const n of bass) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
  row(rows, 'range-chart', 'bass range as written (sounding)', chart.nameOf(lo) + ' to ' + chart.nameOf(hi), 'E1 to G3', lo >= LOW && hi <= HIGH);

  // 5. the gate notes: bar 1's bass motif, the keys at the PASSes, the tag backwards
  const motif = bass.filter((n) => (n.bar === 1) || (n.bar === 2 && n.beat === 1)).map((n) => n.midi % 12);
  const gates = chart.GATE_NOTES.map((s) => chart.midiOf(s) % 12);
  const passNotes = chart.KEYS.filter((k) => k.pass).map((k) => k.midis[0]);
  const tag = bass.filter((n) => n.bar === 20 || n.bar === 21).map((n) => n.midi % 12);
  const sameMotif = motif.join() === gates.join() && passNotes.map((m) => m % 12).join() === gates.join() && tag.join() === gates.slice().reverse().join();
  row(rows, 'gate-motif', 'bays (bass), PASSes (keys) and the tag (bass, backwards) use the same four notes',
    'bays ' + motif.map((p) => chart.nameOf(p + 12).replace(/-?\d+$/, '')).join(' ') + '; keys ' + passNotes.map(chart.nameOf).join(' ') + '; tag ' + tag.map((p) => chart.nameOf(p + 12).replace(/-?\d+$/, '')).join(' '),
    'G Bb C D; G Bb C D; D C Bb G', sameMotif);
  let rising = true;
  for (let i = 1; i < passNotes.length; i++) { if (!(passNotes[i] > passNotes[i - 1])) { rising = false; } }
  row(rows, 'pass-rise-chart', 'the four PASS notes rise (as written)', passNotes.map(chart.nameOf).join(' < '), 'each higher than the last', rising && passNotes.length === 4);

  // 6. the hits enclose home
  const hits = bass.filter((n) => n.hard).map((n) => n.midi);
  const home = chart.midiOf('G1');
  row(rows, 'enclosure', 'the three hard hits: a half step over home, a half step under, home', hits.map(chart.nameOf).join(', '), 'Ab1, F#1, G1',
    hits.length === 3 && hits[0] === home + 1 && hits[1] === home - 1 && hits[2] === home);

  return { strong: strong, approach: approach };
}

/* ------------------------------------------------------------------ what was played */
const SECTIONS = [
  ['dock (0 to 4 s)', 0, 4], ['idea 1 (4 to 8 s)', 4, 8], ['after NO 1 (8.4 to 10 s)', 8.4, 10], ['restart (10 to 12 s)', 10, 12],
  ['idea 2 (12 to 17 s)', 12, 17], ['after NO 2 (17.4 to 22 s)', 17.4, 22],
  ['idea 3, after PASS 1 (22 to 24 s)', 22, 24], ['idea 3, after PASS 2 (24 to 26 s)', 24, 26],
  ['idea 3, after PASS 3 (26 to 28 s)', 26, 28], ['idea 3, after PASS 4 (28 to 30 s)', 28, 30],
  ['the winner (30 to 32 s)', 30, 32], ['the title (32 to 37 s)', 32, 37], ['the tag (38 to 46 s)', 38, 46]
];

function checkPlayed(rows, arr) {
  const notes = arr.notes.slice().sort((a, b) => a.t - b.t);
  const hits = (arr.hits || []).slice().sort((a, b) => a.t - b.t);
  const bass = notes.filter((n) => n.inst === 'bass');
  const keys = notes.filter((n) => n.inst === 'keys');
  const shift = arr.bassMidiOffset || 0;                 // what the build added to reach the preset's octave
  const sounding = (n) => n.midi - shift;

  // chord tones on beats 1 and 3, from the notes as played
  let total = 0, bad = [];
  for (let b = 1; b <= 23; b++) {
    for (const beat of [1, 3]) {
      const t = nominal(b, beat);
      const n = bass.find((x) => x.t > t - 0.03 && x.t < t + 0.045);
      if (!n) { continue; }
      total++;
      const ch = chart.chordAt(b, beat);
      if (!ch || !ch.tones.has(((sounding(n) % 12) + 12) % 12)) { bad.push('bar ' + b + ' beat ' + beat + ': ' + chart.nameOf(sounding(n))); }
    }
  }
  row(rows, 'chord-tones-played', 'as played: bass on beats 1 and 3 is a chord tone', (total - bad.length) + ' of ' + total, 'all', bad.length === 0, bad.join('; '));

  // range as played
  let lo = Infinity, hi = -Infinity;
  for (const n of bass) { lo = Math.min(lo, sounding(n)); hi = Math.max(hi, sounding(n)); }
  row(rows, 'range-played', 'as played: bass range (sounding; MIDI key minus ' + shift + ')', chart.nameOf(lo) + ' to ' + chart.nameOf(hi), 'E1 to G3', lo >= LOW && hi <= HIGH);

  // swing: every off-beat eighth against its own player's beat
  const swingRows = [];
  const all = [];
  const players = { bass: bass.map((n) => n.t) };
  const HAND = { tap: 'brushes', skip: 'brushes', ride: 'ride' };      // the taps and the skip notes are one hand; the swirl, the hat and the bass drum play no eighths
  for (const h of hits) { if (HAND[h.kind]) { (players[HAND[h.kind]] = players[HAND[h.kind]] || []).push(h.t); } }
  for (const who of Object.keys(players)) {
    const ts = players[who];
    // this player's own lag: on-beat notes against the grid
    const onBeat = ts.map((t) => ({ t: t, off: t - Math.round(t / BEAT) * BEAT })).filter((x) => Math.abs(x.off) < 0.04);
    const ratios = [];
    for (const t of ts) {
      const frac = (t / BEAT) - Math.floor(t / BEAT);
      if (frac < 0.56 || frac > 0.72) { continue; }                         // not near an off-beat eighth
      if (isTriplet(who, t)) { continue; }
      const near = onBeat.filter((x) => Math.abs(x.t - t) < 1.6 * BEAT);
      const lag = near.length ? near.reduce((s, x) => s + x.off, 0) / near.length : 0;
      const r = (t - lag - Math.floor(t / BEAT) * BEAT) / BEAT;
      ratios.push(r); all.push(r);
    }
    if (ratios.length) {
      swingRows.push({ who: who, n: ratios.length, mean: ratios.reduce((s, v) => s + v, 0) / ratios.length, min: Math.min(...ratios), max: Math.max(...ratios) });
    }
  }
  const mean = all.length ? all.reduce((s, v) => s + v, 0) / all.length : NaN;
  const sMin = Math.min(...all), sMax = Math.max(...all);
  row(rows, 'swing', 'swing ratio of the off-beat eighths, each against its own player\'s beat',
    'mean ' + f(mean, 3) + ', ' + f(sMin, 3) + ' to ' + f(sMax, 3) + ' over ' + all.length + ' eighths', '0.62 to 0.66', all.length > 0 && sMin >= 0.62 && sMax <= 0.66,
    swingRows.map((s) => s.who + ' ' + f(s.mean, 3) + ' (' + s.n + ')').join(', '));

  // density
  const dens = SECTIONS.map(([name, a, b]) => {
    const nb = bass.filter((n) => n.t >= a - 0.02 && n.t < b - 0.02).length;
    const nk = keys.filter((n) => n.t >= a - 0.02 && n.t < b - 0.02).length;
    const nd = hits.filter((n) => n.inst === 'drums' && n.t >= a - 0.02 && n.t < b - 0.02).length;
    return { name: name, from: a, to: b, bass: nb, keys: nk, drums: nd, perSecond: (nb + nk + nd) / (b - a), bassPerSecond: nb / (b - a) };
  });
  const by = (s) => dens.find((d) => d.name.indexOf(s) === 0);
  const idea1 = by('idea 1'), idea2 = by('idea 2');
  const before = dens.filter((d) => d.to <= 32 && d !== idea1);
  const busiest = before.every((d) => d.perSecond < idea1.perSecond);
  row(rows, 'density-idea1', 'idea 1 is the busiest passage before the title', f(idea1.perSecond, 2) + ' events a second; next ' + f(Math.max(...before.map((d) => d.perSecond)), 2), 'the most before 32 s', busiest);
  row(rows, 'density-idea2', 'idea 2 is thinner than idea 1', f(idea2.perSecond, 2) + ' against ' + f(idea1.perSecond, 2) + ' (bass alone: ' + f(idea2.bassPerSecond, 2) + ' against ' + f(idea1.bassPerSecond, 2) + ')',
    'under half of idea 1', idea2.perSecond < 0.5 * idea1.perSecond);
  const climb = dens.filter((d) => d.name.indexOf('idea 3') === 0).map((d) => d.perSecond);
  let growing = true;
  for (let i = 1; i < climb.length; i++) { if (!(climb[i] > climb[i - 1])) { growing = false; } }
  row(rows, 'density-idea3', 'idea 3 grows at every PASS', climb.map((v) => f(v, 2)).join(' < '), 'each window busier than the last', growing && climb.length === 4);
  const quarters = bass.filter((n) => n.t >= 21.98 && n.t < 36.9);
  let steady = true;
  for (let i = 1; i < quarters.length; i++) { const gap = quarters[i].t - quarters[i - 1].t; if (Math.abs(gap - BEAT) > 0.012) { steady = false; } }
  row(rows, 'idea3-plain', 'idea 3 and the title are plain quarters: one bass note a beat from 22 s to the slab', quarters.length + ' notes, steady: ' + steady, '30 notes, one a beat', quarters.length === 30 && steady);

  // the PASS notes rise, as played
  const passNotes = PASSES.map((t) => keys.filter((n) => Math.abs(n.t - t) < 0.06).sort((a, b) => b.midi - a.midi)[0]);
  let rising = passNotes.every(Boolean);
  for (let i = 1; rising && i < passNotes.length; i++) { if (!(passNotes[i].midi > passNotes[i - 1].midi)) { rising = false; } }
  row(rows, 'pass-rise-played', 'as played: the top note at each PASS rises',
    passNotes.map((n) => (n ? chart.nameOf(n.midi - (arr.keysMidiOffset || 0)) + ' at ' + f(n.t, 3) : 'none')).join(', '), 'four notes, each higher', rising);

  // humanising: velocities and timing
  const kinds = {};
  for (const h of hits) { if (h.inst === 'drums') { (kinds[h.kind] = kinds[h.kind] || []).push(h); } }
  let repeats = 0, count = 0;
  for (const k of Object.keys(kinds)) {
    for (let i = 1; i < kinds[k].length; i++) { count++; if (Math.round(kinds[k][i].vel * 127) === Math.round(kinds[k][i - 1].vel * 127)) { repeats++; } }
  }
  row(rows, 'no-machine-gun', 'no drum voice plays the same velocity twice running', repeats + ' repeats in ' + count + ' pairs', '0', repeats === 0);
  const lags = bass.filter((n) => !HARD.some((t) => Math.abs(n.t - t) < 0.06)).map((n) => ({ t: n.t, off: n.t - Math.round(n.t / BEAT) * BEAT }))
    .filter((x) => Math.abs(x.off) < 0.04).map((x) => x.off * 1000);
  row(rows, 'bass-behind', 'the bass sits behind the beat (on-beat notes, the hits apart)', f(Math.min(...lags), 1) + ' to ' + f(Math.max(...lags), 1) + ' ms late, mean ' + f(lags.reduce((s, v) => s + v, 0) / lags.length, 1),
    '4 to 12 ms', Math.min(...lags) >= 3.3 && Math.max(...lags) <= 12.7);
  const ride = (kinds.ride || []).map((h) => (h.t - Math.round(h.t / BEAT) * BEAT)).filter((o) => Math.abs(o) < 0.04).map((o) => o * 1000);
  if (ride.length) {
    row(rows, 'ride-ahead', 'the ride sits on top of the beat (on-beat strokes)', f(-Math.max(...ride), 1) + ' to ' + f(-Math.min(...ride), 1) + ' ms early', '0 to 6 ms early',
      Math.min(...ride) >= -6.7 && Math.max(...ride) <= 0.7);
  }
  return { density: dens, swing: swingRows };

  function isTriplet(who, t) {
    if (who !== 'bass') { return false; }
    // a bass note is a triplet if the chart says so at that place
    return chart.BASS.some((n) => n.kind === 'trip' && Math.abs(nominal(n.bar, n.beat) - t) < 0.03);
  }
}

/* ------------------------------------------------------------------ the sound */
function checkSound(rows, dir, arr) {
  const kit = require('../lib');
  const dsp = kit.dsp, SR = kit.const.SR;
  const read = (name) => { const w = kit.wav.read(path.join(dir, name)); return [w.channels[0], w.channels[1]]; };
  const final = read('final.wav');
  const stems = { bass: read('stems/bass.wav'), keys: read('stems/keys.wav'), drums: read('stems/drums.wav'), fx: read('stems/fx.wav') };
  const band = dsp.stereo(final[0].length);
  for (const k of ['bass', 'keys', 'drums']) { kit.mix.add(band, stems[k]); }
  const out = {};

  // the band is out after each NO
  const outs = [['NO 1', 9.0, 9.9, 4.0, 8.0], ['NO 2', 18.5, 19.9, 12.0, 17.0]];
  out.stops = outs.map(([name, a, b, p0, p1]) => {
    const quiet = dsp.rmsDb(band, a, b), before = dsp.rmsDb(band, p0, p1);
    row(rows, 'band-out-' + name.replace(' ', '').toLowerCase(), 'after ' + name + ': instrument stems, ' + a + ' to ' + b + ' s, against ' + p0 + ' to ' + p1 + ' s',
      f(quiet, 1) + ' dBFS against ' + f(before, 1) + ' dBFS: ' + f(before - quiet, 1) + ' dB down', 'at least 30 dB down', before - quiet >= 30);
    return { name: name, quietDb: quiet, beforeDb: before };
  });

  // the held breath
  const breath = dsp.rmsDb(final, 20.3, 22.0);
  let zeros = 0, n = 0;
  for (let i = Math.round(20.3 * SR); i < Math.round(22.0 * SR); i++) { n++; if (final[0][i] === 0 && final[1][i] === 0) { zeros++; } }
  row(rows, 'breath', 'the held breath, 20.3 to 22.0 s, in final.wav', f(breath, 1) + ' dBFS RMS; ' + f(100 * zeros / n, 2) + ' percent of samples are zero',
    'under -60 dBFS, and not digital silence', breath < -60 && breath > -80 && zeros / n < 0.05);
  out.breathDb = breath;
  const bandBreath = dsp.rmsDb(band, 20.3, 22.0);
  row(rows, 'breath-band', 'instrument stems in the held breath', f(bandBreath, 1) + ' dBFS', 'under -75 dBFS (room tone is all there is)', bandBreath < -75);

  // the first quarter second
  const head = dsp.rmsDb(final, 0, 0.25), headBand = dsp.peak(band, 0, 0.25);
  row(rows, 'head', 'before 0.25 s: final.wav, and the instrument stems', f(head, 1) + ' dBFS RMS; instrument peak ' + f(dsp.db(headBand), 1) + ' dBFS',
    'room tone only (under -60 dBFS; instruments under -90)', head < -60 && dsp.db(headBand) < -90);

  // the tail
  const tail = dsp.rmsDb(final, 45.9, 46.0), tail2 = dsp.rmsDb(final, 45.5, 45.9);
  row(rows, 'tail', 'the tail: final.wav, 45.9 to 46.0 s (and 45.5 to 45.9 s)', f(tail, 1) + ' dBFS (' + f(tail2, 1) + ' dBFS)', 'under -60 dBFS', tail < -60);

  // the three hits: my own onset measure, apart from the kit's
  out.hits = HARD.map((t) => {
    const on = onsetNear(final, t, SR);
    row(rows, 'hit-' + t, 'hard hit at ' + f(t, 3) + ' s: onset in final.wav', f(on.t, 4) + ' s (' + (on.off >= 0 ? '+' : '') + f(on.off * 1000, 1) + ' ms); rise ' + f(on.riseDb, 1) + ' dB in 10 ms',
      'within 10 ms', Math.abs(on.off) <= 0.010 && on.riseDb > 6);
    return on;
  });

  // the thuds are tuned to the bass notes they land with
  const want = chart.BASS.filter((b) => b.hard).map((b) => chart.hzOf(b.midi));
  out.thuds = HARD.map((t, i) => {
    const hz = peakHz(stems.fx, t + 0.06, 0.34, 38, 70, dsp, SR);
    row(rows, 'thud-' + t, 'thud at ' + t + ' s: strongest low partial of the fx stem', f(hz, 1) + ' Hz', f(want[i], 1) + ' Hz (the bass note), within 2 Hz, and 45 to 60 Hz', Math.abs(hz - want[i]) <= 2 && hz >= 45 && hz <= 60);
    return hz;
  });

  // the bass sounds in the octave the chart says: measure four notes
  const probes = [[22.0, 'G1'], [26.0, 'G2'], [30.0, 'G3'], [37.0, 'G1'], [17.0, 'F#1'], [8.0, 'Ab1']];
  const pitchRows = probes.map(([t, name]) => {
    const hz = pitchHz(stems.bass, t + 0.07, 0.3, dsp, SR);
    return { t: t, name: name, hz: hz, want: chart.hzOf(chart.midiOf(name)) };
  });
  const pitchOk = pitchRows.every((p) => Math.abs(1200 * Math.log2(p.hz / p.want)) < 60);
  row(rows, 'bass-octave', 'the bass stem sounds at the written pitch (fundamental by autocorrelation)',
    pitchRows.map((p) => p.name + ' at ' + p.t + ' s: ' + f(p.hz, 1) + ' Hz').join('; '), pitchRows.map((p) => f(p.want, 1)).join(', ') + ' Hz, within 60 cents', pitchOk);
  const lowest = Math.min(...pitchRows.map((p) => p.hz)), highest = Math.max(...pitchRows.map((p) => p.hz));
  row(rows, 'range-sound', 'lowest and highest of the probed bass notes, as they sound', f(lowest, 1) + ' to ' + f(highest, 1) + ' Hz', 'inside E1 (41.2 Hz) to G3 (196.0 Hz)', lowest > 41.2 * 0.98 && highest < 196 * 1.02);

  // the PASS notes rise, as they sound
  const passHz = PASSES.map((t) => peakHz(stems.keys, t + 0.03, 0.34, 150, 1500, dsp, SR));
  let rising = true;
  for (let i = 1; i < 4; i++) { if (!(passHz[i] > passHz[i - 1] * 1.04)) { rising = false; } }
  row(rows, 'pass-rise-sound', 'the PASS notes rise, as they sound (strongest partial of the keys stem)', passHz.map((h) => f(h, 0) + ' Hz').join(' < '),
    chart.GATE_NOTES.map((s) => f(chart.hzOf(chart.midiOf(s)), 0)).join(', ') + ' Hz', rising && passHz.every((h, i) => Math.abs(1200 * Math.log2(h / chart.hzOf(chart.midiOf(chart.GATE_NOTES[i])))) < 60));

  // the keys against the bass where the keys play
  const windows = [['the four PASSes (22.5 to 30 s)', 22.5, 30], ['the slab chord (37 to 38 s)', 37, 38], ['the last chord (40 to 43 s)', 40, 43]];
  out.keysBalance = windows.map(([name, a, b]) => ({ name: name, db: dsp.rmsDb(stems.keys, a, b) - dsp.rmsDb(stems.bass, a, b) }));
  out.drumsBalance = [['idea 1 (4 to 8 s)', 4, 8], ['idea 2 (12 to 17 s)', 12, 17], ['idea 3 (24 to 30 s)', 24, 30], ['winner and title (30 to 36.5 s)', 30, 36.5]]
    .map(([name, a, b]) => ({ name: name, db: dsp.rmsDb(stems.drums, a, b) - dsp.rmsDb(stems.bass, a, b) }));
  const kb = out.keysBalance[0].db, db = out.drumsBalance[3].db;
  row(rows, 'keys-balance', 'keys against bass (stem RMS) while the keys play', out.keysBalance.map((k) => k.name + ': ' + f(k.db, 1) + ' dB').join('; '), 'about -3 to -10 dB', kb <= -3 && kb >= -10.5);
  row(rows, 'drums-balance', 'drums against bass (stem RMS)', out.drumsBalance.map((k) => k.name + ': ' + f(k.db, 1) + ' dB').join('; '), 'about -8 to -16 dB in the full passage', db <= -8 && db >= -16.5);

  // the layers of idea 3, as energy in the drums stem
  const layer = [[22.0, 22.45], [22.5, 24.45], [24.5, 26.45], [26.5, 28.45], [28.5, 29.95], [30, 32]].map(([a, b]) => dsp.rmsDb(stems.drums, a, b));
  out.layers = layer;
  let grows = layer[0] < -90;
  for (let i = 2; i < layer.length; i++) { if (!(layer[i] > layer[i - 1])) { grows = false; } }
  row(rows, 'layers-sound', 'idea 3: the drums stem grows at every PASS and again at the winner (RMS)', layer.map((v) => f(v, 1)).join(' < ') + ' dBFS', 'silent before PASS 1, then louder each time', grows);

  return out;
}

/* The moment the sound of a hit arrives: the first 1 ms frame, near t, whose level is within 12 dB of the loudest frame in the next 60 ms. */
function onsetNear(st, t, SR) {
  const hop = Math.round(SR / 2000);                       // 0.5 ms
  const a = Math.round((t - 0.06) * SR), b = Math.round((t + 0.08) * SR);
  const env = [];
  for (let i = a; i < b; i += hop) {
    let s = 0;
    for (let j = i; j < i + 2 * hop; j++) { s += st[0][j] * st[0][j] + st[1][j] * st[1][j]; }
    env.push(Math.sqrt(s / (4 * hop)));
  }
  const at = (sec) => Math.round((sec - (t - 0.06)) * SR / hop);
  let peak = 0;
  for (let k = at(t - 0.012); k < at(t + 0.06); k++) { if (env[k] > peak) { peak = env[k]; } }
  let before = 0;
  for (let k = at(t - 0.05); k < at(t - 0.015); k++) { if (env[k] > before) { before = env[k]; } }
  const thr = Math.max(peak * 0.25, before * 1.5);
  let k0 = at(t - 0.04);
  while (k0 < env.length && env[k0] < thr) { k0++; }
  const on = (t - 0.06) + k0 * hop / SR;
  // how much louder the 10 ms after the hit are than the 10 ms before it
  const r = (x, y) => { let s = 0, n = 0; for (let i = Math.round(x * SR); i < Math.round(y * SR); i++) { s += st[0][i] * st[0][i] + st[1][i] * st[1][i]; n += 2; } return 10 * Math.log10(s / n + 1e-20); };
  return { t: on, off: on - t, riseDb: r(t, t + 0.01) - r(t - 0.012, t - 0.002) };
}

/* The frequency of the strongest spectral peak between two limits, in a window after t. */
function peakHz(st, t, len, fLo, fHi, dsp, SR) {
  const size = 65536;
  const re = new Float64Array(size), im = new Float64Array(size);
  const a = Math.round(t * SR), n = Math.round(len * SR);
  for (let i = 0; i < n && i < size; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); re[i] = 0.5 * (st[0][a + i] + st[1][a + i]) * w; }
  dsp.fft(re, im);
  const df = SR / size;
  let best = 0, bk = 0;
  for (let k = Math.ceil(fLo / df); k <= Math.floor(fHi / df); k++) { const p = re[k] * re[k] + im[k] * im[k]; if (p > best) { best = p; bk = k; } }
  // parabolic refinement on the log power
  const p = (k) => Math.log(re[k] * re[k] + im[k] * im[k] + 1e-30);
  const d = 0.5 * (p(bk - 1) - p(bk + 1)) / (p(bk - 1) - 2 * p(bk) + p(bk + 1));
  return (bk + (Number.isFinite(d) ? d : 0)) * df;
}

/* The fundamental of a low note by autocorrelation (35 to 420 Hz); the shortest period within 10 percent of the best wins, so an octave below cannot be picked by mistake. */
function pitchHz(st, t, len, dsp, SR) {
  const a = Math.round(t * SR), n = Math.round(len * SR);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = 0.5 * (st[0][a + i] + st[1][a + i]); }
  dsp.biquad(x, 'lp', 900, 0.7071);
  const minLag = Math.floor(SR / 420), maxLag = Math.ceil(SR / 35);
  const ac = new Float64Array(maxLag + 2);
  let e0 = 0;
  for (let i = 0; i < n; i++) { e0 += x[i] * x[i]; }
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i + lag < n; i++) { s += x[i] * x[i + lag]; e1 += x[i] * x[i]; e2 += x[i + lag] * x[i + lag]; }
    ac[lag] = s / Math.sqrt(e1 * e2 + 1e-30);
  }
  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) { if (ac[lag] > best) { best = ac[lag]; } }
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (ac[lag] >= 0.9 * best && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      const d = 0.5 * (ac[lag - 1] - ac[lag + 1]) / (ac[lag - 1] - 2 * ac[lag] + ac[lag + 1]);
      return SR / (lag + (Number.isFinite(d) ? d : 0));
    }
  }
  return NaN;
}

/* ------------------------------------------------------------------ run */
function run(opts) {
  const dir = (opts && opts.dir) || HERE;
  const rows = [];
  const out = { chart: checkChart(rows) };
  const arrFile = path.join(dir, 'arrangement.json');
  if (fs.existsSync(arrFile)) {
    const arr = JSON.parse(fs.readFileSync(arrFile, 'utf8'));
    out.played = checkPlayed(rows, arr);
    if (['final.wav', 'stems/bass.wav', 'stems/keys.wav', 'stems/drums.wav', 'stems/fx.wav'].every((p) => fs.existsSync(path.join(dir, p)))) {
      out.sound = checkSound(rows, dir, arr);
    }
  }
  out.rows = rows;
  out.ok = rows.every((r) => r.ok);
  return out;
}

function table(rows) {
  const esc = (s) => String(s).replace(/\|/g, '/');
  const lines = ['| Check | Measured | Target | Result |', '|---|---|---|---|'];
  for (const r of rows) { lines.push('| ' + esc(r.what) + ' | ' + esc(r.measured) + (r.note ? '<br>' + esc(r.note) : '') + ' | ' + esc(r.target) + ' | ' + (r.ok ? 'pass' : '**FAIL**') + ' |'); }
  return lines.join('\n');
}

module.exports = { run: run, table: table, onsetNear: onsetNear, peakHz: peakHz, pitchHz: pitchHz, SECTIONS: SECTIONS };

if (require.main === module) {
  const res = run();
  for (const r of res.rows) { console.log((r.ok ? 'pass  ' : 'FAIL  ') + r.what + ': ' + r.measured + (r.note ? '  [' + r.note + ']' : '')); }
  console.log(res.ok ? '\nchart checks: all ' + res.rows.length + ' pass' : '\nchart checks: ' + res.rows.filter((r) => !r.ok).length + ' of ' + res.rows.length + ' FAIL');
  process.exit(res.ok ? 0 : 1);
}
