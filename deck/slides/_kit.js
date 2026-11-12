/*
 * slides/_kit.js: THE SLIDE KIT, on slides.
 *
 * Open deck/index.html?kit to see it. These slides never appear in the talk:
 * each one skips itself unless the address has ?kit.
 *
 * They are the reference every slide author copies from. Each slide below
 * shows one layout or one family of components, built with real copy from
 * docs/BRIEF.md, with every number computed (CostMath, Gates, window.YOUR),
 * never typed. Find the slide that looks like what you need, copy its html,
 * change the words.
 *
 *   kit-title      layout-title      the fitted stack plus the Flare slab, the catalogue line
 *   kit-type       (plain)           the three inks and every type class at its real size
 *   kit-statement  layout-statement  LOUD: a fitted stack with the punch on a Flare block
 *   kit-quiet      layout-statement  QUIET: one line of Archivo on Card
 *   kit-quote      layout-quote      the Fraunces-led aside, and .edit-mark for the Shannon swap
 *   kit-figure     layout-figure     one huge number: .counter
 *   kit-split      layout-split      two fields on a hard vertical: .cols / .col
 *   kit-list       layout-list       a small headline and three lines: .list
 *   kit-beats      layout-list       a path of numbered steps: .beats
 *   kit-ladder     layout-split      the tool ladder: .ladder
 *   kit-gates      (plain)           the dock: .gate idle / pass / no, with the gate logic
 *   kit-marks      (plain)           .gate-strip, small gates, .verdict, .tag, .slot-yours
 *   kit-chart      layout-chart      a bar chart drawn with THEME.draw, drawn to scale
 *   kit-draw       layout-scene      the whole canvas drawing kit on one sheet
 *   kit-table      layout-table      .table, with the estimated flag and a Flare row
 *   kit-pair       layout-chart      before to after: .pair, with the Laborde tag
 *   kit-exercise   layout-exercise   headline, prompts, the big timer
 *   kit-controls   (plain)           .slider .stepper .seg .chip .field .btn in a working form
 *   kit-motion     (plain)           the five reveals, a counter, and how a NO lands
 *   kit-ink        layout-statement on-ink   a Lampblack slide (rationed)
 *
 * The rules in one breath: Card is the ground. Flare is the point of the
 * slide, once, always a block with Lampblack type on it. NO and PASS are
 * shapes and words. Running text 36px or more, labels 32, source lines 28.
 * Nothing fades.
 */

/* The engine's demo slides are not part of the talk. (?demo still forces
   them on for tools/test-engine.js.) */
window.DECK_DEMO = false;

