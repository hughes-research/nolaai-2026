/*
 * motion.js  ->  window.Motion   (module.exports under Node)
 *
 * The small animation toolkit shared by the deck engine and every scene.
 * No dependencies. Classic script: works from file://.
 *
 * THE ONE RULE: everything time-based reads Motion.now(). That is what lets
 * the video renderer freeze time (Motion.useManualClock / Motion.setTime) and
 * what makes ?fast work (Motion.timeScale = 20).
 *
 * All times and durations are in SECONDS.
 *
 *   Clock      Motion.now()  useManualClock([t])  setTime(t)  useRealClock()
 *              Motion.timeScale (get/set)
 *   Easing     Motion.ease.linear | in/out/inOut + Quad|Cubic|Quart|Expo|Back
 *              Motion.ease.spring(stiffness, damping)   Motion.ease.steps(n)
 *              (also reachable as Motion.spring / Motion.steps)
 *   Tween      Motion.tween({ from, to, duration, delay, ease, onUpdate, onDone })
 *                -> { cancel(), finish(), finished: Promise, active, value, progress }
 *   Timeline   Motion.timeline()  .add(tweenSpec, offset)  .at(time, fn, undoFn)
 *                .seek(t)  .play()  .pause()  .duration
 *   Loop       Motion.raf(fn(now, dt)) -> stop()
 *   Text       Motion.count(el, from, to, opts)   Motion.splitText(el, mode)
 *   Random     Motion.rng(seed) -> { next, range, int, pick, shuffle, normal }
 *   Math       lerp, clamp, mapRange, formatNumber(value, format)
 *   Introspect Motion.stats() -> { loops, tweens, pending }   (used by tests)
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  if (root) { root.Motion = api; }
}(typeof window !== 'undefined' ? window : null, function (win) {
  'use strict';

  var hasDOM = !!(win && win.document);

  /* ------------------------------------------------------------------ *
   * Math helpers
   * ------------------------------------------------------------------ */

  function lerp(a, b, t) { return a + (b - a) * t; }

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /** Map v from [inMin, inMax] to [outMin, outMax]. Pass clampOut = true to pin the result inside the output range. */
  function mapRange(v, inMin, inMax, outMin, outMax, clampOut) {
    if (inMax === inMin) { return outMin; }
    var t = (v - inMin) / (inMax - inMin);
    if (clampOut) { t = clamp(t, 0, 1); }
    return outMin + (outMax - outMin) * t;
  }

  function num(v, fallback) {
    var n = Number(v);
    return (v == null || v === '' || isNaN(n)) ? fallback : n;
  }

  /* ------------------------------------------------------------------ *
   * formatNumber(value, format)
   *
   * format grammar (every part optional, in this order):
   *
   *     [%] [$] [+] [,] [.N] [d|f] [%]
   *
   *   leading %   printf-style marker, ignored      "%d"    -> 1235
   *   $           dollar sign                       "$,d"   -> $1,235
   *   +           show a plus on positive numbers   "+,d"   -> +1,235
   *   ,           thousands separators              ",d"    -> 1,235
   *   .N          N decimals                        ".1f"   -> 1234.6
   *   d           whole number (rounded)            "$,.2f" -> $1,234.57
   *   f           fixed decimals (2 if no .N)
   *   trailing %  append a percent sign             "d%"    -> 42%
   *               (the value is NOT multiplied by 100)
   *
   * No format (or one that does not parse): thousands separators and at most
   * two decimals, e.g. 1234.5678 -> "1,234.57".
   * ------------------------------------------------------------------ */

  var FORMAT_RE = /^(%)?(\$)?(\+)?(,)?(?:\.(\d+))?([df])?(%)?$/;

  function formatNumber(value, format) {
    var n = Number(value);
    if (!isFinite(n)) { return String(value); }

    var spec = format == null ? '' : String(format).trim();
    var m = spec ? FORMAT_RE.exec(spec) : null;
    var dollar = false, plus = false, group = true, percent = false, decimals = null;
    if (m) {
      dollar = !!m[2];
      plus = !!m[3];
      group = !!m[4];
      percent = !!m[7];
      if (m[5] != null) { decimals = parseInt(m[5], 10); }
      else { decimals = m[6] === 'f' ? 2 : 0; }
    }

    var abs = Math.abs(n);
    var text = decimals == null ? String(Math.round(abs * 100) / 100) : abs.toFixed(decimals);
    var negative = n < 0 && Number(text) !== 0;          // never print "-0"
    if (group) {
      var parts = text.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      text = parts.join('.');
    }
    return (negative ? '-' : (plus && Number(text.replace(/,/g, '')) !== 0 ? '+' : '')) +
      (dollar ? '$' : '') + text + (percent ? '%' : '');
  }

  /* ------------------------------------------------------------------ *
   * Clock
   *
   * Real clock:   time advances with performance.now(), times timeScale.
   * Manual clock: time only moves when you call Motion.setTime(seconds),
   *               and each setTime() runs exactly one frame of every tween
   *               and raf loop. Use it to render a frame, screenshot, repeat.
   * ------------------------------------------------------------------ */

  var perf = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance : null;

  function wallSeconds() { return perf ? perf.now() / 1000 : Date.now() / 1000; }

  var clock = {
    manual: false,
    manualTime: 0,
    scale: 1,
    anchorWall: wallSeconds(),   // real time at the last re-anchor
    anchorTime: 0                // Motion time at the last re-anchor
  };

  function now() {
    if (clock.manual) { return clock.manualTime; }
    return clock.anchorTime + (wallSeconds() - clock.anchorWall) * clock.scale;
  }

  /* Changing speed must not make time jump, so re-anchor first. */
  function setTimeScale(scale) {
    scale = num(scale, 1);
    if (!(scale > 0)) { scale = 1; }
    if (!clock.manual) {
      clock.anchorTime = now();
      clock.anchorWall = wallSeconds();
    }
    clock.scale = scale;
  }

  function useManualClock(startAt) {
    clock.manualTime = startAt != null ? Number(startAt) : now();
    clock.manual = true;
    return Motion;
  }

  /** Set the manual clock (switching to it if needed) and run one frame. */
  function setTime(seconds) {
    if (!clock.manual) { useManualClock(seconds); }
    clock.manualTime = Number(seconds) || 0;
    runFrame();
    return Motion;
  }

  function useRealClock() {
    if (!clock.manual) { return Motion; }
    clock.anchorTime = clock.manualTime;
    clock.anchorWall = wallSeconds();
    clock.manual = false;
    schedule();
    return Motion;
  }

  /* ------------------------------------------------------------------ *
   * Frame loop
   *
   * One shared requestAnimationFrame drives every tween and every
   * Motion.raf callback. It only runs while something is registered.
   * ------------------------------------------------------------------ */

  var tickables = [];   // tweens and playing timelines: { _tick(now), infinite }
  var loops = [];       // Motion.raf callbacks: { fn, last, stopped }
  var frameHandle = null;

  var requestFrame = (win && win.requestAnimationFrame)
    ? function (fn) { return win.requestAnimationFrame(fn); }
    : function (fn) { return setTimeout(fn, 16); };

  /* A callback that throws is dropped (so it cannot throw 60 times a second)
   * and the error is re-thrown on its own task so it still reaches the console. */
  function rethrowLater(err) { setTimeout(function () { throw err; }, 0); }

  function removeFrom(list, item) {
    var i = list.indexOf(item);
    if (i !== -1) { list.splice(i, 1); }
  }

  function runFrame() {
    var t = now();
    var i, item;

    var tw = tickables.slice();
    for (i = 0; i < tw.length; i++) {
      item = tw[i];
      if (tickables.indexOf(item) === -1) { continue; }   // cancelled earlier in this frame
      try { item._tick(t); }
      catch (err) { removeFrom(tickables, item); if (item._fail) { item._fail(); } rethrowLater(err); }
    }

    var ls = loops.slice();
    for (i = 0; i < ls.length; i++) {
      item = ls[i];
      if (item.stopped) { continue; }
      var dt = t - item.last;
      item.last = t;
      try { item.fn(t, dt); }
      catch (err2) { item.stopped = true; removeFrom(loops, item); rethrowLater(err2); }
    }
  }

  function schedule() {
    if (frameHandle != null || clock.manual) { return; }
    if (!tickables.length && !loops.length) { return; }
    frameHandle = requestFrame(function () {
      frameHandle = null;
      if (!clock.manual) { runFrame(); }
      schedule();
    });
  }

  /**
   * Motion.raf(fn) calls fn(now, dt) once per frame until you call the
   * function it returns. ALWAYS keep that stop function and call it in your
   * scene's destroy(), or the loop leaks.
   */
  function raf(fn) {
    var entry = { fn: fn, last: now(), stopped: false };
    loops.push(entry);
    schedule();
    return function stop() {
      if (entry.stopped) { return; }
      entry.stopped = true;
      removeFrom(loops, entry);
    };
  }

  function stats() {
    var pending = 0;
    for (var i = 0; i < tickables.length; i++) { if (!tickables[i].infinite) { pending++; } }
    return { loops: loops.length, tweens: tickables.length, pending: pending };
  }

  /* ------------------------------------------------------------------ *
   * Easing.  Every easing maps 0..1 to 0..1 (back and spring overshoot).
   * ------------------------------------------------------------------ */

  var ease = {
    linear: function (t) { return t; },

    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },

    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },

    inQuart: function (t) { return t * t * t * t; },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    inOutQuart: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },

    inExpo: function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * t - 10); },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutExpo: function (t) {
      if (t <= 0) { return 0; }
      if (t >= 1) { return 1; }
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },

    inBack: function (t) { var c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
    outBack: function (t) { var c = 1.70158; var u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
    inOutBack: function (t) {
      var c = 1.70158 * 1.525;
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
    }
  };

  /**
   * spring(stiffness, damping) -> easing function.
   * A damped spring with mass 1, squeezed so that it has settled (within 0.1%)
   * when t reaches 1. The natural settle time in seconds is on fn.duration,
   * so you can write:  var s = Motion.spring(170, 14);
   *                    Motion.tween({ ease: s, duration: s.duration, ... })
   * Try (170, 26) for no bounce, (170, 14) for a little, (300, 10) for a lot.
   */
  function spring(stiffness, damping) {
    var k = stiffness > 0 ? stiffness : 170;
    var c = damping > 0 ? damping : 26;
    var w0 = Math.sqrt(k);                           // natural frequency
    var zeta = Math.max(0.05, c / (2 * w0));         // damping ratio; < 1 bounces
    var LN = Math.log(1000);
    var settle, position;

    if (zeta < 1) {
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      settle = LN / (zeta * w0);
      position = function (t) {
        return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
      };
    } else if (zeta === 1) {
      settle = LN / w0 * 1.5;
      position = function (t) { return 1 - Math.exp(-w0 * t) * (1 + w0 * t); };
    } else {
      var s = Math.sqrt(zeta * zeta - 1);
      var r1 = -w0 * (zeta - s);
      var r2 = -w0 * (zeta + s);
      settle = LN / -r1;
      position = function (t) { return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1); };
    }

    function fn(p) {
      if (p <= 0) { return 0; }
      if (p >= 1) { return 1; }
      return position(p * settle);
    }
    fn.duration = settle;
    return fn;
  }

  /** steps(n) -> easing that jumps in n equal stairs and lands on 1 at the end. */
  function steps(n) {
    n = Math.max(1, Math.round(n || 1));
    return function (t) { return t >= 1 ? 1 : Math.max(0, Math.floor(t * n) / n); };
  }

  ease.spring = spring;
  ease.steps = steps;

  function resolveEase(e) {
    if (typeof e === 'function') { return e; }
    if (typeof e === 'string' && typeof ease[e] === 'function' && e !== 'spring' && e !== 'steps') { return ease[e]; }
    return ease.outCubic;
  }

  /* ------------------------------------------------------------------ *
   * Tween
   * ------------------------------------------------------------------ */

  /* from/to may be numbers, arrays of numbers, or flat objects of numbers. */
  function interpolate(from, to, k) {
    if (typeof from === 'number') { return lerp(from, to, k); }
    var out, key;
    if (Array.isArray(from)) {
      out = [];
      for (key = 0; key < from.length; key++) { out.push(lerp(from[key], to[key], k)); }
      return out;
    }
    out = {};
    for (key in from) {
      if (Object.prototype.hasOwnProperty.call(from, key)) { out[key] = lerp(from[key], to[key], k); }
    }
    return out;
  }

  /**
   * Motion.tween({
   *   from: 0, to: 1,            numbers, arrays or flat objects of numbers
   *   duration: 0.6,             seconds
   *   delay: 0,                  seconds
   *   ease: 'outCubic',          name or function (default outCubic)
   *   onUpdate(value, progress), called every frame
   *   onDone(value),             called once at the end (not when cancelled)
   *   repeat: 0,                 extra plays; Infinity loops until cancelled
   *   yoyo: false,               with repeat: play back and forth
   *   immediate: true            render the `from` value straight away
   * })
   * Returns { cancel(), finish(), finished, active, value, progress }.
   * `finished` resolves true when the tween completes, false if cancelled.
   */
  function tween(opts) {
    opts = opts || {};
    var from = opts.from == null ? 0 : opts.from;
    var to = opts.to == null ? 1 : opts.to;
    var duration = Math.max(0, num(opts.duration, 0.6));
    var delay = Math.max(0, num(opts.delay, 0));
    var easeFn = resolveEase(opts.ease);
    var repeat = opts.repeat == null ? 0 : opts.repeat;
    var yoyo = !!opts.yoyo;
    var startedAt = now();
    var resolveFinished;

    var handle = {
      active: true,
      progress: 0,
      value: from,
      infinite: repeat === Infinity,
      finished: null,
      cancel: function () { end(false); },
      finish: function () { if (handle.active) { apply(endProgress()); end(true); } }
    };
    handle.finished = new Promise(function (resolve) { resolveFinished = resolve; });

    function endProgress() { return (yoyo && repeat !== Infinity && repeat % 2 === 1) ? 0 : 1; }

    function apply(p) {
      handle.progress = p;
      handle.value = interpolate(from, to, easeFn(p));
      if (opts.onUpdate) { opts.onUpdate(handle.value, p); }
    }

    function end(completed) {
      if (!handle.active) { return; }
      handle.active = false;
      removeFrom(tickables, handle);
      if (completed && opts.onDone) { opts.onDone(handle.value); }
      resolveFinished(completed);
    }

    handle._fail = function () { handle.active = false; resolveFinished(false); };

    handle._tick = function (t) {
      var local = t - startedAt - delay;
      if (local < 0) { return; }
      var plays = repeat === Infinity ? Infinity : repeat + 1;
      var cycles = duration > 0 ? local / duration : plays;
      if (cycles >= plays) { apply(endProgress()); end(true); return; }
      var cycle = Math.floor(cycles);
      var p = cycles - cycle;
      if (yoyo && cycle % 2 === 1) { p = 1 - p; }
      apply(p);
    };

    if (duration === 0 && delay === 0 && repeat !== Infinity) {
      apply(endProgress());
      end(true);
      return handle;
    }

    tickables.push(handle);
    if (opts.immediate !== false) { apply(0); }
    schedule();
    return handle;
  }

  /* ------------------------------------------------------------------ *
   * Timeline
   *
   * A sequence you can render at ANY time t with seek(t), or play().
   *
   *   var tl = Motion.timeline();
   *   tl.add({ from: 0, to: 1, duration: 0.5, onUpdate: fade });       // at the end so far
   *   tl.add({ from: 0, to: 300, duration: 1, onUpdate: slide }, 0.2); // at 0.2 s
   *   tl.add({ ... }, '+=0.3');                                        // 0.3 s after the end
   *   tl.at(1.5, function () { label.hidden = false; },
   *              function () { label.hidden = true;  });               // do / undo
   *   tl.seek(0.75);        // draw the state at 0.75 s
   *   tl.play();            // run on the Motion clock;  tl.finished is a promise
   *
   * seek() works in both directions: tweens that have not started are
   * rendered at their `from` value, finished ones at their `to` value, and
   * at() callbacks run their undo function when you seek back across them.
   * ------------------------------------------------------------------ */

  function timeline() {
    var items = [];        // tweens and calls in insertion order
    var total = 0;
    var driver = null;     // the tickable that advances the playhead while playing
    var resolveFinished = null;

    var tl = {
      time: 0,
      playing: false,
      finished: Promise.resolve(true)
    };

    function resolveOffset(offset) {
      if (offset == null) { return total; }
      if (typeof offset === 'string') {
        var m = /^([+-])=\s*([\d.]+)$/.exec(offset.trim());
        if (m) { return Math.max(0, total + (m[1] === '-' ? -1 : 1) * parseFloat(m[2])); }
        return Math.max(0, num(offset, total));
      }
      return Math.max(0, Number(offset) || 0);
    }

    /** Add a tween spec (same fields as Motion.tween). offset: seconds, '+=n', '-=n', or omitted for "at the end". */
    tl.add = function (spec, offset) {
      spec = spec || {};
      var start = resolveOffset(offset) + Math.max(0, num(spec.delay, 0));
      var dur = Math.max(0, num(spec.duration, 0.6));
      items.push({
        kind: 'tween', order: items.length, start: start, end: start + dur, dur: dur,
        from: spec.from == null ? 0 : spec.from, to: spec.to == null ? 1 : spec.to,
        ease: resolveEase(spec.ease), spec: spec, done: false
      });
      total = Math.max(total, start + dur);
      return tl;
    };

    /** Run fn when the playhead reaches `time`; run undo when seeking back across it. */
    tl.at = function (time, fn, undo) {
      var t = Math.max(0, Number(time) || 0);
      items.push({ kind: 'call', order: items.length, start: t, end: t, fn: fn, undo: undo, done: false });
      total = Math.max(total, t);
      return tl;
    };

    function byStart(a, b) { return (a.start - b.start) || (a.order - b.order); }

    function renderTween(it, p) {
      if (it.spec.onUpdate) { it.spec.onUpdate(interpolate(it.from, it.to, it.ease(p)), p); }
    }

    function render(t) {
      tl.time = t;
      var ordered = items.slice().sort(byStart);
      var i, it;

      // 1. Things that lie in the future, latest first, so that when two
      //    tweens drive the same property the earlier one has the last word.
      for (i = ordered.length - 1; i >= 0; i--) {
        it = ordered[i];
        if (it.start <= t) { continue; }
        if (it.kind === 'tween') { it.done = false; renderTween(it, 0); }
        else if (it.done) { it.done = false; if (it.undo) { it.undo(tl); } }
      }
      // 2. Things that have started, earliest first.
      for (i = 0; i < ordered.length; i++) {
        it = ordered[i];
        if (it.start > t) { continue; }
        if (it.kind === 'tween') {
          var p = it.dur > 0 ? clamp((t - it.start) / it.dur, 0, 1) : 1;
          renderTween(it, p);
          if (p >= 1 && !it.done) { it.done = true; if (it.spec.onDone) { it.spec.onDone(it.to); } }
          if (p < 1) { it.done = false; }
        } else if (!it.done) {
          it.done = true;
          if (it.fn) { it.fn(tl); }
        }
      }
    }

    function stopDriver(completed) {
      if (driver) { removeFrom(tickables, driver); driver = null; }
      tl.playing = false;
      if (resolveFinished) { var r = resolveFinished; resolveFinished = null; r(completed); }
    }

    /** Draw the state at time t (clamped to 0..duration). */
    tl.seek = function (t) {
      render(clamp(Number(t) || 0, 0, total));
      return tl;
    };

    /** Play from the current position (or from `from` seconds) to the end. */
    tl.play = function (from) {
      stopDriver(false);
      if (from != null) { tl.time = clamp(Number(from) || 0, 0, total); }
      if (tl.time >= total) { tl.time = 0; }
      var startPos = tl.time;
      var startedAt = now();
      tl.playing = true;
      tl.finished = new Promise(function (resolve) { resolveFinished = resolve; });
      driver = {
        infinite: false,
        _fail: function () { driver = null; stopDriver(false); },
        _tick: function (t) {
          var pos = startPos + (t - startedAt);
          if (pos >= total) { render(total); stopDriver(true); }
          else { render(Math.max(0, pos)); }
        }
      };
      tickables.push(driver);
      render(startPos);
      if (total === 0) { stopDriver(true); }
      schedule();
      return tl;
    };

    tl.pause = function () { stopDriver(false); return tl; };
    tl.cancel = tl.pause;

    Object.defineProperty(tl, 'duration', { enumerable: true, get: function () { return total; } });
    Object.defineProperty(tl, 'progress', { enumerable: true, get: function () { return total > 0 ? tl.time / total : 1; } });

    return tl;
  }

  /* ------------------------------------------------------------------ *
   * Counters
   * ------------------------------------------------------------------ */

  /**
   * Motion.count(el, from, to, opts): count a number up (or down) in el.
   *   opts: { duration (1.2), delay, ease ('outExpo'), format, prefix, suffix,
   *           onUpdate(value, text), onDone() }
   * el may be null if you only want the onUpdate callback.
   * Always lands exactly on `to`. Returns the tween handle.
   */
  function count(el, from, to, opts) {
    opts = opts || {};
    from = Number(from) || 0;
    to = Number(to) || 0;
    var format = opts.format;
    if (format == null || format === '') {
      // No format given: keep as many decimals as the target was written with.
      var decimals = Math.min(6, (String(to).split('.')[1] || '').length);
      format = ',' + (decimals ? '.' + decimals + 'f' : 'd');
    }
    var prefix = opts.prefix || '';
    var suffix = opts.suffix || '';

    function show(v) {
      var text = prefix + formatNumber(v, format) + suffix;
      if (el) { el.textContent = text; }
      if (opts.onUpdate) { opts.onUpdate(v, text); }
    }

    return tween({
      from: from,
      to: to,
      duration: num(opts.duration, 1.2),
      delay: num(opts.delay, 0),
      ease: opts.ease || 'outExpo',
      onUpdate: show,
      onDone: function () { show(to); if (opts.onDone) { opts.onDone(); } }
    });
  }

  /* ------------------------------------------------------------------ *
   * splitText(el, 'chars' | 'words' | 'lines')
   *
   * Wraps each piece in a <span> so CSS or tweens can animate them one by
   * one. Every span gets class "char" / "word" / "line" and a --i custom
   * property with its index (handy for staggered delays):
   *
   *     .title .char { transition-delay: calc(var(--i) * 30ms); }
   *
   * The original text is kept on the element as aria-label and the pieces
   * are aria-hidden, so screen readers still read one sentence.
   *
   * 'chars' and 'words' keep inline markup (<em>, <strong>...) intact.
   * 'lines' needs the element to be laid out (visible, final width and font)
   * and flattens inline markup to plain text.
   *
   * Returns an array of the spans, with a revert() method that restores the
   * original markup.
   * ------------------------------------------------------------------ */

  function splitText(el, mode) {
    var pieces = [];
    pieces.revert = function () {};
    if (!hasDOM || !el) { return pieces; }
    mode = mode || 'chars';

    var doc = el.ownerDocument;
    var originalHTML = el.innerHTML;
    var hadLabel = el.hasAttribute('aria-label');
    var originalLabel = el.getAttribute('aria-label');
    if (!hadLabel) { el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim()); }

    function span(cls, index) {
      var s = doc.createElement('span');
      s.className = cls;
      s.setAttribute('aria-hidden', 'true');
      s.style.display = 'inline-block';
      if (index != null) { s.style.setProperty('--i', index); }
      return s;
    }

    if (mode === 'lines') { el.textContent = el.textContent.replace(/\s+/g, ' ').trim(); }

    // Split every text node in place into word spans (chars nest inside words
    // so a word never breaks across two lines).
    var walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */, null);
    var textNodes = [];
    while (walker.nextNode()) { textNodes.push(walker.currentNode); }

    var words = [];
    textNodes.forEach(function (node) {
      var frag = doc.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) { return; }
        if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(' ')); return; }
        var word = span('word');
        if (mode === 'chars') {
          word.style.whiteSpace = 'nowrap';
          Array.from(part).forEach(function (ch) {
            var c = span('char', pieces.length);
            c.textContent = ch;
            word.appendChild(c);
            pieces.push(c);
          });
        } else {
          word.textContent = part;
          word.style.setProperty('--i', words.length);
          if (mode === 'words') { pieces.push(word); }
        }
        words.push(word);
        frag.appendChild(word);
      });
      node.parentNode.replaceChild(frag, node);
    });

    if (mode === 'lines') {
      // Group words by the row they landed on, then rebuild as one block per row.
      var rows = [];
      var lastTop = null;
      words.forEach(function (w) {
        var top = w.offsetTop;
        if (lastTop === null || Math.abs(top - lastTop) > 2) { rows.push([]); lastTop = top; }
        rows[rows.length - 1].push(w.textContent);
      });
      el.textContent = '';
      rows.forEach(function (row, i) {
        var line = span('line', i);
        line.style.display = 'block';
        line.textContent = row.join(' ');
        el.appendChild(line);
        pieces.push(line);
      });
    }

    pieces.revert = function () {
      el.innerHTML = originalHTML;
      if (hadLabel) { el.setAttribute('aria-label', originalLabel); }
      else { el.removeAttribute('aria-label'); }
    };
    return pieces;
  }

  /* ------------------------------------------------------------------ *
   * Seeded random numbers
   *
   *   var r = Motion.rng(42);        // same seed -> same sequence, everywhere
   *   r.next()          0 <= x < 1
   *   r.range(a, b)     a <= x < b
   *   r.int(a, b)       whole number, a and b both included
   *   r.pick(array)     one element
   *   r.shuffle(array)  a shuffled COPY (the input is left alone)
   *   r.normal(mean, sd) bell curve (defaults 0 and 1); uses 12 draws
   *
   * Seeds may be numbers or strings. Algorithm: mulberry32.
   *
   * Everything here uses only integer math, + - * / and Math.floor, so a seed
   * gives exactly the same numbers in Node and in the browser. Keep it that
   * way. Measured with Node 22 against Chromium 153: Math.log, Math.exp,
   * Math.pow, Math.sin, Math.cos and Math.atan2 differ in the last digit for
   * roughly 3 to 17 percent of inputs; Math.sqrt and Math.hypot never did.
   * ------------------------------------------------------------------ */

  function hashString(str) {
    var h = 2166136261;                       // FNV-1a
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    var state = (typeof seed === 'string' ? hashString(seed) : (seed == null ? 1 : Math.floor(Number(seed)) || 0)) >>> 0;

    function next() {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    return {
      next: next,
      range: function (a, b) { return a + (b - a) * next(); },
      int: function (a, b) { return Math.floor(a + (b - a + 1) * next()); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle: function (arr) {
        var out = arr.slice();
        for (var i = out.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        }
        return out;
      },
      normal: function (mean, sd) {
        // Sum of 12 uniform draws minus 6: mean 0, standard deviation 1, tails end at 6 sd.
        // Chosen over Box-Muller on purpose: it only adds, so the result is bit-for-bit
        // the same in Node and in every browser. Math.log and Math.cos are NOT: they differ
        // in the last digit between engines, and one differing digit can change a simulation.
        var z = -6;
        for (var i = 0; i < 12; i++) { z += next(); }
        return (mean == null ? 0 : mean) + (sd == null ? 1 : sd) * z;
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Public object
   * ------------------------------------------------------------------ */

  var Motion = {
    // clock
    now: now,
    useManualClock: useManualClock,
    setTime: setTime,
    useRealClock: useRealClock,
    isManual: function () { return clock.manual; },

    // easing
    ease: ease,
    easings: ease,
    spring: spring,
    steps: steps,

    // animation
    tween: tween,
    timeline: timeline,
    raf: raf,
    count: count,
    splitText: splitText,

    // random + math
    rng: rng,
    lerp: lerp,
    clamp: clamp,
    mapRange: mapRange,
    formatNumber: formatNumber,

    // introspection (tests, Deck settle())
    stats: stats,
    pending: function () { return stats().pending; },
    activeLoops: function () { return loops.length; }
  };

  /* Motion.timeScale = 20 makes every tween, loop and timer run 20x faster. */
  Object.defineProperty(Motion, 'timeScale', {
    enumerable: true,
    get: function () { return clock.scale; },
    set: setTimeScale
  });

  return Motion;
}));
