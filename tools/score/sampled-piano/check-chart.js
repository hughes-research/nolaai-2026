#!/usr/bin/env node
/*
 * tools/score/sampled-piano/check-chart.js: the chart, checked as data.
 *
 *   node tools/score/sampled-piano/check-chart.js      (after build.js; reads chart.js, arrangement.json, final.wav, stems/)
 *
 * Prints one table. Exit 0 only if every row passes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const kit = require('../lib');
const chart = require('./chart.js');
const { dsp, wav, checks } = kit;
const tl = kit.timeline.load();
const HERE = process.env.SCORE_OUT ? path.resolve(process.env.SCORE_OUT) : __dirname;      // SCORE_OUT=<dir>: check a trial build
const arr = JSON.parse(fs.readFileSync(path.join(HERE, 'arrangement.json'), 'utf8'));
const rd = (f) => { const w = wav.read(path.join(HERE, f)); return [w.channels[0], w.channels[1]]; };
const final = rd('final.wav');
const stems = { bass: rd('stems/bass.wav'), keys: rd('stems/keys.wav'), drums: rd('stems/drums.wav'), fx: rd('stems/fx.wav') };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const name = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const f1 = (x, d) => (Number.isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : String(x));
const rows = [];
let bad = 0;
function row(what, measured, wanted, ok) { rows.push([ok ? 'PASS' : 'FAIL', what, measured, wanted]); if (!ok) { bad++; } }

/* ---- 1. the bass line, bar by bar ------------------------------------- */
const bars = Object.keys(chart.BASS).map(Number).sort((a, b) => a - b);
const real = (bar) => chart.BASS[bar].filter((n) => n[4] !== 'ghost');
const lines = [];
let toneBad = [], stepBad = [], exceptions = [];
bars.forEach((bar, i) => {
  const notes = real(bar);
  const sounding = (beat) => { let hit = null; notes.forEach((n) => { if (n[0] <= beat + 1e-9 && n[0] + n[2] > beat + 1e-9) { hit = n; } }); return hit; };
  const tones = [1, 3].map((beat) => {
    const n = sounding(beat);
    if (!n) { return beat === 1 && bar === 1 ? 'rest' : (beat === 3 && (bar === 5) ? 'out' : 'rest'); }
    const seg = (chart.HARMONY[bar] || []).find((h) => beat >= h[0] && beat < h[1]);
    const ok = seg && seg[3].indexOf(n[1] % 12) >= 0;
    if (!ok) { toneBad.push('bar ' + bar + ' beat ' + beat + ': ' + name(n[1]) + ' is not in ' + (seg ? seg[2] : '?')); }
    const degree = seg ? ['root', '', '', '3rd', '3rd', '', '', '5th', '', '', '7th', '7th'][((n[1] % 12) - seg[3][0] + 12) % 12] : '';
    return name(n[1]) + ' (' + (seg ? seg[2] : '?') + (ok ? '' : ' NOT A CHORD TONE') + ')';
  });
  let approach = '';
  const nextBar = bars[i + 1];
  if (nextBar !== undefined) {
    const last = notes[notes.length - 1], first = real(nextBar)[0];
    const d = first[1] - last[1], step = Math.abs(d) === 1 || Math.abs(d) === 2;
    approach = name(last[1]) + ' to ' + name(first[1]) + ' (' + (d > 0 ? '+' : '') + d + ')';
    if (!step) {
      if (chart.APPROACH_EXCEPTIONS[bar]) { exceptions.push('bar ' + bar + ': ' + chart.APPROACH_EXCEPTIONS[bar]); approach += ' exception'; }
      else { stepBad.push('bar ' + bar + ': ' + approach); }
    }
  }
  lines.push([bar, chart.CHORDS[bar - 1], notes.map((n) => name(n[1])).join(' '), tones[0], tones[1], approach]);
});
row('bass on beats 1 and 3 is a chord tone', toneBad.length ? toneBad.join('; ') : 'all ' + bars.length + ' bars', 'every bar', toneBad.length === 0);
row('bass approaches the next bar by a step or half step', stepBad.length ? stepBad.join('; ') : (bars.length - 1 - exceptions.length) + ' of ' + (bars.length - 1) + ' bars; ' + exceptions.length + ' stated exceptions', 'a step, or a stated exception', stepBad.length === 0);
const seen = new Map(); const dup = [];
bars.forEach((bar) => { const k = real(bar).map((n) => n[1]).join(','); if (seen.has(k)) { dup.push('bars ' + seen.get(k) + ' and ' + bar); } seen.set(k, bar); });
row('no two bars have the same bass pitches', dup.length ? dup.join('; ') : bars.length + ' different bars', 'none repeated', dup.length === 0);
const bassPlayed = arr.notes.filter((n) => n.inst === 'bass');
const lo = Math.min(...bassPlayed.map((n) => n.midi)), hi = Math.max(...bassPlayed.map((n) => n.midi));
row('bass range, as written', name(lo) + ' to ' + name(hi) + ' (MIDI ' + lo + ' to ' + hi + ')', 'E1 to G3 (MIDI 28 to 55)', lo >= 28 && hi <= 55);
/* the pitch that actually sounds: the strongest partial of the bass stem near the fundamental */
function soundingHz(t0, t1, guess) {
  const n = 32768, re = new Float64Array(n), im = new Float64Array(n);
  const a = Math.round(t0 * 48000), len = Math.min(n, Math.round((t1 - t0) * 48000));
  for (let i = 0; i < len; i++) { re[i] = 0.5 * (stems.bass[0][a + i] + stems.bass[1][a + i]) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / len)); }
  dsp.fft(re, im);
  const df = 48000 / n; let best = 0, at = 0;
  for (let k = Math.round(guess * 0.8 / df); k <= Math.round(guess * 1.25 / df); k++) { const m = re[k] * re[k] + im[k] * im[k]; if (m > best) { best = m; at = k; } }
  const p = (k) => Math.log(re[k] * re[k] + im[k] * im[k] + 1e-30);
  const den = p(at - 1) - 2 * p(at) + p(at + 1);
  return (at + (den < 0 ? 0.5 * (p(at - 1) - p(at + 1)) / den : 0)) * df;
}
const probes = [[22.05, 22.45, 38], [26.05, 26.45, 52], [28.05, 28.45, 45], [37.1, 37.9, 38], [40.2, 40.9, 38]];
const heard = probes.map(([a, b, m]) => { const want = 440 * Math.pow(2, (m - 69) / 12), got = soundingHz(a, b, want); return { m, want, got, cents: 1200 * Math.log2(got / want) }; });
row('bass sounds at the written octave', heard.map((h) => name(h.m) + ' ' + f1(h.got) + ' Hz (' + (h.cents >= 0 ? '+' : '') + f1(h.cents, 0) + ' c)').join(', '), 'within 30 cents of ' + heard.map((h) => f1(h.want)).join(', ') + ' Hz', heard.every((h) => Math.abs(h.cents) < 30));

