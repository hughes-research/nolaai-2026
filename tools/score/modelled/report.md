# Candidate "modelled": the fully synthesized trio

Nobody on this team can hear. Everything below is measured or seen in a picture; nothing here says how it sounds.

(Saved by the lead from the composer's hand-back: subagents return their reports as text.)

## The idea, in five lines

1. A cool-jazz trio in D minor at 120 BPM, eighths swung at 65 %, with every sound computed from a physical model: no samples, no fluidsynth, no libraries, one file of Node.
2. The film's three ideas are three densities: idea 1 is the whole band showing off (15.8 onsets a second), idea 2 is a thinner two-feel (4.4), idea 3 starts with the bass alone (2.8) and gains one layer at each PASS.
3. Each NO is a low pitched drum plus the band hitting one chord with it and stopping dead; the third one, the slab, is the same drum under the home chord, left to ring.
4. The four PASSes are four rising thirds in the piano, each starting higher and landing on one more note (A, B flat, D, E on top), coming home to F over D at the winner.
5. A steady room tone at -68 dBFS runs under everything, so the stops and the held breath are a quiet room and not digital zero.

## Listening guide (what to check by ear, in order)

| Time | What should be there |
|---|---|
| 0.0-0.5 s | Room tone only. The first note is at 0.513 s. |
| 0.5, 1.0, 1.5, 2.0 s | One bass note for each bay: D2, F2, A2, D3. Then the bass walks down and the brushes come in. |
| 4-8 s | Idea 1: everyone. Bass in leaps, piano stabs on the kicker and on both title lines (each higher), ride, hi-hat foot, feathered bass drum, brushes leaning into the hit. |
| 8.000 s | NO 1: thud (55 Hz), A7b9 hit, brush slap. Then only tails and room until 10 s. |
| 10-12 s | The bass alone, in two (the line of text is on screen). |
| 12-17 s | Idea 2: a two-feel bass, lighter brushes, one thin piano stab, and one piano note (A) at 14.5 s as COST passes. |
| 17.000 s | NO 2: thud (49 Hz, a tone lower), Eb7 hit. Tails. |
| 20.3-22.0 s | The held breath: room tone only (-67.8 dBFS). |
| 22 s | Idea 3: the bass alone, stepwise, soft. |
| 22.5, 24.5, 26.5, 28.5 s | The four rising thirds in the piano. The piano joins at the first, brushes at the second, ride at the third, hi-hat foot and bass drum at the fourth. |
| 30 s | The winner: Dm9 rolled with F on top, pedal down; the bass lands on low D. No new piano note while the text is up (30.5-32 s). |
| 32-37 s | Sleeve (a brush sweep and a stab), four rising stabs for the four title lines, a pushed Eb7#11, a soft mallet roll on the ride rising from 35.5 s. |
| 37.000 s | The slab: thud (55 Hz) AND the home chord Dm6/9, bass on D, ride. It rings; it does not stop dead. |
| 38-40 s | Tag: Em7b5, A7b9, a two-note line home. |
| 40-46 s | The last chord, rolled, left to ring; let go at 44.85 s; room tone; 300 ms fade from 45.7 s. |

Things I could not judge: whether the piano's unisons beat too much on the last chord; whether the ride reads as a stick on a cymbal or as a dark wash; whether the room has a metallic colour; whether the brush swirl reads as a brush.

## The instruments (models, not presets) and why

| Instrument | Model | What was measured |
|---|---|---|
| Upright bass | Sum of string modes (up to 64 partials), each with its own level (pluck point, finger softness), its own decay, and two polarisations a hair apart; pitch starts off and settles; vibrato on long notes; finger thump, release tick and left-hand noise drawn fresh for each note; a note is stopped the way a player stops it (same string: cut; other string: overlap); the other open strings ring in sympathy; a body of 26 resonances. | The draft's waveguide gave every partial one decay law and identical attacks. On isolated notes: partials decay at 7 to 40 dB a second, each different; decay wobble up to 5 dB (beating); the first partial reads 20 to 53 cents off pitch in the first 60 ms (the measuring window is about three periods there, so the sign is unreliable) and within 1 cent from 200 ms. A recorded bass measured here moves 20 to 110 cents. Eight repeats of one note: most alike pair 0.918, none identical. |
| Piano | Additive, up to 48 partials; inharmonicity fitted to a recorded grand (B = 3.1e-4 at C4); three strings a note with a fixed detune per key; per-key unevenness of partials; felt hardness follows velocity; two-stage decay; hammer thump and key-bed knock per strike; a soundboard of 27 resonances (different left and right); sympathetic strings with the pedal. | The draft had one spectrum shape at every velocity. Centroid of the first 20 ms at C4: 591, 687, 834 Hz at three velocities; partial 6 is 9.5 cents sharp (recorded grand: 9.3). Eight repeats: 0.953, none identical. |
| Brushes | Swirl: noise through a band-pass that follows the speed of the hand; one gesture a beat, each drawn fresh, with grain. Taps: 9 to 16 bristles landing over 5 to 11 ms on a head with six membrane modes and wires. | Eight repeated taps: 0.826, none identical. Not compared with recorded hits after modelling. |
| Ride | One bank of 282 resonators (the low 56 in beating pairs) that keeps ringing between strokes; every stroke excites the modes with its own weights; a noise-driven wash; soft-mallet strokes for the roll into the slab. | The draft replayed 4 fixed renders of 44 partials. Eight strokes on a silent cymbal: 0.310. |
| Hi-hat foot, bass drum | Nine narrow noise bands and a pedal clunk; a low sine with a falling pitch, a second head mode and felt, drawn per stroke. | Nine bass-drum strokes: 0.930. |
| The NO thud | Pitched drum, fundamental falling from 1.9 times to 55 Hz (49 Hz for NO 2), seven more membrane modes at 87 to 192 Hz, felt, and on the two shutters a rattle low-passed at 3 kHz. | Fundamental 55.7, 48.3, 55.7 Hz; 21, 20, 21 % of the energy at 100-200 Hz; above 3 kHz below -88 dB. |
| Room and room tone | 16-line feedback delay network, Hadamard, three all-passes in, eight early reflections; wet only, high-passed at 150 Hz. Tone: pink noise, 45 Hz to 2.6 kHz, partly shared between the sides. | Decay 0.68 s (500 Hz-2 kHz, Schroeder, causal filters). |

## The chart, bar by bar

| Bar | Time | Chord | Bass | Piano | Drums |
|---|---|---|---|---|---|
| 1 | 0-2 | Dm | rest, D2, F2, A2 (the bays) | | |
| 2 | 2-4 | Dm | D3 (bay 4), C3, Bb2, A2 | | brushes enter: swirl, taps on 2 and 4 |
| 3 | 4-6 | Gm9 | G2 (scooped), D3, Bb2, F3 | stabs at 4.0, 4.33 (higher), 4.83 (higher, rolled), pushed Em7b5 | full: ride, hi-hat foot, bass drum, brushes |
| 4 | 6-8 | Em7b5, A7b9 | E3, D3, C#3, Bb2 | stab at 6.5 (the block stops), pushed A7b9 | swirl leans in, a ghost tap |
| 5 | 8-10 | A7b9 (hit, stop) | A2 short, at 8.000 | A7b9 at 8.000 | slap and bass drum at 8.000, then stop; thud |
| 6 | 10-12 | Gm7, A7 | G2 (two beats), A2, C#3 | | |
| 7 | 12-14 | Dm9 | D3 (two beats), A2, G#2 | one thin stab at 12.5 | sweep at 12.0, light swirl and taps |
| 8 | 14-16 | Gm7 | G2 (two beats), D3, F2 | one note, A4, at 14.5 (COST passes) | light swirl and taps |
| 9 | 16-18 | Em7b5, Eb7 (hit, stop) | E2, Bb2, Eb2 at 17.000 | Em7b5 thin; Eb7 at 17.000 | slap and bass drum at 17.000, stop; thud |
| 10 | 18-20 | (stop) | | | |
| 11 | 20-22 | (breath) | | | room tone only |
| 12 | 22-24 | Dm | D2, E2, F2, F#2 | 22.5: F4 up to A4 | |
| 13 | 24-26 | Gm | G2, A2, Bb2, D3 | 24.5: G4 up to Bb4 (two notes) | brushes join at 24.5 |
| 14 | 26-28 | Em7b5 | E3, D3, Bb2, G#2 | 26.5: Bb4 up to D5 (three notes) | ride joins at 26.5 |
| 15 | 28-30 | A9 | A2, G2, E2, C#2 | 28.5: C#5 up to E5 (four notes) | hi-hat foot and bass drum join at 28.5 |
| 16 | 30-32 | Dm9 | D2, F2, A2, G#2 | Dm9 rolled, F5 on top, pedal, held | full trio |
| 17 | 32-34 | Gm9 | G2 (scooped), Bb2, D3, F3 | stab at 32.0; four rising stabs at 33.0, 33.33, 33.5, 33.83 | sweep at 32.0; full |
| 18 | 34-36 | Em7b5, A7b9 | E3, Bb2, A2, E2 | Em7b5 at 34.0, A7b9 at 35.0, pushed Eb7#11 | mallet roll on the ride from 35.5 |
| 19 | 36-38 | Eb7#11, Dm6/9 | Eb2, A1, D2 at 37.000 (held) | Dm6/9 at 37.000, pedal | ride and bass drum at 37.000; thud |
| 20 | 38-40 | Em7b5, A7b9 | E2 (two beats), A1 (two beats) | Em7b5, A7b9, then Bb4, C#5 | ride softly on the beats, swirl fading |
| 21-23 | 40-46 | Dm6/9 | D2 held, vibrato | seven notes rolled, pedal, let go at 44.85 | one ride touch at 40.0 |

Bass: 19 written bars, 19 different; range A1 to F3 (MIDI 33 to 53). All notes after humanising are in `arrangement.json`.

## The mix chain

- Stage: bass centre; piano left (pan -0.3, spread by pitch); brushes +0.2, hi-hat +0.3, ride +0.4, bass drum +0.08; thuds centre.
- Room sends: bass 0.05 (almost dry), piano 0.28, brushes 0.22, ride 0.26, hi-hat 0.22, bass drum 0.04, thuds 0.20. Each stem carries its own share of the room.
- Stop-time: the drums are choked 110 ms after each NO over 50 ms. The held breath: everything but the room tone is faded out between 20.0 and 20.3 s and stays out until 50 ms before the entrance at 22 s.
- Room tone: placed so that it measures -68 dBFS after the master (measured -67.8).
- Master: high-pass 30 Hz (24 dB an octave); a broad shelf of -3 dB above 1.6 kHz; a shelf of -4 dB above 8 kHz; low-pass 15 kHz; soft-knee compressor (threshold -21 dB, 2:1, knee 8 dB, attack 8 ms, release 250 ms; at most 6.2 dB of reduction); gain to -16 LUFS; true-peak limiter at -2 dBTP (4x oversampled, 3 ms look-ahead; active on 1.78 % of samples); 5 ms fade in, 300 ms fade out.

## The measurements (on `final.wav` as written)

Three independent measurements agree: the build's own self-checks (`analysis/self-checks.md`, 52 of 52 pass), `analyze.py` in numpy (`analysis/numbers.md`), and the shared kit's `lib/checks.js` (14 of 14 pass). ffmpeg ebur128 reads -16.0 LUFS, LRA 8.0 LU, peak -2.0 dBFS. The kit's `analyze.js` output, run by the lead afterwards, is in `analysis-kit/` (23 of 24 targets pass; the fail is the spectrum slope read as spectral density).

| Target (BRIEF 4.3) | Measured |
|---|---|
| -16.0 +/- 0.5 LUFS | -16.01 |
| true peak at or under -2.0 dBTP | -2.01 |
| loudness range 5 to 12 LU | 7.8 (ffmpeg 8.0) |
| tilt 4.5 to 6.5 dB an octave, 200 Hz to 8 kHz | -5.13 (line through third-octave band levels); read as spectral density per Hz the same spectrum is -8.14. See weaknesses. |
| above 8 kHz at least 30 dB down | -42.9 dB |
| 2-5 kHz at least 14 dB down | -20.1 dB |
| keys -3 to -10 dB re bass in the trio (30-36 s) | -5.8 dB |
| drums -8 to -16 dB re bass | -10.7 dB (brushes alone -15.7) |
| mono sum loses less than 1.5 dB, nothing cancels | -0.06 dB; worst band (2-5 kHz) -0.29 dB; below 150 Hz 0.00 dB |
| bass stem at least 25 % above 150 Hz | 51 % |
| nothing vital below 50 Hz | -22.2 dB re total |
| no clicks, no DC, no clipping | 0 clicks (three detectors); DC 2e-6; 0 clipped samples |
| held breath below -60 dBFS, not digital zero | -67.8 dBFS RMS |
| room decay 0.6 to 0.9 s | 0.68 s |
| HARD sync within 10 ms | NO 1 +3.5 ms, NO 2 +2.0 ms, slab +3.5 ms (kit: +2.4, +0.2, +2.2 ms) |
| thuds 45-60 Hz with body at 100-200 Hz | 55.7, 48.3, 55.7 Hz; 20 to 21 % of the energy at 100-200 Hz |
| tail inaudible by 45.9 s | 45.4-45.7 s: -68.0 dBFS (room tone only); 45.9-46.0 s: -86.4 dBFS |
| first 0.25 s | -68.2 dBFS (room tone only) |
| stems sum, through the master, to the final | difference about -139 dBFS RMS (stems read back from disk) |
| deterministic | two builds in a row: identical MD5 for final.wav, the four stems and arrangement.json |

Build time 13 s on this machine.

## What I looked at

- `analysis/spectrogram-whole.png` (final): the four bass notes at the start, the dense block at 4-8 s, both stops, the room tone visible through the breath (a dark band up to about 2.6 kHz, not black), the piano figures at 22.5 s standing alone, the layers thickening at 24.5 and 26.5 s, the slab, and the last chord as long horizontal partials until 44.9 s.
- `analysis/instruments/bass-walk.png` (before the last change to the pluck variation): every note has a different stack of partials and a different attack; low partials carry on under the next note where the strings differ.
- `analysis/instruments/ride-pattern.png`: a dense band from 280 Hz to about 9 kHz, the top decaying first; after the pattern a few low partials ring on as wavy lines (the beating pairs).
- `analysis/instruments/piano.png`: harmonic stacks that are brighter at higher velocity; several partials pinch and regrow within 1 to 1.5 s (beating between the strings).
- The draft's spectrograms (whole, 0-12 s) before starting, for comparison.

Rendered but not opened: the other pictures in `analysis/` (0-12, 20-32, 30-46 s, the waveforms, the four stems) and in `analysis/instruments/` (brushes, hi-hat, bass drum, thud, room, the repeats).

## Known weaknesses, plainly

1. **Nobody has heard it.** It is a set of models tuned by numbers. Of the candidates it is the one most likely to still read as synthetic, the piano and the ride first.
2. **Fewer passes than planned.** The work was interrupted by a worker restart and then cut to a deadline. The mix went through four build-measure-fix passes. The bass and the piano were measured against recorded references and corrected once; the drums were compared with recorded hits only before modelling and afterwards checked only for likeness between hits. The models were looked at less than the brief asks: see the list above.
3. **The ride is dark and low.** Its energy sits from 300 Hz to 4 kHz; a recorded ride measured here has its centroid at 5 to 9 kHz. It may read as a wash and not as a stick on a cymbal.
4. **Piano unison beating may be too strong.** Some partials null within 1 to 1.5 s (wobble up to 7.7 dB on the second partial of C4 at the loudest velocity; the fundamental wobbles 0.1 to 0.4 dB, like the recorded grand). The last chord rings alone for five seconds, so this is where it would show.
5. **The room may have a metallic colour.** In its impulse response the strongest bins of the tail stand 17 to 20 dB over the band mean above 1 kHz, where a diffuse tail gives about 9 to 11. Part of that is the tilt inside each band; I did not separate the two. The decay-time routine in `lab.py ir` is wrong (its zero-phase filter wraps around) and its numbers must be ignored; the 0.68 s above is the build's own causal measurement.
6. **The tilt target is read one way.** I read "falls 4.5 to 6.5 dB an octave" as a line through third-octave band levels, because by that reading the old soundtrack measures 3.7 (too bright, as the speaker said) and by the other it would already be inside the target. Read as spectral density per Hz, this candidate is -8.1 and darker than the target. Above 8 kHz it is at -42.9 dB: possibly dull.
7. **The bass is uneven note to note.** Across A1 to F3 the note level varies by 4.5 dB and the share of energy above 150 Hz varies from 4 % (G#2) to 100 % (measured before the last pluck change). The stem as a whole keeps 51 % above 150 Hz, but single notes may thin out on small speakers.
8. **The compressor works hard at the hits** (up to 6.2 dB of reduction, on the thuds).
9. **"No two ride hits alike" is checked on the excitation, not the waveform,** inside the build (0.450 at most between any two of 68). The waveform check was done once in the lab on eight isolated strokes (0.310).
10. **Not done by the composer:** the mux onto the picture and the AAC true-peak check (done by the lead with the kit's `mux.js`: picture unchanged, decoded audio -16.0 LUFS, true peak -2.0 dBTP); the loop from the ringing end into the sparse start was checked only as numbers (both ends are room tone at -68 dBFS, first and last sample 0).
11. **`score.js` here differs from the draft's copy in its music block** (the picture times are unchanged and checked on every build against `video/score.js`). The rough mux sent earlier is the old arrangement, with a bass note at 0.000 s; this one is different music.

## Files

- `build.js`: rebuilds everything, 13 s, exits 0 only if all 52 self-checks pass. `score.js`: its timeline and music block.
- `final.wav`, `stems/{bass,keys,drums,fx}.wav`, `arrangement.json`.
- `analysis/`: `self-checks.md` (the build), `numbers.md` and `numbers.json` (`analyze.py`, with the old soundtrack side by side), spectrograms and waveforms, `instruments/` (each instrument alone, from `lab.js`). `analysis-kit/`: the shared kit's analysis of the same files.
- `analyze.py`, `lab.js`, `lab.py`: the measuring tools. `draft-original/`: the interrupted draft's `build.js` and `score.js`.
