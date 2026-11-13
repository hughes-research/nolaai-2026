# The kit: agreed interface (binding for both kit builders)

Two agents build this kit at the same time. These names and shapes are fixed so the halves fit without talking to each other. Inside them, design freely. Everything is CommonJS for Node 22, no dependencies.

## Shared conventions

- `const.js` (already written, do not change): `SR = 48000`, `SECONDS = 46`, `N = 2208000`, `REPO`, `LAB`.
- **Stereo** = `[Float32Array, Float32Array]` (left, right) at 48 kHz. Unless a length is passed, buffers are `N` samples long.
- Times are seconds (numbers). MIDI notes are numbers (60 = middle C). Velocity in this API is `0..1`.
- Every module is safe to `require` on its own. Nothing runs at require time. CLIs run only under `require.main === module`.
- Deterministic: any randomness comes from a seeded generator passed in or created with `dsp.rng(seed)`.
- Throw `Error` with a plain message on bad input. Never fail silently.

## Sampler half (owner: kit-sampler)

Files: `timeline.js`, `midi.js`, `sampler.js`, `audition.js` (CLI), `test-sampler.js`, `README-sampler.md`, `example/build.js`, outputs under `audition/`.

```js
// timeline.js : the film's times, read from video/score.js (never hand-copied)
const tl = require('./timeline.js').load();
tl.bpm, tl.beat, tl.bar, tl.fps, tl.duration     // 120, 0.5, 2, 30, 46
tl.hard        // { no1: 8, no2: 17, slab: 37 }
tl.passes      // [22.5, 24.5, 26.5, 28.5]   idea 3's four PASS lifts
tl.bays        // [0.5, 1, 1.5, 2]
tl.winner, tl.sleeve, tl.positive                // 30, 32, 38
tl.text        // [[9.5, 12], [18.5, 20], [30.5, 32]]   on-screen lines
tl.events      // the full table, as tools/score/ref/events.json
tl.at(bar, beat, { swing })  // bar and beat count from 1; beat may be fractional; a fractional ".5" is moved to the swung place when swing (0.5..0.75) is given
tl.barOf(t)    // { bar, beat } for a time

// midi.js : a Standard MIDI File writer (format 1, 120 BPM, 960 ticks a beat)
require('./midi.js').write(file, tracks, { endSeconds: 48 });
// tracks: [{ channel: 0..15, bank, program, notes: [{ t, dur, key, vel: 1..127 }], cc: [{ t, cc, value }] }]

// sampler.js : recorded instruments through fluidsynth, offline, reverb and chorus off
const sampler = require('./sampler.js');
sampler.fonts  // { fluidr3: '/usr/share/sounds/sf2/FluidR3_GM.sf2', musescore: '/usr/share/sounds/sf3/MuseScore_General.sf3' }
const stereo = sampler.render({
  font: 'fluidr3',            // or 'musescore', or a path
  bank: 0, program: 32,       // a drum kit is bank 128 (drum: true is implied)
  notes: [{ t, dur, midi, vel }],   // for a drum kit, midi is the drum key
  cc: [{ t, cc, value }],     // optional
  gain: 0.5,                  // fluidsynth master gain; default chosen so one loud note does not clip
  seconds: 46                 // output is exactly seconds * 48000 samples
});                           // -> Stereo. Synchronous. Temp files in os.tmpdir(), removed afterwards.
sampler.onset({ font, bank, program, midi, vel })   // measured delay in seconds from note-on to the audible onset (cached); composers use it to land HARD sync hits
```

`audition.js` renders every preset worth considering (acoustic bass, pianos, vibraphone, electric pianos, the Jazz and Brush kits key by key, low drums for the thuds) and writes `audition/audition.md`: for each, onset delay, loudness at three velocities, spectral centroid, decay time, how many distinct sample layers the velocities reach, notes, and a recommended shortlist.

`example/build.js` is a complete miniature candidate (8 bars: bass, keys, drums through the sampler, then the mix, the checks and the files of the contract in BRIEF.md section 5) that the composers copy from.

## Mix half (owner: kit-mix)

Files: `dsp.js`, `mix.js`, `synth.js`, `wav.js`, `checks.js`, `analyze.js` (module and CLI), `mux.js` (module and CLI), `index.js`, `test-mix.js`, `README-mix.md`, `README.md` (one page for composers: both halves, shortest path to a finished candidate).

