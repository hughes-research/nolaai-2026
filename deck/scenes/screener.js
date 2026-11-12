/*
 * scenes/screener.js: the four-gate screener  ->  scene "screener", window.Screener
 * -----------------------------------------------------------------------------
 * One component, used three ways:
 *
 *   1. The worked example (slide "worked-example"), mode "walkthrough":
 *        <div class="scene" data-scene="screener" data-opts='{"mode":"walkthrough"}'></div>
 *      The example candidates from window.YOUR.candidates go through the four
 *      gates one at a time, one deck step per beat. A candidate stops at its
 *      first NO; every later gate reads NOT YET, never PASS. The survivor gets
 *      its payback, its two-year value and the cash it frees.
 *      The slide needs to know how many steps that is:
 *        steps: Screener.walkthroughSteps()
 *
 *   2. The live scorecard (slide "ex-screen"), mode "live":
 *        <div class="scene" data-scene="screener" data-opts='{"mode":"live"}'></div>
 *      Three candidates side by side, one of them open in the editor below.
 *      Every control is big enough to hit while talking. The verdicts follow
 *      every keystroke. "House rules" opens the thresholds and the rates;
 *      "Reset" puts the examples back.
 *
 *   3. The standalone page (screener/index.html), the same live scorecard laid
 *      out for a phone first:
 *        Screener.mount(element, { mode: 'live', layout: 'page', persist: 'local' })
 *
 * THE MATH IS NOT IN THIS FILE. Every verdict, every sentence and every dollar
 * figure comes from Gates.evaluate / Gates.rank (deck/lib/gates-core.js) and is
 * formatted by CostMath. This file only decides where things go on screen.
 * The one rule it adds is the gate logic from the design direction: after a
 * gate says NO, the gates after it are shown as NOT YET.
 *
 * Needs: Gates, CostMath (and so BENCHLM), window.YOUR. Classic script, no
 * modules, no network.
 *
 * Looks come from the theme (deck/theme/components.css): the dock and its
 * gates (.dock .gate, whose class changes play the theme's own moves), the
 * verdict marks (.verdict, .gate-glyph), the tag, the labels and the controls
 * (.btn .seg .stepper). This file adds only the layout around them, scoped
 * under .scr. On the stage sizes are stage pixels; on the standalone page the
 * same markup is sized again for a phone. THEME.landNo runs the recoil and
 * the stop-time hold in negative when a NO lands (with a plain fallback).
 * Motion is used for the walkthrough's timing when it is there; the live
 * scorecard needs neither Motion nor THEME.
 *
 * What is typed: on the stage it is kept in memory and in this browser tab's
 * session storage (key STORE_KEY + ':stage'), so it survives leaving the
 * slide and coming back and a reload of the deck; a new tab or window starts
 * from the examples, and Reset forgets it. The page passes persist: 'local'
 * and keeps it in the browser's local storage when it can.
 *
 * For tests (tools/test-screener.js) every instance exposes:
 *   snapshot()            { candidates, assumptions, selected, rulesOpen }: exactly what is handed to Gates
 *   set(ci, field, value) type a value into candidate ci (0, 1, 2)
 *   setRule(path, value)  'houseRules.maxPaybackWeeks', 'rates.loadedHourly', ...
 *   select(ci), reset(), beats() (walkthrough: the script of steps)
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) { return; }

  var doc = document;
  var LETTERS = ['A', 'B', 'C'];
  var TIMES = '×';
  var DOT = ' · ';
  var MINUS = '−';
  var STORE_KEY = 'four-gate-screener:v1';

  function gates() { return window.Gates; }
  function cm() { return window.CostMath; }
  function your() { return window.YOUR || {}; }
  function theme() { return window.THEME || null; }

  /* ---------------------------------------------------------------------------
   * Small helpers
   * ------------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function plural(n, word) { return word + (n === 1 ? '' : 's'); }

  function upperFirst(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* A cubic-bezier easing as a function of time, 0..1 -> 0..1 (the same curves as the CSS tokens). */
  function bezier(x1, y1, x2, y2) {
    return function (x) {
      if (x <= 0) { return 0; }
      if (x >= 1) { return 1; }
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 26; i++) {
        t = (lo + hi) / 2;
        var u = 1 - t;
        var cx = 3 * x1 * t * u * u + 3 * x2 * t * t * u + t * t * t;
        if (cx < x) { lo = t; } else { hi = t; }
      }
      var v = 1 - t;
      return 3 * y1 * t * v * v + 3 * y2 * t * t * v + t * t * t;
    };
  }
  var EASE_ARRIVE = bezier(0.16, 1, 0.3, 1);      // --e-arrive: fast in, dead stop

  /* Tier names short enough for a control: "Plain code", "Premium model". */
  function tierShort(tier) {
    if (!tier) { return 'No tool chosen'; }
    return String(tier.label).replace(/\s*\/\s*spreadsheet/i, '').replace(/\s*"pro"/i, '');
  }

  /* The example candidates: the first three in window.YOUR.candidates, as fresh copies. */
  function exampleCandidates() {
    var list = Array.isArray(your().candidates) ? your().candidates.slice(0, 3) : [];
    var out = list.map(clone);
    while (out.length < 3) {
      out.push({
        id: 'candidate-' + (out.length + 1), name: '', pitch: '', lens: 'product', minutesPerRun: 0, runsPerWeek: 0,
        tier: 'code', toolsPerMonth: 0, buildHours: 0, rolloutHours: 0, upkeepHoursPerMonth: 0, growth: 1,
        touchesCashPath: false, daysOffCashCycle: 0, ownerNamed: false
      });
    }
    return out;
  }

  /*
   * THE GATE LOGIC (docs/DIRECTION.md, Part 1, section 5).
   * Gates.evaluate judges all four gates. On screen a candidate stops at its
   * first NO, and every gate after that is NOT YET, never PASS.
   * Returns four { id, state: 'pass' | 'no' | 'notyet', gate }.
   */
  function gateStates(result) {
    var out = [];
    var stopped = false;
    gates().ORDER.forEach(function (id) {
      var gate = result.gates[id];
      if (stopped) { out.push({ id: id, state: 'notyet', gate: gate }); return; }
      if (gate.pass) { out.push({ id: id, state: 'pass', gate: gate }); return; }
      out.push({ id: id, state: 'no', gate: gate });
      stopped = true;
    });
    return out;
  }

  /* "$3,270 a year (22% of return)" -> { main: "$3,270 a year", sub: "22% of return" } */
  function splitMetric(text) {
    var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(text || ''));
    return m ? { main: m[1], sub: m[2] } : { main: String(text || ''), sub: '' };
  }

  /* The small verdict mark, in the theme's own markup: shape and word, in the base inks. */
  function verdictHtml(state) {
    var word = state === 'pass' ? 'Pass' : (state === 'no' ? 'No' : 'Not yet');
    return '<span class="verdict is-' + (state === 'pass' || state === 'no' ? state : 'notyet') + '">' + word + '</span>';
  }

  /* "about 15 weeks" -> { about: true, text: "15 weeks" } so the word "about" can be set in the second voice. */
  function splitAbout(text) {
    var m = /^about\s+(.*)$/i.exec(String(text || ''));
    return m ? { about: true, text: m[1] } : { about: false, text: String(text || '') };
  }

  /* A round dollar figure for a line that says "about". Small amounts are exact, so they do not say "about". */
  function aboutFigure(x) {
    var CM = cm();
    var round = CM.aboutMoney(x);
    return { about: round !== CM.money(x) || Math.abs(x) >= 1000, text: round };
  }

  /*
   * Squeeze a one-line label onto its line by moving Archivo's width axis
   * (never by scaling). All the elements get the same width so they stay
   * equals. Does nothing when they already fit.
   */
  function fitOneLine(els, minStretch) {
    els = els.filter(Boolean);
    if (!els.length) { return 100; }
    var fits = function (w) {
      var ok = true;
      els.forEach(function (n) { n.style.fontStretch = w + '%'; });
      els.forEach(function (n) { if (n.scrollWidth > n.clientWidth + 0.5) { ok = false; } });
      return ok;
    };
    if (fits(100)) { return 100; }
    var lo = minStretch || 62, hi = 100;
    if (!fits(lo)) { return lo; }
    for (var i = 0; i < 9; i++) {
      var mid = (lo + hi) / 2;
      if (fits(mid)) { lo = mid; } else { hi = mid; }
    }
    lo = Math.floor(lo * 10) / 10;
    fits(lo);
    return lo;
  }

  function whenFontsReady(fn) {
    var t = theme();
    if (t && typeof t.whenReady === 'function') { t.whenReady(fn); return; }
    if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') { doc.fonts.ready.then(fn, fn); return; }
    setTimeout(fn, 0);
  }


  /* ---------------------------------------------------------------------------
   * Styles. Tokens only (docs/TOKENS.md); the fallbacks are the Sleeve values.
   * Everything is scoped under .scr, with two layouts:
   *   .scr--stage   laid out in stage pixels on the 1920 x 1080 slide
   *   .scr--page    the standalone page: a phone first, then wider
   * ------------------------------------------------------------------------ */

  var CSS = `
.scr { text-align: left; }
.scr, .scr *, .scr *::before, .scr *::after { box-sizing: border-box; }
.scr [hidden] { display: none !important; }
/* These are measured while their width axis is being fitted. In ?fast and ?print the engine gives every
   element a 1ms transition, which would make a measurement read the old width, so they never transition. */
.scr .scr-measure, .scr .scr-name, .scr .scr-tab-name, .scr .scr-src { transition: none !important; }
.scr .scr-d { font-family: var(--f-display, "Archivo", sans-serif); font-weight: 900; font-stretch: 62%; text-transform: uppercase; letter-spacing: 0; }

/* =============================================================================
   1. WALKTHROUGH (stage only). The host is the whole slide; the dock is the
      theme's own .dock / .gate, placed in stage pixels. Three candidates
      stand on the lintel as tabs; four gates below.
   ========================================================================== */
.scr-walk { position: absolute; inset: 0; }

/* ---- three candidates ---- */
.scr-walk .scr-tabs { position: absolute; left: 128px; top: 150px; width: 1736px; height: 158px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 16px; }
.scr-walk .scr-tab { position: relative; min-width: 0; padding: 10px 20px 0; border: 6px solid var(--c-ink); border-bottom: 0; background: var(--c-bg); color: var(--c-ink); }
.scr-walk .scr-tab.on-ink { border-color: var(--c-bg); }
.scr-walk .scr-tab-pitch { line-height: 36px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr-walk .scr-tab-name { margin-top: 2px; font-size: 38px; line-height: 46px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr-walk .scr-tab-foot { display: flex; align-items: flex-start; gap: 18px; height: 48px; margin-top: 4px; }
.scr-walk .scr-track { display: flex; gap: 6px; flex: none; }
.scr-walk .scr-tab-result { line-height: 48px; white-space: nowrap; }

/* ---- four gates ---- */
.scr-walk .scr-dock { position: absolute; left: 88px; top: 308px; --gw: 464px; --gh: 512px; }
.scr-walk .gate { --gcap: 72px; --gy-q: 284px; }
/* the bay is shorter than the kit's, so PASS is set a size smaller to sit inside the raised shutter */
.scr-walk .gate.is-pass > .gate-shutter::after { font-size: 94px; top: 17px; }
.scr-walk .gate.is-no > .gate-shutter::after { font-size: 272px; }
.scr-walk .gate-q { font-size: 36px; line-height: 42px; }
.scr-walk .gate-q > span { display: block; }
.scr-walk .gate-q .scr-q { font-size: 40px; line-height: 46px; }
.scr-walk .gate-q .scr-in + .scr-in { margin-top: 6px; }
.scr-walk .gate-q .scr-metric { font-size: 56px; line-height: 0.92; text-wrap: balance; font-variant-numeric: tabular-nums; }
.scr-walk .gate-q .scr-sub { margin-top: 8px; font-weight: 600; }
/* inside a gate everything is drawn in one ink and blended, so the mark borrows the text colour */
.scr-walk .gate-q .verdict { --vh: 56px; display: inline-flex; border-color: currentColor; color: inherit; }
.scr-walk .gate-why { padding-right: 16px; }
.scr-walk[data-band="1"] .gate-why { visibility: hidden; }
/* Every bay keeps one floor line at one height. (A NO's tell-tale belongs to its own candidate; a bay
   that a candidate already gone said NO in is not cut and dropped, so the four floors stay level.) */
/* the fine print under a bay carries meaning, so it is a label: 32px, not the kit's 28 */
.scr-walk .gate-why { font-size: 32px; line-height: 34px; }
.scr-walk .gate-q .verdict.is-notyet { font-size: 32px; }

/* ---- the reason, under the dock, in the gate's own words ---- */
.scr-walk .scr-cap { position: absolute; left: 128px; top: 902px; width: 1736px; font-size: 40px; line-height: 46px; font-weight: 500; text-wrap: balance; }
.scr-walk .scr-cap b { font-weight: 800; }
.scr-walk .scr-src { position: absolute; left: 128px; top: 1010px; width: 1736px; max-width: none; line-height: 32px; white-space: nowrap; overflow: hidden; z-index: 3; }

/* ---- the survivor: the one Flare block on this slide ---- */
.scr-walk .scr-band { display: none; position: absolute; left: 88px; top: 836px; width: 1832px; height: 244px; background: var(--c-accent); color: var(--c-accent-ink); z-index: 2; }
.scr-walk[data-band="1"] .scr-band { display: block; }
.scr-walk[data-band="1"] .scr-src { color: var(--c-accent-ink); }
.scr-walk[data-band="1"][data-plain="1"] .scr-band { background: var(--c-bg); color: var(--c-ink); border-top: 8px solid var(--c-ink); }
.scr-walk[data-band="1"][data-plain="1"] .scr-src { color: var(--c-ink); }
.scr-walk .scr-fig { position: absolute; top: 0; width: 560px; height: 150px; }
.scr-walk .scr-fig[data-shown="0"] { visibility: hidden; }
.scr-walk .scr-fig-label { position: absolute; left: 0; top: 22px; white-space: nowrap; }
.scr-walk .scr-fig-value { position: absolute; left: 0; top: 68px; display: flex; align-items: baseline; gap: 16px; white-space: nowrap; }
.scr-walk .scr-fig-value .voice { font-size: 56px; line-height: 1; }
.scr-walk .scr-fig-value .num { font-size: 100px; text-transform: uppercase; }

/* =============================================================================
   2. LIVE SCORECARD. The controls are the theme's (.btn .seg .stepper
      .verdict); this file lays them out. Shared structure first.
   ========================================================================== */
.scr-live { color: var(--c-ink); font-family: var(--f-body, "Archivo", sans-serif); font-weight: 500; font-synthesis: none; }
.scr-live :is(h3, p, ul, li) { margin: 0; padding: 0; }
.scr-live .scr-board { display: grid; }
.scr-live .scr-board > * { min-width: 0; }
.scr-live .scr-pick {
  appearance: none; -webkit-appearance: none; flex: none; margin: 0; padding: 0; border: var(--scr-line) solid var(--c-ink); border-radius: 0;
  background: var(--c-bg); color: var(--c-ink); cursor: pointer; line-height: 1; font-family: var(--f-body, "Archivo", sans-serif);
}
.scr-live .scr-head[data-selected="1"] .scr-pick { background: var(--c-ink); color: var(--c-bg); }
.scr-live .scr-pick:focus-visible { outline: 6px solid var(--c-ink); outline-offset: -6px; }
.scr-live .scr-measure { position: absolute; left: -9999px; top: 0; visibility: hidden; white-space: pre; pointer-events: none; }
.scr-live .scr-name {
  appearance: none; -webkit-appearance: none; min-width: 0; margin: 0; border: 0; border-bottom: var(--w-hair, 3px) solid var(--c-ink); border-radius: 0;
  background: transparent; color: var(--c-ink); font-family: var(--f-body, "Archivo", sans-serif); font-weight: 700; text-overflow: ellipsis; outline: 0;
}
.scr-live .scr-name:focus { background: var(--c-bg-alt); border-bottom-width: var(--w-rule, 6px); }
.scr-live .scr-name::placeholder { color: var(--c-ink-soft); opacity: 1; }
.scr-live .scr-cell { display: flex; align-items: center; }
.scr-live .scr-chipslot { display: flex; flex: none; }
.scr-live .scr-result[data-outcome="winner"] { background: var(--c-accent); color: var(--c-accent-ink); }

.scr-live .scr-ctl { display: flex; flex-direction: column; min-width: 0; }
.scr-live .scr-ctl-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; }
.scr-live .scr-ctl-label { min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr-live .scr-ctl-note { flex: none; font-weight: 600; white-space: nowrap; }
.scr-live .scr-ctl .stepper, .scr-live .scr-ctl .seg { display: flex; width: 100%; }
.scr-live .scr-ctl .seg > button { flex: 1 1 0; min-width: 0; padding: 0; }
.scr-live .scr-mid {
  flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 0.12em; overflow: hidden; cursor: text;
  border-top: var(--w-rule, 6px) solid var(--c-ink); border-bottom: var(--w-rule, 6px) solid var(--c-ink); background: var(--c-bg);
  font-family: var(--f-display, "Archivo", sans-serif); font-weight: 900; font-stretch: 62%; font-variant-numeric: tabular-nums; line-height: 1;
}
.scr-live .scr-mid > input {
  appearance: none; -webkit-appearance: none; min-width: 0; max-width: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; outline: 0;
  background: transparent; color: var(--c-ink); font: inherit; font-stretch: inherit; text-align: center;
}
.scr-live .scr-mid:focus-within { background: var(--c-bg-alt); }
.scr-live .scr-mid.is-text { justify-content: flex-start; font-family: var(--f-body, "Archivo", sans-serif); font-weight: 700; font-stretch: 100%; border: var(--w-hair, 3px) solid var(--c-ink); border-bottom-width: var(--w-rule, 6px); }
.scr-live .scr-mid.is-text > input { flex: 1 1 0; width: 100%; text-align: left; }
.scr-live .scr-ctl > .scr-mid { flex: none; }
.scr-live .scr-mid.is-word { font-family: var(--f-body, "Archivo", sans-serif); font-weight: 700; font-stretch: 100%; white-space: nowrap; cursor: default; }
.scr-live .scr-ctl[aria-invalid="true"] .scr-mid { background-image: var(--hatch, repeating-linear-gradient(135deg, var(--c-ink) 0 4px, transparent 4px 12px)); }
.scr-live .scr-ctl[aria-invalid="true"] .scr-mid > input, .scr-live .scr-ctl[aria-invalid="true"] .scr-unit { background: var(--c-bg); }

/* =============================================================================
   3. LIVE SCORECARD on the stage (1920 x 1080). The component is a
      1736 x 908 box; the slide puts it at (128, 150), under a headline whose
      cap top is on the act's usual line (--m-y).
   ========================================================================== */
.scr-live.scr--stage { position: absolute; inset: 0; --scr-line: 6px; }
.scr--stage .scr-tools { position: absolute; left: 0; top: 0; width: 248px; height: 128px; display: flex; flex-direction: column; z-index: 4; }
/* the two buttons stand in the board's empty corner, so the headline above can be full size */
.scr--stage .scr-tools .btn { width: 100%; height: 67px; padding: 0; }
.scr--stage .scr-tools .btn + .btn { margin-top: -6px; }

.scr--stage .scr-board { position: absolute; left: 0; top: 0; width: 1736px; grid-template-columns: 248px repeat(3, 496px); grid-template-rows: 128px repeat(4, 64px) 94px; }
.scr--stage .scr-head { display: flex; flex-direction: column; padding: 0; }
.scr--stage .scr-pick { display: flex; align-items: center; gap: 18px; width: 100%; height: 64px; padding: 0 22px; border-width: 0 0 3px; text-align: left; }
.scr--stage .scr-pick b { font-family: var(--f-display); font-size: 52px; font-weight: 900; font-stretch: 62%; line-height: 1; }
.scr--stage .scr-pick span { line-height: 1; }
.scr--stage .scr-name { width: 100%; height: 64px; padding: 0 22px; border-bottom: 6px solid var(--c-line); font-size: 34px; }
.scr--stage .scr-name:focus { border-bottom-width: 6px; }
.scr--stage .scr-pickname { display: none; }
.scr--stage .scr-corner { border-bottom: 6px solid var(--c-line); }
.scr--stage .scr-glabel { display: flex; align-items: center; border-bottom: 3px solid var(--c-line); font-size: 56px; line-height: 1; }
.scr--stage .scr-cell { gap: 14px; padding: 0 22px; border-bottom: 3px solid var(--c-line); }
.scr--stage .scr-row-last { border-bottom-width: 6px; }
.scr--stage .scr-chipslot { width: 172px; }
.scr--stage .scr-cell .verdict { --vh: 56px; }
.scr--stage .scr-cell .verdict.is-notyet { padding: 0 10px; font-size: 32px; }
.scr--stage .scr-metric { min-width: 0; max-height: 60px; overflow: hidden; font-size: 32px; line-height: 30px; font-weight: 600; font-stretch: 87.5%; text-wrap: balance; }
.scr--stage .scr-rlabel { align-self: center; line-height: 36px; }
.scr--stage .scr-result { display: flex; flex-direction: column; justify-content: center; padding: 0 16px; margin: 6px 6px 0; }
.scr--stage .scr-result-main { display: flex; align-items: baseline; gap: 12px; white-space: nowrap; }
.scr--stage .scr-result-main .scr-d { font-size: 56px; line-height: 0.9; font-variant-numeric: tabular-nums; }
.scr--stage .scr-result-main span { font-size: 32px; font-weight: 600; }
.scr--stage .scr-result-sub { margin-top: 2px; font-size: 32px; line-height: 34px; font-weight: 600; font-stretch: 87.5%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr--stage .scr-result[data-outcome="no"] .scr-result-main span { font-size: 36px; }
.scr--stage .scr-result[data-fit="tight"] .scr-result-main .scr-d { font-size: 44px; }
.scr--stage .scr-result[data-fit="tight"] .scr-result-main span { font-size: 28px; }

/* the candidate being edited: two posts and a lintel that run into the editor's frame */
.scr--stage .scr-sel { position: absolute; top: 0; width: 496px; height: 484px; border: 6px solid var(--c-ink); border-bottom: 0; pointer-events: none; z-index: 3; }
.scr--stage .scr-sel::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: var(--c-bg); }

.scr--stage .scr-editor, .scr--stage .scr-rules {
  position: absolute; left: 0; top: 478px; width: 1736px; height: 344px; border: 6px solid var(--c-ink); background: var(--c-bg);
  padding: 4px 20px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 108px; column-gap: 28px; align-content: start;
}
.scr--stage .scr-rules { z-index: 4; height: 418px; grid-template-rows: repeat(2, 108px); grid-auto-rows: auto; }   /* open, it also covers the one-line footer: the full rules are in it */
.scr--stage .scr-ctl { justify-content: center; gap: 2px; }
.scr--stage .scr-ctl-label { font-size: 32px; line-height: 34px; }
.scr--stage .scr-ctl-note { font-size: 32px; line-height: 34px; font-stretch: 87.5%; }
.scr--stage .scr-mid { height: 72px; font-size: 56px; padding: 0 8px; }
.scr--stage .scr-mid[data-long="1"] { font-size: 44px; }
.scr--stage .scr-mid[data-long="2"] { font-size: 34px; }
.scr--stage .scr-mid.is-word { font-size: 34px; font-stretch: 87.5%; }
.scr--stage .scr-ctl .seg > button { font-stretch: 100%; letter-spacing: 0.06em; }
.scr--stage .scr-unit { font-size: 44px; }
.scr--stage .scr-ctl-name, .scr--stage .scr-detail, .scr--stage .scr-bar, .scr--stage .scr-rules-head { display: none; }
.scr--stage .scr-rules-text, .scr--stage .scr-rules-note { grid-column: 1 / -1; font-size: 36px; line-height: 42px; font-weight: 500; text-wrap: pretty; }
.scr--stage .scr-rules-text { margin-top: 12px; font-weight: 600; }
/* one line at label size: the rules are defaults and RULES is where they change (a warning may take two) */
.scr--stage .scr-assume { position: absolute; left: 0; top: 832px; width: 1736px; max-width: none; font-size: 32px; line-height: 38px; font-stretch: 90%; text-wrap: pretty; }

/* =============================================================================
   4. LIVE SCORECARD as a page: a phone first (360px), then wider. The theme's
      controls are sized for the stage, so their sizes are set again here.
   ========================================================================== */
.scr-live.scr--page { --scr-line: 2px; position: relative; font-size: 1rem; line-height: 1.4; }
.scr--page .btn { height: 2.75rem; padding: 0 0.9rem; border-width: 2px; font-size: 0.78rem; }
.scr--page .verdict { --vh: 2rem; min-width: 0; letter-spacing: 0; }
.scr--page .verdict.is-pass { border-width: 2px; border-top-width: 0.5rem; }
.scr--page .verdict.is-notyet { border-width: 2px; font-size: 0.6rem; padding: 0 0.35rem; letter-spacing: 0.04em; }
.scr--page .label { font-size: 0.66rem; line-height: 1.2; letter-spacing: 0.06em; font-stretch: 100%; }
.scr--page .source-line { font-size: 0.85rem; line-height: 1.45; letter-spacing: 0; }
.scr--page .stepper { height: 3rem; }
.scr--page .stepper > button { width: 3rem; padding: 0 0 0.2rem; border-width: 2px; font-size: 2.2rem; }
.scr--page .seg > button { height: 3rem; border-width: 2px; font-size: 0.85rem; letter-spacing: 0.06em; }
.scr--page .seg > button + button { margin-left: -2px; }
.scr--page .scr-mid { height: 3rem; border-top-width: 2px; border-bottom-width: 2px; font-size: 1.9rem; padding: 0 0.3rem; }
.scr--page .scr-mid[data-long="1"] { font-size: 1.6rem; }
.scr--page .scr-mid[data-long="2"] { font-size: 1.25rem; }
.scr--page .scr-mid.is-text { border-width: 2px; font-size: 1.05rem; padding: 0 0.6rem; }
.scr--page .scr-mid.is-word { font-size: 1.05rem; }
.scr--page .scr-unit { font-size: 1.5rem; }

.scr--page .scr-tools { display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 0.75rem; }
.scr--page .scr-sel { display: none; }
.scr--page .scr-board { grid-template-columns: 4.4rem repeat(3, minmax(0, 1fr)); border-top: 4px solid var(--c-ink); border-bottom: 4px solid var(--c-ink); }
.scr--page .scr-corner { border-bottom: 2px solid var(--c-ink); }
.scr--page .scr-head { padding: 0.5rem 0.25rem 0.25rem; display: flex; flex-direction: column; align-items: stretch; gap: 0.2rem; }
.scr--page .scr-pick { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.1rem; width: 100%; height: 3.4rem; }
.scr--page .scr-pick b { font-family: var(--f-display); font-size: 1.9rem; font-weight: 900; font-stretch: 62%; line-height: 1; }
.scr--page .scr-pick span.label { font-size: 0.56rem; }
.scr--page .scr-pickname { font-size: 0.72rem; line-height: 1.15; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; min-height: 1.66rem; }
.scr--page .scr-name { display: none; }
.scr--page .scr-head { border-bottom: 2px solid var(--c-ink); }
.scr--page .scr-glabel { display: flex; align-items: center; font-size: 1.05rem; line-height: 1; border-bottom: 1px solid var(--c-ink); overflow: hidden; }
.scr--page .scr-cell { flex-direction: column; align-items: flex-start; gap: 0.2rem; padding: 0.4rem 0.25rem; border-bottom: 1px solid var(--c-ink); }
.scr--page .scr-row-last { border-bottom-width: 2px; }
.scr--page .scr-metric { display: none; min-width: 0; font-size: 0.8rem; line-height: 1.2; font-weight: 600; }
.scr--page .scr-rlabel { align-self: center; padding-right: 0.25rem; }
.scr--page .scr-result { padding: 0.5rem 0.3rem; margin: 0.25rem 0.1rem; }
.scr--page .scr-result-main { display: flex; flex-direction: column; }
.scr--page .scr-result-main .scr-d { font-size: 1.45rem; line-height: 1; white-space: nowrap; }
.scr--page .scr-result-main span { font-size: 0.72rem; line-height: 1.2; font-weight: 600; }
.scr--page .scr-result-sub { display: none; font-size: 0.72rem; line-height: 1.25; font-weight: 600; margin-top: 0.2rem; }
.scr--page .scr-result[data-fit="tight"] .scr-result-main .scr-d { font-size: 1.1rem; }

/* the verdict for the candidate in hand, kept in view while its numbers are edited */
.scr--page .scr-bar { position: sticky; bottom: 0; z-index: 5; display: flex; gap: 0.75rem; align-items: center; margin: 1.25rem -1rem 0; padding: 0.6rem 1rem; background: var(--c-ink); color: var(--c-bg); }
.scr--page .scr-bar .verdict.is-no { background: var(--c-bg); color: var(--c-ink); }
.scr--page .scr-bar .verdict.is-pass { border-color: var(--c-bg); color: var(--c-bg); }
.scr--page .scr-bar-text { font-size: 0.85rem; line-height: 1.3; font-weight: 600; min-width: 0; }

.scr--page .scr-editor, .scr--page .scr-rules { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.9rem 1rem; margin-top: 1.25rem; }
.scr--page .scr-rules { padding: 1rem; border: 2px solid var(--c-ink); }
.scr--page .scr-rules-head { font-size: 1.6rem; line-height: 1; }
.scr--page .scr-rules-note { font-size: 0.9rem; }
.scr--page .scr-rules-text { display: none; }   /* the page prints the rules under the screener already */
.scr--page .scr-ctl { gap: 0.3rem; }
.scr--page .scr-ctl-label, .scr--page .scr-ctl-note { font-size: 0.9rem; line-height: 1.25; }
.scr--page .scr-ctl-label { white-space: normal; }
.scr--page .scr-ctl-note { font-size: 0.8rem; }
.scr--page .scr-ctl-name { grid-column: 1 / -1; }

.scr--page .scr-detail { margin-top: 1.5rem; border-top: 4px solid var(--c-ink); padding-top: 0.75rem; }
.scr--page .scr-detail-head { font-size: 1.6rem; line-height: 1; overflow-wrap: anywhere; }
.scr--page .scr-detail-sum { margin-top: 0.4rem; font-size: 1rem; font-weight: 600; }
.scr--page .scr-detail-list { list-style: none; padding: 0; margin-top: 0.75rem; }
.scr--page .scr-detail-list li { display: grid; grid-template-columns: 5.25rem minmax(0, 1fr); gap: 0.2rem 0.75rem; padding: 0.7rem 0; border-top: 1px solid var(--c-ink); }
.scr--page .scr-detail-gate { font-size: 1.3rem; line-height: 1; grid-column: 2; }
.scr--page .scr-detail-list .verdict { grid-row: 1 / span 2; align-self: start; justify-self: start; }
.scr--page .scr-detail-why { grid-column: 2; font-size: 0.92rem; line-height: 1.35; }
.scr--page .scr-detail-warn { margin-top: 0.6rem; padding: 0.6rem 0.75rem; border: 2px solid var(--c-ink); font-size: 0.9rem; font-weight: 600; }
.scr--page .scr-assume { margin-top: 1.25rem; }

@media (min-width: 560px) {
  .scr--page .scr-editor, .scr--page .scr-rules { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scr--page .scr-rules-head, .scr--page .scr-rules-note { grid-column: 1 / -1; }
  .scr--page .scr-board { grid-template-columns: 6.4rem repeat(3, minmax(0, 1fr)); }
  .scr--page .scr-glabel { font-size: 1.4rem; }
  .scr--page .scr-result-sub { display: block; }
}
@media (min-width: 760px) {
  .scr--page .verdict { --vh: 2.4rem; }
  .scr--page .verdict.is-notyet { font-size: 0.7rem; }
  .scr--page .scr-head { gap: 0.4rem; padding: 0.6rem 0.6rem 0.45rem; }
  .scr--page .scr-pick { flex: none; flex-direction: row; align-self: flex-start; gap: 0.45rem; width: auto; height: 2.75rem; padding: 0 0.6rem; }
  .scr--page .scr-pick span.label { font-size: 0.64rem; }
  .scr--page .scr-pickname { display: none; }
  .scr--page .scr-name { display: block; width: 100%; height: 2.5rem; font-size: 1.05rem; padding: 0 0.2rem; }
  .scr--page .scr-ctl-name { display: none; }
  .scr--page .scr-cell { flex-direction: row; align-items: center; gap: 0.6rem; padding: 0.5rem 0.6rem; }
  .scr--page .scr-chipslot { width: 5.6rem; }
  .scr--page .scr-metric { display: block; }
  .scr--page .scr-result { padding: 0.6rem; margin: 0.3rem; }
  .scr--page .scr-result-main { flex-direction: row; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }
  .scr--page .scr-result-main .scr-d { font-size: 2rem; }
  .scr--page .scr-result-main span { font-size: 0.85rem; }
  .scr--page .scr-editor, .scr--page .scr-rules { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .scr--page .scr-bar { display: none; }
}
@media (min-width: 1100px) {
  .scr--page .scr-editor, .scr--page .scr-rules { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .scr--page .scr-board { grid-template-columns: 8rem repeat(3, minmax(0, 1fr)); }
  .scr--page .scr-glabel { font-size: 2rem; }
  .scr--page .scr-head { flex-direction: row; align-items: center; gap: 0.5rem; }
  .scr--page .scr-pick { align-self: center; }
  .scr--page .scr-name { flex: 1 1 0; width: auto; height: 2.75rem; }
  .scr--page .scr-metric { font-size: 0.95rem; }
  .scr--page .scr-name { font-size: 1.2rem; }
}
`;

  function injectCss() {
    if (doc.querySelector('style[data-from="scenes/screener.js"]')) { return; }
    var style = doc.createElement('style');
    style.setAttribute('data-from', 'scenes/screener.js');
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }


  /* ===========================================================================
   * WALKTHROUGH
   * ========================================================================= */

  /*
   * The script: one beat per deck step.
   *   overview                  three candidates, four gates, nothing judged
   *   intro   { c }             candidate c steps up; its inputs are printed in the bays
   *   gate    { c, g, verdict } gate g says 'pass' or 'no'; a candidate stops at its first NO
   *   payoff  { c }             a survivor gets its three figures
   */
  function buildBeats(results) {
    var beats = [{ type: 'overview' }];
    results.forEach(function (r, c) {
      beats.push({ type: 'intro', c: c });
      var states = gateStates(r);
      for (var g = 0; g < states.length; g++) {
        if (states[g].state === 'notyet') { break; }
        beats.push({ type: 'gate', c: c, g: g, verdict: states[g].state });
      }
      if (r.verdict === 'YES') { beats.push({ type: 'payoff', c: c }); }
    });
    return beats;
  }

  function walkthroughResults() {
    var cands = exampleCandidates().slice(0, Math.max(1, Math.min(3, (your().candidates || []).length || 3)));
    var ranked = gates().rank(cands);
    var byIndex = [];
    ranked.forEach(function (r) { byIndex[r.inputOrder] = r; });
    return byIndex;
  }

  /* How many deck steps the worked example needs (the slide definition asks). */
  function walkthroughSteps() {
    try { return buildBeats(walkthroughResults()).length - 1; }
    catch (e) { return 0; }
  }

  /* The inputs a gate judges, in plain words, for the bays. Every number is the candidate's own. */
  function inputLines(r) {
    var CM = cm();
    var c = r.candidate;
    var n = CM.number;
    var tier = r.tier ? CM.tier(r.tier, r.assumptions.tokens) : null;
    var out = { cost: [], 'return': [], effort: [], potential: [] };

    out.cost.push(tier ? tierShort(tier) + ', ' + CM.money(r.pricePerRun) + ' a run' : 'No tool chosen');
    out.cost.push(c.toolsPerMonth > 0 ? CM.money(c.toolsPerMonth) + ' a month in tools' : 'No tools to pay for');

    out['return'].push('Saves ' + n(c.minutesPerRun) + ' ' + plural(c.minutesPerRun, 'minute') + ', ' +
      n(c.runsPerWeek) + ' ' + plural(c.runsPerWeek, 'time') + ' a week');
    if (c.lens === 'service') {
      out['return'].push(n(CM.tidy(c.capacityConversion * 100)) + '% of the freed time becomes paid work');
    }
    // The return gate's exemption is days off the cash cycle, not the cash path itself (Gates' rule), so
    // the bay prints the days whenever there are any.
    var days = c.lens === 'service' ? 0 : Number(c.daysOffCashCycle) || 0;
    if (days > 0) { out['return'].push('Gets cash in ' + n(days) + ' ' + plural(days, 'day') + ' sooner'); }
    else if (c.lens !== 'service') { out['return'].push(c.touchesCashPath ? 'On the cash path, no sooner' : 'Off the cash path'); }

    out.effort.push(n(c.buildHours) + ' ' + plural(c.buildHours, 'hour') + ' to build');
    if (c.rolloutHours > 0) { out.effort.push(n(c.rolloutHours) + ' ' + plural(c.rolloutHours, 'hour') + ' to roll out'); }
    out.effort.push(n(c.upkeepHoursPerMonth) + ' ' + plural(c.upkeepHoursPerMonth, 'hour') + ' a month to keep alive');

    out.potential.push('Grows ' + n(c.growth) + TIMES + ' in a year');
    out.potential.push(c.ownerNamed ? 'Someone owns the freed time' : 'Nobody owns the freed time');
    return out;
  }

  function Walkthrough(host, opts, api) {
    var G = gates();
    var CM = cm();
    var M = (api && api.motion) || window.Motion || null;
    var printing = !!(api && api.mode && api.mode.print);
    var results = walkthroughResults();
    var beats = buildBeats(results);
    var states = results.map(gateStates);
    var inputs = results.map(inputLines);
    var slideEl = host.closest ? host.closest('.slide') : null;

    /* the timing, in seconds: the theme's note values (120 BPM), with the same fallbacks */
    var D = (theme() && theme().motion && theme().motion.dur) || {};
    var T = {
      shut: D.drop || 0.375,            // the gate being examined comes down to the floor
      shutHold: 0.25,                   // ...stays shut for an eighth
      lift: D.lift || 0.5,              // ...and lifts over one beat
      holdBefore: D.holdBefore || 0.8,  // before a NO the bay is held vacant
      drop: D.drop || 0.375,            // a NO falls for three sixteenths
      hold: D.hold || 1,                // stop-time in negative: two beats
      wipe: 0.25, swing: 1 / 3
    };

    /* the last gate beat of each candidate: from there on its tab shows the result */
    var lastGateBeat = [];
    beats.forEach(function (b, k) { if (b.type === 'gate') { lastGateBeat[b.c] = k; } });

    /* ---- DOM: the theme's dock, three tabs above it, the reason below ---- */
    var root = doc.createElement('div');
    root.className = 'scr scr-walk';

    var tabsHtml = results.map(function (r, c) {
      return '<div class="scr-tab" data-cand="' + c + '" data-status="waiting">' +
        '<div class="scr-tab-pitch label is-tight">' + LETTERS[c] + (r.candidate.pitch ? DOT + esc(r.candidate.pitch) : '') + '</div>' +
        '<div class="scr-tab-name">' + esc(r.name || 'Candidate ' + LETTERS[c]) + '</div>' +
        '<div class="scr-tab-foot"><span class="scr-track">' + G.ORDER.map(function () { return '<i class="gate-glyph"></i>'; }).join('') + '</span>' +
        '<span class="scr-tab-result label is-tight"></span></div></div>';
    }).join('');

    var gatesHtml = G.GATES.map(function (gate, g) {
      return '<article class="gate is-still" data-gate="' + gate.id + '" data-state="vacant">' +
        '<i class="gate-shutter"></i>' +
        '<p class="gate-n">Gate ' + (g + 1) + '</p>' +
        '<h3 class="gate-name">' + esc(gate.label) + '</h3>' +
        '<div class="gate-q"></div>' +
        '<p class="gate-why"></p>' +
      '</article>';
    }).join('');

    root.innerHTML =
      '<div class="scr-tabs">' + tabsHtml + '</div>' +
      '<div class="dock scr-dock">' + gatesHtml + '</div>' +
      '<p class="scr-cap" aria-live="polite"></p>' +
      '<div class="scr-band">' + [0, 1, 2].map(function (i) {
        return '<div class="scr-fig" data-shown="1" style="left:' + (40 + i * 590) + 'px"><span class="scr-fig-label label is-tight"></span><span class="scr-fig-value"></span></div>';
      }).join('') + '</div>' +
      '<p class="scr-src source-line"></p>';
    host.appendChild(root);

    var tabs = Array.prototype.slice.call(root.querySelectorAll('.scr-tab'));
    var gateEls = Array.prototype.slice.call(root.querySelectorAll('.gate'));
    var tabsEl = root.querySelector('.scr-tabs');
    var cap = root.querySelector('.scr-cap');
    var src = root.querySelector('.scr-src');
    var band = root.querySelector('.scr-band');
    var figs = Array.prototype.slice.call(root.querySelectorAll('.scr-fig'));

    function fitText() {
      fitOneLine(tabs.map(function (t) { return t.querySelector('.scr-tab-name'); }), 62);
      fitOneLine([src], 75);
    }

    /* ---- words ---- */
    function assumptionsLine(withCash) {
      var first = results[0];
      if (!first) { return ''; }
      var a = first.assumptions;
      var parts = [
        'Example candidates',
        'time at ' + CM.money(a.rates.loadedHourly) + ' an hour',
        'building at ' + CM.money(a.rates.builderHourly) + ' an hour',
        CM.number(a.rates.workWeeks) + ' working weeks a year'
      ];
      if (withCash != null) {
        var r = results[withCash];
        parts.pop();
        parts.push('cash freed is ' + CM.number(r.candidate.daysOffCashCycle) + ' ' + plural(r.candidate.daysOffCashCycle, 'day') +
          ' of sales (' + a.company.label + ')');
      }
      return parts.join(DOT);
    }

    function payoffFigures(r) {
      var list = [];
      var weeks = splitAbout(G.formatWeeks(r.paybackWeeks));
      list.push({ label: 'Pays back in', about: weeks.about, text: weeks.text });
      var value = aboutFigure(r.twoYearValue);
      list.push({ label: 'Worth over two years', about: value.about, text: value.text });
      if (r.cashFreed > 0) {
        var cash = aboutFigure(r.cashFreed);
        list.push({ label: 'Cash freed, one time', about: cash.about, text: cash.text });
      } else {
        list.push({ label: 'Comes back each year', about: false, text: CM.money(r.returnPerYear) });
      }
      return list;
    }

    /* ---- one gate ---- */

    /* state: 'vacant' | 'shut' | 'pass' | 'no' | 'notyet'. `moving` lets the theme play its move. */
    function setGate(g, state, moving) {
      var gate = gateEls[g];
      gate.classList.toggle('is-still', !moving);
      gate.classList.toggle('is-shut', state === 'shut');
      gate.classList.toggle('is-pass', state === 'pass');
      gate.classList.toggle('is-no', state === 'no');
      gate.setAttribute('data-state', state);
    }

    /* what is printed in the bay. c is the candidate at the gates (null: nobody yet). */
    function fillGate(g, c, state) {
      var gate = gateEls[g];
      var q = gate.querySelector('.gate-q');
      var why = gate.querySelector('.gate-why');
      var html = '';
      var fine = '';
      if (c == null) {
        html = '<span class="scr-q">' + esc(G.GATES[g].question) + '</span>';
      } else if (state === 'pass') {
        var m = splitMetric(states[c][g].gate.metricText);
        html = '<span class="scr-metric scr-d">' + esc(m.main) + '</span>' + (m.sub ? '<span class="scr-sub">' + esc(upperFirst(m.sub)) + '</span>' : '');
        fine = 'carried forward';
      } else if (state === 'no') {
        fine = states[c][g].gate.metricText;          // the figure that stopped it, printed on the shutter
      } else if (state === 'notyet') {
        html = '<span>' + verdictHtml('notyet') + '</span>';
      } else {
        html = inputs[c][G.ORDER[g]].map(function (line) { return '<span class="scr-in">' + esc(line) + '</span>'; }).join('');
      }
      q.innerHTML = html;
      why.textContent = fine;
    }

    function landed(k, c, g) {
      return beats.some(function (b, kk) { return kk <= k && b.type === 'gate' && b.c === c && b.g === g; });
    }

    /* ---- one moment: everything on screen is a function of the beat number ---- */
    function renderStatic(k) {
      var b = beats[k];
      var cur = b.type === 'overview' ? null : b.c;

      // tabs: who is up, and what became of the ones already judged
      tabs.forEach(function (tab, c) {
        var judged = lastGateBeat[c] != null && k >= lastGateBeat[c];
        tab.setAttribute('data-status', c === cur ? 'current' : (judged ? 'done' : 'waiting'));
        tab.classList.toggle('on-ink', c === cur);
        var marks = tab.querySelectorAll('.gate-glyph');
        var noAt = null;
        states[c].forEach(function (s, g) {
          var here = landed(k, c, g);
          marks[g].className = 'gate-glyph' + (here && s.state !== 'notyet' ? ' is-' + s.state : '');
          if (here && s.state === 'no') { noAt = s.gate.label; }
        });
        tab.querySelector('.scr-tab-result').textContent = !judged ? '' : (noAt ? 'No at ' + noAt : 'Passes all four');
      });

      // the dock: this candidate's four gates
      var stopped = false;
      gateEls.forEach(function (gate, g) {
        var state = 'vacant';
        if (cur != null) {
          if (landed(k, cur, g)) { state = states[cur][g].state; if (state === 'no') { stopped = true; } }
          else if (stopped) { state = 'notyet'; }
        }
        setGate(g, state, false);
        fillGate(g, cur, state);
      });

      // the reason, in the gate's own words
      cap.style.fontSize = '';
      if (b.type === 'gate') {
        var gate = states[b.c][b.g].gate;
        cap.innerHTML = '<b>' + esc(gate.label) + '.</b> ' + esc(gate.reason);
        if (cap.scrollHeight > 100) { cap.style.fontSize = '36px'; }
      } else {
        cap.textContent = '';
      }

      // the survivor's figures
      var paying = b.type === 'payoff';
      root.setAttribute('data-band', paying ? '1' : '0');
      root.setAttribute('data-plain', paying && !results[b.c].winner ? '1' : '0');
      if (paying) {
        var r = results[b.c];
        payoffFigures(r).forEach(function (f, i) {
          figs[i].setAttribute('data-shown', '1');
          figs[i].querySelector('.scr-fig-label').textContent = f.label;
          figs[i].querySelector('.scr-fig-value').innerHTML =
            (f.about ? '<span class="voice">about</span>' : '') + '<span class="num">' + esc(f.text) + '</span>';
        });
        src.textContent = assumptionsLine(r.cashFreed > 0 ? b.c : null);
      } else {
        src.textContent = assumptionsLine(null);
      }
      fitOneLine([src], 75);

      band.style.clipPath = '';
      root.setAttribute('data-beat', k);
      root.setAttribute('data-beat-type', b.type);
    }

    /* ---- motion: only when stepping forward by one, and never in print ---- */
    var playing = null;      // the timeline in flight
    var landing = null;      // THEME.landNo in flight
    var current = 0;

    function stopPlaying() {
      if (playing) { playing.pause(); playing = null; }
      if (landing) { landing.cancel(); landing = null; }
      if (slideEl) { slideEl.classList.remove('is-negative'); }
    }

    /* How a NO lands: the rest of the slide recoils and the slide prints in negative. The NO itself stays put. */
    function land(noGate) {
      if (!slideEl) { return; }
      var t = theme();
      if (t && typeof t.landNo === 'function') {
        var others = Array.prototype.slice.call(slideEl.querySelectorAll('.headline, .tag'));
        others = others.concat([tabsEl, cap, src], gateEls.filter(function (g) { return g !== noGate; }));
        landing = t.landNo(slideEl, { hold: T.hold, recoil: others });
      } else {
        slideEl.classList.add('is-negative');
      }
    }

    function playGate(k) {
      var b = beats[k];
      var tl = M.timeline();
      // The last gate's reason leaves as this gate is called; the new one cuts in when the verdict has landed.
      tl.at(0, function () { cap.textContent = ''; });
      if (b.verdict === 'pass') {
        // The gate comes down, holds for an eighth, and lifts over one beat. The theme plays each move.
        var up = T.shut + T.shutHold;
        tl.at(0, function () { setGate(b.g, 'shut', true); });
        tl.at(up, function () { setGate(b.g, 'pass', true); fillGate(b.g, b.c, 'pass'); });
        tl.at(up + T.lift, function () { renderStatic(k); });
      } else {
        // The bay is held vacant. Then the shutter falls through the floor, the slide recoils and
        // prints in negative for two beats. Only then does the reason cut in.
        var hit = T.holdBefore + T.drop;
        tl.at(0, function () { setGate(b.g, 'no', true); gateEls[b.g].querySelector('.gate-why').textContent = states[b.c][b.g].gate.metricText; });
        tl.at(T.holdBefore, function () { gateEls[b.g].querySelector('.gate-q').innerHTML = ''; });
        tl.at(hit, function () { land(gateEls[b.g]); });
        tl.at(hit + T.hold, function () { if (slideEl) { slideEl.classList.remove('is-negative'); } renderStatic(k); });
      }
      return tl;
    }

    function playPayoff(k) {
      // The band wipes in from the spine; the three figures cut in on the swung beat.
      renderStatic(k);
      var tl = M.timeline();
      figs.forEach(function (f) { f.setAttribute('data-shown', '0'); });
      tl.add({
        from: 100, to: 0, duration: T.wipe, ease: EASE_ARRIVE,
        onUpdate: function (v) { band.style.clipPath = v > 0.05 ? 'inset(0 ' + v.toFixed(2) + '% 0 0)' : ''; }
      }, 0);
      [T.wipe, T.wipe + T.swing, T.wipe + 0.5 + T.swing].forEach(function (at, i) {
        tl.at(at, function () { figs[i].setAttribute('data-shown', '1'); });
      });
      return tl;
    }

    function go(n, dir) {
      var k = Math.max(0, Math.min(beats.length - 1, Math.round(Number(n) || 0)));
      stopPlaying();
      var b = beats[k];
      var animate = M && !printing && dir === 1 && k === current + 1 && (b.type === 'gate' || b.type === 'payoff');
      if (!animate) { renderStatic(k); current = k; return; }
      renderStatic(k - 1);
      current = k;
      var tl = b.type === 'gate' ? playGate(k) : playPayoff(k);
      playing = tl;
      tl.play();
      tl.finished.then(function (done) { if (playing === tl) { playing = null; if (done) { renderStatic(k); } } });
    }

    renderStatic(0);
    fitText();
    whenFontsReady(function () { if (root.parentNode) { fitText(); } });

    return {
      step: function (n, dir) { go(n, dir); },
      resize: function () { fitText(); },
      destroy: function () {
        stopPlaying();
        if (root.parentNode) { root.parentNode.removeChild(root); }
      },
      // for tests
      beats: function () { return clone(beats); },
      results: function () { return results; },
      current: function () { return current; },
      timing: T
    };
  }


  /* ===========================================================================
   * LIVE SCORECARD
   * ========================================================================= */

  /* The number controls of one candidate. `step` is what one press of - or + changes. */
  var FIELDS = [
    { key: 'minutesPerRun',         label: 'Minutes saved each time',  step: 1,   max: 480 },
    { key: 'runsPerWeek',           label: 'Times a week',             step: 5,   max: 10000 },
    { key: 'tier',                  label: 'What runs it',             type: 'cycle' },
    { key: 'toolsPerMonth',         label: 'Tools, a month',           step: 10,  max: 100000, pre: '$' },
    { key: 'buildHours',            label: 'Build and rollout hours',  step: 4,   max: 10000 },
    { key: 'upkeepHoursPerMonth',   label: 'Upkeep hours a month',     step: 0.5, max: 500 },
    { key: 'growth',                label: 'Growth over a year',       step: 0.1, max: 10, post: TIMES },
    { key: 'ownerNamed',            label: 'Owner for the freed time', type: 'yesno' },
    { key: 'lens',                  label: 'Product or service',       type: 'lens' },
    { key: 'touchesCashPath',       label: 'On the cash path',         type: 'yesno', lens: 'product' },
    { key: 'daysOffCashCycle',      label: 'Days off the cash cycle',  step: 1,   max: 365, lens: 'product', cash: true },
    { key: 'capacityConversion',    label: 'Becomes paid work',        step: 10,  max: 100, post: '%', share: true, lens: 'service' },
    { key: 'billableMarginPerHour', label: 'Margin per billable hour', step: 5,   max: 1000, pre: '$', lens: 'service' }
  ];

  /* The house rules and the rates behind them. `path` is group.key in the assumptions Gates takes. */
  var RULES = [
    { path: 'houseRules.costMaxShareOfReturn', label: 'Cost limit, of return',  step: 5,       max: 100, post: '%', share: true },
    { path: 'houseRules.minReturnPerYear',     label: 'Return floor, a year',   step: 500,     max: 10000000, pre: '$' },
    { path: 'houseRules.maxPaybackWeeks',      label: 'Payback limit, weeks',   step: 1,       max: 520 },
    { path: 'houseRules.minGrowth',            label: 'Growth minimum',         step: 0.1,     max: 10, post: TIMES },
    { path: 'rates.loadedHourly',              label: 'Staff time, an hour',    step: 5,       max: 1000, pre: '$' },
    { path: 'rates.builderHourly',             label: 'Builder time, an hour',  step: 5,       max: 1000, pre: '$' },
    { path: 'rates.workWeeks',                 label: 'Working weeks a year',   step: 1,       max: 52 },
    { path: 'company.annualRevenue',           label: 'Sales a year',           step: 1000000, max: 100000000000, pre: '$' }
  ];

  /*
   * Every number box has a generous ceiling (`max`, in the units the box shows:
   * a share box counts in percent) and a floor of zero, so a slip such as 9999
   * minutes cannot put a nine-figure result on the projector. A typed figure
   * past either end counts as the end at once and the box shows it when the
   * entry is committed (Enter or leaving the box). Anything that is not a plain
   * number is left exactly as typed, for Gates to point out.
   */
  function clampText(text, spec) {
    var s = String(text == null ? '' : text);
    if (!spec || typeof spec.max !== 'number' || s.trim() === '') { return s; }
    var n = Number(s.replace(/[$,%\s\u00d7x]/gi, ''));
    if (!isFinite(n)) { return s; }
    if (n > spec.max) { return cm().number(spec.max); }
    if (n < 0) { return '0'; }
    return s;
  }

  var GUARD_MS = 1500;   // after Enter commits a box, a reflex Escape within this long is swallowed

  var memory = {};   // live state kept while the page is open, per layout, so leaving a slide does not lose it

  function storageFor(kind) {
    try {
      var s = kind === 'local' ? window.localStorage : (kind === 'session' ? window.sessionStorage : null);
      if (!s) { return null; }
      s.getItem(STORE_KEY);          // throws where storage is blocked
      return s;
    } catch (e) { return null; }
  }

  /* What a number looks like in its box: 0.3 as a share is "30", 1.5 is "1.5", text stays as typed. */
  function shownValue(raw, spec) {
    if (raw == null) { return ''; }
    if (typeof raw === 'number') {
      if (!isFinite(raw)) { return ''; }
      return cm().number(cm().tidy(spec.share ? raw * 100 : raw));      // 20000000 reads as 20,000,000
    }
    var s = String(raw);
    return spec.share ? s.replace(/\s*%\s*$/, '') : s;
  }

  /* What goes to Gates for what was typed. A share box holds a percentage, so it is handed over as "30%". */
  function storedValue(text, spec) {
    var s = String(text == null ? '' : text);
    if (spec.share && s.trim() !== '' && !/%\s*$/.test(s)) { return s.trim() + '%'; }
    return s;
  }

  /* A plain number out of a box, for the - and + buttons only. Anything unreadable counts from zero. */
  function looseNumber(text) {
    var n = Number(String(text == null ? '' : text).replace(/[$,%\s×x]/gi, ''));
    return isFinite(n) ? n : 0;
  }

  function Live(host, opts, api) {
    var G = gates();
    var CM = cm();
    var layout = opts.layout === 'page' ? 'page' : 'stage';
    // On the stage what is typed is kept for this browser tab (sessionStorage), so a reload mid-exercise
    // does not lose the room's candidates; Reset forgets it. The page asks for 'local' itself.
    var persist = opts.persist || (layout === 'stage' ? 'session' : null);
    var storeKey = layout === 'stage' ? STORE_KEY + ':stage' : STORE_KEY;
    var store = storageFor(persist);
    var memoryKey = layout + ':' + (persist || 'none');
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
    var uid = 'scr' + Math.floor(Math.random() * 1e9).toString(36);

    /* ---- state ---- */
    function defaults() {
      var a = G.defaultAssumptions();
      return {
        candidates: exampleCandidates(),
        example: [true, true, true],
        assumptions: { rates: clone(a.rates), company: { annualRevenue: a.company.annualRevenue }, houseRules: clone(a.houseRules) },
        selected: 0,
        rulesOpen: false
      };
    }
    var signature = JSON.stringify(defaults());

    function usable(s) {
      return s && Array.isArray(s.candidates) && s.candidates.length === 3 && s.assumptions &&
        s.assumptions.rates && s.assumptions.houseRules && s.assumptions.company && Array.isArray(s.example);
    }

    function load() {
      if (usable(memory[memoryKey])) { return memory[memoryKey]; }
      if (!store) { return null; }
      try {
        var saved = JSON.parse(store.getItem(storeKey) || 'null');
        if (!saved || saved.v !== 1 || !usable(saved.state)) { return null; }
        // On stage the saved state belongs to one set of examples; if they were edited since, start clean.
        if (persist === 'session' && saved.signature !== signature) { return null; }
        var fresh = defaults();
        saved.state.example.forEach(function (isExample, i) { if (isExample) { saved.state.candidates[i] = fresh.candidates[i]; } });
        saved.state.selected = Math.max(0, Math.min(2, Number(saved.state.selected) || 0));
        saved.state.rulesOpen = false;
        return saved.state;
      } catch (e) { return null; }
    }

    function save() {
      memory[memoryKey] = state;
      if (!store) { return; }
      try { store.setItem(storeKey, JSON.stringify({ v: 1, signature: signature, state: state })); }
      catch (e) { /* storage full or blocked: the page still works */ }
    }

    var state = load() || defaults();

    function assumptions() { return clone(state.assumptions); }

    function evaluateAll() {
      var ranked = G.rank(state.candidates, assumptions());
      var byIndex = [];
      ranked.forEach(function (r) { byIndex[r.inputOrder] = r; });
      return byIndex;
    }

    /* ---- DOM ---- */
    var root = doc.createElement('div');
    root.className = 'scr scr-live scr--' + layout;

    /* The middle of a stepper: the number as a real text box (so it can be typed), with its unit beside it. */
    function midHtml(attrs, spec, isText) {
      return '<span class="scr-mid' + (isText ? ' is-text' : '') + '">' +
        (spec.pre ? '<span class="scr-unit">' + spec.pre + '</span>' : '') +
        '<input type="text" ' + (isText ? '' : 'inputmode="decimal" size="3" autocapitalize="off" ') + 'autocomplete="off" spellcheck="false" data-keys="own" ' + attrs + '>' +
        (spec.post ? '<span class="scr-unit">' + spec.post + '</span>' : '') + '</span>';
    }

    function stepperHtml(attrs, spec) {
      return '<span class="stepper">' +
        '<button type="button" data-dir="-1" aria-label="Less">' + MINUS + '</button>' +
        midHtml(attrs, spec, false) +
        '<button type="button" data-dir="1" aria-label="More">+</button></span>';
    }

    function controlHtml(spec) {
      var id = uid + '-' + spec.key;
      var body;
      if (spec.type === 'cycle') {
        body = '<span class="stepper" role="group" aria-labelledby="' + id + '-l">' +
          '<button type="button" data-dir="-1" aria-label="Cheaper tool">\u2039</button>' +
          '<span class="scr-mid is-word scr-cycle-value" aria-live="polite"></span>' +
          '<button type="button" data-dir="1" aria-label="Dearer tool">\u203a</button></span>';
      } else if (spec.type === 'yesno') {
        body = '<span class="seg" role="group" aria-labelledby="' + id + '-l">' +
          '<button type="button" data-value="true">Yes</button><button type="button" data-value="false">No</button></span>';
      } else if (spec.type === 'lens') {
        body = '<span class="seg" role="group" aria-labelledby="' + id + '-l">' +
          '<button type="button" data-value="product">Product</button><button type="button" data-value="service">Service</button></span>';
      } else {
        body = stepperHtml('id="' + id + '" data-field="' + spec.key + '"', spec);
      }
      return '<div class="scr-ctl" data-ctl="' + spec.key + '"' + (spec.lens ? ' data-lens="' + spec.lens + '"' : '') + (spec.cash ? ' data-cash="1"' : '') + '>' +
        '<div class="scr-ctl-top"><label class="scr-ctl-label" id="' + id + '-l"' + (spec.type ? '' : ' for="' + id + '"') + '>' + esc(spec.label) + '</label>' +
        (spec.type === 'cycle' ? '<span class="scr-ctl-note"></span>' : '') + '</div>' + body + '</div>';
    }

    function ruleHtml(spec) {
      var id = uid + '-' + spec.path.replace('.', '-');
      return '<div class="scr-ctl" data-ctl="' + spec.path + '">' +
        '<div class="scr-ctl-top"><label class="scr-ctl-label" for="' + id + '">' + esc(spec.label) + '</label></div>' +
        stepperHtml('id="' + id + '" data-rule="' + spec.path + '"', spec) + '</div>';
    }

    var boardHtml = '<div class="scr-corner" aria-hidden="true"></div>' +
      [0, 1, 2].map(function (c) {
        return '<div class="scr-head" data-cand="' + c + '">' +
          '<button type="button" class="scr-pick" data-pick="' + c + '" aria-label="Edit candidate ' + LETTERS[c] + '">' +
            '<b>' + LETTERS[c] + '</b><span class="label is-tight" data-tag="' + c + '"></span></button>' +
          '<span class="scr-pickname" aria-hidden="true"></span>' +
          '<input class="scr-name" type="text" autocomplete="off" spellcheck="false" data-keys="own" data-cand="' + c + '" data-field="name" aria-label="Name of candidate ' + LETTERS[c] + '" placeholder="Name it">' +
          '</div>';
      }).join('') +
      G.GATES.map(function (gate, g) {
        var last = g === G.GATES.length - 1 ? ' scr-row-last' : '';
        return '<div class="scr-glabel scr-d' + last + '">' + esc(gate.label) + '</div>' +
          [0, 1, 2].map(function (c) {
            return '<div class="scr-cell' + last + '" data-cand="' + c + '" data-gate="' + gate.id + '" data-state="notyet">' +
              '<span class="scr-chipslot"></span><span class="scr-metric"></span></div>';
          }).join('');
      }).join('') +
      '<div class="scr-rlabel label is-tight"></div>' +
      [0, 1, 2].map(function (c) {
        return '<div class="scr-result" data-cand="' + c + '" data-outcome="no"><div class="scr-result-main"></div><div class="scr-result-sub"></div></div>';
      }).join('');

    root.innerHTML =
      '<div class="scr-tools">' +
        '<button type="button" class="btn is-ghost" data-act="rules" aria-expanded="false">House rules</button>' +
        '<button type="button" class="btn is-ghost" data-act="reset" title="Put the three examples and the default rules back">Reset</button>' +
      '</div>' +
      '<div class="scr-board">' + boardHtml + '</div>' +
      '<i class="scr-sel" aria-hidden="true"></i>' +
      '<div class="scr-editor">' +
        '<div class="scr-ctl scr-ctl-name" data-ctl="name"><div class="scr-ctl-top"><label class="scr-ctl-label" for="' + uid + '-name">What is it called?</label></div>' +
          midHtml('id="' + uid + '-name" data-field="name" placeholder="Name this candidate"', {}, true) + '</div>' +
        FIELDS.map(controlHtml).join('') +
      '</div>' +
      '<div class="scr-rules" hidden>' +
        '<h3 class="scr-rules-head scr-d">House rules</h3>' +
        RULES.map(ruleHtml).join('') +
        '<p class="scr-rules-text"></p>' +
        '<p class="scr-rules-note">These are defaults, not laws. Sales a year only turns days off the cash cycle into dollars.</p>' +
      '</div>' +
      '<div class="scr-detail"></div>' +
      '<p class="scr-assume source-line" role="status"></p>' +
      '<div class="scr-bar" role="status"><span class="scr-bar-chip"></span><span class="scr-bar-text"></span></div>' +
      '<span class="scr-measure" aria-hidden="true"></span>';
    host.appendChild(root);

    var q = function (sel) { return root.querySelector(sel); };
    var qa = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
    var editor = q('.scr-editor');
    var rulesBox = q('.scr-rules');
    var selBox = q('.scr-sel');

    /* ---- reading and writing one candidate field ---- */
    function fieldSpec(key) {
      for (var i = 0; i < FIELDS.length; i++) { if (FIELDS[i].key === key) { return FIELDS[i]; } }
      return { key: key };
    }

    /* The box labelled "build and rollout hours" shows the two added together; typing in it puts the whole figure on the build. */
    function shownField(cand, spec) {
      if (spec.key === 'buildHours') {
        var b = cand.buildHours, r = cand.rolloutHours;
        if (typeof b === 'number' && typeof r === 'number' && isFinite(b) && isFinite(r)) { return CM.number(CM.tidy(b + r)); }
        return shownValue(b, spec);
      }
      return shownValue(cand[spec.key], spec);
    }

    function writeField(c, key, text) {
      var cand = state.candidates[c];
      var spec = fieldSpec(key);
      if (key === 'name') { cand.name = String(text); }
      else if (key === 'buildHours') { cand.buildHours = storedValue(clampText(text, spec), spec); cand.rolloutHours = 0; }
      else if (key === 'touchesCashPath' || key === 'ownerNamed') { cand[key] = text === true || text === 'true'; }
      else if (key === 'lens') { cand.lens = text === 'service' ? 'service' : 'product'; }
      else if (key === 'tier') { cand.tier = String(text); }
      else { cand[key] = storedValue(clampText(text, spec), spec); }
      state.example[c] = false;
    }

    function ruleSpec(path) {
      for (var i = 0; i < RULES.length; i++) { if (RULES[i].path === path) { return RULES[i]; } }
      return null;
    }
    function readRule(path) { var p = path.split('.'); return state.assumptions[p[0]][p[1]]; }
    function writeRule(path, text) {
      var p = path.split('.');
      var spec = ruleSpec(path) || {};
      state.assumptions[p[0]][p[1]] = storedValue(clampText(text, spec), spec);
    }

    /* ---- drawing ---- */

    /* A number box is as wide as its number, so the unit sits right beside it. */
    function sizeInput(input) {
      if (!input.hasAttribute('inputmode')) { return; }
      var length = Math.max(1, String(input.value).length);
      input.style.width = (length + 0.6) + 'ch';
      input.parentNode.setAttribute('data-long', length > 12 ? '2' : (length > 7 ? '1' : '0'));   // a long figure is set a size down
    }

    /*
     * Long names are set narrower (Archivo's width axis), never smaller, until
     * they fit their boxes. The three share one width, because they are equals.
     */
    var measure = null;
    function fitNames() {
      var inputs = qa('.scr-name');
      var first = inputs[0];
      if (!first || !first.clientWidth) { return; }            // not on screen in this layout
      var cs = window.getComputedStyle(first);
      var room = first.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      measure = measure || q('.scr-measure');
      measure.style.fontFamily = cs.fontFamily;
      measure.style.fontSize = cs.fontSize;
      measure.style.fontWeight = cs.fontWeight;
      var fits = function (stretch) {
        measure.style.fontStretch = stretch + '%';
        return inputs.every(function (input) { measure.textContent = input.value || ''; return measure.offsetWidth <= room; });
      };
      var lo = 62, hi = 100;
      if (fits(100)) { lo = 100; }
      else { for (var i = 0; i < 7; i++) { var mid = (lo + hi) / 2; if (fits(mid)) { lo = mid; } else { hi = mid; } } }
      inputs.forEach(function (input) { input.style.fontStretch = lo >= 100 ? '' : Math.floor(lo) + '%'; });
    }

    /*
     * The two-year figure always fits its box. Written out in full when it
     * fits ("$1,234,567"); when it does not, the same figure to three
     * significant figures with its unit ("$45.8B"), which is how money is
     * written on the slides; and if even that is too wide, a size down
     * (data-fit="tight"). The full figure stays in the box's title (Gates'
     * summary). The line under it is fitted the same way.
     */
    function fitResults() {
      qa('.scr-result').forEach(function (box) {
        var main = box.querySelector('.scr-result-main');
        var b = main.querySelector('b[data-full]');
        var sub = box.querySelector('.scr-result-sub');
        box.removeAttribute('data-fit');
        if (b) { b.textContent = b.getAttribute('data-full'); }
        sub.textContent = sub.getAttribute('data-full') || '';
        if (!box.clientWidth) { return; }                      // not on screen in this layout
        var over = function (el) { return el.scrollWidth > el.clientWidth + 0.5; };
        var mainOver = function () { return over(main) || (b && over(b)); };
        if (b && mainOver()) {
          b.textContent = b.getAttribute('data-short');
          if (mainOver()) { box.setAttribute('data-fit', 'tight'); }
        }
        if (sub.getAttribute('data-short') && sub.clientWidth && over(sub)) { sub.textContent = sub.getAttribute('data-short'); }
      });
    }

    function renderEditor() {
      var cand = state.candidates[state.selected];
      var lens = cand.lens === 'service' ? 'service' : 'product';
      qa('.scr-editor input[data-field]').forEach(function (input) {
        var key = input.getAttribute('data-field');
        if (doc.activeElement === input) { return; }          // never rewrite the box being typed in
        input.value = key === 'name' ? (cand.name || '') : shownField(cand, fieldSpec(key));
        sizeInput(input);
      });
      // Days off the cash cycle is asked once the task is on the cash path (or already has days in it, so a
      // number that counts is never hidden). Being on the path is the question; the days are the test.
      var askDays = cand.touchesCashPath === true || cand.touchesCashPath === 'true' || looseNumber(cand.daysOffCashCycle) > 0;
      qa('.scr-editor .scr-ctl[data-lens]').forEach(function (ctl) {
        ctl.hidden = ctl.getAttribute('data-lens') !== lens || (ctl.hasAttribute('data-cash') && !askDays);
      });
      qa('.scr-editor .seg').forEach(function (seg) {
        var key = seg.parentNode.getAttribute('data-ctl');
        var value = key === 'lens' ? lens : String(cand[key] === true || cand[key] === 'true');
        Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
          b.setAttribute('aria-pressed', b.getAttribute('data-value') === value ? 'true' : 'false');
        });
      });
      var tier = CM.tier(cand.tier, state.assumptions.tokens);
      q('[data-ctl="tier"] .scr-cycle-value').textContent = tierShort(tier);
      q('[data-ctl="tier"] .scr-ctl-note').textContent = tier ? CM.money(tier.pricePerRun) + ' a run' : '';
    }

    function renderRules() {
      qa('.scr-rules input[data-rule]').forEach(function (input) {
        if (doc.activeElement === input) { return; }
        var path = input.getAttribute('data-rule');
        input.value = shownValue(readRule(path), ruleSpec(path));
        sizeInput(input);
      });
      rulesBox.hidden = !state.rulesOpen;
      if (layout === 'stage') { editor.hidden = state.rulesOpen; }
      var btn = q('[data-act="rules"]');
      btn.setAttribute('aria-expanded', state.rulesOpen ? 'true' : 'false');
      // On the stage the button stands in the board's corner, which has room for one short word.
      btn.textContent = layout === 'stage' ? (state.rulesOpen ? 'Close' : 'Rules') : (state.rulesOpen ? 'Close rules' : 'House rules');
    }

    /*
     * The assumptions behind every figure, in one place on screen. The house
     * rules are printed in Gates' own sentences (result.gates[id].rule), on the
     * stage and on the page alike, so the screener can never state a rule the
     * math does not apply. Nothing is worked out here.
     */
    function rulesText(r) {
      return 'House rules, yours to change. ' + G.ORDER.map(function (id) { return r.gates[id].rule; }).join(' ');
    }

    function assumptionsLine(r) {
      var a = r.assumptions;
      var meta = (window.BENCHLM && window.BENCHLM.meta) || {};
      if (layout === 'page') {
        var prices = (meta.source || 'the benchmark file') + (meta.retrieved ? ', ' + meta.retrieved : '');
        return rulesText(r) +
          ' Time is valued at ' + CM.money(a.rates.loadedHourly) + ' an hour and building at ' + CM.money(a.rates.builderHourly) +
          ' an hour, over ' + CM.number(a.rates.workWeeks) + ' working weeks a year. A run is priced at ' + CM.number(a.tokens.in) +
          ' tokens in and ' + CM.number(a.tokens.out) + ' out, from the ' + prices + '.';
      }
      // On the stage: one line. The rule sentences themselves are in the RULES drawer, in Gates' words.
      return 'House rules and rates are defaults, yours to change under RULES. A run is ' + CM.number(a.tokens.in) + ' tokens in, ' +
        CM.number(a.tokens.out) + ' out, at ' + (meta.source ? String(meta.source).split(' ')[0] : 'benchmark') + ' prices.';
    }

    var lastResults = [];

    function renderResults() {
      var results = evaluateAll();
      lastResults = results;
      var anyWinner = false;

      results.forEach(function (r, c) {
        var states = gateStates(r);
        var head = q('.scr-head[data-cand="' + c + '"]');
        head.setAttribute('data-selected', c === state.selected ? '1' : '0');
        head.querySelector('.scr-pick').setAttribute('aria-pressed', c === state.selected ? 'true' : 'false');
        var nameInput = head.querySelector('.scr-name');
        if (doc.activeElement !== nameInput) { nameInput.value = state.candidates[c].name || ''; }
        head.querySelector('.scr-pickname').textContent = state.candidates[c].name || 'Candidate ' + LETTERS[c];
        q('[data-tag="' + c + '"]').textContent = state.example[c] ? 'Example' : 'Yours';

        states.forEach(function (s) {
          var cell = q('.scr-cell[data-cand="' + c + '"][data-gate="' + s.id + '"]');
          cell.setAttribute('data-state', s.state);
          cell.querySelector('.scr-chipslot').innerHTML = verdictHtml(s.state);
          var shown = s.state === 'notyet' ? '' : s.gate.metricText;
          var parts = splitMetric(shown);
          cell.setAttribute('data-metric', shown);
          cell.querySelector('.scr-metric').innerHTML = esc(parts.main) + (parts.sub ? '<br>' + esc(parts.sub) : '');
          cell.title = s.state === 'notyet' ? 'Not yet: an earlier gate said no.' : s.gate.reason;
        });

        var box = q('.scr-result[data-cand="' + c + '"]');
        var main = box.querySelector('.scr-result-main');
        var sub = box.querySelector('.scr-result-sub');
        if (r.verdict === 'YES') {
          anyWinner = anyWinner || r.winner;
          box.setAttribute('data-outcome', r.winner ? 'winner' : 'pass');
          main.innerHTML = '<b class="scr-d" data-full="' + esc(CM.money(r.twoYearValue)) + '" data-short="' + esc(CM.shortMoney(r.twoYearValue)) + '"></b><span>over two years</span>';
          if (r.cashFreed > 0) {
            var cash = aboutFigure(r.cashFreed);
            sub.setAttribute('data-full', 'Frees ' + (cash.about ? 'about ' : '') + cash.text + ', one time');
            sub.setAttribute('data-short', 'Frees about ' + CM.shortMoney(r.cashFreed) + ', one time');
          } else {
            sub.setAttribute('data-full', 'Pays back in ' + G.formatWeeks(r.paybackWeeks));
            sub.removeAttribute('data-short');
          }
        } else {
          box.setAttribute('data-outcome', 'no');
          main.innerHTML = '<span>Out at ' + esc(r.gates[r.firstNo].label) + '</span>';
          sub.removeAttribute('data-full');
          sub.removeAttribute('data-short');
        }
        box.setAttribute('data-two-year', String(r.twoYearValue));
        box.title = r.summary;
      });

      fitNames();
      fitResults();
      q('.scr-rlabel').textContent = anyWinner ? 'The math picks' : 'Nothing passes';
      if (layout === 'stage') { selBox.style.left = (248 + state.selected * 496) + 'px'; }

      // the candidate in hand: its problems, its reasons, the line that stays in view
      var r = results[state.selected];
      var problems = {};
      r.inputProblems.forEach(function (p) { problems[p.field] = p.message; });
      qa('.scr-editor .scr-ctl, .scr-rules .scr-ctl').forEach(function (ctl) {
        var key = ctl.getAttribute('data-ctl');
        var message = problems[key] || (key === 'buildHours' ? problems.rolloutHours : null);
        if (message) { ctl.setAttribute('aria-invalid', 'true'); ctl.title = message; }
        else { ctl.removeAttribute('aria-invalid'); ctl.removeAttribute('title'); }
      });

      q('.scr-rules-text').textContent = G.ORDER.map(function (id) { return r.gates[id].rule; }).join(' ');
      q('.scr-assume').textContent = r.warnings.length
        ? 'Check ' + LETTERS[state.selected] + ': ' + r.warnings[0]
        : assumptionsLine(r);

      var states = gateStates(r);
      q('.scr-detail').innerHTML =
        '<h3 class="scr-detail-head scr-d">' + LETTERS[state.selected] + DOT + esc(r.name || 'Candidate ' + LETTERS[state.selected]) + '</h3>' +
        '<p class="scr-detail-sum">' + esc(r.summary) + '</p>' +
        r.warnings.map(function (w) { return '<p class="scr-detail-warn">' + esc(w) + '</p>'; }).join('') +
        '<ul class="scr-detail-list">' + states.map(function (s) {
          return '<li>' + verdictHtml(s.state) + '<span class="scr-detail-gate scr-d">' + esc(s.gate.label) + '</span>' +
            '<span class="scr-detail-why">' + esc(s.state === 'notyet' ? 'Not yet. A candidate stops at its first NO.' : s.gate.reason) + '</span></li>';
        }).join('') + '</ul>';
      q('.scr-bar-chip').innerHTML = verdictHtml(r.verdict === 'YES' ? 'pass' : 'no');
      q('.scr-bar-text').textContent = LETTERS[state.selected] + ': ' + r.summary;

      if (onChange) { try { onChange(results, r.assumptions); } catch (e) { /* the host page's problem, not ours */ } }
      return results;
    }

    function renderAll() { renderEditor(); renderRules(); renderResults(); }

    function changed() { renderResults(); save(); }

    /* ---- events ---- */
    function onInput(e) {
      var t = e.target;
      if (!t || t.tagName !== 'INPUT') { return; }
      sizeInput(t);
      if (t.hasAttribute('data-rule')) { writeRule(t.getAttribute('data-rule'), t.value); changed(); return; }
      var key = t.getAttribute('data-field');
      if (!key) { return; }
      var c = t.hasAttribute('data-cand') ? Number(t.getAttribute('data-cand')) : state.selected;
      writeField(c, key, t.value);
      if (key === 'name') {                                   // the two name boxes are one name
        qa('input[data-field="name"]').forEach(function (other) {
          if (other === t) { return; }
          var oc = other.hasAttribute('data-cand') ? Number(other.getAttribute('data-cand')) : state.selected;
          if (oc === c) { other.value = t.value; }
        });
      }
      changed();
    }

    function nudge(button) {
      var dir = Number(button.getAttribute('data-dir')) || 0;
      var ctl = button.closest('.scr-ctl');
      var key = ctl.getAttribute('data-ctl');
      if (key === 'tier') {
        var ids = CM.tierIds();
        var tier = CM.tier(state.candidates[state.selected].tier, state.assumptions.tokens);
        var at = tier ? ids.indexOf(tier.id) : 0;
        writeField(state.selected, 'tier', ids[Math.max(0, Math.min(ids.length - 1, at + dir))]);
        renderEditor(); changed(); return;
      }
      var input = ctl.querySelector('input');
      var spec = input.hasAttribute('data-rule') ? ruleSpec(key) : fieldSpec(key);
      var next = Math.max(0, CM.tidy(looseNumber(input.value) + dir * (spec.step || 1)));
      if (typeof spec.max === 'number') { next = Math.min(spec.max, next); }
      input.value = CM.number(next);
      sizeInput(input);
      if (input.hasAttribute('data-rule')) { writeRule(key, input.value); } else { writeField(state.selected, key, input.value); }
      changed();
    }

    function onClick(e) {
      var t = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!t || !root.contains(t)) {
        var mid = e.target && e.target.closest ? e.target.closest('.scr-mid') : null;
        if (mid && mid.querySelector('input') && e.target.tagName !== 'INPUT') { mid.querySelector('input').focus(); return; }
        var headCell = e.target && e.target.closest ? e.target.closest('.scr-head') : null;
        if (headCell && root.contains(headCell)) { select(Number(headCell.getAttribute('data-cand'))); }
        return;
      }
      if (t.hasAttribute('data-pick')) { select(Number(t.getAttribute('data-pick'))); return; }
      if (t.hasAttribute('data-dir')) { nudge(t); return; }
      if (t.hasAttribute('data-value')) {
        writeField(state.selected, t.closest('.scr-ctl').getAttribute('data-ctl'), t.getAttribute('data-value'));
        renderEditor(); changed(); return;
      }
      var act = t.getAttribute('data-act');
      if (act === 'reset') { reset(); }
      if (act === 'rules') { state.rulesOpen = !state.rulesOpen; renderRules(); }
    }

    /*
     * Keys in a box. Enter commits it and hands the keyboard back to the deck,
     * so the arrows move on again. Escape in a box does nothing at all: the
     * engine never sees it. And because a reflex Escape just after Enter would
     * otherwise reach the deck and put the overview grid on the projector, the
     * first key after Enter, if it is Escape and comes within GUARD_MS, is
     * swallowed too (guardKeys, listening on the window before the engine).
     */
    var guardUntil = 0;
    function onKeyDown(e) {
      var t = e.target;
      if (!t || t.tagName !== 'INPUT') { return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'Enter' && t.blur) {
        e.preventDefault();
        e.stopPropagation();
        t.blur();
        guardUntil = Date.now() + GUARD_MS;
      }
    }

    var LONE_KEYS = { Shift: 1, Control: 1, Alt: 1, AltGraph: 1, Meta: 1, CapsLock: 1 };
    function guardKeys(e) {
      if (!guardUntil || LONE_KEYS[e.key]) { return; }
      var live = Date.now() < guardUntil;
      guardUntil = 0;                                         // only the first key after Enter
      if (live && e.key === 'Escape' && !(e.target && e.target.tagName === 'INPUT' && root.contains(e.target))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }

    /* Committing a box (Enter, or leaving it) shows the figure that counts: past a ceiling, the ceiling. */
    function onFocusOut(e) {
      var t = e.target;
      if (!t || t.tagName !== 'INPUT' || !t.hasAttribute('inputmode')) { return; }
      if (t.hasAttribute('data-rule')) {
        var path = t.getAttribute('data-rule');
        t.value = shownValue(readRule(path), ruleSpec(path));
      } else if (t.hasAttribute('data-field') && !t.hasAttribute('data-cand')) {
        t.value = shownField(state.candidates[state.selected], fieldSpec(t.getAttribute('data-field')));
      } else { return; }
      sizeInput(t);
    }

    function onFocusIn(e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('scr-name') && t.hasAttribute('data-cand')) {
        var c = Number(t.getAttribute('data-cand'));
        if (c !== state.selected) { select(c); }
      }
    }

    function select(c) {
      if (!(c >= 0 && c <= 2)) { return; }
      state.selected = c;
      renderAll();
      save();
    }

    function reset() {
      state = defaults();
      memory[memoryKey] = state;
      if (store) { try { store.removeItem(storeKey); } catch (e) { /* nothing to remove */ } }
      if (doc.activeElement && root.contains(doc.activeElement) && doc.activeElement.blur) { doc.activeElement.blur(); }
      renderAll();
    }

    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('focusout', onFocusOut);
    window.addEventListener('keydown', guardKeys, true);
    renderAll();
    whenFontsReady(function () { if (root.parentNode) { fitNames(); fitResults(); } });
    var onResize = function () { fitNames(); fitResults(); };
    if (layout === 'page') { window.addEventListener('resize', onResize); }

    return {
      step: function () { fitNames(); fitResults(); },
      resize: onResize,
      destroy: function () {
        window.removeEventListener('resize', onResize);
        root.removeEventListener('input', onInput);
        root.removeEventListener('click', onClick);
        root.removeEventListener('focusin', onFocusIn);
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('focusout', onFocusOut);
        window.removeEventListener('keydown', guardKeys, true);
        if (root.parentNode) { root.parentNode.removeChild(root); }
      },
      // for tests and for the page around it
      snapshot: function () {
        return { candidates: clone(state.candidates), assumptions: assumptions(), example: state.example.slice(), selected: state.selected, rulesOpen: state.rulesOpen };
      },
      results: function () { return lastResults; },
      set: function (c, key, value) { writeField(c, key, value); renderAll(); save(); },
      setRule: function (path, value) { writeRule(path, value); renderAll(); save(); },
      select: select,
      reset: reset,
      fields: FIELDS.map(function (f) { return f.key; }),
      rules: RULES.map(function (r) { return r.path; })
    };
  }


  /* ===========================================================================
   * Export
   * ========================================================================= */

  function mount(host, opts, api) {
    opts = opts || {};
    injectCss();
    if (!gates() || !cm()) {
      host.textContent = 'The screener needs deck/lib/cost-math.js and deck/lib/gates-core.js.';
      return { step: function () {}, destroy: function () { host.textContent = ''; }, resize: function () {} };
    }
    if (opts.mode === 'walkthrough') { return Walkthrough(host, opts, api); }
    return Live(host, opts, api);
  }

  window.Screener = {
    mount: mount,
    walkthroughSteps: walkthroughSteps,
    gateStates: gateStates,
    exampleCandidates: exampleCandidates,
    STORE_KEY: STORE_KEY
  };

  injectCss();
  if (window.Scenes && typeof window.Scenes.define === 'function') {
    window.Scenes.define('screener', function (host, opts, api) { return mount(host, opts, api); });
  }
}());
