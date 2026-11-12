#!/usr/bin/env node
/*
 * tools/test-slotting.js
 * -----------------------------------------------------------------------------
 * Checks the synthetic warehouse-slotting model (deck/lib/slotting-core.js),
 * the command-line demo (demo/slotting/run.js) and, in a real browser, that
 * the deck computes exactly the same numbers as the command line.
 *
 *     node tools/test-slotting.js               everything (about 40 seconds)
 *     node tools/test-slotting.js --no-browser  skip the browser part (no Playwright needed)
 *
 * No test framework: every check prints one PASS or FAIL line, and the script
 * exits non-zero if anything failed.
 *
 * What it covers
 *   1. The building blocks: the random-number generator, e^-x, the parameters.
 *   2. The synthetic world: size, long tail, A/B/C classes, orders.
 *   3. Placements: every part has exactly one slot and no slot holds two parts.
 *   4. Walking: distances are true shortest walks along aisles (checked against
 *      an independent shortest-path search) and no route cuts through a rack.
 *   5. Scoring: the yearly figures are the sum of the individual pick runs.
 *   6. The optimizer: it beats the as-is move and the rule of thumb, keeps the
 *      shelf rules, and gives the same answer however it is sliced.
 *   7. Determinism: same seed same numbers, different seed different numbers.
 *   8. Speed: a full default run in under 5 seconds.
 *   9. The command-line demo.
 *  10. Node against a browser page: identical, digit for digit.
 *  11. The slide itself (deck/index.html, "slotting-live"): it shows the
 *      library's numbers and nothing else, carries its synthetic-data label on
 *      every step, steps back to exactly what it showed before, replays the
 *      same frame for the same moment, and stops when you leave.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var CORE = path.join(ROOT, 'deck', 'lib', 'slotting-core.js');
var MOTION = path.join(ROOT, 'deck', 'lib', 'motion.js');
var CLI = path.join(ROOT, 'demo', 'slotting', 'run.js');
var SKIP_BROWSER = process.argv.indexOf('--no-browser') !== -1;

var passed = 0;
var failed = 0;

function section(title) { console.log('\n== ' + title + ' =='); }

function ok(condition, label, detail) {
  if (condition) { passed += 1; console.log('PASS  ' + label); }
  else { failed += 1; console.log('FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
  return !!condition;
}

function is(actual, expected, label) {
  return ok(actual === expected, label, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function near(actual, expected, label, tolerance) {
  var tol = tolerance === undefined ? 1e-9 * Math.max(1, Math.abs(expected)) : tolerance;
  return ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol, label,
    'expected ' + expected + ' (+/- ' + tol + '), got ' + actual);
}

function requirePlaywright() {
  try { return require('playwright'); } catch (e) { /* try the global folders next */ }
  var roots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  try { roots.push(childProcess.execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch (e) { /* no npm */ }
  for (var i = 0; i < roots.length; i++) {
    try { return require(path.join(roots[i], 'playwright')); } catch (e) { /* keep looking */ }
  }
  return null;
}

/* -----------------------------------------------------------------------------
 * Independent helpers: written without looking at how the library does it.
 * -------------------------------------------------------------------------- */

/* Shortest walking distance from one point to every bay position, by a plain
 * shortest-path search over the walkways: aisle centre lines (front to back)
 * and cross-aisle centre lines (side to side). */
function shortestWalks(world, fromX, fromY) {
  var L = world.layout;
  var nodes = [];                     // { x, y }
  var index = {};
  function node(x, y) {
    var key = x + '|' + y;
    if (index[key] === undefined) { index[key] = nodes.length; nodes.push({ x: x, y: y, edges: [] }); }
    return index[key];
  }
  function link(a, b) {
    var d = Math.abs(nodes[a].x - nodes[b].x) + Math.abs(nodes[a].y - nodes[b].y);
    nodes[a].edges.push([b, d]);
    nodes[b].edges.push([a, d]);
  }
  var a, c;
  for (a = 0; a < L.aisles; a++) {
    var ys = L.crossY.slice();
    L.bayY.forEach(function (block) { block.forEach(function (y) { ys.push(y); }); });
    if (L.aisleX[a] === fromX) { ys.push(fromY); }
    ys.sort(function (m, n) { return m - n; });
    for (var k = 0; k < ys.length; k++) {
      var id = node(L.aisleX[a], ys[k]);
      if (k > 0 && ys[k] !== ys[k - 1]) { link(node(L.aisleX[a], ys[k - 1]), id); }
    }
  }
  for (c = 0; c < L.crossY.length; c++) {
    for (a = 1; a < L.aisles; a++) { link(node(L.aisleX[a - 1], L.crossY[c]), node(L.aisleX[a], L.crossY[c])); }
  }
  var start = node(fromX, fromY);
  var dist = nodes.map(function () { return Infinity; });
  var done = nodes.map(function () { return false; });
  dist[start] = 0;
  for (var round = 0; round < nodes.length; round++) {
    var best = -1;
    for (var i = 0; i < nodes.length; i++) { if (!done[i] && (best < 0 || dist[i] < dist[best])) { best = i; } }
    if (best < 0 || dist[best] === Infinity) { break; }
    done[best] = true;
    nodes[best].edges.forEach(function (e) { if (dist[best] + e[1] < dist[e[0]]) { dist[e[0]] = dist[best] + e[1]; } });
  }
  return function (x, y) { return dist[index[x + '|' + y]]; };
}

/* Does every leg of a walk stay on a walkway? Vertical legs must be on an
 * aisle centre line; horizontal legs must be on a cross-aisle centre line. */
function staysOnWalkways(world, pathPoints) {
  var L = world.layout;
  for (var i = 1; i < pathPoints.length; i++) {
    var p = pathPoints[i - 1], q = pathPoints[i];
    if (p[0] === q[0]) {
      if (L.aisleX.indexOf(p[0]) === -1) { return false; }
      if (Math.min(p[1], q[1]) < 0 || Math.max(p[1], q[1]) > L.length) { return false; }
    } else if (p[1] === q[1]) {
      if (L.crossY.indexOf(p[1]) === -1) { return false; }
      if (Math.min(p[0], q[0]) < 0 || Math.max(p[0], q[0]) > L.width) { return false; }
    } else {
      return false;
    }
  }
  return true;
}

/* Every part in exactly one slot, no slot with two parts. */
function soundPlacement(world, a) {
  var nParts = world.totals.parts, nSlots = world.totals.slots;
  if (a.partSlot.length !== nParts || a.slotPart.length !== nSlots) { return 'wrong shape'; }
  var uses = new Array(nSlots).fill(0);
  for (var p = 0; p < nParts; p++) {
    var s = a.partSlot[p];
    if (!(s >= 0 && s < nSlots)) { return 'part ' + p + ' has no slot'; }
    uses[s]++;
    if (a.slotPart[s] !== p) { return 'slot ' + s + ' does not list part ' + p; }
  }
  var filled = 0;
  for (var k = 0; k < nSlots; k++) {
    if (uses[k] > 1) { return 'slot ' + k + ' holds ' + uses[k] + ' parts'; }
    if (a.slotPart[k] !== -1) { filled++; }
  }
  return filled === nParts ? '' : filled + ' slots filled for ' + nParts + ' parts';
}

function shareOk(v) { return typeof v === 'number' && v >= 0 && v <= 1; }

/* -----------------------------------------------------------------------------
 * The tests
 * -------------------------------------------------------------------------- */

function testBasics(S, Motion) {
  section('1. Building blocks');
  ok(typeof S.build === 'function' && typeof S.asIs === 'function' && typeof S.seedLayout === 'function' &&
    typeof S.route === 'function' && typeof S.score === 'function' && typeof S.anneal === 'function' &&
    typeof S.annealer === 'function' && typeof S.run === 'function',
    'Slotting has build, asIs, seedLayout, route, score, anneal, annealer and run');

  var mine = S._rng(20261113);
  var theirs = Motion.rng(20261113);
  var same = true;
  for (var i = 0; i < 5000; i++) { if (mine() !== theirs.next()) { same = false; break; } }
  ok(same, 'the built-in random numbers are the same sequence as Motion.rng, bit for bit (5,000 draws)');

  var worst = 0;
  for (var x = 0; x <= 30; x += 0.137) { worst = Math.max(worst, Math.abs(S._expNeg(x) - Math.exp(-x))); }
  ok(worst < 1e-9, 'the hand-built e^-x agrees with Math.exp to nine decimals', 'worst error ' + worst);
  is(S._expNeg(0), 1, 'e^-0 is exactly 1');
  is(S._expNeg(100), 0, 'e^-100 is treated as 0');

  var src = fs.readFileSync(CORE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  var banned = src.match(/Math\.(log|log2|log10|exp|pow|sin|cos|tan|atan|atan2|random)\b|\*\*/g);
  ok(!banned, 'the model uses none of the functions that differ between Node and a browser (log, exp, pow, sin, cos...) and no Math.random',
    'found: ' + (banned || []).join(', '));
  ok(!/\bdocument\b|\bsetTimeout\b|\bfetch\b|\brequire\(/.test(src), 'the model is pure logic: no DOM, no timers, no network, no imports');

  var P = S.params({ parts: 5, orders: -3, aisles: 1000, walkFtPerSec: 'fast', classCuts: [0.9, 0.2] });
  ok(P.parts >= 20 && P.orders >= 10 && P.aisles <= 40 && P.walkFtPerSec === S.defaults.walkFtPerSec && P.classCuts[0] < P.classCuts[1],
    'nonsense parameters are pulled back to usable values');
  var Pd = S.params();
  is(Pd.aisles, 12, 'default: 12 aisles per block');
  is(Pd.walkFtPerSec, 3, 'default: walking at 3 ft per second');
  ok(Pd.keepZones === true, 'default: the optimizer keeps the shelf rules');
}

function testWorld(S, r) {
  section('2. The synthetic world (default seed)');
  var w = r.world, L = w.layout;
  ok(r.synthetic === true, 'the run is flagged synthetic');
  is(L.blocks, 2, 'two blocks of racks');
  is(L.aisles, 12, '12 aisles per block');
  is(L.levels, 6, '6 shelf levels per bay');
  is(L.zones.join(','), 'floor,golden,golden,reach,ladder,ladder', 'level 1 floor, 2-3 golden zone, 4 reach, 5-6 ladder');
  is(L.crossY.length, 3, 'a front, a centre and a back cross-aisle');
  ok(L.crossY[1] > L.blockY0[0] + L.blockLength - 1e-9 && L.crossY[1] < L.blockY0[1] + 1e-9, 'the centre cross-aisle runs between the two blocks');
  is(w.totals.slots, L.blocks * L.aisles * 2 * L.baysPerFace * L.levels, 'slots = blocks x aisles x 2 faces x bays x levels');
  is(w.slots.length, w.totals.slots, 'every slot is listed');
  ok(w.totals.parts >= 1400 && w.totals.parts <= 1600, 'about 1,500 parts', 'got ' + w.totals.parts);
  var ratio = w.totals.slots / w.totals.parts;
  ok(ratio >= 1.05 && ratio <= 1.2, 'slots are roughly 1.1 x parts', 'got ' + ratio.toFixed(3));
  ok(w.totals.orders >= 1900 && w.totals.orders <= 2100, 'about 2,000 orders in the year', 'got ' + w.totals.orders);
  ok(L.pack.y === 0 && L.aisleX.indexOf(L.pack.x) !== -1, 'the pack station is at a door on the front wall, at the foot of an aisle');
  ok(w.totals.parts !== 6493 && w.totals.slots !== 7110 && w.totals.orders !== 1983,
    'the synthetic warehouse does not reuse the real project\'s counts');

  var sizes = {}, minLines = Infinity, maxLines = 0, dupes = 0, lines = 0, badDay = 0, lastDay = 0, outOfOrder = 0;
  w.orders.forEach(function (o) {
    minLines = Math.min(minLines, o.lines.length);
    maxLines = Math.max(maxLines, o.lines.length);
    sizes[o.lines.length] = 1;
    lines += o.lines.length;
    var seen = {};
    o.lines.forEach(function (p) { if (seen[p]) { dupes++; } seen[p] = 1; if (!(p >= 0 && p < w.totals.parts)) { dupes++; } });
    if (!(o.day >= 1 && o.day <= w.params.workDays)) { badDay++; }
    if (o.day < lastDay) { outOfOrder++; }
    lastDay = o.day;
  });
  ok(minLines === 1 && maxLines === 8 && Object.keys(sizes).length === 8, 'orders have 1 to 8 lines, and every size occurs');
  is(dupes, 0, 'no order lists the same part twice');
  is(badDay + outOfOrder, 0, 'every order has a working day, and the orders are in date order');
  is(lines, w.totals.picks, 'total picks = total order lines');

  var picks = w.parts.map(function (p) { return p.picks; });
  is(picks.reduce(function (m, n) { return m + n; }, 0), w.totals.picks, 'the parts\' pick counts add up to the order lines');
  var sorted = picks.slice().sort(function (m, n) { return n - m; });
  var top = 0, fifth = Math.round(sorted.length / 5);
  for (var i = 0; i < fifth; i++) { top += sorted[i]; }
  ok(top / w.totals.picks > 0.7, 'a long tail: the busiest fifth of the parts take more than 70% of the picks',
    'got ' + (100 * top / w.totals.picks).toFixed(1) + '%');
  ok(sorted[0] > 50 * Math.max(1, sorted[Math.floor(sorted.length / 2)]), 'the busiest part is picked more than 50 times as often as the median part');

  is(w.classes.A + w.classes.B + w.classes.C, w.totals.parts, 'every part is classed A, B or C');
  var minA = Infinity, maxB = 0, minB = Infinity, maxC = 0, aPicks = 0, abPicks = 0;
  w.parts.forEach(function (p) {
    if (p.cls === 'A') { minA = Math.min(minA, p.picks); aPicks += p.picks; abPicks += p.picks; }
    if (p.cls === 'B') { maxB = Math.max(maxB, p.picks); minB = Math.min(minB, p.picks); abPicks += p.picks; }
    if (p.cls === 'C') { maxC = Math.max(maxC, p.picks); }
  });
  ok(minA >= maxB && minB >= maxC, 'classes follow pick counts: every A is picked at least as often as any B, every B as any C');
  ok(aPicks / w.totals.picks >= 0.8 && aPicks / w.totals.picks < 0.85, 'the A parts make up the first 80% of picks',
    'got ' + (100 * aPicks / w.totals.picks).toFixed(1) + '%');
  ok(abPicks / w.totals.picks >= 0.95, 'A and B together make up 95% of picks');

  // co-ordering: parts of one family turn up together far more often than chance
  var together = 0, pairs = 0;
  w.orders.forEach(function (o) {
    for (var m = 0; m < o.lines.length; m++) {
      for (var n = m + 1; n < o.lines.length; n++) {
        pairs++;
        if (w.parts[o.lines[m]].family === w.parts[o.lines[n]].family) { together++; }
      }
    }
  });
  ok(together / pairs > 0.05, 'some parts tend to be ordered together (same-family pairs are common)',
    (100 * together / pairs).toFixed(1) + '% of pairs');
}

function testPlacements(S, r) {
  section('3. Placements');
  var w = r.world;
  is(soundPlacement(w, r.asIs), '', 'as-is move: every part has exactly one slot and no slot holds two parts');
  is(soundPlacement(w, r.seed), '', 'rule of thumb: every part has exactly one slot and no slot holds two parts');
  is(soundPlacement(w, r.optimized), '', 'optimized: every part has exactly one slot and no slot holds two parts');
  is(S.validate(w, r.asIs).length + S.validate(w, r.seed).length + S.validate(w, r.optimized).length, 0, 'Slotting.validate agrees');

  var broken = S.copyAssignment(r.optimized);
  broken.partSlot[3] = broken.partSlot[4];
  ok(S.validate(w, broken).length > 0, 'Slotting.validate notices two parts in one slot');

  // as-is: unrelated to velocity, every level used
  var levelParts = [0, 0, 0, 0, 0, 0];
  for (var p = 0; p < w.totals.parts; p++) { levelParts[w.slots[r.asIs.partSlot[p]].level - 1]++; }
  ok(levelParts.every(function (n) { return n >= w.totals.parts / 6 - 6; }), 'as-is move: every shelf level is filled, ladder levels included',
    levelParts.join('/'));
  var n = w.totals.parts, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (p = 0; p < n; p++) {
    var xv = r.asIs.partSlot[p], yv = w.parts[p].picks;
    sx += xv; sy += yv; sxx += xv * xv; syy += yv * yv; sxy += xv * yv;
  }
  var corr = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  ok(Math.abs(corr) < 0.08, 'as-is move: where a part sits has nothing to do with how often it is picked', 'correlation ' + corr.toFixed(3));

  // the rule of thumb
  var s = r.seeded;
  is(s.aGoldenShare, 1, 'rule of thumb: every fast mover (A) is in the golden zone');
  is(s.bOffLadderShare, 1, 'rule of thumb: every medium mover (B) is off the ladder');
  var aFeet = 0, aN = 0, cFeet = 0, cN = 0;
  for (p = 0; p < n; p++) {
    var slot = w.slots[r.seed.partSlot[p]];
    if (w.parts[p].cls === 'A') { aFeet += slot.packFeet; aN++; }
    if (w.parts[p].cls === 'C') { cFeet += slot.packFeet; cN++; }
  }
  ok(aFeet / aN < 0.75 * cFeet / cN, 'rule of thumb: fast movers sit nearer the pack station than slow movers',
    (aFeet / aN).toFixed(1) + ' ft against ' + (cFeet / cN).toFixed(1) + ' ft');
}

function testWalking(S, r) {
  section('4. Walking');
  var w = r.world, L = w.layout;

  var fromPack = shortestWalks(w, L.pack.x, L.pack.y);
  var worst = 0;
  w.slots.forEach(function (slot) { worst = Math.max(worst, Math.abs(slot.packFeet - fromPack(slot.x, slot.y))); });
  ok(worst < 1e-9, 'pack station to every slot: the distance is the true shortest walk along the aisles (independent search)', 'worst gap ' + worst + ' ft');

  // every leg the library walks, against the independent search
  var worst2 = 0, legs = 0;
  [r.asIs, r.optimized].forEach(function (a) {
    for (var o = 0; o < w.orders.length; o += 3) {
      var rt = S.route(w, a, o);
      var px = L.pack.x, py = L.pack.y, walked = 0;
      rt.stops.forEach(function (stop) {
        var want = shortestWalksCached(w, px, py)(stop.x, stop.y);
        worst2 = Math.max(worst2, Math.abs((stop.atFeet - walked) - want));
        walked = stop.atFeet; px = stop.x; py = stop.y; legs++;
      });
      worst2 = Math.max(worst2, Math.abs((rt.feet - walked) - fromPack(px, py)));
      legs++;
    }
  });
  ok(worst2 < 1e-9, 'slot to slot: every leg the library walks (' + legs + ' checked) is the true shortest walk along the aisles', 'worst gap ' + worst2 + ' ft');

  var crossed = 0, offWalkway = 0, wrongLength = 0, wrongEnds = 0, wrongStops = 0, notNearest = 0, checked = 0;
  [r.asIs, r.seed, r.optimized].forEach(function (a) {
    for (var o2 = 0; o2 < w.orders.length; o2++) {
      var route = S.route(w, a, o2);
      checked++;
      if (S.pathCrossesRack(w, route.path)) { crossed++; }
      if (!staysOnWalkways(w, route.path)) { offWalkway++; }
      if (Math.abs(S.pathFeet(route.path) - route.feet) > 1e-6) { wrongLength++; }
      var first = route.path[0], last = route.path[route.path.length - 1];
      if (first[0] !== L.pack.x || first[1] !== L.pack.y || last[0] !== L.pack.x || last[1] !== L.pack.y) { wrongEnds++; }
      var want = w.orders[o2].lines.slice().sort(function (m, n) { return m - n; }).join(',');
      var got = route.stops.map(function (s) { return s.part; }).sort(function (m, n) { return m - n; }).join(',');
      if (want !== got) { wrongStops++; }
      // nearest neighbour: each stop is no farther from the previous one than any stop still to come
      var px = L.pack.x, py = L.pack.y;
      for (var k = 0; k < route.stops.length; k++) {
        var from = shortestWalksCached(w, px, py);
        var dHere = from(route.stops[k].x, route.stops[k].y);
        for (var j = k + 1; j < route.stops.length; j++) {
          if (from(route.stops[j].x, route.stops[j].y) < dHere - 1e-9) { notNearest++; }
        }
        px = route.stops[k].x; py = route.stops[k].y;
      }
    }
  });
  is(crossed, 0, 'no route crosses a rack (' + checked + ' pick runs: as-is, rule of thumb and optimized)');
  is(offWalkway, 0, 'every leg of every route runs along an aisle or a cross-aisle centre line');
  is(wrongLength, 0, 'the length of each drawn route equals the feet reported for it');
  is(wrongEnds, 0, 'every route starts and ends at the pack station');
  is(wrongStops, 0, 'every route visits exactly the parts on its order');
  is(notNearest, 0, 'every route goes to the nearest remaining pick next (nearest neighbour)');

  ok(S.pathCrossesRack(w, [[L.aisleX[0], L.bayY[0][0]], [L.aisleX[1], L.bayY[0][0]]]), 'a straight line from one aisle to the next, through the shelving, is caught');
  ok(S.pathCrossesRack(w, [[L.aisleX[0], 0], [L.aisleX[2], L.length]]), 'a diagonal is caught');

  // ladder set-ups: one per ladder bay per order
  var wrongSetups = 0;
  for (var o3 = 0; o3 < w.orders.length; o3++) {
    var rr = S.route(w, r.asIs, o3);
    var bays = {};
    rr.stops.forEach(function (s) { if (s.ladder) { bays[w.slots[s.slot].face] = 1; } });
    if (Object.keys(bays).length !== rr.ladderSetups || rr.stops.filter(function (s) { return s.ladderSetup; }).length !== rr.ladderSetups) { wrongSetups++; }
  }
  is(wrongSetups, 0, 'one ladder set-up per ladder bay per order');

  // the pick-time model, re-added by hand for every order
  var P = w.params, worstSec = 0;
  for (var o4 = 0; o4 < w.orders.length; o4++) {
    var q = S.route(w, r.asIs, o4);
    var sec = q.feet / P.walkFtPerSec + q.ladderSetups * P.ladderSetupSec;
    q.stops.forEach(function (s) { sec += s.zone === 'floor' ? P.floorSec : (s.zone === 'reach' ? P.reachSec : 0); });
    worstSec = Math.max(worstSec, Math.abs(sec - q.seconds));
  }
  ok(worstSec < 1e-6, 'pick time = feet / 3 ft per second + seconds for floor and reach picks + ladder set-ups', 'worst gap ' + worstSec + ' s');
}

var walkCache = {};
function shortestWalksCached(w, x, y) {
  var key = x + '|' + y;
  if (!walkCache[key]) { walkCache[key] = shortestWalks(w, x, y); }
  return walkCache[key];
}

function testScore(S, r) {
  section('5. Scoring');
  var w = r.world;
  [['as-is move', r.asIs, r.before], ['optimized', r.optimized, r.after]].forEach(function (row) {
    var name = row[0], a = row[1], s = row[2];
    var feet = 0, seconds = 0, setups = 0, ladderPicks = 0, byLevel = [0, 0, 0, 0, 0, 0];
    for (var o = 0; o < w.orders.length; o++) {
      var rt = S.route(w, a, o);
      feet += rt.feet; seconds += rt.seconds; setups += rt.ladderSetups;
      rt.stops.forEach(function (st) { byLevel[st.level - 1]++; if (st.ladder) { ladderPicks++; } });
    }
    near(s.ftPerRun, feet / w.orders.length, name + ': feet per pick run is the average over every order of the year', 1e-6);
    near(s.pickHoursPerYear, seconds / 3600, name + ': pick hours per year is the sum of every pick run', 1e-6);
    is(s.ladderSetupsPerYear, setups, name + ': ladder set-ups per year is the sum over the orders');
    near(s.ladderPickShare, ladderPicks / w.totals.picks, name + ': ladder share = picks from levels 5 and 6 / all picks', 1e-12);
    is(s.picksByLevel.join('/'), byLevel.join('/'), name + ': picks by shelf level match the routes');
    is(s.picksByLevel.reduce(function (m, n) { return m + n; }, 0), w.totals.picks, name + ': picks by level add up to all picks');
    ok(shareOk(s.ladderPickShare) && shareOk(s.aGoldenShare) && shareOk(s.bOffLadderShare), name + ': every share is between 0 and 1');
    var aGold = 0, aAll = 0, bOff = 0, bAll = 0;
    w.parts.forEach(function (p) {
      var zone = w.slots[a.partSlot[p.id]].zone;
      if (p.cls === 'A') { aAll++; if (zone === 'golden') { aGold++; } }
      if (p.cls === 'B') { bAll++; if (zone !== 'ladder') { bOff++; } }
    });
    near(s.aGoldenShare, aGold / aAll, name + ': fast movers in the golden zone, recounted', 1e-12);
    near(s.bOffLadderShare, bOff / bAll, name + ': medium movers off the ladder, recounted', 1e-12);
  });
}

function testOptimizer(S, r) {
  section('6. The optimizer');
  var w = r.world, b = r.before, s = r.seeded, a = r.after, an = r.anneal;
  ok(a.pickHoursPerYear < b.pickHoursPerYear, 'optimized pick time is lower than the as-is move',
    a.pickHoursPerYear.toFixed(2) + ' h against ' + b.pickHoursPerYear.toFixed(2) + ' h');
  ok(a.pickHoursPerYear < s.pickHoursPerYear, 'the search improves on the rule of thumb it starts from',
    a.pickHoursPerYear.toFixed(2) + ' h against ' + s.pickHoursPerYear.toFixed(2) + ' h');
  ok(s.pickHoursPerYear < b.pickHoursPerYear, 'the rule of thumb alone already beats the as-is move');
  ok(a.ftPerRun < b.ftPerRun, 'optimized walking per run is shorter than the as-is move');
  ok(a.ladderPickShare < b.ladderPickShare, 'fewer picks need a ladder');
  ok(a.aGoldenShare > b.aGoldenShare, 'more fast movers are in the golden zone');
  is(a.aGoldenShare, 1, 'shelf rule kept: every fast mover is still in the golden zone after the search');
  is(a.bOffLadderShare, 1, 'shelf rule kept: every medium mover is still off the ladder after the search');

  is(an.tried, w.params.iterations, 'swaps tried = the iteration count asked for');
  ok(an.accepted > 0 && an.accepted < an.tried && an.improved > 0 && an.improved <= an.accepted, 'some swaps were kept, most were not');
  near(an.startHours, s.pickHoursPerYear, 'the cost curve starts at the rule of thumb', 1e-9);
  near(an.endHours, a.pickHoursPerYear, 'the cost the optimizer reports is the cost a fresh replay of the year gives', 1e-9);
  near(an.trace[0].hours, an.startHours, 'trace: first point is the start', 1e-9);
  near(an.trace[an.trace.length - 1].hours, an.endHours, 'trace: last point is the end (the running total did not drift)', 1e-6);
  var rising = 0, peak = 0;
  for (var i = 1; i < an.trace.length; i++) { if (an.trace[i].tried <= an.trace[i - 1].tried) { rising++; } peak = Math.max(peak, an.trace[i].hours); }
  is(rising, 0, 'trace: swaps tried only goes up');
  ok(an.trace.length >= 100 && an.trace.length <= 300, 'trace: enough points to draw a curve', an.trace.length + ' points');
  ok(peak <= an.startHours * 1.05, 'the cost curve falls: it never climbs more than 5% above where it started', 'peak ' + peak.toFixed(2) + ' h');

  // the log of kept swaps reproduces the result, move by move
  var replayed = S.replay(w, r.seed, an.log);
  ok(sameInts(replayed.partSlot, r.optimized.partSlot), 'replaying the ' + an.log.count + ' kept swaps from the start gives the optimized placement');
  var half = S.replay(w, r.seed, an.log, Math.floor(an.log.count / 2));
  is(soundPlacement(w, half), '', 'half-way through the search the placement is still sound');
  var halfHours = S.score(w, half).pickHoursPerYear;
  ok(halfHours < s.pickHoursPerYear && halfHours > a.pickHoursPerYear, 'half-way through, the cost is between start and finish');
  ok(an.moves.length >= 100, 'a sample of kept swaps is kept for the animation', an.moves.length + ' moves');
  var badMove = 0, lastTried = 0;
  an.moves.forEach(function (m) { if (!(m.tried > lastTried && m.delta < 0 && m.from !== m.to)) { badMove++; } lastTried = m.tried; });
  is(badMove, 0, 'every sampled swap really did shorten pick time, and they are in order');

  // sliced runs: the same answer however step() is called
  var whole = S.anneal(w, r.seed, { iterations: 30000 });
  var sliced = S.annealer(w, r.seed, { iterations: 30000 });
  var rng = S._rng(99);
  var calls = 0;
  while (!sliced.step(1 + Math.floor(rng() * 700))) { calls++; }
  var slicedResult = sliced.result();
  ok(calls > 20 && sameInts(whole.assignment.partSlot, slicedResult.assignment.partSlot) && whole.accepted === slicedResult.accepted &&
    whole.endHours === slicedResult.endHours && JSON.stringify(whole.trace) === JSON.stringify(slicedResult.trace),
    'run in ' + calls + ' uneven slices, the optimizer gives exactly the answer of one long run');
  is(sliced.progress, 1, 'a finished run reports progress 1');
  ok(sliced.step(1000) === true && sliced.tried === 30000, 'stepping a finished run does nothing');

  var job = S.start(null, { iterations: 5000 });
  ok(job.done === false && job.progress === 0, 'Slotting.start: nothing has run before the first step');
  while (!job.step(1234)) { /* keep going */ }
  var viaStart = job.result();
  var viaRun = S.run(null, { iterations: 5000 });
  is(S.digest(viaStart).hash, S.digest(viaRun).hash, 'Slotting.start (sliced) and Slotting.run (one call) agree');

  // other knobs
  var other = S.anneal(w, r.seed, { iterations: 30000, seed: 5 });
  ok(!sameInts(other.assignment.partSlot, whole.assignment.partSlot), 'a different optimizer seed takes a different path');
  var sampled = S.anneal(w, r.seed, { iterations: 30000, sampleOrders: 500 });
  ok(sampled.sampleOrders === 500 && S.score(w, sampled.assignment).pickHoursPerYear < s.pickHoursPerYear,
    'judging swaps on a sample of 500 orders still improves the whole year');
  var free = S.anneal(w, r.seed, { iterations: 30000, keepZones: false });
  var freeScore = S.score(w, free.assignment);
  ok(freeScore.aGoldenShare < 1 && freeScore.pickHoursPerYear < S.score(w, whole.assignment).pickHoursPerYear,
    'with the shelf rules switched off the optimizer trades the golden zone for a shorter walk');
  var none = S.anneal(w, r.seed, { iterations: 0 });
  ok(sameInts(none.assignment.partSlot, r.seed.partSlot) && none.tried === 0, 'zero iterations returns the starting placement');
  ok(sameInts(r.seed.partSlot, S.seedLayout(w).partSlot), 'the optimizer never changes the placement it was given');
}

function sameInts(a, b) {
  if (a.length !== b.length) { return false; }
  for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) { return false; } }
  return true;
}

function testDeterminism(S, r) {
  section('7. Same seed, same numbers');
  var again = S.run();
  is(S.digest(again).hash, S.digest(r).hash, 'two default runs give identical results (every placement, every figure, every kept swap)');
  is(S.digest(again).text, S.digest(r).text, '...and identical headline figures at full precision');
  var seven = S.run({ seed: 7 }, { iterations: 40000 });
  var sevenAgain = S.run({ seed: 7 }, { iterations: 40000 });
  var eight = S.run({ seed: 8 }, { iterations: 40000 });
  is(S.digest(seven).hash, S.digest(sevenAgain).hash, 'seed 7 twice: identical');
  ok(S.digest(seven).hash !== S.digest(eight).hash && seven.before.ftPerRun !== eight.before.ftPerRun &&
    seven.after.pickHoursPerYear !== eight.after.pickHoursPerYear, 'seed 7 and seed 8: different numbers');
  ok(S.digest(seven).hash !== S.digest(r).hash, 'seed 7 differs from the default seed');
  [seven, eight].forEach(function (run, i) {
    ok(run.after.pickHoursPerYear < run.before.pickHoursPerYear && soundPlacement(run.world, run.optimized) === '',
      'seed ' + (7 + i) + ': the optimizer still beats the as-is move, and the placement is sound');
  });
  var small = S.run({ parts: 300, orders: 400 }, { iterations: 20000 });
  ok(small.world.totals.parts === 300 && small.after.pickHoursPerYear < small.before.pickHoursPerYear && soundPlacement(small.world, small.optimized) === '',
    'a smaller warehouse (300 parts, 400 orders) works too');
}

function testSpeed(S) {
  section('8. Speed');
  var t0 = Date.now();
  var r = S.run();
  var wall = Date.now() - t0;
  ok(wall < 5000, 'a full default run finishes in under 5 seconds here (Node)', wall + ' ms');
  ok(r.timings.totalMs > 0 && r.timings.totalMs <= wall + 5 && r.anneal.ms > 0 && r.anneal.ms <= r.timings.totalMs,
    'the reported run time is a real measurement (' + Math.round(r.anneal.ms) + ' ms of searching, ' + Math.round(r.timings.totalMs) + ' ms in all)');
}

function testCli(S, r) {
  section('9. The command-line demo');
  var out = '';
  var code = 0;
  try { out = childProcess.execFileSync(process.execPath, [CLI], { encoding: 'utf8' }); }
  catch (e) { code = e.status || 1; out = String(e.stdout || '') + String(e.stderr || ''); }
  is(code, 0, 'node demo/slotting/run.js exits cleanly');
  ok(/synthetic/i.test(out) && /not results from any real/i.test(out), 'it says plainly that the data is synthetic');
  ok(out.indexOf(r.before.ftPerRun.toFixed(1) + ' ft') !== -1 && out.indexOf(r.after.ftPerRun.toFixed(1) + ' ft') !== -1 &&
    out.indexOf(r.before.pickHoursPerYear.toFixed(1) + ' h') !== -1 && out.indexOf(r.after.pickHoursPerYear.toFixed(1) + ' h') !== -1,
    'the before / after table shows the library\'s own numbers');
  ok(/240,000 swaps tried/.test(out) && /\d ms/.test(out) && /No AI model in the loop/.test(out), 'it prints the swaps tried and the run time');
  ok(out.indexOf(S.digest(r).hash) !== -1, 'it prints the same fingerprint as a run made here');

  var json = JSON.parse(childProcess.execFileSync(process.execPath, [CLI, '--seed', '7', '--parts', '600', '--iterations', '20000', '--json'], { encoding: 'utf8' }));
  ok(json.synthetic === true && json.seed === 7 && json.parts.total === 600 && json.optimizer.swapsTried === 20000 &&
    json.optimized.pickHoursPerYear < json.asIs.pickHoursPerYear, '--seed, --parts, --iterations and --json work');
  var direct = S.run({ seed: 7, parts: 600 }, { iterations: 20000 });
  is(json.fingerprint, S.digest(direct).hash, 'the demo with --seed 7 --parts 600 matches the library called directly');

  var bad = 0;
  try { childProcess.execFileSync(process.execPath, [CLI, '--seed', 'banana'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { bad = e.status; }
  is(bad, 2, 'a bad option is refused with exit code 2');
}

async function testBrowser(S, r) {
  section('10. Node against a browser page');
  if (SKIP_BROWSER) { console.log('SKIP  --no-browser was given'); return; }
  var pw = requirePlaywright();
  if (!pw) { ok(false, 'Playwright is installed', 'install it once, globally: npm install -g playwright'); return; }

  var browser = await pw.chromium.launch();
  try {
    var page = await browser.newPage();
    var errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.goto('about:blank');
    await page.addScriptTag({ path: MOTION });
    await page.addScriptTag({ path: CORE });
    var got = await page.evaluate(function () {
      var t0 = performance.now();
      var run = window.Slotting.run();
      var wall = performance.now() - t0;
      var seven = window.Slotting.run({ seed: 7 }, { iterations: 40000 });
      // and in slices, the way the deck does it
      var job = window.Slotting.start();
      while (!job.step(3000)) { /* next slice */ }
      return {
        usesMotion: !!(window.Motion && window.Motion.rng),
        digest: window.Slotting.digest(run),
        sliced: window.Slotting.digest(job.result()).hash,
        seven: window.Slotting.digest(seven).hash,
        wall: wall,
        annealMs: run.anneal.ms,
        before: run.before, after: run.after, tried: run.anneal.tried, accepted: run.anneal.accepted
      };
    });
    ok(got.usesMotion, 'in the browser the model draws its random numbers from Motion.rng');
    is(got.digest.hash, S.digest(r).hash, 'the default run has the same fingerprint in Chromium and in Node');
    is(got.digest.text, S.digest(r).text, 'the headline figures agree at full precision, digit for digit');
    is(got.sliced, S.digest(r).hash, 'run in slices in the browser (as the deck does): the same fingerprint again');
    is(got.seven, S.digest(S.run({ seed: 7 }, { iterations: 40000 })).hash, 'seed 7: same fingerprint in Chromium and in Node');
    is(JSON.stringify(got.after), JSON.stringify(r.after), 'the optimized scorecard is identical, field for field');
    ok(got.wall < 5000, 'a full default run finishes in under 5 seconds in headless Chromium', Math.round(got.wall) + ' ms');
    is(errors.length, 0, 'no errors on the page');

    // without Motion on the page the built-in generator must give the same answer
    var bare = await browser.newPage();
    await bare.goto('about:blank');
    await bare.addScriptTag({ path: CORE });
    var bareHash = await bare.evaluate(function () { return window.Slotting.digest(window.Slotting.run(null, { iterations: 20000 })).hash; });
    is(bareHash, S.digest(S.run(null, { iterations: 20000 })).hash, 'a page without Motion (built-in generator) gives the same fingerprint too');
  } finally {
    await browser.close();
  }
}

/* What the slide should print for a run, written out independently of the scene. */
function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function pctText(share) {
  var v = share * 100;
  if (v > 0 && v < 9.95 && Math.abs(v - Math.round(v)) > 0.05) { return (Math.round(v * 10) / 10).toFixed(1) + '%'; }
  return Math.round(v) + '%';
}

async function testSlide(S, r) {
  section('11. The slide in the deck');
  if (SKIP_BROWSER) { console.log('SKIP  --no-browser was given'); return; }
  var pw = requirePlaywright();
  if (!pw) { ok(false, 'Playwright is installed', 'install it once, globally: npm install -g playwright'); return; }
  var deckUrl = require('url').pathToFileURL(path.join(ROOT, 'deck', 'index.html')).href;

  var browser = await pw.chromium.launch();
  try {
    var page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    var errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); });
    page.on('console', function (m) { if (m.type() === 'error') { errors.push(m.text()); } });
    await page.goto(deckUrl + '?fast#/slotting-live/0');
    await page.waitForFunction(function () { return window.__deck && window.__deck.current().id === 'slotting-live' && window.__deck.scene('warehouse'); }, null, { timeout: 20000 });

    var info = await page.evaluate(function () {
      var i = window.__deck.info('slotting-live');
      return { steps: i.steps, minutes: i.minutes, act: i.act, notes: i.notes, debug: window.__deck.scene('warehouse').debug() };
    });
    is(info.steps, 6, 'the slide has 6 builds: seven steps, the first on entry');
    is(info.act, 4, 'it is in Act 4');
    is(info.minutes, 5, 'it is planned for 5 minutes');
    ok(/SAY:/.test(info.notes) && /NEXT:/.test(info.notes) && (info.notes.match(/DO, step \d/g) || []).length === 7,
      'the speaker notes have SAY, NEXT and a DO line for each of the seven steps');
    is(info.debug.fingerprint, S.digest(r).hash, 'the run the slide made has the same fingerprint as the command line');

    // every step, forward: what is on screen
    function snapshot() {
      return page.evaluate(function () {
        var el = document.querySelector('[data-slide-id="slotting-live"]');
        var tag = el.querySelector('.tag');
        var box = tag ? tag.getBoundingClientRect() : null;
        return {
          text: el.innerText.replace(/\s+/g, ' ').trim(),
          tag: tag ? tag.textContent.trim() : '',
          tagVisible: !!(box && box.width > 100 && box.height > 20 && window.getComputedStyle(tag).visibility !== 'hidden' &&
            document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === tag)
        };
      });
    }
    async function go(step) {
      await page.evaluate(function (s) { return window.__deck.goto('slotting-live', s); }, step);
      await page.evaluate(function () { return new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(res); }); }); });
    }
    var forward = [];
    for (var step = 0; step <= 6; step++) { await go(step); forward.push(await snapshot()); }

    ok(forward.every(function (f) { return /animated re-creation/i.test(f.tag) && /synthetic data/i.test(f.tag) && f.tagVisible; }),
      'the label "Animated re-creation \u00b7 synthetic data" is on screen, uncovered, at every step');
    ok(forward.every(function (f, i) { return forward.findIndex(function (g) { return g.text === f.text; }) === i; }),
      'every step shows something the others do not');

    var b = r.before, a = r.after;
    var table = forward[5].text;
    var want = [commas(b.ftPerRun), commas(a.ftPerRun), b.pickHoursPerYear.toFixed(1), a.pickHoursPerYear.toFixed(1),
      pctText(b.ladderPickShare), pctText(a.ladderPickShare), pctText(b.aGoldenShare), pctText(a.aGoldenShare)];
    ok(want.every(function (v) { return table.indexOf(v) !== -1; }), 'step 6 shows the library\'s before and after figures: ' + want.join(', '),
      'on screen: ' + table);
    var last = forward[6].text.toUpperCase();
    var msMatch = /([\d,]+) SWAPS TRIED IN ([\d,]+) MS\./.exec(last);
    ok(msMatch && msMatch[1] === commas(r.anneal.tried) && Number(msMatch[2].replace(/,/g, '')) === Math.round(info.debug.anneal.ms),
      'step 7 reads "' + commas(r.anneal.tried) + ' swaps tried in N ms." with the time the slide measured', last.slice(0, 120));
    ok(/NO AI MODEL\s+IN THE LOOP\./.test(last), 'step 7 says "No AI model in the loop."');
    ok(info.debug.anneal.ms > 50 && info.debug.anneal.ms < 60000, 'the measured time is a real measurement', info.debug.anneal.ms + ' ms');

    // nothing from the real project may appear in the re-creation (brief, rule 8)
    var real = ['133.6', '91.1', '32.8', '17.4', '6,493', '7,110', '239,711', '1,983', '31.8%', '47.0%', 'Laborde'];
    var everything = forward.map(function (f) { return f.text; }).join(' | ');
    var leaked = real.filter(function (v) { return everything.indexOf(v) !== -1; });
    is(leaked.length, 0, 'none of the real project\'s figures or names appear on the slide' + (leaked.length ? ' (found ' + leaked.join(', ') + ')' : ''));

    // back through every step: exactly what it showed going forward
    var same = true, firstDiff = '';
    for (step = 5; step >= 0; step--) {
      await go(step);
      var back = await snapshot();
      if (back.text !== forward[step].text) { same = false; firstDiff = firstDiff || ('step ' + step + ': ' + back.text.slice(0, 80)); }
    }
    ok(same, 'stepping backwards restores each step exactly', firstDiff);

    // the same moment draws the same frame, whatever was drawn before it
    var frames = await page.evaluate(function () {
      var sc = window.__deck.scene('warehouse');
      function hash() {
        var out = '';
        var list = document.querySelectorAll('[data-slide-id="slotting-live"] canvas');
        for (var i = 0; i < list.length; i++) {
          var data = list[i].toDataURL(), h = 2166136261;
          for (var k = 0; k < data.length; k += 7) { h ^= data.charCodeAt(k); h = Math.imul(h, 16777619); }
          out += (h >>> 0).toString(16) + '.';
        }
        return out;
      }
      var result = {};
      sc.seek(3, 4.0); result.a = hash();
      sc.seek(4, 2.0); result.other = hash();
      sc.seek(2, 7.5); result.walk = hash();
      sc.seek(3, 6.5); sc.seek(3, 4.0); result.b = hash();
      sc.seek(2, 12); sc.seek(2, 7.5); result.walk2 = hash();
      return result;
    });
    ok(frames.a === frames.b && frames.walk === frames.walk2 && frames.a !== frames.other,
      'the animation is a function of time: the same moment draws the same pixels, forwards or backwards');

    // real clock, real key presses: it animates, it can be interrupted, and it stops when you leave
    var live = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    live.on('pageerror', function (e) { errors.push(e.message); });
    await live.goto(deckUrl + '#/slotting-live/0');
    await live.waitForFunction(function () { return window.__deck && window.__deck.scene('warehouse'); }, null, { timeout: 20000 });
    await live.waitForTimeout(400);
    var playing = await live.evaluate(function () { var d = window.__deck.scene('warehouse').debug(); return d.playing && d.t > 0 && d.t < d.durations[0]; });
    ok(playing, 'on entry (real clock) the building draws itself');
    for (var press = 0; press < 6; press++) { await live.keyboard.press('ArrowRight'); await live.waitForTimeout(60); }   // a speaker in a hurry
    // cold, the search may still be running in slices: the slide waits for it (it never blocks), then lands
    await live.waitForFunction(function () { var d = window.__deck.scene('warehouse').debug(); return d.ready && !d.waiting; }, null, { timeout: 30000 });
    await live.waitForTimeout(1200);
    var hurried = await live.evaluate(function () {
      var d = window.__deck.scene('warehouse').debug();
      return { step: d.step, done: !d.playing, ready: d.ready, text: document.querySelector('[data-slide-id="slotting-live"]').innerText.replace(/\s+/g, ' ').trim() };
    });
    ok(hurried.step === 6 && hurried.done && hurried.ready && hurried.text === forward[6].text.replace(/[\d,]+ ms\./i, function () { return (/[\d,]+ ms\./i.exec(hurried.text) || [''])[0]; }),
      'six quick presses land on the last step, complete, with the same figures', hurried.text.slice(0, 100));
    await live.keyboard.press('ArrowLeft');
    await live.waitForTimeout(100);
    var steppedBack = await live.evaluate(function () { var d = window.__deck.scene('warehouse').debug(); return d.step === 5 && !d.playing && Math.abs(d.t - d.durations[5]) < 1e-6; });
    ok(steppedBack, 'stepping back shows the previous step complete, at once');
    await live.evaluate(function () { var ids = window.__deck.ids(); var i = ids.indexOf('slotting-live'); return window.__deck.goto(i > 0 ? i - 1 : i + 1, 0); });
    await live.waitForTimeout(800);
    var after = await live.evaluate(function () { return { loops: window.Motion.stats().loops, scene: !!window.__deck.scene('warehouse'), errors: window.__deck.errors().filter(function (e) { return e.slide === 'slotting-live'; }).length }; });
    ok(!after.scene && after.errors === 0, 'leaving the slide destroys the scene without an error');
    await live.evaluate(function () { window.__deck.goto('slotting-live', 0); });   // not awaited: goto() resolves when motion has settled
    await live.waitForTimeout(300);
    var again = await live.evaluate(function () { var d = window.__deck.scene('warehouse').debug(); return d.step === 0 && d.playing; });
    ok(again, 'coming back starts again from the first step');

    var engineErrors = await page.evaluate(function () { return window.__deck.errors().filter(function (e) { return e.slide === 'slotting-live' || /warehouse/.test(e.where); }).map(function (e) { return e.where + ': ' + e.message; }); });
    is(engineErrors.length, 0, 'the engine caught no errors from the slide or the scene' + (engineErrors.length ? ': ' + engineErrors.join('; ') : ''));
    is(errors.length, 0, 'no errors on the page' + (errors.length ? ': ' + errors.join('; ') : ''));
  } finally {
    await browser.close();
  }
}

async function main() {
  var S = require(CORE);
  var Motion = require(MOTION);
  var r = S.run();

  testBasics(S, Motion);
  testWorld(S, r);
  testPlacements(S, r);
  testWalking(S, r);
  testScore(S, r);
  testOptimizer(S, r);
  testDeterminism(S, r);
  testSpeed(S);
  testCli(S, r);
  await testBrowser(S, r);
  await testSlide(S, r);

  console.log('\n' + (failed === 0 ? 'ALL PASS' : 'FAILED') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function (err) {
  console.log('FAIL  the test run crashed\n        ' + (err && err.stack || err));
  process.exit(1);
});
