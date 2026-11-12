/*
 * scenes/gates.js: what moves on the gate slides of Act 2 (the cash ones are
 * in scenes/cash.js).
 *
 *   gate-dock      four-gates        the dock assembles one gate at a time; the
 *                                    last step runs one example through it and
 *                                    shows what a NO does
 *   minutes-flow   minutes-to-money  a dial of sixty dots turns, one minute at a
 *                                    time leaves down a rail, and the rail splits
 *                                    into two channels
 *   effort-march   gate-effort       the "keep alive" band never stops moving
 *
 * HOW THESE SCENES ARE BUILT
 *
 * Every scene here drives markup that is ALREADY in its slide's html. The
 * html alone, with the engine's data-step rules, shows the right picture at
 * every step: that is what the overview, the presenter view and the PDF use
 * (they never run a scene). The scene only adds the motion on top, so a scene
 * that fails leaves a slide that is still correct.
 *
 * All time comes from Motion.now(). Every loop and every timer is stopped in
 * destroy(). Colours, fonts and durations come from the theme's tokens.
 *
 * window.GateScenes carries the few helpers the slide files share:
 *   arrive(ctx), moved(ctx)  slide hooks: a slide entered at a later step is shown built
 *   sequence()            cancellable timers on the Motion clock
 *   esc(text)             text -> html
 *   minutesFlowSvg()      the static drawing for minutes-to-money
 *   MINUTES               its geometry (stage pixels)
 */