/* ---- 2. swing ----------------------------------------------------------- */
const BEAT = tl.beat;
function swingOf(list, bias) {         // list of times; the ones that fall between 0.5 and 0.8 of a beat are the off-beat eighths
  const r = [];
  list.forEach((t) => { const x = (((t - bias) / BEAT) % 1 + 1) % 1; if (x > 0.5 && x < 0.8) { r.push(x); } });
  return r;
}
const biasOf = (pairs) => { const on = pairs.filter((p) => Math.abs(p.nominal / BEAT - Math.round(p.nominal / BEAT)) < 1e-6 && !p.exact); return on.length ? on.reduce((s, p) => s + (p.t - p.nominal), 0) / on.length : 0; };
const bassPairs = bassPlayed.map((n) => ({ t: n.t, nominal: n.nominal, exact: n.flag === 'hit' || n.flag === 'slab' }));
const pianoPairs = arr.notes.filter((n) => n.inst === 'piano').map((n) => ({ t: n.t, nominal: n.nominal }));
const grid = (t) => Math.round(t / BEAT) * BEAT;
const kinds = (ks) => arr.hits.filter((h) => ks.indexOf(h.kind) >= 0);
const rideAll = kinds(['ride']), swirlAll = kinds(['swirl']), tapAll = kinds(['brush tap']);
const onBias = (hits) => { const on = hits.filter((h) => Math.abs(h.t - grid(h.t)) < 0.03); return on.length ? on.reduce((s, h) => s + (h.t - grid(h.t)), 0) / on.length : 0; };
const swingSets = [
  ['bass', swingOf(bassPairs.filter((p) => !p.exact).map((p) => p.t), biasOf(bassPairs))],
  ['piano', swingOf(pianoPairs.filter((p) => Math.abs((p.nominal / BEAT) % 1 - chart.SWING) < 1e-6).map((p) => p.t), 0)],
  ['ride', swingOf(rideAll.map((h) => h.t), onBias(rideAll))],
  ['brush swirl', swingOf(swirlAll.map((h) => h.t), onBias(swirlAll))],
  ['brush taps', swingOf(tapAll.map((h) => h.t), onBias(tapAll))]
];
const allSwing = [].concat(...swingSets.map((s) => s[1]));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
row('swing ratio of the off-beat eighths (mean)', f1(mean(allSwing), 3) + ' over ' + allSwing.length + ' notes (' + swingSets.map((s) => s[0] + ' ' + (s[1].length ? f1(mean(s[1]), 3) + ' x' + s[1].length : 'none')).join(', ') + ')', '0.62 to 0.66', mean(allSwing) >= 0.62 && mean(allSwing) <= 0.66 && swingSets.every((s) => !s[1].length || (mean(s[1]) >= 0.62 && mean(s[1]) <= 0.66)));
row('swing ratio, every single off-beat eighth', f1(Math.min(...allSwing), 3) + ' to ' + f1(Math.max(...allSwing), 3), '0.62 to 0.66', Math.min(...allSwing) >= 0.62 && Math.max(...allSwing) <= 0.66);

