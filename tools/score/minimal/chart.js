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
  'Gm',          //  1  the dock stands up: the four gate notes are a Gm7 arpeggio, G Bb D F
  'Gm7 D7',      //  2  (the fourth gate note, F, rings; the run-up on beat 4 is the dominant)
  'Gm6',         //  3  idea 1
  'D7b9',        //  4
  'Ab7',         //  5  NO 1: bII7, the tritone substitute of the dominant, never resolved
  'D7',          //  6  restart thin
  'Gm',          //  7  idea 2
  'Cm',          //  8
  'D7',          //  9  NO 2 on the dominant's third
  'N.C.',        // 10
  'N.C.',        // 11  the held breath
  'Gm',          // 12  idea 3: a plain scale whose strong beats (1 and 3) are the four gate notes, G Bb | D F, twice
  'Bb/D',        // 13
  'Gm7',         // 14
  'Dm7',         // 15  (the F# on beat 4 turns it into D7)
  'Gm Ebmaj7',   // 16  the winner
  'Cm7 F7',      // 17  the title: the roots now fall by fifths, C F Bb Eb Ab, and then the half step home
  'Bbmaj7 Ebmaj7', // 18  (Ab arrives a beat early, on beat 4: the harmony quickens into the slab)
  'Ab7 Gm9',     // 19  the slab on beat 3: bII7 to i, the home chord
  'Gm7',         // 20  the tag
  'Gm7',         // 21
  'Gm6/9',       // 22  the last chord
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
  // bar 1: one note a bay (0.5, 1.0, 1.5 s). Nothing on beat 1. The gate motif is a Gm7 arpeggio: G Bb D F.
  [1, 2, 'G2', 1, 0.66], [1, 3, 'Bb2', 1, 0.66], [1, 4, 'D3', 1, 0.68],
  // bar 2: the fourth bay; then the run-up that cannot wait for idea 1 (softer than it was: it measured as loud as idea 1)
  [2, 1, 'F3', 2.3, 0.64, 'ring'],                         // this recording reads hot at F3 (it measured 2.6 LU over the three notes before it at 0.72)
  [2, 4, 'D2', T, 0.50], [2, 4 + T, 'E2', T, 0.55], [2, 4 + 2 * T, 'F#2', T, 0.61],
  // bar 3, idea 1: up the Gm6 arpeggio to the top of the instrument in three beats, and a triplet tumble
  // (velocities about 2 dB under the first version's: idea 1 was the loudest music of the film; it is the busiest, not the loudest)
  [3, 1, 'G2', 0.5, 0.72], [3, 1.5, 'Bb2', 0.5, 0.60], [3, 2, 'D3', 0.5, 0.67], [3, 2.5, 'E3', 0.5, 0.62],
  [3, 3, 'G3', 1, 0.77],
  [3, 4, 'F3', T, 0.65], [3, 4 + T, 'E3', T, 0.58], [3, 4 + 2 * T, 'Eb3', T, 0.64],
  // bar 4: root, third, THE DROP (a tenth and an octave, with the block's dead stop at 6.5), then the slide home:
  // C2 B1 Bb1 A1, and the hand comes off the string as the shutter lets go (7.625 s): the band is out for the
  // 0.375 s the door falls, and the G the slide was heading for never comes.
  [4, 1, 'D3', 0.5, 0.70], [4, 1.5, 'F#3', 0.5, 0.67], [4, 2, 'D2', 0.8, 0.79],
  [4, 3, 'C2', T, 0.69], [4, 3 + T, 'B1', T, 0.62], [4, 3 + 2 * T, 'Bb1', T, 0.65], [4, 4, 'A1', 0.25, 0.67, 'stac'],
  // bar 5: NO 1. One note short of home.
  [5, 1, 'Ab1', 0.6, 0.9, 'hard choke'],
  // bar 6: under the home note, as Ab was over it
  [6, 3, 'F#2', 1.9, 0.58],
  // bars 7 to 9, idea 2: root, fifth, done
  [7, 1, 'G2', 1.85, 0.63], [7, 3, 'D2', 1.5, 0.57], [7, 4.5, 'D2', 0.36, 0.44, 'ghost'],
  [8, 1, 'C2', 1.85, 0.61], [8, 3, 'Eb2', 1.85, 0.56],
  [9, 1, 'D2', 1.25, 0.61, 'stac'],                       // let go as the shutter does (16.625 s)
  [9, 3, 'F#1', 0.6, 0.84, 'hard choke'],
  // bars 12 to 15, idea 3: a scale. G1 is the note F#1 was waiting for.
  // The gate notes fall on the strong beats (G Bb | D F, in both octaves): the scale is the motif with the steps
  // filled in. These velocities are level only (a slow rise); which beats lean is ACCENTS, below.
  [12, 1, 'G1', 1, 0.57], [12, 2, 'A1', 1, 0.56], [12, 3, 'Bb1', 1, 0.57], [12, 4, 'C2', 1, 0.57],
  [13, 1, 'D2', 1, 0.58], [13, 2, 'Eb2', 1, 0.58], [13, 3, 'F2', 1, 0.60], [13, 4, 'F#2', 1, 0.60],
  [14, 1, 'G2', 1, 0.61], [14, 2, 'A2', 1, 0.61], [14, 3, 'Bb2', 1, 0.63], [14, 4, 'C3', 1, 0.64],
  [15, 1, 'D3', 1, 0.66], [15, 2, 'Eb3', 1, 0.67], [15, 3, 'F3', 1, 0.69], [15, 4, 'F#3', 1, 0.72],
  // bar 16, the winner: the top note, and the first four steps back down, plain, under the text
  [16, 1, 'G3', 1, 0.80], [16, 2, 'F3', 1, 0.70], [16, 3, 'Eb3', 1, 0.71], [16, 4, 'D3', 1, 0.70],
  // bars 17 and 18, the title: a line of its own. The roots fall by fifths (C, F, Bb, Eb, Ab); from the F the line
  // climbs in a sequence, a third and a half step, twice (F A Bb, Bb D Eb), as the title lines stack up; from its
  // peak, Eb3, it drops a twelfth onto Ab1 as the slab is about to let go.
  [17, 1, 'C3', 1, 0.70], [17, 2, 'G2', 1, 0.68], [17, 3, 'F2', 1, 0.71], [17, 4, 'A2', 1, 0.72],
  [18, 1, 'Bb2', 1, 0.75], [18, 2, 'D3', 1, 0.76], [18, 3, 'Eb3', 1, 0.80], [18, 4, 'Ab1', 1, 0.82],
  // bar 19: the two failures, in order, are the last two notes of the approach (Ab1 on beat 4 of bar 18, F#1 here);
  // the hand comes off as the slab lets go (36.625 s); 0.375 s of nothing; home
  [19, 1, 'F#1', 1.25, 0.85, 'stac'],
  [19, 3, 'G1', 2, 0.9, 'hard ring'],
  // bars 20 and 21, the tag: the gate notes backwards, in half notes, and a beat of nothing before the last one
  [20, 1, 'F3', 1.92, 0.53, 'stac'], [20, 3, 'D3', 1.92, 0.52, 'stac'],
  [21, 1, 'Bb2', 2.2, 0.55, 'stac'],
  // bar 22: home, with the last chord. The note is let go as this recording's loop begins (1.5 s into a note)
  // and the same G is plucked once more, softly, an octave down (bar 23), and let go before its own loop.
  [22, 1, 'G2', 3.0, 0.6, 'stac'],
  [23, 1, 'G1', 2.6, 0.46, 'stac echo']
].map(function (r) {
  const flags = (r[5] || '').split(' ').filter(Boolean);
  const frac = r[1] - Math.floor(r[1] + 1e-9);
  return {
    bar: r[0], beat: r[1], note: r[2], midi: midiOf(r[2]), len: r[3], vel: r[4],
    kind: frac < 1e-6 ? 'beat' : (Math.abs(frac - 0.5) < 1e-6 ? 'swung' : 'trip'),
    hard: flags.includes('hard'), choke: flags.includes('choke'), ring: flags.includes('ring'), ghost: flags.includes('ghost'), stac: flags.includes('stac'),
    echo: flags.includes('echo')
  };
});

