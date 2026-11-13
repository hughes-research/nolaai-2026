/*
 * tools/score/sampled-piano/chart.js: THE CHART, as data. Written before any code that plays it.
 *
 * D minor, 120 BPM, 4/4, 23 bars of 2 s. Bars and beats count from 1.
 * A beat written x.5 is the swung "and" (it is placed at SWING of the beat).
 * Pitches are MIDI numbers as they sound (the bass preset is checked to sound at
 * pitch: 38 = D2 = 73.4 Hz).
 *
 * The harmony tells the story:
 *   - THE BREAK: each time a door lets go (0.375 s before it lands) the band cuts off and holds its breath while
 *     it falls; the hit lands out of that silence. The picture's own rhythm, played.
 *   - each NO is a cadence that is refused: NO 1 stops on the dominant (A7b9),
 *     NO 2 stops on the flat-two dominant (Eb7). The band stops dead on both.
 *   - the slab is the same Eb7 that was refused at 17 s, and this time it falls a
 *     half step to the home chord. The tag lets the other refused chord (A7b9)
 *     resolve too.
 *   - idea 1 (hype) struts off toward the relative major with a chord every two
 *     beats; idea 2 (easy) is a light dorian sway with the bass in two; idea 3
 *     (boring) is the plain i iv ii V walked in four, and it is the one that arrives.
 *   - the four bay notes (0.5, 1.0, 1.5, 2.0 s) are the bass alone: D F A D.
 *     Idea 3 opens with the same D F A on the bass alone.
 *   - the piano marks each PASS with one three-step rising cell (beat 2, the
 *     swung "and", beat 3), a voice thicker and a step higher each time.
 *   - from the sleeve (32 s) to the last chord (40 s) the piano's top note walks
 *     up one octave of D harmonic minor: D E F G A (the slab) A Bb C# D.
 */
'use strict';

const SWING = 0.635;          // the off-beat eighth sits at 63.5 percent of the beat (the brief asks for 62 to 66)

/* One string per bar, for arrangement.json. */
const CHORDS = [
  'Dm9',                      //  1   0- 2  the floor line, bays 1 to 3
  'Dm9',                      //  2   2- 4  bay 4, the kicker
  'Gm7 | C13',                //  3   4- 6  idea 1 struts in
  'F6/9 | Bb13',              //  4   6- 8  the block enters; the shutter lets go
  'A7b9 (hit, stop)',         //  5   8-10  NO 1
  'Gm7 | A7',                 //  6  10-12  the bass alone, in two
  'Dm7',                      //  7  12-14  idea 2, two-feel
  'G13',                      //  8  14-16  COST passes: the small nod
  'Em7b5 | Eb7 (hit, stop)',  //  9  16-18  NO 2 on beat 3
  '(stop)',                   // 10  18-20
  '(breath)',                 // 11  20-22
  'Dm',                       // 12  22-24  idea 3: the bass alone; PASS 1
  'Gm7',                      // 13  24-26  PASS 2
  'Em7b5',                    // 14  26-28  PASS 3
  'A7b9',                     // 15  28-30  PASS 4
  'Dm9',                      // 16  30-32  the winner
  'Gm9',                      // 17  32-34  the sleeve; the title lines
  'Em7b5 | A7b9',             // 18  34-36
  'Eb9#11 | Dm6/9 (the slab)',// 19  36-38  the slab on beat 3
  'Em11b5 | A7b9',            // 20  38-40  the tag
  'Dm6/9',                    // 21  40-42  the last chord
  'Dm6/9 (ringing)',          // 22  42-44
  'Dm6/9 (ring-out)'          // 23  44-46
];

/* The chord tones the bass may stand on at beats 1 and 3, as pitch classes (C = 0).
 * [from beat, to beat (exclusive), name, pitch classes]. Root, third, fifth, and the
 * sixth or seventh the chord symbol names. */
