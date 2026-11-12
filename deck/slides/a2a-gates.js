/*
 * slides/a2a-gates.js: Act 2, The Four Gates, opening pair.
 *
 *   four-gates        1.5 min   the dock assembles, one gate and one question
 *                               at a time; the last step shows what a NO does
 *   minutes-to-money  1 min     minutes leave a dial and run into two channels
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
  var MIN = S.MINUTES || { cx: 378, cy: 672, ix: 1188, iw: 668, ih: 234, ya: 477, yb: 867 };
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

    /* ---------------- minutes-to-money ---------------- */
    '.m2m-say { position: absolute; left: var(--m-x); top: 58px; margin: 0; white-space: nowrap; }',
    '.m2m-say + .m2m-say { top: 160px; }',
    '.m2m-stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }',
    '.m2m-svg { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 2; pointer-events: none; overflow: visible; }',
    /* nodes the scene moves every frame never take a CSS transition (?fast gives every element one) */
    '.m2m-svg *, .m2m-money { transition-property: none !important; }',
    '.m2m-svg circle { fill: var(--c-ink); }',
    '.m2m-rails polyline { fill: none; stroke: var(--c-line); stroke-width: var(--w-rule); stroke-linejoin: miter; }',
    '.m2m-trays rect { fill: none; stroke: var(--c-line); stroke-width: var(--w-bold); }',
    /* without the scene (overview, presenter view): at step 1 the piles are gone */
    '.slide:not([data-current-step="0"]) .m2m-stage:not(.is-live) .m2m-pile { visibility: hidden; }',
    '.m2m-src { position: absolute; left: ' + (MIN.cx - 145) + 'px; top: ' + (MIN.cy - 82) + 'px; width: 290px; margin: 0; }',
    '.m2m-money { position: absolute; left: ' + MIN.ix + 'px; width: ' + MIN.iw + 'px; height: ' + MIN.ih + 'px; z-index: 1;',
    '  background: var(--c-accent); color: var(--c-accent-ink); display: flex; flex-direction: column; }',
    '.m2m-money.is-a { top: ' + (MIN.ya - MIN.ih / 2) + 'px; padding: 26px 30px 0; }',
    '.m2m-money.is-b { top: ' + (MIN.yb - MIN.ih / 2) + 'px; }',
    '.m2m-money.is-b > div { flex: 1 1 0; display: flex; flex-direction: column; justify-content: center; padding: 0 30px; }',
    '.m2m-money.is-b > div + div { border-top: var(--w-rule) solid var(--c-accent-ink); }',
    '.m2m-money .label { font-size: var(--t-label); margin: 0; }',
    '.m2m-name { margin: 12px 0 0; font-family: var(--f-display); font-size: 64px; font-weight: var(--wght-display);',
    '  font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; white-space: nowrap; }',
    '.m2m-name.is-xl { margin-top: 22px; font-size: 200px; }'
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
      'NEXT: Before the first gate, one thing about minutes.',
      '',
      'TIME: 1.5 minutes.'
    ].join('\n')
  });

  /* ======================================================================
   * minutes-to-money
   * ==================================================================== */

  Deck.slide({
    id: 'minutes-to-money',
    act: 2,
    title: 'Minutes are the raw material',
    minutes: 1,
    layout: 'flow',
    steps: 1,
    html:
      '<p class="say is-s m2m-say">Minutes are the raw material.</p>' +
      '<p class="say is-s m2m-say" data-step="1" data-anim="pop">Money is what they turn into.</p>' +
      '<div class="m2m-stage a2-live" data-scene="minutes-flow">' +
        '<div class="m2m-money is-a" data-step="1">' +
          '<p class="label is-tight">Either way</p>' +
          '<p class="m2m-name is-xl">ROI</p>' +
        '</div>' +
        '<div class="m2m-money is-b" data-step="1">' +
          '<div><p class="label is-tight">Product side</p><p class="m2m-name">Cash conversion cycle</p></div>' +
          '<div><p class="label is-tight">Service side</p><p class="m2m-name">Capacity</p></div>' +
        '</div>' +
        (S.minutesFlowSvg ? S.minutesFlowSvg() : '') +
        '<p class="stack m2m-src" data-fit data-fit-gap="16"><span class="ln">Minutes</span><span class="ln">saved</span></p>' +
      '</div>',
    enter: S.arrive,
    step: S.moved,
    notes: [
      'SAY: At work we count wins in minutes. Waypoint, our AI program, will not count a win without the time saved.',
      'Nobody in this room is paid in minutes. You count cash.',
      'So minutes are the raw material. Money is what they turn into, and they turn into it two ways.',
      '',
      'DO: Click once. The two piles of minutes turn into the two channels.',
      '',
      'SAY: Either way, the hours are worth what an hour costs you. That is plain ROI.',
      'The second channel depends on the business. On the product side, cash comes in sooner. On the service side, the same crew does more paid work. We have both under one roof.',
      '',
      'NEXT: Gate one. What does it cost to run?',
      '',
      'TIME: 1 minute.'
    ].join('\n')
  });
}());
