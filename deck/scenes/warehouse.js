/*
 * scenes/warehouse.js: the animated re-creation of warehouse slotting.
 *
 *   <div class="scene" data-scene="warehouse" data-opts='{}'></div>
 *
 * WHAT IT IS
 *   An honest miniature of a real method, on SYNTHETIC data. Every dot, every
 *   route and every number on screen is computed by deck/lib/slotting-core.js
 *   (window.Slotting) from a seed: a made-up building, made-up parts, a
 *   made-up year of orders. Nothing here comes from a real warehouse, and the
 *   slide that hosts the scene labels it "Animated re-creation · synthetic data".
 *
 * THE SEVEN STEPS (the slide has 6 builds; step 0 plays when the slide enters)
 *   0  the building draws itself: two blocks of racks, cross-aisle, pack station,
 *      and a side view of one bay with its six shelf levels
 *   1  a year of orders rains in; slots heat up (dot size first, ink second)
 *   2  the as-is move: pickers walk the busiest day, trails thicken with
 *      traffic, ladder set-ups flash, counters run
 *   3  the optimizer: parts fly to the rule-of-thumb layout, then the
 *      simulated-annealing run is played back: swaps flicker, the cost curve
 *      falls, the "swaps tried" counter races
 *   4  the same orders are walked again
 *   5  before / after figures land
 *   6  "N swaps tried in N ms. No AI model in the loop."
 *
 * HOW IT WORKS
 *   - The model is built once per page and shared by every mount. The search
 *     (about two seconds of arithmetic) runs in idle slices so the page stays
 *     responsive; in ?fast and ?print it simply runs at once. The run time
 *     shown in step 6 is the measured time of that arithmetic on this machine.
 *   - The animation is a pure function of (step, seconds into the step):
 *     render(step, t). Time comes from Motion (a Motion.tween drives it), so
 *     ?fast, a frozen clock and frame-by-frame capture all work. Stepping
 *     back, or arriving on a later step, draws that step's end state at once.
 *   - Three stacked canvases cover the map: structure (drawn once), dots
 *     (redrawn only when the placement changes) and a live layer (trails,
 *     pickers, sparks). A fourth holds the side view and the cost curve.
 *     All text is DOM, in the theme's type.
 *
 * OPTIONS (data-opts)
 *   ground   "dark" draws the scene on a Lampblack field. Default: Card.
 *   pickers  how many pickers walk the day at once (default 5)
 *   sim      overrides for the synthetic warehouse (see Slotting.defaults);
 *            normally these come from window.YOUR.slotting.sim
 *
 * Test hook: __deck.scene('warehouse').debug() returns what is on screen.
 */