const D = 2, Eb = 3, E = 4, F = 5, Fs = 6, G = 7, Ab = 8, A = 9, Bb = 10, B = 11, C = 0, Cs = 1;
const HARMONY = {
  1: [[1, 5, 'Dm9', [D, F, A, C]]],
  2: [[1, 5, 'Dm9', [D, F, A, C]]],
  3: [[1, 3, 'Gm7', [G, Bb, D, F]], [3, 5, 'C13', [C, E, G, Bb, A]]],
  4: [[1, 3, 'F6/9', [F, A, C, D]], [3, 5, 'Bb13', [Bb, D, F, Ab, G]]],
  5: [[1, 5, 'A7b9', [A, Cs, E, G]]],
  6: [[1, 3, 'Gm7', [G, Bb, D, F]], [3, 5, 'A7', [A, Cs, E, G]]],
  7: [[1, 5, 'Dm7', [D, F, A, C]]],
  8: [[1, 5, 'G13', [G, B, D, F, E]]],
  9: [[1, 3, 'Em7b5', [E, G, Bb, D]], [3, 5, 'Eb7', [Eb, G, Bb, Cs]]],
  12: [[1, 5, 'Dm', [D, F, A]]],
  13: [[1, 5, 'Gm7', [G, Bb, D, F]]],
  14: [[1, 5, 'Em7b5', [E, G, Bb, D]]],
  15: [[1, 5, 'A7b9', [A, Cs, E, G]]],
  16: [[1, 5, 'Dm9', [D, F, A, C]]],
  17: [[1, 5, 'Gm9', [G, Bb, D, F]]],
  18: [[1, 3, 'Em7b5', [E, G, Bb, D]], [3, 5, 'A7b9', [A, Cs, E, G]]],
  19: [[1, 3, 'Eb9#11', [Eb, G, Bb, Cs]], [3, 5, 'Dm6/9', [D, F, A, B]]],
  20: [[1, 3, 'Em11b5', [E, G, Bb, D]], [3, 5, 'A7b9', [A, Cs, E, G]]],
  21: [[1, 5, 'Dm6/9', [D, F, A, B]]]
};

/* THE BASS, bar by bar: [beat, midi, length in beats, accent, flag].
 * accent: where the player leans in that bar (1 = the bar's strongest note).
 * flags: 'hit' = a HARD sync hit (exact, short, damped); 'slab' = the HARD hit that rings;
 *        'ghost' = a dead note (short, soft); 'ring' = let it ring to the end. */
