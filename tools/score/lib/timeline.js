/*
 * tools/score/lib/timeline.js: the film's times, read from video/score.js.
 *
 *   const tl = require('./timeline.js').load();
 *   tl.hard.no1            // 8      (seconds)
 *   tl.at(5, 1)            // 8      bar 5, beat 1
 *   tl.at(3, 2.5, { swing: 0.66 })   // the swung "and" of beat 2 in bar 3
 *
 * Nothing here is typed in by hand: every time is taken from video/score.js
 * (the one timeline the picture and the sound share). The prose table
 * tools/score/ref/events.json is loaded as tl.events and cross-checked against
 * score.js, so a table that has drifted from the picture is an Error, not a
 * late hit.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { REPO, LAB } = require('./const.js');

const SCORE_FILE = path.join(REPO, 'video', 'score.js');
const EVENTS_FILE = path.join(LAB, 'ref', 'events.json');
const EPS = 1e-9;

function need(cond, msg) { if (!cond) { throw new Error('timeline: ' + msg); } }
function num(x, what) { need(typeof x === 'number' && isFinite(x), what + ' is not a number in ' + SCORE_FILE); return x; }

/* Read the timeline. Throws if video/score.js or ref/events.json is missing,
 * malformed, or if the two disagree. */
function load(opts) {
  const o = opts || {};
  const scoreFile = o.scoreFile || SCORE_FILE;
  const eventsFile = o.eventsFile || EVENTS_FILE;
  need(fs.existsSync(scoreFile), 'cannot find ' + scoreFile);
  const S = require(scoreFile);

  const bpm = num(S.bpm, 'bpm');
  const beat = num(S.beat, 'beat');
  const fps = num(S.fps, 'fps');
  const duration = num(S.duration, 'duration');
  need(Math.abs(beat - 60 / bpm) < EPS, 'beat (' + beat + ' s) does not match ' + bpm + ' BPM');
  const bar = 4 * beat;                       // 4/4
  const bars = Math.round(duration / bar);
  need(Math.abs(bars * bar - duration) < EPS, 'the film is not a whole number of bars');

  need(Array.isArray(S.ideas) && S.ideas.length === 3, 'score.js should describe three ideas');
  const idea = S.ideas;
  const noGate = function (k) {
    const g = (idea[k].gates || []).filter(function (x) { return x.verdict === 'no'; });
    need(g.length === 1, 'idea ' + (k + 1) + ' should have exactly one NO gate');
    return num(g[0].land, 'idea ' + (k + 1) + ' NO land');
  };
  const hard = { no1: noGate(0), no2: noGate(1), slab: num(S.title && S.title.land, 'title.land') };

  const passGates = (idea[2].gates || []).filter(function (x) { return x.verdict === 'pass'; });
  need(passGates.length === 4, 'idea 3 should pass four gates');
  const passes = passGates.map(function (g, i) { return num(g.lift, 'idea 3 lift ' + (i + 1)); });
  const checks = passGates.map(function (g, i) { return num(g.land, 'idea 3 check ' + (i + 1)); });

  const bays = (S.intro && S.intro.bays || []).map(function (t, i) { return num(t, 'intro.bays[' + i + ']'); });
  need(bays.length === 4, 'intro.bays should hold four times');

  const winner = num(idea[2].winner, 'idea 3 winner');
  const sleeve = num(S.title.cover, 'title.cover');
  const positive = num(S.title.positive, 'title.positive');
  const text = idea.map(function (d, k) {
    need(d.voice && typeof d.voice.at === 'number', 'idea ' + (k + 1) + ' has no on-screen line');
    return [num(d.voice.at, 'voice.at'), num(d.out, 'idea out')];
  });

  /* The prose table (63 rows): { t, what, frame, where, sync? }. */
  need(fs.existsSync(eventsFile), 'cannot find ' + eventsFile);
  const table = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
  const events = Array.isArray(table) ? table : table.events;
  need(Array.isArray(events) && events.length > 0, eventsFile + ' holds no events');
  /* Some people will read "as events.json" as the whole object: tl.events.events is the same array. */
  Object.defineProperty(events, 'events', { value: events, enumerable: false });

  const tableHard = events.filter(function (e) { return e.sync === 'HARD'; }).map(function (e) { return e.t; });
  const tableSoft = events.filter(function (e) { return e.sync === 'SOFT'; }).map(function (e) { return e.t; });
  const same = function (a, b) { return a.length === b.length && a.every(function (x, i) { return Math.abs(x - b[i]) < 1e-6; }); };
  need(same(tableHard, [hard.no1, hard.no2, hard.slab]),
    'ref/events.json HARD times ' + JSON.stringify(tableHard) + ' disagree with video/score.js ' + JSON.stringify(hard));
  need(same(tableSoft, passes.concat([winner, sleeve, positive])),
    'ref/events.json SOFT times ' + JSON.stringify(tableSoft) + ' disagree with video/score.js');
  if (!Array.isArray(table)) {
    need(table.bpm === bpm && table.fps === fps && table.duration === duration, 'ref/events.json header disagrees with video/score.js');
  }

  /* Bar and beat count from 1. A beat may be fractional. With { swing: s }
   * (0.5 straight .. 0.75 hard), a beat that ends in exactly .5 (the "and")
   * is moved to s of the way through the beat; every other fraction is left
   * where it is (triplets and sixteenths are the composer's own business). */
  function at(barNo, beatNo, options) {
    const b = beatNo === undefined ? 1 : beatNo;
    need(Number.isInteger(barNo) && barNo >= 1, 'at(bar, beat): bar counts from 1 and is a whole number, got ' + barNo);
    need(typeof b === 'number' && isFinite(b) && b >= 1 && b < 5, 'at(bar, beat): beat counts from 1 and stays below 5, got ' + beatNo);
    let whole = Math.floor(b + EPS);
    let frac = b - whole;
    if (frac < EPS) { frac = 0; }
    const swing = options && options.swing;
    if (swing !== undefined && swing !== null) {
      need(typeof swing === 'number' && swing >= 0.5 && swing <= 0.75, 'at(): swing is 0.5 (straight) to 0.75, got ' + swing);
      if (Math.abs(frac - 0.5) < 1e-6) { frac = swing; }
    }
    return (barNo - 1) * bar + (whole - 1 + frac) * beat;
  }

  /* The bar and the (straight, fractional) beat a time falls in. */
  function barOf(t) {
    need(typeof t === 'number' && isFinite(t), 'barOf(t): t is a number of seconds, got ' + t);
    const barNo = Math.floor(t / bar + EPS) + 1;
    let b = (t - (barNo - 1) * bar) / beat + 1;
    if (Math.abs(b - Math.round(b)) < 1e-6) { b = Math.round(b); }
    return { bar: barNo, beat: b };
  }

  /* The nearest whole frame, and how far a time is from it (seconds). */
  function frameOf(t) {
    const f = Math.round(t * fps);
    return { frame: f, off: t - f / fps };
  }

  return {
    bpm: bpm, beat: beat, bar: bar, fps: fps, duration: duration, bars: bars,
    hard: hard,
    passes: passes,
    checks: checks,                 // idea 3's shutters touching the floor, one beat before each PASS
    bays: bays,
    winner: winner, sleeve: sleeve, positive: positive,
    text: text,
    silences: (S.silences || []).map(function (p) { return p.slice(); }),   // the picture's own stop-times
    sync: [                         // ready for checks.run({ sync })
      { t: hard.no1, name: 'NO 1' }, { t: hard.no2, name: 'NO 2' }, { t: hard.slab, name: 'the slab' }
    ],
    events: events,
    score: S,                       // everything else in video/score.js, untouched
    at: at, barOf: barOf, frameOf: frameOf
  };
}

module.exports = { load: load, SCORE_FILE: SCORE_FILE, EVENTS_FILE: EVENTS_FILE };

if (require.main === module) {
  const tl = load();
  const show = Object.assign({}, tl, { events: tl.events.length + ' rows', score: '(video/score.js)' });
  delete show.at; delete show.barOf; delete show.frameOf;
  console.log(JSON.stringify(show, null, 1));
}
