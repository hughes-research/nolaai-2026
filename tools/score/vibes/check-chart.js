/*
 * tools/score/vibes/check-chart.js: this candidate's own checks.
 *
 *   node tools/score/vibes/check-chart.js        (after a build; exit 0 only if everything passes)
 *
 * It reads the chart (./chart.js), the performance as it was actually played
 * (./arrangement.json), the stems and final.wav, and checks the chart as data
 * and the sound as numbers. It prints one table and writes it to
 * ./chart-check.json. build.js runs it last.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const kit = require('../lib');
const C = require('./chart.js');
const { SR } = kit.const;
const { dsp, wav, checks } = kit;
const HERE = __dirname;

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));

/* Reasons for the bar lines the bass does not cross by a step. Anything not listed here is a failure. */
const LEAPS = {
  '5>6': 'the NO (G#1) is followed by six beats of silence; the restart on B1 is a new phrase',
  '9>12': 'the NO (Bb1) is followed by the held breath; idea 3 starts a new phrase on the open D',
  '19>20': 'the slab (A1, held two beats) is an arrival; the tag starts a fourth up on the open D and climbs back by step'
};

function run(opts) {
  const o = opts || {};
  const tl = kit.timeline.load();
  const A = JSON.parse(fs.readFileSync(path.join(HERE, 'arrangement.json'), 'utf8'));
  const read = (f) => wav.read(path.join(HERE, f)).channels;
  const final = read('final.wav');
  const stem = { bass: read('stems/bass.wav'), keys: read('stems/keys.wav'), drums: read('stems/drums.wav'), fx: read('stems/fx.wav') };
  const band = dsp.stereo(final[0].length);                    // the instruments: everything but the thuds and the room tone
  for (const k of ['bass', 'keys', 'drums']) { for (let c = 0; c < 2; c++) { const d = band[c], s = stem[k][c]; for (let i = 0; i < d.length; i++) { d[i] += s[i]; } } }

  const rows = [], failures = [], notes = [];
  const row = (name, measured, wanted, pass) => {
    rows.push({ check: name, measured: String(measured), wanted: String(wanted), pass: pass === null ? null : !!pass });
    if (pass === false) { failures.push(name + ': ' + measured + ' (wanted ' + wanted + ')'); }
  };

  /* ---------------------------------------------------------------- the bass line, from the chart */
  const bass = C.BASS.map((r) => ({ bar: r[0], beat: r[1], name: r[2], midi: C.midiOf(r[2]), kind: r[5] }));
  const strong = bass.filter((n) => n.beat === 1 || n.beat === 3);
  const wrong = strong.filter((n) => {
    const sym = C.CHORDS[n.bar - 1][n.beat - 1];
    return !C.CHORD[sym].tones.map(C.pcOf).includes(n.midi % 12);
  });
  row('bass on beats 1 and 3 is a chord tone', (strong.length - wrong.length) + ' of ' + strong.length + (wrong.length ? ' (not: ' + wrong.map((n) => 'bar ' + n.bar + ' beat ' + n.beat + ' ' + n.name).join(', ') + ')' : ''), 'all', wrong.length === 0);

  const bars = [];
  for (let b = 1; b <= C.BARS; b++) { const inBar = bass.filter((n) => n.bar === b); if (inBar.length) { bars.push({ bar: b, notes: inBar }); } }
  const steps = [], leaps = [], unexplained = [];
  for (let i = 0; i + 1 < bars.length; i++) {
    const a = bars[i], b = bars[i + 1];
    const last = a.notes[a.notes.length - 1], first = b.notes[0];
    const iv = first.midi - last.midi;
    const key = a.bar + '>' + b.bar;
    const text = 'bar ' + a.bar + ' ' + last.name + ' to bar ' + b.bar + ' ' + first.name + ' (' + (iv > 0 ? '+' : '') + iv + ')';
    if (Math.abs(iv) === 1 || Math.abs(iv) === 2) { steps.push(text); }
    else if (LEAPS[key]) { leaps.push(text + ': ' + LEAPS[key]); }
    else { unexplained.push(text); }
  }
  row('bass crosses each bar line by a step or a half step', steps.length + ' of ' + (bars.length - 1) + ' bar lines; ' + leaps.length + ' stated exceptions' + (unexplained.length ? '; UNEXPLAINED: ' + unexplained.join(', ') : ''), 'all but the stated exceptions', unexplained.length === 0);
  leaps.forEach((t) => notes.push('exception: ' + t));

  const seen = new Map(), dup = [];
  for (const b of bars) {
    const k = b.notes.map((n) => n.midi).join(' ');
    if (seen.has(k)) { dup.push('bars ' + seen.get(k) + ' and ' + b.bar); }
    seen.set(k, b.bar);
  }
  const sets = new Map(), dupSet = [];
  for (const b of bars.filter((x) => x.notes.length >= 4)) {
    const k = b.notes.map((n) => n.midi).sort((x, y) => x - y).join(' ');
    if (sets.has(k)) { dupSet.push('bars ' + sets.get(k) + ' and ' + b.bar); }
    sets.set(k, b.bar);
  }
  row('no two bars have the same bass pitches', bars.length + ' bars with bass, ' + (dup.length + dupSet.length) + ' repeats' + (dup.concat(dupSet).length ? ' (' + dup.concat(dupSet).join(', ') + ')' : ''), '0 repeats (in order, or as a set of four)', dup.length + dupSet.length === 0);

  const played = A.notes.filter((n) => n.inst === 'bass');
  const lo = Math.min(...played.map((n) => n.midi)), hi = Math.max(...played.map((n) => n.midi));
  row('bass range as it sounds', C.nameOf(lo) + ' to ' + C.nameOf(hi) + ' (MIDI ' + lo + ' to ' + hi + '; the audition measures key 33 at 55.0 Hz, so MIDI is sounding pitch)', 'E1 to G3 (MIDI 28 to 55)', lo >= 28 && hi <= 55);

  /* ---------------------------------------------------------------- the performance, from arrangement.json */
  const events = new Map();                                    // a rolled chord is one event: its first note
  for (const n of A.notes) { const e = events.get(n.ev); if (!e || n.t < e.t) { events.set(n.ev, n); } }
  const all = Array.from(events.values()).concat(A.hits.filter((h) => h.inst === 'drums'));
  const offs = all.filter((e) => Math.abs((e.beat % 1) - 0.5) < 1e-6).map((e) => ({ inst: e.inst, ratio: (e.t - tl.at(e.bar, Math.floor(e.beat))) / tl.beat }));
  const stat = (list) => ({ n: list.length, mean: list.reduce((s, v) => s + v.ratio, 0) / (list.length || 1), min: Math.min(...list.map((v) => v.ratio)), max: Math.max(...list.map((v) => v.ratio)) });
  const sw = stat(offs);
  const per = ['bass', 'vibes', 'drums'].map((k) => { const s = stat(offs.filter((v) => v.inst === k)); return k + ' ' + s.n + ' at ' + f3(s.mean); }).join(', ');
  row('swing ratio of the off-beat eighths, as played', sw.n + ' off-beats: mean ' + f3(sw.mean) + ', from ' + f3(sw.min) + ' to ' + f3(sw.max) + ' (' + per + ')', '0.62 to 0.66', sw.n > 0 && sw.min >= 0.62 && sw.max <= 0.66);

  const lateness = (inst, kinds) => A.notes.filter((n) => n.inst === inst && kinds.includes(n.kind)).map((n) => 1000 * (n.t - tl.at(n.bar, n.beat, { swing: A.swing })));
  const bl = lateness('bass', ['walk', 'long', 'skip', 'ring']);
  row('bass behind the beat (not the HARD hits)', f1(Math.min(...bl)) + ' to ' + f1(Math.max(...bl)) + ' ms over ' + bl.length + ' notes', '4 to 12 ms', Math.min(...bl) >= 3.99 && Math.max(...bl) <= 12.01);
  const ride = A.hits.filter((h) => h.kind === 'ride' || h.kind === 'ride-skip').map((h) => 1000 * (h.t - tl.at(h.bar, h.beat, { swing: A.swing })));
  row('ride ahead of the beat', f1(-Math.max(...ride)) + ' to ' + f1(-Math.min(...ride)) + ' ms over ' + ride.length + ' strokes', '0 to 6 ms', Math.max(...ride) <= 0.01 && Math.min(...ride) >= -6.01);
  const dh = A.hits.filter((h) => h.inst === 'drums');
  let same = 0;
  const lastKey = new Map();
  dh.forEach((h, i) => {
    const m = Math.round(h.vel * 127);
    if (i > 0 && m === Math.round(dh[i - 1].vel * 127) && !(h.kind.startsWith('hit') && dh[i - 1].kind.startsWith('hit'))) { same++; }
    if (lastKey.get(h.key) === m) { same++; }
    lastKey.set(h.key, m);
  });
  row('no drum hit at the same velocity twice running', same + ' repeats in ' + dh.length + ' hits (' + new Set(dh.map((h) => Math.round(h.vel * 127))).size + ' different velocities)', '0', same === 0);
  const bv = new Set(played.map((n) => Math.round(n.vel * 127))).size, vv = new Set(A.notes.filter((n) => n.inst === 'vibes').map((n) => Math.round(n.vel * 127))).size;
  row('velocities vary', 'bass ' + bv + ' different velocities in ' + played.length + ' notes; vibraphone ' + vv + ' in ' + A.notes.filter((n) => n.inst === 'vibes').length, 'most notes differ', null);

  /* ---------------------------------------------------------------- the shape: notes a second, and the layers */
  const onsets = A.notes.map((n) => n.t).concat(dh.map((h) => h.t));
  const rate = (a, b) => onsets.filter((t) => t >= a - 0.02 && t < b - 0.02).length / (b - a);
  const P = tl.passes;
  const sections = [
    ['0-4 the dock', 0, 4], ['4-8 idea 1', 4, 8], ['8-10 NO 1, space', 8, 10], ['10-12 restart', 10, 12], ['12-17 idea 2', 12, 17], ['17-22 NO 2, breath', 17, 22],
    ['idea 3 before PASS 1', 22, P[0]], ['after PASS 1', P[0], P[1]], ['after PASS 2', P[1], P[2]], ['after PASS 3', P[2], P[3]], ['after PASS 4', P[3], tl.winner],
    ['30-32 winner', tl.winner, tl.sleeve], ['32-37 title', tl.sleeve, tl.hard.slab], ['37-38 slab', tl.hard.slab, tl.positive], ['38-46 tag', tl.positive, 46]
  ].map(([name, a, b]) => ({ name, a, b, rate: rate(a, b) }));
  const R = (name) => sections.find((s) => s.name === name).rate;
  row('notes a second, section by section', sections.map((s) => s.name + ': ' + f1(s.rate)).join(' | '), 'follows the shape', null);
  const before = sections.filter((s) => s.b <= tl.sleeve && s.name !== '4-8 idea 1');
  row('idea 1 is the busiest before the title', f1(R('4-8 idea 1')) + ' a second; the next busiest before 32 s is ' + f1(Math.max(...before.map((s) => s.rate))), 'the highest', before.every((s) => s.rate < R('4-8 idea 1')));
  row('idea 2 is thinner than idea 1', f1(R('12-17 idea 2')) + ' against ' + f1(R('4-8 idea 1')), 'lower', R('12-17 idea 2') < R('4-8 idea 1'));
  const climb = ['idea 3 before PASS 1', 'after PASS 1', 'after PASS 2', 'after PASS 3', 'after PASS 4'].map(R);
  row('idea 3 grows at each PASS (notes a second)', climb.map(f1).join(' < '), 'rising', climb.every((v, i) => i === 0 || v > climb[i - 1]));
  const voiceOf = (e) => (e.inst === 'drums' ? e.kind.replace('ride-skip', 'ride') : e.inst);
  const voices = (a, b) => new Set(A.notes.concat(dh).filter((e) => e.t >= a - 0.02 && e.t < b - 0.02).map(voiceOf));
  const wins = [[22, P[0]], [P[0], P[1]], [P[1], P[2]], [P[2], P[3]], [P[3], tl.winner], [tl.winner, tl.sleeve]];
  let have = new Set(), layersOk = true;
  const joined = wins.map(([a, b], i) => {
    const now = voices(a, b);
    const fresh = Array.from(now).filter((v) => !have.has(v));
    if (i > 0 && fresh.length === 0) { layersOk = false; }
    have = new Set([...have, ...now]);
    return f1(a) + ' s: ' + (fresh.join('+') || 'nothing new');
  });
  row('one layer joins at each PASS', joined.join(' | '), 'something new at 22.5, 24.5, 26.5, 28.5 and 30 s', layersOk);

  /* ---------------------------------------------------------------- the four PASS figures */
  const vib = A.notes.filter((n) => n.inst === 'vibes');
  const tops = [];
  let figuresOk = true;
  P.forEach((p, k) => {
    const figure = vib.filter((n) => { const nom = tl.at(n.bar, n.beat, { swing: A.swing }); return nom <= p + 1e-6 && nom >= p - k * tl.beat - 1e-6; });
    const top = figure.reduce((m, n) => (n.midi > m.midi ? n : m), figure[0]);
    const onPass = top && Math.abs(tl.at(top.bar, top.beat) - p) < 1e-6;
    if (!top || figure.length !== k + 1 || !onPass || Math.abs(top.t - p) > 0.015) { figuresOk = false; }
    tops.push(top ? { name: top.name, midi: top.midi, n: figure.length, off: 1000 * (top.t - p) } : null);
  });
  const rising = tops.every((t, i) => t && (i === 0 || t.midi > tops[i - 1].midi));
  row('the top notes of the four PASS figures rise', tops.map((t, i) => (t ? t.name + ' at ' + P[i] + ' s (' + (t.off >= 0 ? '+' : '') + f1(t.off) + ' ms, figure of ' + t.n + ')' : 'none')).join(' < '), 'rising, each on its lift', rising && figuresOk);

  /* ---------------------------------------------------------------- the walking bass as a stair, measured on the stem
   * (the fundamental under every charted note, by autocorrelation: what a spectrogram would show as one step a beat) */
  const mono1 = new Float32Array(stem.bass[0].length);
  for (let i = 0; i < mono1.length; i++) { mono1[i] = 0.5 * (stem.bass[0][i] + stem.bass[1][i]); }
  const pitchAt = (t0, t1) => {
    const D = 4, sr = SR / D, a0 = Math.round(t0 * SR), n = Math.floor((t1 - t0) * sr);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let v = 0; for (let k = 0; k < D; k++) { v += mono1[a0 + i * D + k]; } y[i] = v / D; }
    const lo = Math.floor(sr / 260), hi = Math.min(n - 2, Math.ceil(sr / 35));
    const r = new Float64Array(hi + 2);
    let max = -Infinity;
    for (let L = lo - 1; L <= hi + 1; L++) { let v = 0; for (let i = 0; i + L < n; i++) { v += y[i] * y[i + L]; } r[L] = v / (n - L); if (L >= lo && L <= hi && r[L] > max) { max = r[L]; } }
    let lag = 0;
    for (let L = lo; L <= hi; L++) { if (r[L] >= 0.9 * max && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { lag = L; break; } }   // the first strong peak: the period, not a multiple of it
    if (!lag) { return NaN; }
    const d = (r[lag - 1] - r[lag + 1]) / (2 * (r[lag - 1] - 2 * r[lag] + r[lag + 1]));
    return sr / (lag + (Number.isFinite(d) ? d : 0));
  };
  const stair = played.filter((n) => n.kind !== 'skip').map((n) => {
    const hz = pitchAt(n.t + 0.09, n.t + Math.min(Math.max(n.dur, 0.3), 0.42));
    return { name: n.name, bar: n.bar, beat: n.beat, cents: 1200 * Math.log2(hz / (440 * Math.pow(2, (n.midi - 69) / 12))) };
  });
  const offPitch = stair.filter((x) => !(Math.abs(x.cents) <= 35));
  row('the bass stem sounds the charted note under every beat', (stair.length - offPitch.length) + ' of ' + stair.length + ' notes within 35 cents (the worst ' + f1(Math.max(...stair.map((x) => (Number.isFinite(x.cents) ? Math.abs(x.cents) : 9999)))) + ')' + (offPitch.length ? '; off: ' + offPitch.map((x) => 'bar ' + x.bar + ' beat ' + x.beat + ' ' + x.name + ' ' + f1(x.cents)).join(', ') : ''), 'all', offPitch.length === 0);

  /* the last chord rings down smoothly (the vibraphone stem, half second by half second) */
  const ring = [];
  for (let t = 42.5; t < 45.49; t += 0.5) { ring.push(dsp.rmsDb(stem.keys, t, t + 0.5)); }
  const smooth = ring.every((v, i) => i === 0 || v <= ring[i - 1] + 0.3);
  row('the last chord rings down smoothly', 'vibraphone stem from 42.5 s, each half second: ' + ring.map(f1).join(' ') + ' dBFS', 'falling all the way', smooth);

  /* ---------------------------------------------------------------- the sound */
  for (const s of tl.sync) {
    const on = checks.onset(final, s.t);
    const each = ['fx', 'bass', 'keys', 'drums'].map((k) => { const x = checks.onset(stem[k], s.t); return k + ' ' + (x.found ? (x.offsetMs >= 0 ? '+' : '') + f1(x.offsetMs) : 'none'); }).join(', ');
    row('HARD hit ' + s.name + ' at ' + s.t + ' s', on.found ? 'onset ' + (on.offsetMs >= 0 ? '+' : '') + f1(on.offsetMs) + ' ms in final.wav (stems: ' + each + ' ms)' : 'no onset found (stems: ' + each + ')', 'within 10 ms', on.found && Math.abs(on.offsetMs) <= 10);
  }
  const out1 = dsp.rmsDb(band, 9.0, 9.9), pre1 = dsp.rmsDb(band, 6.0, 8.0);
  const out2 = dsp.rmsDb(band, 18.5, 19.9), pre2 = dsp.rmsDb(band, 14.0, 17.0);
  row('the band is out after NO 1 (9.0 to 9.9 s)', f1(out1) + ' dBFS, ' + f1(pre1 - out1) + ' dB under 6 to 8 s (' + f1(pre1) + ')', 'at least 30 dB under', pre1 - out1 >= 30);
  row('the band is out after NO 2 (18.5 to 19.9 s)', f1(out2) + ' dBFS, ' + f1(pre2 - out2) + ' dB under 14 to 17 s (' + f1(pre2) + ')', 'at least 30 dB under', pre2 - out2 >= 30);
  const breath = dsp.rmsDb(final, 20.3, 22);
  let quietest = Infinity;
  for (let t = 20.3; t + 0.1 <= 22.0001; t += 0.1) { quietest = Math.min(quietest, dsp.rmsDb(final, t, t + 0.1)); }
  row('the held breath (20.3 to 22.0 s)', f1(breath) + ' dBFS RMS; its quietest 100 ms ' + f1(quietest) + '; the band stems there ' + f1(dsp.rmsDb(band, 20.3, 22)), 'below -60, and not digital zero', breath < -60 && quietest > -80);
  const head = dsp.rmsDb(band, 0, 0.25), headFinal = dsp.rmsDb(final, 0.01, 0.25);
  row('nothing but room tone before 0.25 s', 'the band stems ' + f1(head) + ' dBFS; final.wav ' + f1(headFinal) + ' dBFS', 'band silent; final below -60', head < -100 && headFinal < -60 && headFinal > -80);
  const tail = dsp.rmsDb(final, 45.9, 46);
  row('the tail is inaudible by 45.9 s', f1(tail) + ' dBFS RMS from 45.9 s; ' + f1(dsp.rmsDb(final, 45.0, 45.7)) + ' from 45.0 to 45.7 s; the band stems from 45.0 s ' + f1(dsp.rmsDb(band, 45.0, 45.7)), 'below -60', tail < -60);

  const W = [30, 36];
  const rb = dsp.rmsDb(stem.bass, W[0], W[1]), rk = dsp.rmsDb(stem.keys, W[0], W[1]) - rb, rd = dsp.rmsDb(stem.drums, W[0], W[1]) - rb;
  row('balance in the full trio (30 to 36 s), stems relative to the bass', 'vibraphone ' + f1(rk) + ' dB, drums ' + f1(rd) + ' dB (bass ' + f1(rb) + ' dBFS)', 'keys -3 to -10, drums -8 to -16', rk <= -3 && rk >= -10 && rd <= -8 && rd >= -16);
  const hp = dsp.butter(dsp.copy(stem.bass), 'hp', 150, 4);
  const kept = Math.pow(dsp.rms(hp) / dsp.rms(stem.bass), 2);
  row('the bass above 150 Hz (small speakers)', (100 * kept).toFixed(0) + ' percent of the bass stem\'s energy', 'at least 25 percent', kept >= 0.25);
  const mono = new Float32Array(final[0].length);
  for (let i = 0; i < mono.length; i++) { mono[i] = 0.5 * (final[0][i] + final[1][i]); }
  const loss = dsp.rmsDb(final) - dsp.rmsDb(mono);
  row('mono fold-down', f2(loss) + ' dB lost', 'less than 1.5 dB', loss < 1.5);

  /* how loud each part of the film is (BS.1770 momentary, 400 ms) */
  const mom = kit.mix.loudness(final).momentary;                // one value every 100 ms; value k covers k/10 to k/10 + 0.4 s
  const loudest = (t0, t1) => { let m = -Infinity; for (let k = Math.round(t0 * 10); k <= Math.round(t1 * 10) - 4 && k < mom.length; k++) { if (mom[k] > m) { m = mom[k]; } } return m; };
  const meanOf = (t0, t1) => { let s = 0, n = 0; for (let k = Math.round(t0 * 10); k <= Math.round(t1 * 10) - 4 && k < mom.length; k++) { if (mom[k] > -70) { s += Math.pow(10, mom[k] / 10); n++; } } return n ? 10 * Math.log10(s / n) : -Infinity; };
  const parts = [['dock', 0.4, 4], ['idea 1', 4, 7.9], ['NO 1', 7.9, 8.6], ['restart', 10, 12], ['idea 2', 12, 16.9], ['NO 2', 16.9, 17.6], ['PASS 1', 22, 24], ['PASS 2', 24, 26], ['PASS 3', 26, 28], ['PASS 4', 28, 30], ['winner', 30, 32], ['title', 32, 36.9], ['slab', 36.9, 37.6], ['tag', 38, 42], ['last chord', 42, 45]];
  row('momentary loudness by part, mean (loudest), LUFS', parts.map(([n, a, b]) => n + ' ' + f1(meanOf(a, b)) + ' (' + f1(loudest(a, b)) + ')').join(' | '), 'idea 1 loud, idea 2 lighter, idea 3 climbing, the hits the loudest moments', null);

  /* the long-term spectrum (this candidate's own estimate; the kit's analysis is the reference) */
  const w = dsp.welch(final, { size: 16384 });
  const psd = new Float64Array(w.power[0].length);
  for (let k = 0; k < psd.length; k++) { psd[k] = 0.5 * (w.power[0][k] + w.power[1][k]); }
  const total = dsp.bandPower(psd, w.df, 20, 24000);
  const rel = (a, b) => 10 * Math.log10(dsp.bandPower(psd, w.df, a, b) / total);
  const xs = [], ys = [];
  for (let fc = 200; fc <= 8000.01; fc *= Math.pow(2, 1 / 3)) {
    const a = fc / Math.pow(2, 1 / 6), b = fc * Math.pow(2, 1 / 6);
    xs.push(Math.log2(fc)); ys.push(10 * Math.log10(dsp.bandPower(psd, w.df, a, b) / (b - a)));
  }
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const slope = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) * (v - mx), 0);
  row('spectrum, own estimate', 'density slope 200 Hz to 8 kHz ' + f2(slope) + ' dB an octave; above 8 kHz ' + f1(rel(8000, 24000)) + ' dB; 2 to 5 kHz ' + f1(rel(2000, 5000)) + ' dB; below 50 Hz ' + f1(rel(20, 50)) + ' dB (relative to the total)',
    'above 8 kHz at most -30; 2 to 5 kHz at most -14', rel(8000, 24000) <= -30 && rel(2000, 5000) <= -14);
  if (o.info) { row('the master bus', 'gain ' + f1(o.info.gainDb) + ' dB; compressor up to ' + f1(o.info.comp ? o.info.comp.maxReductionDb : 0) + ' dB (mean ' + f2(o.info.comp ? o.info.comp.meanReductionDb : 0) + '); limiter up to ' + f1(o.info.limiter.maxReductionDb) + ' dB on ' + f2(o.info.limiter.limitedPercent) + ' percent of the samples', 'gentle', null); }

  /* ---------------------------------------------------------------- print and save */
  const wd = [0, 1].map((c) => Math.min(c ? 150 : 60, Math.max(...rows.map((r) => (c ? r.measured : r.check).length))));
  if (!o.quiet) {
    for (const r of rows) { console.log('  ' + (r.pass === null ? '    ' : r.pass ? 'PASS' : 'FAIL') + '  ' + r.check.padEnd(wd[0]) + '  ' + r.measured + '   [wanted: ' + r.wanted + ']'); }
    notes.forEach((n) => console.log('  note  ' + n));
    console.log(failures.length ? '  FAILED: ' + failures.length : '  All of this candidate\'s own checks passed.');
  }
  fs.writeFileSync(path.join(HERE, 'chart-check.json'), JSON.stringify({ ok: failures.length === 0, rows, exceptions: leaps, sections, failures }, null, 1) + '\n');
  return { ok: failures.length === 0, failures, rows, notes };
}

module.exports = { run };
if (require.main === module) { process.exit(run().ok ? 0 : 1); }