const BASS = {
  1: [[2, 38, 1, 0.88], [3, 41, 1, 0.84], [4, 45, 1, 0.92]],                              // D2 F2 A2: one note a bay
  2: [[1, 50, 1, 1.00], [2, 48, 1, 0.80], [3, 45, 1, 0.86], [4, 42, 1, 0.82]],            // D3 (the fourth bay) C3 A2 F#2
  3: [[1, 43, 1, 1.00], [2, 50, 1, 0.86], [2.5, 50, 0.3, 0.40, 'ghost'], [3, 48, 1, 0.94], [4, 52, 1, 0.90], [4.5, 52, 0.3, 0.42, 'ghost']],   // G2 D3 C3 E3: struts upward, with dead-note skips (showing off)
  4: [[1, 53, 1, 1.00], [1.5, 53, 0.3, 0.40, 'ghost'], [2, 50, 1, 0.84], [2.5, 50, 0.3, 0.42, 'ghost'], [3, 46, 1, 0.94], [4, 34, 0.25, 0.98]],   // F3 D3 Bb2 Bb1: the top of the range, then the octave drop; Bb1 is cut short as the shutter lets go (the break)
  5: [[1, 33, 0.4, 1.00, 'hit']],                                                          // A1: NO 1
  6: [[1, 43, 2, 0.80], [3, 45, 1, 0.74], [4, 49, 1, 0.78]],                              // G2 (two beats) A2 C#3: alone, in two
  7: [[1, 50, 2, 0.90], [3, 45, 1.5, 0.80], [4.5, 41, 0.5, 0.62]],                        // D3, A2, F2 on 4&: two-feel
  8: [[1, 43, 2, 0.88], [3, 47, 1.5, 0.84], [4.5, 41, 0.5, 0.64]],                        // G2, B2, F2 on 4&
  9: [[1, 40, 1, 0.90], [2, 38, 0.25, 0.86], [3, 39, 0.4, 1.00, 'hit']],                  // E2 D2 enclose Eb2: NO 2 (D2 cut short: the break)
  12: [[1, 38, 1, 0.86], [2, 41, 1, 0.78], [3, 45, 1, 0.84], [4, 44, 1, 0.76]],           // D2 F2 A2 Ab2: the bay notes again
  13: [[1, 43, 1, 0.88], [2, 46, 1, 0.78], [3, 50, 1, 0.86], [4, 51, 1, 0.80]],           // G2 Bb2 D3 Eb3
  14: [[1, 52, 1, 0.92], [2, 50, 1, 0.80], [3, 46, 1, 0.86], [4, 44, 1, 0.82]],           // E3 D3 Bb2 G#2
  15: [[1, 45, 1, 0.90], [2, 43, 1, 0.82], [3, 40, 1, 0.90], [4, 37, 1, 0.86]],           // A2 G2 E2 C#2
  16: [[1, 38, 1, 1.00], [2, 40, 1, 0.80], [3, 41, 1, 0.86], [4, 45, 1, 0.80], [4.5, 45, 0.3, 0.40, 'ghost']],  // D2 E2 F2 A2
  17: [[1, 43, 1, 0.94], [2, 41, 1, 0.84], [3, 38, 1, 0.90], [4, 39, 1, 0.86]],           // G2 F2 D2 Eb2
  18: [[1, 40, 1, 0.94], [2, 46, 1, 0.88], [3, 49, 1, 0.94], [4, 52, 1, 0.96]],           // E2 Bb2 C#3 E3: a rising diminished arpeggio
  19: [[1, 51, 1, 0.98], [2, 39, 0.25, 0.98], [3, 38, 2, 1.00, 'slab']],                  // Eb3, Eb2 (the octave drop again, cut short: the break), D2 on the slab
  20: [[1, 40, 2, 0.74], [3, 33, 2, 0.78]],                                               // E2, A1: the tag, in two
  21: [[1, 38, 8.6, 0.84, 'ring']]                                                        // D2, left to ring; the hand comes off at 44.3 s
};

/* Bars whose last note does not step into the next bar's first note, and why. */
const APPROACH_EXCEPTIONS = {
  1: 'A2 up a fourth to D3: the four bay notes are one rising arpeggio (D F A D), a note a gate',
  5: 'stop-time: two seconds of silence follow the hit',
  9: 'stop-time and the held breath follow the hit',
  20: 'A1 up a fourth to D2: the last cadence, dominant root to tonic'
};

/* THE PIANO: every event. [bar, beat, notes bottom to top, held (beats), velocity, roll (s per note), what].
 * 'sync' names a picture time that the event must sit on (taken from the film's timeline in build.js). */
