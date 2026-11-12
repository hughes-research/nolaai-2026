/*
 * scenes/close.js: the one small scene of Act 5 (the last ten minutes).
 *
 *   'a5-cue'   A stage-hand, not a drawing. It tells a slide's own CSS when a
 *              build is being PLAYED (the speaker just pressed next) as opposed
 *              to merely SHOWN (a reload, a jump, stepping back from the next
 *              slide, the overview, the PDF).
 *
 *     <i hidden data-scene="a5-cue" data-opts='{"at": 2, "for": 4.5}'></i>
 *
 *   opts
 *     at     the step whose arrival is the cue (default 1)
 *     for    seconds the cue stays up (default 2). It only has to outlast the
 *            choreography; when it comes down the slide is in its final state.
 *
 *   While the cue is up the slide root carries class "is-playing" and
 *   data-playing="<step>". The slides in slides/a5-close.js hang two moves on it:
 *     the-objection   the quote recoils when the answer block lands on the slide
 *     close           the stop-time hold in negative between the two last sentences
 *
 *   Why a scene and not a step() hook: the engine calls step(n, 0) on mount
 *   (dir 0: shown, not played), step(n, +1 | -1) on every change, and destroy()
 *   when the slide has left, so the cue can never be left hanging.
 *
 *   If this file fails to load, nothing breaks: every build on those slides is
 *   plain data-step markup and still lands in the right place. Only the two
 *   flourishes above are lost.
 *
 *   Time: the cue is held on the Motion clock (so ?fast drops it 20 times
 *   sooner and the test suite sees no stray timers). The moves it gates are
 *   CSS, like every other element build in the deck.
 */
(function () {
  'use strict';
  if (!window.Scenes) { return; }

  window.Scenes.define('a5-cue', function (host, opts, api) {
    var Motion = api && api.motion;
    var at = Number(opts.at);
    if (!(at >= 0)) { at = 1; }
    var hold = Number(opts['for']) > 0 ? Number(opts['for']) : 2;

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
        if (dir > 0 && n === at) { up(n); } else { down(); }
      },
      destroy: down
    };
  });
}());
