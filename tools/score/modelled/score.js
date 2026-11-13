/*
 * tools/score/modelled/score.js: this score's own copy of the film's timeline
 * (video/score.js, without its `silences` list), with this score's end fade
 * (`fadeOut`) and a block for the music it plays (`SCORE.music`) added.
 * build.js beside it fails its self-checks (exit 1) if the picture times here
 * differ from video/score.js, and tools/build-audio.js then copies nothing,
 * so a shutter and its slam cannot drift apart unnoticed.
 *
 *   In Node:  require('./score.js')
 *
 * Tempo is 120 BPM: a beat is 0.5 s, a bar is 2 s, and at 30 frames a second
 * every beat falls on a whole frame (15 frames). A NO is timed by when it
 * LANDS; the shutter lets go three sixteenths (0.375 s) earlier.
 *
 * THE STORY, in 23 bars (46 s):
 *   Four dock gates stand up: COST, RETURN, EFFORT, POTENTIAL.
 *   Idea 1, the exciting one, is pitched big. Too big for the door. NO at COST.
 *   Idea 2, the easy one, breezes through COST. NO at RETURN.
 *   A held breath of silence.
 *   Idea 3, the boring one nobody pitched, walks through all four gates on the
 *   walking bass, each door lifting on a rising note, and becomes the point.
 *   The title. The slab drops: NO. It holds as the walk-in card.
 */