const PIANO = [
  { bar: 2, beat: 2, notes: [53, 60, 64], hold: 1.8, vel: 0.40, roll: 0.012, what: 'the kicker: one soft Dm9' },
  // idea 1: the voicings sit higher and brighter than anywhere else, a push on every chord
  { bar: 3, beat: 1, notes: [58, 62, 65, 69], hold: 0.45, vel: 0.62, roll: 0.004, what: 'idea 1: Gm9 stab' },
  { bar: 3, beat: 2.5, notes: [58, 62, 64, 69], hold: 0.9, vel: 0.54, roll: 0, what: 'C13, pushed (the second title line)' },
  { bar: 3, beat: 4, notes: [58, 62, 64, 69], hold: 0.22, vel: 0.44, roll: 0, what: 'a C13 jab (busy: too pleased with itself)' },
  { bar: 3, beat: 4.5, notes: [57, 62, 67, 72], hold: 0.9, vel: 0.60, roll: 0.004, what: 'F6/9, pushed into the block' },
  { bar: 4, beat: 2, notes: [57, 62, 67, 72], hold: 0.25, vel: 0.46, roll: 0, what: 'a short jab as the block arrives' },
  { bar: 4, beat: 2.5, notes: [56, 62, 67, 72], hold: 1.0, vel: 0.58, roll: 0, what: 'Bb13, pushed' },
  { bar: 4, beat: 4, notes: [56, 62, 67, 72], hold: 0.2, vel: 0.50, roll: 0, what: 'one last cocky Bb13 jab as the shutter lets go' },
  { bar: 5, beat: 1, notes: [49, 55, 58, 65], hold: 0.34, vel: 0.62, roll: 0, sync: 'no1', what: 'NO 1: A7b9, short' },
  // idea 2: thin
  { bar: 7, beat: 2, notes: [60, 64, 69], hold: 0.6, vel: 0.46, roll: 0.006, what: 'idea 2: a thin Dm9' },
  { bar: 8, beat: 2, notes: [69], hold: 0.6, vel: 0.40, roll: 0, sync: 'nod', what: 'the small nod (COST passes): A4' },
  { bar: 8, beat: 2.5, notes: [71], hold: 1.1, vel: 0.44, roll: 0, what: 'and B4: two notes of the PASS cell, unfinished' },
  { bar: 9, beat: 1, notes: [58, 62, 67], hold: 0.7, vel: 0.42, roll: 0, what: 'a thin Em7b5' },
  { bar: 9, beat: 3, notes: [55, 61, 65], hold: 0.34, vel: 0.60, roll: 0, sync: 'no2', what: 'NO 2: Eb7, short' },
  // idea 3: the PASS cell, a voice thicker and a step higher each time
  { bar: 12, beat: 2, notes: [65], hold: 0.62, vel: 0.44, roll: 0, sync: 'pass1', pass: 1, what: 'PASS 1: F4' },
  { bar: 12, beat: 2.5, notes: [67], hold: 0.36, vel: 0.42, roll: 0, pass: 1, what: 'G4' },
  { bar: 12, beat: 3, notes: [69], hold: 1.7, vel: 0.50, roll: 0, pass: 1, top: true, what: 'A4' },
  { bar: 13, beat: 2, notes: [62, 67], hold: 0.62, vel: 0.46, roll: 0, sync: 'pass2', pass: 2, what: 'PASS 2: D4 G4' },
  { bar: 13, beat: 2.5, notes: [64, 69], hold: 0.36, vel: 0.44, roll: 0, pass: 2, what: 'E4 A4' },
  { bar: 13, beat: 3, notes: [65, 70], hold: 1.7, vel: 0.52, roll: 0, pass: 2, top: true, what: 'F4 Bb4' },
  { bar: 14, beat: 2, notes: [64, 67, 70], hold: 0.62, vel: 0.48, roll: 0, sync: 'pass3', pass: 3, what: 'PASS 3: E4 G4 Bb4' },
  { bar: 14, beat: 2.5, notes: [65, 69, 72], hold: 0.36, vel: 0.46, roll: 0, pass: 3, what: 'F4 A4 C5' },
  { bar: 14, beat: 3, notes: [67, 70, 74], hold: 1.7, vel: 0.54, roll: 0, pass: 3, top: true, what: 'G4 Bb4 D5' },
  { bar: 15, beat: 2, notes: [64, 67, 70, 73], hold: 0.62, vel: 0.50, roll: 0, sync: 'pass4', pass: 4, what: 'PASS 4: E4 G4 Bb4 C#5' },
  { bar: 15, beat: 2.5, notes: [66, 69, 72, 75], hold: 0.36, vel: 0.48, roll: 0, pass: 4, what: 'F#4 A4 C5 Eb5' },
  { bar: 15, beat: 3, notes: [67, 70, 73, 76], hold: 1.7, vel: 0.56, roll: 0, pass: 4, top: true, what: 'G4 Bb4 C#5 E5' },
  { bar: 16, beat: 1, notes: [53, 60, 64, 69, 74, 77], hold: 3.7, vel: 0.60, roll: 0.024, sync: 'winner', top: true, what: 'the winner: Dm9, rolled, left to ring under the text' },
  // the title: the top note climbs D E F G A
  { bar: 17, beat: 1, notes: [53, 57, 58, 62], hold: 0.7, vel: 0.50, roll: 0.004, sync: 'sleeve', what: 'the sleeve: Gm9 (top D4)' },
  { bar: 17, beat: 4.5, notes: [55, 58, 62, 64], hold: 0.9, vel: 0.50, roll: 0, what: 'Em7b5, pushed (top E4)' },
  { bar: 18, beat: 3, notes: [55, 58, 61, 65], hold: 0.9, vel: 0.56, roll: 0, what: 'A7b9 on the speaker\'s name (top F4)' },
  { bar: 19, beat: 1, notes: [57, 61, 65, 67], hold: 1.2, vel: 0.62, roll: 0.004, what: 'Eb9#11 (top G4)' },
  { bar: 19, beat: 3, notes: [53, 57, 59, 64, 69], hold: 1.92, vel: 0.68, roll: 0, sync: 'slab', what: 'THE SLAB: Dm6/9, home (top A4), held until the tag' },
  // the tag: A Bb C# D on top, in plain quarters
  { bar: 20, beat: 1, notes: [55, 58, 62, 69], hold: 1.8, vel: 0.44, roll: 0.010, sync: 'positive', what: 'the tag: Em11b5 (top A4)' },
  { bar: 20, beat: 3, notes: [55, 61, 65, 70], hold: 1.9, vel: 0.46, roll: 0.008, what: 'A7b9 (top Bb4), held under the next note' },
  { bar: 20, beat: 4, notes: [73], hold: 0.96, vel: 0.44, roll: 0, what: 'C#5 alone' },
  { bar: 21, beat: 1, notes: [53, 57, 59, 64, 69, 74], hold: 9.8, vel: 0.56, roll: 0.055, last: true, what: 'the last chord: Dm6/9 (top D5), rolled slowly, left to ring' }
];