(function () {
  'use strict';
  if (!window.Scenes || !window.Motion) { return; }

  var M = window.Motion;
  var doc = document;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function theme() { return window.THEME || null; }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function list(nodes) { return Array.prototype.slice.call(nodes || []); }

  /*
   * sequence(): timers and tweens on the Motion clock that can all be
   * cancelled at once. after(seconds, fn) is a timer; tween(spec) is
   * Motion.tween. Because they are Motion tweens, ?fast runs them 20x and
   * __deck.settle() waits for them.
   */
  function sequence() {
    var handles = [];
    return {
      after: function (seconds, fn) {
        var h = M.tween({ from: 0, to: 1, duration: Math.max(0, seconds), ease: 'linear', immediate: false, onDone: fn });
        handles.push(h);
        return h;
      },
      tween: function (spec) {
        var h = M.tween(spec);
        handles.push(h);
        return h;
      },
      clear: function () {
        var old = handles;
        handles = [];
        old.forEach(function (h) { h.cancel(); });
      }
    };
  }

  /* The theme's note values, with plain fallbacks if the theme is missing. */
  function dur(name, fallback) {
    var T = theme();
    var v = T && T.motion && T.motion.dur ? T.motion.dur[name] : null;
    return typeof v === 'number' ? v : fallback;
  }
  function easeOf(name) {
    var T = theme();
    var e = T && T.motion && T.motion.ease ? T.motion.ease[name] : null;
    return e || 'outExpo';
  }
  function barSpeed() {
    var T = theme();
    return (T && T.motion && T.motion.barSpeed) || 900;
  }

  /* ======================================================================
   * gate-dock  (four-gates)
   * ----------------------------------------------------------------------
   * The host holds two docks built from the theme's .gate component:
   *   .fg-intro     steps 0 to 4: four vacant bays; each step one gate gets
   *                 its name and its question (data-step on the text)
   *   .fg-verdicts  the last step: one example run. PASS, then NO, and
   *                 everything behind the NO stays NOT YET.
   * The classes in the html are the final picture. This scene replays how
   * that picture is arrived at:
   *   a gate is introduced like a display line in this deck (the block
   *   reveal): its shutter drops, the gate's words print on it, the shutter
   *   lifts away and leaves them in the open bay;
   *   the example run uses the component's own moves and the binding gate
   *   logic: hold the bay vacant 0.8s before a NO, stop everything 0.9s
   *   after it, and never open a gate behind it.
   * ==================================================================== */

  window.Scenes.define('gate-dock', function (host, opts, api) {
    var slide = host.closest('.slide');
    var intro = host.querySelector('.fg-intro');
    var verdicts = host.querySelector('.fg-verdicts');
    var introGates = intro ? list(intro.querySelectorAll('.gate')) : [];
    var runGates = verdicts ? list(verdicts.querySelectorAll('.gate')) : [];
    var runStep = Number(opts.runStep) || (introGates.length + 1);
    var seq = sequence();
    var landing = null;
    var prev = null;
    var STATE = ['is-shut', 'is-pass', 'is-no', 'is-flare', 'is-still', 'is-opening'];

    /* the final picture of the example run, as written in the html */
    var finalClasses = runGates.map(function (g) {
      return STATE.filter(function (c) { return c !== 'is-still' && g.classList.contains(c); });
    });

    function strip(gate) { STATE.forEach(function (c) { gate.classList.remove(c); }); }

    function halt() {
      seq.clear();
      if (landing) { landing.cancel(); landing = null; }
    }

    /* the picture at step n, with no motion */
    function settle(n) {
      halt();
      introGates.forEach(strip);
      runGates.forEach(function (g, i) {
        strip(g);
        finalClasses[i].forEach(function (c) { g.classList.add(c); });
        g.classList.add('is-still');
      });
      if (verdicts) { verdicts.classList.remove('is-waiting'); }
    }

    /* one gate arrives: drop, print, lift away */
    function introduce(i) {
      var g = introGates[i];
      if (!g) { return; }
      var drop = dur('drop', 0.375);
      var lift = dur('lift', 0.5);
      strip(g);
      g.classList.add('is-shut');
      seq.after(drop + 0.375, function () {
        g.classList.remove('is-shut');
        g.classList.add('is-opening');
        seq.after(lift + 0.05, function () { g.classList.remove('is-opening'); });
      });
    }

    /* the example run: gate 1 opens, gate 2 says NO, the rest never get asked */
    function run() {
      var T = theme();
      var drop = dur('drop', 0.375);
      var lift = dur('lift', 0.5);
      var before = dur('holdBefore', 0.8);
      var hold = dur('hold', 1);
      var firstNo = -1;
      finalClasses.forEach(function (c, i) { if (firstNo < 0 && c.indexOf('is-no') !== -1) { firstNo = i; } });

      runGates.forEach(strip);
      if (verdicts) { verdicts.classList.add('is-waiting'); }

      var t = 0;
      runGates.forEach(function (g, i) {
        var cls = finalClasses[i];
        if (cls.indexOf('is-pass') !== -1) {
          // examined, then opened: one beat down, one beat up
          seq.after(t, function () { g.classList.add('is-shut'); });
          seq.after(t + 0.5, function () { g.classList.remove('is-shut'); g.classList.add('is-pass'); });
          t += 0.5 + lift + 0.25;
        } else if (cls.indexOf('is-no') !== -1) {
          seq.after(t, function () { cls.forEach(function (c) { g.classList.add(c); }); });
          // the component holds the bay vacant, then drops the shutter
          seq.after(t + before + drop, function () {
            if (T && T.landNo && slide) {
              var recoil = list(slide.children).filter(function (c) { return c !== host && !c.classList.contains('gate-strip'); })
                .concat(runGates.filter(function (o) { return o !== g; }));
              landing = T.landNo(slide, { hold: hold, recoil: recoil });
            }
          });
          t += before + drop + hold;
        }
      });
      // after the hold: the gates behind the NO are marked, and stay shut out
      seq.after(t + 0.333, function () { if (verdicts) { verdicts.classList.remove('is-waiting'); } });
      if (firstNo < 0 && verdicts) { verdicts.classList.remove('is-waiting'); }
    }

    return {
      step: function (n, dir) {
        var forwardOne = dir > 0 && prev !== null && n === prev + 1 && !api.mode.print;
        settle(n);
        if (forwardOne) {
          if (n >= 1 && n <= introGates.length) { introduce(n - 1); }
          else if (n === runStep) { run(); }
        }
        prev = n;
      },
      destroy: function () { halt(); }
    };
  });

  /* ======================================================================
   * minutes-flow  (minutes-to-money)
   * ----------------------------------------------------------------------
   * A dial of sixty dots turns. Each time a dot passes the outlet a minute
   * leaves down the rail. The rail splits; the minutes pile up, a slice at a
   * time, in two trays. That is step 0: raw material.
   * Step 1: each pile draws back like the block of a block reveal and leaves
   * what it turned into, on Flare: the two channels, by name.
   *
   * The picture is an inline SVG that is already in the slide (drawn by
   * minutesFlowSvg below, so the overview has it too). The scene moves the
   * same nodes. Everything is a pure function of the time since it mounted.
   * ==================================================================== */

  var MINUTES = (function () {
    var g = {
      cx: 378, cy: 672, R: 240, r: 10, count: 60,       // the dial: sixty dots
      jx: 900,                                           // where the rail splits
      fx: 1180, fw: 684, fh: 250, line: 8,               // the two trays
      ya: 477, yb: 867,                                  // their centre lines
      slices: 24,                                        // minutes a tray holds
      rate: 6,                                           // minutes released per second
      speed: 300                                         // px per second on the rail
    };
    g.ex = g.cx + g.R;                                   // the outlet, at three o'clock
    g.legs = [g.jx - g.ex, g.cy - g.ya, g.fx - g.jx];    // rail: out, up or down, in
    g.length = g.legs[0] + g.legs[1] + g.legs[2];
    g.travel = g.length / g.speed;
    g.ix = g.fx + g.line;                                // the inside of a tray
    g.iw = g.fw - g.line * 2;
    g.ih = g.fh - g.line * 2;
    g.fillTime = g.travel + (g.slices * 2 - 1) / g.rate; // when both trays are full
    return g;
  }());

  /* where a minute is, s pixels down the rail, on the upper (0) or lower (1) branch */
  function railPoint(s, branch) {
    var g = MINUTES;
    var sign = branch ? 1 : -1;
    if (s <= g.legs[0]) { return [g.ex + s, g.cy]; }
    s -= g.legs[0];
    if (s <= g.legs[1]) { return [g.jx, g.cy + sign * s]; }
    s -= g.legs[1];
    return [g.jx + Math.min(s, g.legs[2]), g.cy + sign * g.legs[1]];
  }

  function minutesFlowSvg() {
    var g = MINUTES;
    var i, a, out = [];
    out.push('<svg class="m2m-svg" viewBox="0 0 1920 1080" aria-hidden="true" focusable="false">');
    // a pile of minutes is a halftone: one column of dots for every minute that arrives
    var px = g.iw / g.slices;
    var rows = Math.max(1, Math.round(g.ih / px));
    var py = g.ih / rows;
    out.push('<defs>' + ['a', 'b'].map(function (name, b) {
      var top = (b ? g.yb : g.ya) - g.ih / 2;
      return '<pattern id="m2m-dots-' + name + '" patternUnits="userSpaceOnUse" x="' + g.ix + '" y="' + top + '" width="' + px.toFixed(4) + '" height="' + py.toFixed(4) + '">' +
        '<circle cx="' + (px / 2).toFixed(3) + '" cy="' + (py / 2).toFixed(3) + '" r="' + g.r + '"/></pattern>';
    }).join('') + '</defs>');
    // rails: one out of the dial, then a hard corner up and a hard corner down
    out.push('<g class="m2m-rails">' +
      '<polyline points="' + g.ex + ',' + g.cy + ' ' + g.jx + ',' + g.cy + ' ' + g.jx + ',' + g.ya + ' ' + g.fx + ',' + g.ya + '"/>' +
      '<polyline points="' + g.jx + ',' + g.cy + ' ' + g.jx + ',' + g.yb + ' ' + g.fx + ',' + g.yb + '"/>' +
      '</g>');
    // the dial
    out.push('<g class="m2m-ring">');
    for (i = 0; i < g.count; i++) {
      a = i / g.count * Math.PI * 2;
      out.push('<circle cx="' + (g.cx + g.R * Math.cos(a)).toFixed(2) + '" cy="' + (g.cy + g.R * Math.sin(a)).toFixed(2) + '" r="' + g.r + '"/>');
    }
    out.push('</g>');
    // minutes on the rail (a still frame; the scene takes these over)
    out.push('<g class="m2m-flow">');
    var gap = g.speed / g.rate;
    for (i = 1; i * gap < g.length - 20; i++) {
      var p = railPoint(i * gap, i % 2);
      out.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + g.r + '"/>');
    }
    out.push('</g>');
    // the piles (full in the still frame)
    out.push('<g class="m2m-piles">' +
      '<rect class="m2m-pile is-a" fill="url(#m2m-dots-a)" x="' + g.ix + '" y="' + (g.ya - g.ih / 2) + '" width="' + g.iw + '" height="' + g.ih + '"/>' +
      '<rect class="m2m-pile is-b" fill="url(#m2m-dots-b)" x="' + g.ix + '" y="' + (g.yb - g.ih / 2) + '" width="' + g.iw + '" height="' + g.ih + '"/>' +
      '</g>');
    // the trays
    var half = g.line / 2;
    out.push('<g class="m2m-trays">' +
      '<rect x="' + (g.fx + half) + '" y="' + (g.ya - g.fh / 2 + half) + '" width="' + (g.fw - g.line) + '" height="' + (g.fh - g.line) + '"/>' +
      '<rect x="' + (g.fx + half) + '" y="' + (g.yb - g.fh / 2 + half) + '" width="' + (g.fw - g.line) + '" height="' + (g.fh - g.line) + '"/>' +
      '</g>');
    out.push('</svg>');
    return out.join('');
  }

  window.Scenes.define('minutes-flow', function (host, opts, api) {
    var g = MINUTES;
    var svg = host.querySelector('.m2m-svg');
    if (!svg) { return {}; }
    var ring = svg.querySelector('.m2m-ring');
    var flow = svg.querySelector('.m2m-flow');
    var piles = [svg.querySelector('.m2m-pile.is-a'), svg.querySelector('.m2m-pile.is-b')];
    var money = [host.querySelector('.m2m-money.is-a'), host.querySelector('.m2m-money.is-b')];
    var seq = sequence();
    var stopLoop = null;
    var startedAt = M.now();
    var prev = null;
    var step = 0;
    var topUp = 0;        // 0..1: step 1 first fills whatever is not yet full
    var retreat = 0;      // 0..1: then the piles draw back and leave the money
    var POOL = Math.ceil(g.travel * g.rate) + 3;
    var dots = [];
    var i;

    host.classList.add('is-live');

    // the scene's own dots replace the still ones
    while (flow.firstChild) { flow.removeChild(flow.firstChild); }
    for (i = 0; i < POOL; i++) {
      var c = doc.createElementNS(SVG_NS, 'circle');
      c.setAttribute('r', g.r);
      c.setAttribute('visibility', 'hidden');
      flow.appendChild(c);
      dots.push(c);
    }

    function setClip(el, shown) {
      if (!el) { return; }
      el.style.clipPath = shown >= 1 ? '' : 'inset(0 ' + ((1 - shown) * 100).toFixed(3) + '% 0 0)';
    }

    function render(tau) {
      // the dial turns one dot per minute released
      var turn = (tau * g.rate * (360 / g.count)) % 360;
      ring.setAttribute('transform', 'rotate(' + turn.toFixed(3) + ' ' + g.cx + ' ' + g.cy + ')');

      // minutes on the rail: number k left the dial at k / rate
      var newest = Math.floor(tau * g.rate);
      var oldest = Math.max(0, Math.ceil((tau - g.travel) * g.rate));
      var used = 0;
      var k;
      for (k = oldest; k <= newest && used < POOL; k++) {
        var s = (tau - k / g.rate) * g.speed;
        if (s < 0 || s > g.length) { continue; }
        var p = railPoint(s, k % 2);
        var node = dots[used++];
        node.setAttribute('cx', p[0].toFixed(1));
        node.setAttribute('cy', p[1].toFixed(1));
        node.setAttribute('visibility', 'visible');
      }
      for (; used < POOL; used++) { dots[used].setAttribute('visibility', 'hidden'); }

      // the piles: one slice for every minute that has arrived
      var arrived = tau < g.travel ? 0 : Math.floor((tau - g.travel) * g.rate) + 1;
      [0, 1].forEach(function (b) {
        // even minutes go up, odd minutes go down
        var mine = b === 0 ? Math.ceil(arrived / 2) : Math.floor(arrived / 2);
        var frac = Math.min(1, mine / g.slices);
        frac = frac + (1 - frac) * topUp;
        var left = g.iw * retreat;
        var width = Math.max(0, g.iw * frac - left);
        piles[b].setAttribute('x', (g.ix + left).toFixed(1));
        piles[b].setAttribute('width', width.toFixed(1));
        setClip(money[b], step >= 1 ? retreat : 1);
      });
    }

    function tick() { render(M.now() - startedAt); }

    function settle(n) {
      seq.clear();
      step = n;
      topUp = n >= 1 ? 1 : 0;
      retreat = n >= 1 ? 1 : 0;
    }

    function turnToMoney() {
      seq.clear();
      step = 1;
      topUp = 0;
      retreat = 0;
      var tau = M.now() - startedAt;
      var arrived = tau < g.travel ? 0 : Math.floor((tau - g.travel) * g.rate) + 1;
      var least = Math.min(1, Math.floor(arrived / 2) / g.slices);
      var fillSeconds = (1 - least) * g.iw / barSpeed();      // bars grow at one speed
      seq.tween({
        from: 0, to: 1, duration: fillSeconds, ease: 'linear',
        onUpdate: function (v) { topUp = v; },
        onDone: function () {
          topUp = 1;
          seq.after(0.25, function () {
            seq.tween({
              from: 0, to: 1, duration: dur('blockOut', 0.25) * 2, ease: easeOf('arrive'),
              onUpdate: function (v) { retreat = v; },
              onDone: function () { retreat = 1; tick(); }
            });
          });
        }
      });
    }

    var fillTimer = null;
    if (api.mode.print) {
      // one still frame, piles full
      startedAt = M.now() - g.fillTime - 1;
    } else {
      stopLoop = M.raf(tick);
      // a finite tween for as long as the trays take to fill, so that tools
      // waiting for the slide to settle (screenshots) see them full
      fillTimer = M.tween({ from: 0, to: 1, duration: g.fillTime + 0.05, ease: 'linear', immediate: false });
    }

    return {
      step: function (n, dir) {
        var forwardOne = dir > 0 && prev !== null && n === prev + 1 && !api.mode.print;
        if (forwardOne && n === 1) { turnToMoney(); } else { settle(n); }
        prev = n;
        tick();
      },
      destroy: function () {
        seq.clear();
        if (fillTimer) { fillTimer.cancel(); fillTimer = null; }
        if (stopLoop) { stopLoop(); stopLoop = null; }
      }
    };
  });

  /* ======================================================================
   * effort-march  (gate-effort)
   * ----------------------------------------------------------------------
   * "Keep alive" is the part that never ends, so its band never stops: the
   * month marks on it keep walking off the right edge of the stage. The host
   * is the band; the marks are its .ef-marks child, moved by one pitch and
   * then again, forever.
   * ==================================================================== */

  window.Scenes.define('effort-march', function (host, opts, api) {
    var marks = host.querySelector('.ef-marks');
    var pitch = Number(opts.pitch) || 120;       // px between two month marks
    var speed = Number(opts.speed) || 60;        // px per second
    var from = Number(opts.step) || 0;           // the band is on stage from this step
    var stopLoop = null;
    var startedAt = 0;

    function place(offset) { if (marks) { marks.style.translate = offset.toFixed(2) + 'px 0'; } }

    function stop() { if (stopLoop) { stopLoop(); stopLoop = null; } }

    function start() {
      if (stopLoop || api.mode.print || !marks) { return; }
      startedAt = M.now();
      stopLoop = M.raf(function () { place(((M.now() - startedAt) * speed) % pitch); });
    }

    place(0);
    return {
      step: function (n) { if (n >= from) { start(); } else { stop(); place(0); } },
      destroy: stop
    };
  });

  /*
   * Arriving on a slide that is already built (stepping back into it, a jump,
   * a reload): show it built.
   *   a2-settled  entrance builds do not replay (it stays for this visit)
   *   a2-arrived  reveals take no delay. Without it a step element with a
   *               --delay pops in late, because the slide becomes visible
   *               part-way through the sleeve transition and the element
   *               delays that inherited change like any other. It comes off
   *               at the first step change, so later builds play normally.
   * Use both as slide hooks:  enter: GateScenes.arrive,  step: GateScenes.moved
   */
  function arrive(ctx) {
    if (ctx && ctx.el && ctx.step > 0) { ctx.el.classList.add('a2-settled', 'a2-arrived'); }
  }
  function moved(ctx) {
    if (ctx && ctx.el) { ctx.el.classList.remove('a2-arrived'); }
  }

  window.GateScenes = {
    arrive: arrive,
    moved: moved,
    sequence: sequence,
    esc: esc,
    list: list,
    dur: dur,
    easeOf: easeOf,
    barSpeed: barSpeed,
    minutesFlowSvg: minutesFlowSvg,
    MINUTES: MINUTES
  };
}());
