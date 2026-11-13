# The mix half of the kit

`wav.js`, `dsp.js`, `mix.js`, `synth.js`, `checks.js`, `analyze.js`, `mux.js`, `index.js`.
`README.md` is the one page for composers; this file says exactly what each part does and how it was verified.

Nobody on this team can hear. Every statement below is a measurement made by the kit's mix test (141 checks;
it ran where the scores were made and is not shipped, because it needs the first soundtrack's file) or says
that it is not one.

## What came from the modelled build, and what changed

The signal processing was lifted from `tools/score/modelled/build.js` as it stood when the kit was started.

| part | lifted | changed, and why |
|---|---|---|
| `dsp.biquad`, `dsp.rng` | as they were (RBJ biquads, mulberry32) | bad input throws |
| `wav.write` | the 24-bit writer and its TPDF dither (seed 13) | bit depth is an option; full scale is 2^23 (what `wav.read` and ffmpeg divide by), so read then write without dither is bit for bit the same |
| `mix.lufs` | the K-weighting coefficients and the two gates | blocks sit on a 100 ms grid as ffmpeg's do; `mix.lra` (EBU Tech 3342) is new |
| `mix.truePeakDb` | the idea (4x polyphase interpolation) | 32 taps a phase under a Kaiser window (beta 9), the filter of libswresample that ffmpeg's `ebur128` uses, instead of 16 taps under a Blackman window |
| the limiter | look-ahead, sliding minimum, exponential release | the modelled one dropped its gain in one step at the start of the look-ahead; this one glides (two running means across the look-ahead) and repeats until the measured peak is under the ceiling |
| the compressor | as it was (stereo linked, 20 ms RMS detector, soft knee) | slower by default: 30 ms attack, 300 ms release |
| `mix.room` | the plan: a Hadamard feedback delay network, allpass diffusion, six early reflections, 140 Hz high-pass and a low-pass on the wet | see "The room" below: the lifted room fails the ringing test |
| `synth.thud` | the drum and the rattle | two body partials at 2x and 3x the pitch, a 24 dB an octave low-pass at 3 kHz over everything, a known peak |

## mix.master(stereo, opts): exactly what it does

Returns a new Stereo (the input is not touched) with `.info`. In this order:

1. **High-pass** at `hp` Hz (default 30), Butterworth, 24 dB an octave. `hp: false` skips it.
2. **Shelf**: `shelf: { f, db }` (default -3 dB above 8 kHz, an RBJ high shelf, Q 0.707). `shelf: false` skips it.
   `lp: Hz` adds a 12 dB an octave low-pass; off by default.
3. **Gain to the loudness target**, so the compressor's threshold means the same whatever level the mix arrives at.
4. **Compressor** `comp: { threshold: -18, ratio: 2, knee: 8, attack: 0.03, release: 0.3 }`: stereo linked, a
   20 ms RMS detector, threshold in dBFS RMS, a soft knee 8 dB wide. On the three test mixes it takes off at most
   2.7 to 5.0 dB. `comp: false` turns it off.
5. **Gain to the loudness target** `lufs` (default -16) again, measured with `mix.lufs`.
6. **True-peak limiter** at `ceilingDb` (default -2), aiming 0.05 dB under it: for every sample the 4x oversampled
   peak is found; the gain needed there is held back across a 5 ms look-ahead (the lowest need ahead), recovers
   with a 150 ms release, and is smoothed by two running means that together span the look-ahead. The gain is
   exactly low enough when a peak arrives and never steps. If the glide let anything through it runs again.
7. **Measure again.** If the limiter moved the loudness, the gain into the limiter is changed by the error and
   steps 6 and 7 repeat (up to 12 times) until the result is within 0.05 LU of the target. The true peak of what
   is returned is measured; if it were over the ceiling the whole result would be turned down.
8. If the result is not within 0.2 LU of the target it **throws** and says why (the mix is too peaky for that
   loudness under that ceiling). It also throws on silence.

`.info`: `{ inputLufs, gainDb, comp: { maxReductionDb, meanReductionDb } | null, limiter: { maxReductionDb,
limitedPercent }, lufs, truePeakDb, lra, passes }`. `gainDb` is all the plain gain (what the room tone moved by).

Measured (kit / ffmpeg after writing 24-bit): synthetic mix -16.04 / -16.04 LUFS, -2.05 / -2.05 dBTP; the first soundtrack
-16.05 / -16.05, -2.05 / -2.05; `modelled/final.wav` -16.01 / -16.02, -2.05 / -2.05; with `{ comp: false, lufs: -14,
ceilingDb: -1 }` -14.02 / -14.03, -1.05 / -1.05. 0.3 to 0.8 s for 46 s. Twice the same result. No click in the output
of a mix the limiter works on for 18 percent of its samples. The default chain measured on white noise: 29 dB down
below 15 Hz, 0.00 dB from 60 to 200 Hz, 2.97 dB down above 14 kHz.