/* ---- 3. the performance -------------------------------------------------- */
/* Revision: the white jitter (bass 4 to 12 ms behind, ride 0 to 6 ms ahead, each note drawn afresh) was replaced by a
 * drift with memory, so the two rows that asked for those ranges became these: where each voice sits on average, how
 * far it wanders (standard deviation), how much a note remembers the one before (lag-1 correlation of consecutive
 * on-beat notes), and the furthest it goes. */
const sdOf = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };
const lag1 = (a) => { const m = mean(a); let num = 0, den = 0; for (let i = 0; i < a.length; i++) { den += (a[i] - m) * (a[i] - m); if (i) { num += (a[i] - m) * (a[i - 1] - m); } } return den > 0 ? num / den : 0; };
const onBeat = (p) => Math.abs(p.nominal / BEAT - Math.round(p.nominal / BEAT)) < 1e-6;
const behind = bassPairs.filter((p) => !p.exact).map((p) => (p.t - p.nominal) * 1000);
const behindOn = bassPairs.filter((p) => !p.exact && onBeat(p)).map((p) => (p.t - p.nominal) * 1000);
row('bass sits behind the beat, never ahead of it', 'mean ' + f1(mean(behind)) + ' ms; ' + f1(Math.min(...behind)) + ' to ' + f1(Math.max(...behind)) + ' ms', 'mean 6 to 10 ms; none under 0 or over 18 ms', mean(behind) >= 6 && mean(behind) <= 10 && Math.min(...behind) >= -1e-6 && Math.max(...behind) <= 18 + 1e-6);
row('bass time drifts with memory', 'sd ' + f1(sdOf(behindOn), 2) + ' ms, lag-1 correlation ' + f1(lag1(behindOn), 2) + ' over ' + behindOn.length + ' on-beat notes', 'sd 3 to 5 ms; lag-1 0.5 to 0.8', sdOf(behindOn) >= 3 && sdOf(behindOn) <= 5 && lag1(behindOn) >= 0.5 && lag1(behindOn) <= 0.8);
const swingGrid = (t) => { const b = Math.floor(t / BEAT + 0.25); const cands = [b * BEAT, (b + chart.SWING) * BEAT, (b - 1 + chart.SWING) * BEAT, (b + 1) * BEAT]; return cands.reduce((best, c) => (Math.abs(c - t) < Math.abs(best - t) ? c : best)); };
const ahead = rideAll.map((h) => (swingGrid(h.t) - h.t) * 1000);
const offGrid = (hits) => hits.filter((h) => Math.abs(h.t - grid(h.t)) < 0.03).map((h) => (h.t - grid(h.t)) * 1000);
const rideOn = offGrid(rideAll);
row('ride sits ahead of the beat', 'mean ' + f1(mean(ahead)) + ' ms ahead; ' + f1(Math.min(...ahead)) + ' to ' + f1(Math.max(...ahead)) + ' ms', 'mean 2 to 5 ms ahead; none over 10 ms ahead or 4 ms behind', mean(ahead) >= 2 && mean(ahead) <= 5 && Math.min(...ahead) >= -4 && Math.max(...ahead) <= 10);
row('ride time drifts with memory', 'sd ' + f1(sdOf(rideOn), 2) + ' ms, lag-1 correlation ' + f1(lag1(rideOn), 2) + ' over ' + rideOn.length + ' on-beat strokes', 'sd 2 to 3 ms; lag-1 0.5 to 0.8', sdOf(rideOn) >= 2 && sdOf(rideOn) <= 3 && lag1(rideOn) >= 0.5 && lag1(rideOn) <= 0.8);
[['brush swirl', swirlAll], ['brush taps', tapAll]].forEach(([nm, hits]) => {
  const on = offGrid(hits);
  row(nm + ': time drifts with memory', 'sd ' + f1(sdOf(on), 2) + ' ms, lag-1 correlation ' + f1(lag1(on), 2) + ' over ' + on.length + ' on-beat strokes', 'sd 3 to 5 ms; lag-1 0.5 to 0.8', sdOf(on) >= 3 && sdOf(on) <= 5 && lag1(on) >= 0.5 && lag1(on) <= 0.8);
});
const pianoLate = pianoPairs.map((p) => (p.t - p.nominal) * 1000);
row('piano: a comp stab sometimes a hair late', pianoLate.filter((x) => x > 5).length + ' of ' + pianoLate.length + ' notes more than 5 ms late (largest ' + f1(Math.max(...pianoLate)) + ' ms)', 'some, none over 16 ms', pianoLate.some((x) => x > 5) && Math.max(...pianoLate) <= 16);
let repeats = 0; const lastV = {};
arr.hits.filter((h) => h.inst === 'drums').forEach((h) => { const id = h.kind.split(' (')[0] + ':' + h.key; const v = Math.round(h.vel * 127); if (lastV[id] === v) { repeats++; } lastV[id] = v; });
row('no drum voice at the identical velocity twice running', repeats + ' repeats in ' + arr.hits.filter((h) => h.inst === 'drums').length + ' hits', '0', repeats === 0);
const bv = bassPlayed.filter((n) => !n.flag).map((n) => Math.round(n.vel * 127));
row('bass velocities vary', new Set(bv).size + ' different values in ' + bv.length + ' notes (' + Math.min(...bv) + ' to ' + Math.max(...bv) + ' of 127)', 'at least 15 different', new Set(bv).size >= 15);

