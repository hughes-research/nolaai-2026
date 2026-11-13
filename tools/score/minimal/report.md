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
- The first soundtrack was in C minor. This is not that piece.

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
| 1 | 0-2 | floor line; bays 1 to 3 stand up | Gm | [2] G2 [3] Bb2 [4] D3 | - | - | one note a bay: the four gates are G, Bb, D, F (a Gm7 arpeggio) |
| 2 | 2-4 | bay 4; kicker text | Gm7 D7 | [1] F3 rings [4] D2 [4+1/3] E2 [4+2/3] F#2 | - | swirl 2 3 4; tap 4 | the run-up: idea 1 cannot wait |
| 3 | 4-6 | idea 1: "A chatbot / for everything" | Gm6 | [1] G2 [1&] Bb2 [2] D3 [2&] E3 [3] G3 [4] F3 [4+1/3] E3 [4+2/3] Eb3 | - | swirl 1 2 3 4; tap 2 4; skip 1& 2& 3& 4&; hat 2 4; kick 1 2 3 4 | the top of the instrument in three beats |
| 4 | 6-8 | block enters, dead stop at 6.5; shutter falls | D7b9 | [1] D3 [1&] F#3 [2] D2 [3] C2 [3+1/3] B1 [3+2/3] Bb1 [4] A1 | - | swirl 1 2 3 4; tap 2 4; skip 1& 2& 3&; hat 2 4; kick 1 2 3 4 | the drop lands with the block; the slide home to G; band out as the shutter lets go (7.625 s) |
| 5 | 8-10 | NO 1 at 8.000 | Ab7 | [1] **Ab1** choked | - | kick **1**; slap **1**; slap2 **1**; drag **1** | out of the silence: Ab, a half step too high. Band out |
| 6 | 10-12 | text on screen | D7 | [3] F#2 | - | swirl 1 2 3 4; tap 4 | F#, a half step under home, as Ab was over it; it resolves into bar 7 |
| 7 | 12-14 | idea 2: "Meeting notes for managers" | Gm | [1] G2 [3] D2 [4&] D2 (ghost) | - | swirl 1 2 3 4; tap 2 4; skip 4& | root, fifth, done |
| 8 | 14-16 | COST passes at 14.5 | Cm | [1] C2 [3] Eb2 | [2] G4 | swirl 1 2 3 4; tap 2 4; skip 4& | the piano plays the COST gate's note, once, and nothing more |
| 9 | 16-18 | shutter falls; NO 2 at 17.000 | D7 | [1] D2 [3] **F#1** choked | - | swirl 1 2; tap 2; kick **3**; slap **3**; slap2 **3**; drag **3** | band out as the shutter lets go (16.625 s); the dominant's third, a half step too low. Band out |
| 10 | 18-20 | text on screen | N.C. | - | - | - | tails only |
| 11 | 20-22 | the held breath | N.C. | - | - | - | room tone only |
| 12 | 22-24 | idea 3; PASS 1 at 22.5 | Gm | [1] G1 [2] A1 [3] Bb1 [4] C2 | [2] G4 | swirl 2 3 4 | the bass alone; G1 is the note F#1 was waiting for. The gate notes are the scale's strong beats. Layer 1 at the PASS: the stir |
| 13 | 24-26 | PASS 2 at 24.5 | Bb/D | [1] D2 [2] Eb2 [3] F2 [4] F#2 | [2] Bb4 | swirl 1 2 3 4; tap 2 4 | one gate further than idea 2 got. Layer 2: taps on 2 and 4 |
| 14 | 26-28 | PASS 3 at 26.5 | Gm7 | [1] G2 [2] A2 [3] Bb2 [4] C3 | [2] D5 | swirl 1 2 3 4; tap 2 4; skip 2& 4& | layer 3: the swung skip notes |
| 15 | 28-30 | PASS 4 at 28.5 | Dm7 | [1] D3 [2] Eb3 [3] F3 [4] F#3 | [2] F5 | swirl 1 2 3 4; tap 2 4; skip 2& 4&; hat 2 4 | layer 4: the hi-hat, with the foot; the F# on beat 4 leads into the top G |
| 16 | 30-32 | the winner at 30; text from 30.5 | Gm Ebmaj7 | [1] G3 [2] F3 [3] Eb3 [4] D3 | [1] G4 Bb4 D5 F5 rolled | swirl 1 2 3 4; tap 2 4; hat 2 4; ride 1 2 2& 3 4 4& | the top note, reached the slow way; the piano strikes all four gate notes at once; the ride enters |
| 17 | 32-34 | sleeve; title lines on 3, 3&, 4, 4& | Cm7 F7 | [1] C3 [2] G2 [3] F2 [4] A2 | - | swirl 1 2 3 4; tap 2 3 4; skip 3& 4&; hat 2 4; ride 1 2 2& 3 4 4&; kick 1 2 3 4 | the title's own line: roots fall by fifths (C F Bb Eb Ab); from F it climbs in sequence as the title lines stack up |
| 18 | 34-36 | subtitle, name | Bbmaj7 Ebmaj7 | [1] Bb2 [2] D3 [3] Eb3 [4] Ab1 | - | swirl 1 2 3 4; tap 2 4; skip 1& 2& 3& 4&; hat 2 4; ride 1 2 2& 3 4 4&; kick 1 2 3 4 | the peak, Eb3, then a twelfth down onto Ab1: the first failed hit's note |
| 19 | 36-38 | slab falls from 36.625; THE SLAB at 37.000 | Ab7 Gm9 | [1] F#1 [3] **G1** rings | [3] **Bb3 D4 F4 A4** | swirl 1; ride 1; kick 1 **3** | F#1, the second failed hit's note; band out as the slab lets go (36.625 s); G: home, and the only held chord |
| 20 | 38-40 | back to positive; the card holds | Gm7 | [1] F3 [3] D3 | - | swirl 1 2 3 4; tap 2 4 | the gate notes backwards, in half notes: F, D... |
| 21 | 40-42 | card | Gm7 | [1] Bb2 | - | swirl 1 2 3; tap 2 | ...Bb, and a beat of nothing before the last one |
| 22 | 42-44 | card | Gm6/9 | [1] G2 | [1] Bb3 E4 A4 D5 rolled | swirl 1 2 | G, and the slab chord with F fallen to E; left to ring |
| 23 | 44-46 | card; loop point | Gm6/9 | [1] G1 | - | - | the same G once more, an octave down, softly; gone by 45.9 s |

**Where the band is out.** 0 to 0.5 s (room tone; the first sound is the bass at 0.5 s). 8.4 to 10 s after NO 1 (tails only), brushes alone until 11 s. 17.4 to 22 s after NO 2 and through the held breath. About 36.8 to 37.0 s, a breath while the slab falls. 39.5 to 40 s, a beat of nothing before the last note. The piano is out everywhere except 14.5, 22.5, 24.5, 26.5, 28.5, 37.0 and 40.0 s. The ride is out until 30.0 s.

