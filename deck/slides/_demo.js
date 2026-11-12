/*
 * slides/_demo.js: six THROWAWAY slides that exercise the engine.
 *
 * They exist so the engine can be built, tested and themed before the real
 * slides are written. tools/test-engine.js drives them by id.
 *
 * TO SWITCH THEM OFF for the real talk, set this anywhere before this file
 * loads (for example at the top of the first slides file):
 *
 *     window.DECK_DEMO = false;
 *
 * Leave the <script> tag in index.html: the engine test forces the demo
 * slides back on by opening index.html?demo, without touching the flag.
 *
 * These slides bring their own few lines of CSS (below, keyed to
 * .layout-demo, tokens only) so they do not depend on the slide kit and
 * keep working whatever the theme does.
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
   * The demo slides' own styles. Sizes respect the stage floors: running
   * text 36px or more, labels 32px or more, nothing below 28px.
   * ------------------------------------------------------------------- */
  var css = [
    '.layout-demo { display: flex; padding: var(--m-y, 72px) var(--m-x, 128px) calc(var(--m-y, 72px) + 32px);',
    '  background: var(--c-bg, #f4edde); color: var(--c-ink, #050505);',
    '  font: 500 var(--t-body, 40px)/1.25 var(--f-body, system-ui, sans-serif); }',
    '.layout-demo .demo-body { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 24px; }',
    '.layout-demo .demo-top { justify-content: flex-start; }',
    '.layout-demo .demo-center { align-items: center; text-align: center; }',
    '.layout-demo h1, .layout-demo h2, .layout-demo p, .layout-demo ul { margin: 0; }',
    '.layout-demo h1 { font: 800 var(--t-h1, 96px)/1 var(--f-display, system-ui, sans-serif); }',
    '.layout-demo h2 { font: 800 var(--t-h2, 64px)/1.05 var(--f-display, system-ui, sans-serif); }',
    '.layout-demo ul { padding-left: 1.1em; }',
    '.layout-demo li + li { margin-top: 0.3em; }',
    '.layout-demo .demo-kicker, .layout-demo .demo-note { font-size: var(--t-label, 32px); font-weight: 700; }',
    '.layout-demo .demo-kicker { letter-spacing: 0.08em; text-transform: uppercase; }',
    '.layout-demo .demo-big { font: 800 var(--t-mega, 260px)/1 var(--f-display, system-ui, sans-serif); }',
    /* the accent is a block with its own ink on it, never coloured text on the ground */
    '.layout-demo .demo-mark { padding: 0 0.2em; background: var(--c-accent, #ff6842); color: var(--c-accent-ink, #050505); font-weight: 800; }',
    '.layout-demo .demo-chip { display: inline-block; padding: 0.1em 0.6em; border: var(--w-rule, 6px) solid currentColor;',
    '  font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }',
    '.layout-demo .demo-scene { flex: 1 1 0; min-height: 0; width: 100%; }'
  ].join('\n');
  var style = document.createElement('style');
  style.setAttribute('data-from', 'slides/_demo.js');
  style.textContent = css;
  document.head.appendChild(style);

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
      line: api.token('--c-line', '#050505'),
      ink: api.token('--c-ink', '#050505'),
      accent: api.token('--c-accent', '#ff6842')
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
        dots.push({ ring: ring, angle: (i / n) * Math.PI * 2, speed: rng.range(0.25, 0.6) * (ring % 2 ? -1 : 1), size: rng.range(9, 17) });
      }
    }
    dots[0].featured = true;                        // the one accent on the slide

    function draw(now) {
      var ctx = view.ctx;
      var cx = view.width / 2;
      var cy = view.height / 2;
      var unit = Math.min(view.width, view.height) / 7;
      ctx.clearRect(0, 0, view.width, view.height);

      // Rings and dots arrive by growing, not by fading: `grow` runs 0..1 per ring.
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.line;
      for (var r = 0; r < 3; r++) {
        var grow = Motion.clamp(shown - r, 0, 1);
        if (grow <= 0) { continue; }
        ctx.beginPath();
        ctx.arc(cx, cy, unit * (r + 1), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * grow);
        ctx.stroke();
      }

      dots.forEach(function (d) {
        var grow = Motion.clamp(shown - d.ring, 0, 1);
        if (grow <= 0) { return; }
        var a = d.angle + now * d.speed;
        var x = cx + Math.cos(a) * unit * (d.ring + 1);
        var y = cy + Math.sin(a) * unit * (d.ring + 1);
        ctx.beginPath();
        ctx.arc(x, y, d.size * grow, 0, Math.PI * 2);
        ctx.fillStyle = d.featured ? colors.accent : colors.ink;
        ctx.fill();
        if (d.featured) {                           // the accent alone is too faint on the ground: ring it
          ctx.lineWidth = 4;
          ctx.strokeStyle = colors.ink;
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.strokeStyle = colors.line;
        }
      });

      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 6;
      pings = pings.filter(function (p) { return now - p.at < 0.8; });
      pings.forEach(function (p) {
        var k = (now - p.at) / 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12 + k * 90, 0, Math.PI * 2);
        ctx.stroke();
      });
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
    layout: 'demo',
    html: `
      <div class="demo-body">
        <p class="demo-kicker">Engine demo 1 of 5 · step reveals</p>
        <h1>Step reveals</h1>
        <p data-step-out="1" data-anim="fade">Press → to build. This line leaves at step 1 (data-step-out).</p>
        <ul>
          <li data-step="1" data-anim="rise">rise: slides up into place</li>
          <li data-step="2" data-anim="fade">fade: opacity only</li>
          <li data-step="3" data-anim="wipe">wipe: uncovered from the left</li>
          <li data-step="4" data-anim="pop">pop: scales up with a small overshoot</li>
        </ul>
        <p data-step-only="3" data-anim="fade" class="demo-note">This note is on screen at step 3 only (data-step-only).</p>
        <p data-step="5" data-anim="stamp"><span class="demo-chip">stamp</span></p>
      </div>
    `,
    notes: `
      Five builds, one per data-anim value: rise, fade, wipe, pop, stamp.

      The line under the title uses data-step-out and disappears at the first build. The small note uses data-step-only and is only there at step 3.
    `
  });

  /* ------------------------------------------------------------------ 2 */
  Deck.slide({
    id: 'demo-counter',
    act: 0,
    title: 'Demo: counters and long notes',
    minutes: 1,
    layout: 'demo',
    html: `
      <div class="demo-body demo-center">
        <p class="demo-kicker">Engine demo 2 of 5 · counters · test values, not data</p>
        <div class="demo-big" data-demo="main-count" data-count-to="3600" data-count-format="$,d">$3,600</div>
        <p class="demo-note">data-count-to="3600" data-count-format="$,d"</p>
        <p data-step="1" data-anim="rise">
          Then
          <span class="demo-mark" data-demo="second-count" data-count-to="4.3" data-count-format=".1f" data-count-suffix=" seconds" data-count-duration="0.8">4.3 seconds</span>
          at step 1.
        </p>
      </div>
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
    layout: 'demo',
    html: `
      <div class="demo-body demo-top">
        <p class="demo-kicker">Engine demo 3 of 5 · press T to start or pause, R to reset</p>
        <div class="demo-scene" data-scene="timer" data-opts='{"minutes": 2, "label": "Timer demo"}'></div>
      </div>
    `,
    notes: `
      T starts and pauses the countdown. R resets it. Clicking the timer also starts and pauses it.

      The last minute turns into a filled block. At zero the block inverts and flashes three times.
    `
  });

  /* ------------------------------------------------------------------ 4 */
  Deck.slide({
    id: 'demo-scene',
    act: 0,
    title: 'Demo: custom scene',
    minutes: 1,
    layout: 'demo',
    html: `
      <div class="demo-body demo-top">
        <p class="demo-kicker">Engine demo 4 of 5 · a scene defined in _demo.js</p>
        <h2>A canvas scene with its own loop. Click it: the deck does not advance.</h2>
        <div class="demo-scene" data-scene="demo-orbit" data-opts='{"seed": 7}'></div>
      </div>
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
    layout: 'demo',
    html: `<div class="demo-body"><h1>If this is on screen, skip() is broken.</h1></div>`,
    skip: function () { return true; },
    notes: `Never shown.`
  });

  /* ------------------------------------------------------------------ 6 */
  Deck.slide({
    id: 'demo-throws',
    act: 0,
    title: 'Demo: a slide whose enter() throws',
    minutes: 1,
    layout: 'demo',
    html: `
      <div class="demo-body">
        <p class="demo-kicker">Engine demo 5 of 5 · error isolation</p>
        <h1>This slide's enter() throws.</h1>
        <p>You can still read it, and ← → still work. Add ?debug to the address to see the error badge.</p>
      </div>
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