(function (root) {
  'use strict';

  var BEAT = 0.5, EIGHTH = 0.25, SIX = 0.125, SWING = 1 / 3, DROP = 0.375;

  function lands(t) { return t - DROP; }

  /* A gate that says PASS: the shutter comes down to the floor (the check),
   * lifts over the next beat, and the idea goes through on the beat after. */
  function pass(gate, land) {
    return {
      gate: gate, verdict: 'pass', drop: lands(land), land: land,
      lift: land + BEAT, passWord: land + 2 * BEAT - SIX, tab: land + 2 * BEAT,
      travel: [land + 2 * BEAT, land + 3 * BEAT], carried: land + 3 * BEAT
    };
  }
  /* A gate that says NO: the bay is held empty, then the shutter falls through the floor. */
  function no(gate, land) {
    return { gate: gate, verdict: 'no', drop: lands(land), land: land, hold: [land, land + 2 * BEAT] };
  }

  var SCORE = {
    bpm: 120, beat: BEAT, eighth: EIGHTH, sixteenth: SIX, swing: SWING, drop: DROP,
    fps: 30,
    duration: 46,

    gates: ['Cost', 'Return', 'Effort', 'Potential'],

    intro: {
      floor: 0,                              // the floor line is drawn
      bays: [0.5, 1, 1.5, 2],                // each bay stands up from it, one to a beat; its sign cuts in as it stops
      kicker: 2.5,                           // THREE IDEAS · FOUR GATES
      kickerText: 'Three ideas · Four gates'
    },

    ideas: [
      {
        n: 1, register: 'loud',
        kicker: 'Idea 1 · The exciting one',
        title: ['A chatbot', 'for everything'],
        size: 'big',                         // too wide for the door, too tall for the opening
        kickerAt: 4, titleAt: [4 + SWING, 4 + BEAT + SWING],
        enter: [6, 6.5],                     // fast in, dead stop at the first post
        gates: [no(0, 8)],
        reason: ['Too costly', 'to run'], reasonShort: ['Too', 'costly'],   // the square's bays are narrow
        after: 9,                            // the reason cuts in, the title is struck, the tell-tale stays
        voice: { at: 9.5, lines: ['Your best AI idea is probably wrong.'] },
        out: 12
      },
      {
        n: 2, register: 'mid',
        kicker: 'Idea 2 · The easy one',
        title: ['Meeting notes', 'for managers'],
        size: 'mid',
        kickerAt: 12 + 3 * SIX, titleAt: [12.5, 12.5 + SWING],
        enter: [13, 13.25],                  // quick: an eighth
        gates: [pass(0, 14), no(1, 17)],
        reason: ['Nothing', 'comes back'], reasonShort: ['Nothing', 'returns'],
        after: 18,
        voice: { at: 18.5, lines: ['Easy is not the same as worth it.'] },
        out: 20
      },
      {
        n: 3, register: 'quiet',
        kicker: 'Idea 3 · Nobody pitched it',
        title: ['Invoice follow-up', 'reminders'],
        size: 'small',
        kickerAt: 20 + 3 * SIX, titleAt: [20.5],   // a quiet line: it cuts in, no block
        enter: [21, 21.25],                  // in the silence
        gates: [pass(0, 22), pass(1, 24), pass(2, 26), pass(3, 28)],
        exit: [29, 29.5],                    // through the last bay to the far side of the dock
        winner: 30,                          // it becomes the point: Flare
        voice: { at: 30.5, lines: ['The boring one you didn’t pitch', 'is probably worth thousands.'] },
        out: 32
      }
    ],

    /* The title card, laid out as the deck's title slide. */
    title: {
      at: 32,
      cover: 32, pull: 32 + EIGHTH,          // the sleeve covers the stage, then pulls back to the spine
      kicker: 32.75,
      lines: [33, 33 + SWING, 33.5, 33.5 + SWING],
      sub: 34.5, name: 35, role: 35 + SWING / 2, venue: 35 + SWING,
      drop: lands(37), land: 37,             // the slab: NO
      positive: 38,                          // two beats of stop-time in negative
      fine: [38, 38 + SWING / 2, 38 + SWING]
    },

    /* THE MUSIC is attached below (SCORE.music): it is built from the picture
     * times above, so it cannot drift from them. Only the sound reads it. */

    fadeOut: [45.7, 46]
  };

  /* THE MUSIC: a cool-jazz trio (upright bass, brushes and ride, sparse
   * piano), D minor, 120 BPM, eighths swung at 65 %. Only the sound reads
   * this block; the notes themselves are in tools/score/modelled/build.js.
   * Every time in it is taken from the picture above, never typed again. */
  (function () {
    var I1 = SCORE.ideas[0], I2 = SCORE.ideas[1], I3 = SCORE.ideas[2], T = SCORE.title;
    var NO1 = I1.gates[0].land, NO2 = I2.gates[1].land;           // 8 s, 17 s
    var P = I3.gates.map(function (g) { return g.lift; });        // the four PASS lifts: 22.5, 24.5, 26.5, 28.5 s
    var ALL = ['bass', 'piano', 'brush', 'ride', 'hat', 'kick'];

    SCORE.music = {
      key: 'D minor',
      swingRatio: 0.65,
      /* One entry a bar (2 s). '|' splits a bar in half. */
      chords: ['Dm', 'Dm', 'Gm9', 'Em7b5 | A7b9', 'A7b9 (hit, stop)', 'Gm7 | A7', 'Dm9', 'Gm7',
        'Em7b5 | Eb7 (hit, stop)', '(stop)', '(breath)', 'Dm', 'Gm', 'Em7b5', 'A9', 'Dm9',
        'Gm9', 'Em7b5 | A7b9', 'Eb7#11 | Dm6/9 (the slab)', 'Em7b5 | A7b9', 'Dm6/9', 'Dm6/9', 'Dm6/9'],
      /* Stop-time: the band hits with the NO and is out until the next entry. */
      stops: [[NO1, NO1 + 4 * BEAT], [NO2, I3.gates[0].land]],
      /* The held breath before idea 3: the band and its tails are gone; only the room tone runs. */
      breath: [I2.out + 0.3, I3.gates[0].land],
      /* Who plays when. 'level' scales the brush swirl. In idea 3 one layer joins at each PASS. */
      sections: [
        { from: SCORE.intro.bays[0], to: SCORE.intro.bays[3], play: ['bass'] },                 // the dock: one bass note a bay
        { from: SCORE.intro.bays[3], to: I1.kickerAt, play: ['bass', 'brush'], level: 0.7 },    // brushes enter
        { from: I1.kickerAt, to: NO1, play: ALL, level: 1 },                                    // idea 1 swaggers in: everyone
        { from: NO1 + 4 * BEAT, to: I1.out, play: ['bass'] },                                   // after NO 1: the bass, in two
        { from: I1.out, to: NO2, play: ['bass', 'brush', 'piano'], level: 0.62 },               // idea 2: thinner, lighter
        { from: I3.gates[0].land, to: P[0], play: ['bass'] },                                   // idea 3: the bass walks in alone
        { from: P[0], to: P[1], play: ['bass', 'piano'] },                                      // PASS 1: the piano
        { from: P[1], to: P[2], play: ['bass', 'piano', 'brush'], level: 0.6 },                 // PASS 2: brushes
        { from: P[2], to: P[3], play: ['bass', 'piano', 'brush', 'ride'], level: 0.7 },         // PASS 3: the ride
        { from: P[3], to: I3.winner, play: ALL, level: 0.9 },                                   // PASS 4: the feet (hi-hat, bass drum)
        { from: I3.winner, to: T.land, play: ALL, level: 1 },                                   // the winner, the title: full trio
        { from: T.land, to: SCORE.duration, play: ['bass', 'piano'] }                           // the home chord, a tag, the ring-out
      ],
      /* The piano at each PASS of idea 3: a rising third that starts as the door starts to lift.
       * Each figure starts higher than the last and lands on one more note, so the four climb
       * (A, B flat, D, E on top) and come home to F over D at the winner. */
      climb: [
        { from: 65, to: [69] },
        { from: 67, to: [62, 70] },
        { from: 70, to: [64, 67, 74] },
        { from: 73, to: [61, 67, 71, 76] }
      ],
      resolve: [60, 64, 69, 74, 77],
      /* The pitch of the low drum in each NO, and under the home chord on the slab. */
      thudHz: [55, 49, 55],
      /* A steady, very quiet room under everything, the held breath included (dBFS RMS in the finished file). */
      roomToneDb: -68
    };
  }());

  /* Every picture event a sound can be cut to, in order. Built from the story
   * above. build.js compares this list with video/score.js; it plays nothing
   * from it. */
  SCORE.cues = function () {
    var out = [];
    out.push({ t: SCORE.intro.floor, type: 'floor' });
    SCORE.intro.bays.forEach(function (t) { out.push({ t: t, type: 'bay' }); });
    SCORE.ideas.forEach(function (idea, k) {
      if (k > 0) { out.push({ t: SCORE.ideas[k - 1].out, type: 'wipe', idea: idea.n, quiet: idea.n === 3 }); }
      out.push({ t: idea.enter[0], type: 'enter', idea: idea.n, size: idea.size });
      var step = 0;
      idea.gates.forEach(function (g) {
        if (g.verdict === 'no') {
          out.push({ t: g.land, type: 'slam', idea: idea.n, gate: g.gate });
        } else {
          out.push({ t: g.land, type: 'check', idea: idea.n, gate: g.gate });
          out.push({ t: g.lift, type: 'lift', idea: idea.n, gate: g.gate, step: idea.n === 3 ? step++ : -1 });
        }
      });
      if (idea.winner) { out.push({ t: idea.winner, type: 'winner', idea: idea.n }); }
    });
    out.push({ t: SCORE.title.cover, type: 'sleeve' });
    out.push({ t: SCORE.title.land, type: 'slam', idea: 0, gate: -1, title: true });
    out.push({ t: SCORE.title.positive, type: 'resolve' });
    return out.sort(function (a, b) { return a.t - b.t; });
  };

  if (typeof module === 'object' && module.exports) { module.exports = SCORE; }
  else { root.SCORE = SCORE; }
}(typeof window !== 'undefined' ? window : this));
