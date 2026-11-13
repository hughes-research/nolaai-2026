# The kit: one page for composers

Everything a candidate needs to go from notes to `final.wav`, stems, checks, analysis and a listening copy.
Node 22, no dependencies. Read `../BRIEF.md` first: it is binding. This page is the map; the detail is in
`README-sampler.md` (instruments), `audition/audition.md` (which presets, measured), `README-mix.md` (mix,
meters, checks, how each was verified) and `INTERFACE.md` (the agreed names).

```js
const kit = require('../lib');     // lazy: kit.timeline, kit.midi, kit.sampler, kit.dsp, kit.mix,
                                   //       kit.synth, kit.wav, kit.checks, kit.analyze, kit.mux, kit.const
```

A **Stereo** is `[Float32Array, Float32Array]` at 48 kHz, 2,208,000 samples long unless you say otherwise.
Times are seconds, MIDI notes are numbers (60 = middle C), velocity is 0..1. Bad input throws.

## The shortest path to a finished candidate

`tools/score/<key>/build.js`, top to bottom. Every call below was run as written, with a walking bass only
(12 s in all; `example/build.js` is the sampler half's complete miniature):

```js
'use strict';
const path = require('path');
const kit = require('../lib');
const { dsp, mix, synth, wav } = kit;
const tl = kit.timeline.load();                 // the film's times, read from video/score.js: never type one by hand
const here = (...p) => path.join(__dirname, ...p);
const rand = dsp.rng(1959);                     // every "random" choice comes from here, so a build repeats exactly

// 1. The notes, as played (humanised with rand). Keep them: they go into arrangement.json.
const bassNotes = [{ t: tl.at(1, 1) + 0.011, dur: 0.47, midi: 36, vel: 0.78 } /* ... bar by bar ... */];

// 2. Each instrument, dry, through the sampler (fluidsynth; its own reverb and chorus are off).
const bassDry = kit.sampler.render({ font: 'fluidr3', bank: 0, program: 32, notes: bassNotes });
//    HARD hits (tl.hard.no1, .no2, .slab): start the note early by kit.sampler.onset({ font, bank, program, midi, vel }).

// 3. Tone, per instrument. dsp works in place.
dsp.eq(bassDry, [{ type: 'hp', f: 36 }, { type: 'lp', f: 2400, q: 0.6 }]);
dsp.saturate(bassDry, 0.3);                     // only if the bass stem fails the small-speaker test

// 4. The four stems AS THEY SIT IN THE MIX: level, place on the stage, and each one's own share of the room.
const stems = { bass: dsp.stereo(), keys: dsp.stereo(), drums: dsp.stereo(), fx: dsp.stereo() };
mix.add(stems.bass, bassDry, { db: -6, pan: 0 });                    // keys about pan -0.3, drums about +0.25
mix.add(stems.fx, synth.thud({ hz: 55, size: 1 }), { at: tl.hard.no1, db: -3 });
const ROOM = { decay: 0.8, damp: 0.5 };                              // the small club: 0.6 to 0.9 s
const SEND = { bass: -26, keys: -12, drums: -12, fx: -16 };          // dB: how far under the dry sound its reverb sits
for (const k of Object.keys(stems)) { mix.add(stems[k], mix.room(stems[k], ROOM), { db: SEND[k] }); }
//    (the room is linear, so a room per stem adds up to one shared room, and the stems still sum to the mix)

// 5. Sum and master. The master's gain moves the room tone with everything else, so learn that gain first.
const MASTER = { lufs: -16, ceilingDb: -2 };
const sum = () => { const b = dsp.stereo(); for (const k of Object.keys(stems)) { mix.add(b, stems[k]); } return b; };
const gainDb = mix.master(sum(), MASTER).info.gainDb;               // a first pass, only for its gain
mix.add(stems.fx, synth.roomTone({ db: -68 - gainDb }));            // so the tone sits at -68 dBFS in final.wav
const final = mix.master(sum(), MASTER);                            // a new Stereo; final.info says what it did
for (const k of Object.keys(stems)) { wav.write(here('stems', k + '.wav'), stems[k]); }
dsp.fade(final, 0, 0.005, 0, 1);                                    // the two safety fades
dsp.fade(final, 45.7, 46, 1, 0);
wav.write(here('final.wav'), final);                                // 24-bit, dithered; returns the clipped count

// 6. Prove it. The build exits 0 only if the checks pass.
const result = kit.checks.run({ file: here('final.wav') });         // prints PASS or FAIL per check
kit.analyze.run(here('final.wav'), { outDir: here('analysis'), stemsDir: here('stems') });
if (!result.ok) { process.exit(1); }
```

Then a listening copy (the picture is stream-copied and its MD5 verified; never write into `video/`):

```sh
node tools/score/lib/mux.js tools/score/<key>/final.wav out/video/<key>.mp4 --square out/video/<key>-square.mp4
```

## Sampler half (kit-sampler)

| | |
|---|---|
| `kit.timeline.load()` | `tl.bpm, beat, bar, fps, duration`; `tl.hard` `{ no1: 8, no2: 17, slab: 37 }`; `tl.passes` `[22.5, 24.5, 26.5, 28.5]`; `tl.bays`; `tl.winner, sleeve, positive`; `tl.text`; `tl.events`; `tl.at(bar, beat, { swing })` (bar and beat count from 1); `tl.barOf(t)` |
| `kit.midi.write(file, tracks, { endSeconds })` | a Standard MIDI File, if you want one (the sampler writes its own) |
| `kit.sampler.render({ font, bank, program, notes, cc, gain, seconds })` | a Stereo of recorded samples. `font` is `'fluidr3'`, `'musescore'` or a path; a drum kit is bank 128 and `midi` is then the drum key |
| `kit.sampler.onset({ font, bank, program, midi, vel })` | measured seconds from note-on to the audible start: subtract it to land a HARD hit |

`audition/audition.md` has every preset worth considering with onset, loudness, centroid, decay and velocity
layers. Choose by those numbers, not by name.

## Mix half (kit-mix)

| | |
|---|---|
| `dsp.rng(seed)` | a function returning 0..1, the same sequence every run. `dsp.gauss(r)` is bell-shaped around 0 |
| `dsp.stereo(n)`, `dsp.copy(st)` | a silent Stereo; a copy |
| `dsp.eq(st, [{ type, f, q, db }])` | in place. Types `lp, hp, bp, peak, lowshelf, highshelf`. `dsp.biquad(buf, type, f, q, db)` for one channel; `dsp.butter(st, 'hp', f, 4)` for a steeper edge |
| `dsp.gain(st, db)`, `dsp.fade(st, t0, t1, from, to)` | in place; the fade only touches t0..t1 |
| `dsp.rms(st, t0, t1)`, `dsp.rmsDb(...)`, `dsp.peak(st)`, `dsp.db(x)`, `dsp.lin(db)` | linear unless the name says dB |
| `dsp.saturate(st, amount)` | 0..1: gentle 2nd and 3rd harmonics for a bass that small speakers lose. Set levels after it |
| `mix.add(dest, src, { db, pan, at })` | sums a Stereo or a mono buffer into dest. `pan` -1..1, constant power, centre is unity. `at` in seconds |
| `mix.room(send, { decay, damp, predelay, seed })` | WET ONLY, dark, stereo. Pink noise sent in comes back at the same level, so the dB you add it at is the reverb level. Nothing under 140 Hz: the low end stays dry |
| `mix.master(st, { hp, shelf, comp, lufs, ceilingDb })` | high-pass 30 Hz, shelf -3 dB above 8 kHz, gentle compressor (`comp: false` = off), gain to the loudness, true-peak limiter, re-measured: within 0.05 LU of `lufs`, never over `ceilingDb`. Throws if the mix is too peaky to get there |
| `mix.lufs(st)`, `mix.lra(st)`, `mix.truePeakDb(st)` | BS.1770-4 meters; they read as `ffmpeg -af ebur128=peak=true` does |
| `synth.thud({ hz, size, rattle, seed })` | the NO: a pitched low drum, fast pitch drop, body at 2x and 3x `hz`, low-passed at 3 kHz. About 1.5 s, starts on its first sample |
| `synth.roomTone({ db, seed })` | steady pink noise, -68 dBFS, 80 Hz to 6 kHz, mono-safe. The master's gain moves it with everything else |
| `wav.read(file)`, `wav.write(file, st, { bits })` | PCM 16/24/32 and float in; 24-bit dithered out |
| `checks.run({ file, sync, breath, lufs, ceilingDb, lra })` | the gate: prints PASS or FAIL per check, returns `{ ok, failures, numbers, rows }`. From a shell, at the repository root: `node tools/score/lib/checks.js tools/score/<key>/final.wav` |
| `analyze.run(file, { outDir, stemsDir, ref })` | `numbers.md` (every BRIEF 4.3 target, measured, PASS or FAIL), `numbers.json`, spectrograms, waveform. CLI, from the repository root: `node tools/score/lib/analyze.js tools/score/<key>/final.wav --stems tools/score/<key>/stems` (it writes `analysis/` beside the file; `--ref other.wav` sets a second file beside it). About 16 s; `pictures: false` (`--no-pictures`) makes it 5 s while you iterate |
| `mux.run(wav, outMp4, { square })` | the listening copy; CLI above |

## What trips people up

- **The room tone and the master.** The master adds `final.info.gainDb` to everything, the tone included: in a
  trial a tone at -68 under a quiet mix came out at -49.8 dBFS and failed the held breath. Hence step 5 above
  (run as written: the breath then measures -68.1). The breath (20.3 to 22.0 s) must be below -60 dBFS and must
  not be digital silence: mute the band there, not the tone.
- **Small speakers.** In the same trial the FluidR3 acoustic bass (0-32) walking between C2 and B2, low-passed at
  2.4 kHz, with `dsp.saturate(0.3)`, kept 13 percent of its energy above 150 Hz; the brief wants 25. Plan for it.
- **The tail.** The last 100 ms must be below -60 dBFS: the fade at 45.7 s is a safety net, the chord itself has
  to have died by then.
- **HARD hits** pass when the onset (2 ms of sound 12 dB above the 40 ms before it) is within 10 ms of 8, 17 and
  37 s. Something loud just before the hit hides it: stop the band a moment earlier.
- **Clicks.** A note that starts or ends on a non-zero sample is a click and the check finds it. Fade every
  cut by a millisecond or two.
- **Tilt.** `analyze` fits the spectrum's slope from 200 Hz to 8 kHz (the brief wants it to fall 4.5 to 6.5 dB
  per octave) and judges the spectral density, where pink noise is 3 and brown noise 6. Too dark fails as surely
  as too bright. The band-level reading (3 dB per octave shallower) is printed beside it; see `README-mix.md`.
- Nobody here can hear. Open `analysis/spectrogram*.png` and `analysis/waveform.png`, read `numbers.md`, and
  write down what you saw, never what it "sounds" like.