Do the two safety fades (5 ms in, 300 ms out) after the master: they do not move the loudness measurably.

## The meters

`mix.loudness(st)` returns everything in one pass (`lufs`, `lra`, `lraLow`, `lraHigh`, `momentaryMax`,
`shortTermMax`, the two series); `mix.lufs`, `mix.lra`, `mix.truePeakDb` are its parts.
BS.1770-4: K-weighting, 400 ms blocks every 100 ms, absolute gate -70 LUFS, relative gate -10 LU.
EBU Tech 3342: 3 s blocks, gates -70 LUFS and -20 LU, 10th to 95th percentile.

| file | integrated LUFS kit / ffmpeg | range LU kit / ffmpeg | true peak dBTP kit / ffmpeg |
|---|---|---|---|
| the first soundtrack (not in the repository) | -15.812 / -15.817 | 6.80 / 6.81 | -2.416 / -2.418 |
| `modelled/final.wav` (an earlier build) | -16.012 / -16.017 | 7.95 / 7.95 | -2.009 / -2.004 |
| a synthetic 20 s mix (thumps, a 11 kHz tone, four quiet seconds) | -13.543 / -13.548 | 8.57 / 8.58 | +0.448 / +0.449 |

Also: the EBU calibration tone (997 Hz at -23 dBFS in both channels) reads -23.000 LUFS; a 12 kHz tone 45 degrees
off the samples, amplitude 0.5, reads -6.020 dBTP (ffmpeg -6.021) where the samples say -9.03; tones from 997 Hz
to 19 kHz agree with ffmpeg within 0.003 dB.

One difference, found and left: on a sound that starts or stops abruptly at full level the two meters disagree
at the edge (a 12 kHz tone starting on its first sample: kit -5.92, ffmpeg -5.42 dBTP, truth -6.02). ffmpeg's
resampler mirrors the signal at the ends of the stream; the kit treats what is outside as silence. The film's
files fade in and out, so it does not arise there.

## The room: mix.room(send, { decay, damp, predelay, seed })

Wet only (nothing before the predelay, so no dry sound), stereo, dark, the length of the send.

- 32 delay lines of 21 to 79 ms (prime lengths, a little different for every seed) in a Hadamard feedback network.
- In every loop a gain and a first-order high shelf, so each line loses the same dB per second: `decay` at
  700 Hz, and above about 3 kHz sooner, toward `decay * 0.25^damp` at the very top.
- Four short allpasses (23 to 71 samples) diffuse the mid and the side before the network; six early reflections
  (7 to 37 ms) carry about as much energy as the tail's first 40 ms, as in the modelled build.
- The wet is high-passed at 140 Hz (the low end stays dry and centred) and low-passed at 5.2 kHz at the default
  `damp` (10.4 kHz at 0, 2.6 kHz at 1).
- Level: pink noise (100 Hz to 8 kHz) sent in comes back at the same RMS (measured: +0.06 dB), for every setting.
  So `mix.add(dest, mix.room(send), { db: -12 })` puts a sustained sound's reverb 12 dB under it.

**The ringing test.** Feed it an impulse. Take the tail from 80 ms after the predelay to 1.25 times the decay,
undo its decay, window it (Hann), and read its spectrum in bands `16 / decay` Hz wide (20 Hz for 0.8 s: about seven
times the width of one room mode). The smoothed envelope is the mean of those dB values over one octave around
each band. The number is the most by which any band from 200 Hz to 6 kHz stands above its envelope. A metallic
ring is a few modes outlasting their neighbours: an isolated peak. The limit is 6 dB.

| | largest peak | decay measured (asked 0.8 s) |
|---|---|---|
| ideal diffuse decay (exponentially decaying Gaussian noise) | 3.2 dB | - |
| a single 30 ms comb filter (a ring, on purpose) | 20.5 dB | - |
| the modelled build's room as it was at the start, lifted unchanged (measured once in the lab, not by the test) | 7.6 dB: **fails** | 0.746 s (-6.7 %) |
| the kit's room, default | 4.2 dB | 0.789 s (-1.4 %) |
| the kit's room, 27 settings (decay 0.6, 0.8, 0.9; damp 0.2, 0.5, 0.8; seeds 1, 2, 3) | 5.6 dB at worst | within 3.5 % at worst |

