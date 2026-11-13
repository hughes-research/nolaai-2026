# The sampler half of the kit

Recorded instruments through `fluidsynth`, offline, for people who cannot hear. Files: `timeline.js`, `midi.js`, `sampler.js`, `audition.js` (and its outputs in `audition/`), `test-sampler.js`, `example/build.js`. Proof that it does what this page says: `node tools/score/lib/test-sampler.js` (12 checks, about 40 s, exits 0).

## Use

```js
const kit = require('../lib');                 // or require('./sampler.js') directly
const tl = kit.timeline.load();                // times from video/score.js, never typed in
tl.hard                                        // { no1: 8, no2: 17, slab: 37 }
tl.at(3, 2.5, { swing: 0.64 })                 // bar 3, the swung "and" of beat 2 -> seconds
tl.sync                                        // ready for checks.run({ sync })

const bass = kit.sampler.render({
  font: 'musescore', bank: 0, program: 32,     // 'fluidr3', 'musescore' or a path
  notes: [{ t: 0, dur: 0.47, midi: 36, vel: 0.7 }],   // vel 0..1; a drum kit is bank 128 and midi is the drum key (dur optional)
  cc: [{ t: 0, cc: 64, value: 127 }],          // optional
  gain: 0.5, seconds: 46                       // both optional (these are the defaults)
});                                            // -> [Float32Array, Float32Array], exactly seconds * 48000 samples, float, not clipped

const d = kit.sampler.onsetDetail({ font: 'musescore', bank: 0, program: 32, midi: 36, vel: 0.7 });
// { t10, t50, tPeak, peak }: seconds from the note-on to 10 and 50 percent of the peak. sampler.onset() is t10.
// To land a hit on T, start its note at T - d.t10 (or T - d.t50 for a slow sound). Cached in audition/onsets.json.
```

One `render()` is one preset and one fluidsynth process: about 0.3 s for fluidr3 and 1.1 s for musescore (its samples are Ogg Vorbis: about 3 CPU-seconds) for the film's 46 s with a few notes. Render each instrument once, not each note.

## Measured facts a composer must know

- **t means t.** fluidsynth's file player is 1.1 to 3.1 ms late and jitters; `render()` removes that. A note asked for at t starts at the multiple of 64 samples nearest to t (`sampler.startOf(t)`), so the error is at most 0.67 ms, and a note asked for at exactly 1.000 s starts at sample 48000. Notes may start up to 0.49 s before 0.
- **Deterministic.** Two renders of one request are bit-identical (tested in both libraries).
- **Dry.** Reverb and chorus are off: a staccato woodblock ends in digital silence 264 ms after its note-on (with reverb switched on in a control render it would not). Use `mix.room`.
- **Tails are not cut.** The MIDI file runs past the end of the buffer; a note released near the end renders the same in a short and a long buffer.
- **A missing preset is an Error**, not a quiet substitute. 008-000 Mellow Grand exists only in musescore.
- **Pitch.** A3 on the pianos: fluidr3 220.01 Hz, musescore 219.6 Hz (-0.17 percent). The musescore pianos are stretch tuned: C2 is 17 cents flat.
- **The bass sounds where it is written.** MIDI 40 on 000-032 Acoustic Bass is E2, 82.4 Hz, in both libraries (not an octave lower). The lowest recording, and the lowest usable note, is MIDI 28 (E1, 41.2 Hz); the brief's top note G3 is MIDI 55.
- **Onset delays (note-on to 10 percent / to 50 percent of the peak, velocity 0.6).** Bass 1.6-4.4 / 8-28 ms (slowest on keys 42-46). musescore pianos 0.6-4.5 / 2.2-12 ms. Vibraphone 2.2-3.9 / 2.3-12.6 ms. Brush tap (key 38) 1.6 / 4.4 ms, slap (39) 1.8 / 6.8 ms, swirl (40) 4.1 / 10.6 ms. Ride (51) 1.1 / 1.5 ms. Pedal hat (44) 0.6 / 2.2 ms. Kick 2.3-3.7 / 5.4-10.7 ms. Low drums for the thud 3.4-8.0 / 5.5-12.5 ms. Ask `onsetDetail()` for the exact key and velocity; do not assume.
- **Velocity.** Loudness rises monotonically with vel (tested 0.1 to 1.0). Between 0.3 and 0.9 it spans 19 to 21 dB in fluidr3 and 16 to 18 dB in musescore. Only the musescore pianos have a second recorded layer (from vel 0.85). The bass, the Rhodes, the fluidr3 piano and every drum key are one recording whose velocity changes little or nothing but the level.
- **Level.** At the default gain 0.5 the loudest single fortissimo note found (29 presets, a few keys each) peaks at -8.5 dBFS and an eight-note fortissimo piano chord at -5.1 dBFS. The two libraries are not level-matched (up to 10 dB apart for the same preset): set stem levels by measuring.
- **The installed musescore library is the "Lite" build** (`/usr/share/sounds/sf3/MuseScore_General.sf3` links to `MuseScore_General_Lite.sf3`, 40 MB). Most of its drums and tuned percussion are the fluidr3 recordings in mono.