(function () {
  'use strict';
  if (!window.Deck || !window.Scenes) { return; }

  var KIT_ON = /[?&]kit(=|&|$)/.test(window.location.search) || window.DECK_KIT === true;
  var T = window.THEME;
  var CM = window.CostMath;
  var G = window.Gates;
  var Y = window.YOUR || {};
  var M = window.Motion;

  function hidden() { return !KIT_ON; }

  /* Register one kit slide. Everything is act 0 and takes no time. */
  function kit(def) {
    def.act = 0;
    def.minutes = 0;
    def.skip = hidden;
    def.notes = (def.notes || '') + '\n\nKIT SLIDE. Shown only with ?kit in the address. Source: deck/slides/_kit.js';
    window.Deck.slide(def);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---- values the kit shows, all computed or read from window.YOUR ---- */

  var speaker = Y.speaker || {};
  var event = Y.event || {};
  var rates = Y.rates || {};
  var tokensIn = (Y.tokens && Y.tokens.in) || (CM && CM.DEFAULT_TOKENS && CM.DEFAULT_TOKENS.in);
  var tokensOut = (Y.tokens && Y.tokens.out) || (CM && CM.DEFAULT_TOKENS && CM.DEFAULT_TOKENS.out);
  var hourly = rates.loadedHourly;
  var tiers = CM ? CM.tiers() : [];
  function tierById(id) { return tiers.filter(function (t) { return t.id === id; })[0] || null; }
  var premium = tiers.length ? tiers[tiers.length - 1] : null;      // the dearest tier
  var VOLUME = 100000;                                             // the brief's "100,000 records"
  var assumption = 'assumes ' + (CM ? CM.number(tokensIn) : tokensIn) + ' tokens in / ' + (CM ? CM.number(tokensOut) : tokensOut) + ' out per run';
  var SOURCE = 'Source: BenchLM leaderboard export, Nov 2026';

  /* ---- the kit's own few styles: scoped to kit slides, tokens only ---- */

  var css = [
    '.kit-swatches { display: grid; grid-template-columns: 1.2fr 1fr 1fr; margin: 0 calc(var(--m-right) * -1) var(--s-5) 0; border-top: var(--w-rule) solid var(--c-line); border-bottom: var(--w-rule) solid var(--c-line); }',
    '.kit-swatches > div { display: flex; flex-direction: column; justify-content: space-between; height: 216px; padding: var(--s-3) var(--s-4); }',
    '.kit-swatches > div + div { border-left: var(--w-rule) solid var(--c-line); }',
    '.kit-swatches b { font-family: var(--f-display); font-size: 96px; font-weight: 900; font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; }',
    '.kit-swatches span { font-size: 36px; font-weight: 600; line-height: 1.1; }',
    '.kit-specimen { display: grid; grid-template-columns: 330px 1fr; align-items: center; column-gap: var(--s-4); row-gap: 20px; }',
    '.kit-specimen > .label { font-stretch: var(--wdth-label-tight); }',
    '.kit-specimen > .headline, .kit-specimen > .say { margin: 0; white-space: nowrap; }',
    '.kit-board { display: grid; grid-template-columns: 330px 1fr; align-items: center; column-gap: var(--s-4); row-gap: 34px; }',
    '.kit-board > .label { font-stretch: var(--wdth-label-tight); }',
    '.kit-form { display: grid; grid-template-columns: 1080px 1fr; align-items: start; }',
    '.kit-form > .counter { --cs: 170px; padding-left: var(--s-5); border-left: var(--w-rule) solid var(--c-line); min-height: 560px; }',
    '.kit-form .field > input { width: 460px; }',
    '.kit-form-controls { display: flex; flex-direction: column; align-items: flex-start; gap: 34px; }',
    '.kit-moves { display: grid; grid-template-columns: 330px 1fr; align-items: center; column-gap: var(--s-4); row-gap: 26px; }',
    '.kit-moves > .label { font-stretch: var(--wdth-label-tight); }',
    '.kit-moves .headline { margin: 0; font-size: 96px; white-space: nowrap; width: max-content; }',
    '.kit-no { position: absolute; right: 0; top: 0; bottom: 0; width: 560px; display: flex; align-items: flex-end; padding: 0 0 var(--s-6) var(--s-5); background: var(--c-accent); color: var(--c-accent-ink); }',
    '.kit-no > b { font-family: var(--f-display); font-size: 430px; font-weight: 900; font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; }',
    '.kit-score { white-space: nowrap; } .kit-score > .tag { margin-right: 14px; vertical-align: 0.2em; }',
    '.kit-aside { flex: 1 1 0; display: flex; flex-direction: column; gap: var(--s-4); justify-content: flex-end; align-self: stretch; padding-left: var(--s-6); }'
  ].join('\n');
  var style = document.createElement('style');
  style.setAttribute('data-from', 'slides/_kit.js');
  style.textContent = css;
  document.head.appendChild(style);

  /* ======================================================================
   * kit-title · layout-title
   * The stack is fitted by the theme: data-fit, a width (750px, set by the
   * layout) and data-fit-h, the height from the first cap-top to the last
   * baseline, which makes the four lines exactly as tall as the NO.
   * ==================================================================== */

  var when = String(event.date || '').split(', ');
  var room = String(event.venue || '').split(',')[0];

  kit({
    id: 'kit-title',
    title: 'Kit: title',
    layout: 'title',
    html:
      '<p class="kicker">A ' + esc(event.minutes) + '-minute workshop</p>' +
      '<h1 class="stack title-stack" data-fit data-fit-h="622.6">' +
        '<span class="ln">The most</span>' +
        '<span class="ln">valuable</span>' +
        '<span class="ln">AI skill</span>' +
        '<span class="ln">is saying</span>' +
      '</h1>' +
      '<p class="sub">Screening AI use cases<br>for real return.</p>' +
      '<p class="credit"><b>' + esc(speaker.name) + '</b><span>' + esc(speaker.role) + ', ' + esc(speaker.company) + '</span></p>' +
      '<div class="slab">' +
        '<p class="catalogue">WAYPOINT · ' + esc(event.name) + ' · 29°57.7′N 090°03.5′W</p>' +
        '<div class="mega">No</div>' +
        '<dl class="slab-fine">' +
          '<div><dt>When</dt><dd>' + esc(when[0]) + '<br>' + esc(when.slice(1).join(', ')) + '</dd></div>' +
          '<div><dt>Time</dt><dd>' + esc(event.time) + '<br>' + esc(event.minutes) + ' minutes</dd></div>' +
          '<div><dt>Room</dt><dd>' + esc(room.split(' ')[0]) + '<br>' + esc(room.split(' ').slice(1).join(' ')) + '</dd></div>' +
        '</dl>' +
      '</div>',
    notes: 'layout-title. The four-line stack is fitted to 750px and to the height of the NO. The slab is the one Flare field. The catalogue line has a fixed slot at the head of the slab.'
  });

  /* ======================================================================
   * kit-type · the inks and the type classes, each at its real size
   * ==================================================================== */

  kit({
    id: 'kit-type',
    title: 'Kit: inks and type',
    html:
      '<p class="kicker">Kit · three inks · two typefaces</p>' +
      '<div class="kit-swatches">' +
        '<div><b>Card</b><span>The ground of almost every slide. <span data-token="--c-bg"></span></span></div>' +
        '<div class="on-ink" style="background: var(--c-bg); color: var(--c-ink)"><b>Lampblack</b><span>Type, rules, shutters. <span data-token="--c-ink"></span></span></div>' +
        '<div style="background: var(--c-accent); color: var(--c-accent-ink)"><b>Flare</b><span>The point of the slide. Once. <span data-token="--c-accent"></span></span></div>' +
      '</div>' +
      '<div class="kit-specimen">' +
        '<span class="label">.headline</span><h2 class="headline">The demo is the cheap part.</h2>' +
        '<span class="label">.say</span><p class="say is-s">Let the math pick.</p>' +
        '<span class="label">.sub · .voice</span><p class="sub">Screening AI use cases for real return.</p>' +
        '<span class="label">.body</span><p class="body">Minutes are the raw material. Money is what they turn into.</p>' +
        '<span class="label">.deadpan</span><p class="deadpan">No bar to draw.</p>' +
        '<span class="label">.label</span><p class="label">Gate 3 · Effort</p>' +
        '<span class="label">.source-line</span><p class="source-line">' + SOURCE + ' · ' + esc(assumption) + '</p>' +
      '</div>',
    enter: function (ctx) {
      // the hex values are read from the tokens, not typed
      Array.prototype.forEach.call(ctx.el.querySelectorAll('[data-token]'), function (n) {
        n.textContent = T.color(n.getAttribute('data-token')).toUpperCase();
      });
    },
    notes: 'Text is Lampblack on Card, Card on Lampblack, or Lampblack on Flare. Flare is never text on Card and never a thin line on Card.'
  });

  /* ======================================================================
   * kit-statement · layout-statement, LOUD (about one slide in four)
   * A stack is a block with class "stack", data-fit, a width (the measure)
   * and one span.ln per line. Keep line lengths within about 2 : 1.
   * The punch line is Lampblack on a Flare block: class "is-punch".
   * ==================================================================== */

  kit({
    id: 'kit-statement',
    title: 'Kit: statement, loud',
    layout: 'statement',
    html:
      '<p class="kicker">Kit · layout-statement · loud</p>' +
      '<h2 class="stack" data-fit data-fit-h="812" style="width: 1088px">' +
        '<span class="ln">Your best</span>' +
        '<span class="ln">AI idea is</span>' +
        '<span class="ln">probably</span>' +
        '<span class="ln is-punch">wrong.</span>' +
      '</h2>' +
      '<div class="note">' +
        '<p class="voice is-l" data-step="1" data-anim="wipe">The boring one you didn’t pitch is probably worth thousands.</p>' +
      '</div>',
    notes: 'A fitted stack: every line is justified to the same measure on the width axis. The second half of the sentence is said quietly, in Fraunces.'
  });

  /* ======================================================================
   * kit-quiet · layout-statement, QUIET (three slides in four)
   * ==================================================================== */

  kit({
    id: 'kit-quiet',
    title: 'Kit: statement, quiet',
    layout: 'statement',
    html:
      '<p class="kicker">Kit · layout-statement · quiet</p>' +
      '<p class="say">Excitement is not a business case.</p>',
    notes: 'One line of Archivo at normal width, with a lot of empty stock. This is the default register.'
  });

  /* ======================================================================
   * kit-quote · layout-quote, and .edit-mark
   * The swap is OUR edit: the original words stay, struck through; the
   * replacement is in a different hand on a Flare block with its own flag.
   * is-above writes it over the struck words, so nothing else on the line
   * moves (use it when the struck words are on the first line). Without
   * is-above the replacement follows the struck words on the line.
   * Put data-step on the <ins>: the strike is drawn as it lands.
   * ==================================================================== */

  kit({
    id: 'kit-quote',
    title: 'Kit: quote and edit mark',
    layout: 'quote',
    html:
      '<p class="kicker">1956.</p>' +
      '<blockquote class="quote">“<span class="edit-mark is-above"><s>Information theory</s><ins data-step="1" data-anim="stamp">AI<small>our edit</small></ins></span> has, in the last few years, become something of a scientific bandwagon.”</blockquote>' +
      '<p class="attribution">Claude Shannon, The Bandwagon, 1956</p>',
    notes: 'layout-quote. Step 1 makes the edit. The only quotations allowed are the five Shannon lines in the brief, word for word, always attributed.'
  });

  /* ======================================================================
   * kit-figure · layout-figure and .counter
   * data-count-to makes the number tick up in twelve steps when it appears.
   * ==================================================================== */

  var breakEven = CM && premium ? CM.breakEvenSeconds(premium.id, hourly) : null;

  kit({
    id: 'kit-figure',
    title: 'Kit: figure',
    layout: 'figure',
    html:
      '<p class="kicker">Kit · layout-figure · .counter</p>' +
      '<h2 class="headline is-s">For one person, cost almost never says no.</h2>' +
      '<div class="counter is-mega">' +
        '<p class="counter-v"><b data-count-to="' + esc(breakEven) + '" data-count-format=",d">' + esc(breakEven) + '</b><small>seconds</small></p>' +
      '</div>' +
      '<p class="sub">what the dearest model has to save to pay for itself, at ' + esc(CM ? CM.money(hourly) : hourly) + ' an hour</p>' +
      '<p class="source-line">' + SOURCE + ' · ' + esc(premium ? premium.modelName : '') + ' at ' + esc(CM && premium ? CM.money(premium.pricePerRun) : '') + ' a run · ' + esc(assumption) + '</p>',
    notes: 'One number, one caption. The 18 is CostMath.breakEvenSeconds() at the rate in window.YOUR.rates.'
  });

  /* ======================================================================
   * kit-split · layout-split: .cols and .col. The point takes Flare.
   * ==================================================================== */

  kit({
    id: 'kit-split',
    title: 'Kit: split',
    layout: 'split',
    html:
      '<p class="kicker">Kit · layout-split · same 20 minutes saved</p>' +
      '<h2 class="headline">Does it touch the cash path?</h2>' +
      '<div class="cols">' +
        '<section class="col is-point">' +
          '<h3 class="col-title">Invoicing</h3>' +
          '<p class="body is-l is-strong">Counts twice: labor, and cash sooner.</p>' +
          '<p class="push-down">' + T.tag('example') + '</p>' +
        '</section>' +
        '<section class="col">' +
          '<h3 class="col-title">Internal memos</h3>' +
          '<p class="body is-l is-strong">Counts once. Maybe.</p>' +
        '</section>' +
      '</div>' +
      '<p class="sub">The boring idea on the cash path beats the exciting one off it.</p>',
    notes: 'Two fields that meet on a hard vertical. One of them may be the Flare field.'
  });

  /* ======================================================================
   * kit-list · layout-list: a small headline and three lines
   * ==================================================================== */

  kit({
    id: 'kit-list',
    title: 'Kit: list',
    layout: 'list',
    html:
      '<p class="kicker">Kit · layout-list · .list</p>' +
      '<h2 class="headline">Monday morning.</h2>' +
      '<ol class="list is-l">' +
        '<li>Inventory two weeks.</li>' +
        '<li data-step="1">Run three through the gates.</li>' +
        '<li data-step="2">Say no twice.</li>' +
      '</ol>',
    notes: 'Three lines at most. Rows cut in: small type never animates.'
  });

  /* ======================================================================
   * kit-beats · .beats: a path of numbered steps
   * ==================================================================== */

  kit({
    id: 'kit-beats',
    title: 'Kit: beats',
    layout: 'list',
    html:
      '<p class="kicker">Kit · .beats</p>' +
      '<h2 class="headline">In the next ' + esc(event.minutes) + ' minutes</h2>' +
      '<ol class="beats">' +
        '<li>Inventory two weeks of real work</li>' +
        '<li>Pick three</li>' +
        '<li>Four gates</li>' +
        '<li>The math picks</li>' +
        '<li class="is-point">Build the winner</li>' +
      '</ol>' +
      '<p class="sub push-down">You leave with one use case worth doing, and two you can stop thinking about.</p>',
    notes: 'The path of the session. The last beat is the point.'
  });

  /* ======================================================================
   * kit-ladder · .ladder: the first item is the bottom rung
   * ==================================================================== */

  function perRun(id) {
    var t = tierById(id);
    if (!CM || !t || t.missing) { return ''; }
    return '<span>' + esc(CM.money(t.pricePerRun)) + ' a run</span>';            // CM.money(0) already reads "about"
  }

  kit({
    id: 'kit-ladder',
    title: 'Kit: ladder',
    layout: 'split',
    html:
      '<p class="kicker">Kit · .ladder</p>' +
      '<h2 class="headline">Climb only as far as the task makes you.</h2>' +
      '<div class="row is-top grow">' +
        '<ol class="ladder">' +
          '<li>Don’t automate</li>' +
          '<li>Spreadsheet formula</li>' +
          '<li class="is-here">Plain code ' + perRun('code') + '</li>' +
          '<li>Small model ' + perRun('small') + '</li>' +
          '<li>Frontier model ' + perRun('frontier') + '</li>' +
          '<li>Agent</li>' +
        '</ol>' +
        '<div class="kit-aside">' +
          '<p class="voice is-l">Use the expensive model once, to write the tool. Then the tool runs for free.</p>' +
        '</div>' +
      '</div>' +
      '<p class="source-line">' + SOURCE + ' · ' + esc(assumption) + '</p>',
    notes: 'The ladder of tools. is-here marks the rung you stop on. Prices are CostMath.tiers().'
  });

  /* ======================================================================
   * kit-gates · the dock
   * State is a class on .gate (is-shut, is-pass, is-no); the words PASS and
   * NO are printed by the stylesheet. Changing the class plays the move.
   * GATE LOGIC: after a NO, every later gate stays idle (NOT YET).
   * This dock is 1832px wide (the stage right of the spine) and sits on the
   * bottom edge, so the NO shutter runs off the stage.
   * ==================================================================== */

  var QUESTIONS = [
    'What does it cost to run?',
    'What comes back: cash sooner, or more work done?',
    'What does it take to build it and keep it alive?',
    'If it works, how far does it grow?'
  ];

  function gateHtml(i) {
    return '<article class="gate" data-gate="' + (i + 1) + '">' +
      '<i class="gate-shutter"></i>' +
      '<p class="gate-n">Gate ' + (i + 1) + '</p>' +
      '<h3 class="gate-name">' + T.gates[i] + '</h3>' +
      '<p class="gate-q">' + QUESTIONS[i] + '</p>' +
      '<p class="gate-why"></p>' +
    '</article>';
  }

  /* what each step of the kit slide shows: [gate 1, gate 2, gate 3, gate 4] */
  var GATE_STEPS = [
    ['', '', '', ''],
    ['is-shut', '', '', ''],
    ['is-pass', 'is-shut', '', ''],
    ['is-pass', 'is-no', '', ''],
    ['is-pass', 'is-no is-flare', '', '']
  ];
  var GATE_WHY = { 'is-pass': 'carried forward', 'is-no': 'Example: never pays back' };

  function setGates(el, step) {
    var states = GATE_STEPS[Math.max(0, Math.min(GATE_STEPS.length - 1, step))];
    Array.prototype.forEach.call(el.querySelectorAll('.gate'), function (gate, i) {
      var want = states[i] ? states[i].split(' ') : [];
      ['is-shut', 'is-pass', 'is-no', 'is-flare'].forEach(function (c) { gate.classList.toggle(c, want.indexOf(c) !== -1); });
      gate.querySelector('.gate-why').textContent = GATE_WHY[want[0]] || '';
    });
  }

  kit({
    id: 'kit-gates',
    title: 'Kit: the dock',
    steps: GATE_STEPS.length - 1,
    html:
      '<h2 class="headline">The four gates</h2>' +
      '<p class="deadpan" style="bottom: auto; top: 62px">Any no ends it.</p>' +
      '<div class="dock bleed-l bleed-r bleed-b" style="--gh: 800px">' +
        [0, 1, 2, 3].map(gateHtml).join('') +
      '</div>',
    enter: function (ctx) { setGates(ctx.el, ctx.step); },
    step: function (ctx, n) { setGates(ctx.el, n); },
    notes: 'Step 1: the first gate shuts (it is being examined). Step 2: it lifts, PASS, and the next one shuts. Step 3: NO. The bay is held vacant for 0.8s, the shutter drops through the floor, and the reason cuts in 0.9s later. Gates 3 and 4 stay NOT YET. Step 4 adds is-flare: only for a NO that is the point of its slide.'
  });

  /* ======================================================================
   * kit-marks · the small pieces: gate strip, small gates, verdicts, tags,
   * the YOUR NUMBER slot
   * ==================================================================== */

  kit({
    id: 'kit-marks',
    title: 'Kit: marks and tags',
    html:
      '<p class="kicker">Kit · marks and tags</p>' +
      T.gateStrip({ now: 3, states: ['pass', 'pass'] }) +
      '<div class="kit-board" style="margin-top: 26px">' +
        '<span class="label">.gate.is-s</span>' +
        '<div class="dock is-still">' +
          '<article class="gate is-s"><i class="gate-shutter"></i><h3 class="gate-name">Not yet</h3></article>' +
          '<article class="gate is-s is-shut"><i class="gate-shutter"></i><h3 class="gate-name">Now</h3></article>' +
          '<article class="gate is-s is-pass"><i class="gate-shutter"></i><h3 class="gate-name">Cost</h3></article>' +
          '<article class="gate is-s is-no"><i class="gate-shutter"></i><h3 class="gate-name">Effort</h3></article>' +
        '</div>' +
        '<span class="label">.verdict</span>' +
        '<div class="row">' + T.verdict('pass') + T.verdict('no') + T.verdict('notyet') +
          '<span class="row" style="margin-left: var(--s-6); gap: 14px"><i class="gate-glyph is-pass"></i><span class="label is-tight">Pass</span>' +
          '<i class="gate-glyph is-no" style="margin-left: 28px"></i><span class="label is-tight">No</span>' +
          '<i class="gate-glyph" style="margin-left: 28px"></i><span class="label is-tight">Not yet</span></span></div>' +
        '<span class="label">.tag</span>' +
        '<div class="row is-wrap" style="row-gap: 18px">' + T.tag('example') + T.tag('synthetic') + T.tag('laborde') + T.tag('estimated') + T.tag('recreation') + '</div>' +
        '<span class="label">.slot-yours</span>' +
        '<div class="row">' + T.slot() + '<p class="body" style="max-width: 900px">A value the speaker has not supplied. Never an invented figure.</p></div>' +
      '</div>',
    notes: 'NO is a solid block. PASS is a hollow frame with a raised lintel. NOT YET is the frame alone. The gate strip (top right) goes on every slide that belongs to a gate: THEME.gateStrip({ now: 3, states: ["pass", "pass"] }).'
  });

  /* ======================================================================
   * kit-chart · layout-chart, drawn with the canvas kit
   * A scene is the right home for a chart. This one uses THEME.draw for
   * every mark, so it looks drawn by the same hand as the rest.
   *   - bars are linear, zero-based and to scale: the sliver stays a sliver
   *   - the axis rule is broken beside the sliver, and one callout points at it
   *   - the multiple is tied to its two bars with the sum and a bracket
   *   - bars grow at ONE speed in px per second (THEME.motion.barSpeed)
   * ==================================================================== */

  window.Scenes.define('kit-bars', function (host, opts, api) {
    var canvas = document.createElement('canvas');
    host.appendChild(canvas);
    var fit = null;
    var stop = null;
    var startedAt = null;
    var rows = tiers.filter(function (t) { return t.id !== 'code' && !t.missing; }).map(function (t) {
      return { name: t.modelName, cost: CM.volumeCost(t.pricePerRun, VOLUME), estimated: t.estimated };
    });
    var max = rows.reduce(function (m, r) { return Math.max(m, r.cost); }, 0);
    var min = rows.reduce(function (m, r) { return Math.min(m, r.cost); }, Infinity);

    function layout() {
      var axisX = 430;
      var rowH = Math.min(96, Math.floor((fit.height - 12) / rows.length) - 16);
      var pitch = Math.floor((fit.height - 12) / rows.length);
      return { axisX: axisX, rowH: rowH, pitch: pitch, top: 6 + (pitch - rowH) / 2, maxW: fit.width - axisX - 3 };
    }

    function draw(t) {
      if (!fit) { return; }
      var ctx = fit.ctx;
      var L = layout();
      T.draw.clear(ctx, fit.width, fit.height);
      var grown = t == null ? Infinity : t * T.motion.barSpeed;        // px every bar has had time to grow
      var allDone = true;
      rows.forEach(function (r, i) {
        var y = L.top + i * L.pitch;
        var full = r.cost / max * L.maxW;
        var w = Math.min(full, grown);
        var done = w >= full;
        if (!done) { allDone = false; }
        T.draw.label(ctx, r.name, 0, y + L.rowH / 2, { kind: 'strong', size: 40, baseline: 'middle' });
        var last = i === rows.length - 1;
        // the value cuts in when its bar stops
        T.draw.bar(ctx, L.axisX + 3, y, w, L.rowH, { value: done ? CM.money(r.cost) : null, inside: last });
      });
      // one axis rule, broken beside the sliver so it stays a visible object
      T.draw.axis(ctx, L.axisX, 0, L.axisX, fit.height, { gap: [0, (L.top + L.rowH + 10) / fit.height] });
      if (allDone) {
        var y0 = L.top + L.rowH / 2;
        var yN = L.top + (rows.length - 1) * L.pitch - 18;
        var sliver = min / max * L.maxW;
        // the deadpan line, pointing at the sliver
        T.draw.callout(ctx, 'the whole bar.', L.axisX + 330, y0, L.axisX + 3 + sliver + 180, y0, { size: 54 });
        // the multiple, tied to the two bars it compares
        var bx = fit.width - 56;
        T.draw.bracket(ctx, bx - 520, y0, yN, { depth: -30 });
        T.draw.label(ctx, CM.money(max) + ' ÷ ' + CM.money(min) + ' =', bx, L.top + L.pitch - 8, { align: 'right', baseline: 'top' });
        T.draw.label(ctx, CM.ratio(max / min), bx, L.top + L.pitch + 52, { kind: 'num', size: 230, align: 'right', baseline: 'top' });
      }
      return allDone;
    }

    function play() {
      halt();
      startedAt = M.now();
      stop = M.raf(function () {
        if (draw(M.now() - startedAt)) { halt(); }
      });
    }
    function halt() { if (stop) { stop(); stop = null; } }

    function resize() { fit = api.fitCanvas(canvas); draw(startedAt == null ? null : M.now() - startedAt); }

    fit = api.fitCanvas(canvas);
    T.whenReady(function () { if (fit) { if (api.mode.print) { draw(null); } else { play(); } } });

    return {
      step: function (n, dir) { if (dir > 0 && n === 0) { play(); } },
      resize: resize,
      destroy: function () { halt(); fit = null; }
    };
  });

  /* CostMath.money(0) reads "about $0": the hedge is said in the voice, the figure in numerals */
  function zeroHtml() {
    var parts = String(CM ? CM.money(0) : '').split(' ');
    var figure = parts.pop();
    return (parts.length ? '<span class="voice is-l" style="margin-left: 196px">' + esc(parts.join(' ')) + '</span>' : '') +
      '<span class="band-v"' + (parts.length ? ' style="margin-left: -24px"' : '') + '>' + esc(figure) + '</span>';
  }

  kit({
    id: 'kit-chart',
    title: 'Kit: chart',
    layout: 'chart',
    html:
      '<p class="kicker">Kit · layout-chart · THEME.draw</p>' +
      '<h2 class="headline">' + esc(CM ? CM.number(VOLUME) : VOLUME) + ' records. Same task.</h2>' +
      '<p class="label is-tight axis-note">Cost to run the whole batch · US dollars · bars drawn to scale</p>' +
      '<div class="plot scene" data-scene="kit-bars"></div>' +
      '<div class="band"><b class="band-name">Plain code</b>' + zeroHtml() + '</div>' +
      '<p class="source-line">' + SOURCE + ' · ' + esc(assumption) + '</p>',
    notes: 'The chart leads: the headline is 108px, not 150. Every mark is THEME.draw.*. The bars are drawn to scale, so the cheapest one is a sliver, and the sliver is the chart.'
  });

  /* ======================================================================
   * kit-draw · layout-scene: the canvas drawing kit on one sheet
   * ==================================================================== */

  window.Scenes.define('kit-draw', function (host, opts, api) {
    var canvas = document.createElement('canvas');
    host.appendChild(canvas);
    var fit = null;

    function draw() {
      if (!fit) { return; }
      var ctx = fit.ctx;
      var d = T.draw;
      var X = 40;                                  // the scene starts at the spine: 40 = the content margin
      d.clear(ctx, fit.width, fit.height);

      function title(text, x, y) { d.label(ctx, text, x, y, { size: 32, baseline: 'top' }); }

      // ---- gates in every state
      title('draw.gate', X, 140);
      var gw = 236, gh = 330, gy = 196;
      d.gate(ctx, X, gy, gw, gh, 'idle', 1, { name: 'Cost', number: 1 });
      d.gate(ctx, X + (gw - 6), gy, gw, gh, 'shut', 1, { name: 'Return', number: 2 });
      d.gate(ctx, X + (gw - 6) * 2, gy, gw, gh, 'pass', 1, { name: 'Effort', number: 3 });
      d.gate(ctx, X + (gw - 6) * 3, gy, gw, gh, 'no', 1, { name: 'Potential', number: 4 });

      // ---- verdicts and tags
      title('draw.verdict · draw.tag', X, 600);
      var vx = X;
      vx += d.verdict(ctx, vx, 654, 'pass').w + 20;
      vx += d.verdict(ctx, vx, 654, 'no').w + 20;
      vx += d.verdict(ctx, vx, 654, 'notyet').w + 44;
      d.tag(ctx, T.tags.estimated, vx, 658, { kind: 'estimated' });
      var tx = X;
      tx += d.tag(ctx, T.tags.example, tx, 744, { kind: 'example' }).w + 18;
      tx += d.tag(ctx, T.tags.synthetic, tx, 744, { kind: 'synthetic' }).w + 18;
      d.tag(ctx, T.tags.laborde, X, 820, { kind: 'laborde' });

      // ---- heat: size first, ink second
      title('THEME.heat · heatRadius · draw.dot', X, 922);
      for (var i = 0; i <= 10; i++) {
        var v = i / 10;
        d.dot(ctx, X + 20 + i * 56, 1000, T.heatRadius(v, 5, 22), { fill: T.heat(v) });
      }
      d.dot(ctx, X + 20 + 11 * 56 + 16, 1000, 22, { kind: 'point' });
      d.dot(ctx, X + 20 + 12 * 56 + 40, 1000, 20, { kind: 'hollow' });
      d.dot(ctx, X + 20 + 13 * 56 + 56, 1000, 20, { kind: 'ringed' });

      // ---- a small plot: axis, gridlines, bars in three patterns, one callout
      var px = 1060, py = 196, pw = 716, ph = 330;
      title('draw.axis · bar · callout', px, 140);
      d.gridlines(ctx, px, py, pw, ph, { ys: [0.5, 1] });
      var bw = 120, gap = 44, bx = px + 30;
      d.bar(ctx, bx, py + ph - ph * 0.92, bw, ph * 0.92, { pattern: 'hollow' });
      d.bar(ctx, bx + (bw + gap), py + ph - ph * 0.62, bw, ph * 0.62, { pattern: 'hatch' });
      d.bar(ctx, bx + (bw + gap) * 2, py + ph - ph * 0.36, bw, ph * 0.36);
      d.axis(ctx, px, py + ph, px + pw, py + ph, {
        tickSize: 28, tickKind: 'small',
        ticks: [{ at: (30 + bw / 2) / pw, label: 'hollow' }, { at: (30 + bw + gap + bw / 2) / pw, label: 'hatch' }, { at: (30 + (bw + gap) * 2 + bw / 2) / pw, label: 'solid' }]
      });
      d.callout(ctx, 'Drawn to scale.', px + pw - 4, py + ph * 0.2, bx + (bw + gap) * 2 + bw / 2, py + ph - ph * 0.36 - 12, { align: 'right', elbow: true });

      // ---- the rest of the hand
      title('draw.slot · total · hatch', px, 660);
      d.slot(ctx, px, 716, 390, 112);
      var box = d.label(ctx, CM ? CM.money(CM.volumeCost(tierById('frontier').pricePerRun, VOLUME)) : '', px + 440, 722, { kind: 'num', size: 120, baseline: 'top' });
      d.total(ctx, box.x, 722 + 120 * 0.688 + 16, box.w);
      d.hatch(ctx, px, 880, 390, 72);
      d.arrow(ctx, px + 440, 916, px + pw, 916);
    }

    function resize() { fit = api.fitCanvas(canvas); draw(); }
    fit = api.fitCanvas(canvas);
    T.whenReady(draw);
    return { resize: resize, destroy: function () { fit = null; } };
  });

  kit({
    id: 'kit-draw',
    title: 'Kit: the canvas drawing kit',
    layout: 'scene',
    html:
      '<div class="scene" data-scene="kit-draw"></div>' +
      '<p class="kicker">Kit · layout-scene · THEME.draw</p>' +
      T.tag('illustration'),
    notes: 'Everything on this slide is drawn on one canvas with THEME.draw, in stage pixels. The kicker and the tag are DOM, laid over the scene.'
  });

  /* ======================================================================
   * kit-table · layout-table: .table
   * ==================================================================== */

  function tierRow(t) {
    var label = String(t.label).replace(/"([^"]*)"/g, '“$1”');
    var score = t.overallScore == null ? '' :
      (t.estimated ? T.tag('estimated').replace('class="tag', 'class="tag is-s') + ' ' : '') + '<b>' + esc(CM.roundTo(t.overallScore, 1)) + '</b>';
    return '<tr' + (t.id === 'code' ? ' class="is-point"' : '') + '>' +
      '<td>' + esc(label) + '</td>' +
      '<td>' + (t.modelName ? esc(t.modelName) : 'no model') + '</td>' +
      '<td class="is-num kit-score">' + score + '</td>' +
      '<td class="is-num">' + esc(CM.money(t.pricePerRun)) + '</td>' +
      '<td class="is-num">' + esc(CM.money(t.per100000)) + '</td>' +
    '</tr>';
  }

  kit({
    id: 'kit-table',
    title: 'Kit: table',
    layout: 'table',
    html:
      '<p class="kicker">Kit · layout-table · .table</p>' +
      '<h2 class="headline">What one run costs.</h2>' +
      '<table class="table">' +
        '<thead><tr><th>Tier</th><th>Stands in for it</th><th class="is-num">Overall score</th><th class="is-num">Per run</th><th class="is-num">Per ' + esc(CM ? CM.number(VOLUME) : VOLUME) + '</th></tr></thead>' +
        '<tbody>' + tiers.filter(function (t) { return !t.missing; }).map(tierRow).join('') + '</tbody>' +
      '</table>' +
      '<p class="source-line">' + SOURCE + ' · ' + esc(assumption) + ' · model names are data, not endorsements</p>',
    notes: 'A table has one 6px rule under the head and 3px rules between rows. The row that is the point takes the Flare band. Figures are CostMath.tiers().'
  });

  /* ======================================================================
   * kit-pair · .pair: before to after
   * The Laborde figures are read from window.YOUR.slotting.results and
   * carry the "Laborde results" tag. Never mix them with synthetic numbers.
   * ==================================================================== */

  var R = (Y.slotting && Y.slotting.results) || {};

  function pair(what, before, after, unit, note, point) {
    return '<div class="pair' + (point ? ' is-point' : '') + '">' +
      '<p class="pair-what">' + what + '</p>' +
      '<p class="pair-v is-before"><span class="label">As-is move</span><b>' + esc(before) + '</b><small>' + unit + '</small></p>' +
      '<i class="pair-arrow"></i>' +
      '<p class="pair-v is-after"><span class="label">Optimized</span><b>' + esc(after) + '</b><small>' + unit + '</small></p>' +
      (note ? '<p class="pair-note">' + note + '</p>' : '') +
    '</div>';
  }

  kit({
    id: 'kit-pair',
    title: 'Kit: before to after',
    layout: 'chart',
    html:
      '<p class="kicker">Kit · .pair</p>' +
      '<h2 class="headline">The real numbers.</h2>' +
      '<p style="position: absolute; right: var(--m-right); top: 112px">' + T.tag('laborde') + '</p>' +
      '<div class="col-stack" style="gap: 0">' +
        pair('Walk per pick run', R.walkFtAsIs, R.walkFtOptimized, 'ft', esc(R.walkPctLess) + '% less') +
        pair('Pick time per year', R.pickHoursAsIs, R.pickHoursOptimized, 'hours', esc(Number(R.pickTimePctLess).toFixed(1)) + '% less', true) +
        pair('Picks that need a ladder', R.ladderPctAsIs, R.ladderPctOptimized, '%', '') +
        pair('Fast movers in the golden zone', R.goldenPctAsIs, R.goldenPctOptimized, '%', '') +
      '</div>' +
      '<p class="source-line">Laborde results, ' + esc(R.asOf) + ' · versus moving every part in its current order · pick times are placeholders pending a floor time study</p>',
    notes: 'Before and after are the same size and weight: the comparison is in the numbers. The pair that is the point takes the Flare block.'
  });

  /* ======================================================================
   * kit-exercise · layout-exercise: headline, prompts, the big timer
   * T starts and pauses the timer, R resets it.
   * ==================================================================== */

  kit({
    id: 'kit-exercise',
    title: 'Kit: exercise',
    layout: 'exercise',
    html:
      '<p class="kicker">Exercise 1 · 10 minutes</p>' +
      '<h2 class="headline">Inventory two weeks of real work.</h2>' +
      '<div class="exercise">' +
        '<ul class="prompts">' +
          '<li>What did you do more than twice?</li>' +
          '<li>What did you copy from one place to another?</li>' +
          '<li>What did you wait on?</li>' +
          '<li>What did you dread?</li>' +
        '</ul>' +
        '<div class="scene timer-host" data-scene="timer" data-opts=\'{"minutes": 10}\'></div>' +
      '</div>',
    notes: 'layout-exercise. The timer is the engine’s timer scene, restyled: T starts and pauses, R resets. In the last minute it turns into a Flare block.'
  });

  /* ======================================================================
   * kit-controls · the controls, in a form that works
   * Every control is 72px tall. Put data-keys="own" on real text fields
   * only, so the clicker keeps working everywhere else.
   * ==================================================================== */

  kit({
    id: 'kit-controls',
    title: 'Kit: controls',
    html:
      '<p class="kicker">Kit · controls · try them</p>' +
      '<h2 class="headline">A minute a week is <span data-out="rule"></span> a year.</h2>' +
      '<div class="kit-form">' +
        '<div class="kit-form-controls">' +
          '<label class="slider"><span class="label">Loaded hourly rate</span>' +
            '<input type="range" min="15" max="120" step="5" data-in="rate"><output data-out="rate"></output></label>' +
          '<div class="row"><span class="label">Minutes saved a week</span>' +
            '<div class="stepper"><button type="button" data-do="less" aria-label="less">−</button><output data-out="minutes"></output><button type="button" data-do="more" aria-label="more">+</button></div></div>' +
          '<div class="row"><div class="seg" role="group" aria-label="Lens">' +
            '<button type="button" data-lens="product" aria-pressed="true">Product</button><button type="button" data-lens="service" aria-pressed="false">Service</button></div>' +
            '<button type="button" class="chip" data-do="cash" aria-pressed="false">On the cash path</button></div>' +
          '<div class="row" style="align-items: flex-end"><label class="field"><span class="label">Name the task</span>' +
            '<input type="text" value="Invoice follow-up" data-keys="own" data-in="task"></label>' +
            '<button type="button" class="btn" data-do="reset">Reset</button><button type="button" class="btn is-ghost" data-do="reset">Ghost</button></div>' +
        '</div>' +
        '<div class="counter">' +
          '<p class="label" data-out="task"></p>' +
          '<p class="counter-v"><b data-out="value"></b><small>a year</small></p>' +
          '<p class="voice" data-out="lens"></p>' +
        '</div>' +
      '</div>' +
      '<p class="source-line"><span data-out="formula"></span> · ' + T.tags.example + '</p>',
    enter: function (ctx) {
      var el = ctx.el;
      var q = function (sel) { return el.querySelector(sel); };
      var weeks = rates.workWeeks;
      var start = { rate: hourly, minutes: 20, lens: 'product', cash: false, task: 'Invoice follow-up' };
      var s = {};
      var rateIn = q('[data-in="rate"]');
      var taskIn = q('[data-in="task"]');

      function render() {
        var perMinute = G.minuteRule(s.rate, weeks);                 // dollars a year for one minute a week
        q('[data-out="rule"]').textContent = CM.money(perMinute);
        q('[data-out="rate"]').textContent = CM.money(s.rate);
        q('[data-out="minutes"]').textContent = s.minutes;
        q('[data-out="value"]').textContent = CM.money(perMinute * s.minutes);
        q('[data-out="task"]').textContent = s.task || 'Your task';
        q('[data-out="lens"]').textContent = (s.lens === 'service' ? 'Service side: capacity.' : 'Product side: the cash cycle.') + (s.cash ? ' On the cash path.' : '');
        q('[data-out="formula"]').textContent = s.minutes + ' min × ' + weeks + ' weeks × ' + CM.money(s.rate) + ' ÷ 60';
        Array.prototype.forEach.call(el.querySelectorAll('[data-lens]'), function (b) {
          b.setAttribute('aria-pressed', b.getAttribute('data-lens') === s.lens ? 'true' : 'false');
        });
        q('[data-do="cash"]').setAttribute('aria-pressed', s.cash ? 'true' : 'false');
      }
      function reset() {
        s = { rate: start.rate, minutes: start.minutes, lens: start.lens, cash: start.cash, task: start.task };
        rateIn.value = s.rate;
        taskIn.value = s.task;
        T.fillRange(rateIn);
        render();
      }
      rateIn.addEventListener('input', function () { s.rate = Number(rateIn.value); render(); });
      taskIn.addEventListener('input', function () { s.task = taskIn.value; render(); });
      el.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b) { return; }
        var act = b.getAttribute('data-do');
        if (act === 'less') { s.minutes = Math.max(1, s.minutes - 1); }
        else if (act === 'more') { s.minutes = Math.min(600, s.minutes + 1); }
        else if (act === 'cash') { s.cash = !s.cash; }
        else if (act === 'reset') { reset(); return; }
        else if (b.hasAttribute('data-lens')) { s.lens = b.getAttribute('data-lens'); }
        render();
      });
      reset();
    },
    notes: 'A working form. The slider, stepper, segmented control, chip, field and button are the kit’s controls. The figure is Gates.minuteRule(rate, weeks) times the minutes.'
  });

  /* ======================================================================
   * kit-motion · the five reveals, a counter, and how a NO lands
   * ==================================================================== */

  kit({
    id: 'kit-motion',
    title: 'Kit: motion',
    steps: 6,
    html:
      '<p class="kicker">Kit · motion · press → six times</p>' +
      '<div class="kit-moves" style="width: 1190px">' +
        '<span class="label">(none) · cut</span><p class="body is-l is-strong" data-step="1">Small type never animates.</p>' +
        '<span class="label">pop · block</span><h2 class="headline" data-step="2" data-anim="pop">Behind a block.</h2>' +
        '<span class="label">wipe · voice</span><p class="voice is-l" data-step="3" data-anim="wipe">The quiet half of the sentence.</p>' +
        '<span class="label">rise · lift</span><div data-step="4" data-anim="rise" style="width: max-content"><span class="plate" style="font: 900 96px/0.708 var(--f-display); font-stretch: 62%; text-transform: uppercase; padding: 20px 26px">A shutter goes up</span></div>' +
        '<span class="label">count · tick</span><p class="counter-v" data-step="5" style="font-size: 150px"><b data-count-to="' + esc(CM && tiers.length ? CM.volumeCost(premium.pricePerRun, VOLUME) : 0) + '" data-count-format="$,d"></b></p>' +
        '<span class="label">stamp · drop</span><p class="body is-l is-strong">Then nothing moves for two beats.</p>' +
      '</div>' +
      '<div class="kit-no no-jolt" data-step="6" data-anim="stamp"><b>No</b></div>',
    step: function (ctx, n, dir) {
      // the NO has finished dropping three sixteenths after the step: that is the impact
      if (n === 6 && dir > 0) {
        M.tween({ from: 0, to: 1, duration: T.motion.dur.drop, onDone: function () { T.landNo(ctx.el); } });
      }
    },
    notes: 'One step per move. Step 6 drops the NO: on impact the slide recoils 14px and prints in negative for two beats (THEME.landNo), then cuts back.'
  });

  /* ======================================================================
   * kit-ink · a Lampblack slide. RATIONED: the cold open and a hero moment
   * or two. Write layout: 'statement on-ink' and everything on the slide
   * swaps inks. The note beside the stack takes class "on-card".
   * ==================================================================== */

  kit({
    id: 'kit-ink',
    title: 'Kit: a Lampblack slide',
    layout: 'statement on-ink',
    html:
      '<p class="kicker">Kit · on-ink · rationed</p>' +
      '<h2 class="stack" data-fit data-fit-h="812" style="width: 1088px">' +
        '<span class="ln">Your best</span>' +
        '<span class="ln">AI idea is</span>' +
        '<span class="ln">probably</span>' +
        '<span class="ln is-punch">wrong.</span>' +
      '</h2>' +
      '<div class="note on-card" style="top: 316px">' +
        '<p class="voice is-l push-down">The boring one you didn’t pitch is probably</p>' +
        '<p class="stack" data-fit data-fit-gap="18" style="width: 548px; margin-top: 28px"><span class="ln">worth</span><span class="ln">thousands.</span></p>' +
      '</div>',
    notes: 'The same statement on Lampblack. The punch is still Lampblack on a Flare block, never Flare type. Use a dark slide a handful of times in the whole deck: the room is lit.'
  });
}());
