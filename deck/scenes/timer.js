/*
 * scenes/timer.js: the exercise countdown.
 *
 *   <div class="scene" data-scene="timer" data-opts='{"minutes": 10, "label": "Exercise 1"}'></div>
 *
 * opts
 *   minutes    length of the countdown (default 5; fractions are fine: 0.5 = 30 s)
 *   label      small caption above the digits (optional)
 *   autostart  true starts counting as soon as the slide appears (default false;
 *              a countdown that is being picked up again is left as it was)
 *   hint       false hides the "T start" line under the bar (default true)
 *   keep       minutes a paused or finished countdown is remembered after its
 *              slide was last on screen (default 10). 0 = remember nothing:
 *              a fresh countdown on every visit.
 *   id         a name for this countdown's memory. Only needed if a slide's
 *              markup is rebuilt in a way that reorders its timers.
 *
 * Keys (forwarded by the engine): T start / pause, R reset. Clicking the timer
 * also starts and pauses it.
 *
 * THE COUNTDOWN BELONGS TO THE SLIDE, NOT TO ONE VISIT
 * The engine destroys a scene when its slide leaves. A stray clicker press in
 * the middle of a ten minute exercise must not throw the remaining time away,
 * so the countdown's state is kept outside the scene:
 *   - step to another slide and back, or reload the page: a running countdown
 *     has kept counting (it is over if its time ran out meanwhile), a paused
 *     one is still paused at the same time;
 *   - R resets it and forgets it;
 *   - a countdown that is paused or over is forgotten `keep` minutes after its
 *     slide was last on screen, so a rehearsal does not leave a half-used
 *     timer behind for the talk. A running one is never forgotten before it
 *     ends.
 * It is kept in memory (exact, on the Motion clock) and in sessionStorage
 * (survives a reload, gone when the tab closes; wall-clock time is the only
 * clock that survives a reload, so that copy uses Date.now()).
 * No loop runs while the slide is away: the state is two numbers.
 *
 * The time left is always worked out from timestamps (Motion.now()), never
 * from counting ticks, so it stays right when the tab is in the background,
 * and tests can drive it with Motion.useManualClock() / Motion.setTime().
 *
 * Looks live in engine/deck.css, section 9, all through --timer-* variables.
 * State is exposed on the root element for CSS:
 *   .timer[data-state="idle | running | paused | finished"]
 *   .timer[data-last-minute]     present during the last 60 seconds
 */
