/*
 * tools/score/vibes/chart.js: THE CHART, as data. Written before the build.
 *
 * Candidate "vibes": upright bass, brushes, vibraphone. A minor, 120 BPM, swing 0.64.
 *
 * Everything here is in musical time: bar (1..23) and beat (1..4.99). A beat
 * ending in .5 is the swung off-beat; the build turns bars and beats into
 * seconds with the kit's timeline (video/score.js), so no picture time is
 * typed in here. Pitches are sounding pitches (A1 = 55 Hz, C4 = middle C).
 *
 * The idea: one four-note vibraphone voicing, C4 F#4 B4 E5, is the four gates
 * (COST, RETURN, EFFORT, POTENTIAL). The bass decides what it means: over A it
 * is home (Am6/9); over the wrong floor it is a NO.
 */
'use strict';

const KEY = 'A minor';
const BPM = 120;
const SWING = 0.64;
const BARS = 23;

/* ------------------------------------------------------------ pitch names */
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
function midiOf(name) {                      // 'A1' -> 33, 'C4' -> 60
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m || PC[m[1]] === undefined) { throw new Error('chart: not a pitch name: ' + name); }
  return 12 * (Number(m[2]) + 1) + PC[m[1]];
}
function nameOf(midi) { return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
function pcOf(name) {
  const m = /^([A-G][#b]?)/.exec(name);
  if (!m || PC[m[1]] === undefined) { throw new Error('chart: not a pitch class: ' + name); }
  return PC[m[1]];
}

/* ------------------------------------------------------------ the gates */
const GATES = ['C4', 'F#4', 'B4', 'E5'];     // COST, RETURN, EFFORT, POTENTIAL: together, over A, the home chord
const HOME = GATES;                          // Am6/9 without its root: b3, 6, 9, 5

/* ------------------------------------------------------------ the harmony
 * One entry a bar: four chord symbols, one a beat. 'N.C.' is no chord (the band is out). */
const CHORDS = [
  /*  1 */ ['Am6/9', 'Am6/9', 'Am6/9', 'Am6/9'],          // the vibraphone alone: the gates stand up
  /*  2 */ ['Am6/9', 'Am6/9', 'Am6/9', 'Am6/9'],
  /*  3 */ ['Am6', 'Am6', 'C13', 'C13'],                  // idea 1: the swagger
  /*  4 */ ['B13', 'B13', 'Bb13', 'Bb13'],
  /*  5 */ ['G#7alt', 'N.C.', 'N.C.', 'N.C.'],            // NO 1: the home voicing over a floor a half step too low
  /*  6 */ ['Bm7b5', 'Bm7b5', 'E7b9', 'E7b9'],            // restart thin
  /*  7 */ ['Am9', 'Am9', 'Am9', 'Am9'],                  // idea 2: breezy, in two
  /*  8 */ ['D13', 'D13', 'D13', 'D13'],                  // COST passes: the nod
  /*  9 */ ['E9', 'E9', 'Bb9b13', 'N.C.'],                // NO 2: the RETURN chord over its tritone substitute's root
  /* 10 */ ['N.C.', 'N.C.', 'N.C.', 'N.C.'],
  /* 11 */ ['N.C.', 'N.C.', 'N.C.', 'N.C.'],              // the held breath
  /* 12 */ ['D13', 'D13', 'D13', 'D13'],                  // idea 3: the roots climb a step a gate: D
  /* 13 */ ['E9b13', 'E9b13', 'E9b13', 'E9b13'],          //   E
  /* 14 */ ['F#m11b5', 'F#m11b5', 'F#m11b5', 'F#m11b5'],  //   F#
  /* 15 */ ['E9b13/G#', 'E9b13/G#', 'E9b13/G#', 'E9b13/G#'],   // G#
  /* 16 */ ['Am6/9', 'Am6/9', 'Am6/9', 'Am6/9'],          // the winner: A
  /* 17 */ ['Cmaj7#11', 'Cmaj7#11', 'Cmaj7#11', 'Cmaj7#11'],   // the title: the same four notes, brighter
  /* 18 */ ['Bsus(b9)', 'Bsus(b9)', 'E7alt', 'E7alt'],
  /* 19 */ ['E7/G#', 'Bb13', 'Am6/9', 'Am6/9'],           // both wrong floors, then the slab: home
  /* 20 */ ['D13', 'D13', 'E9b13', 'E9b13'],              // the tag, in two: the four gates once more, unhurried
  /* 21 */ ['F#m11b5', 'F#m11b5', 'E9b13/G#', 'E9b13/G#'],
  /* 22 */ ['Am6/9', 'Am6/9', 'Am6/9', 'Am6/9'],          // the last chord
  /* 23 */ ['Am6/9', 'Am6/9', 'Am6/9', 'Am6/9']
];

/* What each symbol means: its chord tones (what the bass may land on at beats 1 and 3)
 * and the colours a comping instrument may add. */
const CHORD = {
  'Am6/9':    { tones: ['A', 'C', 'E', 'F#'], colours: ['B'] },
  'Am6':      { tones: ['A', 'C', 'E', 'F#'], colours: ['B'] },
  'Am9':      { tones: ['A', 'C', 'E', 'G'], colours: ['B'] },
  'C13':      { tones: ['C', 'E', 'G', 'Bb'], colours: ['A', 'D'] },
  'B13':      { tones: ['B', 'D#', 'F#', 'A'], colours: ['G#', 'C#'] },
  'Bb13':     { tones: ['Bb', 'D', 'F', 'Ab'], colours: ['G', 'C'] },
  'G#7alt':   { tones: ['G#', 'C', 'F#'], colours: ['B', 'E', 'A', 'D'] },
  'Bm7b5':    { tones: ['B', 'D', 'F', 'A'], colours: ['E'] },
  'E7b9':     { tones: ['E', 'G#', 'B', 'D'], colours: ['F'] },
  'D13':      { tones: ['D', 'F#', 'A', 'C'], colours: ['B', 'E'] },
  'E9':       { tones: ['E', 'G#', 'B', 'D'], colours: ['F#'] },
  'Bb9b13':   { tones: ['Bb', 'D', 'Ab'], colours: ['C', 'F#'] },
  'E9b13':    { tones: ['E', 'G#', 'B', 'D'], colours: ['F#', 'C'] },
  'F#m11b5':  { tones: ['F#', 'A', 'C', 'E'], colours: ['B'] },
  'E9b13/G#': { tones: ['E', 'G#', 'B', 'D'], colours: ['F#', 'C'] },
  'Cmaj7#11': { tones: ['C', 'E', 'G', 'B'], colours: ['F#', 'D', 'A'] },
  'Bsus(b9)': { tones: ['B', 'E', 'F#', 'A'], colours: ['C'] },
  'E7alt':    { tones: ['E', 'G#', 'D'], colours: ['G', 'C', 'F', 'Bb'] },
  'E7/G#':    { tones: ['E', 'G#', 'B', 'D'], colours: ['C', 'F#'] },
  'N.C.':     { tones: [], colours: [] }
};

/* The bar's chords as one string (for arrangement.json and the report). */
function chordString(barNo) {
  const c = CHORDS[barNo - 1];
  if (c.every((x) => x === c[0])) { return c[0]; }
  if (c[0] === c[1] && c[2] === c[3]) { return c[0] + ' | ' + c[2]; }
  return c.join(' ');
}

/* ------------------------------------------------------------ dynamics
 * One level a bar, 0..1, shared by the band; each part scales it. */
const LEVEL = [
  /*  1 */ 0.50, /*  2 */ 0.52, /*  3 */ 0.80, /*  4 */ 0.85, /*  5 */ 0.95, /*  6 */ 0.52,
  /*  7 */ 0.64, /*  8 */ 0.66, /*  9 */ 0.70, /* 10 */ 0, /* 11 */ 0,
  /* 12 */ 0.54, /* 13 */ 0.58, /* 14 */ 0.66, /* 15 */ 0.72, /* 16 */ 0.78,
  /* 17 */ 0.80, /* 18 */ 0.86, /* 19 */ 0.92, /* 20 */ 0.60, /* 21 */ 0.56, /* 22 */ 0.52, /* 23 */ 0
];

/* ------------------------------------------------------------ the bass
 * [bar, beat, pitch, length in beats, accent, kind]
 * accent: added to the bar's level (the bass leans on different beats in different bars).
 * kind: 'walk' (nearly legato), 'long' (a two-feel note, let ring), 'skip' (a ghosted off-beat),
 *       'hit' (a HARD sync hit: not humanised, started early by its measured onset), 'ring' (left to ring out). */
const BASS = [
  /* bar 2: enters under the fourth gate note, then walks up to the swagger */
  [2, 1, 'A1', 2.0, 0.00, 'long'], [2, 3, 'E2', 1, -0.04, 'walk'], [2, 4, 'G#2', 1, 0.06, 'walk'],
  /* bars 3-4: idea 1. Too pleased with itself: it passes straight through the tonic on beat 4 ... */
  [3, 1, 'A2', 1, 0.08, 'walk'], [3, 2, 'B2', 1, 0.00, 'walk'], [3, 2.5, 'G2', 0.3, -0.30, 'skip'], [3, 3, 'C3', 1, 0.06, 'walk'], [3, 4, 'Bb2', 1, 0.02, 'walk'],
  [4, 1, 'B2', 1, 0.04, 'walk'], [4, 2, 'F#2', 1, 0.08, 'walk'], [4, 2.5, 'F#2', 0.3, -0.30, 'skip'], [4, 3, 'Bb1', 1, 0.06, 'walk'], [4, 4, 'A1', 1, 0.10, 'walk'],
  /* bar 5: ... and lands a half step under it. NO 1 */
  [5, 1, 'G#1', 0.7, 0.00, 'hit'],
  /* bar 6: restart thin, in two */
  [6, 1, 'B1', 1.9, 0.02, 'long'], [6, 3, 'E2', 1, 0.00, 'walk'], [6, 4, 'B2', 1, 0.04, 'walk'],
  /* bars 7-9: idea 2, a two-feel high on the instrument */
  [7, 1, 'A2', 1.8, 0.04, 'long'], [7, 3, 'E3', 1.5, 0.00, 'long'], [7, 4.5, 'Eb3', 0.32, -0.16, 'skip'],
  [8, 1, 'D3', 1.9, 0.04, 'long'], [8, 3, 'A2', 1, -0.02, 'walk'], [8, 4, 'F#2', 1, 0.04, 'walk'],
  [9, 1, 'E2', 1, 0.04, 'walk'], [9, 2, 'B1', 1, 0.08, 'walk'], [9, 3, 'Bb1', 0.7, 0.00, 'hit'],        // NO 2
  /* bars 12-15: idea 3. The bass alone, then with company: the roots climb D E F# G# */
  [12, 1, 'D2', 1, 0.06, 'walk'], [12, 2, 'F#2', 1, 0.00, 'walk'], [12, 3, 'A2', 1, 0.02, 'walk'], [12, 4, 'F2', 1, -0.02, 'walk'],
  [13, 1, 'E2', 1, 0.04, 'walk'], [13, 2, 'G#2', 1, -0.02, 'walk'], [13, 3, 'D3', 1, 0.06, 'walk'], [13, 4, 'G2', 1, 0.00, 'walk'],
  [14, 1, 'F#2', 1, 0.04, 'walk'], [14, 2, 'C2', 1, 0.06, 'walk'], [14, 3, 'E2', 1, -0.02, 'walk'], [14, 4, 'G2', 1, 0.04, 'walk'],
  [15, 1, 'G#2', 1, 0.06, 'walk'], [15, 2, 'E2', 1, -0.02, 'walk'], [15, 3, 'D2', 1, 0.02, 'walk'], [15, 4, 'G#2', 1, 0.08, 'walk'],
  /* bar 16: the winner */
  [16, 1, 'A2', 1, 0.08, 'walk'], [16, 2, 'E2', 1, -0.04, 'walk'], [16, 3, 'F#2', 1, 0.00, 'walk'], [16, 4, 'B2', 1, 0.04, 'walk'],
  /* bars 17-19: the title. Down under the rising vibraphone, then both wrong notes, then home */
  [17, 1, 'C3', 1, 0.08, 'walk'], [17, 2, 'G2', 1, 0.00, 'walk'], [17, 3, 'E2', 1, 0.02, 'walk'], [17, 4, 'C2', 1, 0.06, 'walk'],
  [18, 1, 'B1', 1, 0.04, 'walk'], [18, 2, 'D2', 1, 0.00, 'walk'], [18, 3, 'E2', 1, 0.06, 'walk'], [18, 4, 'G1', 1, 0.04, 'walk'],
  [19, 1, 'G#1', 1, 0.04, 'walk'], [19, 2, 'Bb1', 1, 0.06, 'walk'], [19, 3, 'A1', 1.9, 0.08, 'hit'],        // the slab
  /* bars 20-21: the tag, in two. The four gates' roots once more, a half note each */
  [20, 1, 'D2', 1.95, 0.04, 'long'], [20, 3, 'E2', 1.95, -0.02, 'long'],
  [21, 1, 'F#2', 1.95, 0.00, 'long'], [21, 3, 'G#2', 1.95, 0.02, 'long'],
  /* bar 22: home with the last chord, then the open A under it, left to ring */
  [22, 1, 'A2', 2.0, 0.02, 'long'], [22, 3, 'A1', 4.4, 0.00, 'ring']
];

/* ------------------------------------------------------------ the vibraphone
 * [bar, beat, [pitches], damp, level offset, chord meant, kind]
 * damp: [bar, beat] at which the player damps the notes (they ring until then), or a number of beats for a stab.
 * kind: 'gate' (a single gate note), 'stab', 'chord', 'hit' (HARD sync: not humanised), 'colour'. */
const END = [24, 1];                 // let ring to the end of the film
const RING = [16, 1];                // idea 3's gate notes ring until the winner's chord is struck
const VIBES = [
  /* bars 1-2: the four bays stand up: one gate note each, left ringing */
  [1, 2, ['C4'], [2, 4.8], -0.02, 'Am6/9', 'gate'],
  [1, 3, ['F#4'], [2, 4.8], 0.00, 'Am6/9', 'gate'],
  [1, 4, ['B4'], [2, 4.8], 0.02, 'Am6/9', 'gate'],
  [2, 1, ['E5'], [2, 4.8], 0.06, 'Am6/9', 'gate'],
  /* bars 3-4: idea 1. The home voicing slides down three dominant thirteenths, pushing the off-beats */
  [3, 1.5, ['C4', 'F#4', 'B4'], 0.45, 0.00, 'Am6', 'stab'],
  [3, 2.5, ['Bb3', 'E4', 'A4'], 0.85, 0.06, 'C13', 'stab'],
  [3, 4, ['Bb3', 'E4', 'A4'], 0.40, -0.06, 'C13', 'stab'],
  [3, 4.5, ['A3', 'D#4', 'G#4'], 0.90, 0.06, 'B13', 'stab'],
  [4, 2, ['A3', 'D#4', 'G#4'], 0.40, -0.04, 'B13', 'stab'],
  [4, 2.5, ['Ab3', 'D4', 'G4'], 0.90, 0.08, 'Bb13', 'stab'],
  [4, 4, ['Ab3', 'D4', 'G4'], 0.45, 0.04, 'Bb13', 'stab'],
  /* bar 5: NO 1. It thinks it is home: the home voicing, damped, over G# */
  [5, 1, ['C4', 'F#4', 'B4'], 0.5, 0.00, 'G#7alt', 'hit'],
  /* bars 7-9: idea 2. Light fourths, the nod, then E9's notes over the wrong floor */
  [7, 2, ['G4', 'C5'], 0.55, -0.04, 'Am9', 'stab'],
  [7, 2.5, ['B4', 'E5'], 1.4, 0.02, 'Am9', 'stab'],
  [8, 2, ['C4'], [8, 4], 0.00, 'D13', 'gate'],                  // COST passes: gate note 1, a small nod
  [8, 4, ['E4', 'A4'], 0.8, -0.06, 'D13', 'stab'],
  [9, 1, ['G#3', 'D4'], 1.4, -0.02, 'E9', 'stab'],
  [9, 3, ['G#3', 'D4', 'F#4'], 0.5, 0.00, 'Bb9b13', 'hit'],      // NO 2
  /* bars 12-15: idea 3. Each lift (PASS) gets the next gate note, so the four lifts climb C4, F#4, B4, E5.
   * The figure that leads up to each lift is one note longer each time (1, 2, 3, 4 notes, a quarter apart),
   * so the gaps between the figures shrink from three beats to none. Every note is left ringing: the four
   * pitches belong to all four chords (over D: b7 3 13 9; over E: b13 9 5 1; over F#: b5 1 11 b7). */
  [12, 2, ['C4'], RING, -0.02, 'D13', 'gate'],             // PASS 1, COST
  [13, 1, ['C4'], RING, -0.10, 'E9b13', 'gate'],
  [13, 2, ['F#4'], RING, 0.00, 'E9b13', 'gate'],           // PASS 2, RETURN
  [13, 4, ['C4'], RING, -0.12, 'E9b13', 'gate'],
  [14, 1, ['F#4'], RING, -0.08, 'F#m11b5', 'gate'],
  [14, 2, ['B4'], RING, 0.02, 'F#m11b5', 'gate'],          // PASS 3, EFFORT
  [14, 3, ['C4'], RING, -0.12, 'F#m11b5', 'gate'],
  [14, 4, ['F#4'], RING, -0.09, 'F#m11b5', 'gate'],
  [15, 1, ['B4'], RING, -0.05, 'E9b13/G#', 'gate'],
  [15, 2, ['E5'], RING, 0.05, 'E9b13/G#', 'gate'],         // PASS 4, POTENTIAL
  /* bar 16: the winner. The whole voicing, struck together over A: home */
  [16, 1, ['C4', 'F#4', 'B4', 'E5'], [18, 3], 0.04, 'Am6/9', 'chord'],
  /* bar 17: the title. One new colour for the sleeve, then the gates as swung eighths for the four title lines */
  [17, 1, ['G3'], [18, 1], -0.10, 'Cmaj7#11', 'colour'],
  [17, 3, ['C4'], [18, 3], -0.04, 'Cmaj7#11', 'gate'],
  [17, 3.5, ['F#4'], [18, 3], -0.02, 'Cmaj7#11', 'gate'],
  [17, 4, ['B4'], [18, 3], 0.02, 'Cmaj7#11', 'gate'],
  [17, 4.5, ['E5'], [18, 3], 0.06, 'Cmaj7#11', 'gate'],
  /* bars 18-19: the build. The top voice climbs G4 C5 D5 to the slab's E5 */
  [18, 3, ['G#3', 'D4', 'G4'], 0.9, -0.02, 'E7alt', 'stab'],
  [18, 4.5, ['D4', 'G#4', 'C5'], 1.1, 0.04, 'E7alt', 'stab'],
  [19, 2, ['Ab3', 'G4', 'D5'], 0.6, 0.04, 'Bb13', 'stab'],
  /* the slab: the same chord as NO 1, complete, over the right floor, left ringing */
  [19, 3, ['C4', 'F#4', 'B4', 'E5'], END, 0.06, 'Am6/9', 'hit'],
  /* bars 20-21: the tag. The gates come back down, a half note each, against the climbing bass */
  [20, 1, ['E5'], END, -0.02, 'D13', 'gate'],
  [20, 3, ['B4'], END, -0.04, 'E9b13', 'gate'],
  [21, 1, ['F#4'], END, -0.06, 'F#m11b5', 'gate'],
  [21, 3, ['C4'], END, -0.08, 'E9b13/G#', 'gate'],
  /* bar 22: the last chord */
  [22, 1, ['C4', 'F#4', 'B4', 'E5'], END, 0.04, 'Am6/9', 'chord']
];

/* ------------------------------------------------------------ the drums
 * One entry a bar: which voices play and on which beats. The build adds the
 * accents (2 and 4), the humanising and the sample keys.
 *   swirl: beats on which a brush sweep starts (the recording is a 0.6 s one-shot, so the sweep is struck again on every beat)
 *   tap: brush taps
 *   ride: ride strokes                             hat: hi-hat pedal
 *   kick: feathered bass drum                      hit: the beat of a HARD sync hit (bass drum + brush slap)
 *   level: a scale for the whole bar (the drums follow the band's LEVEL too) */
const SPANG = [1, 2, 2.5, 3, 4, 4.5];       // ding, ding-da, ding, ding-da
const DRUMS = {
  2:  { swirl: [1, 2, 3], tap: [4], level: 0.75 },
  3:  { ride: SPANG, tap: [2, 4], hat: [2, 4], kick: [1, 2, 3, 4] },
  4:  { ride: [1, 2, 2.5, 3, 4], tap: [2, 4], hat: [2, 4], kick: [1, 2, 3, 4] },
  5:  { hit: [1] },
  6:  { swirl: [1, 2, 3, 4], tap: [2, 4], level: 0.8 },
  7:  { swirl: [1, 2, 3, 4], tap: [2, 4], hat: [2, 4] },
  8:  { swirl: [1, 2, 3, 4], tap: [2, 4], hat: [2, 4] },
  9:  { swirl: [1, 2], tap: [2], hit: [3] },
  13: { swirl: [2, 3, 4], level: 0.8 },                                // PASS 2: the swirl joins
  14: { swirl: [1, 2, 3, 4], tap: [2, 4], level: 0.9 },                // PASS 3: taps on 2 and 4
  15: { swirl: [1, 2, 3, 4], tap: [2, 4], ride: [2, 3, 4, 4.5] },      // PASS 4: the ride
  16: { swirl: [1, 2, 3, 4], ride: SPANG, tap: [2, 4], hat: [2, 4], kick: [1, 2, 3, 4] },
  17: { swirl: [1, 2, 3, 4], ride: SPANG, tap: [2, 4], hat: [2, 4], kick: [1, 2, 3, 4] },
  18: { swirl: [1, 2, 3, 4], ride: SPANG, tap: [2, 4], hat: [2, 4], kick: [1, 2, 3, 4] },
  19: { ride: [1], kick: [1, 2], tap: [2], hit: [3] },                 // nothing rings into the slab
  20: { swirl: [1, 2, 3, 4], tap: [2, 4], level: 0.7 },
  21: { swirl: [1, 2, 3, 4], tap: [2], level: 0.62 },
  22: { swirl: [1], ride: [1], level: 0.6 }
};

module.exports = {
  KEY, BPM, SWING, BARS, GATES, HOME, CHORDS, CHORD, LEVEL, BASS, VIBES, DRUMS, END, RING,
  midiOf, nameOf, pcOf, chordString
};