## Traps (the full list, with numbers, is in `audition/audition.md`, sections 2 and 3)

- Brushes are keys 38 (tap), 39 (slap), 40 (swirl) of kits 128-040, 041, 042, which differ only in the kick. In the Standard and Jazz kits **key 39 is a hand clap** and the Jazz kit has no brushes.
- The swirl is a 0.6 s one-shot, 20 dB down after 0.18 s; holding the key does not lengthen it.
- One recording per drum key: equal hits are identical waveforms. Vary velocity and timing.
- Ride (centroid 7 kHz) and pedal hat (10.7 kHz) are far brighter than the brief's mix target.
- The bass's low notes have 1 percent of their energy above 150 Hz (the brief wants a quarter): add harmonics and measure. Its zones on keys 30-36 and 42-46 are about 3 dB quieter than their neighbours. The fluidr3 bass stops 0.12 s after its note-off; the musescore bass takes 0.40 s.
- The pianos are wide stereo with notes that lean up to 6.5 dB to one side; fluidr3's has notes whose channels cancel when summed (correlation down to -0.54). Narrow before panning.
- One key cannot sound twice at once on a channel: a note struck again while held is released at that instant (`midi.write` does it for you and reports the count as `shortened`). Striking one key twice within 1.4 ms is an Error.
- Hi-hat keys 42, 44, 46 cut each other. A drum note's `dur` hardly matters (0.1 s by default).
- The vibraphone has a built-in tremolo (4.2 Hz, 3.9 dB peak to peak) that is not tied to the tempo.
- A HARD hit needs air in front of it. `checks.js` finds a hit only where 2 ms are 12 dB above the 40 ms before them: with the band at full level up to 1 ms before the frame, `example/build.js` failed "sync: NO 1"; with the band choked 45 ms before the frame it passes (onsets -2.2, -3.8 and -2.9 ms).

## The audition

`audition/audition.md`: one table (394 sounds: bass, pianos, vibraphone, electric pianos, celesta, five drum kits key by key, low drums), then the shortlist job by job, the warnings, and what was seen in the spectrograms. `node tools/score/lib/audition.js` remakes it in about two minutes; `--report` rewrites the page from `audition/data.json`; `--pictures` draws the shortlist's spectrograms into `audition/png/`. `require('./audition.js')` also gives `measure` (loudness, spectrum, pitch, envelope) and `sf` (what a SoundFont says a key and velocity will play).

## Licences of the two libraries

**FluidR3 GM** (`/usr/share/sounds/sf2/FluidR3_GM.sf2`). From `/usr/share/doc/fluid-soundfont-gm/copyright`:

> Copyright © 2000-2002, 2008 Frank Wen
> Copyright © 2008 Toby Smithe
>
> From README: "I hereby release Fluid under the MIT license, as described in COPYING."

**MuseScore General** (`/usr/share/sounds/sf3/MuseScore_General.sf3`). From `/usr/share/doc/musescore-general-soundfont-small/copyright`:

> MuseScore_General SoundFont (MIT, parts PD or CC0):
> MuseScore Drumline (MDL) samples (CC0) by S. Christian Collins & Amir Oosman
> Splendid Grand piano from AKAI S5000 (verified Public Domain)
> Marching Cymbals: open crash samples from Versilian Community Sample Library https://github.com/sgossner/VCSL (CC0) by Sam Gossner
> Adaptation for MuseScore_General Copyright © 2018-2021 S. Christian Collins
>
> Fluid (R3) Mono GM soundfont (MIT): Mono version Copyright © 2014-2017 Michael Cowgill; Temple Blocks instrument Copyright © 2002 Ethan Winer; Drumline Cymbals Copyright © 2016 Michael Schorsch
>
> (Original Stereo version) Fluid (R3) GM SoundFont (MIT): Copyright © 2000-2002, 2008 Frank Wen

Both files then give the same MIT text, which opens:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software [...] The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

These are quotations; the two files are the authority.
