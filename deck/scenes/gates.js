/*
 * scenes/gates.js: what moves on the gate slides of Act 2 (the cash ones are
 * in scenes/cash.js).
 *
 *   gate-dock      four-gates        the dock assembles one gate at a time; the
 *                                    last step runs one example through it and
 *                                    shows what a NO does
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
 */
(function () {
  'use strict';
  if (!window.Scenes || !window.Motion) { return; }

  var M = window.Motion;

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
    barSpeed: barSpeed
  };
}());