/* ---- 4. the shape: notes a second, section by section -------------------- */
const events = arr.notes.map((n) => n.t).concat(arr.hits.filter((h) => h.inst === 'drums').map((h) => h.t));
const dens = chart.SECTIONS.map((s) => ({ name: s.name, from: s.from, to: s.to, rate: events.filter((t) => t >= s.from - 0.02 && t < s.to - 0.02).length / (s.to - s.from) }));
const by = (n) => dens.find((d) => d.name.indexOf(n) === 0).rate;
const beforeTitle = dens.filter((d) => d.to <= 32);
row('idea 1 is the busiest before the title', f1(by('idea 1')) + ' a second; the next busiest before 32 s is ' + f1(Math.max(...beforeTitle.filter((d) => d.name.indexOf('idea 1') !== 0).map((d) => d.rate))), 'the largest', beforeTitle.every((d) => d.rate <= by('idea 1') + 1e-9));
row('idea 2 is thinner than idea 1', f1(by('idea 2')) + ' against ' + f1(by('idea 1')) + ' a second', 'smaller', by('idea 2') < by('idea 1'));
const passRates = ['idea 3, PASS 1', 'idea 3, PASS 2', 'idea 3, PASS 3', 'idea 3, PASS 4'].map(by);
row('idea 3 grows by a layer at each PASS', passRates.map((x) => f1(x)).join(' < ') + ' a second', 'rising', passRates.every((x, i) => i === 0 || x > passRates[i - 1]));
const tops = [1, 2, 3, 4].map((p) => Math.max(...arr.notes.filter((n) => n.pass === p).map((n) => n.midi)));
const winnerTop = Math.max(...arr.notes.filter((n) => n.inst === 'piano' && n.t > tl.winner - 0.05 && n.t < tl.winner + 0.3).map((n) => n.midi));
row('the top notes of the four PASS figures rise, and the winner tops them', tops.map(name).join(' < ') + ' < ' + name(winnerTop) + ' (MIDI ' + tops.concat([winnerTop]).join(', ') + ')', 'rising', tops.concat([winnerTop]).every((x, i, a) => i === 0 || x > a[i - 1]));

