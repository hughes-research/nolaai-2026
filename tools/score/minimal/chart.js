/*
 * tools/score/minimal/chart.js: the composition, as data.
 *
 * Written before any sound was rendered. build.js plays it, check-chart.js
 * checks it, report.js prints it. Nothing here knows about samples or mixing.
 *
 * Positions are (bar, beat): bars count from 1 (bar 1 is 0 to 2 s), beats from 1.
 * A beat that ends in .5 is a swung eighth (kind 'swung'); thirds are triplets
 * (kind 'trip'). Pitches are SOUNDING pitches, C4 = 60 = middle C; the build
 * transposes to whatever octave the chosen bass preset needs.
 * Velocities are 0..1, before humanising. len is in beats.
 */
'use strict';

const KEY = 'G minor';
const BPM = 120;
const SWING = 0.64;              // an off-beat eighth falls 64 percent of the way through its beat

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/* 'G1' -> 31, 'F#3' -> 54 (sounding MIDI, C4 = 60) */
function midiOf(name) {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!m || PC[m[1]] === undefined) { throw new Error('chart: not a note name: ' + name); }
  return 12 * (Number(m[2]) + 1) + PC[m[1]];
}
function nameOf(midi) { return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
function hzOf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

/* ------------------------------------------------------------------ harmony
 * One entry a bar. A bar with two chords changes on beat 3. */
const CHORDS = [
  'Gm',          //  1  the dock stands up
  'D7',          //  2
  'Gm6',         //  3  idea 1
  'D7b9',        //  4
  'Ab7',         //  5  NO 1: bII7, the tritone substitute of the dominant, never resolved
  'D7',          //  6  restart thin
  'Gm',          //  7  idea 2
  'Cm',          //  8
  'D7',          //  9  NO 2 on the dominant's third
  'N.C.',        // 10
  'N.C.',        // 11  the held breath
  'Gm',          // 12  idea 3: the four key notes are the roots of bars 12 to 15
  'Bb/D',        // 13
  'Cm7/G',       // 14
  'Dm7',         // 15  (the F# on beat 4 turns it into D7)
  'Gm Ebmaj7',   // 16  the winner: from here the strong beats fall in thirds, G Eb C A F D
  'Cm7 Am7b5',   // 17
  'F7 D7',       // 18
  'Ab7 Gm9',     // 19  the slab on beat 3: bII7 to i, the home chord
  'Gm',          // 20  the tag
  'Gm6/9',       // 21  the last chord
  'Gm6/9',       // 22  (ringing)
  'Gm6/9'        // 23  (ringing)
];

const QUALITY = {                 // semitones above the root
  '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11],
  'm6': [0, 3, 7, 9], 'm9': [0, 3, 7, 10, 2], 'm6/9': [0, 3, 7, 9, 2], '7b9': [0, 4, 7, 10, 1], 'm7b5': [0, 3, 6, 10]
};
/* 'Cm7/G' -> { root: 0, tones: Set of pitch classes, bass: 7 } */
function parseChord(sym) {
  if (sym === 'N.C.') { return null; }
  const m = /^([A-G](?:#|b)?)(m6\/9|maj7|m7b5|7b9|m6|m7|m9|m|7|)(?:\/([A-G](?:#|b)?))?$/.exec(sym);
  if (!m) { throw new Error('chart: cannot read the chord ' + sym); }
  const root = PC[m[1]];
  return { symbol: sym, root: root, tones: new Set(QUALITY[m[2]].map((s) => (root + s) % 12)), bass: m[3] === undefined ? root : PC[m[3]] };
}
/* The chord sounding at a beat of a bar (two-chord bars change on beat 3). */
function chordAt(bar, beat) {
  const parts = CHORDS[bar - 1].split(' ');
  return parseChord(parts.length === 2 && beat >= 3 ? parts[1] : parts[0]);
}

/* ------------------------------------------------------------------ the bass
 * [bar, beat, note, len (beats), vel, flags]
 *   flags: hard  = one of the three HARD hits (never humanised, onset compensated)
 *          choke = damped by the hand: the stop-time
 *          ring  = left to ring
 *          ghost = a soft pickup
 *          stac  = exactly as long as written, not joined to the next note
 */
const T = 1 / 3;
const BASS = [
  // bar 1: one note a bay (0.5, 1.0, 1.5 s). Nothing on beat 1.
  [1, 2, 'G2', 1, 0.60], [1, 3, 'Bb2', 1, 0.62], [1, 4, 'C3', 1, 0.64],
  // bar 2: the fourth bay; then the run-up that cannot wait for idea 1
  [2, 1, 'D3', 2.3, 0.68, 'ring'],
  [2, 4, 'D2', T, 0.62], [2, 4 + T, 'E2', T, 0.68], [2, 4 + 2 * T, 'F#2', T, 0.76],
  // bar 3, idea 1: up the Gm6 arpeggio to the top of the instrument in three beats, and a triplet tumble
  [3, 1, 'G2', 0.5, 0.84], [3, 1.5, 'Bb2', 0.5, 0.70], [3, 2, 'D3', 0.5, 0.78], [3, 2.5, 'E3', 0.5, 0.72],
  [3, 3, 'G3', 1, 0.90],
  [3, 4, 'F3', T, 0.76], [3, 4 + T, 'E3', T, 0.68], [3, 4 + 2 * T, 'Eb3', T, 0.74],
  // bar 4: root, third, THE DROP (a tenth and an octave, with the block's dead stop at 6.5), then the slide home.
  // The last note is clipped: the whole band lifts for an instant before the shutter lands.
  [4, 1, 'D3', 0.5, 0.82], [4, 1.5, 'F#3', 0.5, 0.78], [4, 2, 'D2', 0.8, 0.92],
  [4, 3, 'C2', 0.5, 0.80], [4, 3.5, 'B1', 0.5, 0.72], [4, 4, 'Bb1', 0.5, 0.78], [4, 4.5, 'A1', 0.16, 0.74, 'stac'],
  // bar 5: NO 1. One note short of home.
  [5, 1, 'Ab1', 0.6, 0.84, 'hard choke'],
  // bar 6: under the home note, as Ab was over it
  [6, 3, 'F#2', 1.9, 0.58],
  // bars 7 to 9, idea 2: root, fifth, done
  [7, 1, 'G2', 1.85, 0.63], [7, 3, 'D2', 1.5, 0.57], [7, 4.5, 'D2', 0.36, 0.44, 'ghost'],
  [8, 1, 'C2', 1.85, 0.61], [8, 3, 'Eb2', 1.85, 0.56],
  [9, 1, 'D2', 1.7, 0.61, 'stac'],
  [9, 3, 'F#1', 0.6, 0.84, 'hard choke'],
  // bars 12 to 15, idea 3: a scale. G1 is the note F#1 was waiting for.
  // The lean moves: beat 1 in bar 12, beat 3 in bar 13, beat 4 in bar 14, beats 2 and 4 in bar 15.
  [12, 1, 'G1', 1, 0.60], [12, 2, 'A1', 1, 0.53], [12, 3, 'Bb1', 1, 0.56], [12, 4, 'C2', 1, 0.55],
  [13, 1, 'D2', 1, 0.58], [13, 2, 'Eb2', 1, 0.56], [13, 3, 'F2', 1, 0.63], [13, 4, 'F#2', 1, 0.59],
  [14, 1, 'G2', 1, 0.61], [14, 2, 'A2', 1, 0.57], [14, 3, 'Bb2', 1, 0.60], [14, 4, 'C3', 1, 0.67],
  [15, 1, 'D3', 1, 0.66], [15, 2, 'E3', 1, 0.70], [15, 3, 'F3', 1, 0.67], [15, 4, 'F#3', 1, 0.75],
  // bars 16 to 18: the same plain quarters carry on, down through the title (lean: 1; 3; 3 and 4)
  [16, 1, 'G3', 1, 0.82], [16, 2, 'F3', 1, 0.68], [16, 3, 'Eb3', 1, 0.73], [16, 4, 'D3', 1, 0.70],
  [17, 1, 'C3', 1, 0.74], [17, 2, 'Bb2', 1, 0.71], [17, 3, 'A2', 1, 0.79], [17, 4, 'G2', 1, 0.72],
  [18, 1, 'F2', 1, 0.78], [18, 2, 'Eb2', 1, 0.74], [18, 3, 'D2', 1, 0.84], [18, 4, 'A1', 1, 0.81],
  // bar 19: the two failures, in order, as the approach; a breath; home
  [19, 1, 'Ab1', 1, 0.87], [19, 2, 'F#1', 0.5, 0.85, 'stac'],
  [19, 3, 'G1', 2, 0.85, 'hard ring'],
  // bar 20, the tag: the gate notes backwards, with a beat of nothing before the last one
  [20, 1, 'D3', 1, 0.60], [20, 2, 'C3', 1, 0.54], [20, 3, 'Bb2', 1.1, 0.57, 'stac'],
  [21, 1, 'G2', 9, 0.60, 'ring']
].map(function (r) {
  const flags = (r[5] || '').split(' ').filter(Boolean);
  const frac = r[1] - Math.floor(r[1] + 1e-9);
  return {
    bar: r[0], beat: r[1], note: r[2], midi: midiOf(r[2]), len: r[3], vel: r[4],
    kind: frac < 1e-6 ? 'beat' : (Math.abs(frac - 0.5) < 1e-6 ? 'swung' : 'trip'),
    hard: flags.includes('hard'), choke: flags.includes('choke'), ring: flags.includes('ring'), ghost: flags.includes('ghost'), stac: flags.includes('stac')
  };
});

/* Where the "approach by a step" rule is knowingly broken, and why. Keyed by the bar the leap leaves. */
const APPROACH_EXCEPTIONS = {
  5: 'Ab1 to F#2 across two seconds of stop-time: the two notes are the upper and lower neighbours of G2, which bar 7 then plays (an enclosure, with the F# an octave up)',
  19: 'G1 to D3: the piece has ended on G1; the tag is a new phrase after a full stop',
  20: 'Bb2 to G2, a minor third after a beat of rest: the tag is the gate motif of bars 1 and 2 (G Bb C D) backwards, and that third is the motif\'s own'
};

/* ------------------------------------------------------------------ the keys
 * [bar, beat, notes, len (beats), vel, flags]. Seven events in 46 seconds. */
const GATE_NOTES = ['G4', 'Bb4', 'C5', 'D5'];       // COST, RETURN, EFFORT, POTENTIAL: bar 1's bass motif, two octaves up
const KEYS = [
  [8, 2, ['G4'], 3.0, 0.50, 'nod'],                 // idea 2 passes COST: the COST note, once, soft. The next gate says NO.
  [12, 2, ['G4'], 3.5, 0.56, 'pass'],
  [13, 2, ['Bb4'], 3.5, 0.60, 'pass'],
  [14, 2, ['C5'], 3.5, 0.64, 'pass'],
  [15, 2, ['D5'], 3.5, 0.69, 'pass'],
  [19, 3, ['Bb3', 'D4', 'F4', 'A4'], 2.4, 0.66, 'hard'],          // the slab: Gm9 without its root, held through the two beats of negative
  [21, 1, ['Bb3', 'E4', 'A4', 'D5'], 10.0, 0.50, 'roll last']      // Gm6/9: F has fallen to E, the top is the fourth gate's note
].map(function (r) {
  const flags = (r[5] || '').split(' ').filter(Boolean);
  return {
    bar: r[0], beat: r[1], notes: r[2], midis: r[2].map(midiOf), len: r[3], vel: r[4],
    hard: flags.includes('hard'), pass: flags.includes('pass'), nod: flags.includes('nod'), roll: flags.includes('roll'), last: flags.includes('last')
  };
});

/* ------------------------------------------------------------------ the kit
 * Per bar, per voice: [beat, vel] pairs. Voices:
 *   swirl  the brush stirred on the snare head (one stroke a listed beat)
 *   tap    the brush tapped on the snare (2 and 4)
 *   skip   the swung tap before 3 and before 1 (kind 'swung')
 *   hat    the hi-hat closed with the foot (2 and 4)
 *   kick   the bass drum, feathered, or with a hit
 *   ride   the ride cymbal: not before the winner
 * 'hard' marks the three hits. */
const DRUMS = {
  2: { swirl: [[2, 0.34], [3, 0.38], [4, 0.44]], tap: [[4, 0.42]] },
  3: {
    swirl: [[1, 0.56], [2, 0.5], [3, 0.58], [4, 0.52]],
    tap: [[2, 0.66], [4, 0.72]], skip: [[2.5, 0.44], [4.5, 0.5]],
    hat: [[2, 0.52], [4, 0.56]], kick: [[1, 0.5], [2, 0.34], [3, 0.44], [4, 0.36]]
  },
  4: {
    swirl: [[1, 0.6], [2, 0.54], [3, 0.6], [4, 0.56]],
    tap: [[2, 0.74], [4, 0.7]], skip: [[2.5, 0.46], [4.5, 0.56]],
    hat: [[2, 0.56], [4, 0.6]], kick: [[1, 0.46], [2, 0.66], [3, 0.42], [4, 0.4]]
  },
  5: { kick: [[1, 0.62, 'hard']] },
  6: { swirl: [[1, 0.32], [2, 0.36], [3, 0.35], [4, 0.4]], tap: [[4, 0.38]] },
  7: { swirl: [[1, 0.42], [2, 0.38], [3, 0.44], [4, 0.39]], tap: [[2, 0.47], [4, 0.51]] },
  8: { swirl: [[1, 0.43], [2, 0.4], [3, 0.42], [4, 0.38]], tap: [[2, 0.53], [4, 0.47]] },
  9: { swirl: [[1, 0.42], [2, 0.36]], tap: [[2, 0.49]], kick: [[3, 0.62, 'hard']] },
  // idea 3: one layer a PASS, each starting on beat 2
  12: { swirl: [[2, 0.36], [3, 0.39], [4, 0.37]] },
  13: { swirl: [[1, 0.35], [2, 0.33], [3, 0.37], [4, 0.34]], tap: [[2, 0.42], [4, 0.45]] },
  14: { swirl: [[1, 0.38], [2, 0.36], [3, 0.4], [4, 0.37]], tap: [[2, 0.46], [4, 0.5]], hat: [[2, 0.44], [4, 0.47]] },
  15: { swirl: [[1, 0.42], [2, 0.4], [3, 0.44], [4, 0.41]], tap: [[2, 0.52], [4, 0.56]], hat: [[2, 0.48], [4, 0.52]], skip: [[2.5, 0.38], [4.5, 0.44]] },
  // the winner: the ride, at last, and soft
  16: {
    swirl: [[1, 0.46], [2, 0.42], [3, 0.46], [4, 0.43]], tap: [[2, 0.56], [4, 0.6]], hat: [[2, 0.5], [4, 0.53]],
    ride: [[1, 0.5], [2, 0.58], [2.5, 0.4], [3, 0.5], [4, 0.6], [4.5, 0.43]]
  },
  17: {
    swirl: [[1, 0.46], [2, 0.42], [3, 0.46], [4, 0.43]], tap: [[2, 0.54], [3, 0.4], [4, 0.57]], skip: [[3.5, 0.36], [4.5, 0.4]], hat: [[2, 0.52], [4, 0.55]],
    ride: [[1, 0.54], [2, 0.62], [2.5, 0.42], [3, 0.53], [4, 0.63], [4.5, 0.46]], kick: [[1, 0.36], [2, 0.3], [3, 0.34], [4, 0.31]]
  },
  18: {
    swirl: [[1, 0.5], [2, 0.45], [3, 0.5], [4, 0.46]], tap: [[2, 0.6], [4, 0.63]], hat: [[2, 0.55], [4, 0.58]],
    ride: [[1, 0.57], [2, 0.66], [2.5, 0.45], [3, 0.56], [4, 0.67], [4.5, 0.5]], kick: [[1, 0.4], [2, 0.33], [3, 0.38], [4, 0.35]]
  },
  19: {
    swirl: [[1, 0.5]], tap: [[2, 0.62]], hat: [[2, 0.56]], ride: [[1, 0.6]], kick: [[1, 0.42], [3, 0.64, 'hard']]
  },
  20: { swirl: [[1, 0.34], [2, 0.3], [3, 0.33], [4, 0.28]], tap: [[2, 0.4], [4, 0.34]] },
  21: { swirl: [[1, 0.3], [2, 0.22]] }
};

/* What the picture does, for the report's table. */
const PICTURE = [
  'floor line; bays 1 to 3 stand up', 'bay 4; kicker text', 'idea 1: "A chatbot / for everything"', 'block enters, dead stop at 6.5; shutter falls',
  'NO 1 at 8.000', 'text on screen', 'idea 2: "Meeting notes for managers"', 'COST passes at 14.5', 'shutter falls; NO 2 at 17.000',
  'text on screen', 'the held breath', 'idea 3; PASS 1 at 22.5', 'PASS 2 at 24.5', 'PASS 3 at 26.5', 'PASS 4 at 28.5',
  'the winner at 30; text from 30.5', 'sleeve; title lines on 3, 3&, 4, 4&', 'subtitle, name', 'slab falls from 36.625; THE SLAB at 37.000',
  'back to positive; the card holds', 'card', 'card', 'card; loop point'
];
const REMARKS = {
  1: 'one note a bay: the four gates are G, Bb, C, D',
  2: 'the run-up: idea 1 cannot wait',
  3: 'the top of the instrument in three beats',
  4: 'the drop lands with the block; then the slide home to G...',
  5: '...cut on Ab, a half step too high. Band out',
  6: 'F#, a half step under home, as Ab was over it; it resolves into bar 7',
  7: 'root, fifth, done',
  8: 'the piano plays the COST gate\'s note, once, and nothing more',
  9: 'the dominant\'s third, left hanging: a half step too low. Band out',
  10: 'tails only', 11: 'room tone only',
  12: 'the bass alone; G1 is the note F#1 was waiting for. Layer 1 at the PASS: the swirl',
  13: 'one gate further than idea 2 got. Layer 2: taps on 2 and 4',
  14: 'layer 3: the hi-hat, with the foot',
  15: 'layer 4: the swung skip notes; the F# on beat 4 leads into the top G',
  16: 'the top note, reached the slow way; the ride enters',
  17: 'strong beats fall in thirds: G Eb C A F D',
  18: 'a shade stronger each bar',
  19: 'Ab, F#, a breath, G: both failed hits, in order, as the approach to home',
  20: 'the gate notes backwards; a beat of nothing before the last one',
  21: 'the slab chord with F fallen to E, the fourth gate\'s note on top; left to ring',
  22: 'ringing', 23: 'gone by 45.9 s'
};

module.exports = {
  KEY, BPM, SWING, CHORDS, BASS, KEYS, DRUMS, GATE_NOTES, APPROACH_EXCEPTIONS, PICTURE, REMARKS,
  midiOf, nameOf, hzOf, parseChord, chordAt
};