Decay is measured by Schroeder's backward integral of the 354 to 1414 Hz band, a line fitted from -5 to -35 dB.
At the default the 2.8 to 5.7 kHz band decays in 0.53 s; the tail's left/right correlation is 0.19; 16 dB of an
impulse's wet is above 8 kHz and 21 dB below 140 Hz. 46 s of room takes about a second.

Not tested, and worse in the lab: `damp` above 0.8 with a decay under 0.7 s read up to 6.1 dB during development
(`damp: 1`, `decay: 0.6`). Stay at `damp` 0.8 or under. What made the difference (lab measurements during
development, mean of 8 seeds, on a finer 12 Hz version of the measure; not part of the test): the shelf instead of a
one-pole low-pass in the loops, short input allpasses instead of the 142 and 379 sample ones (6.7 to 5.3 dB), 32
lines instead of 8.

## synth.thud and synth.roomTone

`synth.thud({ hz: 55, size: 1, rattle: 0.3, body: 1, seed: 1 })`, measured at the defaults: 1.50 s; fundamental
55.0 Hz once settled (80 to 500 ms); the first 40 ms sit at 79 Hz, 1.44 times higher (the pitch drop: it starts
1.9 times higher and falls with a 20 ms time constant); 100 to 200 Hz holds -8.2 dB of its energy; above 3 kHz
-100 dB of its energy, and an octave above the low-pass the spectrum is more than 160 dB under its peak; peak
exactly 0.5 (-6 dBFS) at size 1; starts and ends at zero; no click. `hz: 45` and `hz: 60` land at 45.0 and
60.0 Hz with -11.2 and -7.7 dB between 100 and 200 Hz. Without the rattle left and right are identical; with it the
correlation is still 1.0000. Placed at a time `t` over the room tone, `checks.onset` finds it 1.4 ms before `t`
(the detector's window, not the thud): place it exactly on the HARD time.

`synth.roomTone({ db: -68, seed: 1, seconds })`: -68.000 dBFS RMS; pink (-2.87 dB an octave from 250 Hz to
4 kHz); 20 to 40 Hz is 24 dB under 100 to 200 Hz and 12 to 20 kHz is 46 dB under 2 to 4 kHz (the 80 Hz and 6 kHz
filters); left/right correlation 0.60, mono loses 0.97 dB, correlation under 150 Hz 0.984; every second within
0.4 dB of every other; peak -54 dBFS; no click. It is not faded and the master's gain moves it.

## checks.js

`checks.run({ file | stereo, sync, breath, lufs, ceilingDb, lra, length, fps, clicks, onset, quiet })` prints one
line per check and returns `{ ok, failures, numbers, rows }`. Defaults: the three HARD times from `video/score.js`,
breath 20.3 to 22 s, -16.5 to -15.5 LUFS, -2 dBTP, 5 to 12 LU. `breath: false` and `sync: []` skip those.
From a shell, at the repository root: `node tools/score/lib/checks.js tools/score/<key>/final.wav` (exit 0 only if all pass).

**Clicks** (`checks.clicks(stereo)`). Each sample is compared with the value a cubic through its four neighbours
gives (the fourth difference over 6). A click is a sample where that difference is at least 0.004 and at least 8
times its own 90th percentile over the 2 ms before it and over the 2 ms after it, whichever is larger. An attack
is followed by more of the same; a click is alone. Calibration, on `modelled/final.wav`:

- the file was rebuilt while the kit was being made. As first built, the modelled build's rule
  (any sample-to-sample jump over 0.05) counted 70 "clicks" in it, at 4.5, 26.5, 37.0 s and other note attacks;
  an earlier version of this detector (a median instead of the 90th percentile, a ratio of 12) reported 0 there
  and found an inserted click of 0.05 at 105 of 105 places. That file is gone; the numbers below are the detector
  as it is now, on a later build of the file, where the old rule counts 3766: this detector reports **0**;
- a single-sample click of 0.05 inserted at each of 30 places (on the attacks at 4.5, 8, 17, 26.5, 36.5 and 37 s,
  in the held breath, at 16 random places): **found 30 of 30**, and nothing else reported;
- at 0.02 (smaller than asked): 28 of 30; the two misses are on the loudest attacks (4.500 and 36.504 s);
- the first soundtrack, where the old rule counts 11200 jumps: 0;
- a step of 0.05 under a note is one click; a note cut off at the top of its swing is one click;
- not clicks: a loud 3 kHz tone that starts within 0.25 ms, a burst of noise that starts on one sample.

Limits: it does not see a click under 0.004, nor one buried in a sound as bright as itself. A loud tone that
starts or stops within 0.1 ms IS reported (it is a jump out of silence): fade every edge over at least 0.25 ms,
better 1 ms.

**Sync** (`checks.onset(stereo, t)`). The onset is the first sample, from 60 ms before `t` to 60 ms after, where the
2 ms starting there are more than 12 dB above the 40 ms before it and above -50 dBFS. Pass: within 10 ms, and
`t` on a whole frame at 30 fps. A hit placed on `t` reads -1.4 ms; 20 ms late reads +18.6 ms; 25 ms early reads
-26.4 ms; a hit that swells in over 80 ms reads +6.6 ms (an onset is when it becomes loud). **If the band plays at
full level right up to the hit there is no onset and the check fails** (tested): the hit must stand 12 dB above
the 40 ms before it, so the band has to breathe before a HARD hit, or the hit has to be much louder.

**The rest**: format and length; loudness, true peak, range; no sample at full scale; DC within 0.0001; the held
breath below -60 dBFS and above -80 (digital silence fails); no 100 ms anywhere before the final fade under
-80 dBFS; the last 100 ms below -60 dBFS; the first and last sample under 0.003 (the loop seam). Each of these
was made to fail on purpose in the tests.

## analyze.js

`analyze.run(file, { outDir, stemsDir, ref, pictures, quiet })` writes `numbers.md`, `numbers.json` and five PNGs (six with `ref`).
17 s for a file with four stems and a reference on this machine. The measures, each checked on a signal whose
answer is known:

- **Tilt**: a line fitted through the power spectral density at the 17 third-octave centres from 200 Hz to 8 kHz.
  White noise reads 0.01, pink -3.01, brown -5.97 dB per octave. **The brief does not say whether its "4.5 to
  6.5 dB per octave" means the spectral density or third-octave band levels; the same sound reads 3 dB per octave
  shallower in band levels.** The kit gives its verdict on the density and prints the band-level reading in the
  next row. To judge on band levels instead, change the two `add('Warm tilt', ...)` lines in `targets()`.
- **Bands** relative to the total, **centroid**: a 1 kHz sine is all in the 500 Hz to 2 kHz band, centroid 1000.0 Hz.
- **Mono**: identical channels lose 0.00 dB, unrelated ones 3.03 dB, opposite ones everything; an 80 Hz tone out of
  phase is caught in its band.
- **Small speakers**: a 24 dB an octave high-pass at 150 Hz; a 75 Hz tone drops 24 dB, a 1 kHz tone 0.00 dB.
- **Thuds** on `fx.wav`: the same measure the thud tests use.

Thresholds the kit chose because the brief gives none (each is named in `numbers.md`): no band loses 3 dB or more
in mono; left/right correlation at least 0.90 from 20 to 150 Hz; energy under 50 Hz at least 10 dB below the
total; bass within 0.5 dB of centre, keys louder on the left and drums on the right by under 6 dB; thud body at
least -15 dB, above 3 kHz at most -40 dB, start at least 1.15 times the settled pitch. The room's decay cannot be
measured from a mix and the row says so.

Pictures: spectrograms by `spectro.py` (numpy and Pillow; an 8192-point transform, 5.9 Hz a bin), 1578 x 676, log
frequency; `waveform.png` by ffmpeg, 1610 x 480. Below about 100 Hz a bin is wider than a semitone; read the low
end from the band table.


## mux.js

`mux.run(wav, outMp4, { square })`, or `node tools/score/lib/mux.js final.wav out.mp4 [--square out-square.mp4]` (give each file with its folder, from where you run it).
Stream-copies the picture of `video/title-sequence.mp4` (and `video/title-square.mp4`), encodes the WAV to AAC at
256 kb/s, then checks: the video stream's MD5 is the known one (bdc6eb79... wide, 12c86948... square), h264 plus
AAC stereo at 48 kHz, 46.0 s; and prints the decoded audio's loudness, range and true peak. It refuses to write
into `video/` (tested: nothing there changed). It fails if the decoded true peak is above -1.0 dBTP; the brief
wants it under -1.5, so read the number it prints. Measured on `modelled/final.wav`: both MD5s unchanged, decoded
-16.0 LUFS, -2.0 dBTP, 255 kb/s, about 2 s a film.

## Known weaknesses

- Nothing here has been heard. A room that passes the ringing test can still be unpleasant; a thud with the right
  numbers can still be wrong for the picture.
- The click detector cannot find a click inside a cymbal crash, and reports a tone that starts within 0.1 ms.
- The onset rule fails a hit that is not 12 dB above what precedes it, however well timed.
- The tilt verdict depends on a reading the brief leaves open (above).
- `mix.room` at `damp` above 0.8 with a short decay is at the edge of the ringing limit.
- The spectrograms are coarse below 150 Hz.
- The true-peak meter and ffmpeg disagree by up to half a dB on a sound that starts abruptly at full level.