/* THE DRUMS, bar by bar. Each entry: what the kit plays in that bar.
 *   swirl: level 0..1 of the brush circling on the snare (from, to in beats; default the whole bar)
 *   taps:  [beat, level] brush taps on the snare      ride: [beat, level]
 *   hat:   [beat, level] the hi-hat foot              kick: [beat, level] feathered bass drum
 *   hit:   a HARD hit (bass drum and brush slap, exact)
 * The spang-a-lang is 1, 2, 2&, 3, 4, 4& with the weight on 2 and 4. */
const RIDE = [[1, 0.52], [2, 0.66], [2.5, 0.34], [3, 0.54], [4, 0.68], [4.5, 0.36]];
const DRUMS = {
  2: { swirl: [1, 5, 0.55], taps: [[2, 0.30], [4, 0.36], [4.5, 0.20]] },                 // brushes come in under the kicker
  3: { swirl: [1, 5, 0.85], taps: [[2, 0.46], [2.5, 0.22], [4, 0.50]], ride: RIDE.map(([b, v]) => [b, v * 1.08]).concat([[1.5, 0.30], [3.5, 0.32]]), hat: [[2, 0.5], [4, 0.52]], kick: [[1, 0.34], [2, 0.26], [3, 0.32], [4, 0.26]] },
  4: { swirl: [1, 4.3, 0.95], taps: [[2, 0.50], [3.5, 0.24], [4, 0.54]], ride: [[1, 0.58], [1.5, 0.32], [2, 0.72], [2.5, 0.38], [3, 0.62], [3.5, 0.34], [4, 0.74]], hat: [[2, 0.52], [4, 0.56]], kick: [[1, 0.36], [2, 0.28], [3, 0.34], [4, 0.30]] },
  5: { hit: 'no1' },
  7: { swirl: [1, 5, 0.60], taps: [[2, 0.30], [4, 0.34]] },
  8: { swirl: [1, 5, 0.62], taps: [[2, 0.32], [4, 0.36], [4.5, 0.18]] },
  9: { swirl: [1, 2.3, 0.66], taps: [[2, 0.38]], hit: 'no2' },
  13: { swirl: [2, 5, 0.50], taps: [[2, 0.32], [4, 0.34]] },                              // PASS 2: the brushes join on the lift
  14: { swirl: [1, 5, 0.58], taps: [[2, 0.34], [4, 0.38]], ride: [[2, 0.56], [2.5, 0.28], [3, 0.46], [4, 0.58], [4.5, 0.30]] },   // PASS 3: the ride joins on the lift
  15: { swirl: [1, 5, 0.64], taps: [[2, 0.38], [4, 0.42]], ride: RIDE.map(([b, v]) => [b, v * 0.94]), hat: [[2, 0.46], [4, 0.48]], kick: [[2, 0.24], [3, 0.28], [4, 0.24]] },   // PASS 4: hi-hat foot and bass drum join on the lift
  16: { swirl: [1, 5, 0.66], taps: [[2, 0.36], [4, 0.40]], ride: RIDE.map(([b, v]) => [b, v * 0.92]), hat: [[2, 0.44], [4, 0.46]], kick: [[1, 0.32], [3, 0.26]] },
  17: { swirl: [1, 5, 0.72], taps: [[2, 0.40], [3, 0.26, 'title'], [3.5, 0.30, 'title'], [4, 0.36, 'title'], [4.5, 0.42, 'title']], ride: RIDE.map(([b, v]) => [b, v * 1.0]), hat: [[2, 0.48], [4, 0.5]], kick: [[1, 0.32], [3, 0.28]] },
  18: { swirl: [1, 5, 0.82], taps: [[2, 0.46], [4, 0.52], [4.5, 0.30]], ride: RIDE.map(([b, v]) => [b, v * 1.1]), hat: [[2, 0.52], [4, 0.54]], kick: [[1, 0.34], [2, 0.26], [3, 0.32], [4, 0.28]] },
  19: { swirl: [1, 2.25, 1.0], roll: [1, 2.25], hat: [[2, 0.54]], kick: [[1, 0.36], [2, 0.3]], hit: 'slab' },   // both hands on the snare: a brush roll swells to the slab (no ride until the slab itself)
  20: { swirl: [1, 5, 0.40], ride: [[1, 0.40], [2, 0.36], [3, 0.33], [4, 0.29]] },        // the tag: the ride on each beat, fading
  21: { ride: [[1, 0.34]] }                                                               // one soft cymbal note under the last chord
};