/* Which beats lean, by idea: a pattern, different in each, added to the velocities above by the build.
 *   idea 1 (bars 3 and 4) leans on 2 and 4 and pushes its off-beat eighths: cocky.
 *   idea 2 (bars 7 to 9) leans on 1 and lets 3 sag: it barely tries.
 *   idea 3 (bars 12 to 15) leans on 1 and 3, square: the plain one.
 *   the winner and the title (bars 16 to 18) lean on 2 and 4: the same quarters, now with the ride, swing.
 * [first bar, last bar, { beat: velocity added }, added to any off-beat note] */
const ACCENTS = [
  [3, 4, { 1: -0.02, 2: 0.05, 3: -0.02, 4: 0.05 }, 0.02],
  [7, 9, { 1: 0.04, 3: -0.04 }, -0.03],
  [12, 15, { 1: 0.045, 2: -0.035, 3: 0.035, 4: -0.035 }, 0],
  [16, 18, { 1: -0.03, 2: 0.04, 3: -0.03, 4: 0.045 }, 0]
];
function accentOf(bar, beat) {
  for (const a of ACCENTS) {
    if (bar >= a[0] && bar <= a[1]) { const on = Math.abs(beat - Math.round(beat)) < 1e-6; return on ? (a[2][Math.round(beat)] || 0) : a[3]; }
  }
  return 0;
}