(function () {
  'use strict';
  if (!window.Scenes) { return; }

  var DESIGN_W = 1832;             // the stage to the right of the 88px spine
  var DESIGN_H = 1080;
  var SPINE = 88;
  var STEPS = 6;                   // last step index

  /* ======================================================================
   * Small helpers
   * ==================================================================== */

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fixed1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  /* A share as a percentage: whole numbers, but one decimal under 10% so a
   * small figure is not rounded away. */
  function pct(share) {
    var v = share * 100;
    if (v > 0 && v < 9.95 && Math.abs(v - Math.round(v)) > 0.05) { return fixed1(v) + '%'; }
    return Math.round(v) + '%';
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    if (text != null) { node.textContent = text; }
    return node;
  }

  function setText(node, text) {
    if (node.__t !== text) { node.__t = text; node.textContent = text; }
  }

  function show(node, on) {
    var v = on ? '' : 'none';
    if (node.__d !== v) { node.__d = v; node.style.display = v; }
  }

  /* cubic-bezier(0.16, 1, 0.3, 1): "arrive", fast in and a dead stop. The
   * theme's own curve is used when it is on the page. */
  function arriveFallback(t) { var u = 1 - clamp01(t); return 1 - u * u * u * u; }

  /* ======================================================================
   * The model: built once per page, shared by every mount of the scene
   * ==================================================================== */

  var shared = null;

  function createModel(simOverrides) {
    var S = window.Slotting;
    var job = S.start(simOverrides || null);
    var world = job.world;
    var F = world.fast;
    var m = {
      S: S, job: job, world: world, asIs: job.asIs, seed: job.seed,
      before: S.score(world, job.asIs),
      seeded: S.score(world, job.seed),
      result: null,              // the finished run (Slotting.run's shape)
      after: null,
      ready: false,              // result + everything step 3 onward needs
      waiting: [],
      pumping: false
    };

    /* thresholds for the dot tiers */
    var aMin = Infinity, maxPicks = 1, p;
    for (p = 0; p < F.nParts; p++) {
      if (F.cls[p] === 0 && F.picks[p] < aMin) { aMin = F.picks[p]; }
      if (F.picks[p] > maxPicks) { maxPicks = F.picks[p]; }
    }
    m.aMin = aMin === Infinity ? 1 : aMin;
    m.maxPicks = maxPicks;

    /* the day the pickers walk: the busiest day of the synthetic year */
    m.day = S.busiestDay(world);
    m.dayOrders = S.dayOrders(world, m.day);
    m.routesBefore = m.dayOrders.map(function (o) { return S.route(world, job.asIs, o); });
    m.routesAfter = null;

    /* the order parts fly in when the rule of thumb is applied: fast movers first */
    m.flyOrder = world.byPicks.slice();
    m.flyCost = null;            // pick hours a year after the first k parts have moved, at checkpoints
    var FLY_POINTS = 16;
    var flyStage = 0;
    var flyMix = null;

    function flyCheckpoint() {
      if (!m.flyCost) {
        m.flyCost = [m.before.pickHoursPerYear];
        flyMix = { partSlot: new Int32Array(m.asIs.partSlot), slotPart: m.asIs.slotPart };
      }
      flyStage++;
      var upTo = Math.round(F.nParts * flyStage / FLY_POINTS);
      for (var i = Math.round(F.nParts * (flyStage - 1) / FLY_POINTS); i < upTo; i++) {
        flyMix.partSlot[m.flyOrder[i]] = m.seed.partSlot[m.flyOrder[i]];
      }
      // score() reads partSlot only, so a half-moved placement can be measured
      m.flyCost.push(flyStage === FLY_POINTS ? m.seeded.pickHoursPerYear : S.score(world, flyMix).pickHoursPerYear);
      return flyStage >= FLY_POINTS;
    }

    function finish() {
      if (m.ready) { return; }
      if (!m.result) {
        m.result = job.result();
        m.after = m.result.after;
        m.routesAfter = m.dayOrders.map(function (o) { return S.route(world, m.result.optimized, o); });
      }
      while (flyStage < FLY_POINTS) { flyCheckpoint(); }
      m.ready = true;
      var list = m.waiting.slice();
      m.waiting.length = 0;
      list.forEach(function (fn) { try { fn(); } catch (e) { /* one listener must not stop the rest */ } });
    }

    /* Everything at once (blocks for the length of the search). */
    m.finishNow = finish;

    /* In idle slices. Safe to call many times. */
    m.pump = function () {
      if (m.ready || m.pumping) { return; }
      m.pumping = true;
      var idle = window.requestIdleCallback;
      function work(deadline) {
        if (m.ready) { m.pumping = false; return; }
        var guard = 0;
        do {
          if (!job.done) { job.step(300); }
          else if (!m.result) { m.result = job.result(); m.after = m.result.after; }
          else if (!m.routesAfter) { m.routesAfter = m.dayOrders.map(function (o) { return S.route(world, m.result.optimized, o); }); }
          else if (flyStage < FLY_POINTS) { flyCheckpoint(); }
          else { finish(); }
          guard++;
        } while (!m.ready && deadline && deadline.timeRemaining && deadline.timeRemaining() > 4 && guard < 400);
        if (m.ready) { m.pumping = false; return; }
        next();
      }
      function next() {
        if (idle) { idle(work, { timeout: 250 }); }
        else { setTimeout(function () { work(null); }, 12); }
      }
      next();
    };

    m.whenReady = function (fn) {
      if (m.ready) { fn(); return; }
      m.waiting.push(fn);
    };

    return m;
  }

  function model(simOverrides) {
    if (!shared) { shared = createModel(simOverrides); }
    return shared;
  }

  /* Warm up ahead of the slide: when the talk reaches the act this scene is
   * in, start the search in idle time so the slide never waits for it. */
  if (window.Deck && typeof window.Deck.on === 'function') {
    var warm = function (cur) {
      try {
        if (!cur || !window.Slotting || (window.Deck.mode && (window.Deck.mode.presenter || window.Deck.mode.print))) { return; }
        if (cur.act === 4) { model().pump(); }
      } catch (e) { /* the slide itself will report a real problem */ }
    };
    window.Deck.on('change', warm);
    window.Deck.on('start', warm);
  }

  /* ======================================================================
   * Styles: everything the scene's own DOM needs, in tokens only
   * ==================================================================== */

  var CSS = [
    '.wh{position:absolute;left:0;top:0;width:' + DESIGN_W + 'px;height:' + DESIGN_H + 'px;transform-origin:0 0;color:var(--c-ink);font-family:var(--f-body);font-synthesis:none;}',
    '.wh *{box-sizing:border-box;margin:0;padding:0;}',
    '.wh canvas{position:absolute;display:block;}',
    '.wh-t{position:absolute;white-space:nowrap;}',
    /* wide caps label, 32px: the floor for a label that carries meaning */
    '.wh-label{font-family:var(--f-mono);font-size:var(--t-label,32px);font-weight:var(--wght-label,700);font-stretch:var(--wdth-label-tight,112%);letter-spacing:.09em;line-height:1;text-transform:uppercase;font-variant-numeric:tabular-nums;}',
    '.wh-label.is-s{font-size:var(--t-small,28px);}',
    /* numerals in the display face */
    '.wh-num{font-family:var(--f-display);font-weight:var(--wght-display,900);font-stretch:var(--wdth-display,62%);font-variant-numeric:tabular-nums;line-height:var(--lh-cap,.708);letter-spacing:0;text-transform:uppercase;}',
    '.wh-hollow{color:transparent;-webkit-text-stroke:3px var(--c-ink);}',
    '.wh-body{font-family:var(--f-body);font-size:36px;font-weight:600;line-height:1.1;}',
    '.wh-voice{font-family:var(--f-voice,Georgia,serif);font-style:italic;font-weight:var(--wght-voice,600);font-variation-settings:var(--voice-settings,"WONK" 0);font-optical-sizing:none;font-size:var(--t-voice,54px);line-height:1;}',
    '.wh-plate{background:var(--c-ink);color:var(--c-bg);height:56px;padding:0 20px;display:flex;align-items:center;}',
    '.wh-plate.is-ground{background:var(--c-bg);color:var(--c-ink);border:4px solid var(--c-ink);}',
    '.wh-plate.is-bare{background:var(--c-bg);color:var(--c-ink);height:44px;padding:0 14px;}',
    /* legend */
    '.wh-legend{display:flex;gap:44px;}',
    '.wh-key{display:flex;align-items:center;gap:14px;height:56px;}',
    '.wh-key i{display:block;flex:none;border-radius:50%;background:var(--c-ink);}',
    '.wh-key i.is-c{width:6px;height:6px;margin:0 4px;}',
    '.wh-key i.is-b{width:14px;height:14px;}',
    '.wh-key i.is-a{width:24px;height:24px;background:var(--c-accent);border:4px solid var(--c-ink);}',
    /* figures: a label, big numerals, a quiet line */
    '.wh-fig{position:absolute;display:flex;flex-direction:column;align-items:flex-start;}',
    '.wh-fig .wh-label{display:flex;align-items:center;gap:14px;height:32px;}',
    '.wh-fig .wh-num{font-size:124px;margin-top:20px;display:flex;align-items:baseline;gap:8px;}',
    '.wh-fig .wh-num small{font-size:50px;font-weight:inherit;text-transform:none;}',
    '.wh-fig .wh-sub{margin-top:18px;display:flex;align-items:center;gap:14px;height:32px;}',
    /* chips: the line or mark a number refers to */
    '.wh-chip{display:block;flex:none;width:54px;height:24px;}',
    '.wh-chip.is-solid{background:var(--c-ink);height:14px;}',
    '.wh-chip.is-dashed{height:6px;background:repeating-linear-gradient(90deg,var(--c-ink) 0 12px,transparent 12px 20px);}',
    '.wh-chip.is-ladder{width:28px;height:28px;border:4px solid var(--c-ink);background:repeating-linear-gradient(135deg,var(--c-ink) 0 3px,transparent 3px 8px);}',
    /* before / after table */
    '.wh-table{position:absolute;display:flex;flex-direction:column;}',
    '.wh-th{display:grid;grid-template-columns:262px 60px 1fr;align-items:end;height:40px;}',
    '.wh-row{display:grid;grid-template-columns:262px 60px 1fr;align-items:end;row-gap:12px;padding:14px 0 18px;border-top:var(--w-hair,3px) solid var(--c-line);}',
    '.wh-row.is-first{border-top:var(--w-rule,6px) solid var(--c-line);margin-top:12px;}',
    '.wh-row .wh-body{grid-column:1 / -1;}',
    '.wh-v{font-size:84px;display:flex;align-items:baseline;gap:6px;}',
    '.wh-v small{font-size:38px;font-weight:inherit;text-transform:none;}',
    '.wh-v.is-before b{color:transparent;-webkit-text-stroke:3px var(--c-ink);font-weight:inherit;}',
    '.wh-v.is-after b{font-weight:inherit;}',
    '.wh-arrow{width:52px;height:58px;background:var(--c-ink);clip-path:polygon(0 calc(50% - 4px),calc(100% - 26px) calc(50% - 4px),calc(100% - 26px) calc(50% - 16px),100% 50%,calc(100% - 26px) calc(50% + 16px),calc(100% - 26px) calc(50% + 4px),0 calc(50% + 4px));}',
    /* the point of the last step: Lampblack type on a Flare block */
    '.wh-punch{position:absolute;background:var(--c-accent);color:var(--c-accent-ink);display:flex;flex-direction:column;justify-content:center;padding:0 56px 0 40px;}',
    '.wh-punch .wh-num{font-size:104px;line-height:.78;}'
  ].join('\n');

  /* ======================================================================
   * The scene
   * ==================================================================== */

  window.Scenes.define('warehouse', function (host, opts, api) {
    var Motion = api.motion || window.Motion;
    var THEME = window.THEME || null;
    var S = window.Slotting;
    if (!S || !Motion) { throw new Error('the warehouse scene needs lib/slotting-core.js and lib/motion.js'); }

    var fast = !!(api.mode && api.mode.fast);
    var M = model(opts.sim || null);
    var world = M.world, L = world.layout, F = world.fast, P = world.params;
    var nParts = F.nParts;
    var arrive = (THEME && THEME.motion && THEME.motion.ease && THEME.motion.ease.arrive) || arriveFallback;
    var SPEED = (THEME && THEME.motion && THEME.motion.barSpeed) || 900;      // px per second: bars and routes share one speed
    var TICK = (THEME && THEME.motion && THEME.motion.note && THEME.motion.note.sixteenth) || 0.125;   // counters tick, they never blur

    if (fast) { M.finishNow(); } else { M.pump(); }

    /* ------------------------------------------------------------------
     * Geometry (design px; the origin is the top-left of the scene host)
     * ---------------------------------------------------------------- */

    var K = 9.2;                                   // px per foot, both ways: the map is to scale
    var MAP_X = 128 - SPINE;                       // the building's left wall
    var MAP_Y = 262;                               // the building's back wall (top of the drawing)
    var MAP_W = L.width * K, MAP_H = L.length * K;
    var PAD = 16;                                  // canvas margin around the building
    var CV = { x: MAP_X - PAD, y: MAP_Y - PAD, w: Math.ceil(MAP_W + 2 * PAD), h: Math.ceil(MAP_H + 2 * PAD) };
    var SIDE_X = 1280 - SPINE, SIDE_R = 1864 - SPINE;
    var SIDE = { x: SIDE_X - 8, y: 214, w: DESIGN_W - SIDE_X + 8, h: DESIGN_H - 214 };
    var WALL = 6, RACK = 3;

    function fx(ft) { return PAD + ft * K; }                       // feet -> map-canvas px
    function fy(ft) { return PAD + (L.length - ft) * K; }          // the front (dock side) is at the bottom

    /* Where each slot's dot sits. A bay face is drawn as 2 x 3 dots: the
     * column by the aisle is the low shelves (floor, golden, golden), the
     * column at the back of the rack is the high ones (reach, ladder, ladder). */
    var slotX = new Float32Array(F.nSlots), slotY = new Float32Array(F.nSlots);
    var half = L.aisleWidth / 2, depth = L.rackDepth;
    var COL = [0.27, 0.75];                        // column centres, as a share of the rack depth from the aisle
    (function () {
      for (var s = 0; s < F.nSlots; s++) {
        var sl = world.slots[s];
        var lv = sl.level - 1;
        var col = lv < 3 ? 0 : 1, row = lv % 3;
        var dx = half + depth * COL[col];
        var xFt = sl.x + (sl.side === 0 ? -dx : dx);
        var yFt = L.blockY0[sl.block] + (sl.bay + (row + 0.5) / 3) * L.bayWidth;
        slotX[s] = fx(xFt);
        slotY[s] = fy(yFt);
      }
    }());

    /* the footprint of a bay face (for the ladder frames) */
    function faceRect(slotId) {
      var sl = world.slots[slotId];
      var x0 = sl.side === 0 ? sl.x - half - depth : sl.x + half;
      var y0 = L.blockY0[sl.block] + sl.bay * L.bayWidth;
      return { x: fx(x0), y: fy(y0 + L.bayWidth), w: depth * K, h: L.bayWidth * K };
    }

    /* the side view of one bay */
    var EL = { top: 274, rowH: 46, postL: SIDE_X + 190, postR: SIDE_X + 478, post: 8 };
    EL.bottom = EL.top + 6 * EL.rowH;
    EL.x0 = EL.postL + EL.post;                    // where a bar starts
    EL.full = EL.postR - EL.x0;                    // bar length that stands for FULL_SHARE of all picks
    var FULL_SHARE = 0.5;

    /* the cost curve */
    var CH = { x: SIDE_X + 8, y: 852, w: 392, h: 182 };

    /* ------------------------------------------------------------------
     * Colours: read from the tokens once per mount
     * ---------------------------------------------------------------- */

    var dark = opts.ground === 'dark';
    var slideEl = host.closest ? host.closest('.slide') : null;
    if (dark && slideEl) { slideEl.classList.add('on-ink'); }
    var INK, BG, FLARE, WARN, MUTED;
    function readTokens() {
      INK = api.token('--c-ink', '#050505');
      BG = api.token('--c-bg', '#F4EDDE');
      FLARE = api.token('--c-accent', '#FF6842');
      WARN = api.token('--c-warn', INK);
      MUTED = api.token('--c-muted', '#8A8275');
    }
    readTokens();

    /* ------------------------------------------------------------------
     * DOM
     * ---------------------------------------------------------------- */

    var root = el('div', 'wh');
    var style = el('style');
    style.textContent = CSS;
    root.appendChild(style);
    host.appendChild(root);

    function canvasAt(r) {
      var c = document.createElement('canvas');
      c.style.left = r.x + 'px';
      c.style.top = r.y + 'px';
      c.style.width = r.w + 'px';
      c.style.height = r.h + 'px';
      root.appendChild(c);
      return c;
    }
    var cvStruct = canvasAt(CV), cvDots = canvasAt(CV), cvLive = canvasAt(CV), cvSide = canvasAt(SIDE);
    var gStruct, gDots, gLive, gSide;

    function fitAll() {
      var s = Math.min(host.clientWidth / DESIGN_W, host.clientHeight / DESIGN_H);
      root.style.transform = (s > 0 && Math.abs(s - 1) > 0.002) ? 'scale(' + s + ')' : '';
      gStruct = api.fitCanvas(cvStruct).ctx;
      gDots = api.fitCanvas(cvDots).ctx;
      gLive = api.fitCanvas(cvLive).ctx;
      gSide = api.fitCanvas(cvSide).ctx;
    }

    function text(cls, str, x, y, parent) {
      var node = el('div', 'wh-t ' + cls, str);
      node.style.left = x + 'px';
      node.style.top = y + 'px';
      (parent || root).appendChild(node);
      return node;
    }

    var dom = {};

    /* aisle numbers along the back wall */
    dom.aisles = [];
    L.aisleX.forEach(function (xFt, a) {
      var n = text('wh-label is-s', (a < 9 ? '0' : '') + (a + 1), 0, MAP_Y - 44);
      n.style.left = (CV.x + fx(xFt)) + 'px';
      n.style.transform = 'translateX(-50%)';
      n.style.letterSpacing = '.04em';
      dom.aisles.push(n);
    });

    /* pack station: a plate hanging off the front wall, under its door */
    var packX = CV.x + fx(L.pack.x);
    dom.pack = text('wh-plate wh-label', 'Pack station', MAP_X - WALL / 2, MAP_Y + MAP_H + WALL / 2 - 1);
    dom.dock = text('wh-label', 'Dock side', 0, MAP_Y + MAP_H + 16);
    dom.dock.style.left = 'auto';
    dom.dock.style.right = (DESIGN_W - (MAP_X + MAP_W)) + 'px';

    /* the anatomy labels of step 0 */
    function plateAt(str, xFt, yFt, cls) {
      var n = text('wh-label wh-plate ' + cls, str, CV.x + fx(xFt), CV.y + fy(yFt));
      n.style.transform = 'translate(-50%,-50%)';
      return n;
    }
    dom.blockBack = plateAt('Back block', L.width / 2, L.blockY0[1] + L.blockLength / 2, 'is-ground');
    dom.blockFront = plateAt('Front block', L.width / 2, L.blockY0[0] + L.blockLength / 2, 'is-ground');
    dom.cross = plateAt('Cross-aisle', L.width / 2, L.crossY[1], 'is-bare');

    /* legend: dot size first, ink second */
    dom.legend = el('div', 'wh-t wh-legend');
    dom.legend.style.left = (MAP_X + 372) + 'px';
    dom.legend.style.top = (MAP_Y + MAP_H + 4) + 'px';
    [['is-c', 'Slow'], ['is-b', 'Steady'], ['is-a', 'Fast mover']].forEach(function (k) {
      var item = el('div', 'wh-key wh-label');
      item.appendChild(el('i', k[0]));
      item.appendChild(document.createTextNode(k[1]));
      dom.legend.appendChild(item);
    });
    root.appendChild(dom.legend);

    /* side view: title, zone names, a value per level */
    dom.elTitle = text('wh-label', 'Picks by shelf level', SIDE_X, 226);
    function zoneLabel(str, rowFrom, rows) {
      var n = text('wh-label', str, SIDE_X, 0);
      n.style.top = (EL.top + rowFrom * EL.rowH + rows * EL.rowH / 2) + 'px';
      n.style.transform = 'translateY(-50%)';
      n.style.lineHeight = '1.15';
      n.style.whiteSpace = 'normal';
      n.style.width = '180px';
      return n;
    }
    dom.zones = [zoneLabel('Ladder', 0, 2), zoneLabel('Reach', 2, 1), zoneLabel('Golden zone', 3, 2), zoneLabel('Floor', 5, 1)];
    dom.levelVals = [];
    for (var lvRow = 0; lvRow < 6; lvRow++) {
      var v = text('wh-body', '', 0, EL.top + lvRow * EL.rowH + EL.rowH / 2);
      v.style.left = 'auto';
      v.style.right = (DESIGN_W - SIDE_R) + 'px';
      v.style.transform = 'translateY(-50%)';
      v.style.fontVariantNumeric = 'tabular-nums';
      dom.levelVals.push(v);                       // row 0 is level 6 (the top shelf)
    }

    /* two figure slots under the side view */
    function figure(y) {
      var f = el('div', 'wh-fig');
      f.style.left = SIDE_X + 'px';
      f.style.top = y + 'px';
      var label = el('div', 'wh-label');
      var chip = el('i', 'wh-chip');
      var labelText = el('span');
      label.appendChild(chip);
      label.appendChild(labelText);
      var num = el('div', 'wh-num');
      var b = el('b');
      var unit = el('small');
      num.appendChild(b);
      num.appendChild(unit);
      var sub = el('div', 'wh-sub wh-label');
      var subChip = el('i', 'wh-chip');
      var subText = el('span');
      sub.appendChild(subChip);
      sub.appendChild(subText);
      f.appendChild(label);
      f.appendChild(num);
      f.appendChild(sub);
      root.appendChild(f);
      return { box: f, chip: chip, label: labelText, value: b, unit: unit, sub: sub, subChip: subChip, subText: subText };
    }
    dom.figA = figure(590);
    dom.figB = figure(808);

    function setFigure(fig, o) {
      show(fig.box, !!o);
      if (!o) { return; }
      setText(fig.label, o.label);
      fig.chip.className = 'wh-chip' + (o.chip ? ' is-' + o.chip : '');
      show(fig.chip, !!o.chip);
      setText(fig.value, o.value);
      setText(fig.unit, o.unit || '');
      show(fig.sub, !!o.sub);
      if (o.sub) {
        setText(fig.subText, o.sub);
        fig.subChip.className = 'wh-chip' + (o.subChip ? ' is-' + o.subChip : '');
        show(fig.subChip, !!o.subChip);
      }
    }

    /* cost curve labels */
    dom.chTitle = text('wh-label', 'Pick hours a year', SIDE_X, 0);
    dom.chAsIsLabel = text('wh-label', 'As-is', 0, 0);
    dom.chAsIsLabel.style.left = 'auto';
    dom.chAsIsLabel.style.right = (DESIGN_W - SIDE_R) + 'px';
    dom.chAsIs = text('wh-num wh-hollow', '', 0, 0);
    dom.chAsIs.style.fontSize = '64px';
    dom.chHead = text('wh-num', '', 0, 0);
    dom.chHead.style.fontSize = '64px';
    dom.chNote = text('wh-voice', 'Drawn to scale.', 0, 0);

    /* before / after */
    dom.table = el('div', 'wh-table');
    dom.table.style.left = SIDE_X + 'px';
    dom.table.style.top = '222px';
    dom.table.style.width = (SIDE_R - SIDE_X) + 'px';
    var th = el('div', 'wh-th');
    th.appendChild(el('div', 'wh-label', 'As-is move'));
    th.appendChild(el('div'));
    th.appendChild(el('div', 'wh-label', 'Optimized'));
    dom.table.appendChild(th);
    dom.rows = [];
    ['Feet per pick run', 'Pick hours per year', 'Picks that need a ladder', 'Fast movers in the golden zone'].forEach(function (what) {
      var row = el('div', 'wh-row' + (dom.rows.length ? '' : ' is-first'));
      row.appendChild(el('div', 'wh-body', what));
      var before = el('div', 'wh-num wh-v is-before');
      var bb = el('b'), bu = el('small');
      before.appendChild(bb); before.appendChild(bu);
      var arrow = el('i', 'wh-arrow');
      var after = el('div', 'wh-num wh-v is-after');
      var ab = el('b'), au = el('small');
      after.appendChild(ab); after.appendChild(au);
      row.appendChild(before);
      row.appendChild(arrow);
      row.appendChild(after);
      dom.table.appendChild(row);
      dom.rows.push({ row: row, before: bb, beforeUnit: bu, arrow: arrow, after: ab, afterUnit: au, afterBox: after });
    });
    root.appendChild(dom.table);

    /* the last step */
    dom.punch = el('div', 'wh-punch');
    dom.punch.style.left = (SIDE_X - 40) + 'px';
    dom.punch.style.right = '0';
    dom.punch.style.top = '872px';
    dom.punch.style.bottom = '0';
    dom.punch.appendChild(el('div', 'wh-num', 'No AI model'));
    dom.punch.appendChild(el('div', 'wh-num', 'in the loop.'));
    root.appendChild(dom.punch);

    /* numbers the slide's own captions quote (the slide marks them with data-wh) */
    function fillCaptions() {
      if (!slideEl) { return; }
      var values = {
        parts: commas(world.totals.parts),
        slots: commas(world.totals.slots),
        orders: commas(world.totals.orders),
        dayOrders: String(M.dayOrders.length),
        iterations: commas(P.iterations)
      };
      if (M.ready) {
        values.tried = commas(M.result.anneal.tried);
        values.ms = commas(M.result.anneal.ms);
      }
      Object.keys(values).forEach(function (key) {
        var nodes = slideEl.querySelectorAll('[data-wh="' + key + '"]');
        for (var i = 0; i < nodes.length; i++) { setText(nodes[i], values[key]); }
      });
    }

    /* ------------------------------------------------------------------
     * Per-part drawing state
     * ---------------------------------------------------------------- */

    var counts = new Int32Array(nParts);           // picks counted so far (the rain); F.picks when full
    var countsN = -1;                              // how many orders are in `counts`
    var px = new Float32Array(nParts), py = new Float32Array(nParts), pr = new Float32Array(nParts);
    var pink = new Uint8Array(nParts);             // 0 hidden, 1 base ink, 2 Flare (a fast mover)
    var cur = S.copyAssignment(M.seed);            // the placement during the search playback
    var curK = 0;                                  // kept swaps already applied to `cur`
    var curFor = 'seed';

    /* dot size first: radius from the pick count, in tiers that survive a projector */
    var R0 = 1.5, R1 = 2.4, RB = 4.1, RA0 = 5.6, RA1 = 7.3;
    var sqA = Math.sqrt(M.aMin), sqMax = Math.sqrt(M.maxPicks);
    function radius(count, isA) {
      if (count <= 0) { return R0; }
      var q = Math.sqrt(count);
      if (isA && count >= M.aMin) { return RA0 + (RA1 - RA0) * (sqMax > sqA ? (q - sqA) / (sqMax - sqA) : 1); }
      return R1 + (RB - R1) * Math.min(1, sqA > 1 ? (q - 1) / (sqA - 1) : 1);
    }

    function setCounts(nOrders) {
      nOrders = Math.max(0, Math.min(F.nOrders, nOrders));
      if (nOrders === countsN) { return; }
      var from = countsN, i;
      if (countsN < 0 || nOrders < countsN) { for (i = 0; i < nParts; i++) { counts[i] = 0; } from = 0; }
      for (i = F.ordStart[from]; i < F.ordStart[nOrders]; i++) { counts[F.ordParts[i]]++; }
      countsN = nOrders;
    }

    /* fill px/py/pr/pink from a placement and the current counts */
    function partsFromAssignment(partSlot) {
      for (var p = 0; p < nParts; p++) {
        var s = partSlot[p];
        var isA = F.cls[p] === 0;
        px[p] = slotX[s]; py[p] = slotY[s];
        pr[p] = radius(counts[p], isA);
        pink[p] = (isA && counts[p] >= M.aMin) ? 2 : 1;
      }
    }

    function paintParts(g) {
      var p;
      g.clearRect(0, 0, CV.w, CV.h);
      g.fillStyle = INK;
      g.beginPath();
      for (p = 0; p < nParts; p++) {
        if (pink[p] !== 1) { continue; }
        g.moveTo(px[p] + pr[p], py[p]);
        g.arc(px[p], py[p], pr[p], 0, 6.2832);
      }
      g.fill();
      // fast movers: Flare, ringed in the base ink (Flare alone is too faint on Card)
      g.beginPath();
      for (p = 0; p < nParts; p++) {
        if (pink[p] !== 2) { continue; }
        g.moveTo(px[p] + pr[p], py[p]);
        g.arc(px[p], py[p], pr[p], 0, 6.2832);
      }
      g.fillStyle = INK;
      g.fill();
      g.beginPath();
      for (p = 0; p < nParts; p++) {
        if (pink[p] !== 2) { continue; }
        var ri = pr[p] - 1.9;
        g.moveTo(px[p] + ri, py[p]);
        g.arc(px[p], py[p], ri, 0, 6.2832);
      }
      g.fillStyle = FLARE;
      g.fill();
    }

    /* ------------------------------------------------------------------
     * Structure layer: wall, racks, door. drawn(sec) = seconds into the
     * draw-in; Infinity = complete.
     * ---------------------------------------------------------------- */

    var rackDelay = [];
    var rackMax = 0;
    L.racks.forEach(function (r) {
      var d = (r.x0 + r.x1) / 2 + r.block * (L.blockLength + L.crossAisle) * 0.6;
      rackDelay.push(d);
      if (d > rackMax) { rackMax = d; }
    });
    var T_WALL = 0.55, T_RACK0 = 0.45, T_RACKS = 1.35, T_GROW = (L.blockLength * K) / SPEED;
    var T_STRUCT = T_RACK0 + T_RACKS + T_GROW;     // when the last rack is complete

    function rackStart(i) { return T_RACK0 + T_RACKS * rackDelay[i] / rackMax; }

    function drawStructure(sec) {
      var g = gStruct;
      g.clearRect(0, 0, CV.w, CV.h);
      g.lineCap = 'butt';
      g.lineJoin = 'miter';

      // the wall, with a door at the pack station: drawn clockwise from the door at one speed
      var x0 = fx(0), y0 = fy(L.length), x1 = fx(L.width), y1 = fy(0);
      var dL = fx(L.pack.x - half - 0.6), dR = fx(L.pack.x + half + 0.6);
      var pts = [[dL, y1], [x0, y1], [x0, y0], [x1, y0], [x1, y1], [dR, y1]];
      var total = 0, i;
      for (i = 1; i < pts.length; i++) { total += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]); }
      var want = total * clamp01(sec / T_WALL);
      if (want > 0) {
        g.strokeStyle = INK;
        g.lineWidth = WALL;
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (i = 1; i < pts.length && want > 0; i++) {
          var seg = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
          var f = Math.min(1, want / seg);
          g.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
          want -= seg;
        }
        g.stroke();
        // door posts
        if (sec >= T_WALL) {
          g.fillStyle = INK;
          g.fillRect(dL - WALL / 2, y1 - 10, WALL, 20);
          g.fillRect(dR - WALL / 2, y1 - 10, WALL, 20);
        }
      }

      // racks: each outline grows from its front end to its back end
      g.strokeStyle = INK;
      g.lineWidth = RACK;
      for (i = 0; i < L.racks.length; i++) {
        var r = L.racks[i];
        var grow = clamp01((sec - rackStart(i)) / T_GROW);
        if (grow <= 0) { continue; }
        var rx = fx(r.x0) + RACK / 2, rw = (r.x1 - r.x0) * K - RACK;
        var ryBottom = fy(r.y0) - RACK / 2;
        var rh = ((r.y1 - r.y0) * K - RACK) * grow;
        g.strokeRect(rx, ryBottom - rh, rw, rh);
      }
    }

    /* ------------------------------------------------------------------
     * A day of picking: who walks what, when
     * ---------------------------------------------------------------- */

    var PICKERS = Math.max(1, Math.min(8, Math.round(Number(opts.pickers)) || 5));
    var COMPRESS = (SPEED / K) / P.walkFtPerSec;   // model seconds per animation second
    var START_GAP = 0.2;

    function buildDay(routes) {
      var free = [];
      var i, k;
      for (i = 0; i < PICKERS; i++) { free.push(0); }
      var runs = routes.map(function (rt) {
        var who = 0;
        for (i = 1; i < PICKERS; i++) { if (free[i] < free[who] - 1e-9) { who = i; } }
        var start = free[who] + START_GAP;
        // time -> distance: walk, dwell at each stop, walk, ... , walk home
        var marks = [{ t: 0, d: 0 }];
        var t = 0, d = 0;
        var dwells = [];
        for (k = 0; k < rt.stops.length; k++) {
          var st = rt.stops[k];
          t += (st.atFeet - d) / P.walkFtPerSec / COMPRESS;
          d = st.atFeet;
          marks.push({ t: t, d: d });
          var extra = st.zone === 'floor' ? P.floorSec : (st.zone === 'reach' ? P.reachSec : (st.ladderSetup ? P.ladderSetupSec : 0));
          dwells.push({ at: start + t, len: extra / COMPRESS, slot: st.slot, ladder: st.ladder, setup: st.ladderSetup });
          if (extra > 0) { t += extra / COMPRESS; marks.push({ t: t, d: d }); }
        }
        t += (rt.feet - d) / P.walkFtPerSec / COMPRESS;
        marks.push({ t: t, d: rt.feet });
        // the walk as a polyline with running lengths
        var cum = [0];
        for (k = 1; k < rt.path.length; k++) {
          cum.push(cum[k - 1] + Math.abs(rt.path[k][0] - rt.path[k - 1][0]) + Math.abs(rt.path[k][1] - rt.path[k - 1][1]));
        }
        free[who] = start + t;
        return { who: who, start: start, end: start + t, marks: marks, dwells: dwells, path: rt.path, cum: cum, feet: rt.feet, setups: rt.ladderSetups };
      });
      var duration = 0, feet = 0, setups = 0;
      runs.forEach(function (r) { duration = Math.max(duration, r.end); feet += r.feet; setups += r.setups; });
      return { runs: runs, duration: duration, feet: feet, setups: setups };
    }

    function distanceAt(run, t) {
      var local = t - run.start;
      if (local <= 0) { return 0; }
      var mk = run.marks;
      for (var i = 1; i < mk.length; i++) {
        if (local <= mk[i].t) {
          var span = mk[i].t - mk[i - 1].t;
          return span > 0 ? lerp(mk[i - 1].d, mk[i].d, (local - mk[i - 1].t) / span) : mk[i].d;
        }
      }
      return run.feet;
    }

    function pointAt(run, d) {
      var c = run.cum, path = run.path;
      for (var i = 1; i < c.length; i++) {
        if (d <= c[i]) {
          var span = c[i] - c[i - 1];
          var f = span > 0 ? (d - c[i - 1]) / span : 0;
          return [lerp(path[i - 1][0], path[i][0], f), lerp(path[i - 1][1], path[i][1], f)];
        }
      }
      return path[path.length - 1];
    }

    /* Traffic: how many times each half-foot of walkway has been walked. */
    var aisleIndex = {};
    L.aisleX.forEach(function (x, a) { aisleIndex[x] = a; });
    var crossIndex = {};
    L.crossY.forEach(function (y, c) { crossIndex[y] = c; });
    var NV = Math.ceil(L.length * 2) + 1, NH = Math.ceil(L.width * 2) + 1;

    function newTraffic() {
      return { v: L.aisleX.map(function () { return new Uint16Array(NV); }), h: L.crossY.map(function () { return new Uint16Array(NH); }), max: 0 };
    }

    function addWalk(tr, run, d) {
      var c = run.cum, path = run.path;
      for (var i = 1; i < c.length && c[i - 1] < d; i++) {
        var f = Math.min(1, (d - c[i - 1]) / (c[i] - c[i - 1] || 1));
        var ax = path[i - 1][0], ay = path[i - 1][1];
        var bx = lerp(ax, path[i][0], f), by = lerp(ay, path[i][1], f);
        var lo, hi, j, arr;
        if (ax === path[i][0]) {
          arr = tr.v[aisleIndex[ax]];
          lo = Math.round(Math.min(ay, by) * 2); hi = Math.round(Math.max(ay, by) * 2);
        } else {
          arr = tr.h[crossIndex[ay]];
          lo = Math.round(Math.min(ax, bx) * 2); hi = Math.round(Math.max(ax, bx) * 2);
        }
        if (!arr) { continue; }
        for (j = lo; j < hi; j++) { arr[j]++; }
      }
    }

    function trafficAt(day, t) {
      var tr = newTraffic();
      day.runs.forEach(function (run) {
        if (t <= run.start) { return; }
        addWalk(tr, run, t >= run.end ? run.feet + 1 : distanceAt(run, t));
      });
      return tr;
    }

    function trafficMax(tr) {
      var mx = 0;
      tr.v.concat(tr.h).forEach(function (arr) { for (var i = 0; i < arr.length; i++) { if (arr[i] > mx) { mx = arr[i]; } } });
      return mx;
    }

    var dayBefore = buildDay(M.routesBefore);
    var dayAfter = null;
    var fullBefore = trafficAt(dayBefore, Infinity);
    var fullAfter = null;
    var TRAFFIC_MAX = trafficMax(fullBefore);
    var BAND_MIN = 6, BAND_MAX = 15;

    function needOptimized() {
      if (!M.ready) { M.finishNow(); }
      if (!dayAfter) {
        dayAfter = buildDay(M.routesAfter);
        fullAfter = trafficAt(dayAfter, Infinity);
        TRAFFIC_MAX = Math.max(TRAFFIC_MAX, trafficMax(fullAfter));
      }
      fillCaptions();
    }

    function bandWidth(n) {
      if (n <= 0) { return 0; }
      if (TRAFFIC_MAX <= 1) { return BAND_MIN; }
      return BAND_MIN + (BAND_MAX - BAND_MIN) * Math.sqrt((n - 1) / (TRAFFIC_MAX - 1));
    }

    /* solid bands, as wide as the traffic */
    function drawBands(g, tr) {
      g.fillStyle = INK;
      var a, c, i, n, start;
      for (a = 0; a < tr.v.length; a++) {
        var arr = tr.v[a], x = fx(L.aisleX[a]);
        for (i = 0; i < arr.length;) {
          n = arr[i];
          if (!n) { i++; continue; }
          start = i;
          while (i < arr.length && arr[i] === n) { i++; }
          var w = bandWidth(n);
          g.fillRect(x - w / 2, fy(i / 2), w, (i - start) / 2 * K);
        }
      }
      for (c = 0; c < tr.h.length; c++) {
        var row = tr.h[c], y = fy(L.crossY[c]);
        for (i = 0; i < row.length;) {
          n = row[i];
          if (!n) { i++; continue; }
          start = i;
          while (i < row.length && row[i] === n) { i++; }
          var hgt = bandWidth(n);
          g.fillRect(fx(start / 2) - (start > 0 && row[start - 1] ? 0 : hgt / 2), y - hgt / 2, (i - start) / 2 * K + hgt / 2, hgt);
        }
      }
    }

    /* the footprint of a walk: a dashed line wherever anyone walked */
    function drawFootprint(g, tr) {
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.lineCap = 'butt';
      g.setLineDash([10, 9]);
      g.beginPath();
      var a, c, i, start;
      for (a = 0; a < tr.v.length; a++) {
        var arr = tr.v[a], x = fx(L.aisleX[a]);
        for (i = 0; i < arr.length;) {
          if (!arr[i]) { i++; continue; }
          start = i;
          while (i < arr.length && arr[i]) { i++; }
          g.moveTo(x, fy(start / 2));
          g.lineTo(x, fy(i / 2));
        }
      }
      for (c = 0; c < tr.h.length; c++) {
        var row = tr.h[c], y = fy(L.crossY[c]);
        for (i = 0; i < row.length;) {
          if (!row[i]) { i++; continue; }
          start = i;
          while (i < row.length && row[i]) { i++; }
          g.moveTo(fx(start / 2), y);
          g.lineTo(fx(i / 2), y);
        }
      }
      g.stroke();
      g.setLineDash([]);
    }

    function hatchRect(g, x, y, w, h, gap, lw) {
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.strokeStyle = WARN;
      g.lineWidth = lw;
      g.beginPath();
      for (var d = -h; d < w + gap; d += gap) { g.moveTo(x + d, y + h); g.lineTo(x + d + h, y); }
      g.stroke();
      g.restore();
    }

    /* pickers, ladder set-ups and the pick blips of a day at time t */
    function drawDayLive(g, day, t, withPickers) {
      var feet = 0, setups = 0;
      day.runs.forEach(function (run) {
        if (t <= run.start) { return; }
        var d = t >= run.end ? run.feet : distanceAt(run, t);
        feet += d;
        run.dwells.forEach(function (dw) {
          if (t < dw.at) { return; }
          var age = t - dw.at;
          if (dw.setup) {
            setups++;
            var r = faceRect(dw.slot);
            // the caution mark: while the ladder is being fetched the bay blinks
            // between a solid block and a hatch; afterwards a frame stays behind
            if (age < dw.len && Math.floor(age / TICK) % 2 === 0) {
              g.fillStyle = WARN;
              g.fillRect(r.x, r.y, r.w, r.h);
            } else if (age < dw.len) {
              g.fillStyle = BG;
              g.fillRect(r.x, r.y, r.w, r.h);
              hatchRect(g, r.x, r.y, r.w, r.h, 9, 3);
            }
            g.strokeStyle = WARN;
            g.lineWidth = 4;
            g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
          } else if (age < 0.25 && withPickers) {
            // a pick: a square ring on the slot, gone in two sixteenths
            g.strokeStyle = INK;
            g.lineWidth = 3;
            g.strokeRect(slotX[dw.slot] - 9, slotY[dw.slot] - 9, 18, 18);
          }
        });
      });
      if (withPickers) {
        day.runs.forEach(function (run) {
          if (t <= run.start || t >= run.end) { return; }
          var pt = pointAt(run, distanceAt(run, t));
          var x = fx(pt[0]), y = fy(pt[1]);
          g.fillStyle = BG;
          g.fillRect(x - 10, y - 10, 20, 20);
          g.fillStyle = INK;
          g.fillRect(x - 7, y - 7, 14, 14);
        });
      }
      return { feet: feet, setups: setups };
    }

    /* ------------------------------------------------------------------
     * The side view and the cost curve
     * ---------------------------------------------------------------- */

    function sx(x) { return x - SIDE.x; }
    function sy(y) { return y - SIDE.y; }

    /* frame: seconds into its draw-in (Infinity = complete); shares: [level 1..6] or null */
    function drawElevation(g, frame, shares) {
      var postGrow = clamp01((frame - 0.5) / 0.4);
      var shelfGrow = clamp01((frame - 0.9) / 0.35);
      if (postGrow <= 0) { return; }
      var h = (EL.bottom - EL.top) * postGrow;
      g.fillStyle = INK;
      g.fillRect(sx(EL.postL), sy(EL.bottom - h), EL.post, h);
      g.fillRect(sx(EL.postR), sy(EL.bottom - h), EL.post, h);
      // the floor line
      g.fillRect(sx(EL.postL - 14), sy(EL.bottom), (EL.postR + EL.post + 14 - (EL.postL - 14)) * postGrow, 6);
      if (shelfGrow <= 0) { return; }
      var span = (EL.postR - EL.x0) * shelfGrow;
      for (var row = 0; row < 6; row++) {
        g.fillRect(sx(EL.x0), sy(EL.top + row * EL.rowH) - 1.5, span, 3);
      }
      if (!shares) { return; }
      for (row = 0; row < 6; row++) {
        var level = 5 - row;                       // row 0 is the top shelf, level 6
        var len = Math.min(1.2, shares[level] / FULL_SHARE) * EL.full;
        if (len <= 0.5) { continue; }
        var y = sy(EL.top + row * EL.rowH) + 8, bh = EL.rowH - 15;
        if (level >= 4) {
          // ladder levels: the caution hatch
          hatchRect(g, sx(EL.x0), y, len, bh, 11, 4);
          g.strokeStyle = WARN;
          g.lineWidth = 3;
          g.strokeRect(sx(EL.x0) + 1.5, y + 1.5, Math.max(0, len - 3), bh - 3);
        } else {
          g.fillStyle = INK;
          g.fillRect(sx(EL.x0), y, len, bh);
        }
      }
    }

    function hoursY(hours, top) { return CH.y + CH.h - (hours / top) * CH.h; }

    /* points: [{ x: 0..1, hours }], head: the last point */
    function drawCurve(g, o) {
      var top = M.before.pickHoursPerYear;
      var x0 = sx(CH.x), yb = sy(CH.y + CH.h);
      g.fillStyle = INK;
      g.fillRect(x0, yb, CH.w, 6);                                   // the zero line
      g.fillRect(x0 - 6, sy(CH.y) - 2, 6, CH.h + 8);                 // the scale
      // the as-is level
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.setLineDash([12, 9]);
      g.beginPath();
      g.moveTo(x0, sy(hoursY(top, top)));
      g.lineTo(x0 + CH.w, sy(hoursY(top, top)));
      g.stroke();
      g.setLineDash([]);
      if (!o.points || !o.points.length) { return; }
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.lineJoin = 'round';
      g.beginPath();
      o.points.forEach(function (pt, i) {
        var x = x0 + pt.x * CH.w, y = sy(hoursY(pt.hours, top));
        if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
      });
      g.stroke();
      var head = o.points[o.points.length - 1];
      var hx = x0 + head.x * CH.w, hy = sy(hoursY(head.hours, top));
      g.fillStyle = INK;
      g.beginPath();
      g.arc(hx, hy, 12, 0, 6.2832);
      g.fill();
      g.fillStyle = FLARE;
      g.beginPath();
      g.arc(hx, hy, 7.5, 0, 6.2832);
      g.fill();
    }

    /* ------------------------------------------------------------------
     * Timelines
     * ---------------------------------------------------------------- */

    var T_IN = 0.3;                                // the sleeve is still over the slide
    var D0 = T_IN + T_STRUCT + 1.6;
    var RAIN = 5.2, D1 = RAIN + 0.5;
    var FLY_SPAN = 2.0, FLY_LEN = 0.5, T_FLY = FLY_SPAN + FLY_LEN + 0.3, T_SEARCH = 5.4, D3 = T_FLY + T_SEARCH + 0.4;
    var D5 = 2.6, D6 = 0.8;

    function duration(step) {
      if (step === 0) { return D0; }
      if (step === 1) { return D1; }
      if (step === 2) { return dayBefore.duration + 0.4; }
      if (step === 3) { return D3; }
      if (step === 4) { return (dayAfter ? dayAfter.duration : 6) + 0.4; }
      if (step === 5) { return D5; }
      return D6;
    }

    /* when each part leaves for its rule-of-thumb slot: fast movers first, and slowly enough to watch */
    var flyStart = new Float32Array(nParts);
    (function () {
      var n = M.flyOrder.length;
      var nA = world.classes.A, nB = world.classes.B;
      for (var i = 0; i < n; i++) {
        var u;
        if (i < nA) { u = 0.5 * i / Math.max(1, nA); }
        else if (i < nA + nB) { u = 0.5 + 0.28 * (i - nA) / Math.max(1, nB); }
        else { u = 0.78 + 0.22 * (i - nA - nB) / Math.max(1, n - nA - nB); }
        flyStart[M.flyOrder[i]] = u * FLY_SPAN;
      }
    }());

    function levelShares(partSlot, useCounts) {
      var by = [0, 0, 0, 0, 0, 0];
      var c = useCounts ? counts : F.picks;
      for (var p = 0; p < nParts; p++) { by[F.slotLevel[partSlot[p]]] += c[p]; }
      var total = world.totals.picks || 1;
      return by.map(function (n) { return n / total; });
    }

    function searchState(tried) {
      // the placement after every kept swap up to `tried`
      var log = M.result.anneal.log;
      var lo = 0, hi = log.count;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (log.tried[mid] <= tried) { lo = mid + 1; } else { hi = mid; } }
      if (curFor !== 'search' || lo < curK) { cur = S.copyAssignment(M.seed); curK = 0; curFor = 'search'; }
      for (; curK < lo; curK++) { S.applyMove(cur, log.part[curK], log.to[curK]); }
      return cur;
    }

    function curveUpTo(tried) {
      var trace = M.result.anneal.trace, n = M.result.anneal.iterations || 1;
      var pts = [];
      for (var i = 0; i < trace.length && trace[i].tried <= tried; i++) { pts.push({ x: trace[i].tried / n, hours: trace[i].hours }); }
      if (i < trace.length && i > 0) {
        var a = trace[i - 1], b = trace[i];
        var f = (tried - a.tried) / (b.tried - a.tried || 1);
        pts.push({ x: tried / n, hours: lerp(a.hours, b.hours, f) });
      }
      return pts;
    }

    /* a count that ticks twelve times and lands (the theme's counter) */
    function ticked(value, t, start, len) {
      var u = clamp01((t - start) / len);
      if (u >= 1) { return value; }
      return value * arrive(Math.floor(u * 12) / 12);
    }

    var keys = { struct: null, dots: null };
    var view = { step: 0, t: 0 };

    function render(step, t) {
      view.step = step; view.t = t;
      var end = t >= duration(step) - 1e-6;
      var q = Math.floor(t / TICK) * TICK;         // the clock counters read: it moves in sixteenths
      if (step >= 3) { needOptimized(); }

      /* ---- structure ---- */
      var structSec = step === 0 ? t - T_IN : Infinity;
      var sk = structSec >= T_STRUCT + 0.01 ? 'done' : String(structSec);
      if (keys.struct !== sk) { keys.struct = sk; drawStructure(structSec); }

      /* ---- dots ---- */
      var dk, p, i;
      var shares = null;
      gLive.clearRect(0, 0, CV.w, CV.h);
      gSide.clearRect(0, 0, SIDE.w, SIDE.h);

      if (step === 0) {
        // specks: a part lives here, nothing known about it yet. They appear rack by rack.
        var shown = Math.floor(clamp01((structSec - T_RACK0 - T_GROW) / T_RACKS) * 26);
        dk = '0:' + (structSec >= T_STRUCT ? 'all' : shown);
        if (keys.dots !== dk) {
          keys.dots = dk;
          setCounts(0);
          partsFromAssignment(M.asIs.partSlot);
          if (structSec < T_STRUCT) {
            for (p = 0; p < nParts; p++) {
              var sl = world.slots[M.asIs.partSlot[p]];
              var rackOf = sl.block * (L.aisles + 1) + sl.aisle + sl.side;      // the rack this face belongs to
              if (structSec < rackStart(rackOf) + T_GROW) { pink[p] = 0; }
            }
          }
          paintParts(gDots);
        }
      } else if (step === 1) {
        var nOrders = Math.round(F.nOrders * clamp01(t / RAIN));
        dk = '1:' + nOrders;
        if (keys.dots !== dk) { keys.dots = dk; setCounts(nOrders); partsFromAssignment(M.asIs.partSlot); paintParts(gDots); }
        shares = levelShares(M.asIs.partSlot, true);
        // the rain: every pick of the last few frames falls onto its slot
        if (t < RAIN) {
          var back = Math.max(0, Math.round(F.nOrders * clamp01((t - 0.16) / RAIN)));
          gLive.fillStyle = INK;
          for (i = F.ordStart[back]; i < F.ordStart[nOrders]; i++) {
            var slot = M.asIs.partSlot[F.ordParts[i]];
            var fall = 1 - (i - F.ordStart[back]) / Math.max(1, F.ordStart[nOrders] - F.ordStart[back]);
            gLive.fillRect(slotX[slot] - 1.5, slotY[slot] - 8 - fall * 46, 3, 16);
          }
        }
      } else if (step === 2) {
        dk = 'asis';
        if (keys.dots !== dk) { keys.dots = dk; setCounts(F.nOrders); partsFromAssignment(M.asIs.partSlot); paintParts(gDots); }
        shares = levelShares(M.asIs.partSlot, false);
      } else if (step === 3 && t < T_FLY) {
        // the rule of thumb: parts fly to their starting slots, fast movers first
        keys.dots = 'fly';
        setCounts(F.nOrders);
        var by = [0, 0, 0, 0, 0, 0];
        var asIsSlot = M.asIs.partSlot, seedSlot = M.seed.partSlot;
        gLive.strokeStyle = INK;
        gLive.lineWidth = 3;
        gLive.beginPath();
        for (p = 0; p < nParts; p++) {
          var a = asIsSlot[p], b = seedSlot[p];
          var isA = F.cls[p] === 0;
          var u = clamp01((t - flyStart[p]) / FLY_LEN);
          var e = arrive(u);
          px[p] = lerp(slotX[a], slotX[b], e);
          py[p] = lerp(slotY[a], slotY[b], e);
          pr[p] = radius(F.picks[p], isA);
          pink[p] = isA ? 2 : 1;
          if (u <= 0) { by[F.slotLevel[a]] += F.picks[p]; }
          else if (u >= 1) { by[F.slotLevel[b]] += F.picks[p]; }
          // a ring where a fast mover used to live
          if (isA && u > 0 && a !== b) {
            gLive.moveTo(slotX[a] + 5.5, slotY[a]);
            gLive.arc(slotX[a], slotY[a], 5.5, 0, 6.2832);
          }
        }
        gLive.stroke();
        paintParts(gDots);
        shares = by.map(function (n) { return n / (world.totals.picks || 1); });
      } else if (step === 3) {
        var tried = Math.round(M.result.anneal.tried * clamp01((t - T_FLY) / T_SEARCH));
        var state = searchState(tried);
        dk = 's:' + curK;
        if (keys.dots !== dk) { keys.dots = dk; setCounts(F.nOrders); partsFromAssignment(state.partSlot); paintParts(gDots); }
        shares = levelShares(state.partSlot, false);
      } else {
        dk = 'opt';
        if (keys.dots !== dk) { keys.dots = dk; setCounts(F.nOrders); partsFromAssignment(M.result.optimized.partSlot); paintParts(gDots); }
        shares = levelShares(M.result.optimized.partSlot, false);
      }

      /* ---- map labels ---- */
      var labelsOn = step === 0 && structSec >= T_STRUCT + 0.25;
      show(dom.pack, step > 0 || structSec >= T_WALL);
      dom.aisles.forEach(function (n, a) { show(n, step > 0 || structSec >= T_RACK0 + T_RACKS * (a + 0.5) / L.aisles); });
      show(dom.blockFront, labelsOn);
      show(dom.blockBack, step === 0 && structSec >= T_STRUCT + 0.5);
      show(dom.cross, step === 0 && structSec >= T_STRUCT + 0.75);
      show(dom.dock, step === 0 && structSec >= T_STRUCT + 0.25);
      show(dom.legend, step >= 1);

      /* ---- the day's walk ---- */
      var live = null;
      if (step === 2) {
        drawBands(gLive, end ? fullBefore : trafficAt(dayBefore, t));
        live = drawDayLive(gLive, dayBefore, end ? Infinity : t, !end);
      } else if (step >= 4) {
        var tDay = step === 4 && !end ? t : Infinity;
        drawFootprint(gLive, fullBefore);
        drawBands(gLive, tDay === Infinity ? fullAfter : trafficAt(dayAfter, tDay));
        live = drawDayLive(gLive, dayAfter, tDay, tDay !== Infinity);
      }

      /* ---- the search: swaps flicker ---- */
      var triedNow = 0, searching = false;
      if (step === 3 && t >= T_FLY) {
        var an = M.result.anneal;
        var uS = clamp01((t - T_FLY) / T_SEARCH);
        triedNow = Math.round(an.tried * uS);
        searching = uS < 1;
        if (searching) {
          var log = an.log;
          var since = triedNow - an.tried * (0.07 / T_SEARCH);
          gLive.strokeStyle = INK;
          gLive.lineWidth = 3;
          gLive.beginPath();
          for (i = curK - 1; i >= 0 && log.tried[i] > since; i--) {
            gLive.rect(slotX[log.to[i]] - 7, slotY[log.to[i]] - 7, 14, 14);
            gLive.rect(slotX[log.from[i]] - 7, slotY[log.from[i]] - 7, 14, 14);
          }
          gLive.stroke();
          var span = an.tried * (0.22 / T_SEARCH);
          gLive.strokeStyle = INK;
          gLive.lineWidth = 3;
          gLive.fillStyle = INK;
          for (i = 0; i < an.moves.length; i++) {
            var mv = an.moves[i];
            if (mv.tried > triedNow) { break; }
            if (mv.tried < triedNow - span) { continue; }
            var age = (triedNow - mv.tried) / span;
            gLive.beginPath();
            gLive.moveTo(slotX[mv.from], slotY[mv.from]);
            gLive.lineTo(slotX[mv.to], slotY[mv.to]);
            gLive.stroke();
            var ex = lerp(slotX[mv.from], slotX[mv.to], arrive(age)), ey = lerp(slotY[mv.from], slotY[mv.to], arrive(age));
            gLive.fillRect(ex - 6, ey - 6, 12, 12);
          }
        }
      }

      /* ---- side column ---- */
      var tableOn = step >= 5;
      var elevOn = !tableOn;
      var elevSec = step === 0 ? t - T_IN : Infinity;
      if (elevOn) { drawElevation(gSide, elevSec, step >= 1 ? shares : null); }
      show(dom.elTitle, elevOn && elevSec >= 0.5);
      dom.zones.forEach(function (n, zi) { show(n, elevOn && elevSec >= 1.3 + 0.12 * (3 - zi)); });
      dom.levelVals.forEach(function (n, row) {
        var on = elevOn && step >= 1 && !!shares;
        show(n, on);
        if (on) { setText(n, Math.round(shares[5 - row] * 100) + '%'); }
      });

      var figA = null, figB = null;
      if (step === 0) {
        var c0 = T_STRUCT + 0.1;
        if (structSec >= c0) { figA = { label: 'Parts', value: commas(ticked(world.totals.parts, structSec, c0, 1.0)) }; }
        if (structSec >= c0 + 1 / 3) { figB = { label: 'Shelf slots', value: commas(ticked(world.totals.slots, structSec, c0 + 1 / 3, 1.0)) }; }
      } else if (step === 1) {
        var shownOrders = end ? F.nOrders : Math.round(F.nOrders * clamp01(q / RAIN));
        setCounts(end ? F.nOrders : Math.round(F.nOrders * clamp01(t / RAIN)));
        var ladderNow = 0, allNow = 0;
        for (p = 0; p < nParts; p++) { allNow += counts[p]; if (F.slotLadder[M.asIs.partSlot[p]]) { ladderNow += counts[p]; } }
        figA = { label: 'Orders in a year', value: commas(shownOrders) };
        figB = { label: 'Ladder picks', chip: 'ladder', value: allNow && (end || t > 0.6) ? pct(ladderNow / allNow) : '' };
      } else if (step === 2) {
        var lv2 = end ? live : drawDayQuiet(dayBefore, q);
        figA = { label: 'Feet walked', chip: 'solid', value: commas(lv2.feet), unit: 'ft', sub: 'Busiest day · ' + M.dayOrders.length + ' orders' };
        figB = { label: 'Ladder set-ups', chip: 'ladder', value: commas(lv2.setups) };
      } else if (step === 3) {
        var an3 = M.result.anneal;
        var shownTried = t < T_FLY ? 0 : (end || !searching ? an3.tried : Math.round(an3.tried * clamp01((q - T_FLY) / T_SEARCH)));
        figA = { label: 'Swaps tried', value: commas(shownTried), sub: !searching && t >= T_FLY ? commas(an3.accepted) + ' kept' : (t < T_FLY ? 'Rule of thumb first' : 'Replaying ' + commas(an3.sampleOrders) + ' orders') };
      } else if (step === 4) {
        var lv4 = end ? live : drawDayQuiet(dayAfter, q);
        figA = { label: 'Feet walked', chip: 'solid', value: commas(lv4.feet), unit: 'ft', sub: 'As-is ' + commas(dayBefore.feet) + ' ft', subChip: 'dashed' };
        figB = { label: 'Ladder set-ups', chip: 'ladder', value: commas(lv4.setups), sub: 'As-is ' + commas(dayBefore.setups) };
      }
      setFigure(dom.figA, figA);
      setFigure(dom.figB, figB);

      /* ---- the cost curve (step 3) ---- */
      var chartOn = step === 3;
      show(dom.chTitle, chartOn);
      show(dom.chAsIsLabel, chartOn);
      show(dom.chAsIs, chartOn);
      show(dom.chHead, chartOn);
      show(dom.chNote, chartOn && end);
      if (chartOn) { dom.chAsIsLabel.style.top = (CH.y - 60) + 'px'; }
      if (chartOn) {
        var topH = M.before.pickHoursPerYear;
        var pts;
        if (t < T_FLY) {
          // the head comes down the scale as parts land on their rule-of-thumb slots
          var landed = 0;
          for (p = 0; p < nParts; p++) { if (t >= flyStart[p] + FLY_LEN) { landed++; } }
          var fpos = landed / nParts * (M.flyCost.length - 1);
          var fi = Math.min(M.flyCost.length - 2, Math.floor(fpos));
          pts = [{ x: 0, hours: topH }, { x: 0, hours: lerp(M.flyCost[fi], M.flyCost[fi + 1], fpos - fi) }];
        } else {
          pts = [{ x: 0, hours: topH }].concat(curveUpTo(triedNow));
        }
        drawCurve(gSide, { points: pts });
        var head = pts[pts.length - 1];
        var headShown = end ? M.after.pickHoursPerYear : head.hours;
        dom.chTitle.style.top = (CH.y - 60) + 'px';
        var numX = CH.x + CH.w + 22;
        setText(dom.chAsIs, fixed1(topH));
        dom.chAsIs.style.left = numX + 'px';
        dom.chAsIs.style.top = (hoursY(topH, topH) - 22) + 'px';
        setText(dom.chHead, fixed1(end ? headShown : quantHours(headShown, q, t)));
        dom.chHead.style.left = numX + 'px';
        dom.chHead.style.top = Math.min(CH.y + CH.h - 40, Math.max(hoursY(topH, topH) + 34, hoursY(head.hours, topH) - 22)) + 'px';
        dom.chNote.style.left = (CH.x + 26) + 'px';
        dom.chNote.style.top = (CH.y + 16) + 'px';
      }

      /* ---- before / after (step 5), and the last word (step 6) ---- */
      show(dom.table, tableOn);
      if (tableOn) {
        var b = M.before, a2 = M.after;
        var rowsData = [
          [Math.round(b.ftPerRun), Math.round(a2.ftPerRun), 'ft', commas],
          [b.pickHoursPerYear, a2.pickHoursPerYear, 'h', fixed1],
          [b.ladderPickShare, a2.ladderPickShare, '', pct],
          [b.aGoldenShare, a2.aGoldenShare, '', pct]
        ];
        var tt = step === 5 ? t : Infinity;
        dom.rows.forEach(function (r, ri) {
          var d = rowsData[ri];
          var s0 = 0.15 + (THEME && THEME.motion && THEME.motion.swung ? THEME.motion.swung(ri) : ri * 0.4);
          var beforeOn = tt >= s0, afterOn = tt >= s0 + 0.5;
          r.row.style.visibility = beforeOn ? '' : 'hidden';
          setText(r.before, d[3](d[0]));
          setText(r.beforeUnit, '');
          r.arrow.style.visibility = afterOn ? '' : 'hidden';
          r.afterBox.style.visibility = afterOn ? '' : 'hidden';
          // the figure lands on its real value; on the way it ticks from the as-is one
          var u = clamp01((tt - s0 - 0.5) / 1.0);
          var val = u >= 1 ? d[1] : lerp(d[0], d[1], arrive(Math.floor(u * 12) / 12));
          setText(r.after, d[3](ri === 0 ? Math.round(val) : val));
          setText(r.afterUnit, d[2]);
        });
      }
      show(dom.punch, step >= 6);
      if (step >= 6) {
        // the block drops in and stops dead
        var dropU = clamp01(t / 0.375);
        var dropE = dropU * dropU;
        dom.punch.style.clipPath = dropU >= 1 ? '' : 'inset(0 0 ' + ((1 - dropE) * 100) + '% 0)';
      }
    }

    /* the head value ticks in sixteenths while the curve itself runs smoothly */
    function quantHours(hours, q, t) { return q === t ? hours : Math.round(hours * 10) / 10; }

    /* the day's totals at a time, without drawing (for the ticking counters) */
    function drawDayQuiet(day, t) {
      var feet = 0, setups = 0;
      day.runs.forEach(function (run) {
        if (t <= run.start) { return; }
        feet += t >= run.end ? run.feet : distanceAt(run, t);
        run.dwells.forEach(function (dw) { if (dw.setup && t >= dw.at) { setups++; } });
      });
      return { feet: feet, setups: setups };
    }

    /* ------------------------------------------------------------------
     * Driving it
     * ---------------------------------------------------------------- */

    var tween = null;
    var current = { step: 0, playing: false };

    function stop() {
      if (tween) { tween.cancel(); tween = null; }
      current.playing = false;
    }

    function play(step) {
      stop();
      var len = duration(step);
      current.playing = true;
      tween = Motion.tween({
        from: 0, to: len, duration: len, ease: 'linear',
        onUpdate: function (t) { render(step, t); },
        onDone: function () { tween = null; current.playing = false; render(step, duration(step)); }
      });
    }

    function settle(step) {
      stop();
      render(step, duration(step));
    }

    function goTo(step, dir) {
      step = Math.max(0, Math.min(STEPS, Math.round(step) || 0));
      current.step = step;
      if (step >= 3) { needOptimized(); }
      var animate = !fast && (dir > 0 || (dir === 0 && step === 0));
      if (animate) { play(step); } else { settle(step); }
    }

    fitAll();
    fillCaptions();
    M.whenReady(fillCaptions);
    // fonts arriving late change nothing on the canvases (all text is DOM), so there is no redraw to schedule

    return {
      step: function (n, dir) { goTo(n, dir); },
      resize: function () {
        fitAll();
        keys.struct = null;
        keys.dots = null;
        render(view.step, view.t);
      },
      destroy: function () {
        stop();
        if (dark && slideEl) { slideEl.classList.remove('on-ink'); }
        if (root.parentNode) { root.parentNode.removeChild(root); }
      },
      /* for tests and screenshots */
      debug: function () {
        return {
          step: view.step, t: view.t, playing: current.playing, ready: M.ready,
          durations: [0, 1, 2, 3, 4, 5, 6].map(function (s) { return (s >= 3 && !M.ready) ? null : duration(s); }),
          timings: { fly: T_FLY, search: T_SEARCH, rain: RAIN, structure: T_IN + T_STRUCT },
          totals: world.totals,
          day: { day: M.day, orders: M.dayOrders.length, before: { feet: dayBefore.feet, setups: dayBefore.setups, seconds: dayBefore.duration }, after: dayAfter ? { feet: dayAfter.feet, setups: dayAfter.setups, seconds: dayAfter.duration } : null },
          before: M.before, after: M.after,
          anneal: M.result ? { tried: M.result.anneal.tried, accepted: M.result.anneal.accepted, ms: M.result.anneal.ms } : null,
          fingerprint: M.result ? S.digest(M.result).hash : null
        };
      },
      /* draw any moment of any step (seconds into the step); used for frame capture */
      seek: function (step, t) { stop(); current.step = step; if (step >= 3) { needOptimized(); } render(step, Math.max(0, Math.min(duration(step), t))); }
    };
  });
}());
