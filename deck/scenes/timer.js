/*
 * scenes/timer.js: the exercise countdown.
 *
 *   <div class="scene" data-scene="timer" data-opts='{"minutes": 10, "label": "Exercise 1"}'></div>
 *
 * opts
 *   minutes    length of the countdown (default 5; fractions are fine: 0.5 = 30 s)
 *   label      small caption above the digits (optional)
 *   autostart  true starts counting as soon as the slide appears (default false)
 *   hint       false hides the "T start" line under the bar (default true)
 *
 * Keys (forwarded by the engine): T start / pause, R reset. Clicking the timer
 * also starts and pauses it.
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

  window.Scenes.define('timer', function (host, opts, api) {
    var Motion = api.motion;
    var total = Math.max(1, Math.round((Number(opts.minutes) > 0 ? Number(opts.minutes) : 5) * 60));   // seconds

    // The whole state: seconds counted before the latest start, and when that start was.
    var banked = 0;
    var startedAt = null;        // Motion.now() of the latest start; null while not running
    var stopLoop = null;         // stop function of the Motion.raf loop; null while not running
    var lastShown = '';

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

    /* ---- drawing ---- */
    function render() {
      var left = remaining();
      var state = stateName();

      // Finished: freeze at zero and stop the loop.
      if (state === 'finished' && startedAt !== null) {
        banked = total;
        startedAt = null;
        stop();
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

      hint.textContent = state === 'idle' ? 'T start \u00b7 R reset'
        : state === 'running' ? 'T pause \u00b7 R reset'
        : state === 'paused' ? 'Paused \u00b7 T resume \u00b7 R reset'
        : 'Time \u00b7 R reset';
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
      render();
    }

    function pause() {
      if (startedAt === null) { return; }
      banked = elapsed();
      startedAt = null;
      stop();
      render();
    }

    function toggle() {
      if (startedAt === null) { start(); } else { pause(); }
    }

    function reset() {
      banked = 0;
      startedAt = null;
      stop();
      render();
    }

    fit();
    render();
    if (opts.autostart && !api.mode.print) { start(); }

    return {
      step: function () {},
      resize: fit,
      destroy: function () {
        stop();
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
