/*
 * deck/lib/slotting-core.js  ->  window.Slotting   (module.exports under Node)
 * -----------------------------------------------------------------------------
 * A small, honest warehouse-slotting model on SYNTHETIC data.
 *
 * "Slotting" is deciding which shelf slot each part lives in. This file builds
 * a made-up warehouse, a made-up year of orders, and then does what a real
 * slotting tool does: place the parts, replay the orders, measure the walking
 * and the ladder climbs, and search for a better placement by simulated
 * annealing. Nothing in it comes from a real building or a real business: the
 * geometry is generic textbook shelving and every part and order is generated
 * from a seed.
 *
 * It is pure logic. No DOM, no timers, no network. The same seed gives exactly
 * the same numbers in Node and in every browser, because the model only uses
 * integer math, + - * / and Math.sqrt (Math.exp, Math.log and Math.pow differ
 * in the last digit between JavaScript engines, so they are not used: see
 * expNeg() below).
 *
 * THE MODEL
 *   Building   Two blocks of racks (front and back) with a centre cross-aisle
 *              between them, a cross-aisle along the front and one along the
 *              back. 12 aisles per block. Each aisle has a rack face on either
 *              side. Each face has bays; each bay has 6 shelf levels:
 *              level 1 floor (bend), 2-3 golden zone, 4 reach, 5-6 ladder.
 *              The pack station is at a door at the foot of one aisle.
 *   Parts      About 1,500, with a long tail: a few are picked constantly,
 *              most almost never. Classed A / B / C by cumulative share of picks.
 *   Orders     About 2,000 in a year, 1 to 8 lines each, sampled by velocity,
 *              with "families" of parts that tend to be ordered together.
 *   Pick run   Start at the pack station, visit the picks nearest-first, come
 *              back. Walking follows the aisles and cross-aisles, never through
 *              a rack.
 *   Pick time  feet / 3 ft per second
 *              + extra seconds for each pick from the floor or a reach level
 *              + one ladder setup per bay that needs a ladder, per order.
 *              These times are placeholders, as they would be in any model
 *              before a floor time study.
 *   As-is move Parts go into slots in part-number order, which has nothing to
 *              do with how often they are picked. Every level gets used.
 *   Optimizer  Start from a rule of thumb (fast movers nearest the pack station
 *              on golden shelves), then simulated annealing: propose a swap of
 *              two parts, replay the orders that contain them, keep the swap if
 *              pick time drops (and sometimes when it does not, less often as
 *              it cools).
 *   Shelf rules  While it searches, the optimizer keeps two rules of the
 *              starting layout: a fast mover (A) stays in the golden zone and
 *              a medium mover (B) stays off the ladder levels. They are rules
 *              about reach and strain, not seconds, so they are not traded
 *              away for a shorter walk. Set keepZones: false to let it trade.
 *
 * API
 *   Slotting.defaults                      the default parameters
 *   Slotting.params(overrides)             defaults <- window.YOUR.slotting.sim <- overrides
 *   Slotting.layout(params)                -> the building alone (cheap: no parts, no orders)
 *   Slotting.build(params)                 -> world { params, layout, slots, parts, orders, ... }
 *   Slotting.asIs(world)                   -> assignment   (the as-is move)
 *   Slotting.seedLayout(world)             -> assignment   (the rule-of-thumb start)
 *   Slotting.route(world, assignment, order)
 *                                          -> { stops, path, feet, seconds, ladderSetups }
 *   Slotting.score(world, assignment)      -> { ftPerRun, pickHoursPerYear, ladderPickShare,
 *                                               aGoldenShare, bOffLadderShare,
 *                                               ladderSetupsPerYear, picksByLevel[6], ... }
 *   Slotting.annealer(world, start, opts)  -> { step(n), done, tried, progress, result() }
 *   Slotting.anneal(world, start, opts)    -> { assignment, tried, accepted, trace, moves, ms, ... }
 *   Slotting.run(params)                   -> everything above, plus timings
 *   Slotting.validate(world, assignment)   -> [] when every part has one slot and no slot two parts
 *   Slotting.pathCrossesRack(world, path)  -> true if a walking path cuts through a rack
 *   Slotting.replay(world, start, log, n)  -> the assignment after the first n accepted moves
 *   Slotting.digest(run)                   -> a short fingerprint of a run, for comparing engines
 *   Slotting.dayOrders(world, day)         -> the orders of one working day
 *   Slotting.busiestDay(world)             -> the day with the most orders
 *
 * An "assignment" is { partSlot, slotPart }: two typed arrays that mirror each
 * other. partSlot[p] is the slot of part p. slotPart[s] is the part in slot s,
 * or -1 when the slot is empty.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  if (root) { root.Slotting = api; }
}(typeof window !== 'undefined' ? window : null, function (win) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Defaults. window.YOUR.slotting.sim overrides any of these.
   * All lengths are feet, all times are seconds.
   * ------------------------------------------------------------------ */

  var DEFAULTS = {
    seed: 20261113,

    // the building: generic shelving, not a real floor plan
    aisles: 12,              // per block; the two blocks share the same aisle lines
    baysPerFace: null,       // null = chosen so that slots are about 1.1 x parts
    aislePitchFt: 10,        // centre of one aisle to the centre of the next
    aisleWidthFt: 3,         // the walkable part of that pitch; the rest is shelving
    bayWidthFt: 5,           // length of one bay along the aisle
    crossAisleFt: 6,         // width of the front, centre and back cross-aisles
    packAisle: 1,            // the pack station door is at the foot of this aisle (1 = far left)

    // demand
    parts: 1560,
    orders: 2000,
    workDays: 250,
    lineWeights: [18, 20, 17, 14, 11, 9, 6, 5],   // how common orders of 1, 2, ... 8 lines are
    tailOffset: 10,          // pick weight of the part ranked k is 1 / (k + tailOffset)^1.5
    familySize: 6,           // parts are grouped into families of about this many...
    affinity: 0.4,           // ...and this share of an order's later lines comes from the first line's family
    classCuts: [0.8, 0.95],  // A = the parts that make up the first 80% of picks, B the next 15%, C the rest

    // pick-time model (placeholders: a real project would time these on the floor)
    walkFtPerSec: 3,
    floorSec: 3,             // extra time to bend to level 1
    reachSec: 3,             // extra time to reach level 4
    ladderSetupSec: 30,      // fetch, climb and put back a ladder: once per ladder bay per order

    // optimizer
    iterations: 240000,      // candidate swaps to try
    sampleOrders: 0,         // orders replayed to judge a swap; 0 = the whole year
    startTemp: 0.02,         // starting temperature, as a multiple of the average uphill step
    keepZones: true,         // the optimizer keeps the shelf rules of the starting layout:
                             // fast movers (A) stay in the golden zone, medium movers (B) stay off the ladder
    annealSeed: null         // null = derived from seed
  };

  var LEVELS = 6;
  var BLOCKS = 2;
  var ZONES = ['floor', 'golden', 'golden', 'reach', 'ladder', 'ladder'];   // by level, 1 to 6
  var CLASS_NAMES = ['A', 'B', 'C'];

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function isNum(v) { return typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity; }

  function clampInt(v, lo, hi, fallback) {
    var n = Math.round(Number(v));
    if (!isNum(n)) { n = fallback; }
    return n < lo ? lo : (n > hi ? hi : n);
  }

  function clampNum(v, lo, hi, fallback) {
    var n = Number(v);
    if (!isNum(n)) { n = fallback; }
    return n < lo ? lo : (n > hi ? hi : n);
  }

  /* A clock for MEASURING how long the arithmetic took. This is wall time on
   * purpose: it is a measurement that goes on screen, not animation time. */
  var perf = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance : null;
  function wallMs() { return perf ? perf.now() : Date.now(); }

  /* ------------------------------------------------------------------ *
   * Seeded random numbers: mulberry32, the same algorithm as Motion.rng
   * (deck/lib/motion.js). When Motion is on the page its generator is used;
   * otherwise this copy is, and the two give the same sequence bit for bit
   * (tools/test-slotting.js checks that).
   * ------------------------------------------------------------------ */

  function builtinNext(seed) {
    var state = (Math.floor(Number(seed)) || 0) >>> 0;
    return function next() {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNext(seed) {
    var M = win && win.Motion;
    if (M && typeof M.rng === 'function') { return M.rng((Math.floor(Number(seed)) || 0) >>> 0).next; }
    return builtinNext(seed);
  }

  /** A shuffled copy of 0..n-1 (Fisher-Yates). */
  function shuffledIndex(n, next) {
    var out = new Array(n);
    var i;
    for (i = 0; i < n; i++) { out[i] = i; }
    for (i = n - 1; i > 0; i--) {
      var j = Math.floor(next() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  /* e^(-x) for x >= 0, built from + - * / only, so that every JavaScript
   * engine returns the same bits. Halve x until it is small, take a short
   * Taylor series, square the result back up. Good to about 1e-12, which is
   * far more than an acceptance test needs. */
  function expNeg(x) {
    if (!(x > 0)) { return 1; }
    if (x > 40) { return 0; }
    var k = 0;
    while (x > 0.125) { x *= 0.5; k++; }
    var y = 1 - x * (1 - x / 2 * (1 - x / 3 * (1 - x / 4 * (1 - x / 5 * (1 - x / 6 * (1 - x / 7))))));
    while (k-- > 0) { y *= y; }
    return y;
  }

  /* ------------------------------------------------------------------ *
   * Parameters
   * ------------------------------------------------------------------ */

  function mergeInto(target, source) {
    if (!source || typeof source !== 'object') { return; }
    for (var key in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && source[key] != null) { target[key] = source[key]; }
    }
  }

  /**
   * Slotting.params(overrides) -> a complete, checked parameter set.
   * Order of precedence: defaults, then window.YOUR.slotting.sim (the speaker's
   * file), then the overrides passed in.
   */
  function params(overrides) {
    var P = {};
    mergeInto(P, DEFAULTS);
    var your = win && win.YOUR && win.YOUR.slotting && win.YOUR.slotting.sim;
    mergeInto(P, your);
    mergeInto(P, overrides);

    P.seed = (Math.floor(Number(P.seed)) || 0) >>> 0;
    P.aisles = clampInt(P.aisles, 2, 40, DEFAULTS.aisles);
    P.parts = clampInt(P.parts, 20, 20000, DEFAULTS.parts);
    P.orders = clampInt(P.orders, 10, 50000, DEFAULTS.orders);
    P.workDays = clampInt(P.workDays, 1, 366, DEFAULTS.workDays);
    P.aislePitchFt = clampNum(P.aislePitchFt, 4, 40, DEFAULTS.aislePitchFt);
    P.aisleWidthFt = clampNum(P.aisleWidthFt, 1, P.aislePitchFt - 1, DEFAULTS.aisleWidthFt);
    P.bayWidthFt = clampNum(P.bayWidthFt, 2, 20, DEFAULTS.bayWidthFt);
    P.crossAisleFt = clampNum(P.crossAisleFt, 2, 30, DEFAULTS.crossAisleFt);
    P.packAisle = clampInt(P.packAisle, 1, P.aisles, DEFAULTS.packAisle);
    P.tailOffset = clampNum(P.tailOffset, 0, 1000, DEFAULTS.tailOffset);
    P.familySize = clampInt(P.familySize, 1, 50, DEFAULTS.familySize);
    P.affinity = clampNum(P.affinity, 0, 0.95, DEFAULTS.affinity);
    P.walkFtPerSec = clampNum(P.walkFtPerSec, 0.5, 20, DEFAULTS.walkFtPerSec);
    P.floorSec = clampNum(P.floorSec, 0, 600, DEFAULTS.floorSec);
    P.reachSec = clampNum(P.reachSec, 0, 600, DEFAULTS.reachSec);
    P.ladderSetupSec = clampNum(P.ladderSetupSec, 0, 3600, DEFAULTS.ladderSetupSec);
    P.iterations = clampInt(P.iterations, 0, 50000000, DEFAULTS.iterations);
    P.sampleOrders = clampInt(P.sampleOrders, 0, P.orders, 0);
    P.startTemp = clampNum(P.startTemp, 0, 100, DEFAULTS.startTemp);
    P.keepZones = P.keepZones !== false;

    if (!Array.isArray(P.lineWeights) || !P.lineWeights.length) { P.lineWeights = DEFAULTS.lineWeights.slice(); }
    P.lineWeights = P.lineWeights.slice(0, 8).map(function (w) { return clampNum(w, 0, 1e6, 0); });
    if (!P.lineWeights.some(function (w) { return w > 0; })) { P.lineWeights = DEFAULTS.lineWeights.slice(); }
    if (!Array.isArray(P.classCuts) || P.classCuts.length !== 2) { P.classCuts = DEFAULTS.classCuts.slice(); }
    P.classCuts = [clampNum(P.classCuts[0], 0.01, 0.98, 0.8), clampNum(P.classCuts[1], 0.02, 0.99, 0.95)];
    if (P.classCuts[1] <= P.classCuts[0]) { P.classCuts = DEFAULTS.classCuts.slice(); }

    // Bay count: slots = blocks x aisles x 2 faces x bays x 6 levels, about 1.1 x parts.
    var perBay = BLOCKS * P.aisles * 2 * LEVELS;
    if (P.baysPerFace == null) {
      P.baysPerFace = Math.max(1, Math.round(P.parts * 1.1 / perBay));
      while (P.baysPerFace * perBay < P.parts) { P.baysPerFace++; }
    }
    P.baysPerFace = clampInt(P.baysPerFace, 1, 60, 6);
    if (P.baysPerFace * perBay < P.parts) { P.parts = P.baysPerFace * perBay; }   // never more parts than slots

    P.annealSeed = P.annealSeed == null ? null : ((Math.floor(Number(P.annealSeed)) || 0) >>> 0);
    return P;
  }

  /* ------------------------------------------------------------------ *
   * The building
   *
   *   y
   *   ^   back cross-aisle     ─────────────────────────────
   *   |   back block           ║ ║ ║ ║ ║ ║ ║ ║ ║ ║ ║ ║      (aisles run front to back)
   *   |   centre cross-aisle   ─────────────────────────────
   *   |   front block          ║ ║ ║ ║ ║ ║ ║ ║ ║ ║ ║ ║
   *   |   front cross-aisle    ─────────────────────────────
   *   0   front wall, with the pack station door at the foot of one aisle
   *       0 ───────────────────────────────────────────────> x
   *
   * A picker walks on aisle centre lines and cross-aisle centre lines only.
   * A "position" is where a picker stands to pick from a bay: the aisle centre
   * line, level with the middle of the bay. Both faces of the aisle are picked
   * from the same position.
   * ------------------------------------------------------------------ */

  function buildLayout(P) {
    var bays = P.baysPerFace;
    var blockLen = bays * P.bayWidthFt;
    var cross = P.crossAisleFt;
    var width = P.aisles * P.aislePitchFt;
    var length = 3 * cross + 2 * blockLen;
    var crossY = [cross / 2, cross + blockLen + cross / 2, 2 * cross + 2 * blockLen + cross / 2];
    var blockY0 = [cross, 2 * cross + blockLen];
    var aisleX = [];
    var bayY = [[], []];
    var racks = [];
    var a, b, j;

    for (a = 0; a < P.aisles; a++) { aisleX.push(P.aislePitchFt / 2 + a * P.aislePitchFt); }
    for (b = 0; b < BLOCKS; b++) {
      for (j = 0; j < bays; j++) { bayY[b].push(blockY0[b] + (j + 0.5) * P.bayWidthFt); }
    }
    // Rack footprints: the shelving between two aisles (two faces, back to back),
    // plus a single face against each side wall.
    var half = P.aisleWidthFt / 2;
    for (b = 0; b < BLOCKS; b++) {
      for (a = 0; a <= P.aisles; a++) {
        var x0 = a === 0 ? 0 : aisleX[a - 1] + half;
        var x1 = a === P.aisles ? width : aisleX[a] - half;
        racks.push({ x0: x0, x1: x1, y0: blockY0[b], y1: blockY0[b] + blockLen, block: b, row: a });
      }
    }

    return {
      aisles: P.aisles,
      blocks: BLOCKS,
      baysPerFace: bays,
      levels: LEVELS,
      zones: ZONES.slice(),
      width: width,
      length: length,
      aislePitch: P.aislePitchFt,
      aisleWidth: P.aisleWidthFt,
      rackDepth: (P.aislePitchFt - P.aisleWidthFt) / 2,
      bayWidth: P.bayWidthFt,
      crossAisle: cross,
      blockLength: blockLen,
      aisleX: aisleX,
      crossY: crossY,          // centre lines of the front, centre and back cross-aisles
      blockY0: blockY0,
      bayY: bayY,              // bayY[block][bay]: where a picker stands for that bay
      racks: racks,
      pack: { aisle: P.packAisle, x: aisleX[P.packAisle - 1], y: 0 }
    };
  }

  /* ------------------------------------------------------------------ *
   * Slotting.build(params) -> world
   * ------------------------------------------------------------------ */

  function build(input) {
    var t0 = wallMs();
    var P = params(input);
    var L = buildLayout(P);
    var bays = L.baysPerFace;
    var a, b, j, s, i, p, o, k;

    /* ---- positions and the walking distance between them ---- */
    var perAisle = BLOCKS * bays;
    var nPos = P.aisles * perAisle + 1;       // every (aisle, bay), plus the pack station
    var PACK = nPos - 1;
    var posX = new Float64Array(nPos);
    var posY = new Float64Array(nPos);
    for (a = 0; a < P.aisles; a++) {
      for (b = 0; b < BLOCKS; b++) {
        for (j = 0; j < bays; j++) {
          var pi = a * perAisle + b * bays + j;
          posX[pi] = L.aisleX[a];
          posY[pi] = L.bayY[b][j];
        }
      }
    }
    posX[PACK] = L.pack.x;
    posY[PACK] = L.pack.y;

    var D = new Float64Array(nPos * nPos);    // feet, walking, between any two positions
    for (i = 0; i < nPos; i++) {
      for (j = i + 1; j < nPos; j++) {
        var d = walkFeet(L, posX[i], posY[i], posX[j], posY[j]);
        D[i * nPos + j] = d;
        D[j * nPos + i] = d;
      }
    }

    /* ---- slots, in address order: aisle, side, block, bay, level ---- */
    var nSlots = P.aisles * 2 * BLOCKS * bays * LEVELS;
    var slots = new Array(nSlots);
    var slotPos = new Int32Array(nSlots);
    var slotLevel = new Int8Array(nSlots);       // 0..5
    var slotFace = new Int32Array(nSlots);       // one id per (aisle, side, block, bay): a "ladder bay"
    var slotExtra = new Float64Array(nSlots);    // extra seconds for a pick here (floor, reach)
    var slotLadder = new Uint8Array(nSlots);
    s = 0;
    for (a = 0; a < P.aisles; a++) {
      for (var side = 0; side < 2; side++) {
        for (b = 0; b < BLOCKS; b++) {
          for (j = 0; j < bays; j++) {
            for (var lv = 0; lv < LEVELS; lv++) {
              var pos = a * perAisle + b * bays + j;
              var zone = ZONES[lv];
              slotPos[s] = pos;
              slotLevel[s] = lv;
              slotFace[s] = ((a * 2 + side) * BLOCKS + b) * bays + j;
              slotExtra[s] = zone === 'floor' ? P.floorSec : (zone === 'reach' ? P.reachSec : 0);
              slotLadder[s] = zone === 'ladder' ? 1 : 0;
              slots[s] = {
                id: s, aisle: a, side: side, block: b, bay: j, level: lv + 1, zone: zone,
                x: posX[pos], y: posY[pos], pos: pos, face: slotFace[s],
                packFeet: D[PACK * nPos + pos]      // one way, walking, from the pack station
              };
              s++;
            }
          }
        }
      }
    }

    /* ---- parts: a long tail of pick weights, unrelated to part number ---- */
    var nParts = P.parts;
    var rankOrder = shuffledIndex(nParts, makeNext(P.seed + 11));   // rankOrder[k] = the part ranked k
    var weight = new Float64Array(nParts);
    for (k = 0; k < nParts; k++) {
      var r = k + 1 + P.tailOffset;
      weight[rankOrder[k]] = 1 / (r * Math.sqrt(r));
    }
    var cum = new Float64Array(nParts);            // cumulative weight by part id, for sampling
    var total = 0;
    for (p = 0; p < nParts; p++) { total += weight[p]; cum[p] = total; }

    // families: parts that tend to be ordered together
    var famOrder = shuffledIndex(nParts, makeNext(P.seed + 23));
    var family = new Int32Array(nParts);
    var families = [];
    for (k = 0; k < nParts; k++) {
      var f = Math.floor(k / P.familySize);
      family[famOrder[k]] = f;
      (families[f] = families[f] || []).push(famOrder[k]);
    }

    function sampleGlobal(u) {
      var x = u * total, lo = 0, hi = nParts - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (cum[mid] > x) { hi = mid; } else { lo = mid + 1; }
      }
      return lo;
    }

    function sampleFamily(f, u, taken) {
      var members = families[f];
      var sum = 0, m;
      for (m = 0; m < members.length; m++) { if (!taken[members[m]]) { sum += weight[members[m]]; } }
      if (!(sum > 0)) { return -1; }
      var x = u * sum;
      var last = -1;
      for (m = 0; m < members.length; m++) {
        if (taken[members[m]]) { continue; }
        last = members[m];
        x -= weight[last];
        if (x < 0) { return last; }
      }
      return last;
    }

    /* ---- a year of orders ---- */
    var next = makeNext(P.seed + 37);
    var lineTotal = 0;
    for (i = 0; i < P.lineWeights.length; i++) { lineTotal += P.lineWeights[i]; }
    var taken = new Uint8Array(nParts);
    var raw = [];
    for (o = 0; o < P.orders; o++) {
      var day = 1 + Math.floor(next() * P.workDays);
      var x = next() * lineTotal;
      var want = 1;
      for (i = 0; i < P.lineWeights.length; i++) {
        x -= P.lineWeights[i];
        if (x < 0) { want = i + 1; break; }
        want = i + 1;
      }
      if (want > nParts) { want = nParts; }
      var lines = [];
      var guard = 0;
      while (lines.length < want && guard < want * 30) {
        guard++;
        var pick = -1;
        if (lines.length > 0 && next() < P.affinity) { pick = sampleFamily(family[lines[0]], next(), taken); }
        if (pick < 0) { pick = sampleGlobal(next()); }
        if (taken[pick]) { continue; }
        taken[pick] = 1;
        lines.push(pick);
      }
      for (i = 0; i < lines.length; i++) { taken[lines[i]] = 0; }
      raw.push({ day: day, seq: o, lines: lines });
    }
    raw.sort(function (m, n) { return m.day - n.day || m.seq - n.seq; });   // in date order
    var orders = raw.map(function (rec, idx) { return { id: idx, day: rec.day, lines: rec.lines }; });

    var ordStart = new Int32Array(orders.length + 1);
    var nLines = 0;
    for (o = 0; o < orders.length; o++) { ordStart[o] = nLines; nLines += orders[o].lines.length; }
    ordStart[orders.length] = nLines;
    var ordParts = new Int32Array(nLines);
    var picks = new Int32Array(nParts);
    for (o = 0; o < orders.length; o++) {
      for (i = 0; i < orders[o].lines.length; i++) {
        p = orders[o].lines[i];
        ordParts[ordStart[o] + i] = p;
        picks[p]++;
      }
    }

    /* ---- classes: A / B / C by cumulative share of picks ---- */
    var byPicks = [];
    for (p = 0; p < nParts; p++) { byPicks.push(p); }
    byPicks.sort(function (m, n) { return picks[n] - picks[m] || m - n; });
    var cls = new Int8Array(nParts);
    var rank = new Int32Array(nParts);
    var running = 0;
    var counts = [0, 0, 0];
    for (k = 0; k < nParts; k++) {
      p = byPicks[k];
      var before = nLines > 0 ? running / nLines : 1;
      var c = picks[p] === 0 ? 2 : (before < P.classCuts[0] ? 0 : (before < P.classCuts[1] ? 1 : 2));
      cls[p] = c;
      rank[p] = k;
      counts[c]++;
      running += picks[p];
    }
    var parts = new Array(nParts);
    for (p = 0; p < nParts; p++) {
      parts[p] = { id: p, picks: picks[p], cls: CLASS_NAMES[cls[p]], rank: rank[p] + 1, family: family[p] };
    }

    var world = {
      params: P,
      seed: P.seed,
      layout: L,
      slots: slots,
      parts: parts,
      orders: orders,
      classes: { A: counts[0], B: counts[1], C: counts[2] },
      totals: { parts: nParts, slots: nSlots, orders: orders.length, picks: nLines, bays: nSlots / LEVELS },
      byPicks: byPicks,          // part ids, most picked first
      buildMs: 0
    };
    // The same data again as flat typed arrays, for the inner loops.
    Object.defineProperty(world, 'fast', {
      enumerable: false,
      value: {
        nPos: nPos, PACK: PACK, D: D, posX: posX, posY: posY,
        nSlots: nSlots, slotPos: slotPos, slotLevel: slotLevel, slotFace: slotFace, slotExtra: slotExtra, slotLadder: slotLadder,
        nParts: nParts, picks: picks, cls: cls,
        nOrders: orders.length, ordStart: ordStart, ordParts: ordParts
      }
    });
    world.buildMs = wallMs() - t0;
    return world;
  }

  /* ------------------------------------------------------------------ *
   * Walking
   * ------------------------------------------------------------------ */

  /* Which cross-aisle is the shortest way between two aisles? (Ties go to the
   * one nearest the front.) */
  function bestCross(L, y1, y2) {
    var best = 0, bestLen = Infinity;
    for (var c = 0; c < L.crossY.length; c++) {
      var len = Math.abs(y1 - L.crossY[c]) + Math.abs(y2 - L.crossY[c]);
      if (len < bestLen) { bestLen = len; best = c; }
    }
    return best;
  }

  /** Feet walked between two points that are each on an aisle centre line. */
  function walkFeet(L, x1, y1, x2, y2) {
    if (x1 === x2) { return Math.abs(y1 - y2); }                 // same aisle: straight along it
    var yc = L.crossY[bestCross(L, y1, y2)];
    return Math.abs(y1 - yc) + Math.abs(x1 - x2) + Math.abs(y2 - yc);
  }

  /** Append the corners of the walk from (x1, y1) to (x2, y2) to a polyline. */
  function walkPath(L, x1, y1, x2, y2, out) {
    if (x1 === x2) {
      if (y1 !== y2) { out.push([x2, y2]); }
      return;
    }
    var yc = L.crossY[bestCross(L, y1, y2)];
    if (y1 !== yc) { out.push([x1, yc]); }
    out.push([x2, yc]);
    if (y2 !== yc) { out.push([x2, y2]); }
  }

  /* Scratch space for one order (never more than 8 lines, but sized generously). */
  var MAX_LINES = 64;
  var scratchSlot = new Int32Array(MAX_LINES);
  var scratchPos = new Int32Array(MAX_LINES);
  var scratchSeq = new Int32Array(MAX_LINES);
  var scratchDone = new Uint8Array(MAX_LINES);
  var scratchFace = new Int32Array(MAX_LINES);
  var lastFeet = 0;
  var lastSetups = 0;

  /**
   * The heart of the model: seconds to pick one order under a placement.
   * Nearest-neighbour tour from the pack station and back.
   * Leaves the visiting order in scratchSeq, the feet in lastFeet and the
   * ladder setups in lastSetups.
   */
  function orderSeconds(F, P, partSlot, o) {
    var start = F.ordStart[o];
    var n = F.ordStart[o + 1] - start;
    var nPos = F.nPos, D = F.D;
    var i, k;
    var extra = 0, setups = 0;

    for (i = 0; i < n; i++) {
      var s = partSlot[F.ordParts[start + i]];
      scratchSlot[i] = s;
      scratchPos[i] = F.slotPos[s];
      scratchDone[i] = 0;
      extra += F.slotExtra[s];
      if (F.slotLadder[s]) {
        var face = F.slotFace[s], seen = false;
        for (k = 0; k < setups; k++) { if (scratchFace[k] === face) { seen = true; break; } }
        if (!seen) { scratchFace[setups++] = face; }
      }
    }

    var feet = 0;
    var cur = F.PACK;
    for (k = 0; k < n; k++) {
      var best = -1, bestD = Infinity, row = cur * nPos;
      for (i = 0; i < n; i++) {
        if (scratchDone[i]) { continue; }
        var d = D[row + scratchPos[i]];
        if (d < bestD) { bestD = d; best = i; }     // ties: the earlier line of the order
      }
      scratchDone[best] = 1;
      scratchSeq[k] = best;
      feet += bestD;
      cur = scratchPos[best];
    }
    feet += D[cur * nPos + F.PACK];

    lastFeet = feet;
    lastSetups = setups;
    return feet / P.walkFtPerSec + extra + setups * P.ladderSetupSec;
  }

  /**
   * Slotting.route(world, assignment, order) -> one pick run, in full.
   *   stops         the picks in the order they are visited:
   *                 { part, slot, x, y, level, zone, ladder, ladderSetup, atFeet }
   *                 ladderSetup is true on the first ladder pick in a bay;
   *                 atFeet is how far the picker has walked on arrival.
   *   path          the walk as a polyline of [x, y] corners, in feet, from the
   *                 pack station and back. It follows aisle and cross-aisle
   *                 centre lines only.
   *   feet          length of that walk
   *   seconds       pick time for the order under the pick-time model
   *   ladderSetups  how many bays needed a ladder
   * order: an entry of world.orders, or its index.
   */
  function route(world, assignment, order) {
    var F = world.fast, P = world.params, L = world.layout;
    var o = typeof order === 'number' ? order : order.id;
    if (!(o >= 0 && o < F.nOrders)) { throw new Error('Slotting.route: no such order'); }
    var partSlot = assignment.partSlot;
    var seconds = orderSeconds(F, P, partSlot, o);
    var feet = lastFeet, setups = lastSetups;
    var start = F.ordStart[o];
    var n = F.ordStart[o + 1] - start;

    var seq = [];
    for (var k = 0; k < n; k++) { seq.push(scratchSeq[k]); }

    var path = [[L.pack.x, L.pack.y]];
    var stops = [];
    var x = L.pack.x, y = L.pack.y, walked = 0;
    var facesSeen = {};
    for (k = 0; k < n; k++) {
      var part = F.ordParts[start + seq[k]];
      var slot = world.slots[partSlot[part]];
      walked += walkFeet(L, x, y, slot.x, slot.y);
      walkPath(L, x, y, slot.x, slot.y, path);
      x = slot.x; y = slot.y;
      var ladder = slot.zone === 'ladder';
      var firstInBay = ladder && !facesSeen[slot.face];
      if (ladder) { facesSeen[slot.face] = true; }
      stops.push({
        part: part, slot: slot.id, x: slot.x, y: slot.y, level: slot.level, zone: slot.zone,
        side: slot.side, ladder: ladder, ladderSetup: firstInBay, atFeet: walked
      });
    }
    walkPath(L, x, y, L.pack.x, L.pack.y, path);

    return { order: o, stops: stops, path: path, feet: feet, seconds: seconds, ladderSetups: setups };
  }

  /** Length of a polyline in feet. */
  function pathFeet(path) {
    var len = 0;
    for (var i = 1; i < path.length; i++) { len += Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]); }
    return len;
  }

  /**
   * Slotting.pathCrossesRack(world, path) -> true when any leg of the polyline
   * passes through the inside of a rack, leaves the building, or runs at an angle.
   */
  function pathCrossesRack(world, path) {
    var L = world.layout;
    var EPS = 1e-9;
    for (var i = 1; i < path.length; i++) {
      var ax = path[i - 1][0], ay = path[i - 1][1], bx = path[i][0], by = path[i][1];
      if (ax !== bx && ay !== by) { return true; }                        // not along an aisle
      var x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      if (x0 < -EPS || x1 > L.width + EPS || y0 < -EPS || y1 > L.length + EPS) { return true; }
      for (var r = 0; r < L.racks.length; r++) {
        var k = L.racks[r];
        // overlap of the leg with the open interior of the rack
        if (x1 > k.x0 + EPS && x0 < k.x1 - EPS && y1 > k.y0 + EPS && y0 < k.y1 - EPS) { return true; }
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Placements
   * ------------------------------------------------------------------ */

  function emptyAssignment(world) {
    var F = world.fast;
    var partSlot = new Int32Array(F.nParts);
    var slotPart = new Int32Array(F.nSlots);
    for (var s = 0; s < F.nSlots; s++) { slotPart[s] = -1; }
    for (var p = 0; p < F.nParts; p++) { partSlot[p] = -1; }
    return { partSlot: partSlot, slotPart: slotPart };
  }

  function copyAssignment(a) {
    return { partSlot: new Int32Array(a.partSlot), slotPart: new Int32Array(a.slotPart) };
  }

  /**
   * Slotting.asIs(world): the as-is move. Part 1 goes in the first address,
   * part 2 in the next, and so on: aisle by aisle, bay by bay, level by level.
   * Part numbers have nothing to do with how often a part is picked, so fast
   * movers land anywhere, ladder levels included. The slots left over are the
   * last addresses.
   */
  function asIs(world) {
    var a = emptyAssignment(world);
    for (var p = 0; p < world.fast.nParts; p++) { a.partSlot[p] = p; a.slotPart[p] = p; }
    return a;
  }

  /**
   * Slotting.seedLayout(world): the rule of thumb the optimizer starts from.
   * Fast movers nearest the pack station on golden shelves:
   *   A parts, most picked first, into the nearest golden-zone slots;
   *   B parts into the cheapest slots left that are not on a ladder level;
   *   C parts into whatever is left, cheapest first.
   * "Cheapest" is the pick time of a trip for that one slot: there and back
   * on foot, plus its level penalty.
   */
  function seedLayout(world) {
    var F = world.fast, P = world.params;
    var a = emptyAssignment(world);
    var s;

    var trip = new Float64Array(F.nSlots);
    for (s = 0; s < F.nSlots; s++) {
      trip[s] = 2 * world.slots[s].packFeet / P.walkFtPerSec + F.slotExtra[s] + (F.slotLadder[s] ? P.ladderSetupSec : 0);
    }
    var order = [];
    for (s = 0; s < F.nSlots; s++) { order.push(s); }
    order.sort(function (m, n) { return trip[m] - trip[n] || m - n; });

    var used = new Uint8Array(F.nSlots);
    function place(part, allowed) {
      for (var k = 0; k < order.length; k++) {
        var slot = order[k];
        if (used[slot] || !allowed(slot)) { continue; }
        used[slot] = 1;
        a.partSlot[part] = slot;
        a.slotPart[slot] = part;
        return true;
      }
      return false;
    }
    function golden(slot) { return ZONES[F.slotLevel[slot]] === 'golden'; }
    function offLadder(slot) { return !F.slotLadder[slot]; }
    function anywhere() { return true; }

    for (var k = 0; k < world.byPicks.length; k++) {
      var part = world.byPicks[k];
      var c = F.cls[part];
      if (c === 0 && place(part, golden)) { continue; }
      if (c <= 1 && place(part, offLadder)) { continue; }
      place(part, anywhere);
    }
    return a;
  }

  /**
   * Slotting.validate(world, assignment) -> a list of problems (empty = sound):
   * every part has exactly one slot, no slot holds two parts, and the two
   * arrays agree with each other.
   */
  function validate(world, assignment) {
    var F = world.fast;
    var problems = [];
    var ps = assignment && assignment.partSlot, sp = assignment && assignment.slotPart;
    if (!ps || !sp || ps.length !== F.nParts || sp.length !== F.nSlots) { return ['assignment has the wrong shape']; }
    var seen = new Int32Array(F.nSlots);
    var p, s, filled = 0;
    for (p = 0; p < F.nParts; p++) {
      s = ps[p];
      if (!(s >= 0 && s < F.nSlots)) { problems.push('part ' + p + ' has no slot'); continue; }
      seen[s]++;
      if (sp[s] !== p) { problems.push('part ' + p + ' is in slot ' + s + ' but the slot lists part ' + sp[s]); }
    }
    for (s = 0; s < F.nSlots; s++) {
      if (seen[s] > 1) { problems.push('slot ' + s + ' holds ' + seen[s] + ' parts'); }
      if (sp[s] >= 0) {
        filled++;
        if (ps[sp[s]] !== s) { problems.push('slot ' + s + ' lists part ' + sp[s] + ', which is elsewhere'); }
      } else if (sp[s] !== -1) {
        problems.push('slot ' + s + ' has a bad entry');
      }
    }
    if (filled !== F.nParts) { problems.push(filled + ' slots are filled but there are ' + F.nParts + ' parts'); }
    return problems.slice(0, 20);
  }

  /* ------------------------------------------------------------------ *
   * Slotting.score(world, assignment): replay the whole year.
   * ------------------------------------------------------------------ */

  function score(world, assignment) {
    var F = world.fast, P = world.params;
    var partSlot = assignment.partSlot;
    var feet = 0, seconds = 0, setups = 0, ladderPicks = 0;
    var byLevel = [0, 0, 0, 0, 0, 0];
    var o, p;

    for (o = 0; o < F.nOrders; o++) {
      seconds += orderSeconds(F, P, partSlot, o);
      feet += lastFeet;
      setups += lastSetups;
    }
    for (p = 0; p < F.nParts; p++) {
      var s = partSlot[p];
      byLevel[F.slotLevel[s]] += F.picks[p];
      if (F.slotLadder[s]) { ladderPicks += F.picks[p]; }
    }

    var aTotal = 0, aGolden = 0, bTotal = 0, bOff = 0;
    for (p = 0; p < F.nParts; p++) {
      var lv = F.slotLevel[partSlot[p]];
      if (F.cls[p] === 0) { aTotal++; if (ZONES[lv] === 'golden') { aGolden++; } }
      else if (F.cls[p] === 1) { bTotal++; if (ZONES[lv] !== 'ladder') { bOff++; } }
    }

    var nPicks = F.ordParts.length;
    return {
      orders: F.nOrders,
      picks: nPicks,
      feetPerYear: feet,
      ftPerRun: F.nOrders ? feet / F.nOrders : 0,
      pickSecondsPerYear: seconds,
      pickHoursPerYear: seconds / 3600,
      walkHoursPerYear: feet / P.walkFtPerSec / 3600,
      ladderPickShare: nPicks ? ladderPicks / nPicks : 0,
      ladderPicksPerYear: ladderPicks,
      ladderSetupsPerYear: setups,
      aGoldenShare: aTotal ? aGolden / aTotal : 1,
      bOffLadderShare: bTotal ? bOff / bTotal : 1,
      picksByLevel: byLevel
    };
  }

  /* ------------------------------------------------------------------ *
   * Simulated annealing with order-replay delta evaluation
   *
   * One iteration:
   *   1. Propose: take a part that is actually picked, and a slot to send it
   *      to. If a part is already there the two swap; if not, it just moves.
   *      Half the proposals aim anywhere in the building; the other half aim
   *      at the bay (or the bay next to it) of a part it was ordered with,
   *      which is how parts that sell together end up shelved together.
   *      A proposal that would break a shelf rule (keepZones) is redrawn.
   *   2. Replay ONLY the orders that contain either part (nothing else can
   *      have changed) and add up the change in pick time.
   *   3. Keep it if pick time dropped. If it rose, keep it anyway with
   *      probability e^(-rise / temperature). The temperature falls to zero
   *      over the run, so late on only improvements survive.
   *
   * The run is deterministic: the same world, start, seed and iteration count
   * give the same result however step() is called. Nothing depends on timing.
   * ------------------------------------------------------------------ */

  var TRACE_POINTS = 240;
  var MOVE_SAMPLES = 480;

  /**
   * Slotting.annealer(world, start, opts) -> a run you drive yourself, so a
   * browser can do it in slices and stay responsive:
   *
   *     var run = Slotting.annealer(world, Slotting.seedLayout(world), { iterations: 240000 });
   *     while (!run.step(5000)) { ...let a frame go by... }
   *     var result = run.result();
   *
   * opts: { iterations, sampleOrders, seed, startTemp, keepZones, log }
   *   log: false   do not keep the full list of accepted moves (saves memory on huge runs)
   */
  function annealer(world, start, opts) {
    opts = opts || {};
    var F = world.fast, P = world.params;
    var iterations = opts.iterations != null ? clampInt(opts.iterations, 0, 50000000, P.iterations) : P.iterations;
    var seed = opts.seed != null ? ((Math.floor(Number(opts.seed)) || 0) >>> 0)
      : (P.annealSeed != null ? P.annealSeed : ((P.seed + 53) >>> 0));
    var startTemp = opts.startTemp != null ? clampNum(opts.startTemp, 0, 100, P.startTemp) : P.startTemp;
    var keepLog = opts.log !== false && iterations <= 4000000;
    var next = makeNext(seed);
    var nPos = F.nPos;
    var i, o, p, k;

    var state = copyAssignment(start);
    var partSlot = state.partSlot, slotPart = state.slotPart;

    /* ---- the orders replayed to judge a swap ---- */
    var want = opts.sampleOrders != null ? clampInt(opts.sampleOrders, 0, F.nOrders, 0) : P.sampleOrders;
    var sample;
    if (!want || want >= F.nOrders) {
      sample = new Int32Array(F.nOrders);
      for (o = 0; o < F.nOrders; o++) { sample[o] = o; }
    } else {
      var pickOrder = shuffledIndex(F.nOrders, makeNext(seed + 7)).slice(0, want);
      pickOrder.sort(function (m, n) { return m - n; });
      sample = Int32Array.from(pickOrder);
    }
    var nSample = sample.length;
    var yearFactor = nSample ? F.nOrders / nSample : 1;      // sample seconds -> a year of seconds

    // for each part: the sampled orders that contain it
    var poCount = new Int32Array(F.nParts + 1);
    var nSampleLines = 0;
    for (i = 0; i < nSample; i++) {
      o = sample[i];
      for (k = F.ordStart[o]; k < F.ordStart[o + 1]; k++) { poCount[F.ordParts[k] + 1]++; nSampleLines++; }
    }
    var poStart = new Int32Array(F.nParts + 1);
    for (p = 0; p < F.nParts; p++) { poStart[p + 1] = poStart[p] + poCount[p + 1]; }
    var poFill = new Int32Array(F.nParts);
    var poList = new Int32Array(nSampleLines);
    var lineParts = new Int32Array(nSampleLines);            // every sampled order line: pick-weighted choice of a part
    var lineOrder = new Int32Array(nSampleLines);
    var li = 0;
    for (i = 0; i < nSample; i++) {
      o = sample[i];
      for (k = F.ordStart[o]; k < F.ordStart[o + 1]; k++) {
        p = F.ordParts[k];
        poList[poStart[p] + poFill[p]++] = o;
        lineParts[li] = p;
        lineOrder[li] = o;
        li++;
      }
    }
    var active = [];                                         // parts with at least one sampled pick
    for (p = 0; p < F.nParts; p++) { if (poStart[p + 1] > poStart[p]) { active.push(p); } }
    var nActive = active.length;

    /* ---- starting cost ---- */
    var orderCost = new Float64Array(F.nOrders);
    var cost = 0;
    for (i = 0; i < nSample; i++) {
      o = sample[i];
      orderCost[o] = orderSeconds(F, P, partSlot, o);
      cost += orderCost[o];
    }
    var startCost = cost;

    var stamp = new Int32Array(F.nOrders);
    var stampNow = 0;
    var touched = new Int32Array(F.nOrders);
    var touchedCost = new Float64Array(F.nOrders);
    var bays = world.layout.baysPerFace;
    var nFaces = F.nSlots / LEVELS;

    /* The shelf rules: which levels a part of each class may sit on.
     * With keepZones off, every part may sit anywhere. */
    var keepZones = opts.keepZones != null ? opts.keepZones !== false : P.keepZones;
    var LEVEL_CHOICES = keepZones ? [[1, 2], [0, 1, 2, 3], [0, 1, 2, 3, 4, 5]] : [[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5]];
    function allowed(part, slot) {
      if (!keepZones) { return true; }
      var c = F.cls[part];
      if (c === 0) { return ZONES[F.slotLevel[slot]] === 'golden'; }
      if (c === 1) { return !F.slotLadder[slot]; }
      return true;
    }

    function propose(out) {
      // a part, chosen half the time evenly among picked parts and half the time in proportion to picks
      var part = next() < 0.5 ? active[Math.floor(next() * nActive)] : lineParts[Math.floor(next() * nSampleLines)];
      var from = partSlot[part];
      var levels = LEVEL_CHOICES[F.cls[part]];
      var to = from;
      // up to four goes at finding a slot that is somewhere else and breaks no shelf rule
      for (var attempt = 0; attempt < 4 && to === from; attempt++) {
        var face;
        if (next() < 0.5) {
          face = Math.floor(next() * nFaces);                // any bay in the building
        } else {
          // towards a part it was ordered with: either side of that aisle, that bay or a neighbour
          var cnt = poStart[part + 1] - poStart[part];
          var ord = poList[poStart[part] + Math.floor(next() * cnt)];
          var len = F.ordStart[ord + 1] - F.ordStart[ord];
          var mate = F.ordParts[F.ordStart[ord] + Math.floor(next() * len)];
          var slot = world.slots[partSlot[mate]];
          var bay = slot.bay + Math.floor(next() * 3) - 1;
          if (bay < 0) { bay = 0; }
          if (bay >= bays) { bay = bays - 1; }
          var side = next() < 0.5 ? 0 : 1;
          face = ((slot.aisle * 2 + side) * BLOCKS + slot.block) * bays + bay;
        }
        var cand = face * LEVELS + levels[Math.floor(next() * levels.length)];
        // the part already there would move to `from`: that must be allowed too
        var other = slotPart[cand];
        if (other < 0 || allowed(other, from)) { to = cand; }
      }
      out.part = part; out.from = from; out.to = to;
    }

    /* Apply a move and return the change in sampled pick seconds. */
    function tryMove(part, from, to) {
      var other = slotPart[to];
      var n = 0, delta = 0, idx, ord, c;
      stampNow++;
      partSlot[part] = to; slotPart[to] = part;
      slotPart[from] = other;
      if (other >= 0) { partSlot[other] = from; }
      for (idx = poStart[part]; idx < poStart[part + 1]; idx++) {
        ord = poList[idx];
        if (stamp[ord] !== stampNow) { stamp[ord] = stampNow; touched[n++] = ord; }
      }
      if (other >= 0) {
        for (idx = poStart[other]; idx < poStart[other + 1]; idx++) {
          ord = poList[idx];
          if (stamp[ord] !== stampNow) { stamp[ord] = stampNow; touched[n++] = ord; }
        }
      }
      for (idx = 0; idx < n; idx++) {
        c = orderSeconds(F, P, partSlot, touched[idx]);
        touchedCost[idx] = c;
        delta += c - orderCost[touched[idx]];
      }
      lastTouched = n;
      return delta;
    }
    var lastTouched = 0;

    function undoMove(part, from, to) {
      var other = slotPart[from];
      partSlot[part] = from; slotPart[from] = part;
      slotPart[to] = other;
      if (other >= 0) { partSlot[other] = to; }
    }

    function commit() {
      for (var idx = 0; idx < lastTouched; idx++) { orderCost[touched[idx]] = touchedCost[idx]; }
    }

    /* ---- temperature: set from the size of a typical uphill step ---- */
    var prop = { part: 0, from: 0, to: 0 };
    var upSum = 0, upN = 0;
    var calibrate = Math.min(400, iterations);
    for (i = 0; i < calibrate && nActive > 0; i++) {
      propose(prop);
      if (prop.to === prop.from) { continue; }
      var dd = tryMove(prop.part, prop.from, prop.to);
      undoMove(prop.part, prop.from, prop.to);
      if (dd > 0) { upSum += dd; upN++; }
    }
    var T0 = upN ? startTemp * upSum / upN : 0;

    /* ---- the record of the run ---- */
    var traceEvery = Math.max(1, Math.ceil(iterations / TRACE_POINTS));
    var trace = [{ tried: 0, hours: startCost * yearFactor / 3600 }];
    var moveEvery = Math.max(1, Math.floor(iterations / MOVE_SAMPLES));
    var moves = [];
    var movesInBucket = 0, bucket = 0;
    var logIter = [], logPart = [], logFrom = [], logTo = [];
    var tried = 0, accepted = 0, improved = 0;
    var ms = 0;
    var done = iterations === 0 || nActive === 0;
    var COOL_END = 0.9;      // the last tenth of the run is pure descent

    function step(n) {
      if (done) { return true; }
      var t0 = wallMs();
      var end = Math.min(iterations, tried + Math.max(1, Math.floor(n)));
      while (tried < end) {
        var f = 1 - tried / (iterations * COOL_END);
        var T = f > 0 ? T0 * f * f : 0;
        propose(prop);
        tried++;
        if (prop.to !== prop.from) {
          var delta = tryMove(prop.part, prop.from, prop.to);
          var keep = delta <= 0;
          if (!keep && T > 0) { keep = next() < expNeg(delta / T); }
          if (keep) {
            commit();
            cost += delta;
            accepted++;
            if (delta < 0) { improved++; }
            if (keepLog) { logIter.push(tried); logPart.push(prop.part); logFrom.push(prop.from); logTo.push(prop.to); }
            var bk = Math.floor((tried - 1) / moveEvery);
            if (bk !== bucket) { bucket = bk; movesInBucket = 0; }
            if (movesInBucket < 1 && delta < 0) {
              movesInBucket++;
              moves.push({ tried: tried, part: prop.part, from: prop.from, to: prop.to, other: slotPart[prop.from], delta: delta });
            }
          } else {
            undoMove(prop.part, prop.from, prop.to);
          }
        }
        if (tried % traceEvery === 0 || tried === iterations) {
          trace.push({ tried: tried, hours: cost * yearFactor / 3600 });
        }
      }
      if (tried >= iterations) { done = true; }
      ms += wallMs() - t0;
      return done;
    }

    function result() {
      // re-add the cost from scratch, so rounding drift in the running total never reaches a slide
      var exact = 0;
      for (var q = 0; q < nSample; q++) { exact += orderSeconds(F, P, partSlot, sample[q]); }
      return {
        assignment: copyAssignment(state),
        iterations: iterations,
        tried: tried,
        accepted: accepted,
        improved: improved,
        done: done,
        seed: seed,
        sampleOrders: nSample,
        keepZones: keepZones,
        startTemp: T0,
        startHours: startCost * yearFactor / 3600,     // sampled pick time, scaled to a year
        endHours: exact * yearFactor / 3600,
        trace: trace.slice(),
        moves: moves.slice(),
        log: keepLog ? {
          count: logIter.length,
          tried: Int32Array.from(logIter),
          part: Int32Array.from(logPart),
          from: Int32Array.from(logFrom),
          to: Int32Array.from(logTo)
        } : null,
        ms: ms
      };
    }

    var handle = { step: step, result: result, iterations: iterations };
    Object.defineProperty(handle, 'done', { enumerable: true, get: function () { return done; } });
    Object.defineProperty(handle, 'tried', { enumerable: true, get: function () { return tried; } });
    Object.defineProperty(handle, 'accepted', { enumerable: true, get: function () { return accepted; } });
    Object.defineProperty(handle, 'ms', { enumerable: true, get: function () { return ms; } });
    Object.defineProperty(handle, 'progress', { enumerable: true, get: function () { return iterations ? tried / iterations : 1; } });
    Object.defineProperty(handle, 'hours', { enumerable: true, get: function () { return cost * yearFactor / 3600; } });
    return handle;
  }

  /** Slotting.anneal(world, start, opts): the whole run in one call. */
  function anneal(world, start, opts) {
    var run = annealer(world, start, opts);
    run.step(run.iterations || 1);
    return run.result();
  }

  /**
   * Slotting.replay(world, start, log, count) -> the placement after the first
   * `count` accepted moves of a run (count omitted = all of them). This is how
   * the animation shows the true state of the search at any moment.
   */
  function replay(world, start, log, count) {
    var a = copyAssignment(start);
    if (!log) { return a; }
    var n = count == null ? log.count : Math.max(0, Math.min(log.count, Math.floor(count)));
    for (var i = 0; i < n; i++) { applyMove(a, log.part[i], log.to[i]); }
    return a;
  }

  /** Move a part to a slot; if a part is there, the two swap. */
  function applyMove(a, part, to) {
    var from = a.partSlot[part];
    var other = a.slotPart[to];
    a.partSlot[part] = to; a.slotPart[to] = part;
    a.slotPart[from] = other;
    if (other >= 0) { a.partSlot[other] = from; }
    return other;
  }

  /* ------------------------------------------------------------------ *
   * Slotting.run(params): build, place, optimize, measure.
   * ------------------------------------------------------------------ */

  function finishRun(world, asIsA, seedA, annealResult, timings) {
    var t = wallMs();
    var before = score(world, asIsA);
    var seeded = score(world, seedA);
    var after = score(world, annealResult.assignment);
    timings.scoreMs = wallMs() - t;
    timings.annealMs = annealResult.ms;
    timings.totalMs = timings.buildMs + timings.placeMs + timings.annealMs + timings.scoreMs;
    return {
      synthetic: true,                 // say so wherever these numbers appear
      params: world.params,
      world: world,
      asIs: asIsA,
      seed: seedA,
      optimized: annealResult.assignment,
      before: before,                  // the as-is move
      seeded: seeded,                  // the rule of thumb, before any searching
      after: after,                    // rule of thumb + annealing
      anneal: annealResult,
      change: {
        ftPerRun: before.ftPerRun ? 1 - after.ftPerRun / before.ftPerRun : 0,
        pickHoursPerYear: before.pickHoursPerYear ? 1 - after.pickHoursPerYear / before.pickHoursPerYear : 0,
        hoursSavedPerYear: before.pickHoursPerYear - after.pickHoursPerYear
      },
      timings: timings
    };
  }

  function run(input, opts) {
    var world = build(input);
    var t = wallMs();
    var asIsA = asIs(world);
    var seedA = seedLayout(world);
    var placeMs = wallMs() - t;
    var res = anneal(world, seedA, opts);
    return finishRun(world, asIsA, seedA, res, { buildMs: world.buildMs, placeMs: placeMs });
  }

  /**
   * Slotting.start(params, opts) -> the same as run(), in slices:
   *     var job = Slotting.start();
   *     job.step(4000);      // repeat until it returns true
   *     job.result();        // the same object run() returns
   */
  function start(input, opts) {
    var world = build(input);
    var t = wallMs();
    var asIsA = asIs(world);
    var seedA = seedLayout(world);
    var placeMs = wallMs() - t;
    var job = annealer(world, seedA, opts);
    var cached = null;
    var handle = {
      world: world, asIs: asIsA, seed: seedA, annealer: job,
      step: function (n) { return job.step(n); },
      result: function () {
        if (!job.done) { job.step(job.iterations); }
        if (!cached) { cached = finishRun(world, asIsA, seedA, job.result(), { buildMs: world.buildMs, placeMs: placeMs }); }
        return cached;
      }
    };
    Object.defineProperty(handle, 'done', { enumerable: true, get: function () { return job.done; } });
    Object.defineProperty(handle, 'progress', { enumerable: true, get: function () { return job.progress; } });
    return handle;
  }

  /* ------------------------------------------------------------------ *
   * Orders by day
   * ------------------------------------------------------------------ */

  function dayOrders(world, day) {
    return world.orders.filter(function (o) { return o.day === day; });
  }

  /** The working day with the most orders (the earliest, if several tie). */
  function busiestDay(world) {
    var counts = {};
    var best = 0, bestN = -1;
    world.orders.forEach(function (o) {
      counts[o.day] = (counts[o.day] || 0) + 1;
    });
    for (var d = 1; d <= world.params.workDays; d++) {
      if ((counts[d] || 0) > bestN) { bestN = counts[d] || 0; best = d; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * Slotting.digest(run): a fingerprint of everything a run computed, so that
   * Node and a browser can be compared exactly. Numbers go in at full
   * precision; the timings (which are measurements) stay out.
   * ------------------------------------------------------------------ */

  function hashInts(h, arr) {
    for (var i = 0; i < arr.length; i++) {
      h ^= (arr[i] | 0) & 0xff; h = Math.imul(h, 16777619);
      h ^= ((arr[i] | 0) >>> 8) & 0xff; h = Math.imul(h, 16777619);
      h ^= ((arr[i] | 0) >>> 16) & 0xff; h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hashText(h, text) {
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function scoreText(s) {
    return [s.feetPerYear, s.ftPerRun, s.pickSecondsPerYear, s.pickHoursPerYear, s.ladderPickShare, s.ladderSetupsPerYear,
      s.aGoldenShare, s.bOffLadderShare, s.picksByLevel.join('/')].map(String).join(',');
  }

  function digest(r) {
    var h = 2166136261;
    var w = r.world;
    h = hashInts(h, w.fast.ordParts);
    h = hashInts(h, w.fast.picks);
    h = hashInts(h, w.fast.cls);
    h = hashInts(h, r.asIs.partSlot);
    h = hashInts(h, r.seed.partSlot);
    h = hashInts(h, r.optimized.partSlot);
    h = hashInts(h, r.optimized.slotPart);
    if (r.anneal.log) { h = hashInts(h, r.anneal.log.tried); h = hashInts(h, r.anneal.log.part); h = hashInts(h, r.anneal.log.to); }
    var text = [
      scoreText(r.before), scoreText(r.seeded), scoreText(r.after),
      r.anneal.tried, r.anneal.accepted, r.anneal.improved, String(r.anneal.startTemp),
      String(r.anneal.startHours), String(r.anneal.endHours),
      r.anneal.trace.map(function (t) { return t.tried + ':' + String(t.hours); }).join(';'),
      r.anneal.moves.map(function (m) { return m.tried + ':' + m.part + ':' + m.from + ':' + m.to; }).join(';')
    ].join('|');
    h = hashText(h, text);
    return {
      hash: ('00000000' + h.toString(16)).slice(-8),
      text: [scoreText(r.before), scoreText(r.after), r.anneal.tried, r.anneal.accepted, String(r.anneal.endHours)].join('|')
    };
  }

  return {
    defaults: DEFAULTS,
    LEVELS: LEVELS,
    ZONES: ZONES.slice(),
    params: params,
    layout: function (input) { return buildLayout(params(input)); },
    build: build,
    asIs: asIs,
    seedLayout: seedLayout,
    route: route,
    score: score,
    annealer: annealer,
    anneal: anneal,
    run: run,
    start: start,
    replay: replay,
    applyMove: applyMove,
    copyAssignment: copyAssignment,
    validate: validate,
    pathCrossesRack: pathCrossesRack,
    pathFeet: pathFeet,
    dayOrders: dayOrders,
    busiestDay: busiestDay,
    digest: digest,
    // exposed for the tests
    _expNeg: expNeg,
    _rng: builtinNext
  };
}));