/* ---- 4b. revision: the notes the judges faulted ----------------------------- */
/* A minor ninth (13 semitones, or that plus octaves) between a bass note and a piano note that sound together for
 * 80 ms or more reads as a wrong note. The one place it belongs is the flat nine of a dominant over its own root
 * (the bass on A under the Bb of an A7b9). */
const overlap = (a, b) => Math.min(a.t + a.dur, b.t + b.dur) - Math.max(a.t, b.t);
const pianoPlayed = arr.notes.filter((n) => n.inst === 'piano');
const ninths = [], flatNines = [];
bassPlayed.forEach((b) => pianoPlayed.forEach((k) => {
  if (k.midi > b.midi && (k.midi - b.midi) % 12 === 1 && overlap(b, k) >= 0.08) {
    const when = Math.max(b.t, k.t) + 0.02, bar = Math.floor(when / tl.bar) + 1, beat = (when - (bar - 1) * tl.bar) / BEAT + 1;
    const seg = (chart.HARMONY[bar] || []).find((h) => beat >= h[0] && beat < h[1]);
    const what = 'bar ' + bar + ': ' + name(b.midi) + ' under ' + name(k.midi) + (seg ? ' (' + seg[2] + ')' : '');
    if (seg && /7b9/.test(seg[2]) && b.midi % 12 === seg[3][0]) { if (flatNines.indexOf(what) < 0) { flatNines.push(what); } } else { ninths.push(what); }
  }
}));
row('no minor ninth between the bass and the piano', ninths.length ? ninths.join('; ') : 'none (the flat nine over its own root: ' + (flatNines.join('; ') || 'none') + ')', 'none, but the flat nine of a dominant over its root', ninths.length === 0);
const inside = [];
pianoPlayed.forEach((a, i) => pianoPlayed.slice(i + 1).forEach((b) => { if (Math.abs(a.midi - b.midi) === 13 && overlap(a, b) >= 0.08) { const w = 'bar ' + (Math.floor(Math.max(a.t, b.t) / tl.bar) + 1) + ': ' + name(Math.min(a.midi, b.midi)) + ' under ' + name(Math.max(a.midi, b.midi)); if (inside.indexOf(w) < 0) { inside.push(w); } } }));
row('no minor ninth inside a piano voicing', inside.length ? inside.join('; ') : 'none', 'none', inside.length === 0);
const longest = bassPlayed.reduce((m, n) => (n.dur > m.dur ? n : m), bassPlayed[0]);
row('no bass note is held into its recording\'s loop', 'longest ' + f1(longest.dur, 2) + ' s (' + name(longest.midi) + ' at ' + f1(longest.t, 2) + ' s)', 'at most 1.35 s (the loop begins about 1.45 s after the pluck)', longest.dur <= 1.35);
const inText = (a, b) => events.filter((t) => t >= a && t < b).length / (b - a);
row('the third on-screen line (30.5 to 32 s) is left room', f1(inText(30.5, 32)) + ' events a second (idea 2: ' + f1(by('idea 2')) + ')', 'at most 10', inText(30.5, 32) <= 10);

