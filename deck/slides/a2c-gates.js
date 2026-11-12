/*
 * slides/a2c-gates.js: Act 2, The Four Gates, after the three cost slides.
 *
 *   tool-ladder           1 min     six rungs; use the expensive model once
 *   gate-return-cash      1.5 min   the cash conversion cycle as a timeline of days
 *   gate-return-capacity  1.5 min   freed hours, and the slider that decides what they become
 *   cash-path             1 min     the same 20 minutes, counted twice or once
 *   gate-effort           1 min     build, roll out, and the part that never ends
 *   gate-potential        1 min     one site to three, one team to every team
 *   the-math              1 min     the scorecard, the $25 rule, the house rules
 *
 * EVERY NUMBER ON THESE SLIDES IS COMPUTED when the deck loads:
 *   - the example day counts, hours and margin come from window.YOUR.examples
 *   - the rates, the example company and the house rules come from
 *     Gates.defaultAssumptions() (window.YOUR laid over the built-in defaults)
 *   - cash per day is Gates.cashPerDay(), the $25 rule is Gates.minuteRule(),
 *     the capacity figure is Gates.evaluate(), the house-rule sentences are
 *     the `rule` text Gates.evaluate() returns, and money is written by CostMath.
 * Change a value in content/your-numbers.js and these slides change with it.
 *
 * The html of each slide is the whole picture at every step (data-step and
 * the slide's data-current-step do the stepping), so the overview, the
 * presenter view and the PDF are right without running a scene. Motion that
 * needs JavaScript is in scenes/gates.js and scenes/cash.js.
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var T = window.THEME || null;
  var G = window.Gates || null;
  var CM = window.CostMath || null;
  var Y = window.YOUR || {};
  var S = window.GateScenes || {};
  var CASH = window.CashScenes || {};
  var esc = S.esc || function (s) { return String(s == null ? '' : s); };

  var A = G ? G.defaultAssumptions() : { rates: {}, company: {}, houseRules: {} };
  var BAR_SPEED = (S.barSpeed ? S.barSpeed() : 900);     // px per second: bars grow at one speed

  function strip(now) { return T ? T.gateStrip({ now: now }) : ''; }
  function tag(kind, text) { return T ? T.tag(kind, text) : '<span class="tag">' + esc(text || kind) + '</span>'; }
  function slot(text) { return T ? T.slot(text) : '<span class="slot-yours">' + esc(text || 'Your number') + '</span>'; }
  function money(x) { return CM ? CM.money(x) : String(x); }
  function num(x) { return CM ? CM.number(x) : String(x); }
  function tidy(x) { return CM ? CM.tidy(x) : x; }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function usable(x) { return typeof x === 'number' && isFinite(x) && x >= 0; }

  /* a slide entered at a later step (stepping back into it) is shown built, not building */
  var arrive = S.arrive || function () {};
  var moved = S.moved || function () {};

  /* ======================================================================
   * Styles for these slides: scoped by class, tokens only
   * ==================================================================== */

  var css = [
    '.slide.is-static [data-scene].a2-live::after { content: none; }',
    /* a slide entered already built (see GateScenes.arrive): no entrance builds, no delayed reveals */
    '.a2-settled .a2-build { animation: none !important; }',
    '.a2-arrived :is([data-step], [data-step-only], [data-step-out]) { transition: none !important; }',
    '@keyframes a2-grow { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }',
    /* a block that grows from the left at the bar speed when its step arrives */
    '.slide .a2-grow[data-step]:not(.is-visible) { clip-path: inset(0 100% 0 0); }',
    '.slide .a2-grow[data-step].is-visible { clip-path: inset(0 0 0 0); transition: clip-path var(--grow, 500ms) linear var(--delay), visibility 0s linear var(--delay); }',
    /* two values, one shown: the hidden one takes no room */
    '.a2-swap > [data-step]:not(.is-visible), .a2-swap > [data-step-out]:not(.is-visible) { display: none; }',
    /* a headline under the gate strip starts clear of the strip's pointer */
    '.slide > .headline.a2-under-strip { margin-top: calc((var(--lh-cap) - var(--lh)) * 0.5em + 16px); }',

    /* ---------------- tool-ladder ---------------- */
    '.tl-stage { position: relative; flex: 1 1 0; min-height: 0; display: flex; align-items: flex-start; }',
    '.tl-ladder { --rung: 104px; width: 780px; flex: none; }',
    '.tl-ladder > li.a2-build { animation: cut-in var(--at) steps(1, end) backwards; }',
    '.slide:not([data-current-step="0"]) .tl-ladder > .tl-frontier { background: var(--c-ink); color: var(--c-bg); }',
    '.slide:not([data-current-step="0"]) .tl-ladder > .tl-code { background: var(--c-accent); color: var(--c-accent-ink); }',
    '.tl-side { position: relative; flex: 1 1 0; align-self: stretch; }',
    '.tl-elbow { position: absolute; left: 0; top: 136px; width: 96px; height: 248px; overflow: visible; }',
    '.tl-elbow path { fill: none; stroke: var(--c-ink); stroke-width: var(--w-bold); stroke-linejoin: miter; }',
    '.tl-elbow polygon { fill: var(--c-ink); }',
    '.tl-once, .tl-then { position: absolute; left: 124px; margin: 0; line-height: 1.1; }',
    '.tl-once { top: 96px; white-space: nowrap; }',
    '.tl-then { top: 334px; white-space: nowrap; }',

    /* ---------------- gate-return-cash ---------------- */
    '.cc-note { display: flex; align-items: center; gap: var(--s-3); margin: -8px 0 20px; }',
    '.cc-chart { position: relative; flex: none; height: 244px; --cc-row: 104px; }',
    '.cc-chart::before { content: ""; position: absolute; left: 0; top: 0; width: var(--w-rule); height: 100%; background: var(--c-line); }',
    '.cc-sweep { position: absolute; left: var(--w-rule); top: 0; right: 0; bottom: 0; }',
    '.cc-sweep.a2-build { animation: a2-grow var(--grow) linear var(--at) backwards; }',
    '.cc-bar { position: absolute; height: var(--cc-row); display: flex; align-items: center; justify-content: space-between; gap: 16px;',
    '  padding: 0 18px 0 22px; background: var(--c-ink); color: var(--c-bg); overflow: hidden; white-space: nowrap;',
    '  transition: width var(--d-fast) var(--e-out); }',
    '.cc-bar.is-inv { left: 0; top: 12px; width: calc(var(--cc-day) * var(--cc-dio) - 6px); }',
    '.cc-bar.is-col { left: calc(var(--cc-day) * var(--cc-dio)); top: 12px; width: calc(var(--cc-day) * var(--cc-dso)); }',
    '.cc-bar.is-pay { left: 0; top: 128px; width: calc(var(--cc-day) * var(--cc-dpo) - 6px); background: transparent; color: var(--c-ink); border: var(--w-rule) solid var(--c-ink); padding: 0 12px 0 16px; }',
    '.cc-bar.is-ccc { left: calc(var(--cc-day) * var(--cc-dpo)); top: 128px; width: calc(var(--cc-day) * var(--cc-ccc)); }',
    '.slide:not([data-current-step="0"]) .cc-bar.is-col { width: calc(var(--cc-day) * (var(--cc-dso) - 1)); }',
    '.slide:not([data-current-step="0"]) .cc-bar.is-ccc { width: calc(var(--cc-day) * (var(--cc-ccc) - 1)); }',
    '.cc-bar > .label { font-size: var(--t-label); }',
    '.cc-bar > b { display: flex; align-items: baseline; gap: 12px; font-family: var(--f-display); font-size: var(--t-numeral); font-weight: var(--wght-display);',
    '  font-stretch: var(--wdth-display); line-height: var(--lh-cap); font-variant-numeric: tabular-nums; }',
    '.cc-bar > b > small { font-size: 48px; text-transform: none; }',
    /* the day that comes off: uncovered when the two bars draw back */
    '.cc-off { position: absolute; left: calc(var(--cc-day) * (var(--cc-dio) + var(--cc-dso) - 1)); top: 12px; width: var(--cc-day); height: 220px;',
    '  background: none; border: var(--w-rule) solid var(--c-ink); border-left: 0; }',
    '.cc-callout { position: absolute; right: calc(14px + var(--cc-day) / 2 - 4px); top: 244px; height: 84px; padding: 22px 30px 0 0; margin: 0;',
    '  border-right: var(--w-bold) solid var(--c-ink); border-bottom: var(--w-bold) solid var(--c-ink); line-height: 1; white-space: nowrap; }',
    '.cc-callout::before { content: ""; position: absolute; right: -16px; top: -4px; border: 12px solid transparent; border-bottom: 20px solid var(--c-ink); border-top: 0; }',
    '.cc-sum { display: flex; align-items: baseline; gap: 22px; margin: 34px 0 0; font-family: var(--f-display); font-size: 120px; font-weight: var(--wght-display);',
    '  font-stretch: var(--wdth-display); line-height: var(--lh-cap); font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.cc-sum.a2-build { animation: cut-in var(--at) steps(1, end) backwards; }',
    '.cc-sum > i { font-style: normal; font-stretch: var(--wdth-text); font-weight: var(--wght-strong); font-size: 96px; }',
    '.cc-sum > b { display: flex; align-items: baseline; gap: 14px; font-weight: inherit; }',
    '.cc-sum small { font-size: 60px; text-transform: none; }',
    '.cc-line { position: absolute; left: var(--m-x); top: 752px; width: 800px; margin: 0; font-size: 60px; line-height: 1.1; }',
    '.cc-cash { position: absolute; right: 0; top: 664px; width: 920px; height: 322px; padding: 30px var(--m-right) 0 44px; background: var(--c-accent); color: var(--c-accent-ink); }',
    '.cc-cash-v { display: flex; align-items: baseline; gap: 16px; margin: 32px 0 0; font-family: var(--f-display); font-size: 196px; font-weight: var(--wght-display);',
    '  font-stretch: var(--wdth-display); line-height: var(--lh-cap); font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.cc-cash-v > i { font-style: normal; font-stretch: var(--wdth-text); font-weight: var(--wght-strong); font-size: 0.62em; }',
    '.cc-cash-v > small { font-size: 60px; text-transform: none; }',

    /* ---------------- gate-return-capacity ---------------- */
    '.cap-stage { position: relative; flex: 1 1 0; min-height: 0; }',
    '.cap-stage > [data-step-only]:not(.is-visible) { display: none; }',
    '.cap-view { position: absolute; left: 0; top: 0; right: 0; bottom: 0; }',
    '.cap-left { position: absolute; left: 0; top: 14px; width: 900px; }',
    '.cap-hours { display: flex; gap: 12px; margin: 26px 0 26px; }',
    '.cap-hour { position: relative; flex: none; width: calc(min(132px, (876px - (var(--cap-n) - 1) * 12px) / var(--cap-n)) * var(--w, 1)); height: 132px; border: var(--w-rule) solid var(--c-ink); }',
    '.cap-hour > b { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-ink); }',
    '.cap-split { display: flex; align-items: baseline; gap: 20px; margin: 0; font-size: var(--t-body-l); font-weight: 600; line-height: 1; white-space: nowrap; }',
    '.cap-split > b { font-family: var(--f-display); font-size: 96px; font-weight: var(--wght-display); font-stretch: var(--wdth-display);',
    '  line-height: var(--lh-cap); font-variant-numeric: tabular-nums; }',
    '.cap-right { position: absolute; left: 960px; right: 0; top: 14px; }',
    '.cap-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); margin: 0; height: 56px; white-space: nowrap; }',
    '.cap-money { display: inline-block; margin: 22px 0 0 -32px; padding: 30px 32px 46px; background: var(--c-accent); color: var(--c-accent-ink);',
    '  font-family: var(--f-display); font-size: 250px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap);',
    '  font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.cap-money > b { font-weight: inherit; }',
    /* nothing there: no block, and the figure is only an outline */
    '.is-zero > .cap-right > .cap-money { background: none; color: var(--c-ink); }',
    /* (the stroke is drawn first and the fill covers its inner half, so only the outer contour shows) */
    '.is-zero > .cap-right > .cap-money > b { color: var(--c-bg); -webkit-text-stroke: 14px var(--c-ink); paint-order: stroke fill; }',
    '.cap-math { margin: 20px 0 0; font-size: var(--t-body); font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.cap-math > b { font-weight: var(--wght-display); }',
    '.cap-slider { position: absolute; left: 0; right: 0; top: 466px; display: grid; grid-template-columns: 1fr auto; column-gap: var(--s-5); row-gap: 14px; }',
    '.cap-slider > input[type="range"] { width: 100%; height: 96px; }',
    '.cap-slider > input[type="range"]::-webkit-slider-runnable-track { height: 96px; }',
    '.cap-slider > input[type="range"]::-moz-range-track { height: 96px; }',
    '.cap-slider > input[type="range"]::-webkit-slider-thumb { width: 40px; height: 96px; }',
    '.cap-slider > input[type="range"]::-moz-range-thumb { width: 40px; height: 96px; }',
    '.cap-slider > output { min-width: 2.9em; text-align: right; font-size: 120px; }',
    '.cap-zero { position: absolute; right: 0; bottom: 9px; margin: 0; }',   // on the kit's deadpan slot: bottom edge at y 968, like gate-effort
    /* the quiet headline: one line of Archivo at normal width */
    '.slide > .say.cap-say { margin: 18px 0 36px; white-space: nowrap; }',

    /* ---------------- cash-path ---------------- */
    '.cp-tag { position: absolute; left: 1290px; top: 146px; }',
    '.cp-path { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); margin: -6px 0 0; padding: 0; border-bottom: var(--w-rule) solid var(--c-line); }',
    '.cp-path > li { position: relative; display: flex; align-items: center; height: 68px; }',
    '.cp-path > li > span { padding: 14px 16px 12px; margin-left: -16px; }',
    /* the direction of the path: a head on the rule at the end of each stage */
    '.cp-path > li::after { content: ""; position: absolute; right: 18px; bottom: -17px; border: 14px solid transparent; border-left: 22px solid var(--c-line); border-right: 0; }',
    '.cp-path > li.is-on > span { background: var(--c-ink); color: var(--c-bg); }',
    /* the one link from the path down to the idea that sits on it */
    '.cp-path > li.is-on::before { content: ""; position: absolute; left: 56px; top: 100%; width: var(--w-bold); height: 62px; background: var(--c-line); }',
    '.cp-cols { flex: none; height: 500px; margin-top: 56px; border-top: 0; }',
    '.cp-cols > .col { gap: 0; padding-top: 34px; padding-bottom: 0; }',
    '.cp-cols > .col.is-point { padding-left: var(--s-5); }',
    '.cp-cols > .col + .col { border-left: 0; }',
    '.cp-cols > .col:first-child { border-right: var(--w-rule) solid var(--c-line); }',
    '.cp-cols .col-title { margin: 20px 0 30px; }',
    '.cp-counts { margin: 0; padding: 0; }',
    '.cp-counts > li { display: flex; align-items: center; gap: var(--s-4); height: 92px; border-top: var(--w-hair) solid var(--c-ink); font-size: var(--t-body-l); font-weight: 700; line-height: 1; }',
    '.cp-counts > li:last-child { border-bottom: var(--w-hair) solid var(--c-ink); }',
    '.cp-counts > li > b { flex: none; width: 48px; font-family: var(--f-display); font-size: 84px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); }',
    '.cp-counts > li.is-none > span { font-weight: var(--wght-text); }',
    '.cp-verdict { display: flex; align-items: baseline; gap: 22px; margin: 30px 0 0; font-family: var(--f-display); font-size: 96px; font-weight: var(--wght-display);',
    '  font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; white-space: nowrap; }',
    '.cp-verdict > .voice { font-size: 72px; line-height: 1; text-transform: none; }',
    '.cp-line { margin: 30px 0 0; font-size: var(--t-voice); line-height: 1; white-space: nowrap; }',

    /* ---------------- gate-effort ---------------- */
    '.ef-stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }',
    '.ef-tag { position: absolute; right: var(--m-right); top: 250px; }',
    '.ef-rule { position: absolute; left: var(--m-x); right: 0; top: 750px; height: var(--w-rule); background: var(--c-line); }',
    '.ef-block { position: absolute; top: 450px; height: 300px; display: flex; align-items: flex-start; padding: 26px 0 0 26px; background: var(--c-ink); color: var(--c-bg); overflow: hidden; }',
    '.ef-block > b { font-family: var(--f-display); font-size: 96px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; white-space: nowrap; }',
    '.ef-demo { left: 128px; width: 40px; padding: 0; }',
    '.ef-build { left: 180px; width: 420px; }',
    '.ef-roll { left: 612px; width: 440px; }',
    /* the part that never ends: an open band in Lampblack outline that runs off the stage (no Flare: a quiet slide) */
    '.ef-keep { left: 1064px; right: 0; padding: 18px 0 0 18px; background: var(--c-bg); color: var(--c-ink); border: var(--w-bold) solid var(--c-ink); border-right: 0; }',
    /* month marks on the band; the scene walks them to the right for ever */
    '.ef-marks { position: absolute; left: -240px; right: 0; bottom: 0; height: 72px; transition-property: none !important;',
    '  background: repeating-linear-gradient(90deg, var(--c-ink) 0 var(--w-rule), transparent var(--w-rule) 120px); }',
    '.ef-demo-note { position: absolute; left: 144px; top: 322px; height: 116px; margin: 0; padding: 0 0 0 30px; border-left: var(--w-bold) solid var(--c-ink); line-height: 1; white-space: nowrap; }',
    '.ef-demo-note::before { content: ""; position: absolute; left: -16px; bottom: -4px; border: 12px solid transparent; border-top: 20px solid var(--c-ink); border-bottom: 0; }',
    '.ef-cap { position: absolute; top: 784px; margin: 0; font-size: var(--t-body-l); font-weight: 700; line-height: 1; white-space: nowrap; }',

    /* ---------------- gate-potential ---------------- */
    '.po-stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }',
    '.po-head { position: absolute; top: 262px; margin: 0; white-space: nowrap; }',
    '.po-tag { position: absolute; right: var(--m-right); top: 250px; }',
    '.po-block { position: absolute; width: 392px; height: 128px; display: flex; align-items: center; padding: 0 26px; font-family: var(--f-display); font-size: 84px;',
    '  font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; white-space: nowrap; }',
    /* the one Flare: the build, which growth does not multiply */
    '.po-block.is-build { left: 128px; top: 312px; background: var(--c-accent); color: var(--c-accent-ink); }',
    '.po-block.is-ret { left: calc(620px + var(--c) * 416px); top: calc(312px + var(--r) * 144px); background: var(--c-ink); color: var(--c-bg); }',
    '.po-line { position: absolute; left: 128px; top: 476px; width: 440px; margin: 0; line-height: 1.08; }',
    '.po-check { position: absolute; left: 128px; top: 760px; width: 452px; margin: 0; display: grid; grid-template-columns: 64px 1fr; column-gap: 24px; align-items: start;',
    '  font-family: var(--f-display); font-size: 64px; font-weight: var(--wght-strong); font-stretch: var(--wdth-text); line-height: 1.02; letter-spacing: -0.012em; }',
    '.po-check > i { width: 64px; height: 64px; margin-top: 2px; border: var(--w-bold) solid var(--c-ink); }',

    /* ---------------- the-math ---------------- */
    '.tm-formula { display: flex; align-items: baseline; gap: 22px; margin: 30px 0 0; white-space: nowrap; }',
    '.tm-formula > b { font-family: var(--f-display); font-size: 96px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; }',
    '.tm-formula > i { font-family: var(--f-display); font-style: normal; font-size: 84px; font-weight: var(--wght-strong); font-stretch: var(--wdth-text); line-height: var(--lh-cap); }',
    '.tm-formula > .voice { margin: 0 4px 0 18px; font-size: var(--t-voice); line-height: 1; }',
    '.tm-rule { position: absolute; left: var(--spine-w); top: 448px; width: 700px; bottom: 0; padding: 44px 40px 0; background: var(--c-accent); color: var(--c-accent-ink); }',
    '.tm-rule > p { margin: 0; }',
    '.tm-rule-words { font-family: var(--f-display); font-size: 84px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; white-space: nowrap; }',
    '.tm-rule-v { margin: 34px 0 34px !important; font-family: var(--f-display); font-size: var(--t-mega); font-weight: var(--wght-display); font-stretch: var(--wdth-display);',
    '  line-height: var(--lh-cap); font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.tm-rule-at { margin-top: 40px !important; font-size: var(--t-label); font-weight: 700; line-height: 1; white-space: nowrap; }',
    '.tm-house { position: absolute; left: 860px; right: var(--m-right); top: 448px; }',
    '.tm-house > .label { margin: 0 0 22px; white-space: nowrap; }',
    '.tm-rules { margin: 0; padding: 0; border-top: var(--w-rule) solid var(--c-line); }',
    '.tm-rules > li { display: grid; grid-template-columns: 262px 1fr; column-gap: 20px; align-items: center; min-height: 120px; padding: 12px 0; border-bottom: var(--w-hair) solid var(--c-line); }',
    '.tm-rules b { font-family: var(--f-display); font-size: 60px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; }',
    '.tm-rules p { margin: 0; font-size: 36px; font-weight: var(--wght-text); line-height: 1.24; text-wrap: balance; }',
    '.tm-rules .verdict { --vh: 48px; margin-right: 12px; vertical-align: 0.12em; }',
    /* a default you can change looks like a field you can type in */
    '.tm-edit { display: inline-block; padding: 0 10px; margin: 0 2px; border: var(--w-hair) solid var(--c-ink); border-bottom-width: var(--w-rule); font-weight: var(--wght-strong); font-variant-numeric: tabular-nums; text-decoration: none; white-space: nowrap; }'
  ].join('\n');
  var style = document.createElement('style');
  style.setAttribute('data-from', 'slides/a2c-gates.js');
  style.textContent = css;
  document.head.appendChild(style);

  /* ======================================================================
   * tool-ladder
   * ==================================================================== */

  /* bottom rung first: the first list item is the bottom of the ladder */
  var RUNGS = [
    { text: 'Don’t automate' },
    { text: 'Spreadsheet formula' },
    { text: 'Plain code', cls: 'tl-code' },
    { text: 'Small model' },
    { text: 'Frontier model', cls: 'tl-frontier' },
    { text: 'Agent' }
  ];
  function swungMs(i) { return T ? Math.round(T.motion.swung(i) * 1000) : i * 250; }

  Deck.slide({
    id: 'tool-ladder',
    act: 2,
    title: 'The ladder of tools',
    minutes: 1,
    layout: 'ladder',
    steps: 1,
    html:
      '<p class="kicker">Gate 1 · Cost</p>' + strip(1) +
      '<h2 class="headline a2-under-strip">Climb only as far as the task makes you.</h2>' +
      '<div class="tl-stage">' +
        '<ol class="ladder tl-ladder">' +
          RUNGS.map(function (r, i) {
            // the rungs arrive from the bottom up, long-short
            return '<li class="a2-build' + (r.cls ? ' ' + r.cls : '') + '" style="--at: ' + (500 + swungMs(i)) + 'ms">' + esc(r.text) + '</li>';
          }).join('') +
        '</ol>' +
        '<div class="tl-side" data-step="1">' +
          '<svg class="tl-elbow" viewBox="0 0 96 248" aria-hidden="true"><path d="M0,20 H64 V228 H24"/><polygon points="28,210 0,228 28,246"/></svg>' +
          '<p class="voice tl-once">Use the expensive model once,<br>to write the tool.</p>' +
          '<p class="voice tl-then">Then the tool runs for free.</p>' +
        '</div>' +
      '</div>',
    enter: arrive,
    step: moved,
    notes: [
      'SAY: Climb only as far as the task makes you.',
      'Bottom rung: do not automate it. Then a spreadsheet formula, then plain code. A model only when the task needs judgment. An agent last.',
      'Every rung up costs more to run and more to keep alive.',
      '',
      'DO: Click. Frontier model and plain code light up.',
      '',
      'SAY: Use the expensive model once, to write the tool. Then the tool runs for free.',
      'You will see it in my own project.',
      '',
      'NEXT: Cost is one side. Gate two asks what comes back, starting with a business that sells parts.',
      '',
      'TIME: 1 minute.'
    ].join('\n')
  });

  /* ======================================================================
   * gate-return-cash: the cash conversion cycle as a timeline of days
   * ==================================================================== */

  var cyc = (Y.examples && Y.examples.cashCycle) || {};
  var dio = Number(cyc.daysInventory);
  var dso = Number(cyc.daysToCollect);
  var dpo = Number(cyc.daysToPay);
  var span = tidy(dio + dso);                    // the timeline: stock arrives on day 0, the customer pays on this day
  var ccc = tidy(dio + dso - dpo);               // the cash conversion cycle, in days
  var cycleOk = usable(dio) && usable(dso) && usable(dpo) && dso >= 1 && ccc >= 1 && dpo <= span && span > 0;
  var CHART_W = 1716;                            // px for the whole timeline (the stage is 1736 wide here)
  var dayPx = cycleOk ? Math.floor(CHART_W / span * 1000) / 1000 : 0;
  var sweepSeconds = cycleOk ? (dayPx * span) / BAR_SPEED : 0;

  var revenue = A.company.annualRevenue;
  var perDay = G ? G.cashPerDay(revenue) : NaN;                    // one day of sales
  var perDayText = CM ? CM.aboutMoney(perDay) : '';                 // a round figure, said with the approximately sign
  var companyLabel = G ? G.companyLabel() : (A.company.label || '');
  /* the figure arrives with its block, whole: a counter would tick through
     false-precision values ("$51,749") beside an approximately sign */
  /* the figure is set as large as its length allows: "$54,800" is seven characters */
  var perDaySize = perDayText.length <= 7 ? 196 : (perDayText.length === 8 ? 164 : (perDayText.length === 9 ? 146 : 120));

  function swap(before, after, atStep) {
    return '<span class="a2-swap"><span data-step-out="' + atStep + '">' + esc(before) + '</span><span data-step="' + atStep + '">' + esc(after) + '</span></span>';
  }
  function dayWord(n) { return plural(n, 'day', 'days'); }

  var cycleChart = !cycleOk
    ? '<p class="cc-note">' + slot('Example day counts') + '</p>'
    : '<p class="cc-note">' + tag('example') + '<span class="label">The cash conversion cycle · days · drawn to scale</span></p>' +
      '<div class="cc-chart" style="--cc-day: ' + dayPx + 'px; --cc-dio: ' + dio + '; --cc-dso: ' + dso + '; --cc-dpo: ' + dpo + '; --cc-ccc: ' + ccc + '">' +
        // both rows start on day 0, so one sweep at the bar speed uncovers the whole timeline
        '<div class="cc-sweep a2-build" style="--grow: ' + sweepSeconds.toFixed(3) + 's; --at: 600ms">' +
          '<i class="cc-off" data-step="1"></i>' +
          '<div class="cc-bar is-inv"><span class="label is-tight">Days of inventory</span><b>' + esc(num(dio)) + '</b></div>' +
          '<div class="cc-bar is-col"><span class="label is-tight">Days to collect</span><b>' + swap(num(dso), num(dso - 1), 1) + '</b></div>' +
          '<div class="cc-bar is-pay"><span class="label is-tight">Days to pay</span><b>' + esc(num(dpo)) + '</b></div>' +
          '<div class="cc-bar is-ccc"><span class="label is-tight">Cash conversion cycle</span><b>' + swap(num(ccc), num(ccc - 1), 1) +
            '<small>' + swap(dayWord(ccc), dayWord(ccc - 1), 1) + '</small></b></div>' +
        '</div>' +
        '<p class="voice cc-callout" data-step="1">one day</p>' +
      '</div>' +
      '<p class="cc-sum a2-build" style="--at: ' + Math.round(600 + sweepSeconds * 1000 + 250) + 'ms">' +
        '<span>' + esc(num(dio)) + '</span><i>+</i>' +
        swap(num(dso), num(dso - 1), 1) + '<i>−</i>' +
        '<span>' + esc(num(dpo)) + '</span><i>=</i>' +
        '<b class="is-total">' + swap(num(ccc), num(ccc - 1), 1) + '<small>' + swap(dayWord(ccc), dayWord(ccc - 1), 1) + '</small></b>' +
      '</p>';

  Deck.slide({
    id: 'gate-return-cash',
    act: 2,
    title: 'Gate 2: Return, product side',
    minutes: 1.5,
    layout: 'chart',
    steps: 2,
    html:
      '<p class="kicker">Gate 2 · Return · product side</p>' + strip(2) +
      '<h2 class="headline is-s a2-under-strip">Does cash come in sooner?</h2>' +
      cycleChart +
      '<p class="voice is-l cc-line" data-step="1" data-anim="wipe">One day off the cycle frees about one day of sales.</p>' +
      // the figure cuts in whole, block and all: no drop past the equation, no ticking digits
      '<div class="cc-cash" data-step="2">' +
        tag('example', companyLabel) +
        '<p class="cc-cash-v" style="font-size: ' + perDaySize + 'px"><i>≈</i>' +
          '<b>' + esc(perDayText) + '</b>' +
          '<small>per day</small></p>' +
      '</div>' +
      '<p class="source-line">Example figures, not Laborde’s' +
        // the day counts in the source line follow the bars: 38 to collect becomes 37 with the step
        (cycleOk ? ' · ' + esc(num(dio)) + ' days of inventory + ' + swap(num(dso), num(dso - 1), 1) + ' to collect − ' + esc(num(dpo)) + ' to pay' : '') +
        ' · one day of sales = annual revenue ÷ 365</p>',
    enter: arrive,
    step: moved,
    notes: [
      'SAY: This is the language your CFO speaks.',
      'Parts sit on the shelf: days of inventory. The customer takes a while to pay: days to collect. You take a while to pay your supplier: days to pay.',
      'Add the first two, take off the third. That is how long your cash is out.' + (cycleOk ? ' Here, ' + num(ccc) + ' days.' : ''),
      '',
      'DO: Click. One day comes off days to collect.',
      '',
      'SAY: One day off the cycle frees about one day of sales.',
      '',
      'DO: Click. The example figure lands.',
      '',
      'SAY: For this example company, about ' + perDayText + '.',
      'It comes once, not every year, and it is cash, not profit. But it was sitting in somebody else’s account.',
      'Where to look: inventory, invoicing, collections.',
      '',
      'NEXT: That is a business that sells parts. A business that sells hours gets paid differently.',
      '',
      'TIME: 1.5 minutes.'
    ].join('\n')
  });

  /* ======================================================================
   * gate-return-capacity: the slider
   * ==================================================================== */

  var cap = CASH.capacity || null;
  var capIn = cap ? cap.inputs() : { ok: false };
  var capFull = cap ? cap.figure(1) : { ok: false };
  var capShares = cap ? cap.STEP_SHARES : [0];

  Deck.slide({
    id: 'gate-return-capacity',
    act: 2,
    title: 'Gate 2: Return, service side',
    minutes: 1.5,
    layout: 'figure',
    steps: capShares.length - 1,
    html:
      '<p class="kicker">Gate 2 · Return · service side</p>' + strip(2) +
      '<h2 class="say is-s cap-say">Time is money. Literally.</h2>' +
      '<div class="cap-stage a2-live" data-scene="capacity">' +
        // one still view per step; the scene swaps them for a live one
        (cap ? capShares.map(function (share, n) {
          return '<div data-step-only="' + n + '">' + cap.view(share, { zeroLine: n >= 2 }) + '</div>';
        }).join('') : slot('Example hours and margin')) +
      '</div>' +
      '<p class="source-line">Example figures, not Laborde’s' +
        (capFull.ok ? ' · ' + esc(capFull.hoursPerWeekText) + ' freed hours a week × ' + esc(capFull.workWeeksText) + ' work weeks = ' + esc(capFull.hoursPerYearText) +
          ' hours a year · ' + esc(capFull.marginText) + ' margin on a billed hour' : '') + '</p>',
    enter: arrive,
    step: moved,
    notes: [
      'SAY: ' + (capFull.ok ? 'Say a tool gives a service crew ' + capFull.hoursPerWeekText + ' hours a week back. ' : 'Say a tool gives a service crew hours back every week. ') + 'Same crew. Same payroll.',
      'One question on this slide: how much of the freed time becomes paid work? Right now, none.',
      '',
      'DO: Click. The slider runs up to 100 percent. (You can also drag it with the mouse.)',
      '',
      'SAY: Bill every freed hour and it is ' + (capFull.ok ? capFull.valueText : 'real money') + ' a year in this example. More time, more work done, more money.',
      '',
      'DO: Click. The slider runs back to zero.',
      '',
      'SAY: At zero percent it is zero dollars. The tool worked, the hours came back, and nothing happened with them.',
      'Zero is also a decision. Hold on to that. It comes back at the end.',
      '',
      'NEXT: Both sides come down to one question you can ask in a hallway.',
      '',
      'TIME: 1.5 minutes.'
    ].join('\n')
  });

  /* ======================================================================
   * cash-path
   * ==================================================================== */

  var PATH = ['Quote', 'Order', 'Pick', 'Ship', 'Invoice', 'Collect'];
  var PATH_ON = 'Invoice';

  Deck.slide({
    id: 'cash-path',
    act: 2,
    title: 'Does it touch the cash path?',
    minutes: 1,
    layout: 'split',
    steps: 3,
    html:
      '<p class="kicker">Gate 2 · Return</p>' + strip(2) +
      '<h2 class="headline is-s a2-under-strip">Does it touch the cash path?</h2>' +
      '<span class="cp-tag">' + tag('example') + '</span>' +
      '<ol class="cp-path">' +
        PATH.map(function (name) {
          return '<li' + (name === PATH_ON ? ' class="is-on"' : '') + '><span class="label is-tight">' + esc(name) + '</span></li>';
        }).join('') +
      '</ol>' +
      '<div class="cols cp-cols">' +
        '<section class="col">' +
          '<p class="label is-tight">Off the path · 20 minutes saved</p>' +
          '<h3 class="col-title">Internal memos</h3>' +
          '<ol class="cp-counts" data-step="2">' +
            '<li><b>1</b><span>Labor</span></li>' +
            '<li class="is-none"><b>–</b><span>Nothing else</span></li>' +
          '</ol>' +
          '<p class="cp-verdict" data-step="2">Counts once. <span class="voice">Maybe.</span></p>' +
        '</section>' +
        '<section class="col is-point">' +
          '<p class="label is-tight">On the path · 20 minutes saved</p>' +
          '<h3 class="col-title">Invoicing</h3>' +
          '<ol class="cp-counts" data-step="1">' +
            '<li><b>1</b><span>Labor</span></li>' +
            '<li><b>2</b><span>Cash sooner</span></li>' +
          '</ol>' +
          '<p class="cp-verdict" data-step="1">Counts twice.</p>' +
        '</section>' +
      '</div>' +
      '<p class="voice cp-line" data-step="3" data-anim="wipe">The boring idea on the cash path beats the exciting one off it.</p>',
    enter: arrive,
    step: moved,
    notes: [
      'SAY: Does it touch the cash path? Quote to collect: how cash gets in.',
      'Two ideas, the same 20 minutes saved.',
      '',
      'DO: Click. Invoicing.',
      '',
      'SAY: Invoicing is on the path. It counts twice: labor, and cash in sooner.',
      '',
      'DO: Click. Internal memos.',
      '',
      'SAY: Internal memos count once. Maybe.',
      '',
      'DO: Click for the line.',
      '',
      'SAY: The boring idea on the cash path beats the exciting one off it.',
      'Touching the path is the first question, not the test. The test is whether cash arrives sooner.',
      '',
      'DO: If asked: the house rule waves a small return through only when it takes days off the cash cycle. On the path with zero days, it counts once, like the memo.',
      '',
      'NEXT: That is what comes back. Now what it costs you to keep it coming.',
      '',
      'TIME: 1 minute.'
    ].join('\n')
  });

  /* ======================================================================
   * gate-effort
   * ==================================================================== */

  function growSeconds(px) { return (px / BAR_SPEED).toFixed(3) + 's'; }

  Deck.slide({
    id: 'gate-effort',
    act: 2,
    title: 'Gate 3: Effort',
    minutes: 1,
    layout: 'track',
    steps: 2,
    html:
      '<p class="kicker">Gate 3 · Effort</p>' + strip(3) +
      '<h2 class="headline is-s a2-under-strip">The demo is the cheap part.</h2>' +
      '<div class="ef-stage">' +
        '<span class="ef-tag">' + tag('illustration') + '</span>' +
        '<i class="ef-rule"></i>' +
        '<i class="ef-block ef-demo"></i>' +
        '<p class="voice ef-demo-note">the demo</p>' +
        '<div class="ef-block ef-build a2-grow" data-step="1" style="--grow: ' + growSeconds(420) + '"><b>Build</b></div>' +
        '<p class="ef-cap" data-step="1" style="left: 180px; --delay: ' + growSeconds(420) + '">Once.</p>' +
        '<div class="ef-block ef-roll a2-grow" data-step="1" style="--grow: ' + growSeconds(440) + '; --delay: ' + growSeconds(420 + 300) + '"><b>Roll out</b></div>' +
        '<p class="ef-cap" data-step="1" style="left: 612px; --delay: ' + growSeconds(420 + 300 + 440) + '">Once.</p>' +
        '<div class="ef-block ef-keep a2-grow a2-live" data-step="2" data-scene="effort-march" data-opts=\'{"step": 2, "pitch": 120, "speed": 60}\' style="--grow: ' + growSeconds(856) + '">' +
          '<b>Keep alive</b><i class="ef-marks"></i></div>' +
        '<p class="ef-cap" data-step="2" style="left: 1064px; --delay: ' + growSeconds(856) + '">Every month.</p>' +
      '</div>' +
      // the deadpan line, in the kit's one slot (bottom right)
      '<p class="deadpan ef-never" data-step="2" data-anim="wipe" style="--delay: ' + growSeconds(856 + 450) + '">the part that never ends.</p>',
    enter: arrive,
    step: moved,
    notes: [
      'SAY: The demo is the cheap part. It is that sliver on the left.',
      '',
      'DO: Click. Build and roll out.',
      '',
      'SAY: Then you build the real thing, and roll it out: training, switching people over. Each happens once.',
      '',
      'DO: Click. Keep alive.',
      '',
      'SAY: Then you keep it alive. Every month. Things change underneath it. The person who built it leaves.',
      'Nobody puts this part in the pitch.',
      '',
      'DO: In the math: build and rollout hours once, upkeep hours every month.',
      '',
      'YOUR STORY: one tool that was quick to demo and then needed looking after every month. What the upkeep turned out to be.',
      '',
      'NEXT: Last gate. This one looks forward.',
      '',
      'TIME: 1 minute.'
    ].join('\n')
  });

  /* ======================================================================
   * gate-potential
   * ==================================================================== */

  var SITES = 3;        // the brief's picture: one site to three sites
  var TEAM_ROWS = 4;    // "every team": a whole number of rows that ends well above the floor
  function returnBlock(c, r) {
    var step = r > 0 ? 2 : (c > 0 ? 1 : 0);
    var delay = r > 0 ? swungMs(r - 1) : (c > 0 ? swungMs(c - 1) : 0);
    return '<div class="po-block is-ret"' + (step ? ' data-step="' + step + '" data-anim="rise"' : '') +
      ' style="--c: ' + c + '; --r: ' + r + (step ? '; --delay: ' + delay + 'ms' : '') + '">Return</div>';
  }
  var returnGrid = '';
  (function () {
    for (var r = 0; r < TEAM_ROWS; r++) { for (var c = 0; c < SITES; c++) { returnGrid += returnBlock(c, r); } }
  }());

  Deck.slide({
    id: 'gate-potential',
    act: 2,
    title: 'Gate 4: Potential',
    minutes: 1,
    layout: 'grow',
    steps: 3,
    html:
      '<p class="kicker">Gate 4 · Potential</p>' + strip(4) +
      '<h2 class="headline is-s a2-under-strip">If it works, how far does it grow?</h2>' +
      '<div class="po-stage">' +
        '<p class="label is-tight po-head" style="left: 128px">Build effort</p>' +
        '<p class="label is-tight po-head a2-swap" style="left: 620px">' +
          '<span data-step-out="1">One site · one team</span>' +
          '<span data-step="1" data-step-out="2">Three sites · one team</span>' +
          '<span data-step="2">Three sites · every team</span>' +
        '</p>' +
        '<span class="po-tag">' + tag('illustration') + '</span>' +
        '<div class="po-block is-build">Once</div>' +
        returnGrid +
        '<p class="voice po-line" data-step="1" data-anim="wipe" style="--delay: 600ms">Growth multiplies return, not build effort.</p>' +
        '<p class="po-check" data-step="3"><i></i><span>Who owns the freed time?</span></p>' +
      '</div>',
    enter: arrive,
    step: moved,
    notes: [
      'SAY: How far does it grow? Today: one site, one team. Built once, pays back once.',
      '',
      'DO: Click. Three sites.',
      '',
      'SAY: Three sites. The return comes back three times. Still built once.',
      '',
      'DO: Click. Every team.',
      '',
      'SAY: Every team. Growth multiplies the return, not the build. It is a projection, so write down a number you would defend.',
      '',
      'DO: Click. The check line.',
      '',
      'SAY: One check before this gate opens: who owns the freed time? I want a name. No owner, no growth.',
      '',
      'NEXT: That is all four gates. Here is how they add up.',
      '',
      'TIME: 1 minute.'
    ].join('\n')
  });

  /* ======================================================================
   * the-math
   * ==================================================================== */

  var hourly = A.rates.loadedHourly;
  var workWeeks = A.rates.workWeeks;
  var minuteRule = G ? G.minuteRule(hourly, workWeeks) : NaN;             // dollars a year for a minute a week
  var minuteRuleDouble = G ? G.minuteRule(tidy(hourly * 2), workWeeks) : NaN;

  /* The house rules, in the words Gates.evaluate() uses for them, with the
     limit that is in force. The limit is drawn as a field: it is a default. */
  var houseRules = (function () {
    if (!G || !CM) { return []; }
    var r = G.evaluate({ tier: 'code' });
    var rules = A.houseRules;
    var limitText = {
      cost: CM.percent(rules.costMaxShareOfReturn),
      'return': CM.money(rules.minReturnPerYear),
      effort: CM.number(rules.maxPaybackWeeks),
      potential: CM.ratio(rules.minGrowth)
    };
    return G.GATES.map(function (g) {
      var text = String(r.gates[g.id].rule || '');
      var says = /^NO\s/.test(text);
      var rest = esc(says ? text.replace(/^NO\s+/, '') : text);
      var lim = esc(limitText[g.id]);
      var at = rest.indexOf(lim);
      if (lim && at !== -1) { rest = rest.slice(0, at) + '<u class="tm-edit">' + lim + '</u>' + rest.slice(at + lim.length); }
      return '<li><b>' + esc(g.label) + '</b><p>' + (says && T ? T.verdict('no') : '') + rest + '</p></li>';
    });
  }());

  Deck.slide({
    id: 'the-math',
    act: 2,
    title: 'Let the math pick',
    minutes: 1,
    layout: 'math',
    steps: 2,
    html:
      '<h2 class="headline is-hero">Let the math pick.</h2>' +
      '<p class="tm-formula"><b>Return</b><i>−</i><b>Cost</b><i>−</i><b>Effort</b><span class="voice is-l">then grown by</span><b>Potential</b></p>' +
      '<div class="tm-rule" data-step="1" data-anim="stamp">' +
        '<p class="tm-rule-words">A minute a week is</p>' +
        '<p class="tm-rule-v">' + esc(money(minuteRule)) + '</p>' +
        '<p class="tm-rule-words">a year.</p>' +
        '<p class="tm-rule-at">at ' + esc(money(hourly)) + ' an hour · ' + esc(num(workWeeks)) + ' work weeks a year</p>' +
      '</div>' +
      '<div class="tm-house" data-step="2">' +
        '<p class="label is-tight">House rules · defaults · change them</p>' +
        '<ul class="tm-rules">' + houseRules.join('') + '</ul>' +
      '</div>',
    enter: arrive,
    step: moved,
    notes: [
      'SAY: Let the math pick. Return, minus cost, minus effort. Then grown by potential.',
      'Any no and it is out. Of the survivors, the biggest number wins.',
      '',
      'DO: Click. The rule for the worksheet.',
      '',
      'SAY: One number to carry: a minute a week is ' + money(minuteRule) + ' a year, at ' + money(hourly) + ' an hour.' +
        (usable(minuteRuleDouble) ? ' At ' + money(tidy(hourly * 2)) + ' it is ' + money(minuteRuleDouble) + '.' : ''),
      '',
      'DO: Click. The house rules. (The worksheet does this arithmetic for them.)',
      '',
      'SAY: This is where each gate says no. My defaults. Change them, but before you score your favorite, not after.',
      '',
      'NEXT: That is the whole method. Now your own work goes on the table.',
      '',
      'TIME: 1 minute.'
    ].join('\n')
  });
}());
