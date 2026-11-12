/*
 * slides/_demo.js: six THROWAWAY slides that exercise the engine.
 *
 * They exist so the engine can be built, tested and themed before the real
 * slides are written. tools/test-engine.js drives them by id.
 *
 * TO SWITCH THEM OFF for the real talk, set this anywhere before this file
 * loads (for example at the top of slides/act0.js):
 *
 *     window.DECK_DEMO = false;
 *
 * Leave the <script> tag in index.html: the engine test forces the demo
 * slides back on by opening index.html?demo, without touching the flag.
 *
 * What each slide proves
 *   demo-reveals   multi-step builds, every data-anim, data-step-only / -out
 *   demo-counter   data-count-to counters, and long speaker notes
 *   demo-timer     the timer scene (T start / pause, R reset)
 *   demo-scene     a custom scene defined right here, with an animation loop
 *   demo-skipped   skip() returns true: never shown, never numbered
 *   demo-throws    enter() throws on purpose: the deck carries on
 */
(function () {
  'use strict';

  var forcedOn = /[?&]demo(=|&|$)/.test(window.location.search);
  if (window.DECK_DEMO === false && !forcedOn) { return; }
  if (!window.Deck || !window.Scenes) { return; }

  /* ---------------------------------------------------------------------
   * A custom scene, defined inline. This is the whole scene contract:
   * build inside `host`, return { step, resize, destroy }, and stop every
   * loop in destroy().
   * ------------------------------------------------------------------- */
  Scenes.define('demo-orbit', function (host, opts, api) {
    var Motion = api.motion;
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(canvas);

    var view = api.deck.fitCanvas(canvas);          // { ctx, width, height, ratio } in stage units

    // Colours come from the theme. Read them once, not every frame.
    var colors = {
      line: api.token('color-line', '#3b434e'),
      accent: api.token('color-accent', '#ffd166'),
      fg: api.token('color-fg', '#f5f2ea')
    };
    var rings = 1;                                  // how many rings are showing (follows the step)
    var shown = 1;                                  // eased version of `rings`, for a soft build
    var growTween = null;
    var pings = [];                                 // clicks: proof that the mouse belongs to the scene

    // Seeded, so the picture is the same on every machine.
    var rng = Motion.rng(opts.seed || 7);
    var dots = [];
    for (var ring = 0; ring < 3; ring++) {
      var n = 5 + ring * 4;
      for (var i = 0; i < n; i++) {
        dots.push({ ring: ring, angle: (i / n) * Math.PI * 2, speed: rng.range(0.25, 0.6) * (ring % 2 ? -1 : 1), size: rng.range(7, 15) });
      }
    }

    function draw(now) {
      var ctx = view.ctx;
      var cx = view.width / 2;
      var cy = view.height / 2;
      var unit = Math.min(view.width, view.height) / 7;
      ctx.clearRect(0, 0, view.width, view.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = colors.line;
      for (var r = 0; r < 3; r++) {
        var ringAlpha = Motion.clamp(shown - r, 0, 1);
        if (ringAlpha <= 0) { continue; }
        ctx.globalAlpha = ringAlpha;
        ctx.beginPath();
        ctx.arc(cx, cy, unit * (r + 1), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = colors.accent;
      dots.forEach(function (d) {
        var alpha = Motion.clamp(shown - d.ring, 0, 1);
        if (alpha <= 0) { return; }
        var a = d.angle + now * d.speed;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * unit * (d.ring + 1), cy + Math.sin(a) * unit * (d.ring + 1), d.size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = colors.fg;
      pings = pings.filter(function (p) { return now - p.at < 1; });
      pings.forEach(function (p) {
        var k = (now - p.at) / 1;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 + k * 90, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // One loop, reading Motion time. Keep the stop function for destroy().
    var stopLoop = Motion.raf(function (now) { draw(now); });

    function onClick(e) {
      var box = canvas.getBoundingClientRect();
      // getBoundingClientRect is in window pixels; the canvas draws in stage units.
      pings.push({
        x: (e.clientX - box.left) * (view.width / box.width),
        y: (e.clientY - box.top) * (view.height / box.height),
        at: Motion.now()
      });
    }
    canvas.addEventListener('click', onClick);

    return {
      step: function (n, dir) {
        rings = Math.min(3, n + 1);
        if (growTween) { growTween.cancel(); }
        if (dir === 0) { shown = rings; return; }     // first call after mount: no animation
        growTween = Motion.tween({ from: shown, to: rings, duration: 0.6, ease: 'outCubic', onUpdate: function (v) { shown = v; } });
      },
      resize: function () { view = api.deck.fitCanvas(canvas); },
      destroy: function () {
        stopLoop();
        if (growTween) { growTween.cancel(); }
        canvas.removeEventListener('click', onClick);
        host.removeChild(canvas);
      }
    };
  });

  /* ------------------------------------------------------------------ 1 */
  Deck.slide({
    id: 'demo-reveals',
    act: 0,
    title: 'Demo: step reveals',
    minutes: 1,
    html: `
      <p class="kicker">Engine demo · 1 of 5 · delete deck/slides/_demo.js when the real slides exist</p>
      <h1>Step reveals</h1>
      <p class="muted" data-step-out="1" data-anim="fade">Press → to build. This line leaves at step 1 (data-step-out).</p>
      <ul>
        <li data-step="1" data-anim="rise">rise: slides up into place</li>
        <li data-step="2" data-anim="fade">fade: opacity only</li>
        <li data-step="3" data-anim="wipe">wipe: uncovered from the left</li>
        <li data-step="4" data-anim="pop">pop: scales up with a small overshoot</li>
      </ul>
      <p data-step-only="3" data-anim="fade" class="label">This note is on screen at step 3 only (data-step-only).</p>
      <p data-step="5" data-anim="stamp"><span class="badge badge-yes">stamp</span></p>
    `,
    notes: `
      Five builds, one per data-anim value: rise, fade, wipe, pop, stamp.

      The grey line under the title uses data-step-out and disappears at the first build. The small note uses data-step-only and is only there at step 3.
    `
  });

  /* ------------------------------------------------------------------ 2 */
  Deck.slide({
    id: 'demo-counter',
    act: 0,
    title: 'Demo: counters and long notes',
    minutes: 1,
    layout: 'center',
    html: `
      <p class="kicker">Engine demo · 2 of 5 · test values, not data</p>
      <div class="big-number" data-demo="main-count" data-count-to="3600" data-count-format="$,d">$3,600</div>
      <p class="label">data-count-to="3600" data-count-format="$,d"</p>
      <p data-step="1" data-anim="rise">
        Then
        <strong class="accent" data-demo="second-count" data-count-to="4.3" data-count-format=".1f" data-count-suffix=" seconds" data-count-duration="0.8">4.3 seconds</strong>
        at step 1.
      </p>
    `,
    notes: `
      This slide carries deliberately long notes so the presenter view and the N overlay can be checked for scrolling, line length and type size.

      The big number counts up when the slide appears. The second number is inside a step, so it only counts when that step is reached, and it resets if you step back.

      In fast mode and print mode both numbers show their final value at once. That is what the screenshot tool and the PDF export rely on.

      YOUR STORY: this is how a "your story" marker looks in the notes. Slide authors write these where only the speaker knows what really happened.

      Paragraphs are separated by a blank line. Single line breaks
      stay as line breaks, which is handy for a short list:
      one thing
      another thing
      a third thing

      Use the A+ and A- buttons in the presenter view (or the + and - keys) to change the size of this text. The size is remembered.

      Last paragraph. If you can read this without scrolling, the window is large or the type is small. Either is fine.
    `
  });

  /* ------------------------------------------------------------------ 3 */
  Deck.slide({
    id: 'demo-timer',
    act: 0,
    title: 'Demo: timer scene',
    minutes: 2,
    layout: 'chart',
    html: `
      <p class="kicker">Engine demo · 3 of 5 · press T to start or pause, R to reset</p>
      <div class="scene" data-scene="timer" data-opts='{"minutes": 2, "label": "Timer demo"}'></div>
    `,
    notes: `
      T starts and pauses the countdown. R resets it. Clicking the timer also starts and pauses it.

      The last minute changes colour. At zero it changes again and pulses.
    `
  });

  /* ------------------------------------------------------------------ 4 */
  Deck.slide({
    id: 'demo-scene',
    act: 0,
    title: 'Demo: custom scene',
    minutes: 1,
    layout: 'chart',
    html: `
      <p class="kicker">Engine demo · 4 of 5 · a scene defined in _demo.js</p>
      <h2>A canvas scene with its own loop. Click it: the deck does not advance.</h2>
      <div class="scene" data-scene="demo-orbit" data-opts='{"seed": 7}'></div>
    `,
    steps: 2,
    notes: `
      Each build adds a ring. The scene gets step(n, dir) from the engine and stops its loop when the slide leaves.
    `
  });

  /* ------------------------------------------------------------------ 5 */
  Deck.slide({
    id: 'demo-skipped',
    act: 0,
    title: 'Demo: skipped (you should never see this)',
    minutes: 1,
    html: `<h1>If this is on screen, skip() is broken.</h1>`,
    skip: function () { return true; },
    notes: `Never shown.`
  });

  /* ------------------------------------------------------------------ 6 */
  Deck.slide({
    id: 'demo-throws',
    act: 0,
    title: 'Demo: a slide whose enter() throws',
    minutes: 1,
    html: `
      <p class="kicker">Engine demo · 5 of 5</p>
      <h1>This slide's enter() throws.</h1>
      <p>You can still read it, and ← → still work. Add ?debug to the address to see the error badge.</p>
    `,
    enter: function () {
      var err = new Error('demo-throws: enter() threw on purpose');
      err.deckExpected = true;      // tells tools/shoot.js this one is intentional
      throw err;
    },
    notes: `
      The engine wraps every slide and scene hook. One broken slide must never take the deck down.
    `
  });
}());
