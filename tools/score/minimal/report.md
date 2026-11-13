# minimal: the driest reading of the brief

Nobody has heard this file. Everything below is measured or seen in a picture; nothing is a claim about how it sounds.

## 1. The idea in five lines

1. Two instruments carry the film: an upright bass and a pair of brushes. The piano plays seven times in 46 seconds (13 notes).
2. The bass line is the melody and tells the joke. Idea 1 over-plays (a run, the top of the instrument in three beats, a drop of a tenth and an octave, a chromatic slide). Idea 2 barely tries (half notes: root, fifth, done). Idea 3 plays a scale in plain quarter notes, and wins.
3. Each gate owns a note: G, Bb, C, D, the four bass notes the bays stand up on. The piano only ever says PASS: one gate note when a gate lifts. So idea 2 gets one note (G4 at 14.5 s) and idea 3 gets all four, climbing.
4. The three hard hits enclose the home note, as a jazz line does before it lands: NO 1 falls a half step too high (Ab1), NO 2 a half step too low (F#1), the slab lands on G1 with the only held chord of the film. Each thud is tuned to its bass note (51.9, 46.2, 49.0 Hz).
5. Silence is the third instrument: two stop-times, five seconds of nothing before idea 3, a breath while the slab falls, a beat of nothing before the last note.

## 2. Key: G minor, and why

- The brief limits the bass to E1..G3. G minor is the only key in which that range holds the tonic three times (G1, G2, G3), so the winning line can be the plainest thing there is, a two-octave scale from the bottom tonic to the top one, and G3 is exactly the highest note allowed.
- G1 is 49.0 Hz, inside the 45 to 60 Hz the brief asks of a thud. The last thud is tuned to the home root, and the two "wrong" hits to the notes they land on (Ab1 51.9 Hz, F#1 46.2 Hz), both still inside that band.
- Tonic and dominant are the open G and D strings: idea 2's two-feel can be as lazy as it should be.
- The gate notes on the piano (G4 to D5, 392 to 587 Hz) sit far below the 2 to 5 kHz band the mix has to keep down.
- The first soundtrack was in C minor (video/score.js). This is not that piece.

## 3. The instruments, and why (from lib/audition)

| Part | Library, preset | Why, by the audition's numbers |
|---|---|---|
| Bass | MuseScore General 000-032 Acoustic Bass (keys as written: MIDI 31 sounds 49.0 Hz) | The same seven recordings as FluidR3, but a note takes 0.40 s to die after its note-off (FluidR3: 0.12 s, each walking note cut off), velocity changes the tone (centroid at C4 425, 522, 612 Hz at 0.3, 0.6, 0.9; FluidR3: identical at every velocity), lower floor between partials (-73 to -83 dB against -68 to -78). Not the pizzicato presets: a string section, 11 to 21 cents flat in the low octave. |
| Keys | MuseScore General 008-000 Mellow Grand Piano | Chosen over the vibraphone on one measurement: how much of an exposed note is a recording. The piano plays its recording for the whole audible note (its loops start 3.0 to 6.8 s into a note); the vibraphone is one frozen cycle from 0.12 to 0.42 s on (audition, warning 9). This listener complained of "beeps instead of instruments", and asked for piano. Over the other pianos: darkest (centroid at C4 570 Hz; Grand 701; FluidR3 1491), 2-5 kHz 27 to 40 dB under the note, and its notes fold to mono best (Bb3 loses 0.6 dB; Grand 4.0 dB). What the vibraphone would have given: a longer ring (20 dB down after 1.1 to 1.3 s against 0.75 to 0.92 s for these notes) and a last chord gone by itself (60 dB down in 3.4 to 4.4 s). |
| Brushes | MuseScore General 128-040 Brush: key 40 swirl, keys 38 and 39 two different taps (alternated) | The only kits with brushes are 128-040 to 042. MuseScore has the three recordings in mono (correlation 1.00), so nothing cancels and the kit can be placed by the mix; FluidR3 is the same in stereo. |
| Hi-hat, ride, bass drum | Same kit: key 44 (foot), key 51 (Ride1), key 36 (Std Kick 7) | Hat and ride are the brightest things in the library (centroid 10.7 and 7.0 kHz), so both are low-passed and low; the ride does not play before the winner (30 s). The bass drum is the darkest kick on offer (80 percent of it under 60 Hz): feathered from the title on, and under each thud. |
| The NOs, room tone | kit synth.thud and synth.roomTone | Thuds at 51.9, 46.2 and 49.0 Hz, sizes 1.0, 0.85, 1.4, rattle 0.3, 0.25, 0.12 (least on the good NO). |

## 4. The chart

120 BPM, 4/4, 23 bars of 2 s, eighths swung at 0.64. Sounding pitches (C4 = middle C). Beats in brackets: "2&" is the swung eighth after beat 2, "+1/3" a triplet. Written before any code; this table is printed from chart.js, which the build plays.

| Bar | Time s | Picture | Chord | Bass | Piano | Brushes and kit | What it is doing |
|---:|---|---|---|---|---|---|---|
| 1 | 0-2 | floor line; bays 1 to 3 stand up | Gm | [2] G2 [3] Bb2 [4] C3 | - | - | one note a bay: the four gates are G, Bb, C, D |
| 2 | 2-4 | bay 4; kicker text | D7 | [1] D3 rings [4] D2 [4+1/3] E2 [4+2/3] F#2 | - | swirl 2 3 4; tap 4 | the run-up: idea 1 cannot wait |
| 3 | 4-6 | idea 1: "A chatbot / for everything" | Gm6 | [1] G2 [1&] Bb2 [2] D3 [2&] E3 [3] G3 [4] F3 [4+1/3] E3 [4+2/3] Eb3 | - | swirl 1 2 3 4; tap 2 4; skip 2& 4&; hat 2 4; kick 1 2 3 4 | the top of the instrument in three beats |
| 4 | 6-8 | block enters, dead stop at 6.5; shutter falls | D7b9 | [1] D3 [1&] F#3 [2] D2 [3] C2 [3&] B1 [4] Bb1 [4&] A1 | - | swirl 1 2 3 4; tap 2 4; skip 2& 4&; hat 2 4; kick 1 2 3 4 | the drop lands with the block; then the slide home to G... |
| 5 | 8-10 | NO 1 at 8.000 | Ab7 | [1] **Ab1** choked | - | kick **1** | ...cut on Ab, a half step too high. Band out |
| 6 | 10-12 | text on screen | D7 | [3] F#2 | - | swirl 1 2 3 4; tap 4 | F#, a half step under home, as Ab was over it; it resolves into bar 7 |
| 7 | 12-14 | idea 2: "Meeting notes for managers" | Gm | [1] G2 [3] D2 [4&] D2 (ghost) | - | swirl 1 2 3 4; tap 2 4 | root, fifth, done |
| 8 | 14-16 | COST passes at 14.5 | Cm | [1] C2 [3] Eb2 | [2] G4 | swirl 1 2 3 4; tap 2 4 | the piano plays the COST gate's note, once, and nothing more |
| 9 | 16-18 | shutter falls; NO 2 at 17.000 | D7 | [1] D2 [3] **F#1** choked | - | swirl 1 2; tap 2; kick **3** | the dominant's third, left hanging: a half step too low. Band out |
| 10 | 18-20 | text on screen | N.C. | - | - | - | tails only |
| 11 | 20-22 | the held breath | N.C. | - | - | - | room tone only |
| 12 | 22-24 | idea 3; PASS 1 at 22.5 | Gm | [1] G1 [2] A1 [3] Bb1 [4] C2 | [2] G4 | swirl 2 3 4 | the bass alone; G1 is the note F#1 was waiting for. Layer 1 at the PASS: the swirl |
| 13 | 24-26 | PASS 2 at 24.5 | Bb/D | [1] D2 [2] Eb2 [3] F2 [4] F#2 | [2] Bb4 | swirl 1 2 3 4; tap 2 4 | one gate further than idea 2 got. Layer 2: taps on 2 and 4 |
| 14 | 26-28 | PASS 3 at 26.5 | Cm7/G | [1] G2 [2] A2 [3] Bb2 [4] C3 | [2] C5 | swirl 1 2 3 4; tap 2 4; hat 2 4 | layer 3: the hi-hat, with the foot |
| 15 | 28-30 | PASS 4 at 28.5 | Dm7 | [1] D3 [2] E3 [3] F3 [4] F#3 | [2] D5 | swirl 1 2 3 4; tap 2 4; hat 2 4; skip 2& 4& | layer 4: the swung skip notes; the F# on beat 4 leads into the top G |
| 16 | 30-32 | the winner at 30; text from 30.5 | Gm Ebmaj7 | [1] G3 [2] F3 [3] Eb3 [4] D3 | - | swirl 1 2 3 4; tap 2 4; hat 2 4; ride 1 2 2& 3 4 4& | the top note, reached the slow way; the ride enters |
| 17 | 32-34 | sleeve; title lines on 3, 3&, 4, 4& | Cm7 Am7b5 | [1] C3 [2] Bb2 [3] A2 [4] G2 | - | swirl 1 2 3 4; tap 2 3 4; skip 3& 4&; hat 2 4; ride 1 2 2& 3 4 4&; kick 1 2 3 4 | strong beats fall in thirds: G Eb C A F D |
| 18 | 34-36 | subtitle, name | F7 D7 | [1] F2 [2] Eb2 [3] D2 [4] A1 | - | swirl 1 2 3 4; tap 2 4; hat 2 4; ride 1 2 2& 3 4 4&; kick 1 2 3 4 | a shade stronger each bar |
| 19 | 36-38 | slab falls from 36.625; THE SLAB at 37.000 | Ab7 Gm9 | [1] Ab1 [2] F#1 [3] **G1** rings | [3] **Bb3 D4 F4 A4** | swirl 1; tap 2; hat 2; ride 1; kick 1 **3** | Ab, F#, a breath, G: both failed hits, in order, as the approach to home |
| 20 | 38-40 | back to positive; the card holds | Gm | [1] D3 [2] C3 [3] Bb2 | - | swirl 1 2 3 4; tap 2 4 | the gate notes backwards; a beat of nothing before the last one |
| 21 | 40-42 | card | Gm6/9 | [1] G2 rings | [1] Bb3 E4 A4 D5 rolled | swirl 1 2 | the slab chord with F fallen to E, the fourth gate's note on top; left to ring |
| 22 | 42-44 | card | Gm6/9 | - | - | - | ringing |
| 23 | 44-46 | card; loop point | Gm6/9 | - | - | - | gone by 45.9 s |

**Where the band is out.** 0 to 0.5 s (room tone; the first sound is the bass at 0.5 s). 8.4 to 10 s after NO 1 (tails only), brushes alone until 11 s. 17.4 to 22 s after NO 2 and through the held breath. About 36.8 to 37.0 s, a breath while the slab falls. 39.5 to 40 s, a beat of nothing before the last note. The piano is out everywhere except 14.5, 22.5, 24.5, 26.5, 28.5, 37.0 and 40.0 s. The ride is out until 30.0 s.

**How the four PASSes climb.** Each PASS is beat 2 of its bar. Three things rise together: the bass has climbed four more scale steps; the piano plays the next gate note (G4, Bb4, C5, D5: bar 1's bass motif two octaves up, and the roots of bars 12 to 15: Gm, Bb, Cm7, Dm7); and one more layer of the kit starts on that beat (swirl, taps on 2 and 4, hi-hat with the foot, swung skip notes). At the winner the bass reaches G3 and the ride enters.

**The three HARD hits.** NO 1 (8.000 s): the slide C2 B1 Bb1 A1 is heading for G and is cut on Ab1, a half step too high; choked; thud 51.9 Hz; bass drum. NO 2 (17.000 s): the two-feel lands on F#1, the dominant's third, a half step too low; choked; thud 46.2 Hz. The slab (37.000 s): bar 19 plays Ab1, F#1, a breath, G1: both failures, in order, become the approach to home; G1 rings, thud 49.0 Hz, piano Gm9 (Bb3 D4 F4 A4) held through the two beats of negative. None of the three is humanised; every note is started early by its sample's measured onset.

**The tag and the last chord.** Bar 20 answers bar 1 backwards (D3 C3 Bb2, a rest, then G2). The last chord at 40.0 s is the slab chord with one voice moved (F4 down to E4: Gm9 becomes Gm6/9) and the fourth gate's note, D5, on top; rolled, released at 45.0 s. The film loops from that ring into half a second of room tone and the first G.

## 5. The chart checked as data (check-chart.js)

From arrangement.json (the notes as played) and the WAV files, not from the build's own variables.

| Check | Measured | Target | Result |
|---|---|---|---|
| bass notes on beats 1 and 3 are chord tones | 33 of 33 | all | pass |
| last note of a bar reaches the next bar by a half or whole step | 15 of 18 (3 stated exceptions)<br>bar 5 to 6 (Ab1 to F#2, 10 semitones): Ab1 to F#2 across two seconds of stop-time: the two notes are the upper and lower neighbours of G2, which bar 7 then plays (an enclosure, with the F# an octave up) ; bar 19 to 20 (G1 to D3, 19 semitones): G1 to D3: the piece has ended on G1; the tag is a new phrase after a full stop ; bar 20 to 21 (Bb2 to G2, 3 semitones): Bb2 to G2, a minor third after a beat of rest: the tag is the gate motif of bars 1 and 2 (G Bb C D) backwards, and that third is the motif's own | all, or a stated reason | pass |
| no two bars hold the same bass pitches | 19 bars, all different | none the same | pass |
| bass range as written (sounding) | F#1 to G3 | E1 to G3 | pass |
| bays (bass), PASSes (keys) and the tag (bass, backwards) use the same four notes | bays G Bb C D; keys G4 Bb4 C5 D5; tag D C Bb G | G Bb C D; G Bb C D; D C Bb G | pass |
| the four PASS notes rise (as written) | G4 < Bb4 < C5 < D5 | each higher than the last | pass |
| the three hard hits: a half step over home, a half step under, home | Ab1, F#1, G1 | Ab1, F#1, G1 | pass |
| as played: bass on beats 1 and 3 is a chord tone | 33 of 33 | all | pass |
| as played: bass range (sounding; MIDI key minus 0) | F#1 to G3 | E1 to G3 | pass |
| swing ratio of the off-beat eighths, each against its own player's beat | mean 0.641, 0.636 to 0.653 over 20 eighths<br>bass 0.644 (6), brushes 0.639 (8), ride 0.641 (6) | 0.62 to 0.66 | pass |
| idea 1 is the busiest passage before the title | 10.75 events a second; next 9.00 | the most before 32 s | pass |
| idea 2 is thinner than idea 1 | 4.40 against 10.75 (bass alone: 1.20 against 3.75) | under half of idea 1 | pass |
| idea 3 grows at every PASS | 4.00 < 5.50 < 6.50 < 7.50 | each window busier than the last | pass |
| idea 3 and the title are plain quarters: one bass note a beat from 22 s to the slab | 30 notes, steady: true | 30 notes, one a beat | pass |
| as played: the top note at each PASS rises | G4 at 22.504, Bb4 at 24.503, C5 at 26.505, D5 at 28.503 | four notes, each higher | pass |
| no drum voice plays the same velocity twice running | 0 repeats in 142 pairs | 0 | pass |
| the bass sits behind the beat (on-beat notes, the hits apart) | 4.0 to 10.7 ms late, mean 6.8 | 4 to 12 ms | pass |
| the ride sits on top of the beat (on-beat strokes) | 1.3 to 4.0 ms early | 0 to 6 ms early | pass |
| after NO 1: instrument stems, 9 to 9.9 s, against 4 to 8 s | -120.3 dBFS against -27.4 dBFS: 92.9 dB down | at least 30 dB down | pass |
| after NO 2: instrument stems, 18.5 to 19.9 s, against 12 to 17 s | -135.0 dBFS against -35.7 dBFS: 99.4 dB down | at least 30 dB down | pass |
| the held breath, 20.3 to 22.0 s, in final.wav | -68.0 dBFS RMS; 0.00 percent of samples are zero | under -60 dBFS, and not digital silence | pass |
| instrument stems in the held breath | -134.9 dBFS | under -75 dBFS (room tone is all there is) | pass |
| before 0.25 s: final.wav, and the instrument stems | -68.3 dBFS RMS; instrument peak -128.9 dBFS | room tone only (under -60 dBFS; instruments under -90) | pass |
| the tail: final.wav, 45.9 to 46.0 s (and 45.5 to 45.9 s) | -86.8 dBFS (-69.2 dBFS) | under -60 dBFS | pass |
| hard hit at 8.000 s: onset in final.wav | 8.0025 s (+2.5 ms); rise 21.0 dB in 10 ms | within 10 ms | pass |
| hard hit at 17.000 s: onset in final.wav | 17.0005 s (+0.5 ms); rise 46.2 dB in 10 ms | within 10 ms | pass |
| hard hit at 37.000 s: onset in final.wav | 37.0010 s (+1.0 ms); rise 34.3 dB in 10 ms | within 10 ms | pass |
| thud at 8 s: strongest low partial of the fx stem | 51.9 Hz | 51.9 Hz (the bass note), within 2 Hz, and 45 to 60 Hz | pass |
| thud at 17 s: strongest low partial of the fx stem | 46.3 Hz | 46.2 Hz (the bass note), within 2 Hz, and 45 to 60 Hz | pass |
| thud at 37 s: strongest low partial of the fx stem | 49.0 Hz | 49.0 Hz (the bass note), within 2 Hz, and 45 to 60 Hz | pass |
| the bass stem sounds at the written pitch (fundamental by autocorrelation) | G1 at 22 s: 48.9 Hz; G2 at 26 s: 97.1 Hz; G3 at 30 s: 195.7 Hz; G1 at 37 s: 48.9 Hz; F#1 at 17 s: 46.1 Hz; Ab1 at 8 s: 51.8 Hz | 49.0, 98.0, 196.0, 49.0, 46.2, 51.9 Hz, within 60 cents | pass |
| lowest and highest of the probed bass notes, as they sound | 46.1 to 195.7 Hz | inside E1 (41.2 Hz) to G3 (196.0 Hz) | pass |
| the PASS notes rise, as they sound (strongest partial of the keys stem) | 392 Hz < 466 Hz < 523 Hz < 587 Hz | 392, 466, 523, 587 Hz | pass |
| keys against bass (stem RMS) while the keys play | the four PASSes (22.5 to 30 s): -7.1 dB; the slab chord (37 to 38 s): -4.3 dB; the last chord (40 to 43 s): -4.7 dB | about -3 to -10 dB | pass |
| drums against bass (stem RMS) | idea 1 (4 to 8 s): -11.7 dB; idea 2 (12 to 17 s): -9.1 dB; idea 3 (24 to 30 s): -13.0 dB; winner and title (30 to 36.5 s): -10.3 dB | about -8 to -16 dB in the full passage | pass |
| idea 3: the drums stem grows at every PASS and again at the winner (RMS) | -144.5 < -49.5 < -47.2 < -46.2 < -43.8 < -41.8 dBFS | silent before PASS 1, then louder each time | pass |

Events a second, section by section (bass notes + piano notes + drum strokes):

| Section | Bass | Piano | Drums | A second |
|---|---:|---:|---:|---:|
| dock (0 to 4 s) | 7 | 0 | 4 | 2.75 |
| idea 1 (4 to 8 s) | 15 | 0 | 28 | 10.75 |
| after NO 1 (8.4 to 10 s) | 0 | 0 | 0 | 0.00 |
| restart (10 to 12 s) | 1 | 0 | 5 | 3.00 |
| idea 2 (12 to 17 s) | 6 | 1 | 15 | 4.40 |
| after NO 2 (17.4 to 22 s) | 0 | 0 | 0 | 0.00 |
| idea 3, after PASS 1 (22 to 24 s) | 4 | 1 | 3 | 4.00 |
| idea 3, after PASS 2 (24 to 26 s) | 4 | 1 | 6 | 5.50 |
| idea 3, after PASS 3 (26 to 28 s) | 4 | 1 | 8 | 6.50 |
| idea 3, after PASS 4 (28 to 30 s) | 4 | 1 | 10 | 7.50 |
| the winner (30 to 32 s) | 4 | 0 | 14 | 9.00 |
| the title (32 to 37 s) | 10 | 0 | 44 | 10.80 |
| the tag (38 to 46 s) | 4 | 4 | 8 | 2.00 |

## 6. The mix chain

- **Performance** (seed 20261113): bass 4 to 12 ms behind, drifting like a player; ride 0 to 6 ms ahead; a lone piano note 2 to 9 ms late; the last chord rolled at about 25 ms a note; swing 0.64 plus or minus 0.006; no drum voice at the same velocity twice running; taps alternate two recordings; walking quarters joined with a 24 to 44 ms gap.
- **Bass**: one sampler render, mono. Zone evening by velocity (the seven recordings differ by up to 6.3 dB in this mix; left alone, the scale stepped 3.6 dB louder between Bb2 and C3 in bar 14; that step is now 1.1 dB, and the largest step between neighbours from bar 12 to bar 18 is 2.6 dB, at a note the chart leans on: K-weighted level of each note in the stem). Harmonics for small speakers: the part under 120 Hz shaped by a soft curve at a depth that follows each note, and only what that adds between 150 Hz and 1000 Hz mixed back (0 dB). EQ: lowshelf 90 Hz -6.5 dB, peak 800 Hz +3 dB, peak 1600 Hz +4 dB, lp 5000 Hz. Centre. Room send -24 dB. Energy above 150 Hz: 16.7 percent as sampled, 43.2 percent in the stem.
- **Piano**: one render; narrowed to 0.5 of its width; EQ: hp 140 Hz, peak 3000 Hz -3 dB, lp 6000 Hz; pan -0.3; room send -11 dB. Level by fader, measured: the four PASS notes 8 dB under the bass (RMS, 22.5 to 30 s), each evened to the first plus 0.7 dB a step (G4 -0.4, G4 +0.0, Bb4 -4.9, C5 +0.5, D5 -4.1 dB: this piano's recordings are that uneven); slab chord 4.5 dB and last chord 5 dB under the bass in their own windows.
- **Kit**: one preset, three renders (brushes; hat and ride; bass drum) so each has its own tone control. Brushes: hp 170 Hz, peak 3600 Hz -2 dB, lp 9000 Hz, pan 0.24, send -9 dB. Cymbals: hp 450 Hz, lp 7000 Hz, lp 9000 Hz, -2.5 dB, pan 0.34. Bass drum: hp 38 Hz, lp 2200 Hz, -9 dB, pan 0.08. More stir than tap (swirl velocities +0.12, taps -0.07). Kit level 10.5 dB under the bass (RMS, 30 to 36.5 s). Stroke peaks shaved on the kit alone to the level of the bass's own peaks (up to 5.3 dB, 4.9 percent of the film, RMS change -0.13 dB), so the master does not duck the band on every tap.
- **Thuds**: NO 1 51.9 Hz at -14 dB; NO 2 46.2 Hz at -13 dB; the slab 49.0 Hz at -15 dB; room send -18 dB.
- **Room**: mix.room decay 0.75 s, damp 0.6, predelay 14 ms; one room, computed per stem so the stems still sum to the mix.
- **Room tone**: placed at -83.3 dBFS before the master so that it sits at -68 dBFS in final.wav (the master adds 15.3 dB).
- **Ends**: every stem fades in over 4 ms and out from 45.7 to 46.0 s before the master, so stems through the master equal final.wav.
- **Master** (kit defaults): high-pass 30 Hz, shelf -3 dB above 8000 Hz, compressor 2:1 at -18 dBFS (up to 4.3 dB, mean 0.91), limiter up to 2.3 dB on 2.7 percent of the samples. Out: -16.03 LUFS, -2.05 dBTP, LRA 9.7 LU.

## 7. Measurements

### The kit's self-checks (build.js exits 0 only if these and section 5 pass)

| Check | Measured | Target | Result |
|---|---|---|---|
| format | 48 kHz, 2 ch, 24-bit PCM, 2208000 samples | 48 kHz, 2 ch, 24-bit PCM, 2208000 samples | pass |
| loudness | -16.03 LUFS | -16.5 to -15.5 | pass |
| true peak | -2.05 dBTP | at most -2 | pass |
| loudness range | 9.7 LU | 5 to 12 | pass |
| clipping | 0 samples at full scale (sample peak -2.05 dBFS) | 0 | pass |
| DC | L -9.2e-6, R -9.4e-6 | within 1e-4 | pass |
| clicks | 0 isolated; steepest jump 0.309 at 35.501 s is an attack | 0 | pass |
| sync: NO 1 @ 8 s | onset 8.0007 s, +0.7 ms (frame 240) | within 10 ms, on a frame | pass |
| sync: NO 2 @ 17 s | onset 16.9973 s, -2.8 ms (frame 510) | within 10 ms, on a frame | pass |
| sync: the slab @ 37 s | onset 36.9976 s, -2.4 ms (frame 1110) | within 10 ms, on a frame | pass |
| held breath 20.3-22 s | -68.0 dBFS RMS | below -60, above -80 (not digital silence) | pass |
| room tone under everything | quietest 100 ms: -68.7 dBFS at 18.50 s | above -80 | pass |
| tail 45.9 s to the end | -86.8 dBFS RMS | below -60 | pass |
| loop seam | first and last samples within 1.2e-7 | under 0.003 | pass |

### The brief's targets, by the kit's analysis tool (analysis/numbers.md)

|  | target | wanted | measured |  | reference |
|---|---|---|---|---|---|
| Loudness | Integrated loudness | -16.0 +/- 0.5 LUFS | -16.03 LUFS | PASS | -15.81 LUFS |
| Loudness | True peak | at most -2.0 dBTP | -2.05 dBTP | PASS | -2.42 dBTP |
| Loudness | Loudness range | 5 to 12 LU | 9.7 LU | PASS | 6.8 LU |
| Warm tilt | Spectrum, 200 Hz to 8 kHz (spectral density) | falls 4.5 to 6.5 dB per octave | falls 5.96 dB per octave | PASS | falls 6.67 dB per octave |
| Warm tilt | the same line through third-octave band levels | information: 3 dB per octave shallower by construction | falls 2.95 dB per octave | - |  |
| Warm tilt | Energy above 8 kHz | at least 30 dB below the total | -34.8 dB | PASS | -35.2 dB |
| Warm tilt | The 2 to 5 kHz band | at least 14 dB below the total | -17.4 dB | PASS | -20.0 dB |
| Balance | Keys relative to bass, 30 to 36 s | -10 to -3 dB | -54.0 dB | **FAIL** |  |
| Balance | Drums relative to bass, 30 to 36 s | -16 to -8 dB | -10.1 dB | PASS |  |
| Translation | Mono: the L+R sum loses | less than 1.5 dB | 0.04 dB | PASS | 0.03 dB |
| Translation | Mono: nothing cancels (the band that loses most) | under 3 dB in every band | 0.42 dB (mid, 500 Hz to 2 kHz) | PASS | 0.48 dB (air, over 8 kHz) |
| Translation | Low end centred (L/R correlation, 20 to 150 Hz) | at least 0.90 | 0.998 | PASS | 0.999 |
| Translation | Small speakers: the bass stem's energy above 150 Hz | at least 25 percent | 43 percent | PASS |  |
| Translation | Nothing vital below 50 Hz (the energy there) | at least 10 dB below the total | -13.8 dB | PASS | -8.1 dB |
| Clean | Clicks (isolated discontinuities) | 0 | 0 | PASS | 0 |
| Clean | DC offset | within 0.0001 | L -9.2e-6, R -9.4e-6 | PASS | L 1.6e-5, R 1.1e-5 |
| Clean | Clipping | 0 samples | 0 samples (sample peak -2.05 dBFS) | PASS | 0 samples (sample peak -2.42 dBFS) |
| Room tone | The held breath, 20.3 to 22.0 s | below -60 dBFS RMS | -68.0 dBFS | PASS | -84.7 dBFS |
| Room tone | Never digital silence (the quietest 100 ms) | above -80 dBFS RMS | -68.7 dBFS at 18.5 s | PASS | -97.5 dBFS at 20.9 s |
| Room and stage | Room: 0.6 to 0.9 s decay, dark | set in the build | not measurable from a mix: see mix.room({ decay }) in build.js | - |  |
| Room and stage | Stage: bass centre | left and right within 0.5 dB | left minus right +0.10 dB | PASS |  |
| Room and stage | Stage: keys slightly left | left louder, by under 6 dB | left minus right +3.73 dB | PASS |  |
| Room and stage | Stage: drums slightly right | right louder, by under 6 dB | left minus right -2.79 dB | PASS |  |
| The NO thuds | Thud at 8 s (NO 1), on fx.wav | 45 to 60 Hz, starts 1.15x higher or more, 100-200 Hz at least -15 dB, above 3 kHz at most -40 dB | 51.9 Hz, starts 1.43x higher, 100-200 Hz -7.9 dB, above 3 kHz -58.9 dB | PASS |  |
| The NO thuds | Thud at 17 s (NO 2), on fx.wav | 45 to 60 Hz, starts 1.15x higher or more, 100-200 Hz at least -15 dB, above 3 kHz at most -40 dB | 46.3 Hz, starts 1.37x higher, 100-200 Hz -10.1 dB, above 3 kHz -59.8 dB | PASS |  |
| The NO thuds | Thud at 37 s (the slab), on fx.wav | 45 to 60 Hz, starts 1.15x higher or more, 100-200 Hz at least -15 dB, above 3 kHz at most -40 dB | 49.0 Hz, starts 1.41x higher, 100-200 Hz -9.9 dB, above 3 kHz -59.1 dB | PASS |  |

Nobody has heard this file. PASS means the number is inside the brief's range, nothing more. The tilt has two readings and the brief does not say which it means: the kit judges the spectral density (the usual analyser view: pink noise falls 3 dB per octave, brown noise 6) and prints the third-octave band-level reading under it, which is 3 dB per octave shallower for the same sound. Where the brief gives no number the kit chose one and the row says what it is: "nothing cancels" is read as no band losing 3 dB or more in mono (3 dB is left and right unrelated; more is cancelling), "low end centred" as a left/right correlation of 0.90 or more under 150 Hz, "nothing vital below 50 Hz" as less than a tenth of the energy there, the stage as which side of a stem is louder, and the thud as the four numbers in its row.

### Stems

Each stem as it sits in the mix before the master bus. "re bass" is the stem's RMS minus the bass stem's.

| stem | RMS dBFS | re bass | RMS 30-36 s | re bass 30-36 s | peak dBFS | left minus right dB | L/R correlation | centroid Hz | energy above 150 Hz |
|---|---|---|---|---|---|---|---|---|---|
| bass | -33.2 | +0.0 | -30.6 | +0.0 | -16.4 | +0.10 | 1.00 | 154 | 43 % |
| keys | -46.1 | -12.9 | -84.6 | -54.0 | -17.8 | +3.73 | 0.86 | 494 | 100 % |
| drums | -44.6 | -11.4 | -40.7 | -10.1 | -17.6 | -2.79 | 0.92 | 1667 | 75 % |
| fx | -46.9 | -13.7 | -83.3 | -52.7 | -19.2 | -0.02 | 1.00 | 68 | 5 % |

Band energies of each stem, dB relative to that stem's own total:

| stem | sub, under 60 Hz | bass, 60 to 250 Hz | low-mid, 250 to 500 Hz | mid, 500 Hz to 2 kHz | presence, 2 to 5 kHz | brilliance, 5 to 8 kHz | air, over 8 kHz |
|---|---|---|---|---|---|---|---|
| bass | -10.8 | -0.7 | -12.6 | -18.6 | -38.9 | -59.3 | -84.7 |
| keys | -66.1 | -14.2 | -2.7 | -3.8 | -29.0 | -58.6 | -89.7 |
| drums | -9.2 | -6.8 | -9.7 | -6.4 | -5.9 | -11.5 | -21.2 |
| fx | -1.7 | -5.0 | -23.8 | -36.4 | -43.1 | -49.8 | -64.4 |

## 8. What was looked at

- **This candidate's own pictures** (spectro.py, analysis/own-*.png: a plain short-time Fourier transform on a labelled log axis). own-final-00-12s: nothing but the noise floor before 0.5 s; four rising steps at 0.5, 1.0, 1.5, 2.0 s (98, 117, 131, 147 Hz); brush columns from 2.5 s; idea 1 as fast steps up to 196 Hz at 5.0 s, the drop to 73 Hz at 6.5 s, the slide down to 55 Hz; a dark sliver just before 8.0 s; at 8.0 s a low blob at 52 Hz dying by about 9.5 s with nothing above it after 8.4 s; brush columns alone from 10 s and one bass note (92 Hz) at 11 s. own-final-20-32s: only the floor from 20 to 22 s; from 22.0 s a stair of harmonic stacks, one a beat, the fundamental going from 49 Hz to 196 Hz at 30 s; four short bright dashes at 392, 466, 523, 587 Hz at 22.5, 24.5, 26.5, 28.5 s; no brush column at 22.0 s, the first at 22.5 s. own-drums-20-38s: columns once a beat from 22.5 s, taller on 2 and 4 from 24.5 s, brighter tops on 2 and 4 from 26.5 s, paired columns at the swung off-beats from 28.5 s, horizontal cymbal lines from 30.0 s to about 36.3 s, low blobs once a beat from 32 s. own-final-30-46s: the stair coming down; a dark sliver before 37.0 s; at 37.0 s the 49 Hz blob and four held lines (233, 294, 349, 440 Hz); three steps at 38, 38.5, 39 s; a dark sliver before 40 s; one long line at 98 Hz and four chord lines fading smoothly to the floor by about 45.3 s. No thin full-height vertical line (a click) anywhere; the floor is an even speckle with no bright shelf.
- **The kit's pictures** (analysis/spectrogram*.png): used for time structure only (the same gaps and entries), because their frequency axis is mirrored (see section 9). analysis/waveform.png: sparse first two bars, a dense block from 4 to 8 s, a spike and a decay at 8 s, a flat line from 18 to 22 s, a steady build from 22 to 30 s, the slab no taller than the loudest bass notes, a long smooth decay after 40 s; no flat tops.
- **The audition's pictures** of the chosen presets: bass-musescore.png (sharp starts, a smooth four-second decay on the held note, a clean stop, nothing between the notes), piano-mellow-musescore.png (three velocities: more upper partials with each, smooth decays, no hiss), brushes-fluidr3.png (the same three brush recordings: energy to above 10 kHz, which is why they are low-passed here).
- **Where the master squeezes** (diag.js: stems times the master's plain gain against final.wav, 5 ms frames): idea 1 2.6 to 2.8 dB on average (most 3.7), bars 15 to 18 1.4 to 1.8 dB (most 3.0), the three hits most 4.1, 3.7 and 5.4 dB for an instant; idea 2 and bars 12 to 13 0.3 to 0.5 dB on average (most 1.4).

## 9. Notes on the kit, for the lead

1. **The kit's spectrogram pictures are mirrored.** analysis/spectrogram*.png (ffmpeg showspectrumpic, fscale=log, in analyze.js) show a dark line at the "520 Hz" label with the picture reflected below it; a rising bass line draws one band going up above the line and one going down below it. lib/demo/spectrogram-00-12s.png shows the same. The labels cannot be used to read pitch. Worked around here with spectro.py (numpy and PIL, this directory only); the kit was not edited.
2. **"Keys relative to bass, 30 to 36 s"** measures a window in which this candidate's piano does not play, by assignment. It reads -54.0 dB and fails. Where the piano plays it is inside the target: see the row "keys against bass" in section 5.
3. sampler.onset() caches into lib/audition/onsets.json: this build's calls added its hard-hit keys to that file (the kit's own cache, written by the kit's own function).
4. test-sampler.js: 12 of 12 passed. test-mix.js: 141 ok, 0 failed.

## 10. Listening guide

1. At 0.5, 1.0, 1.5 and 2.0 s you should hear four single bass notes going up (G, Bb, C, D), one as each bay stands up, and nothing else. Before 0.5 s, only a faint room hiss.
2. At 2.5 s the brushes start to stir; at 3.5 s the bass plays a quick three-note run-up.
3. From 4 to 8 s you should hear the bass showing off, nearly twice as many notes a second as it plays anywhere else (15 in four seconds): straight up to its top note by 5.0 s, a tumble at 5.5 s, a big drop onto a low note exactly as the block stops at 6.5 s, then a slide downwards.
4. At 8.0 s you should hear one low thud with the bass and the bass drum, cut dead: the slide never gets its last note. Then only the thud dying away until 10 s; brushes alone from 10 s, one long bass note at 11 s.
5. From 12 to 17 s you should hear the bass play just two long notes a bar under light brushes, and at 14.5 s one soft piano note, the only one before idea 3.
6. At 17.0 s you should hear the second thud, a little lower than the first, cut dead. From about 18.5 to 22.0 s: no instrument at all, only the faint hiss.
7. At 22.0 s you should hear the bass alone begin a plain scale from its lowest G, one note a beat. At 22.5, 24.5, 26.5 and 28.5 s one piano note each, each higher than the one before (G, Bb, C, D), and at each of them something joins the brushes: the stir, taps on 2 and 4, a soft hi-hat, skipping taps.
8. At 30.0 s you should hear the scale arrive on the bass's top note and a soft ride cymbal come in for the first time; the bass then walks down in the same plain quarter notes. From 32 s a soft bass drum is under it.
9. At 36.0 and 36.5 s you should hear two low bass notes (the two notes the first two NOs landed on), a short silence, and at 37.0 s the third thud with the bass's home note and a piano chord, both held for about a second instead of being cut dead like the first two.
10. At 38.0, 38.5 and 39.0 s you should hear three bass notes stepping down, one beat of nothing, then at 40.0 s the last bass note and a soft rolled piano chord fading away; by about 45.5 s only the hiss.

## 11. Known weaknesses, plainly

1. **Nobody has heard it.** Every statement here is a number or a picture. Whether it is funny, or dry, or dull, is not known.
2. **One analysis target fails by design**: keys against bass in the tool's 30 to 36 s window, because the piano is silent there. This candidate has no passage in which all three instruments comp together.
3. **One piano note more than the assignment listed**: G4 at 14.5 s, for idea 2's COST pass (the brief's "small nod"). It sets up the joke (the same note opens idea 3) but it is a departure; deleting the first row of KEYS in chart.js removes it.
4. **The brush swirl is a stroke, not a stir.** The library's swirl is a 0.6 s one-shot, 20 dB down after 0.18 s; it is restruck once a beat, so between strokes the brushes nearly vanish. Neither library has a continuous swirl, and one made from noise would be the synthetic sound the speaker complained about.
5. **The bass is one recording per zone with no velocity layers.** A harder note is the same pluck, louder and a little brighter. Timing, length and level vary; the pluck itself does not. In a score where the bass is nearly everything, this is the likeliest place for "it sounds sampled".
6. **The bass's small-speaker harmonics are processing, not recording**: 16.7 percent of the sampled line's energy is above 150 Hz, 43.2 percent after the added harmonics and EQ. If the low notes read as buzzy, lower MIX.bass.harmonics.db; how far it can go before the 25 percent target fails was not measured with the final EQ.
7. **The three lowest hit notes are at or under 50 Hz** (G1 49.0, F#1 46.2, Ab1 51.9 Hz). On a phone they exist only as their harmonics and the thud's 100 to 200 Hz body. Energy under 50 Hz is -13.8 dB of the total.
8. **The loud passages are squeezed**: compressor up to 4.3 dB, limiter up to 2.3 dB on 2.7 percent of the samples, and before that the kit's spikes shaved by up to 5.3 dB. A bass-led mix reads low on a loudness meter for its peak level, so reaching -16 LUFS costs this. The hardest brush taps lose some of their edge.
9. **The tilt is inside the range but on its dark side**: -5.96 dB per octave against 4.5 to 6.5.
10. **The piano's lone notes are short.** In this register a held note is 20 dB down after 0.75 to 0.92 s (audition). Each PASS note is a brief touch, 8 dB under the bass; it is the brightest line above 300 Hz at those instants in the pictures, but whether it reads as "PASS" by ear is unverified. Two of its recordings (Bb4, D5) are 4 to 5 dB hotter than their neighbours and were levelled by fader, not by tone.
11. **The loop seam** is a fade to digital zero and back (300 ms out, 4 ms in), room tone on both sides.
12. **Only 20 swung eighths exist** in the whole piece (idea 1's bass, the skip notes, the ride), so "swing" is mostly implied by where the taps and the ride fall.