/* Who is in, section by section (for the notes-per-second check and the report). */
const SECTIONS = [
  { name: 'the dock stands up', from: 0, to: 4 },
  { name: 'idea 1 (hype)', from: 4, to: 8 },
  { name: 'stop-time after NO 1', from: 8, to: 10 },
  { name: 'restart: bass alone', from: 10, to: 12 },
  { name: 'idea 2 (easy)', from: 12, to: 17 },
  { name: 'stop-time and the breath', from: 17, to: 22 },
  { name: 'idea 3, PASS 1 (bass, piano)', from: 22, to: 24 },
  { name: 'idea 3, PASS 2 (+ brushes)', from: 24, to: 26 },
  { name: 'idea 3, PASS 3 (+ ride)', from: 26, to: 28 },
  { name: 'idea 3, PASS 4 (+ hi-hat, bass drum)', from: 28, to: 30 },
  { name: 'the winner', from: 30, to: 32 },
  { name: 'the title builds', from: 32, to: 37 },
  { name: 'the slab and the tag', from: 37, to: 40 },
  { name: 'the last chord rings', from: 40, to: 46 }
];

/* The low drum under each HARD hit: Hz of the fundamental (45 to 60), size, rattle. */
const THUDS = {
  no1: { hz: 55, size: 1.0, rattle: 0.3, body: 1.5, seed: 8 },        // A1: the root of A7b9
  no2: { hz: 49, size: 1.25, rattle: 0.3, body: 1.5, seed: 17 },      // G1: the third of Eb7, a size heavier
  slab: { hz: 55, size: 0.9, rattle: 0, body: 1.5, seed: 37 }         // A1 under D2: the fifth of the home chord; no rattle, it resolves
  // body 1.5: more of the thud's 2nd and 3rd partials (110 and 165 Hz at 55), so it carries on small speakers without a higher peak
};

module.exports = { SWING, CHORDS, HARMONY, BASS, APPROACH_EXCEPTIONS, PIANO, DRUMS, RIDE, SECTIONS, THUDS };