/* ---- 5. measured on the audio -------------------------------------------- */
[['after NO 1', [9.0, 9.9], [6, 8]], ['after NO 2', [18.5, 19.9], [15, 17]]].forEach(([nm, out, before]) => {
  const drops = ['bass', 'keys', 'drums'].map((k) => dsp.rmsDb(stems[k], before[0], before[1]) - dsp.rmsDb(stems[k], out[0], out[1]));
  row('the band is out ' + nm + ' (' + out[0] + ' to ' + out[1] + ' s)', ['bass', 'keys', 'drums'].map((k, i) => k + ' ' + (Number.isFinite(drops[i]) ? f1(drops[i]) + ' dB' : 'silent')).join(', ') + ' under ' + before[0] + '-' + before[1] + ' s', 'each at least 30 dB', drops.every((d) => d >= 30));
});
const breath = dsp.rmsDb(final, 20.3, 22.0);
let nonzero = 0; for (let i = Math.round(20.3 * 48000); i < 22 * 48000; i++) { if (final[0][i] !== 0 || final[1][i] !== 0) { nonzero++; } }
row('the held breath, 20.3 to 22.0 s', f1(breath) + ' dBFS RMS, ' + (100 * nonzero / (1.7 * 48000)).toFixed(0) + ' % of samples not zero', 'below -60 dBFS, not digital zero', breath < -60 && breath > -80 && nonzero > 0.9 * 1.7 * 48000);
tl.sync.forEach((s) => { const o = checks.onset(final, s.t); row('HARD hit: ' + s.name + ' at ' + s.t + ' s', o.found ? 'onset ' + (o.offsetMs >= 0 ? '+' : '') + f1(o.offsetMs) + ' ms' : 'no onset found', 'within 10 ms', o.found && Math.abs(o.offsetMs) <= 10); });
const head = dsp.rmsDb(final, 0, 0.25), headBand = Math.max(...['bass', 'keys', 'drums'].map((k) => dsp.peak(stems[k], 0, 0.25)));
row('nothing but room tone before 0.25 s', f1(head) + ' dBFS RMS; instrument stems peak ' + (headBand === 0 ? 'digital zero' : f1(dsp.db(headBand)) + ' dBFS'), 'below -60 dBFS', head < -60 && headBand < 1e-4);
/* revision: the brushes are continuous (realism judge's measure: the 10 ms RMS envelope of the drums stem at 12 to 16 s,
 * brushes alone, every 2 ms; the peak minus the valley inside each beat, and the envelope against itself a bar later) */
{
  const D = stems.drums, hop = 96, win = 480, a0 = Math.round(12 * 48000), n = Math.floor((4 * 48000 - win) / hop);
  const e = new Float64Array(n), lin = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s2 = 0; for (let j = a0 + i * hop; j < a0 + i * hop + win; j++) { const m = 0.5 * (D[0][j] + D[1][j]); s2 += m * m; } lin[i] = Math.sqrt(s2 / win); e[i] = 20 * Math.log10(lin[i] + 1e-12); }
  const perBeat = [];
  for (let b = 0; b < 8; b++) { let hi = -999, lo = 999; for (let i = Math.round(b * 0.5 * 48000 / hop); i < Math.min(n, Math.round((b + 1) * 0.5 * 48000 / hop)); i++) { if (e[i] > hi) { hi = e[i]; } if (e[i] < lo) { lo = e[i]; } } perBeat.push(hi - lo); }
  const corrAt = (lagS) => { const L = Math.round(lagS * 48000 / hop), m = lin.reduce((s2, v) => s2 + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i + L < n; i++) { const x = lin[i] - m, y = lin[i + L] - m; sxy += x * y; sxx += x * x; syy += y * y; } return sxy / Math.sqrt(sxx * syy); };
  row('brushes: no dead air between strokes (drums stem, 12 to 16 s)', 'peak minus valley in each beat: ' + perBeat.map((v) => f1(v, 0)).join(' ') + ' dB', 'each under 15 dB', perBeat.every((v) => v < 15));
  row('brushes: no bar is the copy of the bar before', 'envelope against itself a bar later: r ' + f1(corrAt(2), 3) + ' (a beat later ' + f1(corrAt(0.5), 3) + ')', 'under 0.85', corrAt(2) < 0.85);
}
/* revision: the piano leads the ring-out, and the slab is the last loud thing */
{
  const halves = []; for (let t = 41; t < 45; t += 0.5) { halves.push([t, dsp.rmsDb(stems.keys, t, t + 0.5) - dsp.rmsDb(stems.bass, t, t + 0.5)]); }
  const worst = halves.reduce((m, h) => (h[1] < m[1] ? h : m), halves[0]);
  row('the piano leads the ring-out (41 to 45 s)', 'keys stem over bass stem by at least ' + f1(worst[1]) + ' dB (at ' + worst[0] + ' s)', 'the keys stem louder in every half second', worst[1] > 0);
  const slab = dsp.rmsDb(final, 37, 37.5), last = dsp.rmsDb(final, 40, 40.5);
  row('the slab is louder than the last chord', f1(slab) + ' against ' + f1(last) + ' dBFS (first half second of each)', 'at least 2 dB', slab - last >= 2);
  const lift = dsp.rmsDb(final, 36, 36.6) - dsp.rmsDb(final, 34, 34.5);
  row('the band builds into the last break', f1(dsp.rmsDb(final, 34, 34.5)) + ' dBFS at 34.0-34.5 s, ' + f1(dsp.rmsDb(final, 36, 36.6)) + ' at 36.0-36.6 s: ' + f1(lift) + ' dB up', 'at least 3 dB', lift >= 3);
}
const tail = dsp.rmsDb(final, 45.9, 46), lastMusic = dsp.rmsDb(final, 45.4, 45.7);
row('the tail is inaudible by 45.9 s', f1(tail) + ' dBFS RMS after 45.9 s (' + f1(lastMusic) + ' at 45.4 to 45.7 s, before the safety fade)', 'below -60 dBFS', tail < -60);

/* ---- print ---------------------------------------------------------------- */
console.log('THE BASS LINE, BAR BY BAR (chart.js)');
console.log('| bar | chord | bass | beat 1 | beat 3 | into the next bar (semitones) |');
console.log('|---:|---|---|---|---|---|');
lines.forEach((l) => console.log('| ' + l.join(' | ') + ' |'));
console.log('\nstated exceptions to the step-wise approach:'); exceptions.forEach((e) => console.log('  - ' + e));
console.log('\nNOTES A SECOND, SECTION BY SECTION (bass and piano notes and drum hits, as played)');
console.log('| section | from s | to s | events a second |'); console.log('|---|---:|---:|---:|');
dens.forEach((d) => console.log('| ' + d.name + ' | ' + d.from + ' | ' + d.to + ' | ' + f1(d.rate) + ' |'));
console.log('\nTHE CHART CHECKED AS DATA');
console.log('| | check | measured | wanted |'); console.log('|---|---|---|---|');
rows.forEach((r) => console.log('| ' + r.join(' | ') + ' |'));
console.log('\n' + (bad ? bad + ' of ' + rows.length + ' rows FAIL' : 'all ' + rows.length + ' rows pass'));
process.exit(bad ? 1 : 0);
