/*
 * video/score.js: THE SCORE. One timeline for the picture and the sound.
 *
 *   In the browser:  <script src="score.js">  ->  window.SCORE
 *   In Node:         require('../video/score.js')
 *
 * video/title-sequence.js draws every frame from these times, and the film's
 * score (tools/score/, built by tools/build-audio.js) takes its hits and its
 * stop-times from the same numbers, so a shutter and its slam cannot drift
 * apart. The music itself, its notes and its harmony, is not in this file:
 * it is the chosen score's chart, tools/score/<name>/chart.js.
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

    /* Stop-time: the band stops dead. Only the slam (and its ring) sounds. */
    silences: [[8, 9], [17, 18], [20, 22], [37, 38]]
  };

  /* Every picture event a sound can be cut to, in order. Built from the story
   * above. */
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