/* Where the "approach by a step" rule is knowingly broken, and why. Keyed by the bar the leap leaves. */
const APPROACH_EXCEPTIONS = {
  1: 'D3 to F3: bars 1 and 2 are one figure, the gate motif, a Gm7 arpeggio with one note a bay; the third is the motif\'s own',
  5: 'Ab1 to F#2 across two seconds of stop-time: the two notes are the upper and lower neighbours of G2, which bar 7 then plays (an enclosure, with the F# an octave up)',
  19: 'G1 to F3: the piece has ended on G1; the tag is a new phrase after a full stop',
  20: 'D3 to Bb2: the tag is the gate motif backwards (F D Bb G) in half notes, and its thirds are the motif\'s own',
  21: 'Bb2 to G2, a minor third after a beat of rest: the last step of the motif backwards',
  22: 'G2 to G1: the same note plucked once more, softly, an octave down, as the chord dies (the first is let go before its recording starts to loop)'
};

/* ------------------------------------------------------------------ the keys
 * [bar, beat, notes, len (beats), vel, flags]. Eight events in 46 seconds: the piano only ever says PASS. */
const GATE_NOTES = ['G4', 'Bb4', 'D5', 'F5'];       // COST, RETURN, EFFORT, POTENTIAL: bar 1's bass motif (a Gm7 arpeggio), two octaves up
const KEYS = [
  [8, 2, ['G4'], 3.0, 0.45, 'nod'],                 // idea 2 passes COST: the COST note, once, softer and a hair later than a PASS. The next gate says NO.
  // The PASS notes are struck at 0.78 to 0.84 and mixed low: at 0.6 this preset's filter is nearly shut and a lone note
  // is close to a pure tone (judge: second partial 35 to 40 dB under the first), a risk with a listener who said "beeps".
  [12, 2, ['G4'], 3.5, 0.78, 'pass'],
  [13, 2, ['Bb4'], 3.5, 0.80, 'pass'],
  [14, 2, ['D5'], 3.5, 0.82, 'pass'],
  [15, 2, ['F5'], 1.85, 0.84, 'pass'],              // lifted before the bass's F# on beat 4
  [16, 1, ['G4', 'Bb4', 'D5', 'F5'], 3.8, 0.66, 'roll winner'],   // the winner: all four gates passed, so all four gate notes, together, once, soft
  [19, 3, ['Bb3', 'D4', 'F4', 'A4'], 2.4, 0.70, 'hard'],          // the slab: Gm9 without its root (three of the gate notes, the fourth in the bass, and one new note on top), held through the two beats of negative
  [22, 1, ['Bb3', 'E4', 'A4', 'D5'], 6.6, 0.60, 'roll last']       // Gm6/9: the fourth gate's F has fallen to E; left to ring; the fingers come off one by one, top first, the last at 45.3 s
].map(function (r) {
  const flags = (r[5] || '').split(' ').filter(Boolean);
  return {
    bar: r[0], beat: r[1], notes: r[2], midis: r[2].map(midiOf), len: r[3], vel: r[4],
    hard: flags.includes('hard'), pass: flags.includes('pass'), nod: flags.includes('nod'), roll: flags.includes('roll'), last: flags.includes('last'),
    winner: flags.includes('winner')
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
 *   slap, slap2   the two brushes slapped flat on the snare head: only with the two shutters
 *   drag   and one of them dragged across it as the shutter lands (the swirl recording, hard): only there
 * 'hard' marks the three hits. Under the swirl the build runs a continuous stir made from the same recording. */
const DRUMS = {
  2: { swirl: [[2, 0.34], [3, 0.38], [4, 0.44]], tap: [[4, 0.42]] },
  3: {
    swirl: [[1, 0.56], [2, 0.5], [3, 0.58], [4, 0.52]],
    tap: [[2, 0.66], [4, 0.72]], skip: [[1.5, 0.36], [2.5, 0.44], [3.5, 0.4], [4.5, 0.5]],      // a skip before every beat: the hype
    hat: [[2, 0.52], [4, 0.56]], kick: [[1, 0.5], [2, 0.34], [3, 0.44], [4, 0.36]]
  },
  // bar 4: nothing after beat 4: the band is out while the shutter falls (7.625 to 8.0 s)
  4: {
    swirl: [[1, 0.6], [2, 0.54], [3, 0.6], [4, 0.56]],
    tap: [[2, 0.74], [4, 0.7]], skip: [[1.5, 0.4], [2.5, 0.46], [3.5, 0.5]],
    hat: [[2, 0.56], [4, 0.6]], kick: [[1, 0.46], [2, 0.66], [3, 0.42], [4, 0.4]]
  },
  // the NOs: the bass drum, both brushes slapped flat on the head (two recordings) and dragged: the part of the hit a small speaker can play
  5: { kick: [[1, 0.62, 'hard']], slap: [[1, 0.9, 'hard']], slap2: [[1, 0.76, 'hard']], drag: [[1, 0.95, 'hard']] },
  6: { swirl: [[1, 0.4], [2, 0.44], [3, 0.43], [4, 0.47]], tap: [[4, 0.42]] },
  7: { swirl: [[1, 0.42], [2, 0.38], [3, 0.44], [4, 0.39]], tap: [[2, 0.47], [4, 0.51]], skip: [[4.5, 0.3]] },
  8: { swirl: [[1, 0.43], [2, 0.4], [3, 0.42], [4, 0.38]], tap: [[2, 0.53], [4, 0.47]], skip: [[4.5, 0.32]] },
  9: { swirl: [[1, 0.42], [2, 0.36]], tap: [[2, 0.49]], kick: [[3, 0.58, 'hard']], slap: [[3, 0.84, 'hard']], slap2: [[3, 0.7, 'hard']], drag: [[3, 0.88, 'hard']] },
  // idea 3: one layer a PASS, each starting on beat 2: the stir; taps on 2 and 4; the swung skip notes;
  // the hi-hat with the foot (the bass drum waits for the title)
  12: { swirl: [[2, 0.34], [3, 0.37], [4, 0.35]] },
  13: { swirl: [[1, 0.4], [2, 0.38], [3, 0.41], [4, 0.39]], tap: [[2, 0.44], [4, 0.47]] },
  14: { swirl: [[1, 0.44], [2, 0.42], [3, 0.45], [4, 0.43]], tap: [[2, 0.48], [4, 0.52]], skip: [[2.5, 0.38], [4.5, 0.42]] },
  15: { swirl: [[1, 0.48], [2, 0.46], [3, 0.49], [4, 0.47]], tap: [[2, 0.54], [4, 0.58]], skip: [[2.5, 0.38], [4.5, 0.44]], hat: [[2, 0.54], [4, 0.58]] },
  // the winner: the ride, at last, and soft
  16: {
    swirl: [[1, 0.55], [2, 0.51], [3, 0.54], [4, 0.52]], tap: [[2, 0.6], [4, 0.64]], hat: [[2, 0.55], [4, 0.58]],
    ride: [[1, 0.54], [2, 0.6], [2.5, 0.42], [3, 0.53], [4, 0.62], [4.5, 0.45]]
  },
  // the title: the bass drum joins (feathered); the brushes meet the four title lines (3, 3&, 4, 4& of bar 17);
  // in bar 18 a skip note before every beat, each a little stronger: the build into the slab
  17: {
    swirl: [[1, 0.54], [2, 0.5], [3, 0.54], [4, 0.51]], tap: [[2, 0.56], [3, 0.42], [4, 0.59]], skip: [[3.5, 0.36], [4.5, 0.4]], hat: [[2, 0.52], [4, 0.55]],
    ride: [[1, 0.54], [2, 0.62], [2.5, 0.42], [3, 0.53], [4, 0.63], [4.5, 0.46]], kick: [[1, 0.36], [2, 0.3], [3, 0.34], [4, 0.31]]
  },
  18: {
    swirl: [[1, 0.56], [2, 0.52], [3, 0.57], [4, 0.54]], tap: [[2, 0.6], [4, 0.63]], skip: [[1.5, 0.34], [2.5, 0.4], [3.5, 0.44], [4.5, 0.5]], hat: [[2, 0.55], [4, 0.58]],
    ride: [[1, 0.57], [2, 0.66], [2.5, 0.45], [3, 0.56], [4, 0.67], [4.5, 0.5]], kick: [[1, 0.4], [2, 0.33], [3, 0.38], [4, 0.36]]
  },
  // bar 19: one beat, then the band is out while the slab falls (36.625 to 37.0 s)
  19: {
    swirl: [[1, 0.56]], ride: [[1, 0.6]], kick: [[1, 0.42], [3, 0.64, 'hard']]
  },
  // the tag: the brushes thin out with the half notes and stop before the last chord
  20: { swirl: [[1, 0.36], [2, 0.3], [3, 0.34], [4, 0.28]], tap: [[2, 0.38], [4, 0.33]] },
  21: { swirl: [[1, 0.32], [2, 0.26], [3, 0.28]], tap: [[2, 0.3]] },
  22: { swirl: [[1, 0.28], [2, 0.2]] }
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
  1: 'one note a bay: the four gates are G, Bb, D, F (a Gm7 arpeggio)',
  2: 'the run-up: idea 1 cannot wait',
  3: 'the top of the instrument in three beats',
  4: 'the drop lands with the block; the slide home to G; band out as the shutter lets go (7.625 s)',
  5: 'out of the silence: Ab, a half step too high. Band out',
  6: 'F#, a half step under home, as Ab was over it; it resolves into bar 7',
  7: 'root, fifth, done',
  8: 'the piano plays the COST gate\'s note, once, and nothing more',
  9: 'band out as the shutter lets go (16.625 s); the dominant\'s third, a half step too low. Band out',
  10: 'tails only', 11: 'room tone only',
  12: 'the bass alone; G1 is the note F#1 was waiting for. The gate notes are the scale\'s strong beats. Layer 1 at the PASS: the stir',
  13: 'one gate further than idea 2 got. Layer 2: taps on 2 and 4',
  14: 'layer 3: the swung skip notes',
  15: 'layer 4: the hi-hat, with the foot; the F# on beat 4 leads into the top G',
  16: 'the top note, reached the slow way; the piano strikes all four gate notes at once; the ride enters',
  17: 'the title\'s own line: roots fall by fifths (C F Bb Eb Ab); from F it climbs in sequence as the title lines stack up',
  18: 'the peak, Eb3, then a twelfth down onto Ab1: the first failed hit\'s note',
  19: 'F#1, the second failed hit\'s note; band out as the slab lets go (36.625 s); G: home, and the only held chord',
  20: 'the gate notes backwards, in half notes: F, D...',
  21: '...Bb, and a beat of nothing before the last one',
  22: 'G, and the slab chord with F fallen to E; left to ring',
  23: 'the same G once more, an octave down, softly; gone by 45.9 s'
};

module.exports = {
  KEY, BPM, SWING, CHORDS, BASS, KEYS, DRUMS, GATE_NOTES, APPROACH_EXCEPTIONS, PICTURE, REMARKS, ACCENTS, accentOf,
  midiOf, nameOf, hzOf, parseChord, chordAt
};