```js
// wav.js
const wav = require('./wav.js');
wav.read(file)                       // -> { sr, channels: [Float32Array, ...] }  (PCM 16/24/32 and float WAV)
wav.write(file, stereo, { bits: 24 })  // 24-bit PCM with TPDF dither; returns the count of clipped samples

// dsp.js : small pure functions, in place unless noted
const dsp = require('./dsp.js');
dsp.rng(seed)                        // -> function returning 0..1
dsp.stereo(n = N)                    // -> silent Stereo
dsp.biquad(buf, type, f0, q, gainDb) // one channel; types: lp, hp, bp, peak, lowshelf, highshelf
dsp.eq(stereo, [{ type, f, q, db }]) // both channels
dsp.gain(stereo, db), dsp.fade(stereo, t0, t1, from, to), dsp.rms(stereo, t0, t1), dsp.peak(stereo)
dsp.saturate(stereo, amount)         // gentle harmonics (for small-speaker bass)

// mix.js
const mix = require('./mix.js');
mix.add(dest, src, { db: 0, pan: 0, at: 0 })    // sum src into dest; pan -1..1, constant power
mix.room(send, { decay: 0.8, damp: 0.5, predelay: 0.012, seed: 1 })   // -> Stereo, wet only (the small club)
mix.master(stereo, { hp: 30, shelf: { f: 8000, db: -3 }, comp: { threshold: -18, ratio: 2 }, lufs: -16, ceilingDb: -2 })
                                                // -> Stereo: filtered, gently compressed, set to the loudness, true-peak limited
mix.lufs(stereo), mix.truePeakDb(stereo), mix.lra(stereo)   // BS.1770 measurements, agreeing with ffmpeg ebur128 within 0.3

// synth.js : the few sounds that are not instruments
const synth = require('./synth.js');
synth.thud({ hz: 55, size: 1, rattle: 0.3, seed: 1 })   // -> Stereo, short (about 1.5 s): the NO shutter; place with mix.add(dest, it, { at })
synth.roomTone({ db: -68, seed: 1 })                     // -> Stereo, N long: soft pink noise

// checks.js : the self-checks every build runs last
const result = require('./checks.js').run({
  file: 'final.wav',                 // or stereo: [...]
  sync: [{ t: 8, name: 'NO 1' }, { t: 17, name: 'NO 2' }, { t: 37, name: 'the slab' }],
  breath: [20.3, 22],
  lufs: [-16.5, -15.5], ceilingDb: -2, lra: [5, 12]
});                                  // prints a table; -> { ok, failures: [strings], numbers: {...} }
// It checks: exact length and format, loudness, true peak, LRA, no clipping, no DC, no isolated clicks
// (a steep attack is not a click), each sync hit's onset within 10 ms of its time and on a whole frame,
// the breath below -60 dBFS but not digital zero, the tail inaudible by 45.9 s.

// analyze.js : numbers and pictures, for people who cannot hear
// CLI: node tools/score/lib/analyze.js final.wav --out analysis [--stems stems] [--ref other.wav]
require('./analyze.js').run(file, { outDir, stemsDir, ref })   // -> numbers (also written as analysis/numbers.json and analysis/numbers.md)
// loudness, true peak, LRA, crest factor; band energies relative to total (sub <60, bass 60-250, low-mid 250-500,
// mid 500-2k, presence 2-5k, brilliance 5-8k, air >8k); long-term spectrum slope 200 Hz-8 kHz in dB per octave;
// spectral centroid over time; stereo correlation and mono fold-down loss; small-speaker test (150 Hz high-pass:
// what is left, and how much of the bass stem survives); per-stem RMS in the full-trio window (30-36 s) relative
// to bass; isolated clicks; DC; spectrogram PNGs (whole piece, 0-12 s, 20-32 s, 30-46 s, log frequency) and a
// waveform PNG via ffmpeg; and, with --ref, the same numbers for the reference side by side.

// mux.js : put a WAV on the finished picture without touching the picture
// CLI: node tools/score/lib/mux.js final.wav out.mp4 [--square out-square.mp4]
require('./mux.js').run(wavFile, outMp4, { square })   // stream-copies video/title-sequence.mp4 (and title-square.mp4), AAC 256k,
                                                      // then verifies the video stream MD5 is unchanged and prints the decoded loudness and true peak

// index.js : one require for composers; lazy, so a missing half does not break the other
const kit = require('../lib');   // kit.timeline, kit.midi, kit.sampler, kit.dsp, kit.mix, kit.synth, kit.wav, kit.checks, kit.analyze, kit.mux, kit.const
```

The room, the BS.1770 loudness meter, the 4x true-peak limiter, the biquads and the WAV writer already exist, working, in `tools/score/modelled/build.js` (the interrupted modelled score). Lift them; do not rewrite them from memory.
