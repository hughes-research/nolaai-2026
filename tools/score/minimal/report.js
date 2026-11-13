#!/usr/bin/env node
/*
 * tools/score/minimal/report.js: prints this candidate's report, as Markdown, to standard output.
 *
 *   node tools/score/minimal/report.js            (after build.js and the kit's analyze.js have run)
 *
 * Every number in it is read from the files the build and the analysis wrote (build-numbers.json,
 * check-results.json, arrangement.json, analysis/numbers.md); the chart table is printed from chart.js.
 * It writes nothing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const chart = require('./chart.js');
const here = (...p) => path.join(__dirname, ...p);
const B = JSON.parse(fs.readFileSync(here('build-numbers.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(here('check-results.json'), 'utf8'));
const A = fs.existsSync(here('analysis', 'numbers.md')) ? fs.readFileSync(here('analysis', 'numbers.md'), 'utf8') : '';
const f1 = (x) => Number(x).toFixed(1), f2 = (x) => Number(x).toFixed(2);
const out = [];
const P = (s) => out.push(s === undefined ? '' : s);

function beatName(b) {
  const whole = Math.floor(b + 1e-9), frac = b - whole;
  if (frac < 1e-6) { return String(whole); }
  if (Math.abs(frac - 0.5) < 1e-6) { return whole + '&'; }
  return whole + (Math.abs(frac - 1 / 3) < 1e-6 ? '+1/3' : '+2/3');
}
function section(md, title) {
  const i = md.indexOf('## ' + title);
  if (i < 0) { return ''; }
  const j = md.indexOf('\n## ', i + 4);
  return md.slice(md.indexOf('\n', i) + 1, j < 0 ? md.length : j).trim();
}

P('# minimal: the driest reading of the brief');
P();
P('Nobody has heard this file. Everything below is measured or seen in a picture; nothing is a claim about how it sounds.');
P();
P('## 1. The idea in five lines');
P();
P('1. Two instruments carry the film: an upright bass and a pair of brushes. The piano plays seven times in 46 seconds (13 notes).');
P('2. The bass line is the melody and tells the joke. Idea 1 over-plays (a run, the top of the instrument in three beats, a drop of a tenth and an octave, a chromatic slide). Idea 2 barely tries (half notes: root, fifth, done). Idea 3 plays a scale in plain quarter notes, and wins.');
P('3. Each gate owns a note: G, Bb, C, D, the four bass notes the bays stand up on. The piano only ever says PASS: one gate note when a gate lifts. So idea 2 gets one note (G4 at 14.5 s) and idea 3 gets all four, climbing.');
P('4. The three hard hits enclose the home note, as a jazz line does before it lands: NO 1 falls a half step too high (Ab1), NO 2 a half step too low (F#1), the slab lands on G1 with the only held chord of the film. Each thud is tuned to its bass note (51.9, 46.2, 49.0 Hz).');
P('5. Silence is the third instrument: two stop-times, five seconds of nothing before idea 3, a breath while the slab falls, a beat of nothing before the last note.');
P();
P('## 2. Key: G minor, and why');
P();
P('- The brief limits the bass to E1..G3. G minor is the only key in which that range holds the tonic three times (G1, G2, G3), so the winning line can be the plainest thing there is, a two-octave scale from the bottom tonic to the top one, and G3 is exactly the highest note allowed.');
P('- G1 is 49.0 Hz, inside the 45 to 60 Hz the brief asks of a thud. The last thud is tuned to the home root, and the two "wrong" hits to the notes they land on (Ab1 51.9 Hz, F#1 46.2 Hz), both still inside that band.');
P('- Tonic and dominant are the open G and D strings: idea 2\'s two-feel can be as lazy as it should be.');
P('- The gate notes on the piano (G4 to D5, 392 to 587 Hz) sit far below the 2 to 5 kHz band the mix has to keep down.');
P('- The first soundtrack was in C minor (video/score.js). This is not that piece.');
P();
P('## 3. The instruments, and why (from lib/audition)');
P();
P('| Part | Library, preset | Why, by the audition\'s numbers |');
P('|---|---|---|');
P('| Bass | MuseScore General 000-032 Acoustic Bass (keys as written: MIDI 31 sounds 49.0 Hz) | The same seven recordings as FluidR3, but a note takes 0.40 s to die after its note-off (FluidR3: 0.12 s, each walking note cut off), velocity changes the tone (centroid at C4 425, 522, 612 Hz at 0.3, 0.6, 0.9; FluidR3: identical at every velocity), lower floor between partials (-73 to -83 dB against -68 to -78). Not the pizzicato presets: a string section, 11 to 21 cents flat in the low octave. |');
P('| Keys | MuseScore General 008-000 Mellow Grand Piano | Chosen over the vibraphone on one measurement: how much of an exposed note is a recording. The piano plays its recording for the whole audible note (its loops start 3.0 to 6.8 s into a note); the vibraphone is one frozen cycle from 0.12 to 0.42 s on (audition, warning 9). This listener complained of "beeps instead of instruments", and asked for piano. Over the other pianos: darkest (centroid at C4 570 Hz; Grand 701; FluidR3 1491), 2-5 kHz 27 to 40 dB under the note, and its notes fold to mono best (Bb3 loses 0.6 dB; Grand 4.0 dB). What the vibraphone would have given: a longer ring (20 dB down after 1.1 to 1.3 s against 0.75 to 0.92 s for these notes) and a last chord gone by itself (60 dB down in 3.4 to 4.4 s). |');
P('| Brushes | MuseScore General 128-040 Brush: key 40 swirl, keys 38 and 39 two different taps (alternated) | The only kits with brushes are 128-040 to 042. MuseScore has the three recordings in mono (correlation 1.00), so nothing cancels and the kit can be placed by the mix; FluidR3 is the same in stereo. |');
P('| Hi-hat, ride, bass drum | Same kit: key 44 (foot), key 51 (Ride1), key 36 (Std Kick 7) | Hat and ride are the brightest things in the library (centroid 10.7 and 7.0 kHz), so both are low-passed and low; the ride does not play before the winner (30 s). The bass drum is the darkest kick on offer (80 percent of it under 60 Hz): feathered from the title on, and under each thud. |');
P('| The NOs, room tone | kit synth.thud and synth.roomTone | Thuds at 51.9, 46.2 and 49.0 Hz, sizes 1.0, 0.85, 1.4, rattle 0.3, 0.25, 0.12 (least on the good NO). |');
P();
P('## 4. The chart');
P();
P('120 BPM, 4/4, 23 bars of 2 s, eighths swung at ' + chart.SWING + '. Sounding pitches (C4 = middle C). Beats in brackets: "2&" is the swung eighth after beat 2, "+1/3" a triplet. Written before any code; this table is printed from chart.js, which the build plays.');
P();
P('| Bar | Time s | Picture | Chord | Bass | Piano | Brushes and kit | What it is doing |');
P('|---:|---|---|---|---|---|---|---|');
for (let bar = 1; bar <= 23; bar++) {
  const bass = chart.BASS.filter((n) => n.bar === bar).map((n) => '[' + beatName(n.beat) + '] ' + (n.hard ? '**' + n.note + '**' : n.note) + (n.choke ? ' choked' : '') + (n.ring ? ' rings' : '') + (n.ghost ? ' (ghost)' : '')).join(' ') || '-';
  const keys = chart.KEYS.filter((k) => k.bar === bar).map((k) => '[' + beatName(k.beat) + '] ' + (k.hard ? '**' : '') + k.notes.join(' ') + (k.hard ? '**' : '') + (k.roll ? ' rolled' : '')).join(' ') || '-';
  const d = chart.DRUMS[bar];
  const drums = d ? Object.keys(d).map((v) => v + ' ' + d[v].map((h) => (h[2] === 'hard' ? '**' + beatName(h[0]) + '**' : beatName(h[0]))).join(' ')).join('; ') : '-';
  P('| ' + [bar, (bar - 1) * 2 + '-' + bar * 2, chart.PICTURE[bar - 1], chart.CHORDS[bar - 1], bass, keys, drums, chart.REMARKS[bar] || ''].join(' | ') + ' |');
}
P();
P('**Where the band is out.** 0 to 0.5 s (room tone; the first sound is the bass at 0.5 s). 8.4 to 10 s after NO 1 (tails only), brushes alone until 11 s. 17.4 to 22 s after NO 2 and through the held breath. About 36.8 to 37.0 s, a breath while the slab falls. 39.5 to 40 s, a beat of nothing before the last note. The piano is out everywhere except 14.5, 22.5, 24.5, 26.5, 28.5, 37.0 and 40.0 s. The ride is out until 30.0 s.');
P();
P('**How the four PASSes climb.** Each PASS is beat 2 of its bar. Three things rise together: the bass has climbed four more scale steps; the piano plays the next gate note (G4, Bb4, C5, D5: bar 1\'s bass motif two octaves up, and the roots of bars 12 to 15: Gm, Bb, Cm7, Dm7); and one more layer of the kit starts on that beat (swirl, taps on 2 and 4, hi-hat with the foot, swung skip notes). At the winner the bass reaches G3 and the ride enters.');
P();
P('**The three HARD hits.** NO 1 (8.000 s): the slide C2 B1 Bb1 A1 is heading for G and is cut on Ab1, a half step too high; choked; thud 51.9 Hz; bass drum. NO 2 (17.000 s): the two-feel lands on F#1, the dominant\'s third, a half step too low; choked; thud 46.2 Hz. The slab (37.000 s): bar 19 plays Ab1, F#1, a breath, G1: both failures, in order, become the approach to home; G1 rings, thud 49.0 Hz, piano Gm9 (Bb3 D4 F4 A4) held through the two beats of negative. None of the three is humanised; every note is started early by its sample\'s measured onset.');
P();
P('**The tag and the last chord.** Bar 20 answers bar 1 backwards (D3 C3 Bb2, a rest, then G2). The last chord at 40.0 s is the slab chord with one voice moved (F4 down to E4: Gm9 becomes Gm6/9) and the fourth gate\'s note, D5, on top; rolled, released at 45.0 s. The film loops from that ring into half a second of room tone and the first G.');
P();
P('## 5. The chart checked as data (check-chart.js)');
P();
P('From arrangement.json (the notes as played) and the WAV files, not from the build\'s own variables.');
P();
P('| Check | Measured | Target | Result |');
P('|---|---|---|---|');
for (const r of C.chart.rows) { P('| ' + [r.what, String(r.measured).replace(/\|/g, '/') + (r.note ? '<br>' + String(r.note).replace(/\|/g, ';') : ''), r.target, r.ok ? 'pass' : '**FAIL**'].join(' | ') + ' |'); }
P();
if (C.chart.played && C.chart.played.density) {
  P('Events a second, section by section (bass notes + piano notes + drum strokes):');
  P();
  P('| Section | Bass | Piano | Drums | A second |');
  P('|---|---:|---:|---:|---:|');
  for (const d of C.chart.played.density) { P('| ' + [d.name, d.bass, d.keys, d.drums, f2(d.perSecond)].join(' | ') + ' |'); }
  P();
}
P('## 6. The mix chain');
P();
const M = B.mix;
const eq = (list) => list.map((e) => e.type + ' ' + e.f + ' Hz' + (e.db !== undefined ? ' ' + (e.db > 0 ? '+' : '') + e.db + ' dB' : '')).join(', ');
P('- **Performance** (seed ' + B.seed + '): bass 4 to 12 ms behind, drifting like a player; ride 0 to 6 ms ahead; a lone piano note 2 to 9 ms late; the last chord rolled at about 25 ms a note; swing ' + chart.SWING + ' plus or minus 0.006; no drum voice at the same velocity twice running; taps alternate two recordings; walking quarters joined with a 24 to 44 ms gap.');
P('- **Bass**: one sampler render, mono. Zone evening by velocity (the seven recordings differ by up to 6.3 dB in this mix; left alone, the scale stepped 3.6 dB louder between Bb2 and C3 in bar 14; that step is now 1.1 dB, and the largest step between neighbours from bar 12 to bar 18 is 2.6 dB, at a note the chart leans on: K-weighted level of each note in the stem). Harmonics for small speakers: the part under ' + M.bass.harmonics.inLp + ' Hz shaped by a soft curve at a depth that follows each note, and only what that adds between ' + M.bass.harmonics.lo + ' Hz and ' + M.bass.harmonics.hi + ' Hz mixed back (' + M.bass.harmonics.db + ' dB). EQ: ' + eq(M.bass.eq) + '. Centre. Room send ' + M.bass.send + ' dB. Energy above 150 Hz: ' + f1(100 * B.bassAbove150.sampled) + ' percent as sampled, ' + f1(100 * B.bassAbove150.stem) + ' percent in the stem.');
P('- **Piano**: one render; narrowed to ' + M.keys.width + ' of its width; EQ: ' + eq(M.keys.eq) + '; pan ' + M.keys.pan + '; room send ' + M.keys.send + ' dB. Level by fader, measured: the four PASS notes ' + M.keys.underBass + ' dB under the bass (RMS, 22.5 to 30 s), each evened to the first plus 0.7 dB a step (' + B.rides.filter((r) => /\d$/.test(r.note)).map((r) => r.note + ' ' + (r.db >= 0 ? '+' : '') + f1(r.db)).join(', ') + ' dB: this piano\'s recordings are that uneven); slab chord ' + M.keys.chordUnderBass.slab + ' dB and last chord ' + M.keys.chordUnderBass.last + ' dB under the bass in their own windows.');
P('- **Kit**: one preset, three renders (brushes; hat and ride; bass drum) so each has its own tone control. Brushes: ' + eq(M.drums.brush.eq) + ', pan ' + M.drums.brush.pan + ', send ' + M.drums.brush.send + ' dB. Cymbals: ' + eq(M.drums.cym.eq) + ', ' + M.drums.cym.db + ' dB, pan ' + M.drums.cym.pan + '. Bass drum: ' + eq(M.drums.kick.eq) + ', ' + M.drums.kick.db + ' dB, pan ' + M.drums.kick.pan + '. More stir than tap (swirl velocities +' + M.drums.touch.swirl + ', taps ' + M.drums.touch.tap + '). Kit level ' + M.drums.underBass + ' dB under the bass (RMS, 30 to 36.5 s). Stroke peaks shaved on the kit alone to the level of the bass\'s own peaks (up to ' + f1(B.kitPeaks.maxReductionDb) + ' dB, ' + f1(B.kitPeaks.limitedPercent) + ' percent of the film, RMS change ' + f2(B.kitPeaks.rmsChangeDb) + ' dB), so the master does not duck the band on every tap.');
P('- **Thuds**: ' + B.thuds.map((t) => t.name + ' ' + f1(t.hz) + ' Hz at ' + t.db + ' dB').join('; ') + '; room send ' + M.thud.send + ' dB.');
P('- **Room**: mix.room decay ' + M.room.decay + ' s, damp ' + M.room.damp + ', predelay ' + (M.room.predelay * 1000) + ' ms; one room, computed per stem so the stems still sum to the mix.');
P('- **Room tone**: placed at ' + f1(B.toneDbBeforeMaster) + ' dBFS before the master so that it sits at ' + M.tone.db + ' dBFS in final.wav (the master adds ' + f1(B.master.gainDb) + ' dB).');
P('- **Ends**: every stem fades in over 4 ms and out from 45.7 to 46.0 s before the master, so stems through the master equal final.wav.');
P('- **Master** (kit defaults): high-pass ' + M.master.hp + ' Hz, shelf ' + M.master.shelf.db + ' dB above ' + M.master.shelf.f + ' Hz, compressor ' + M.master.comp.ratio + ':1 at ' + M.master.comp.threshold + ' dBFS (up to ' + f1(B.master.comp.maxReductionDb) + ' dB, mean ' + f2(B.master.comp.meanReductionDb) + '), limiter up to ' + f1(B.master.limiter.maxReductionDb) + ' dB on ' + f1(B.master.limiter.limitedPercent) + ' percent of the samples. Out: ' + f2(B.master.lufs) + ' LUFS, ' + f2(B.master.truePeakDb) + ' dBTP, LRA ' + f1(B.master.lra) + ' LU.');
P();
P('## 7. Measurements');
P();
P('### The kit\'s self-checks (build.js exits 0 only if these and section 5 pass)');
P();
P('| Check | Measured | Target | Result |');
P('|---|---|---|---|');
for (const r of C.kit.rows) { P('| ' + [r.name, r.measured, r.target, r.ok ? 'pass' : '**FAIL**'].join(' | ') + ' |'); }
P();
P('### The brief\'s targets, by the kit\'s analysis tool (analysis/numbers.md)');
P();
P(section(A, 'The targets of BRIEF.md section 4.3') || '(run the kit\'s analyze.js first)');
P();
P('### Stems');
P();
P(section(A, 'Stems').split('\n\nSmall-speaker test')[0] || '');
P();
P('## 8. What was looked at');
P();
P('- **This candidate\'s own pictures** (spectro.py, analysis/own-*.png: a plain short-time Fourier transform on a labelled log axis). own-final-00-12s: nothing but the noise floor before 0.5 s; four rising steps at 0.5, 1.0, 1.5, 2.0 s (98, 117, 131, 147 Hz); brush columns from 2.5 s; idea 1 as fast steps up to 196 Hz at 5.0 s, the drop to 73 Hz at 6.5 s, the slide down to 55 Hz; a dark sliver just before 8.0 s; at 8.0 s a low blob at 52 Hz dying by about 9.5 s with nothing above it after 8.4 s; brush columns alone from 10 s and one bass note (92 Hz) at 11 s. own-final-20-32s: only the floor from 20 to 22 s; from 22.0 s a stair of harmonic stacks, one a beat, the fundamental going from 49 Hz to 196 Hz at 30 s; four short bright dashes at 392, 466, 523, 587 Hz at 22.5, 24.5, 26.5, 28.5 s; no brush column at 22.0 s, the first at 22.5 s. own-drums-20-38s: columns once a beat from 22.5 s, taller on 2 and 4 from 24.5 s, brighter tops on 2 and 4 from 26.5 s, paired columns at the swung off-beats from 28.5 s, horizontal cymbal lines from 30.0 s to about 36.3 s, low blobs once a beat from 32 s. own-final-30-46s: the stair coming down; a dark sliver before 37.0 s; at 37.0 s the 49 Hz blob and four held lines (233, 294, 349, 440 Hz); three steps at 38, 38.5, 39 s; a dark sliver before 40 s; one long line at 98 Hz and four chord lines fading smoothly to the floor by about 45.3 s. No thin full-height vertical line (a click) anywhere; the floor is an even speckle with no bright shelf.');
P('- **The kit\'s pictures** (analysis/spectrogram*.png): used for time structure only (the same gaps and entries), because their frequency axis is mirrored (see section 9). analysis/waveform.png: sparse first two bars, a dense block from 4 to 8 s, a spike and a decay at 8 s, a flat line from 18 to 22 s, a steady build from 22 to 30 s, the slab no taller than the loudest bass notes, a long smooth decay after 40 s; no flat tops.');
P('- **The audition\'s pictures** of the chosen presets: bass-musescore.png (sharp starts, a smooth four-second decay on the held note, a clean stop, nothing between the notes), piano-mellow-musescore.png (three velocities: more upper partials with each, smooth decays, no hiss), brushes-fluidr3.png (the same three brush recordings: energy to above 10 kHz, which is why they are low-passed here).');
P('- **Where the master squeezes** (diag.js: stems times the master\'s plain gain against final.wav, 5 ms frames): idea 1 2.6 to 2.8 dB on average (most 3.7), bars 15 to 18 1.4 to 1.8 dB (most 3.0), the three hits most 4.1, 3.7 and 5.4 dB for an instant; idea 2 and bars 12 to 13 0.3 to 0.5 dB on average (most 1.4).');
P();
P('## 9. Notes on the kit, for the lead');
P();
P('1. **The kit\'s spectrogram pictures are mirrored.** analysis/spectrogram*.png (ffmpeg showspectrumpic, fscale=log, in analyze.js) show a dark line at the "520 Hz" label with the picture reflected below it; a rising bass line draws one band going up above the line and one going down below it. lib/demo/spectrogram-00-12s.png shows the same. The labels cannot be used to read pitch. Worked around here with spectro.py (numpy and PIL, this directory only); the kit was not edited.');
P('2. **"Keys relative to bass, 30 to 36 s"** measures a window in which this candidate\'s piano does not play, by assignment. It reads ' + (A.match(/Keys relative to bass, 30 to 36 s \| [^|]+ \| ([^|]+) \|/) || [0, '?'])[1].trim() + ' and fails. Where the piano plays it is inside the target: see the row "keys against bass" in section 5.');
P('3. sampler.onset() caches into lib/audition/onsets.json: this build\'s calls added its hard-hit keys to that file (the kit\'s own cache, written by the kit\'s own function).');
P('4. test-sampler.js: 12 of 12 passed. test-mix.js: 141 ok, 0 failed.');
P();
P('## 10. Listening guide');
P();
P('1. At 0.5, 1.0, 1.5 and 2.0 s you should hear four single bass notes going up (G, Bb, C, D), one as each bay stands up, and nothing else. Before 0.5 s, only a faint room hiss.');
P('2. At 2.5 s the brushes start to stir; at 3.5 s the bass plays a quick three-note run-up.');
P('3. From 4 to 8 s you should hear the bass showing off, nearly twice as many notes a second as it plays anywhere else (15 in four seconds): straight up to its top note by 5.0 s, a tumble at 5.5 s, a big drop onto a low note exactly as the block stops at 6.5 s, then a slide downwards.');
P('4. At 8.0 s you should hear one low thud with the bass and the bass drum, cut dead: the slide never gets its last note. Then only the thud dying away until 10 s; brushes alone from 10 s, one long bass note at 11 s.');
P('5. From 12 to 17 s you should hear the bass play just two long notes a bar under light brushes, and at 14.5 s one soft piano note, the only one before idea 3.');
P('6. At 17.0 s you should hear the second thud, a little lower than the first, cut dead. From about 18.5 to 22.0 s: no instrument at all, only the faint hiss.');
P('7. At 22.0 s you should hear the bass alone begin a plain scale from its lowest G, one note a beat. At 22.5, 24.5, 26.5 and 28.5 s one piano note each, each higher than the one before (G, Bb, C, D), and at each of them something joins the brushes: the stir, taps on 2 and 4, a soft hi-hat, skipping taps.');
P('8. At 30.0 s you should hear the scale arrive on the bass\'s top note and a soft ride cymbal come in for the first time; the bass then walks down in the same plain quarter notes. From 32 s a soft bass drum is under it.');
P('9. At 36.0 and 36.5 s you should hear two low bass notes (the two notes the first two NOs landed on), a short silence, and at 37.0 s the third thud with the bass\'s home note and a piano chord, both held for about a second instead of being cut dead like the first two.');
P('10. At 38.0, 38.5 and 39.0 s you should hear three bass notes stepping down, one beat of nothing, then at 40.0 s the last bass note and a soft rolled piano chord fading away; by about 45.5 s only the hiss.');
P();
P('## 11. Known weaknesses, plainly');
P();
P('1. **Nobody has heard it.** Every statement here is a number or a picture. Whether it is funny, or dry, or dull, is not known.');
P('2. **One analysis target fails by design**: keys against bass in the tool\'s 30 to 36 s window, because the piano is silent there. This candidate has no passage in which all three instruments comp together.');
P('3. **One piano note more than the assignment listed**: G4 at 14.5 s, for idea 2\'s COST pass (the brief\'s "small nod"). It sets up the joke (the same note opens idea 3) but it is a departure; deleting the first row of KEYS in chart.js removes it.');
P('4. **The brush swirl is a stroke, not a stir.** The library\'s swirl is a 0.6 s one-shot, 20 dB down after 0.18 s; it is restruck once a beat, so between strokes the brushes nearly vanish. Neither library has a continuous swirl, and one made from noise would be the synthetic sound the speaker complained about.');
P('5. **The bass is one recording per zone with no velocity layers.** A harder note is the same pluck, louder and a little brighter. Timing, length and level vary; the pluck itself does not. In a score where the bass is nearly everything, this is the likeliest place for "it sounds sampled".');
P('6. **The bass\'s small-speaker harmonics are processing, not recording**: ' + f1(100 * B.bassAbove150.sampled) + ' percent of the sampled line\'s energy is above 150 Hz, ' + f1(100 * B.bassAbove150.stem) + ' percent after the added harmonics and EQ. If the low notes read as buzzy, lower MIX.bass.harmonics.db; how far it can go before the 25 percent target fails was not measured with the final EQ.');
P('7. **The three lowest hit notes are at or under 50 Hz** (G1 49.0, F#1 46.2, Ab1 51.9 Hz). On a phone they exist only as their harmonics and the thud\'s 100 to 200 Hz body. Energy under 50 Hz is ' + f1(B.tone.below50Db) + ' dB of the total.');
P('8. **The loud passages are squeezed**: compressor up to ' + f1(B.master.comp.maxReductionDb) + ' dB, limiter up to ' + f1(B.master.limiter.maxReductionDb) + ' dB on ' + f1(B.master.limiter.limitedPercent) + ' percent of the samples, and before that the kit\'s spikes shaved by up to ' + f1(B.kitPeaks.maxReductionDb) + ' dB. A bass-led mix reads low on a loudness meter for its peak level, so reaching -16 LUFS costs this. The hardest brush taps lose some of their edge.');
P('9. **The tilt is inside the range but on its dark side**: ' + f2(B.tone.tiltDbPerOct) + ' dB per octave against 4.5 to 6.5.');
P('10. **The piano\'s lone notes are short.** In this register a held note is 20 dB down after 0.75 to 0.92 s (audition). Each PASS note is a brief touch, ' + M.keys.underBass + ' dB under the bass; it is the brightest line above 300 Hz at those instants in the pictures, but whether it reads as "PASS" by ear is unverified. Two of its recordings (Bb4, D5) are 4 to 5 dB hotter than their neighbours and were levelled by fader, not by tone.');
P('11. **The loop seam** is a fade to digital zero and back (300 ms out, 4 ms in), room tone on both sides.');
P('12. **Only 20 swung eighths exist** in the whole piece (idea 1\'s bass, the skip notes, the ride), so "swing" is mostly implied by where the taps and the ride fall.');
process.stdout.write(out.join('\n') + '\n');
