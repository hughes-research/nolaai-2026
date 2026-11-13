#!/usr/bin/env node
/*
 * tools/score/modelled/lab.js: render this candidate's instruments ALONE, so they can be measured
 * and looked at (nobody here can hear).
 *
 *   node lab.js [bass piano brush ride feet thud room | all] [--tmp dir] [--no-pics]
 *
 * WAVs go to a temporary directory (they are large and are not part of the candidate);
 * log-frequency spectrograms go to analysis/instruments/. `lab.py` then measures the WAVs:
 *
 *   python3 lab.py harm <tmp>/bass.wav  --keys 33,38,43,50 --vels 3
 *   python3 lab.py corr <tmp>/bass-repeat.wav --count 8 --step 0.75 --len 0.4
 *
 * The layout matches lab.py: the first note at 0.5 s, then one every 3 s (repeats: as stated).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const B = require('./build.js');

const args = process.argv.slice(2);
let tmp = path.join(os.tmpdir(), 'modelled-lab'), pics = true;
const what = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tmp') { tmp = path.resolve(args[++i]); }
  else if (args[i] === '--no-pics') { pics = false; }
  else { what.push(args[i]); }
}
const all = !what.length || what.indexOf('all') >= 0;
const want = (k) => all || what.indexOf(k) >= 0;
fs.mkdirSync(tmp, { recursive: true });
const picDir = path.join(__dirname, 'analysis', 'instruments');
fs.mkdirSync(picDir, { recursive: true });
const SR = B.SR;

function save(name, L, R, t0, t1) {
  const file = path.join(tmp, name + '.wav');
  B.writeWav(file, [L, R || L], 7);
  let pk = 0;
  for (let i = 0; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), R ? Math.abs(R[i]) : 0); }
  console.log(name.padEnd(16) + (L.length / SR).toFixed(1) + ' s, peak ' + B.dB(pk).toFixed(1) + ' dBFS  -> ' + file);
  if (pics) {
    const seg = t1 ? ['-ss', String(t0 || 0), '-t', String(t1 - (t0 || 0))] : [];
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y'].concat(seg, ['-i', file, '-lavfi',
      'aformat=channel_layouts=mono,showspectrumpic=s=1500x700:legend=1:fscale=log:scale=log:color=magma:drange=90:win_func=hann', path.join(picDir, name + '.png')]));
  }
}
const stereo = (n) => [new Float32Array(n), new Float32Array(n)];

if (want('bass')) {
  let notes = [], t = 0.5;
  for (const m of [33, 38, 43, 50]) { for (const vel of [0.45, 0.7, 0.95]) { notes.push({ t, m, dur: 1.6, vel }); t += 3; } }
  let y = B.renderBass(notes, Math.round((t + 0.5) * SR));
  save('bass', y.out);
  notes = [];
  for (let k = 0; k < 8; k++) { notes.push({ t: 0.5 + 0.75 * k, m: 38, dur: 0.7, vel: 0.7 }); }
  y = B.renderBass(notes, Math.round(7 * SR));
  save('bass-repeat', y.out);
  // a walking line, the first six bars of the chart
  const P = B.perform();
  y = B.renderBass(P.bass.filter((e) => e.t < 8.4), Math.round(9 * SR));
  save('bass-walk', y.out);
  // the body alone: its response to a click
  const imp = new Float32Array(SR); imp[100] = 1;
  const body = B.modalBank(imp, B.BASS_BODY, 0.16, 0, SR);
  save('bass-body', body);
}
if (want('piano')) {
  let notes = [], t = 0.5;
  for (const m of [53, 60, 65, 72]) { for (const vel of [0.3, 0.55, 0.85]) { notes.push({ t, m, dur: 2.2, vel }); t += 3; } }
  let y = B.renderPiano(notes, [], Math.round((t + 0.5) * SR));
  save('piano', y.L, y.R);
  notes = [];
  for (let k = 0; k < 8; k++) { notes.push({ t: 0.5 + 1.0 * k, m: 60, dur: 0.8, vel: 0.55 }); }
  y = B.renderPiano(notes, [], Math.round(9.5 * SR));
  save('piano-repeat', y.L, y.R);
  // the last chord with the pedal, as in the piece
  const chord = [50, 53, 57, 59, 64, 69, 74];
  notes = chord.map((m, k) => ({ t: 0.5 + 0.045 * k, m, dur: 4.8, vel: 0.56 }));
  y = B.renderPiano(notes, [[0.49, 5.3, chord]], Math.round(7 * SR));
  save('piano-last-chord', y.L, y.R);
  y = B.renderPiano(notes, [], Math.round(7 * SR));
  save('piano-last-chord-no-pedal', y.L, y.R);
}
if (want('brush')) {
  const taps = [];
  let t = 0.5;
  for (let k = 0; k < 9; k++) { taps.push({ t, vel: [0.3, 0.5, 0.8][k % 3] }); t += 3; }
  let y = B.renderBrushes([], taps, [], Math.round((t + 0.5) * SR));
  save('brush-taps', y.L, y.R);
  const rep = [];
  for (let k = 0; k < 8; k++) { rep.push({ t: 0.5 + 0.75 * k, vel: 0.5 }); }
  y = B.renderBrushes([], rep, [], Math.round(7 * SR));
  save('brush-repeat', y.L, y.R);
  y = B.renderBrushes([{ t0: 0.5, t1: 8.5, level: () => 1 }], [], [], Math.round(9 * SR));
  save('brush-swirl', y.L, y.R);
}
if (want('ride')) {
  let hits = [], t = 0.5;
  for (let k = 0; k < 9; k++) { hits.push({ t, vel: [0.3, 0.55, 0.8][Math.floor(k / 3)], kind: 'tip' }); t += 3; }
  let y = B.renderRide(hits, [], Math.round((t + 0.5) * SR));
  save('ride', y.out);
  // the same stroke eight times, each on a silent cymbal: are any two alike?
  const n1 = Math.round(3 * SR), rep = new Float32Array(8 * n1 + SR);
  for (let k = 0; k < 8; k++) {
    // every hit of a part gets its own seed by its index, so render a part of k+1 hits and keep the last
    const part = [];
    for (let j = 0; j <= k; j++) { part.push({ t: 0.01 + 0.0001 * j, vel: j === k ? 0.55 : 0, kind: 'tip' }); }
    const one = B.renderRide(part, [], n1).out;
    for (let i = 0; i < n1; i++) { rep[Math.round(0.49 * SR) + k * n1 + i] += one[i]; }
  }
  save('ride-repeat', rep);
  hits = [];
  const P = B.perform();
  y = B.renderRide(P.ride.filter((e) => e.t < 8), [], Math.round(10 * SR));
  save('ride-pattern', y.out, null, 3.5, 10);
  hits = [];
  for (let tt = 0.5; tt < 2.0; tt += 0.072) { const p = (tt - 0.5) / 1.5; hits.push({ t: tt, vel: 0.07 + 0.4 * p * p, kind: 'mallet' }); }
  hits.push({ t: 2.0, vel: 0.6, kind: 'tip' });
  y = B.renderRide(hits, [], Math.round(6 * SR));
  save('ride-swell', y.out);
}
if (want('feet')) {
  let hits = [], t = 0.5;
  for (let k = 0; k < 9; k++) { hits.push({ t, vel: [0.25, 0.4, 0.6][k % 3] }); t += 3; }
  let y = B.renderHits(hits, B.kickHit, 'kick', Math.round((t + 0.5) * SR), 0);
  save('kick', y.L, y.R);
  y = B.renderHits(hits, B.hatChick, 'hat', Math.round((t + 0.5) * SR), 0);
  save('hat', y.L, y.R);
}
if (want('thud')) {
  const n = Math.round(11.5 * SR), [L, R] = stereo(n);
  [[55, 1, true], [49, 1.15, true], [55, 0.75, false]].forEach(([f, size, rattle], k) => {
    const y = B.thudSound(f, size, rattle, B.rng(B.seedOf('thud ' + [8, 17, 37][k])));
    for (let i = 0, a = Math.round((0.5 + 3.5 * k) * SR); i < y.L.length && a + i < n; i++) { L[a + i] += y.L[i]; R[a + i] += y.R[i]; }
  });
  save('thud', L, R);
}
if (want('room')) {
  const n = Math.round(2.5 * SR), x = new Float32Array(n);
  x[0] = 1;
  const y = B.room(x, Float32Array.from(x));
  save('room-ir', y[0], y[1]);
  const xl = new Float32Array(n); xl[0] = 1;
  const yl = B.room(xl, new Float32Array(n).fill(0).map((v, i) => (i === 1 ? 1e-12 : 0)));
  save('room-ir-left-only', yl[0], yl[1]);
  const tone = B.roomTone(Math.round(6 * SR), B.rng(B.seedOf('room tone')));
  for (let i = 0; i < tone.L.length; i++) { tone.L[i] *= 0.01; tone.R[i] *= 0.01; }
  save('room-tone', tone.L, tone.R);
}
console.log('lab renders in ' + tmp);
