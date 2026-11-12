/*
 * scenes/close.js: the one small scene of Act 5 (the last ten minutes).
 *
 *   'a5-cue'   A stage-hand, not a drawing. It tells a slide's own CSS when a
 *              build is being PLAYED (the speaker just pressed next) as opposed
 *              to merely SHOWN (a reload, a jump, stepping back from the next
 *              slide, the overview, the PDF).
 *
 *     <i hidden data-scene="a5-cue" data-opts='{"at": 1, "for": 1.25}'></i>
 *     <i hidden data-scene="a5-cue" data-opts='{"at": [2, 3], "for": [2.5, 2.1]}'></i>
 *
 *   opts
 *     at     the step whose arrival is a cue (default 1), or a list of steps
 *     for    seconds the cue stays up (default 2), or a list with one entry per
 *            step in "at". It only has to outlast the choreography; when it
 *            comes down the slide is in its final state for that step.
 *
 *   While a cue is up the slide root carries class "is-playing" and
 *   data-playing="<step>". The slides in slides/a5-close.js hang their played
 *   moves on it:
 *     the-objection    the answer block drops onto the slide and the quote recoils
 *     share-the-gain   the Flare block drops in behind the third beat
 *     close            the last sentence, one half per click, with a stop-time
 *                      hold in negative after the first half
 *
 *   Why a scene and not a step() hook: the engine calls step(n, 0) on mount
 *   (dir 0: shown, not played), step(n, +1 | -1) on every change, and destroy()
 *   when the slide has left, so a cue can never be left hanging. A new cue, a
 *   step back, or leaving the slide takes the old one down at once.
 *
 *   If this file fails to load, nothing breaks: every build on those slides is
 *   plain data-step markup and still lands in the right place, as a cut. Only
 *   the played moves above are lost.
 *
 *   Time: the cue is held on the Motion clock (so ?fast drops it 20 times
 *   sooner and the test suite sees no stray timers). The moves it gates are
 *   CSS, like every other element build in the deck.
 */
(function () {
  'use strict';
  if (!window.Scenes) { return; }

  function list(value, fallback) {
    var items = Array.isArray(value) ? value : [value == null ? fallback : value];
    return items.map(Number);
  }

  window.Scenes.define('a5-cue', function (host, opts, api) {
    var Motion = api && api.motion;
    var steps = list(opts.at, 1).filter(function (n) { return n >= 0; });
    if (!steps.length) { steps = [1]; }
    var holds = list(opts['for'], 2);

    // seconds the cue for this step stays up: its own entry, or the last one given
    function holdFor(step) {
      var seconds = holds[Math.min(steps.indexOf(step), holds.length - 1)];
      return seconds > 0 ? seconds : 2;
    }

    // the element that carries the class: the slide itself
    var root = host.closest ? (host.closest('.slide') || host.parentNode) : host.parentNode;
    var pending = null;    // the Motion tween that takes the cue down again
    var timer = null;      // fallback when lib/motion.js is not on the page

    function down() {
      if (pending) { pending.cancel(); pending = null; }
      if (timer) { clearTimeout(timer); timer = null; }
      if (root) {
        root.classList.remove('is-playing');
        root.removeAttribute('data-playing');
      }
    }

    function up(step) {
      down();
      if (!root) { return; }
      var hold = holdFor(step);
      void root.offsetWidth;                 // a second press restarts the move from the top
      root.classList.add('is-playing');
      root.setAttribute('data-playing', String(step));
      if (Motion && Motion.tween) {
        pending = Motion.tween({ from: 0, to: 1, duration: hold, ease: 'linear', onDone: function () { pending = null; down(); } });
      } else {
        timer = setTimeout(function () { timer = null; down(); }, hold * 1000);
      }
    }

    return {
      step: function (n, dir) {
        if (dir > 0 && steps.indexOf(n) >= 0) { up(n); } else { down(); }
      },
      destroy: down
    };
  });
}());