(function () {
  'use strict';
  if (!window.Scenes) { return; }

  /* ---------------------------------------------------------------------
   * Memory shared by every timer on the page.
   *
   * A record is the countdown's state at the moment it was written:
   *   { total, banked, running, at, wall }
   *   total    length in seconds (a record for another length is ignored)
   *   banked   seconds used up when the record was written
   *   running  was it counting?
   *   at       Motion.now() when written  (memory only: exact, test-drivable)
   *   wall     Date.now() when written    (storage: survives a reload)
   * ------------------------------------------------------------------- */
  var memory = {};
  var STORE_PREFIX = 'deck.timer:';
  var DEFAULT_KEEP_MINUTES = 10;

  function storageKey(key) { return STORE_PREFIX + window.location.pathname + ':' + key; }

  function remember(key, rec) {
    memory[key] = rec;
    try {
      window.sessionStorage.setItem(storageKey(key), JSON.stringify({ total: rec.total, banked: rec.banked, running: rec.running, wall: rec.wall }));
    } catch (e) { /* no storage here: the countdown still survives leaving the slide */ }
  }

  function forget(key) {
    delete memory[key];
    try { window.sessionStorage.removeItem(storageKey(key)); } catch (e) { /* nothing to remove */ }
  }

  /**
   * What the countdown `key` should look like right now, or null for a fresh one.
   * Returns { banked, running }: seconds used up, and whether it is counting.
   */
  function recall(key, total, keepSeconds, motionNow) {
    var rec = memory[key];
    var exact = !!rec;                       // this page wrote it: use the Motion clock
    if (!rec) {
      try { rec = JSON.parse(window.sessionStorage.getItem(storageKey(key)) || 'null'); } catch (e) { rec = null; }
    }
    if (!rec || rec.total !== total || !(rec.banked >= 0)) { return null; }

    var wallNow = Date.now();
    var used = rec.banked;
    if (rec.running) { used += exact ? motionNow - rec.at : (wallNow - rec.wall) / 1000; }
    used = Math.max(0, used);
    if (rec.running && used < total) { return { banked: used, running: true }; }

    // Paused or over. How long ago did it stop mattering?
    var stoppedAt = rec.running ? rec.wall + (total - rec.banked) * 1000 : rec.wall;
    if (wallNow - stoppedAt > keepSeconds * 1000) { forget(key); return null; }
    return { banked: Math.min(used, total), running: false };
  }

  // The Motion clock was re-based (see Motion.onRebase): move the timestamps of
  // the countdowns whose slides are away. Mounted ones move their own below.
  if (window.Motion && window.Motion.onRebase) {
    window.Motion.onRebase(function (delta) {
      Object.keys(memory).forEach(function (key) { memory[key].at += delta; });
    });
  }

  window.Scenes.define('timer', function (host, opts, api) {
    var Motion = api.motion;
    var total = Math.max(1, Math.round((Number(opts.minutes) > 0 ? Number(opts.minutes) : 5) * 60));   // seconds

    // Memory: on unless keep is 0, and never in print mode (the PDF shows full time).
    var keepSeconds = (opts.keep != null && Number(opts.keep) >= 0 ? Number(opts.keep) : DEFAULT_KEEP_MINUTES) * 60;
    var keeps = keepSeconds > 0 && !api.mode.print;
    var key = api.slide + ':' + (opts.id != null ? opts.id : timerIndex());

    // The whole state: seconds counted before the latest start, and when that start was.
    var banked = 0;
    var startedAt = null;        // Motion.now() of the latest start; null while not running
    var stopLoop = null;         // stop function of the Motion.raf loop; null while not running
    var lastShown = '';

    /** Which timer on this slide is this? (0 for the first, which is nearly always the only one.) */
    function timerIndex() {
      var slide = host.closest ? host.closest('.slide') : null;
      var all = slide ? slide.querySelectorAll('[data-scene="timer"]') : [];
      return Math.max(0, Array.prototype.indexOf.call(all, host));
    }

    /* ---- DOM ---- */
    var root = document.createElement('div');
    root.className = 'timer';
    root.setAttribute('role', 'timer');
    var label = document.createElement('div');
    label.className = 'timer-label';
    label.textContent = opts.label || '';
    var digits = document.createElement('div');
    digits.className = 'timer-digits';
    var bar = document.createElement('div');
    bar.className = 'timer-bar';
    var fill = document.createElement('div');
    fill.className = 'timer-bar-fill';
    bar.appendChild(fill);
    var hint = document.createElement('div');
    hint.className = 'timer-hint';
    if (opts.hint === false) { hint.hidden = true; }
    root.appendChild(label);
    root.appendChild(digits);
    root.appendChild(bar);
    root.appendChild(hint);
    host.appendChild(root);
    root.addEventListener('click', toggle);

    /* ---- time ---- */
    function elapsed() { return banked + (startedAt === null ? 0 : Motion.now() - startedAt); }
    function remaining() { return Math.max(0, total - elapsed()); }

    function stateName() {
      if (remaining() <= 0) { return 'finished'; }
      if (startedAt !== null) { return 'running'; }
      return banked > 0 ? 'paused' : 'idle';
    }

    /* ---- memory ---- */

    /** Write the state down as it is this instant (or forget it, when there is nothing to keep). */
    function persist() {
      if (!keeps) { return; }
      var used = Math.min(total, elapsed());
      var running = startedAt !== null && used < total;
      if (!running && used <= 0) { forget(key); return; }
      remember(key, { total: total, banked: used, running: running, at: Motion.now(), wall: Date.now() });
    }

    /** Pick up where this slide's countdown was left. True if there was something to pick up. */
    function restore() {
      if (!keeps) { return false; }
      var was = recall(key, total, keepSeconds, Motion.now());
      if (!was) { return false; }
      banked = was.banked;
      startedAt = was.running ? Motion.now() : null;
      if (was.running && !stopLoop) { stopLoop = Motion.raf(render); }
      return true;
    }

    /* ---- drawing ---- */
    function render() {
      var left = remaining();
      var state = stateName();

      // Finished: freeze at zero and stop the loop.
      if (state === 'finished' && startedAt !== null) {
        banked = total;
        startedAt = null;
        stop();
        persist();
      }

      // Round up, so the display reads 10:00 until a full second has gone and 0:00 only at the end.
      var secs = Math.ceil(left - 1e-6);
      var text = Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60);
      if (text !== lastShown) { digits.textContent = text; lastShown = text; }

      fill.style.transform = 'scaleX(' + (left / total).toFixed(4) + ')';
      root.setAttribute('data-state', state);
      if (left > 0 && left <= 60 && state !== 'idle') { root.setAttribute('data-last-minute', ''); }
      else { root.removeAttribute('data-last-minute'); }
      root.setAttribute('aria-label', (opts.label ? opts.label + ': ' : '') + text + ' left');

      hint.textContent = state === 'idle' ? 'T start · R reset'
        : state === 'running' ? 'T pause · R reset'
        : state === 'paused' ? 'Paused · T resume · R reset'
        : 'Time · R reset';
    }

    /* The digits are sized to the box the slide gives us (override with --timer-size). */
    function fit() {
      var w = host.clientWidth;
      var h = host.clientHeight;
      if (!w || !h) { return; }
      root.style.setProperty('--timer-fit', Math.floor(Math.min(w / 3.1, h * 0.58)) + 'px');
    }

    /* ---- controls ---- */
    function stop() {
      if (stopLoop) { stopLoop(); stopLoop = null; }
    }

    function start() {
      if (startedAt !== null || remaining() <= 0) { return; }
      startedAt = Motion.now();
      if (!stopLoop) { stopLoop = Motion.raf(render); }   // the loop only exists while counting
      persist();
      render();
    }

    function pause() {
      if (startedAt === null) { return; }
      banked = elapsed();
      startedAt = null;
      stop();
      persist();
      render();
    }

    function toggle() {
      if (startedAt === null) { start(); } else { pause(); }
    }

    function reset() {
      banked = 0;
      startedAt = null;
      stop();
      if (keeps) { forget(key); }
      render();
    }

    // A reload gives no destroy(): write the state down when the page goes away.
    window.addEventListener('pagehide', persist);
    // If the Motion clock is re-based while we count, our start time moves with it.
    var offRebase = Motion.onRebase ? Motion.onRebase(function (delta) {
      if (startedAt !== null) { startedAt += delta; }
    }) : null;

    fit();
    var restored = restore();
    render();
    if (!restored && opts.autostart && !api.mode.print) { start(); }

    return {
      step: function () {},
      resize: fit,
      destroy: function () {
        persist();                 // the countdown outlives the scene (see the top of this file)
        stop();
        window.removeEventListener('pagehide', persist);
        if (offRebase) { offRebase(); }
        root.removeEventListener('click', toggle);
        if (root.parentNode) { root.parentNode.removeChild(root); }
      },
      // used by the engine (T and R keys) and by tests
      toggle: toggle,
      start: start,
      pause: pause,
      reset: reset,
      state: function () { return { state: stateName(), remaining: remaining(), total: total }; }
    };
  });
}());
