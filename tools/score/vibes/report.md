# Candidate "vibes": upright bass, brushes and vibraphone

Nobody on this team can hear. Everything below is measured or seen in a picture; nothing here says how it sounds.

(Section numbers are the composer's.)

## 2. The idea in five lines

1. One four-note vibraphone voicing, C4 F#4 B4 E5, is the four gates: one note per gate.
2. The bass decides what it means: over A it is the home chord (Am6/9); over the wrong floor it is a NO.
3. The three HARD hits enclose the tonic: NO 1 lands a half step under home (G#1), NO 2 a half step over (Bb1), the slab on A1, reached through both wrong notes (G#1, Bb1, A1).
4. Idea 3: the bass roots climb a step per gate (D, E, F#, G#, A); each lift gets the next gate note, and the figure leading to it is one note longer each time.
5. The slab plays the chord of NO 1, complete, over the right floor.

Key: A minor. A1 = 55.0 Hz is the bass's open A string and inside the brief's 45 to 60 Hz thud window, so at the slab thud, bass and chord are one pitch; both neighbours are in the window too (G#1 51.9 Hz, Bb1 58.3 Hz), so each refusing NO has a thud tuned to its own wrong root; D2 and E2 (IV, V) are open strings. Not D minor, not the old score's C minor.

## 3. Instruments (chosen from the audition's numbers)

- Bass: MuseScore General 000-032 Acoustic Bass. The audition's shortlist: the same seven recordings as FluidR3, but a note takes 0.40 s to die after its note-off (FluidR3 0.12 s, cut off), lower floor, soft notes darker. Mono, centred. MIDI is sounding pitch (key 33 measures 55.0 Hz). Its zones step 2 to 3.5 dB: build.js measures the K-weighted level of all 19 pitches at six velocities and picks each note's velocity so the line is even.
- Vibraphone: FluidR3 GM 000-011. The same recordings as MuseScore's in mild stereo (correlation 0.64 to 0.88) with the faster attack (50 percent after 2.3 to 4.0 ms against 3.0 to 12.6 ms). Dark; velocity opens a filter. The F4/F#4 zone is 4 dB quiet (F#4 is a gate note): evened by the same measurement. What is really there: NO motor tremolo, a frozen loop from 0.12 to 0.42 s, 13 to 15 dB a second of decay, 20 dB down 0.15 s after a note-off. So: no pedal controller, long notes with written damping points, nothing fast, and voicings chosen so idea 3's ringing notes belong to every chord under them.
- Drums: FluidR3 GM 128-040 Brush: 38 tap, 39 slap, 40 swirl (a 0.6 s one-shot, restruck on every beat), 35/36 kick "Std Kick 7" (the darkest), 51 ride (59 for the skip notes), 44 pedal hat.
- Thuds: synth.thud at 51.9, 58.3, 55.0 Hz (sizes 1.0, 0.9, 1.3; rattle 0.3, 0.25, 0.12). Room tone: synth.roomTone.
- No instrument here has more than one recording per key. Variety is velocity, timing, length and alternating keys.

## 4. The chart (120 BPM, swing 0.64; bar n = 2(n-1) to 2n s; "&" = swung off-beat; "!" = HARD hit; "~" = ghost; "_" = long)

| Bar | Time s | Chord | Bass (sounding) | Vibraphone | Drums |
|---:|---|---|---|---|---|
| 1 | 0-2 | Am6/9 | out | C4 on 2, F#4 on 3, B4 on 4 (bays 1 to 3), ringing | out |
| 2 | 2-4 | Am6/9 | A1_ . E2 G#2 | E5 on 1 (bay 4); all damped at 3.9 s | swirl 1 2 3, tap 4 |
| 3 | 4-6 | Am6 / C13 | A2 B2 (G2~ on 2&) C3 Bb2 | stabs [C4 F#4 B4] 1&, [Bb3 E4 A4] 2& and 4, [A3 D#4 G#4] 4& | ride spang-a-lang, tap+hat 2 4, kick feathered |
| 4 | 6-8 | B13 / Bb13 | B2 F#2 (F#2~ on 2&) Bb1 A1 | [A3 D#4 G#4] 2, [Ab3 D4 G4] 2& and 4 | ride 1 2 2& 3 4, tap+hat 2 4, kick |
| 5 | 8-10 | G#7alt, then N.C. | G#1! short | [C4 F#4 B4]! damped | bass drum + slap!, thud 51.9 Hz; out |
| 6 | 10-12 | Bm7b5 / E7b9 | B1_ . E2 B2 | out | swirl each beat, tap 2 4 |
| 7 | 12-14 | Am9 | A2_ . E3_ (Eb3~ on 4&) | [G4 C5] 2, [B4 E5] 2& | swirl, tap+hat 2 4 |
| 8 | 14-16 | D13 | D3_ . A2 F#2 | C4 on 2 (COST passes: the nod), [E4 A4] 4 | as bar 7 |
| 9 | 16-18 | E9, Bb9b13 on 3, N.C. | E2 B1 Bb1! short | [G#3 D4] 1, [G#3 D4 F#4]! on 3 damped | swirl 1 2, tap 2, bass drum + slap! on 3, thud 58.3 Hz |
| 10-11 | 18-22 | N.C. | out | out | out (tails, then room tone) |
| 12 | 22-24 | D13 | D2 F#2 A2 F2 | C4 on 2 (PASS 1) | out |
| 13 | 24-26 | E9b13 | E2 G#2 D3 G2 | C4 1, F#4 on 2 (PASS 2), C4 4 | swirl 2 3 4 |
| 14 | 26-28 | F#m11b5 | F#2 C2 E2 G2 | F#4 1, B4 on 2 (PASS 3), C4 3, F#4 4 | swirl, tap 2 4 |
| 15 | 28-30 | E9b13/G# | G#2 E2 D2 G#2 | B4 1, E5 on 2 (PASS 4) | swirl, tap 2 4, ride 2 3 4 4& |
| 16 | 30-32 | Am6/9 | A2 E2 F#2 B2 | [C4 F#4 B4 E5] on 1, then nothing (text) | full: swirl, ride, tap, hat, kick |
| 17 | 32-34 | Cmaj7#11 | C3 G2 E2 C2 | G3 1; C4 F#4 B4 E5 on 3 3& 4 4& (the four title lines) | full |
| 18 | 34-36 | Bsus(b9) / E7alt | B1 D2 E2 G1 | [G#3 D4 G4] 3, [D4 G#4 C5] 4& | full |
| 19 | 36-38 | E7/G#, Bb13, Am6/9 | G#1 Bb1 A1!_ | [Ab3 G4 D5] 2, [C4 F#4 B4 E5]! on 3, ringing | ride 1, kick 1 2, tap 2, bass drum + slap! on 3, thud 55.0 Hz |
| 20 | 38-40 | D13 / E9b13 | D2_ E2_ | E5 1, B4 3 | swirl, tap 2 4 |
| 21 | 40-42 | F#m11b5 / E9b13/G# | F#2_ G#2_ | F#4 1, C4 3 | swirl, tap 2 |
| 22 | 42-44 | Am6/9 | A2_ then A1_ (open, left ringing) | [C4 F#4 B4 E5] on 1, last chord | one ride stroke, one swirl |
| 23 | 44-46 | Am6/9 | ringing | ringing | out |

Band out: 8.0 to 10.0 s after the hit, 17.0 to 22.0 s, and before 0.5 s. PASS layers: bass alone at 22.0; vibraphone 22.5; swirl 24.5; taps 26.5; ride 28.5; kick and hat 30.0.

Performance (seed 1957): bass 4.3 to 12.0 ms behind; ride 0.2 to 5.9 ms ahead; stabs sometimes 3 to 8 ms late; chords rolled 1 to 3 ms a note; walking notes end 12 to 34 ms before the next beat; the note before each hit lifts 0.2 s early. The three hits are not humanised: fixed written dynamics, each note started early by its measured onset.

## 5. Mix chain

- Bass: harmonics added (the low end under 260 Hz, folded, 150 to 900 Hz of it kept, mixed in until 27 percent of the energy is above 150 Hz; as recorded it is 11 percent); HP 38 Hz, +4 dB at 900 Hz, LP 3.6 kHz; compressor 3.5:1 (up to 8.0 dB, mean 1.7); limiter holding peaks 11 dB over its trio-passage RMS (up to 4.0 dB); centre; room send -26 dB.
- Vibraphone: HP 170 Hz, +2.5 dB at 1.7 kHz, LP 9 kHz; an added slow motor (3.3 Hz, plus and minus 1.2 dB, channels a quarter turn apart); limiter at 14.5 dB over RMS (up to 6.5 dB off the loudest strikes); pan -0.25; send -13 dB.
- Drums: kick HP 45 / LP 1.8 kHz, centre; brushes HP 200 Hz, -1.5 dB at 3.6 kHz, LP 8 kHz, pan +0.35; ride and hat HP 500 Hz, -3 dB shelf, LP 8 kHz at 48 dB an octave, pan +0.43; bus limiter at 17 dB over RMS (up to 7.9 dB); send -15 dB.
- Room: mix.room decay 0.75 s, damp 0.6, predelay 12 ms, one share per stem. Balance set in the build by measurement (30 to 36 s). Whole mix set to -16 LUFS before the master; room tone added so it lands at -68 after it; 5 ms in, 300 ms out; the band also eased out from 44.0 to 45.6 s.
- Master (kit): HP 30 Hz, high shelf +2.2 dB at 3 kHz, LP 10 kHz, compressor -18 dBFS 2:1 (up to 4.5 dB, mean 0.96), -16 LUFS, limiter at -2 dBTP (up to 4.7 dB; some reduction on 16.4 percent of the samples). The shelf is there because the tilt measured 7.30 and then 6.79 dB an octave without it.

## 6. Measurements (final build)

Kit self-checks: 14 of 14. Kit analysis: 24 of 24 measured targets.

| Target | Measured |
|---|---|
| Loudness -16.0 +/- 0.5 LUFS | -16.01 |
| True peak <= -2.0 dBTP | -2.05 (AAC copy: -1.9) |
| Loudness range 5 to 12 LU | 7.3 |
| Tilt 200 Hz to 8 kHz, falls 4.5 to 6.5 dB/oct | falls 6.20 |
| Above 8 kHz >= 30 dB under total | -35.3 dB |
| 2 to 5 kHz >= 14 dB under total | -17.0 dB |
| Keys re bass, 30 to 36 s (-3 to -10) | -6.0 dB |
| Drums re bass (-8 to -16) | -10.0 dB |
| Mono sum loses < 1.5 dB | 0.10 dB (worst band 0.62 dB) |
| Low end centred | correlation 0.999 |
| Bass stem above 150 Hz >= 25 percent | 32 percent |
| Below 50 Hz | -17.8 dB |
| Clicks / DC / clipping | 0 / -3.7e-6 / 0 samples |
| Held breath 20.3 to 22.0 s | -67.6 dBFS; quietest 100 ms -68.1 |
| Stage (L minus R) | bass +0.00, keys +3.26, drums -1.65 dB |
| Thuds | 51.9 / 58.3 / 55.0 Hz, start 1.42 to 1.43x higher, 100-200 Hz -7.8 to -8.5 dB, above 3 kHz -56.9 to -58.8 dB |
| HARD sync | NO 1 -2.2 ms, NO 2 -3.2 ms, slab -1.6 ms |
| Tail from 45.9 s / loop seam | -86.1 dBFS / 0 |
| Room decay | set to 0.75 s in the build; the kit says it cannot be measured from a mix |

My own checks (check-chart.js, all pass):

| Check | Result |
|---|---|
| Bass on beats 1 and 3 is a chord tone | 37 of 37 |
| Bass crosses each bar line by a step or half step | 15 of 18; 3 exceptions: bar 5 G#1 to bar 6 B1 (six beats of silence between; new phrase); bar 9 Bb1 to bar 12 D2 (the held breath between); bar 19 A1 to bar 20 D2 (the slab is an arrival; the tag starts on the open D) |
| No two bars with the same bass pitches | 19 bars, 0 repeats |
| Bass range as it measures | G1 to E3 (MIDI 31 to 52), inside E1 to G3 |
| Bass stem pitch under every charted note (autocorrelation) | 60 of 60 within 35 cents (worst 19.7) |
| Swing ratio of off-beat eighths as played | 21 off-beats, mean 0.640, 0.629 to 0.655 |
| No drum hit at the same velocity twice running | 0 repeats in 152 hits (56 velocities) |
| Notes a second | dock 2.8; idea 1 14.5; idea 2 7.2; idea 3: 2.0, 3.0, 5.5, 7.0, 8.7; winner 13.0; title 12.8; tag 3.4 |
| Momentary loudness, mean LUFS | dock -20.9; idea 1 -13.6; restart -18.4; idea 2 -16.4; PASS 1 to 4: -17.4, -16.4, -16.0, -15.0; winner -14.7; title -14.1; tag -18.7; last chord -22.0 |
| PASS top notes | C4 at 22.5 s, F#4 at 24.5, B4 at 26.5, E5 at 28.5 (each within 1.5 ms; figures of 1, 2, 3, 4 notes) |
| Band out after NO 1 (9.0 to 9.9 s) | band stems -70.3 dBFS, 55.3 dB under 6 to 8 s |
| Band out after NO 2 (18.5 to 19.9 s) | -134.2 dBFS, 115.7 dB under |
| Hits, stem by stem | fx -1.4 ms; bass -2.9 to -3.4; keys -1.1 to -2.2; drums -1.0 to -2.7 |
| Before 0.25 s | band stems -135 dBFS; final.wav -67.4 dBFS |
| Last chord, vibraphone stem per half second from 42.5 s | -32.3, -40.0, -48.0, -55.8, -66.9, -85.0 dBFS |

## 7. What I looked at

Seven builds. First build: the kit's checks passed but mine failed (drum stem clipped, bass 13 percent above 150 Hz, the three hits shared one velocity). Then, with the Read tool: whole-piece and 20-32 s spectrograms (second build), 0-12 s and 30-46 s (fourth build), 30-46 s and waveform.png (sixth build). Seen: nothing before 0.5 s but faint room tone; four separate rising notes at 0.5 to 2.0 s; idea 1 the densest block; a gap after each NO; the long empty stretch 17.5 to 22 s; idea 3 gaining brush stripes from 24.5 s, denser from 26.5 s, ride partials from 28.5 s; the tag as four decaying strikes and a smooth ring-down; no bright vertical lines. Also seen: faint arcs above 10 kHz at about -85 to -95 dBFS (I did not trace them), and the room tone ending at about 6.5 kHz (the kit's own low-pass). After the last change (thud +2 dB) I re-read numbers only, not pictures.

## 8. Listening guide

- At 0.5, 1.0, 1.5, 2.0 s you should hear four single vibraphone notes rising, one per bay, left ringing; the bass enters under the fourth.
- At 4 to 8 s: walking bass, ride, three-note vibraphone stabs on the off-beats sliding down by half steps. The busiest stretch.
- At 8.000 s: one hit (low thud, bass a half step under home, bass drum, brush slap, a damped stab), then nothing new until 10 s.
- At 10 to 12 s: only bass in two and brushes.
- At 12 to 17 s: lighter: bass higher and in two, brushes, two-note fourths; at 14.5 s one single vibraphone note (the same note that later marks PASS 1). At 17.000 s the second hit, a half step over home.
- At 18 to 22 s: tails, then only room tone.
- At 22.0 s the bass alone, walking; one more vibraphone note lands on each lift at 22.5, 24.5, 26.5, 28.5 s, each higher, while brush swirl, taps and ride join one at a time.
- At 30.0 s the four notes struck together over the bass's A, full trio; the vibraphone then stays out under the text.
- At 33.0 to 33.8 s the four notes as quick swung eighths (the title lines); at 36 and 36.5 s the bass plays the two earlier wrong notes, and at 37.000 s the slab: thud and bass on A with the full chord ringing for a second.
- At 38, 39, 40, 41 s the four notes come back down while the bass climbs; 42.0 s last chord; 43.0 s the low open A; gone by 45.9 s.

## 9. Known weaknesses, plainly

1. Nobody heard it. Everything above is measurement.
2. The vibraphone sample is static. The slow motor is an effect I added (MIX.motor.depthDb = 0 removes it). Whether it reads as an instrument or as an effect is unverified.
3. The vibraphone decays 13 to 15 dB a second: the last chord is 30 dB down after two seconds, so 44 to 46 s is mostly the low A and room tone, and the ending is helped by a mix fade (44.0 to 45.6 s).
4. The bass's low notes are recordings played far below pitch. The added harmonics meet the small-speaker target; whether they read as string or as processing is unverified.
5. Peak control is heavy: stem limiters take up to 6.5 dB (vibraphone) and 7.9 dB (drums) off the loudest strikes, then the master takes up to 4.5 and 4.7 dB. The mix was peakier than -16 LUFS under -2 dBTP allows.
6. The three NO hits are not louder than the band around them (momentary maximum -14.6, -15.1, -14.1 LUFS against idea 1's -12.4). Their weight is the thud and the stop. If they must be bigger: MIX.thudOverBass, or lower LEVEL for bars 3 and 4 in chart.js.
7. The tilt (6.20) is at the dark end of the window, 0.3 from the limit, and needed a +2.2 dB master shelf.
8. One recording per key everywhere; the brush swirl is a pulse on each beat, not a continuous sweep; the ride has one stroke (a second recording on the skip notes).
9. The bass speaks slowly (50 percent point 8 to 28 ms per the audition) and is also placed 4 to 12 ms behind: it may read as dragging, most on F#2 to Bb2.
10. From 25.5 to 28.5 s the PASS figures run as an unbroken stream of quarter notes; the four lifts may be heard as one long arpeggio rather than four separate figures.
11. Hits measure 1.6 to 3.2 ms early (every sample is started early by its 10 percent onset). Inside the 10 ms.
12. Drums sit only 1.65 dB right (kick centred).
