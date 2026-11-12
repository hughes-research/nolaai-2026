/*
 * slides/a2a-gates.js: Act 2, The Four Gates, opening pair.
 *
 *   four-gates        1.5 min   the dock assembles, one gate and one question
 *                               at a time; the last step shows what a NO does
 *   minutes-to-money  1 min     a block of minutes splits into two channels (no scene)
 *
 * (The three cost slides follow in a2b-cost.js, the rest of the act in
 * a2c-gates.js.)
 *
 * The gate names and questions come from Gates.GATES, so every slide in the
 * deck asks them in the same words. Motion lives in scenes/gates.js; the html
 * here is the whole picture at every step without it.
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var T = window.THEME || null;
  var G = window.Gates || null;
  var S = window.GateScenes || {};
  var esc = S.esc || function (s) { return String(s == null ? '' : s); };

  /* ---- styles for these two slides: scoped by class, tokens only ---- */
  /* minutes-to-money geometry (stage pixels): the block of minutes on the left,
     two rails that split at a hard corner, and the two channels on the right */
  var MIN = { fromTop: 560, fromW: 480, fromH: 280, jx: 820, boxX: 1000, aTop: 400, aH: 230, bTop: 690, bH: 300 };
  MIN.fromX = 128 + MIN.fromW;                        // the block's right edge
  MIN.cy = MIN.fromTop + MIN.fromH / 2;               // where the rail leaves it
  MIN.ya = MIN.aTop + MIN.aH / 2;                     // the two channels' centre lines
  MIN.yb = MIN.bTop + MIN.bH / 2;
  MIN.railPx = MIN.boxX - MIN.fromX;                  // how far the rails grow
  var BAR_SPEED = (S.barSpeed ? S.barSpeed() : 900);
  function railsSvg() {
    var m = MIN, head = 26, end = m.boxX - head;
    function arrow(y) { return '<polygon points="' + end + ',' + (y - 15) + ' ' + m.boxX + ',' + y + ' ' + end + ',' + (y + 15) + '"/>'; }
    return '<svg class="m2m-rails" data-step="1" style="--grow: ' + (m.railPx / BAR_SPEED).toFixed(3) + 's" viewBox="0 0 1920 1080" aria-hidden="true" focusable="false">' +
      // two runs with mitred corners: out of the block, then up or down, then in
      '<path d="M' + m.fromX + ',' + m.cy + ' H' + m.jx + ' V' + m.ya + ' H' + end + '"/>' +
      '<path d="M' + m.jx + ',' + m.cy + ' V' + m.yb + ' H' + end + '"/>' +
      arrow(m.ya) + arrow(m.yb) + '</svg>';
  }
  var css = [
    /* the scenes on these slides drive real markup: no placeholder box in thumbnails */
    '.slide.is-static [data-scene].a2-live::after { content: none; }',
    /* a slide entered already built (see GateScenes.arrive): no entrance builds, no delayed reveals */
    '.a2-settled .a2-build { animation: none !important; }',
    '.a2-arrived :is([data-step], [data-step-only], [data-step-out]) { transition: none !important; }',

    /* ---------------- four-gates ---------------- */
    '.fg-head { position: absolute; left: var(--m-x); top: var(--m-y); margin: 0; }',
    '.fg-aside { position: absolute; right: var(--m-right); top: 98px; margin: 0; line-height: 1; white-space: nowrap; }',
    '.fg-tag { position: absolute; left: 1080px; top: 107px; }',
    /* the dock: 1832px, from the spine to the right edge, standing on the bottom edge.
       The raised shutter and the fine-print strip are a little shallower than the
       component's defaults so a three-line question clears the NO. */
    '.fg-stage { position: absolute; left: var(--spine-w); top: 212px; right: 0; bottom: 0; }',
    '.fg-stage > .dock { position: absolute; left: 0; top: 0; --gw: 464px; --gh: 788px; }',
    '.fg-stage .gate { --gcap: 80px; --graised: calc(var(--gfull) * 0.17); }',
    /* a hidden dock is really gone (parts of a gate set their own visibility) */
    '.fg-stage > .dock:not(.is-visible) { display: none; }',
    /* a gate arriving: its shutter lifts all the way off and leaves the words */
    '@keyframes fg-open { from { height: var(--gfull); } }',
    '.fg-intro .gate.is-opening > .gate-shutter { height: 0; animation: fg-open var(--d-lift) var(--e-lift) backwards; }',
    /* the example run: the gates behind a NO say so */
    '.fg-verdicts .gate > .gate-why { visibility: visible; }',
    '.fg-verdicts.is-waiting .gate:not(.is-pass):not(.is-no) > .gate-why { visibility: hidden; }',
    /* the fine print of the NO cuts in as the stop-time hold ends */
    '.fg-verdicts .gate.is-no > .gate-why { animation-duration: calc(var(--d-hold-before) + var(--d-drop) + var(--d-hold)); }',

    /* ---------------- minutes-to-money: a quiet two-channel diagram ---------------- */
    /* one line of Archivo at normal width; the money line is the slide's one Flare */
    '.m2m-say { position: absolute; left: var(--m-x); top: 58px; margin: 0; white-space: nowrap; }',
    '.m2m-say.is-money { top: 176px; left: calc(var(--m-x) - 24px); padding: 18px 24px 22px; background: var(--c-accent); color: var(--c-accent-ink); }',
    '.m2m-from { position: absolute; left: var(--m-x); top: ' + MIN.fromTop + 'px; width: ' + MIN.fromW + 'px; height: ' + MIN.fromH + 'px; margin: 0;',
    '  display: flex; flex-direction: column; justify-content: center; padding: 0 40px; background: var(--c-ink); color: var(--c-bg);',
    '  font-family: var(--f-display); font-size: 112px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; }',
    '.m2m-from > span + span { margin-top: 26px; }',
    '.m2m-rails { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: visible; pointer-events: none; }',
    '.m2m-rails path { fill: none; stroke: var(--c-ink); stroke-width: var(--w-rule); stroke-linejoin: miter; stroke-linecap: butt; }',
    '.m2m-rails polygon { fill: var(--c-ink); }',
    /* the rails grow left to right at the bar speed when the step arrives */
    '.m2m-rails[data-step]:not(.is-visible) { clip-path: inset(0 100% 0 0); }',
    '.m2m-rails[data-step].is-visible { clip-path: inset(0 0 0 0); }',
    /* (the theme cuts every plain step in at 0s, so the growth has to insist; a slide arrived at already built skips it) */
    '.slide:not(.a2-arrived) .m2m-rails[data-step].is-visible { transition: clip-path var(--grow) linear, visibility 0s !important; }',
    '.m2m-box { position: absolute; left: ' + MIN.boxX + 'px; right: var(--m-right); margin: 0; border: var(--w-bold) solid var(--c-ink); }',
    '.m2m-box.is-a { top: ' + MIN.aTop + 'px; height: ' + MIN.aH + 'px; padding: 28px 36px 0; }',
    '.m2m-box.is-b { top: ' + MIN.bTop + 'px; height: ' + MIN.bH + 'px; display: flex; flex-direction: column; }',
    '.m2m-box.is-b > div { flex: 1 1 0; display: flex; flex-direction: column; justify-content: center; padding: 0 36px; }',
    '.m2m-box.is-b > div + div { border-top: var(--w-rule) solid var(--c-ink); }',
    '.m2m-box .label { margin: 0; }',
    '.m2m-name { margin: 18px 0 0; font-family: var(--f-display); font-size: 72px; font-weight: var(--wght-display);',
    '  font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; white-space: nowrap; }',
    '.m2m-name.is-xl { margin-top: 26px; font-size: 120px; }'
  ].join('\n');
  var style = document.createElement('style');
  style.setAttribute('data-from', 'slides/a2a-gates.js');
  style.textContent = css;
  document.head.appendChild(style);

  /* ======================================================================
   * four-gates
   * ==================================================================== */

  var GATES = (G && G.GATES) || [];

  /* one gate of the dock. `reveal` puts the gate's words on a step. */
  function gateHtml(gate, i, classes, reveal, why) {
    var at = reveal ? ' data-step="' + reveal + '" style="--delay: var(--d-drop)"' : '';
    return '<article class="gate' + (classes ? ' ' + classes : '') + '" data-gate="' + esc(gate.id) + '">' +
      '<i class="gate-shutter"></i>' +
      '<p class="gate-n"' + at + '>Gate ' + (i + 1) + '</p>' +
      '<h3 class="gate-name"' + at + '>' + esc(gate.label) + '</h3>' +
      '<p class="gate-q"' + at + '>' + esc(gate.question) + '</p>' +
      (why ? '<p class="gate-why">' + esc(why) + '</p>' : '') +
      '</article>';
  }

  var RUN_STEP = GATES.length + 1;
  /* the example run: the first gate opens, the second says NO, and by the
     gate logic nothing behind a NO is ever opened */
  var RUN = [
    { classes: 'is-pass is-still', why: 'carried forward' },
    { classes: 'is-no is-flare is-still', why: 'Stops here' }
  ];

  Deck.slide({
    id: 'four-gates',
    act: 2,
    title: 'The four gates',
    minutes: 1.5,
    layout: 'gates',
    steps: RUN_STEP,
    html:
      '<h2 class="headline is-hero fg-head">The four gates</h2>' +
      '<p class="voice is-l fg-aside" data-step="' + RUN_STEP + '" data-anim="wipe" style="--delay: 3600ms">Any no ends it.</p>' +
      '<span class="tag is-example fg-tag" data-step="' + RUN_STEP + '">Example</span>' +
      '<div class="fg-stage a2-live" data-scene="gate-dock" data-opts=\'{"runStep": ' + RUN_STEP + '}\'>' +
        '<div class="dock fg-intro" data-step-out="' + RUN_STEP + '">' +
          GATES.map(function (g, i) { return gateHtml(g, i, '', i + 1, ''); }).join('') +
        '</div>' +
        '<div class="dock fg-verdicts" data-step="' + RUN_STEP + '">' +
          GATES.map(function (g, i) {
            var r = RUN[i] || { classes: '', why: 'Not yet' };
            return gateHtml(g, i, r.classes, 0, r.why);
          }).join('') +
        '</div>' +
      '</div>',
    enter: S.arrive,
    step: S.moved,
    notes: [
      'SAY: Every idea you brought today goes through four gates, in this order.',
      'Cost. What does it cost to run?',
      'Return. What comes back: cash sooner, or more work done?',
      'Effort. What does it take to build it and keep it alive?',
      'Potential. If it works, how far does it grow?',
      '',
      'DO: One click per gate, and read the question off the gate. The fifth click runs an example: Cost passes, Return says no. Let the NO land. Do not talk over it.',
      '',
      'SAY: Any no ends it. Effort and Potential never get asked.',
      'That is not the screen failing. That is the screen working. Saying no early is the skill.',
      '',
      'NEXT: Before the first gate, one thing about minutes.'
    ].join('\n')
  });

  /* ======================================================================
   * minutes-to-money
   * ==================================================================== */

  var railMs = Math.round(MIN.railPx / BAR_SPEED * 1000);

  Deck.slide({
    id: 'minutes-to-money',
    act: 2,
    title: 'Minutes are the raw material',
    minutes: 1,
    layout: 'flow',
    steps: 1,
    html:
      '<p class="say is-s m2m-say">Minutes are the raw material.</p>' +
      '<p class="say is-s m2m-say is-money" data-step="1" data-anim="pop" style="--delay: ' + (railMs + 333) + 'ms">Money is what they turn into.</p>' +
      '<p class="m2m-from"><span>Minutes</span><span>saved</span></p>' +
      railsSvg() +
      '<div class="m2m-box is-a" data-step="1" style="--delay: ' + railMs + 'ms">' +
        '<p class="label is-tight">Either way</p>' +
        '<p class="m2m-name is-xl">ROI</p>' +
      '</div>' +
      '<div class="m2m-box is-b" data-step="1" style="--delay: ' + railMs + 'ms">' +
        '<div><p class="label is-tight">Product side</p><p class="m2m-name">Cash conversion cycle</p></div>' +
        '<div><p class="label is-tight">Service side</p><p class="m2m-name">Capacity</p></div>' +
      '</div>',
    enter: S.arrive,
    step: S.moved,
    notes: [
      'SAY: At work we count wins in minutes. Waypoint, our AI program, does not count a win without the time saved.',
      'But you count cash.',
      '',
      'DO: Click. The minutes run into two channels.',
      '',
      'SAY: Either way, an hour saved is worth what an hour costs you. That is plain ROI.',
      'Then it depends on the business. Product side: cash in sooner. Service side: the same crew does more paid work. We have both.',
      '',
      'NEXT: Four gates turn those minutes into a yes or a no. First, the one everybody asks about.'
    ].join('\n')
  });
}());