**How the four PASSes climb.** Each PASS is beat 2 of its bar. Three things rise together: the bass has climbed four more scale steps; the piano plays the next gate note (G4, Bb4, C5, D5: bar 1's bass motif two octaves up, and the roots of bars 12 to 15: Gm, Bb, Cm7, Dm7); and one more layer of the kit starts on that beat (swirl, taps on 2 and 4, hi-hat with the foot, swung skip notes). At the winner the bass reaches G3 and the ride enters.

**The three HARD hits.** NO 1 (8.000 s): the slide C2 B1 Bb1 A1 is heading for G and is cut on Ab1, a half step too high; choked; thud 51.9 Hz; bass drum. NO 2 (17.000 s): the two-feel lands on F#1, the dominant's third, a half step too low; choked; thud 46.2 Hz. The slab (37.000 s): bar 19 plays Ab1, F#1, a breath, G1: both failures, in order, become the approach to home; G1 rings, thud 49.0 Hz, piano Gm9 (Bb3 D4 F4 A4) held through the two beats of negative. None of the three is humanised; every note is started early by its sample's measured onset.

**The tag and the last chord.** Bar 20 answers bar 1 backwards (D3 C3 Bb2, a rest, then G2). The last chord at 40.0 s is the slab chord with one voice moved (F4 down to E4: Gm9 becomes Gm6/9) and the fourth gate's note, D5, on top; rolled, released at 45.0 s. The film loops from that ring into half a second of room tone and the first G.

## 5. The chart checked as data (check-chart.js)

From arrangement.json (the notes as played) and the WAV files, not from the build's own variables.

| Check | Measured | Target | Result |
|---|---|---|---|
| bass notes on beats 1 and 3 are chord tones | 35 of 35 | all | pass |
| last note of a bar reaches the next bar by a half or whole step | 14 of 20 (6 stated exceptions)<br>bar 1 to 2 (D3 to F3, 3 semitones): D3 to F3: bars 1 and 2 are one figure, the gate motif, a Gm7 arpeggio with one note a bay; the third is the motif's own ; bar 5 to 6 (Ab1 to F#2, 10 semitones): Ab1 to F#2 across two seconds of stop-time: the two notes are the upper and lower neighbours of G2, which bar 7 then plays (an enclosure, with the F# an octave up) ; bar 19 to 20 (G1 to F3, 22 semitones): G1 to F3: the piece has ended on G1; the tag is a new phrase after a full stop ; bar 20 to 21 (D3 to Bb2, 4 semitones): D3 to Bb2: the tag is the gate motif backwards (F D Bb G) in half notes, and its thirds are the motif's own ; bar 21 to 22 (Bb2 to G2, 3 semitones): Bb2 to G2, a minor third after a beat of rest: the last step of the motif backwards ; bar 22 to 23 (G2 to G1, 12 semitones): G2 to G1: the same note plucked once more, softly, an octave down, as the chord dies (the first is let go before its recording starts to loop) | all, or a stated reason | pass |
| no two bars hold the same bass pitches | 21 bars, all different | none the same | pass |
| bass range as written (sounding) | F#1 to G3 | E1 to G3 | pass |
| bays (bass), PASSes (keys) and the tag (bass, backwards, bars 20 to 22) use the same four notes | bays G Bb D F; keys G4 Bb4 D5 F5; tag F D Bb G | G Bb D F; the same; F D Bb G | pass |
| the exposed motif (bays, tag): no three notes in a row move by a minor third and a whole step, or a fourth and a whole step, in one direction | +3 +4; +4 +3; -3 -4; -4 -3 semitones | none of +3 +2, +2 +3, +5 +2, +2 +5 or their mirrors | pass |
| idea 3: the gate notes are the strong beats (1 and 3) of the scale, in both octaves | G Bb D F / G Bb D F | G Bb D F, twice | pass |
| the winner (bar 16, beat 1): the piano strikes the four gate notes together | G4 Bb4 D5 F5 | G4 Bb4 D5 F5 | pass |
| the title (bars 17 and 18, into bar 19) has a line of its own: leaps and turns, and a climb to its peak before the slab | C3 G2 F2 A2 Bb2 D3 Eb3 Ab1 F#1: 4 leaps of a third or more in 8 moves, 2 turns; five notes rising to Eb3 (bar 18, beat 3); idea 3 and the winner: 0 leaps in 19 moves | at least 3 leaps and 2 turns; the peak in bar 18 | pass |
| the four PASS notes rise (as written) | G4 < Bb4 < D5 < F5 | each higher than the last | pass |
| the three hard hits: a half step over home, a half step under, home | Ab1, F#1, G1 | Ab1, F#1, G1 | pass |
| as played: bass on beats 1 and 3 is a chord tone | 35 of 35 | all | pass |
| as played: bass range (sounding; MIDI key minus 0) | F#1 to G3 | E1 to G3 | pass |
| swing ratio of the off-beat eighths, each against its own player's beat | mean 0.639, 0.629 to 0.649 over 29 eighths<br>bass 0.639 (4), brushes 0.639 (19), ride 0.640 (6) | 0.62 to 0.66 | pass |
| idea 1 is the busiest passage before the title | 11.50 events a second; next 11.00 | the most before 32 s | pass |
| idea 2 is thinner than idea 1 | 4.80 against 11.50 (bass alone: 1.20 against 3.75) | under half of idea 1 | pass |
| idea 3 grows at every PASS | 4.00 < 5.50 < 6.50 < 7.50 | each window busier than the last | pass |
| idea 3 and the title are plain quarters: one bass note a beat from 22 s until the slab lets go (36.0 s is the last) | 29 notes, steady: true | 29 notes, one a beat | pass |
| the bass leans on a pattern of beats, a different one in each idea (velocity, leaned beats minus the others) | idea 1 (bars 3 and 4): beats 2 and 4 by +0.058; idea 3 (bars 12 to 15): beats 1 and 3 by +0.076; the winner and the title (bars 16 to 18): beats 2 and 4 by +0.056; idea 2 (bars 7 to 9): beats 1 by +0.119 | each at least +0.04 | pass |
| no piano note sits a minor ninth over a bass note it sounds with | none in 17 piano notes | none | pass |
| as played: the piano at the winner (30.0 s) | G4 Bb4 D5 F5 within 89 ms of the frame | G4 Bb4 D5 F5 | pass |
| as played: the top note at each PASS rises | G4 at 22.504, Bb4 at 24.503, D5 at 26.505, F5 at 28.503 | four notes, each higher | pass |
| no drum voice plays the same velocity twice running | 0 repeats in 156 pairs | 0 | pass |
| the bass sits behind the beat (on-beat notes, the hits apart) | 4.0 to 10.7 ms late, mean 6.8 | 4 to 12 ms | pass |
| the ride sits on top of the beat (on-beat strokes) | 1.3 to 2.7 ms early | 0 to 6 ms early | pass |
| after NO 1: instrument stems, 9 to 9.9 s, against 4 to 8 s | -111.0 dBFS against -29.9 dBFS: 81.1 dB down | at least 30 dB down | pass |
| after NO 2: instrument stems, 18.5 to 19.9 s, against 12 to 17 s | -135.1 dBFS against -35.4 dBFS: 99.6 dB down | at least 30 dB down | pass |
| the held breath, 20.3 to 22.0 s, in final.wav | -68.1 dBFS RMS; 0.00 percent of samples are zero | under -60 dBFS, and not digital silence | pass |
| instrument stems in the held breath | -134.9 dBFS | under -75 dBFS (room tone is all there is) | pass |
| before 0.25 s: final.wav, and the instrument stems | -68.3 dBFS RMS; instrument peak -128.9 dBFS | room tone only (under -60 dBFS; instruments under -90) | pass |
| the tail: final.wav, 45.9 to 46.0 s (and 45.5 to 45.9 s) | -86.6 dBFS (-69.0 dBFS) | under -60 dBFS | pass |
| hard hit at 8.000 s: onset in final.wav | 8.0015 s (+1.5 ms); rise 47.2 dB in 10 ms | within 10 ms | pass |
| hard hit at 17.000 s: onset in final.wav | 17.0010 s (+1.0 ms); rise 50.0 dB in 10 ms | within 10 ms | pass |
| hard hit at 37.000 s: onset in final.wav | 37.0015 s (+1.5 ms); rise 52.7 dB in 10 ms | within 10 ms | pass |
| thud at 8 s: strongest low partial of the fx stem | 51.9 Hz | 51.9 Hz (the bass note), within 2 Hz, and 45 to 60 Hz | pass |
| thud at 17 s: strongest low partial of the fx stem | 46.3 Hz | 46.2 Hz (the bass note), within 2 Hz, and 45 to 60 Hz | pass |
| thud at 37 s: strongest low partial of the fx stem | 49.0 Hz | 49.0 Hz (the bass note), within 2 Hz, and 45 to 60 Hz | pass |
| the bass stem sounds at the written pitch (fundamental by autocorrelation) | G1 at 22 s: 48.9 Hz; G2 at 26 s: 97.9 Hz; G3 at 30 s: 197.3 Hz; G1 at 37 s: 48.9 Hz; F#1 at 17 s: 46.1 Hz; Ab1 at 8 s: 51.8 Hz | 49.0, 98.0, 196.0, 49.0, 46.2, 51.9 Hz, within 60 cents | pass |
| lowest and highest of the probed bass notes, as they sound | 46.1 to 197.3 Hz | inside E1 (41.2 Hz) to G3 (196.0 Hz) | pass |
| the PASS notes rise, as they sound (strongest partial of the keys stem) | 392 Hz < 466 Hz < 587 Hz < 699 Hz | 392, 466, 587, 698 Hz | pass |
| keys against bass (stem RMS) while the keys play | the four PASSes (22.5 to 30 s): -7.9 dB; the winner chord (30 to 31 s): -6.1 dB; the slab chord (37 to 38 s): -2.7 dB; the last chord (42 to 43.3 s): -5.0 dB | about -3 to -10 dB | pass |
| drums against bass (stem RMS) | idea 1 (4 to 8 s): -11.0 dB; idea 2 (12 to 17 s): -10.0 dB; idea 3 (24 to 30 s): -12.0 dB; winner and title (30 to 36.5 s): -12.0 dB | about -8 to -16 dB in the full passage | pass |
| idea 3: the drums stem grows at every PASS and again at the winner (RMS) | -144.5 < -47.1 < -46.1 < -45.3 < -44.4 < -43.5 dBFS | silent before PASS 1, then louder each time | pass |
| the accents, as they sound: bass stem level of the leaned beats against the other beats | idea 3 (22 to 30 s): beats 1 and 3 by +1.6 dB; the winner and the title (30 to 36 s): beats 2 and 4 by +1.0 dB | each at least +0.7 dB | pass |
| the break before 8 s: final.wav from 7.7 to 7.99 s against the bar before; the instrument stems there | 29.8 dB under; stems at -59.7 dBFS | at least 10 dB under | pass |
| the break before 17 s: final.wav from 16.7 to 16.99 s against the bar before; the instrument stems there | 28.5 dB under; stems at -64.6 dBFS | at least 10 dB under | pass |
| the break before 37 s: final.wav from 36.7 to 36.99 s against the bar before; the instrument stems there | 42.7 dB under; stems at -74.4 dBFS | at least 10 dB under | pass |
| each hit against the 1.5 s before it: full band / above 150 Hz / 400 Hz to 6 kHz | 8 s: +2.5 / -0.6 / +2.6 dB; 17 s: +5.5 / +3.1 / +3.8 dB; 37 s: +2.5 / +3.4 / +6.3 dB | the two shutters louder than the bar before them on a phone (over 0 dB in 400 Hz to 6 kHz); the slab not under it by more than 3 dB | pass |
| brushes, 12 to 16 s: loudest minus quietest 10 ms in each beat of the drums stem | 11 12 10 14 12 11 9 12 dB | under 15 dB in every beat (it was 46 to 50) | pass |
| struck swirls that stand alone: neighbouring pairs, first 60 ms of the drums stem, level taken out | 47 pairs, r median 0.241, highest 0.633 | every pair under 0.98 (it was 1.0000) | pass |
| the drums stem while each door falls (0.25 to 0.02 s before each hit) against the bar before | 25.0, 22.0, 45.0 dB under | at least 20 dB under (the room dying away is all that is left) | pass |

Events a second, section by section (bass notes + piano notes + drum strokes):

| Section | Bass | Piano | Drums | A second |
|---|---:|---:|---:|---:|
| dock (0 to 4 s) | 7 | 0 | 4 | 2.75 |
| idea 1 (4 to 8 s) | 15 | 0 | 31 | 11.50 |
| after NO 1 (8.4 to 10 s) | 0 | 0 | 0 | 0.00 |
| restart (10 to 12 s) | 1 | 0 | 5 | 3.00 |
| idea 2 (12 to 17 s) | 6 | 1 | 17 | 4.80 |
| after NO 2 (17.4 to 22 s) | 0 | 0 | 0 | 0.00 |
| idea 3, after PASS 1 (22 to 24 s) | 4 | 1 | 3 | 4.00 |
| idea 3, after PASS 2 (24 to 26 s) | 4 | 1 | 6 | 5.50 |
| idea 3, after PASS 3 (26 to 28 s) | 4 | 1 | 8 | 6.50 |
| idea 3, after PASS 4 (28 to 30 s) | 4 | 1 | 10 | 7.50 |
| the winner (30 to 32 s) | 4 | 4 | 14 | 11.00 |
| the title (32 to 37 s) | 9 | 0 | 46 | 11.00 |
| the tag (38 to 46 s) | 5 | 4 | 12 | 2.63 |

## 6. The mix chain

- **Performance** (seed 20261113): bass 4 to 12 ms behind, drifting like a player; ride 0 to 6 ms ahead; a lone piano note 2 to 9 ms late; the last chord rolled at about 25 ms a note; swing 0.64 plus or minus 0.006; no drum voice at the same velocity twice running; taps alternate two recordings; walking quarters joined with a 24 to 44 ms gap.
- **Bass**: one sampler render, mono. Zone evening by velocity (the seven recordings differ by up to 6.3 dB in this mix; left alone, the scale stepped 3.6 dB louder between Bb2 and C3 in bar 14; that step is now 1.1 dB, and the largest step between neighbours from bar 12 to bar 18 is 2.6 dB, at a note the chart leans on: K-weighted level of each note in the stem). Harmonics for small speakers: the part under 120 Hz shaped by a soft curve at a depth that follows each note, and only what that adds between 150 Hz and 1000 Hz mixed back (0 dB). EQ: lowshelf 90 Hz -6.5 dB, peak 400 Hz -1.5 dB, peak 800 Hz +4.5 dB, peak 1600 Hz +4 dB, lp 5000 Hz. Centre. Room send -24 dB. Energy above 150 Hz: 17.1 percent as sampled, 42.0 percent in the stem.
- **Piano**: one render; narrowed to 0 of its width; EQ: hp 140 Hz, peak 3000 Hz -3 dB, lp 6000 Hz; pan -0.3; room send -14 dB. Level by fader, measured: the four PASS notes 8 dB under the bass (RMS, 22.5 to 30 s), each evened to the first plus 0.7 dB a step (G4 +5.0, G4 -1.2, Bb4 -5.1, D5 -4.1, F5 -1.6 dB: this piano's recordings are that uneven); slab chord 2.6 dB and last chord 5 dB under the bass in their own windows.
- **Kit**: one preset, three renders (brushes; hat and ride; bass drum) so each has its own tone control. Brushes: hp 170 Hz, peak 3600 Hz -4 dB, lp 9000 Hz, pan 0.24, send -9 dB. Cymbals: hp 450 Hz, peak 3505 Hz -10 dB, peak 6334 Hz -5 dB, peak 7497 Hz -5 dB, peak 2680 Hz -5 dB, lp 5600 Hz, lp 9000 Hz, -4.5 dB, pan 0.34. Bass drum: hp 38 Hz, lp 2200 Hz, -9 dB, pan 0.08. More stir than tap (swirl velocities +0.12, taps -0.13). Kit level 12.5 dB under the bass (RMS, 30 to 36.5 s). Stroke peaks shaved on the kit alone to the level of the bass's own peaks (up to 0.2 dB, 0.4 percent of the film, RMS change 0.00 dB), so the master does not duck the band on every tap.
- **Thuds**: NO 1 51.9 Hz at -13.5 dB; NO 2 46.2 Hz at -13 dB; the slab 49.0 Hz at -16.5 dB; room send -18 dB.
- **Room**: mix.room decay 0.75 s, damp 0.6, predelay 14 ms; one room, computed per stem so the stems still sum to the mix.
- **Room tone**: placed at -82.8 dBFS before the master so that it sits at -68 dBFS in final.wav (the master adds 16.6 dB).
- **Ends**: every stem fades in over 4 ms and out from 45.7 to 46.0 s before the master, so stems through the master equal final.wav.
- **Master** (kit defaults): high-pass 30 Hz, shelf -3 dB above 8000 Hz, compressor 2:1 at -18 dBFS (up to 5.0 dB, mean 0.99), limiter up to 3.6 dB on 9.7 percent of the samples. Out: -16.01 LUFS, -2.05 dBTP, LRA 7.9 LU.

## 7. Measurements

### The kit's self-checks (build.js exits 0 only if these and section 5 pass)

| Check | Measured | Target | Result |
|---|---|---|---|
| format | 48 kHz, 2 ch, 24-bit PCM, 2208000 samples | 48 kHz, 2 ch, 24-bit PCM, 2208000 samples | pass |
| loudness | -16.01 LUFS | -16.5 to -15.5 | pass |
| true peak | -2.05 dBTP | at most -2 | pass |
| loudness range | 7.9 LU | 5 to 12 | pass |
| clipping | 0 samples at full scale (sample peak -2.05 dBFS) | 0 | pass |
| DC | L -5.1e-6, R -5.3e-6 | within 1e-4 | pass |
| clicks | 0 isolated; steepest jump 0.154 at 35.501 s is an attack | 0 | pass |
| sync: NO 1 @ 8 s | onset 7.9968 s, -3.2 ms (frame 240) | within 10 ms, on a frame | pass |
| sync: NO 2 @ 17 s | onset 16.9970 s, -3.0 ms (frame 510) | within 10 ms, on a frame | pass |
| sync: the slab @ 37 s | onset 36.9969 s, -3.1 ms (frame 1110) | within 10 ms, on a frame | pass |
| held breath 20.3-22 s | -68.1 dBFS RMS | below -60, above -80 (not digital silence) | pass |
| room tone under everything | quietest 100 ms: -69.1 dBFS at 19.30 s | above -80 | pass |
| tail 45.9 s to the end | -86.6 dBFS RMS | below -60 | pass |
| loop seam | first and last samples within 1.2e-7 | under 0.003 | pass |

### The brief's targets, by the kit's analysis tool (analysis/numbers.md)

(run the kit's analyze.js first)

### Stems



## 8. What was looked at

- **This candidate's own pictures** (spectro.py, analysis/own-*.png: a plain short-time Fourier transform on a labelled log axis). own-final-00-12s: nothing but the noise floor before 0.5 s; four rising steps at 0.5, 1.0, 1.5, 2.0 s (98, 117, 131, 147 Hz); brush columns from 2.5 s; idea 1 as fast steps up to 196 Hz at 5.0 s, the drop to 73 Hz at 6.5 s, the slide down to 55 Hz; a dark sliver just before 8.0 s; at 8.0 s a low blob at 52 Hz dying by about 9.5 s with nothing above it after 8.4 s; brush columns alone from 10 s and one bass note (92 Hz) at 11 s. own-final-20-32s: only the floor from 20 to 22 s; from 22.0 s a stair of harmonic stacks, one a beat, the fundamental going from 49 Hz to 196 Hz at 30 s; four short bright dashes at 392, 466, 523, 587 Hz at 22.5, 24.5, 26.5, 28.5 s; no brush column at 22.0 s, the first at 22.5 s. own-drums-20-38s: columns once a beat from 22.5 s, taller on 2 and 4 from 24.5 s, brighter tops on 2 and 4 from 26.5 s, paired columns at the swung off-beats from 28.5 s, horizontal cymbal lines from 30.0 s to about 36.3 s, low blobs once a beat from 32 s. own-final-30-46s: the stair coming down; a dark sliver before 37.0 s; at 37.0 s the 49 Hz blob and four held lines (233, 294, 349, 440 Hz); three steps at 38, 38.5, 39 s; a dark sliver before 40 s; one long line at 98 Hz and four chord lines fading smoothly to the floor by about 45.3 s. No thin full-height vertical line (a click) anywhere; the floor is an even speckle with no bright shelf.
- **The kit's pictures** (analysis/spectrogram*.png): used for time structure only (the same gaps and entries), because their frequency axis is mirrored (see section 9). analysis/waveform.png: sparse first two bars, a dense block from 4 to 8 s, a spike and a decay at 8 s, a flat line from 18 to 22 s, a steady build from 22 to 30 s, the slab no taller than the loudest bass notes, a long smooth decay after 40 s; no flat tops.
- **The audition's pictures** of the chosen presets: bass-musescore.png (sharp starts, a smooth four-second decay on the held note, a clean stop, nothing between the notes), piano-mellow-musescore.png (three velocities: more upper partials with each, smooth decays, no hiss), brushes-fluidr3.png (the same three brush recordings: energy to above 10 kHz, which is why they are low-passed here).
- **Where the master squeezes** (diag.js: stems times the master's plain gain against final.wav, 5 ms frames): idea 1 2.6 to 2.8 dB on average (most 3.7), bars 15 to 18 1.4 to 1.8 dB (most 3.0), the three hits most 4.1, 3.7 and 5.4 dB for an instant; idea 2 and bars 12 to 13 0.3 to 0.5 dB on average (most 1.4).

## 9. Notes on the kit

1. **The kit's spectrogram pictures were mirrored (fixed since: the kit now draws them with `lib/spectro.py`).** When this score was composed, the kit's spectrograms (ffmpeg showspectrumpic, fscale=log, in analyze.js) showed a dark line at the "520 Hz" label with the picture reflected below it; a rising bass line drew one band going up above the line and one going down below it. The labels could not be used to read pitch. Worked around at the time with spectro.py (numpy and Pillow), which the kit then took over.
2. **"Keys relative to bass, 30 to 36 s"** measures a window in which this candidate's piano does not play, by assignment. It read -54.0 dB when this was written and fails (after the revision it reads -13.3 dB, still a FAIL). Where the piano plays it is inside the target: see the row "keys against bass" in section 5.
3. sampler.onset() caches into lib/audition/onsets.json: this build's calls added its hard-hit keys to that file (the kit's own cache, written by the kit's own function).
4. test-sampler.js: 12 of 12 passed. The kit's mix test (not shipped): 141 ok, 0 failed.

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
6. **The bass's small-speaker harmonics are processing, not recording**: 17.1 percent of the sampled line's energy is above 150 Hz, 42.0 percent after the added harmonics and EQ. If the low notes read as buzzy, lower MIX.bass.harmonics.db; how far it can go before the 25 percent target fails was not measured with the final EQ.
7. **The three lowest hit notes are at or under 50 Hz** (G1 49.0, F#1 46.2, Ab1 51.9 Hz). On a phone they exist only as their harmonics and the thud's 100 to 200 Hz body. Energy under 50 Hz is -13.4 dB of the total.
8. **The loud passages are squeezed**: compressor up to 5.0 dB, limiter up to 3.6 dB on 9.7 percent of the samples, and before that the kit's spikes shaved by up to 0.2 dB. A bass-led mix reads low on a loudness meter for its peak level, so reaching -16 LUFS costs this. The hardest brush taps lose some of their edge.
9. **The tilt is inside the range but on its dark side**: -6.27 dB per octave against 4.5 to 6.5.
10. **The piano's lone notes are short.** In this register a held note is 20 dB down after 0.75 to 0.92 s (audition). Each PASS note is a brief touch, 8 dB under the bass; it is the brightest line above 300 Hz at those instants in the pictures, but whether it reads as "PASS" by ear is unverified. Two of its recordings (Bb4, D5) are 4 to 5 dB hotter than their neighbours and were levelled by fader, not by tone.
11. **The loop seam** is a fade to digital zero and back (300 ms out, 4 ms in), room tone on both sides.
12. **Only 20 swung eighths exist** in the whole piece (idea 1's bass, the skip notes, the ride), so "swing" is mostly implied by where the taps and the ride fall.

## Revision (after the judging)

Three judges measured this score beside the other three. A reviser, who did not write it, then worked through their findings. This section is the reviser's report; the sections above describe the score as it was judged, and where the two differ this section is the current state.

Nobody has heard this version either. Everything here is a number or a picture. The sections above describe the first version; where they disagree with this section, this section is the file on disk (final.wav MD5 4fc251b18cea139182f5bfcac9aaeffe).

### What changed in the music

1. **The gate motif is new: G, Bb, D, F (a Gm7 arpeggio), not G, Bb, C, D.** The first version's exposed opening was the first three notes of a famous rock riff in its own key. Bays: G2, Bb2, D3, F3 (one a bay, F3 rings). PASS notes: G4, Bb4, D5, F5. Tag: F3, D3, Bb2, a rest, G2. The motif has no minor-third-plus-whole-step cell and no fourth-plus-whole-step cell in one direction (the cells rock and blues riffs are made of); a check holds that.
2. **The motif is inside the winning scale.** The scale's strong beats (1 and 3) are G Bb | D F in both octaves: idea 3 is the motif with the steps filled in. (The first version's "roots of bars 12 to 15" cannot be kept with any other motif while the scale stays plain: only G Bb C D gives four rising roots that fit.) Bar 15's E3 is now Eb3, because E3 under the new F5 would be a minor ninth; bars 13 and 15 are therefore the same notes an octave apart.
3. **The winner has an arrival.** At 30.000 s the piano strikes the four gate notes at once (G4 Bb4 D5 F5, soft, rolled over 85 ms, held to 31.9 s), then stays out. The piano still only says PASS: the winner passed all four. Eight piano events, 17 notes.
4. **The title has a line of its own.** Bars 17 to 19: C3 G2 F2 A2 | Bb2 D3 Eb3 Ab1 | F#1, (silence), G1. The roots fall by fifths (C, F, Bb, Eb, Ab); from 33.0 s, as the title lines stack up, the line climbs in a sequence (F A Bb, Bb D Eb) to its peak, Eb3, at 35.0 s, and drops a twelfth onto Ab1. Ab1 and F#1, the two failed hits' notes, are still the last two notes before home.
5. **A break before each hit.** The band is out for the 0.375 s each door falls (7.625, 16.625, 36.625 s). The slide before NO 1 is now a triplet (C2 B1 Bb1) and a short A1.
6. **The hits have a middle.** At the two shutters both brushes are slapped on the snare head and one is dragged (three recordings, low-passed at 2.6 kHz). The slab chord is rolled over 41 ms from the frame.
7. **The ending is later and longer.** Tag in half notes at 38, 39, 40 s; nothing at 41.5 s; G2 and the last chord (Bb3 E4 A4 D5, unchanged) at 42.0 s; the same G once more at 44.0 s, an octave down, softly. Ring-out ends at about 45.4 s.
8. **Idea 1 is about 2 dB softer on the bass** (it was the loudest music of the film) and has a brush skip before every beat (11.5 events a second).
9. **Accents with a pattern:** idea 1 leans on 2 and 4, idea 2 on 1, idea 3 on 1 and 3, the winner and title on 2 and 4.
10. **Layers of idea 3:** the stir (PASS 1), taps (PASS 2), swung skip notes (PASS 3), hi-hat (PASS 4), ride (winner).

### The chart, bars that changed

| Bar | Time s | Chord | Bass | Piano | Kit |
|---:|---|---|---|---|---|
| 1 | 0-2 | Gm | [2] G2 [3] Bb2 [4] D3 | - | - |
| 2 | 2-4 | Gm7 D7 | [1] F3 rings [4] D2 E2 F#2 (triplet, softer) | - | stir and swirl 2 3 4; tap 4 |
| 3 | 4-6 | Gm6 | as before, 2 dB softer | - | as before, skip on every "and" |
| 4 | 6-8 | D7b9 | [1] D3 [1&] F#3 [2] D2 [3] C2 B1 Bb1 (triplet) [4] A1 short; out at 7.625 | - | skip 1& 2& 3&; out at 7.625 |
| 5 | 8-10 | Ab7 | [1] Ab1 choked | - | bass drum, two slaps, a drag on 1 |
| 9 | 16-18 | D7 | [1] D2 to 16.625 [3] F#1 choked | - | out at 16.625; bass drum, two slaps, a drag on 3 |
| 12-15 | 22-30 | Gm, Bb/D, Gm7, Dm7 | the scale, with Eb3 at 28.5 s | [2] G4, Bb4, D5, F5 | stir; + taps; + skips; + hi-hat |
| 16 | 30-32 | Gm Ebmaj7 | G3 F3 Eb3 D3 | [1] G4 Bb4 D5 F5 | + ride |
| 17 | 32-34 | Cm7 F7 | C3 G2 F2 A2 | - | + bass drum, skips |
| 18 | 34-36 | Bbmaj7 Ebmaj7 | Bb2 D3 Eb3 Ab1 | - | a skip before every beat |
| 19 | 36-38 | Ab7 Gm9 | [1] F#1 to 36.625 [3] G1 rings | [3] Bb3 D4 F4 A4, rolled 41 ms | one beat, out at 36.625; bass drum on 3 |
| 20 | 38-40 | Gm7 | [1] F3 [3] D3 | - | stir, taps 2 4 |
| 21 | 40-42 | Gm7 | [1] Bb2; nothing on 4 | - | stir 1 2 3 |
| 22 | 42-44 | Gm6/9 | [1] G2 (1.5 s) | [1] Bb3 E4 A4 D5 rolled | stir 1 2 |
| 23 | 44-46 | Gm6/9 | [1] G1, soft (1.3 s) | (the fingers come off one by one) | - |

### What changed in the sound

- **Brushes:** a continuous stir made from the swirl recording itself (short pieces of one stroke laid over each other, swept once a beat), under the struck strokes; every struck stroke rendered alone and given its own speed (up to 3 percent) and brightness (up to 2 dB). It stops 70 ms after each door lets go and is absent in the held breath.
- **Bass:** 17 of 66 notes are played from the neighbouring zone's recording and read back to pitch, so a repeated pitch is not always the same pluck; 9 notes ring 60 to 109 ms over the next across a string crossing; +4.5 dB at 800 Hz (was +3), -1.5 dB at 400 Hz.
- **Cymbals:** notches at 3505, 6334, 7497 and 2680 Hz, low-pass 5600 Hz (was 7000), 2 dB lower; hi-hat 6 ms early (was 18).
- **Piano:** folded to mono before the pan, drier (send -14 dB), a fader per event; PASS notes struck harder (0.78 to 0.84) and mixed at one level; the last chord's fader falls 4 dB a second.
- **Thuds:** more body (1.8, 1.5, 1.8); the bass drum under them 8 dB lower.
- **Room tone:** low-passed at 1.5 kHz.
- **Balance:** kit 12.5 dB under the bass in 30 to 36.5 s (was 10.5); brushes of the dock +2.5 dB, of the restart +1.5 dB.

### The new numbers (was = the judges' or the first report's figure)

| | now | was |
|---|---|---|
| Kit analysis targets | 23 of 24 (keys in the 30 to 36 s window -13.3 dB) | 23 of 24 (-54.0 dB) |
| Loudness, true peak, range | -16.01 LUFS, -2.05 dBTP, 7.9 LU | -16.03, -2.05, 9.7 |
| Tilt; 2 to 5 kHz; above 8 kHz | 6.27 dB/oct; -18.8 dB; -36.1 dB | 5.96; -17.4; -34.8 |
| Ride line at 3512.7 Hz | -53.1 dBFS, 6.8 dB over its third octave | -37.8 dBFS, 20.8 dB |
| 2 to 5 kHz: loudest 20 ms, 400 ms, 3 s | -23.6, -32.5, -34.4 dBFS | -21.0, -28.9, -30.4 |
| 5 to 8 kHz, loudest 20 ms | -31.1 dBFS | -26.0 |
| NO 1 against the 1.5 s before it (full / above 150 Hz / phone band) | +2.5 / -0.5 / +2.6 dB | +2.1 / -3.6 / -5.3 |
| NO 2 | +5.5 / +3.1 / +3.9 dB | +7.6 / +2.3 / -2.2 |
| The slab | +2.5 / +3.4 / +6.3 dB | +2.3 / +1.9 / +3.3 |
| Last 375 ms before each hit against the bar | -10.8, -13.4, -15.8 dB | -1.8, -5.5, -4.1 |
| HARD sync (kit detector) | -3.2, -3.0, -3.1 ms | +0.7, -2.8, -2.4 |
| Momentary loudness: idea 1, winner, title, slab (mean / max) | -13.8/-12.0, -14.0/-12.7, -15.7/-13.0, -17.5/-15.0 LUFS | -13.1/-11.6, -14.6, -15.1/-13.4, -18.4/-15.7 |
| Brushes alone, 10 to 11 s | -28.5 dBFS | -34.2 |
| Brushes 12 to 16 s, loudest minus quietest 10 ms per beat | 8 to 14 dB | 46 to 50 dB |
| Isolated swirl pairs, r | median 0.27, highest 0.65 | 43 of 43 over 0.995 |
| Same-pitch bass pairs over r 0.95 | 53 of 97 | 94 of 94 |
| Piano, left minus right per event | 3.28 to 3.97 dB | 0.0 to +6.9 dB |
| Final RMS, 44 to 45 s | -23.3 dBFS (silent from 45.5 s) | -46.4 |
| Floor slope | -5.9 dB/oct | -3.1 |
| Master: compressor max, limiter max | 5.0 dB, 3.6 dB | 4.3 dB, 2.3 dB |

Build: 35 s, deterministic (four consecutive builds, one MD5). 14 kit checks and 51 chart checks pass.

### What was looked at (lib/spectro.py, regenerated in analysis/)

- Whole piece: four steps at 0.5 to 2.0 s (98, 117, 147, 175 Hz); a dark gap before each of the three hits; the stair from 22 s with four dashes at 392, 466, 587, 698 Hz and four lines together at 30.0 s; the title line dipping to 87 Hz at 33 s, climbing to 156 Hz at 35 s and dropping to 52 and 46 Hz; three one-second notes at 38, 39, 40 s; a dark gap at 41.5 s; chord at 42 s; a low note from 44.0 to 45.4 s; nothing after.
- Drums stem, 0 to 17 s and 20 to 38 s: a continuous haze from 150 Hz to about 10 kHz wherever the swirl plays, brighter once a beat, with no black between beats; nothing before 2.5 s, from 8.6 to 10 s or before 22.5 s; it ends 70 ms after 7.625, 16.625 and 36.625 s; at 8.0 s one column from 50 Hz to about 6 kHz dying in 0.6 s; no horizontal line from 30 s on.
- Keys stem: eight events; the last chord's upper lines end first; no step in any decay.
- Bass stem, 20 to 38 s: harmonic stacks one a beat; the borrowed notes (29.5 to 31 s, 32 to 34 s) show less below the fundamental than their neighbours.

### Listening guide, the lines that changed

1. At 0.5, 1.0, 1.5 and 2.0 s you should hear four single bass notes going up in wider steps than before (a broken chord: G, Bb, D, F), and nothing else.
2. At 2.5 s the brushes start: you should hear one continuous soft stirring that swells a little on each beat, not separate swishes with nothing between.
3. From 4 to 8 s the bass shows off as before, a little quieter; at 7.0 s a quick run of three notes down and one short note, then about a third of a second of near silence.
4. At 8.0 s you should hear the thud with the bass and, new, a dull slap of brushes on a drum, cut dead; then only tails until 10 s.
5. From 10 s the stirring brushes alone, clearer than before; one long bass note at 11 s.
6. At 16.6 s the band stops; at 17.0 s the second thud, lower, again with the slap.
7. At 22.5, 24.5, 26.5 and 28.5 s one piano note each, now G, Bb, D, F (wider steps); the things that join are the stir, taps on 2 and 4, skipping taps, a soft hi-hat.
8. At 30.0 s, with the bass's top note and the ride, you should hear one soft piano chord: the four notes you just heard, together.
9. From 32 s the bass no longer walks straight down: two drops (32.5 and 33.0 s), then five notes climbing from 33.0 to 35.0 s under skipping brushes, a big drop at 35.5 s, one more low note at 36.0 s, and near silence from 36.6 s.
10. At 37.0 s the third thud, the bass's home note and the piano chord (its notes spread very slightly), held about a second.
11. At 38, 39 and 40 s three bass notes stepping down, one a second; nothing at 41.5 s; at 42.0 s the last bass note with a soft rolled chord; at 44.0 s the same bass note once more, lower and softer; by about 45.4 s only the hiss, which is darker than before.

### Weaknesses that remain, plainly

1. Nobody has heard it. In particular nobody has heard the stir: it is the recording's own noise, but it is laid together by a program from 0.3 s of one stroke, and its crest sits 2 dB over the struck swirl's loudest 10 ms. If it reads as hiss, raise MIX.drums.bed.underStroke (now -2); above about +1 the 15 dB valley target fails.
2. One kit row still fails: keys against bass in the 30 to 36 s window, -13.3 dB (one soft chord, then out).
3. NO 1 above 150 Hz is still 0.5 dB under the bar before it (was 3.6 dB under). The master clamps the three hits by up to 6.2, 5.9 and 7.0 dB for an instant (was 4.1, 3.7, 5.4): they carry more now. NO 2's full-band lead over its bar fell from +7.6 to +5.5 dB.
4. The slab is still 2.0 LU under the title's maximum by the judge's window (was 2.3); the loudest moment of the film is the winner's arrival at 30.4 s.
5. The bass: 49 of 66 notes are still the one recording per pitch; G1 at 22 s and at 37 s are the same pluck; timing spread is unchanged (sd 1.6 ms).
6. The piano: Bb4 at 24.5 s is close to a pure tone (second partial 29.8 dB under the first) and F5 is thin (21.9 dB); G4 at 14.5 and 22.5 s are one waveform (r 0.997). The cure is measured, not built.
7. Idea 3 is still a plain two-octave scale (by decision), and bars 13 and 15 are now identical an octave apart.
8. The tilt is on the dark side of its window (6.27 against 4.5 to 6.5). Loudness range fell to 7.9 LU.
9. Time 400 ms of 2 to 5 kHz over -36 dBFS: 14.1 s (was 16.3 s; the first soundtrack 12.9 s): the stir is on all the time.
10. While each door falls the dry band is out but the room's answer is not: the drums stem is 22 to 25 dB under the bar before, not silent, before the two shutters.
11. Energy under 50 Hz is unchanged (-13.4 dB): the hits are tuned to 46 to 52 Hz by concept.

### Fixed, with the measurement before and after

- **MAJOR (music, originality): the exposed opening G2 Bb2 C3 (D3) is the first three notes of a famous rock riff in its own key; the tag ended C Bb G** (music)
  - Change: chart.js: the gate motif is now a Gm7 arpeggio, G Bb D F. Bays G2 Bb2 D3 F3 (F3 rings); PASS notes G4 Bb4 D5 F5 (GATE_NOTES); tag backwards F3 D3 Bb2, rest, G2; bar 15 E3 became Eb3 (E3 under the new F5 would be a minor ninth). The 'roots of bars 12 to 15' cannot be carried through: with the plain scale kept, the strong beats are G Bb | D F and only G Bb C D gives four rising roots that fit, so the motif is carried in a stronger way instead: the four gate notes ARE the strong beats (1 and 3) of the scale, in both octaves, and the slab chord is three gate notes plus the fourth in the bass plus one new note. check-chart.js: gate-motif check updated, new checks motif-cells (no minor-third-plus-whole-step or fourth-plus-whole-step cell in one direction, the cells rock and blues riffs are made of), gate-skeleton, no-minor-ninth. Checked against what I know: a rising minor-seventh arpeggio is generic; the nearest things (tunes that open on a rising minor triad) all leave it before the flat seventh.
  - Before: bays G Bb C D, cells +3 +2 and +2 +2 semitones; tag D C Bb G (judge's reading of arrangement.json; confirmed in the first chart.js)
  - After: bays G Bb D F, cells +3 +4 and +4 +3; tag F D Bb G, cells -3 -4 and -4 -3; 0 minor ninths between piano and bass in 17 piano notes; all 66 bass notes within 23.1 cents of the chart (music judge's pitch.py, was 26)
- **MAJOR (music): no arrival at the winner, piano silent from 30.25 to 37 s** (music)
  - Change: chart.js KEYS: one soft rolled chord of the four gate notes (G4 Bb4 D5 F5) at 30.000 s, held to 31.9 s, nothing else under the text. build.js: each piano event is now alone in its render pass and has its own fader (this also removed overlapping fader rides that stepped a ringing note by up to 4.9 dB in the first version).
  - Before: keys stem 30.0 to 30.5 s -74.1 dBFS; kit row 'keys relative to bass, 30 to 36 s' -54.0 dB (judge and first report)
  - After: chord 6.1 dB under the bass in its own second (30 to 31 s); kit row -13.3 dB (still a FAIL in the kit's 6 s window: one chord, then out by decision); no minor ninth against G3 F3 Eb3 D3
- **MAJOR (music): idea 3 and the title are a scale up and a scale down for 14 seconds** (music)
  - Change: chart.js: idea 3 kept plain (as instructed). Bars 17 and 18 are a line of their own: roots fall by fifths (Cm7 F7 | Bbmaj7 Ebmaj7 | Ab7), C3 G2 F2 A2 | Bb2 D3 Eb3 Ab1 | F#1: a rising sequence (F A Bb, Bb D Eb) from 33.0 s as the title lines stack up, peak Eb3 at 35.0 s, a twelfth down onto Ab1; the two failed hits' notes are still the last two notes before the slab. Kit: a skip note before every beat in bar 18, each stronger. New check title-shape.
  - Before: 28 stepwise quarter notes from 22.0 to 35.5 s; 0 leaps in bars 17 to 18 (judge)
  - After: bars 17 to 19: 4 leaps of a third or more in 8 moves, 2 turns, five notes rising to the peak in bar 18; final RMS bar 17 -17.5, bar 18 -16.1 dBFS; still one bass note a beat (29 notes, steady)
- **MAJOR (realism): brush swirl is one waveform on every beat with near silence between strokes, alone at 10 to 11 s** (realism)
  - Change: build.js: (a) stir(): a continuous bed made from the key 40 recording itself (60 to 90 ms pieces from 0.03 to 0.33 s of one stroke, each read at its own speed, laid over each other at seeded places), swept once a beat (crest after each struck stroke, 4 to 5.5 dB down between, never twice the same), only on beats where the chart has a swirl; hushed 70 ms after each door lets go; (b) renderStrokes(): every struck stroke rendered alone, read at its own speed (up to 3 percent) through its own shelf (up to 2 dB above 2 kHz); skip notes alternate keys 38 and 39. New checks brush-valley, stroke-pairs, stir-stops.
  - Before: isolated swirl pairs 43 of 43 over r 0.995 (median 1.0000); skip median 0.996; 12 to 16 s peak minus valley 46 to 50 dB per beat, 39 percent of the time more than 30 dB under the peaks; envelope self-match 0.970 at 1 s (judge-realism/repeat-minimal.txt)
  - After: same script on the new files: 47 swirl pairs, median r 0.267, highest 0.649, none over 0.95; skip median 0.185, highest 0.526; peak minus valley 12 12 10 14 12 11 8 12 dB; 0 percent of the time more than 20 dB under the peaks; envelope self-match 0.752 at 1 s; drums stem 22 to 45 dB under the bar before while each door falls; -134.9 dBFS in the held breath
- **MAJOR (realism): the lead bass is one waveform per pitch with no accent pattern; no note overlaps the next** (realism)
  - Change: chart.js ACCENTS: idea 1 leans on 2 and 4 and pushes its off-beats, idea 2 on 1, idea 3 on 1 and 3 (square), winner and title on 2 and 4. build.js: every second occurrence of a pitch within two semitones of a zone edge is played from the NEIGHBOURING zone's recording and read back to pitch (17 of 66 notes; 5 bass passes); notes ring 60 to 109 ms over the next when the next is on another string. New checks accents (as played) and accents-sound (stem level).
  - Before: 94 of 94 same-pitch pairs over r 0.95, 79 over 0.98, 34 over 0.995, median 0.992; velocity by beat 0.63/0.61/0.62/0.63; 62 gaps, none negative (judge)
  - After: 97 pairs: 53 over 0.95, 45 over 0.98, 23 over 0.995, median 0.969; leaned beats minus the others: idea 1 +0.058, idea 2 +0.119, idea 3 +0.076, title +0.056 in velocity, and +1.6 dB (idea 3) and +1.0 dB (title) in the stem; 9 notes ring over the next; pitch 66 of 66 within 23.1 cents; borrowed notes speak 2.2 ms (median) after their written start, direct ones 2.3 ms
- **MAJOR (signal): the upper band is the kit alone, hotter than the first soundtrack, with a steady ride line at 3.5 kHz** (signal)
  - Change: build.js MIX: ride notches at 3505 Hz (q 8, -10 dB), 6334 and 7497 Hz (-5 dB) and at 2680 Hz (the 2643/2710 pair that stood next); cymbal low-pass 7000 to 5600 Hz, cymbals -2 dB, ride touch -0.04; brush dip at 3.6 kHz -2 to -4 dB (stir -4.5); taps and skips softer; bass 800 Hz +3 to +4.5 dB and -1.5 dB at 400 Hz (the middle comes from the bass); kit level 12.5 dB under the bass in 30 to 36.5 s (was 10.5).
  - Before: ride 3512.7 Hz at -37.8 dBFS, 20.8 dB over its third octave; 2-5 kHz loudest 20 ms -21.0, loudest 400 ms -28.9, loudest 3 s -30.4 dBFS, 16.3 s over -36 dBFS; 2-5 kHz -17.4 dB re total and 4.2 dB under 500 Hz to 2 kHz; 5-8 kHz loudest 20 ms -26.0; tilt 5.96 (judge)
  - After: same methods: ride line -53.1 dBFS, 6.8 dB over its third octave, no line over 10 dB in 1.5 to 8 kHz; 2-5 kHz loudest 20 ms -23.6 (now the two shutter hits), 400 ms -32.5, 3 s -34.4, 14.1 s over -36 dBFS; 2-5 kHz -18.8 dB re total, 7.3 dB under 500 Hz to 2 kHz; 5-8 kHz loudest 20 ms -31.1; tilt 6.27
- **MAJOR (signal): NO 1 (and NO 2) do not register on small speakers or phones; no break before the hits** (signal)
  - Change: chart.js and build.js: the band is out for the 0.375 s each door falls (last notes end at the drop time, hush() damps bass, brushes, stir, cymbals 70 ms later; the slide before NO 1 is now a triplet C2 B1 Bb1 and a short A1); at the two shutters both brushes slapped on the head (keys 39 and 38, a few ms apart) and one dragged (key 40), low-passed at 2.6 kHz, tip shaved, more room; thud body 1.8, 1.5, 1.8; bass drum 8 dB lower under the thuds; Ab1 at velocity 0.9. New checks break-8/17/37 and hits-small.
  - Before: hit against the 1.5 s before it, full / above 150 Hz / 400 Hz to 6 kHz: NO 1 +2.1/-3.6/-5.3, NO 2 +7.6/+2.3/-2.2, slab +2.3/+1.9/+3.3 dB; last 375 ms -1.8, -5.5, -4.1 dB under the bar; phone band of the first 300 ms -32.6 and -32.7 dBFS; thud 100-200 Hz share 18, 11, 12 percent (judge)
  - After: NO 1 +2.5/-0.5/+2.6, NO 2 +5.5/+3.1/+3.9, slab +2.5/+3.4/+6.3 dB; last 375 ms -10.8, -13.4, -15.8 dB; phone band of the first 300 ms -24.3, -25.2, -21.0 dBFS; thud 100-200 Hz share 40, 19, 27 percent; HARD sync -3.2, -3.0, -3.1 ms (kit), +1.5, +1.0, +1.5 ms (own detector)
- **MAJOR in the signal judge's fuller write-up (M3): idea 1 is the loudest music by about 2 LU** (signal)
  - Change: chart.js: bass velocities of bars 3 and 4 about 2 dB lower (as the judge asked); the master renormalises.
  - Before: momentary idea 1 mean -13.1, max -11.6 LUFS; winner mean -14.6; film maximum at 5.2 s (judge)
  - After: idea 1 mean -13.8, max -12.0; winner mean -14.0, max -12.7; the film's maximum is now the winner's arrival, -11.9 LUFS at 30.4 s
- **MAJOR in the realism judge's fuller write-up: the last chord holds flat and is switched off; and MINOR (signal): last chord gone four seconds before the end; MINOR (realism): last bass note in a frozen loop** (realism)
  - Change: chart.js: the tag is in half notes (F3 38.0, D3 39.0, Bb2 40.0, nothing at 41.5), last chord and G2 at 42.0 s, G2 let go at 43.5 s where its loop begins, the same G plucked once more at 44.0 s an octave down, softly, let go at 45.3 s. build.js: the last chord's notes are let go one by one, top first, and its fader falls 4 dB a second from 0.9 s after the strike.
  - Before: final RMS per second 40-41 -20.6, 41-42 -36.3, 42-43 -42.1, 44-45 -46.4 dBFS; keys stem flat at -60 to -62 dBFS for 3.5 s; G2 held 4.5 s, frozen from 1.5 s in (r 0.99997) (judges)
  - After: final per second from 41 s: -35.3 (the beat of nothing), -19.0, -33.2, -23.3, -35.2; per half second from 44.0: -21.2, -27.4, -32.2, then -70.0 from 45.5 s; keys stem per half second from 42 s: -38.4 -49.8 -62.0 -66.2 -67.9 -71.4 -77.3; no bass note longer than 1.5 s; tail 45.9 to 46 s -86.6 dBFS
- **MINOR: the slab reads lower than the bars before it** (signal)
  - Change: build.js and chart.js: 0.375 s of silence before it; chord 2.7 dB under the bass (was 4.5) at velocity 0.70; G1 at 0.9; thud 1.5 dB lower with more body; bass drum 8 dB lower there; title bass velocities 0.03 lower; kit 1.7 dB lower through the title.
  - Before: momentary title mean -15.1, max -13.4; slab mean -18.4, max -15.7 LUFS; first 300 ms +2.3 dB over the bar before (judge)
  - After: title -15.7 / -13.0; slab -17.5 / -15.0 by the judge's windows (the 0.4 s series reads -13.6 at 37.2 s, level with the title's peak); first 300 ms +2.5 full band, +3.4 above 150 Hz, +6.3 dB on a phone band. Improved, not closed: 2.0 LU under the title's maximum by the judge's window (was 2.3)
- **MINOR: quiet passages likely under venue noise, then a 21 LU jump** (signal)
  - Change: The stir fills the brushes; brush bus +2.5 dB in bar 2 and +1.5 dB in bar 6; run-up notes D2 E2 F#2 about 3 dB softer; bay notes slightly up and evened (F3 down: its recording reads hot).
  - Before: 10 to 11 s -34.2 dBFS RMS; momentary -27.2 and -34.7 LUFS at 3.0 and 3.5 s, then -13.9 at 4.0 s (judge)
  - After: 10 to 11 s -28.5 dBFS; momentary -24.0 and -23.4 at 3.0 and 3.5 s, -15.0 at 4.0 s; restart (10 to 12 s) mean -20.4, still under idea 2's -18.7; loudness range 7.9 LU (was 9.7)
- **MINOR (MAJOR on headphones in the fuller write-up): the lone piano notes come from four places; one mono cell loses 4.5 dB** (realism)
  - Change: build.js: piano folded to mono before the pan (width 0), room send -11 to -14 dB and the piano's room half as wide; the four PASS notes set to one level (first 0.6 s); the nod of idea 2 softer and 10 ms later.
  - Before: left minus right per note +4.3, +3.1, +6.9, 0.0 dB; worst mono cell -4.5 dB at 26.8 s in 1 to 2 kHz (judges)
  - After: left minus right of the eight events 3.70, 3.72, 3.94, 3.45, 3.28, 3.65, 3.97, 3.93 dB (range 0.7); worst mono cell -2.0 dB (7.7 s, 1 to 2 kHz)
- **MINOR: slab chord, four notes on one sample instant** (realism)
  - Change: build.js playKeys: rolled unevenly, bottom note on the frame.
  - Before: spread 0.0 ms (judge)
  - After: 0, 12, 24, 41 ms (realism judge's perf.py)
- **MINOR: room tone, a darker one** (realism)
  - Change: build.js: the kit's room tone through a 1.5 kHz low-pass, re-levelled by the existing loop.
  - Before: floor slope -3.1 dB per octave, L/R correlation 0.60, -69.0 dBFS (judge)
  - After: slope -5.9 dB per octave, correlation 0.67, -68.8 dBFS by the judge's room.py; held breath -68.1 dBFS (kit)
- **MINOR (music): PASS 3's layer is barely a layer; swing mostly implied; hi-hat foot 15 to 20 ms early; the two shutter hits and the skip notes one waveform** (music)
  - Change: chart.js: layers are now stir, taps, swung skip notes (PASS 3), hi-hat (PASS 4), ride (winner), with the stir stepping up each time; a skip on 4-and in bars 7 and 8; hi-hat 6 ms early instead of 18 (its sample speaks at once: 50 percent of peak after 2.2 ms); hit strokes at different velocities, speeds and flams.
  - Before: drums stem per PASS window -49.8, -47.6, -46.6, -44.2 dBFS (steps +2.2, +1.0, +2.4); 20 swung eighths; hits 0.9987 to 0.9997 (judges)
  - After: -47.1 < -46.1 < -45.3 < -44.4 < -43.5 dBFS (steps +1.0, +0.8, +0.9, +0.9: even, small, because the stir carries the level); 29 swung eighths, ratio 0.629 to 0.649; the two shutter hits r 0.536

### Not changed, and why

- **Kit analysis row 'Keys relative to bass, 30 to 36 s' (-10 to -3 dB)**: It failed before the revision (-54.0 dB, by design) and reads -13.3 dB now. Passing it needs the winner chord 2.7 dB under the bass (MIX.keys.chordUnderBass.winner 6 to 2.7), as loud as the slab chord; the lead asked for one soft chord and then out. Left at 6.1 dB under the bass in its own second, inside the -3 to -10 window there.
- **Neighbour-key round robin exactly as the realism judge describes it (alternate occurrences one key higher, re-read)**: Measured: inside one zone of this preset the neighbouring key re-read to pitch is the identical waveform (r 1.0000); only across a zone edge is it another recording (r 0.47 to 0.90). Done across zone edges instead, for pitches within two semitones of an edge (17 notes). Not done for Ab1 to Bb1, Eb2, C#3 to E3 (too far from an edge) and for F#1 and G1 (the recording below key 30 measured half as bright again, centroid 110 against 74 Hz, and 2 dB louder: too different for the lone G1 at 22 s). So G1 at 22 s and at 37 s are still one recording.
- **MINOR (realism): jitter range too small (bass sd 1.7 ms)**: A spread of 3 to 5 ms would take the bass outside the 4 to 12 ms window and the swing outside 0.62 to 0.66 that check-chart.js holds, so two checks would have to be loosened; not done. Unchanged: bass sd 1.6 ms, lag-1 correlation +0.65.
- **MINOR (music): NO 1 arrives late in the bass (half-rise +7.9 ms)**: Starting Ab1 5 ms earlier would move the first trace of the hit to about -8 ms on the kit's HARD sync detector (it reads -3.2 ms now), leaving 2 ms of margin. The weight of the hit now comes from the slap and drag (50 percent point +1.5 ms). Bass 50 percent point still +8.0 ms.
- **MINOR (realism, fuller write-up): G4 at 14.5 s and 22.5 s is one waveform; Bb4 and F5 are close to pure tones**: Half done: PASS notes are now struck at 0.78 to 0.84 and the nod at 0.45 (the judge's numbers), which did not separate them (r 0.9967, was 0.9995) and left Bb4's second partial 29.8 dB under its first (was 35) and F5's 21.9 dB. The cure is measured, not built: this piano's zones are 64-65, 66-67, 68-69, 70-72, 73-75, 76-77, 78-79; Bb4 from key 69 read one semitone up has its second partial at -20.6 dB, F5 from key 78 read one semitone down at -10.8 dB (7 dB quieter recording).
- **Grafts: swirl strokes on the swung 'ands'; the second ride recording (key 59)**: The stir fills the holes the extra strokes were meant to fill (valley 8 to 14 dB against the 30 dB the graft's donor has). Key 59 has other partials than the four notched for key 51 and would need its own line search; not attempted.
- **MINOR (signal, fuller write-up): 5 percent of the energy is under 50 Hz**: Unchanged by concept: three hits and three thuds tuned to 46 to 52 Hz. Kit row -13.4 dB (was -13.8), target at least 10 dB under the total.

### Final numbers

Final state, kit analysis (lib/analyze.js on final.wav and its stems): 23 of 24 measured targets pass; the one FAIL is 'keys relative to bass, 30 to 36 s' -13.3 dB (it was -54.0 dB before the revision; see declined). Loudness -16.01 LUFS (ffmpeg ebur128 -16.0); true peak -2.05 dBTP; loudness range 7.9 LU; tilt 6.27 dB per octave (200 Hz to 8 kHz); above 8 kHz -36.1 dB; 2 to 5 kHz -18.8 dB; drums re bass 30 to 36 s -12.0 dB; keys re bass in their own windows -7.9 (PASS notes), -6.1 (winner chord), -2.7 (slab chord), -5.0 dB (last chord); mono loss 0.04 dB, worst band 0.30 dB, worst 100 ms cell -2.0 dB; low end L/R correlation 0.998; bass stem above 150 Hz 42 percent; under 50 Hz -13.4 dB; 0 clicks, DC -5e-6, 0 clipped; held breath -68.1 dBFS, quietest 100 ms -69.1 dBFS; stage bass +0.11, keys +3.74, drums -2.61 dB left minus right; thuds 51.9, 46.3, 49.0 Hz with 100-200 Hz at -4.3, -7.6, -6.2 dB and above 3 kHz under -73 dB. HARD sync: kit detector -3.2, -3.0, -3.1 ms; this candidate's own detector +1.5, +1.0, +1.5 ms. Tail 45.9 to 46 s -86.6 dBFS. build.js exits 0: 14 of 14 kit checks and 51 of 51 chart checks pass (40 before; 11 added, none loosened except those that had to follow the music: gate-motif, idea3-plain 30 to 29 notes, keys-balance windows). Master: gain 16.6 dB, compressor up to 5.0 dB (mean 0.99), limiter up to 3.6 dB (first version 4.3, 0.91, 2.3). Build 35 s (was 14.5 s), 16 fluidsynth passes. MD5 of final.wav 4fc251b18cea139182f5bfcac9aaeffe, the same in four consecutive builds (stems bass c31d2af5, drums 2bf9547a, fx bc8a93d0, keys 08b5c4ed; arrangement.json 8c168d5c).

### What remains weak

- Nobody has heard it. The stir (the continuous brush bed) is the largest unverified change: a granular bed from 0.3 s of one recorded stroke, crest 2 dB over the struck swirl's loudest 10 ms, carrying about 10 dB more RMS than the struck swirls. One dial if it reads as hiss: MIX.drums.bed.underStroke in build.js.
- Kit analysis: 23 of 24. 'Keys relative to bass, 30 to 36 s' reads -13.3 dB (target -10 to -3); it was -54.0 dB. One soft chord cannot fill a 6 s window.
- NO 1 above 150 Hz is 0.5 dB under the bar before it (was 3.6 under); the master clamps the hits by up to 6.2, 5.9, 7.0 dB for an instant (was 4.1, 3.7, 5.4); NO 2 full band fell from +7.6 to +5.5 dB over its bar.
- The slab's momentary maximum is 2.0 LU under the title's by the judge's window (was 2.3); the film's loudest moment is the winner at 30.4 s (-11.9 LUFS).
- Bass: 49 of 66 notes still one recording per pitch (53 of 97 same-pitch pairs over r 0.95); G1 at 22 s and 37 s identical; timing spread unchanged (sd 1.6 ms).
- Piano: Bb4 PASS note close to a pure tone (second partial -29.8 dB), F5 -21.9 dB; G4 at 14.5 and 22.5 s r 0.997.
- Idea 3 is a plain scale by decision; bars 13 and 15 are now identical an octave apart (E3 became Eb3 to avoid a minor ninth under F5).
- Tilt 6.27 dB per octave, 0.23 inside the dark edge; loudness range 7.9 LU (was 9.7); 2 to 5 kHz is over -36 dBFS for 14.1 s (first soundtrack 12.9 s).
- The 'before' figures in this result are the judges' own (results.json, their output files) and the first report's: my first build overwrote the first version's audio before I ran their scripts on it. The 'after' figures are from their scripts, or my copies of their formulas, run on the revised files.
