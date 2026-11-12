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
 * Needs: Gates, CostMath (and so BENCHLM), window.YOUR. Uses Motion for the
 * walkthrough's animation when it is there, and works without it. Classic
 * script, no modules, no network.
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
  var EASE_LIFT = bezier(0.2, 0.8, 0.2, 1);       // --e-lift: a shutter going up
  var EASE_DROP = bezier(0.55, 0, 1, 0.45);       // --e-drop: gravity, no bounce
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

  /* The small verdict chip: shape and word, in the base inks. */
  function chipHtml(state) {
    var word = state === 'pass' ? 'Pass' : (state === 'no' ? 'No' : 'Not yet');
    return '<span class="verdict scr-chip" data-verdict="' + state + '">' + word + '</span>';
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
:root { --scr-card: var(--c-bg, #F4EDDE); --scr-lamp: var(--c-ink, #050505); }

/* The stop-time hold after a NO: the slide prints in negative. Card and
   Lampblack swap; Flare stays. Set on the slide by the walkthrough. */
.slide.scr-negative {
  --c-bg: var(--scr-lamp); --c-ink: var(--scr-card); --c-line: var(--scr-card); --c-ink-soft: var(--scr-card);
  --c-bg-alt: var(--scr-lamp); --c-no: var(--scr-card); --c-no-ink: var(--scr-lamp); --c-pass: var(--scr-card);
  --c-pass-ink: var(--scr-lamp); --card: var(--scr-lamp); --lampblack: var(--scr-card);
  background: var(--scr-lamp); color: var(--scr-card);
}

.scr {
  --k: var(--c-ink, #050505); --g: var(--c-bg, #F4EDDE); --g2: var(--c-bg-alt, #E8E0CE);
  --fl: var(--c-accent, #FF6842); --fl-k: var(--c-accent-ink, #050505);
  --disp: var(--f-display, "Archivo", "Arial Narrow", Helvetica, Arial, sans-serif);
  --text: var(--f-body, "Archivo", "Helvetica Neue", Helvetica, Arial, sans-serif);
  --voice: var(--f-voice, "Fraunces", Georgia, serif);
  color: var(--k); font-family: var(--text); font-weight: 500; font-synthesis: none; text-align: left;
}
.scr, .scr *, .scr *::before, .scr *::after { box-sizing: border-box; }
.scr :is(h3, p, ul, li, button, input) { margin: 0; }
.scr [hidden] { display: none !important; }
.scr .scr-d { font-family: var(--disp); font-weight: 900; font-stretch: 62%; text-transform: uppercase; letter-spacing: 0; }
.scr .scr-l { font-family: var(--text); font-weight: 700; font-stretch: 112%; letter-spacing: 0.08em; text-transform: uppercase; }
.scr .scr-v { font-family: var(--voice); font-style: italic; font-weight: 600; font-variation-settings: var(--voice-settings, "opsz" 72, "SOFT" 0, "WONK" 0); text-transform: none; letter-spacing: 0; }

/* ---- the verdict chip: PASS is a hollow frame with a raised lintel, NO a
        solid block, NOT YET the frame only. Shape and word, never colour. ---- */
.scr .scr-chip {
  display: inline-flex; align-items: center; justify-content: center; flex: none; height: var(--chip-h);
  padding: 0 calc(var(--chip-h) * 0.26); white-space: nowrap; line-height: 1; color: var(--k);
  font-family: var(--disp); font-weight: 900; font-stretch: 62%; text-transform: uppercase;
}
.scr .scr-chip[data-verdict="no"] { background: var(--k); color: var(--g); font-size: var(--chip-no); }
.scr .scr-chip[data-verdict="pass"] { border: var(--chip-line) solid var(--k); border-top-width: calc(var(--chip-h) * 0.26); font-size: var(--chip-pass); }
.scr .scr-chip[data-verdict="notyet"] {
  border: var(--chip-line) dashed var(--k); font-family: var(--text); font-weight: 700; font-stretch: 100%;
  letter-spacing: 0.06em; font-size: var(--chip-ny);
}

/* =============================================================================
   1. WALKTHROUGH (stage only). The host is the whole slide; everything is
      placed in stage pixels.
   ========================================================================== */
.scr-walk { position: absolute; inset: 0; --chip-h: 44px; --chip-line: 4px; --chip-no: 36px; --chip-pass: 28px; --chip-ny: 28px; }

/* ---- three candidates: tabs standing on the lintel ---- */
.scr-walk .scr-tabs { position: absolute; left: 128px; top: 166px; width: 1736px; height: 154px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 16px; }
.scr-walk .scr-tab { position: relative; min-width: 0; padding: 10px 18px 0; border: 6px solid var(--k); border-bottom: 0; background: var(--g); color: var(--k); }
.scr-walk .scr-tab[data-status="current"] { background: var(--k); color: var(--g); }
.scr-walk .scr-tab-pitch { font-size: 32px; line-height: 36px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr-walk .scr-tab-name { margin-top: 2px; font-size: 38px; line-height: 46px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr-walk .scr-tab-foot { display: flex; align-items: center; gap: 16px; height: 44px; margin-top: 4px; }
.scr-walk .scr-track { display: flex; gap: 6px; flex: none; }
.scr-walk .scr-track i { position: relative; display: block; width: 20px; height: 40px; border: 4px solid currentColor; }
.scr-walk .scr-track i[data-s="pass"]::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 10px; background: currentColor; }
.scr-walk .scr-track i[data-s="no"] { background: currentColor; }
.scr-walk .scr-tab-result { font-size: 32px; line-height: 40px; white-space: nowrap; }

/* ---- four gates: the dock ---- */
.scr-walk .scr-dock { position: absolute; left: 88px; top: 320px; width: 1832px; height: 512px; }
.scr-walk .scr-lintel, .scr-walk .scr-floor { position: absolute; left: 0; width: 1832px; height: 8px; background: var(--k); }
.scr-walk .scr-lintel { top: 0; }
.scr-walk .scr-floor { top: 504px; }
.scr-walk .scr-post { position: absolute; top: 0; width: 8px; height: 504px; background: var(--k); }
.scr-walk .scr-bay { position: absolute; top: 0; width: 456px; height: 512px; }

/* the tell-tale: where an earlier NO hit, the floor is cut and dropped */
.scr-walk .scr-scar { display: none; position: absolute; left: 16px; top: 504px; width: 432px; height: 8px; background: var(--g); }
.scr-walk .scr-scar::after { content: ""; position: absolute; left: 0; top: 8px; width: 100%; height: 8px; background: var(--k); }
.scr-walk .scr-bay[data-scar="1"] .scr-scar { display: block; }

/* what is printed in the bay (and again, in the other ink, on a NO shutter) */
.scr-walk .scr-open { position: absolute; left: 40px; top: 0; width: 392px; height: 504px; }
.scr-walk .scr-n { position: absolute; left: 0; top: 148px; font-size: 32px; line-height: 32px; white-space: nowrap; }
.scr-walk .scr-name { position: absolute; left: 0; top: 190px; font-size: 86px; line-height: 0.708; white-space: nowrap; }
.scr-walk .scr-body { position: absolute; left: 0; top: 274px; width: 392px; }
.scr-walk .scr-q { font-size: 40px; line-height: 48px; font-weight: 500; }
.scr-walk .scr-in { font-size: 36px; line-height: 42px; font-weight: 500; }
.scr-walk .scr-in + .scr-in { margin-top: 6px; }
.scr-walk .scr-metric { font-size: 58px; line-height: 0.9; text-wrap: balance; }
.scr-walk .scr-sub { margin-top: 10px; font-size: 36px; line-height: 42px; font-weight: 600; }
.scr-walk .scr-thru { position: absolute; left: 0; top: 440px; width: 392px; height: 56px; }
.scr-walk .scr-thru path { fill: var(--k); stroke: none; }

/* which of those show, by state */
.scr-walk .scr-bay .scr-when { display: none; }
.scr-walk .scr-bay[data-state="vacant"] .scr-when-vacant,
.scr-walk .scr-bay[data-state="shut"] .scr-when-pass,
.scr-walk .scr-bay[data-state="pass"] .scr-when-pass,
.scr-walk .scr-bay[data-state="notyet"] .scr-when-notyet { display: block; }

/* the shutter hangs 8px inside the frame. Its height is the whole animation. */
.scr-walk .scr-shutter { position: absolute; left: 16px; top: 16px; width: 432px; height: 0; overflow: hidden; background: var(--k); color: var(--g); z-index: 2; }
.scr-walk .scr-bay[data-state="shut"] .scr-shutter { height: 488px; }
.scr-walk .scr-bay[data-state="pass"] .scr-shutter { height: 104px; }
.scr-walk .scr-bay[data-state="no"] .scr-shutter { height: 544px; }
.scr-walk .scr-pull { display: none; position: absolute; left: 192px; top: 120px; width: 72px; height: 14px; background: var(--k); z-index: 2; }
.scr-walk .scr-bay[data-state="pass"] .scr-pull { display: block; }
.scr-walk .scr-word-pass { display: none; position: absolute; left: 24px; top: 20px; font-size: 92px; line-height: 0.708; }
.scr-walk .scr-bay[data-state="pass"] .scr-word-pass, .scr-walk .scr-bay[data-word="1"] .scr-word-pass { display: block; }
.scr-walk .scr-no { display: none; position: absolute; inset: 0; }
.scr-walk .scr-bay[data-state="no"] .scr-no, .scr-walk .scr-bay[data-dropping="1"] .scr-no { display: block; }
.scr-walk .scr-no .scr-n { left: 24px; top: 24px; }
.scr-walk .scr-no .scr-name { left: 24px; top: 66px; }
.scr-walk .scr-no .scr-metric { position: absolute; left: 24px; top: 150px; width: 392px; font-size: 54px; }
/* NO rides on the bottom edge of the shutter: it arrives with the weight of the block */
.scr-walk .scr-word-no { position: absolute; left: 10px; bottom: 22px; font-size: 340px; line-height: 0.708; }

/* ---- the reason, under the dock ---- */
.scr-walk .scr-cap { position: absolute; left: 128px; top: 892px; width: 1736px; font-size: 40px; line-height: 48px; font-weight: 500; text-wrap: pretty; }
.scr-walk .scr-cap b { font-weight: 800; }
.scr-walk .scr-src { position: absolute; left: 128px; top: 1010px; width: 1736px; font-size: 28px; line-height: 32px; font-weight: 600; white-space: nowrap; overflow: hidden; z-index: 3; }

/* ---- the survivor: the one Flare block on this slide ---- */
.scr-walk .scr-band { display: none; position: absolute; left: 88px; top: 856px; width: 1832px; height: 224px; background: var(--fl); color: var(--fl-k); z-index: 2; }
.scr-walk[data-band="1"] .scr-band { display: block; }
.scr-walk[data-band="1"] .scr-src { color: var(--fl-k); }
.scr-walk .scr-band.is-plain { background: var(--g); color: var(--k); border-top: 8px solid var(--k); }
.scr-walk .scr-fig { position: absolute; top: 0; width: 560px; height: 150px; }
.scr-walk .scr-fig[data-shown="0"] { visibility: hidden; }
.scr-walk .scr-fig-label { position: absolute; left: 0; top: 22px; font-size: 32px; line-height: 32px; white-space: nowrap; }
.scr-walk .scr-fig-value { position: absolute; left: 0; top: 70px; display: flex; align-items: baseline; gap: 16px; white-space: nowrap; }
.scr-walk .scr-fig-value .scr-v { font-size: 56px; line-height: 1; }
.scr-walk .scr-fig-value .scr-d { font-size: 104px; line-height: 0.708; font-variant-numeric: tabular-nums; }

/* =============================================================================
   2. LIVE SCORECARD, shared structure
   ========================================================================== */
.scr-live .scr-btn {
  appearance: none; -webkit-appearance: none; border: var(--line) solid var(--k); background: var(--g); color: var(--k);
  font-family: var(--text); font-weight: 700; font-stretch: 112%; letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; white-space: nowrap; border-radius: 0;
}
.scr-live .scr-btn[aria-expanded="true"], .scr-live .scr-btn[aria-pressed="true"] { background: var(--k); color: var(--g); }
.scr-live .scr-btn:focus-visible, .scr-live .scr-pick:focus-visible, .scr-live .scr-step:focus-visible, .scr-live .scr-seg button:focus-visible { outline: var(--line) solid var(--k); outline-offset: 3px; }
.scr-live input { border-radius: 0; font-family: var(--text); color: var(--k); background: transparent; }
.scr-live input:focus { outline: none; background: var(--g2); }

.scr-live .scr-board { display: grid; }
.scr-live .scr-corner, .scr-live .scr-head, .scr-live .scr-tagcell, .scr-live .scr-glabel, .scr-live .scr-cell, .scr-live .scr-rlabel, .scr-live .scr-result { min-width: 0; }
.scr-live .scr-pick {
  appearance: none; -webkit-appearance: none; flex: none; border: var(--line) solid var(--k); border-radius: 0; background: var(--g); color: var(--k);
  font-family: var(--disp); font-weight: 900; font-stretch: 62%; line-height: 1; cursor: pointer; padding: 0;
}
.scr-live .scr-head[data-selected="1"] .scr-pick { background: var(--k); color: var(--g); }
.scr-live .scr-name { min-width: 0; border: 0; border-bottom: var(--hair) solid var(--k); font-weight: 700; text-overflow: ellipsis; }
.scr-live .scr-cell { display: flex; align-items: center; }
.scr-live .scr-metric { min-width: 0; }
.scr-live .scr-result[data-outcome="winner"] { background: var(--fl); color: var(--fl-k); }

/* controls */
.scr-live .scr-ctl { display: flex; flex-direction: column; min-width: 0; }
.scr-live .scr-ctl-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; }
.scr-live .scr-ctl-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-weight: 600; }
.scr-live .scr-ctl-note { flex: none; white-space: nowrap; font-weight: 600; }
.scr-live .scr-stepper, .scr-live .scr-seg { display: flex; align-items: stretch; min-width: 0; border: var(--line) solid var(--k); background: var(--g); }
.scr-live .scr-step {
  appearance: none; -webkit-appearance: none; flex: none; border: 0; border-radius: 0; background: var(--k); color: var(--g); cursor: pointer; padding: 0;
  font-family: var(--disp); font-weight: 900; font-stretch: 62%; line-height: 1;
}
.scr-live .scr-stepper input { flex: 1 1 0; min-width: 0; width: 100%; border: 0; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
.scr-live .scr-unit { flex: none; align-self: center; font-weight: 700; }
.scr-live .scr-unit:empty { display: none; }
.scr-live .scr-cycle-value { flex: 1 1 0; min-width: 0; align-self: center; text-align: center; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr-live .scr-seg button {
  appearance: none; -webkit-appearance: none; flex: 1 1 0; min-width: 0; border: 0; border-radius: 0; background: transparent; color: var(--k);
  font-family: var(--text); font-weight: 700; cursor: pointer; padding: 0;
}
.scr-live .scr-seg button + button { border-left: var(--line) solid var(--k); }
.scr-live .scr-seg button[aria-pressed="true"] { background: var(--k); color: var(--g); }
.scr-live .scr-ctl[aria-invalid="true"] .scr-stepper { background-image: var(--hatch, repeating-linear-gradient(135deg, var(--k) 0 4px, transparent 4px 12px)); }
.scr-live .scr-ctl[aria-invalid="true"] .scr-stepper input { background: var(--g); }

/* =============================================================================
   3. LIVE SCORECARD on the stage (1920 x 1080). The component is a
      1736 x 920 box; the slide puts it at (128, 120).
   ========================================================================== */
.scr-live.scr--stage {
  position: absolute; inset: 0; --line: 4px; --hair: 3px;
  --chip-h: 60px; --chip-line: 4px; --chip-no: 48px; --chip-pass: 34px; --chip-ny: 30px;
}
.scr--stage .scr-tools { position: absolute; right: 0; top: -80px; height: 64px; display: flex; gap: 16px; }
.scr--stage .scr-btn { height: 64px; padding: 0 22px; font-size: 32px; }

.scr--stage .scr-board { position: absolute; left: 0; top: 0; width: 1736px; grid-template-columns: 248px repeat(3, 496px); grid-template-rows: 72px 40px repeat(4, 72px) 120px; }
.scr--stage .scr-corner { font-size: 32px; line-height: 34px; align-self: center; }
.scr--stage .scr-head { display: flex; align-items: center; gap: 14px; padding: 0 22px; }
.scr--stage .scr-pick { width: 56px; height: 56px; font-size: 46px; }
.scr--stage .scr-name { flex: 1 1 0; height: 56px; padding: 0 4px; font-size: 36px; }
.scr--stage .scr-pickname { display: none; }
.scr--stage .scr-tagcell { padding: 0 22px; border-bottom: 6px solid var(--k); font-size: 28px; line-height: 34px; }
.scr--stage .scr-tagcell.scr-l { letter-spacing: 0.1em; }
.scr--stage .scr-glabel { display: flex; align-items: center; border-bottom: 3px solid var(--k); font-size: 56px; line-height: 1; }
.scr--stage .scr-cell { gap: 16px; padding: 0 22px; border-bottom: 3px solid var(--k); }
.scr--stage .scr-row-last { border-bottom-width: 6px; }
.scr--stage .scr-chipslot { flex: none; width: 168px; display: flex; }
.scr--stage .scr-metric { font-size: 32px; line-height: 34px; font-weight: 600; text-wrap: balance; }
.scr--stage .scr-rlabel { align-self: center; font-size: 32px; line-height: 36px; }
.scr--stage .scr-result { display: flex; flex-direction: column; justify-content: center; padding: 0 22px; margin: 6px 6px 0; }
.scr--stage .scr-result-main { display: flex; align-items: baseline; gap: 12px; white-space: nowrap; }
.scr--stage .scr-result-main .scr-d { font-size: 64px; line-height: 0.9; font-variant-numeric: tabular-nums; }
.scr--stage .scr-result-main span { font-size: 32px; font-weight: 600; }
.scr--stage .scr-result-sub { margin-top: 4px; font-size: 32px; line-height: 36px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr--stage .scr-result[data-outcome="no"] .scr-result-main span { font-size: 36px; }

/* the candidate being edited: two posts and a lintel that run into the editor's frame */
.scr--stage .scr-sel { position: absolute; top: 0; width: 496px; height: 526px; border: 6px solid var(--k); border-bottom: 0; pointer-events: none; z-index: 3; }
.scr--stage .scr-sel::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: var(--g); }

.scr--stage .scr-editor, .scr--stage .scr-rules {
  position: absolute; left: 0; top: 520px; width: 1736px; height: 330px; border: 6px solid var(--k); background: var(--g);
  padding: 4px 20px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 104px; column-gap: 28px; align-content: start;
}
.scr--stage .scr-rules { z-index: 4; }
.scr--stage .scr-ctl { justify-content: center; gap: 2px; }
.scr--stage .scr-ctl-label, .scr--stage .scr-ctl-note { font-size: 32px; line-height: 34px; }
.scr--stage .scr-ctl-note { font-size: 28px; }
.scr--stage .scr-stepper, .scr--stage .scr-seg { height: 64px; }
.scr--stage .scr-step { width: 64px; font-size: 56px; }
.scr--stage .scr-stepper input { font-size: 40px; padding: 0 6px; }
.scr--stage .scr-unit { font-size: 36px; padding: 0 12px 0 0; }
.scr--stage .scr-unit.is-pre { padding: 0 0 0 12px; }
.scr--stage .scr-cycle-value { font-size: 36px; padding: 0 8px; }
.scr--stage .scr-seg button { font-size: 36px; }
.scr--stage .scr-ctl-name, .scr--stage .scr-detail, .scr--stage .scr-bar { display: none; }
.scr--stage .scr-rules-note { grid-column: 1 / -1; align-self: center; font-size: 36px; line-height: 42px; font-weight: 500; }
.scr--stage .scr-rules-head { display: none; }
.scr--stage .scr-assume { position: absolute; left: 0; top: 862px; width: 1736px; font-size: 28px; line-height: 30px; font-weight: 600; text-wrap: pretty; }

/* =============================================================================
   4. LIVE SCORECARD as a page: a phone first (360px), then wider.
   ========================================================================== */
.scr-live.scr--page {
  --line: 2px; --hair: 2px; --chip-h: 2rem; --chip-line: 2px; --chip-no: 1.5rem; --chip-pass: 1.05rem; --chip-ny: 0.62rem;
  position: relative; font-size: 1rem; line-height: 1.4;
}
.scr--page .scr-tools { display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 0.75rem; }
.scr--page .scr-btn { min-height: 2.75rem; padding: 0 0.9rem; font-size: 0.78rem; }
.scr--page .scr-sel { display: none; }
.scr--page .scr-board { grid-template-columns: 4.4rem repeat(3, minmax(0, 1fr)); border-top: 4px solid var(--k); border-bottom: 4px solid var(--k); }
.scr--page .scr-corner { font-size: 0.62rem; line-height: 1.2; align-self: end; padding: 0 0 0.4rem; }
.scr--page .scr-head { padding: 0.5rem 0.25rem 0.25rem; display: flex; flex-direction: column; align-items: stretch; gap: 0.2rem; }
.scr--page .scr-pick { display: flex; align-items: center; justify-content: center; width: 100%; height: 2.75rem; font-size: 1.9rem; }
.scr--page .scr-pickname { font-size: 0.72rem; line-height: 1.15; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; min-height: 1.66rem; }
.scr--page .scr-name { display: none; }
.scr--page .scr-tagcell { padding: 0 0.25rem 0.35rem; font-size: 0.58rem; border-bottom: 2px solid var(--k); }
.scr--page .scr-glabel { display: flex; align-items: center; font-size: 1.15rem; line-height: 1; border-bottom: 1px solid var(--k); overflow: hidden; }
.scr--page .scr-cell { flex-direction: column; align-items: flex-start; gap: 0.2rem; padding: 0.4rem 0.25rem; border-bottom: 1px solid var(--k); }
.scr--page .scr-row-last { border-bottom-width: 2px; }
.scr--page .scr-chipslot { display: flex; }
.scr--page .scr-metric { display: none; font-size: 0.8rem; line-height: 1.2; font-weight: 600; }
.scr--page .scr-rlabel { align-self: center; font-size: 0.62rem; line-height: 1.25; padding-right: 0.25rem; }
.scr--page .scr-result { padding: 0.5rem 0.3rem; margin: 0.25rem 0.1rem; }
.scr--page .scr-result-main { display: flex; flex-direction: column; }
.scr--page .scr-result-main .scr-d { font-size: 1.45rem; line-height: 1; }
.scr--page .scr-result-main span { font-size: 0.72rem; line-height: 1.2; font-weight: 600; }
.scr--page .scr-result-sub { display: none; font-size: 0.72rem; line-height: 1.25; font-weight: 600; margin-top: 0.2rem; }

/* the verdict for the candidate in hand, kept in view while its numbers are edited */
.scr--page .scr-bar { position: sticky; bottom: 0; z-index: 5; display: flex; gap: 0.75rem; align-items: center; margin: 0 -1rem; padding: 0.6rem 1rem; background: var(--k); color: var(--g); }
.scr--page .scr-bar .scr-chip { color: var(--g); }
.scr--page .scr-bar .scr-chip[data-verdict="no"] { background: var(--g); color: var(--k); }
.scr--page .scr-bar .scr-chip[data-verdict="pass"] { border-color: var(--g); }
.scr--page .scr-bar-text { font-size: 0.85rem; line-height: 1.3; font-weight: 600; min-width: 0; }

.scr--page .scr-editor, .scr--page .scr-rules { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.9rem 1rem; margin-top: 1.25rem; }
.scr--page .scr-rules { padding: 1rem; border: 2px solid var(--k); }
.scr--page .scr-rules-head { font-size: 1.6rem; line-height: 1; }
.scr--page .scr-rules-note { font-size: 0.9rem; }
.scr--page .scr-ctl { gap: 0.3rem; }
.scr--page .scr-ctl-label, .scr--page .scr-ctl-note { font-size: 0.9rem; line-height: 1.25; }
.scr--page .scr-ctl-label { white-space: normal; }
.scr--page .scr-ctl-note { font-size: 0.8rem; }
.scr--page .scr-stepper, .scr--page .scr-seg { height: 3rem; }
.scr--page .scr-step { width: 3rem; font-size: 2rem; }
.scr--page .scr-stepper input { font-size: 1.15rem; padding: 0 0.25rem; }
.scr--page .scr-ctl-name .scr-stepper input { text-align: left; padding: 0 0.6rem; }
.scr--page .scr-unit { font-size: 1.05rem; padding: 0 0.6rem 0 0; }
.scr--page .scr-unit.is-pre { padding: 0 0 0 0.6rem; }
.scr--page .scr-cycle-value { font-size: 1.05rem; padding: 0 0.3rem; }
.scr--page .scr-seg button { font-size: 1.05rem; }
.scr--page .scr-ctl-name { grid-column: 1 / -1; }

.scr--page .scr-detail { margin-top: 1.5rem; border-top: 4px solid var(--k); padding-top: 0.75rem; }
.scr--page .scr-detail-head { font-size: 1.6rem; line-height: 1; overflow-wrap: anywhere; }
.scr--page .scr-detail-sum { margin-top: 0.4rem; font-size: 1rem; font-weight: 600; }
.scr--page .scr-detail-list { list-style: none; padding: 0; margin-top: 0.75rem; }
.scr--page .scr-detail-list li { display: grid; grid-template-columns: 5.25rem minmax(0, 1fr); gap: 0.2rem 0.75rem; padding: 0.7rem 0; border-top: 1px solid var(--k); }
.scr--page .scr-detail-gate { font-size: 1.3rem; line-height: 1; grid-column: 2; }
.scr--page .scr-detail-list .scr-chip { grid-row: 1 / span 2; align-self: start; justify-self: start; }
.scr--page .scr-detail-why { grid-column: 2; font-size: 0.92rem; line-height: 1.35; }
.scr--page .scr-detail-warn { margin-top: 0.6rem; padding: 0.6rem 0.75rem; border: 2px solid var(--k); font-size: 0.9rem; font-weight: 600; }
.scr--page .scr-assume { margin-top: 1.25rem; font-size: 0.85rem; line-height: 1.45; font-weight: 600; }

@media (min-width: 560px) {
  .scr--page .scr-editor, .scr--page .scr-rules { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scr--page .scr-rules-head, .scr--page .scr-rules-note { grid-column: 1 / -1; }
  .scr--page .scr-board { grid-template-columns: 5.5rem repeat(3, minmax(0, 1fr)); }
  .scr--page .scr-glabel { font-size: 1.5rem; }
  .scr--page .scr-result-sub { display: block; }
}
@media (min-width: 760px) {
  .scr-live.scr--page { --chip-h: 2.4rem; --chip-no: 1.85rem; --chip-pass: 1.3rem; --chip-ny: 0.72rem; }
  .scr--page .scr-head { flex-direction: row; align-items: center; gap: 0.5rem; padding: 0.6rem 0.6rem 0.3rem; }
  .scr--page .scr-pick { width: 2.75rem; flex: none; }
  .scr--page .scr-pickname { display: none; }
  .scr--page .scr-name { display: block; flex: 1 1 0; height: 2.75rem; font-size: 1.05rem; padding: 0 0.2rem; }
  .scr--page .scr-ctl-name { display: none; }
  .scr--page .scr-tagcell { padding: 0 0.6rem 0.4rem; font-size: 0.66rem; }
  .scr--page .scr-cell { flex-direction: row; align-items: center; gap: 0.6rem; padding: 0.5rem 0.6rem; }
  .scr--page .scr-chipslot { flex: none; width: 5.6rem; }
  .scr--page .scr-metric { display: block; }
  .scr--page .scr-result { padding: 0.6rem; margin: 0.3rem; }
  .scr--page .scr-result-main { flex-direction: row; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }
  .scr--page .scr-result-main .scr-d { font-size: 2rem; }
  .scr--page .scr-result-main span { font-size: 0.85rem; }
  .scr--page .scr-rlabel, .scr--page .scr-corner { font-size: 0.72rem; }
  .scr--page .scr-editor, .scr--page .scr-rules { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .scr--page .scr-bar { margin: 0; }
}
@media (min-width: 1100px) {
  .scr--page .scr-editor, .scr--page .scr-rules { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .scr--page .scr-board { grid-template-columns: 8rem repeat(3, minmax(0, 1fr)); }
  .scr--page .scr-glabel { font-size: 2rem; }
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
    out['return'].push(c.touchesCashPath ? 'On the cash path' : 'Off the cash path');

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

    /* geometry of a bay, in stage pixels (see the CSS above) */
    var FULL = 488;          // a shutter that just reaches the floor
    var RAISED = 104;        // a raised shutter: the top fifth of the bay
    var THROUGH = 544;       // a NO: through the floor line and 48px beyond
    /* the timing, in seconds (note values at 120 BPM, docs/DIRECTION.md) */
    var T = { shutHold: 0.25, lift: 0.5, holdBefore: 0.8, drop: 0.375, jolt: 0.375, hold: 1.0, wipe: 0.25, swing: 1 / 3 };

    /* the last beat of each candidate's judging: from there on its tab shows the result */
    var firstBeat = [], lastGateBeat = [];
    beats.forEach(function (b, k) {
      if (b.type === 'intro') { firstBeat[b.c] = k; }
      if (b.type === 'gate') { lastGateBeat[b.c] = k; }
    });

    /* ---- DOM ---- */
    var root = doc.createElement('div');
    root.className = 'scr scr-walk';

    var tabsHtml = results.map(function (r, c) {
      return '<div class="scr-tab" data-cand="' + c + '" data-status="waiting">' +
        '<div class="scr-tab-pitch scr-l">' + LETTERS[c] + (r.candidate.pitch ? DOT + esc(r.candidate.pitch) : '') + '</div>' +
        '<div class="scr-tab-name">' + esc(r.name || 'Candidate ' + LETTERS[c]) + '</div>' +
        '<div class="scr-tab-foot"><span class="scr-track">' + G.ORDER.map(function () { return '<i></i>'; }).join('') + '</span>' +
        '<span class="scr-tab-result scr-l"></span></div></div>';
    }).join('');

    var arrow = '<svg class="scr-thru scr-when scr-when-pass" viewBox="0 0 392 56" aria-hidden="true"><path d="M0 24H352V32H0Z"/><path d="M344 2L392 28L344 54Z"/></svg>';
    var baysHtml = G.GATES.map(function (gate, g) {
      return '<div class="scr-bay" data-gate="' + gate.id + '" data-state="vacant" style="left:' + (g * 456) + 'px">' +
        '<div class="scr-open">' +
          '<span class="scr-n scr-l">Gate ' + (g + 1) + '</span>' +
          '<h3 class="scr-name scr-d">' + esc(gate.label) + '</h3>' +
          '<div class="scr-body scr-when scr-when-vacant"></div>' +
          '<div class="scr-body scr-when scr-when-pass"><p class="scr-metric scr-d"></p><p class="scr-sub"></p></div>' +
          '<div class="scr-body scr-when scr-when-notyet">' + chipHtml('notyet') + '</div>' +
          arrow +
        '</div>' +
        '<i class="scr-scar"></i>' +
        '<i class="scr-pull"></i>' +
        '<div class="scr-shutter">' +
          '<span class="scr-word-pass scr-d">Pass</span>' +
          '<div class="scr-no"><span class="scr-n scr-l">Gate ' + (g + 1) + '</span><h3 class="scr-name scr-d">' + esc(gate.label) + '</h3>' +
          '<p class="scr-metric scr-d"></p><span class="scr-word-no scr-d">No</span></div>' +
        '</div>' +
      '</div>';
    }).join('');
    var posts = [0, 1, 2, 3, 4].map(function (i) { return '<i class="scr-post" style="left:' + (i * 456) + 'px"></i>'; }).join('');

    root.innerHTML =
      '<div class="scr-tabs">' + tabsHtml + '</div>' +
      '<div class="scr-dock"><i class="scr-lintel"></i><i class="scr-floor"></i>' + posts + baysHtml + '</div>' +
      '<p class="scr-cap" aria-live="polite"></p>' +
      '<div class="scr-band">' + [0, 1, 2].map(function (i) {
        return '<div class="scr-fig" data-shown="1" style="left:' + (40 + i * 590) + 'px"><span class="scr-fig-label scr-l"></span><span class="scr-fig-value"></span></div>';
      }).join('') + '</div>' +
      '<p class="scr-src source-line"></p>';
    host.appendChild(root);

    var tabs = Array.prototype.slice.call(root.querySelectorAll('.scr-tab'));
    var bays = Array.prototype.slice.call(root.querySelectorAll('.scr-bay'));
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

    /* ---- drawing one moment: everything on screen is a function of the beat number ---- */
    function setBay(g, state) {
      var bay = bays[g];
      bay.setAttribute('data-state', state);
      bay.removeAttribute('data-word');
      bay.removeAttribute('data-dropping');
      bay.querySelector('.scr-shutter').style.height = '';
    }

    function fillBay(g, c) {
      var bay = bays[g];
      var id = G.ORDER[g];
      var vacant = bay.querySelector('.scr-when-vacant');
      if (c == null) {
        vacant.innerHTML = '<p class="scr-q">' + esc(G.GATES[g].question) + '</p>';
        return;
      }
      vacant.innerHTML = inputs[c][id].map(function (line) { return '<p class="scr-in">' + esc(line) + '</p>'; }).join('');
      var m = splitMetric(states[c][g].gate.metricText);
      bay.querySelector('.scr-when-pass .scr-metric').textContent = m.main;
      bay.querySelector('.scr-when-pass .scr-sub').textContent = upperFirst(m.sub);
      bay.querySelector('.scr-no .scr-metric').textContent = m.main;
    }

    function renderStatic(k) {
      var b = beats[k];
      var cur = b.type === 'overview' ? null : b.c;

      // tabs: who is up, and what became of the ones already judged
      tabs.forEach(function (tab, c) {
        var judged = lastGateBeat[c] != null && k >= lastGateBeat[c];
        tab.setAttribute('data-status', c === cur ? 'current' : (judged ? 'done' : 'waiting'));
        var marks = tab.querySelectorAll('.scr-track i');
        var noAt = null;
        states[c].forEach(function (s, g) {
          var landed = beats.some(function (bb, kk) { return kk <= k && bb.type === 'gate' && bb.c === c && bb.g === g; });
          marks[g].setAttribute('data-s', landed ? s.state : 'notyet');
          if (landed && s.state === 'no') { noAt = s.gate.label; }
        });
        tab.querySelector('.scr-tab-result').textContent = !judged ? '' : (noAt ? 'No at ' + noAt : 'Passes all four');
      });

      // the dock: this candidate's four gates
      var stopped = false;
      bays.forEach(function (bay, g) {
        fillBay(g, cur);
        var state = 'vacant';
        if (cur != null) {
          var landed = beats.some(function (bb, kk) { return kk <= k && bb.type === 'gate' && bb.c === cur && bb.g === g; });
          if (landed) { state = states[cur][g].state; if (state === 'no') { stopped = true; } }
          else if (stopped) { state = 'notyet'; }
        }
        setBay(g, state);
        // the tell-tale of a NO that hit this bay earlier, for a candidate already gone
        var scar = beats.some(function (bb, kk) {
          return bb.type === 'gate' && bb.verdict === 'no' && bb.g === g && kk <= k && (cur == null || bb.c !== cur);
        });
        bay.setAttribute('data-scar', scar ? '1' : '0');
      });

      // the reason, in the gate's own words
      if (b.type === 'gate') {
        var gate = states[b.c][b.g].gate;
        cap.innerHTML = '<b>' + esc(gate.label) + '.</b> ' + esc(gate.reason);
      } else {
        cap.textContent = '';
      }
      cap.style.fontSize = '';
      if (cap.scrollHeight > 100) { cap.style.fontSize = '36px'; }

      // the survivor's figures
      var paying = b.type === 'payoff';
      root.setAttribute('data-band', paying ? '1' : '0');
      if (paying) {
        var r = results[b.c];
        band.classList.toggle('is-plain', !r.winner);
        payoffFigures(r).forEach(function (f, i) {
          figs[i].setAttribute('data-shown', '1');
          figs[i].querySelector('.scr-fig-label').textContent = f.label;
          figs[i].querySelector('.scr-fig-value').innerHTML =
            (f.about ? '<span class="scr-v">about</span>' : '') + '<span class="scr-d">' + esc(f.text) + '</span>';
        });
        src.textContent = assumptionsLine(r.cashFreed > 0 ? b.c : null);
      } else {
        src.textContent = assumptionsLine(null);
      }
      fitOneLine([src], 75);

      root.style.transform = '';
      band.style.clipPath = '';
      if (slideEl) { slideEl.classList.remove('scr-negative'); }
      root.setAttribute('data-beat', k);
      root.setAttribute('data-beat-type', b.type);
    }

    /* ---- motion: only when stepping forward by one, and never in print ---- */
    var playing = null;      // the timeline in flight
    var current = 0;

    function stopPlaying() {
      if (playing) { playing.pause(); playing = null; }
    }

    function playGate(k) {
      var b = beats[k];
      var bay = bays[b.g];
      var shutter = bay.querySelector('.scr-shutter');
      var tl = M.timeline();
      if (b.verdict === 'pass') {
        // The gate shuts for an eighth, then lifts over one beat. PASS cuts in a sixteenth before it stops.
        tl.at(0, function () { bay.setAttribute('data-state', 'shut'); });
        tl.add({
          from: FULL, to: RAISED, duration: T.lift, ease: EASE_LIFT,
          onUpdate: function (h) { shutter.style.height = h.toFixed(1) + 'px'; }
        }, T.shutHold);
        tl.at(T.shutHold + T.lift * 0.75, function () { bay.setAttribute('data-word', '1'); });
        tl.at(T.shutHold + T.lift, function () { renderStatic(k); });
      } else {
        // The bay is held vacant. Then the shutter falls through the floor, the slide
        // recoils and prints in negative for two beats. Only then does the reason cut in.
        var hit = T.holdBefore + T.drop;
        tl.at(T.holdBefore, function () { bay.setAttribute('data-dropping', '1'); });
        tl.add({
          from: 0, to: THROUGH, duration: T.drop, ease: EASE_DROP,
          onUpdate: function (h) { shutter.style.height = h.toFixed(1) + 'px'; }
        }, T.holdBefore);
        tl.at(hit, function () { if (slideEl) { slideEl.classList.add('scr-negative'); } });
        tl.add({
          from: 14, to: 0, duration: T.jolt, ease: EASE_ARRIVE,
          onUpdate: function (y, p) { root.style.transform = p > 0 && p < 1 ? 'translateY(' + y.toFixed(1) + 'px)' : ''; }
        }, hit);
        tl.at(hit + T.hold, function () { renderStatic(k); });
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
        if (slideEl) { slideEl.classList.remove('scr-negative'); }
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
    { key: 'minutesPerRun',         label: 'Minutes saved each time',  step: 1 },
    { key: 'runsPerWeek',           label: 'Times a week',             step: 5 },
    { key: 'tier',                  label: 'What runs it',             type: 'cycle' },
    { key: 'toolsPerMonth',         label: 'Tools, a month',           step: 10, pre: '$' },
    { key: 'buildHours',            label: 'Build and rollout hours',  step: 4 },
    { key: 'upkeepHoursPerMonth',   label: 'Upkeep hours a month',     step: 0.5 },
    { key: 'growth',                label: 'Growth over a year',       step: 0.1, post: TIMES },
    { key: 'ownerNamed',            label: 'Owner for the freed time', type: 'yesno' },
    { key: 'lens',                  label: 'Product or service',       type: 'lens' },
    { key: 'touchesCashPath',       label: 'On the cash path',         type: 'yesno' },
    { key: 'daysOffCashCycle',      label: 'Days off the cash cycle',  step: 1, lens: 'product' },
    { key: 'capacityConversion',    label: 'Becomes paid work',        step: 10, post: '%', share: true, lens: 'service' },
    { key: 'billableMarginPerHour', label: 'Margin per billable hour', step: 5, pre: '$', lens: 'service' }
  ];

  /* The house rules and the rates behind them. `path` is group.key in the assumptions Gates takes. */
  var RULES = [
    { path: 'houseRules.costMaxShareOfReturn', label: 'Cost limit, of return',  step: 5, post: '%', share: true },
    { path: 'houseRules.minReturnPerYear',     label: 'Return floor, a year',   step: 500, pre: '$' },
    { path: 'houseRules.maxPaybackWeeks',      label: 'Payback limit, weeks',   step: 1 },
    { path: 'houseRules.minGrowth',            label: 'Growth minimum',         step: 0.1, post: TIMES },
    { path: 'rates.loadedHourly',              label: 'Staff time, an hour',    step: 5, pre: '$' },
    { path: 'rates.builderHourly',             label: 'Builder time, an hour',  step: 5, pre: '$' },
    { path: 'rates.workWeeks',                 label: 'Working weeks a year',   step: 1 },
    { path: 'company.annualRevenue',           label: 'Sales a year',           step: 1000000, pre: '$' }
  ];

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
      return String(cm().tidy(spec.share ? raw * 100 : raw));
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
    var store = storageFor(opts.persist);
    var memoryKey = layout + ':' + (opts.persist || 'none');
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
        var saved = JSON.parse(store.getItem(STORE_KEY) || 'null');
        if (!saved || saved.v !== 1 || !usable(saved.state)) { return null; }
        // On stage the saved state belongs to one set of examples; if they were edited since, start clean.
        if (opts.persist === 'session' && saved.signature !== signature) { return null; }
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
      try { store.setItem(STORE_KEY, JSON.stringify({ v: 1, signature: signature, state: state })); }
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

    function stepperHtml(attrs, spec, isText) {
      return '<span class="stepper scr-stepper">' +
        (isText ? '' : '<button type="button" class="scr-step" data-dir="-1" aria-label="Less">' + MINUS + '</button>') +
        (spec.pre ? '<span class="scr-unit is-pre">' + spec.pre + '</span>' : '') +
        '<input class="field" type="text" ' + (isText ? '' : 'inputmode="decimal" ') + 'autocomplete="off" autocapitalize="off" spellcheck="false" data-keys="own" ' + attrs + '>' +
        (spec.post ? '<span class="scr-unit">' + spec.post + '</span>' : '') +
        (isText ? '' : '<button type="button" class="scr-step" data-dir="1" aria-label="More">+</button>') +
        '</span>';
    }

    function controlHtml(spec) {
      var id = uid + '-' + spec.key;
      var body;
      if (spec.type === 'cycle') {
        body = '<span class="stepper scr-stepper" role="group" aria-labelledby="' + id + '-l">' +
          '<button type="button" class="scr-step" data-dir="-1" aria-label="Cheaper tool">‹</button>' +
          '<span class="scr-cycle-value" aria-live="polite"></span>' +
          '<button type="button" class="scr-step" data-dir="1" aria-label="Dearer tool">›</button></span>';
      } else if (spec.type === 'yesno') {
        body = '<span class="seg scr-seg" role="group" aria-labelledby="' + id + '-l">' +
          '<button type="button" data-value="true">Yes</button><button type="button" data-value="false">No</button></span>';
      } else if (spec.type === 'lens') {
        body = '<span class="seg scr-seg" role="group" aria-labelledby="' + id + '-l">' +
          '<button type="button" data-value="product">Product</button><button type="button" data-value="service">Service</button></span>';
      } else {
        body = stepperHtml('id="' + id + '" data-field="' + spec.key + '"', spec, false);
      }
      return '<div class="scr-ctl" data-ctl="' + spec.key + '"' + (spec.lens ? ' data-lens="' + spec.lens + '"' : '') + '>' +
        '<div class="scr-ctl-top"><label class="scr-ctl-label" id="' + id + '-l"' + (spec.type ? '' : ' for="' + id + '"') + '>' + esc(spec.label) + '</label>' +
        (spec.type === 'cycle' ? '<span class="scr-ctl-note"></span>' : '') + '</div>' + body + '</div>';
    }

    function ruleHtml(spec) {
      var id = uid + '-' + spec.path.replace('.', '-');
      return '<div class="scr-ctl" data-ctl="' + spec.path + '">' +
        '<div class="scr-ctl-top"><label class="scr-ctl-label" for="' + id + '">' + esc(spec.label) + '</label></div>' +
        stepperHtml('id="' + id + '" data-rule="' + spec.path + '"', spec, false) + '</div>';
    }

    var boardHtml = '<div class="scr-corner scr-l">Three candidates</div>' +
      [0, 1, 2].map(function (c) {
        return '<div class="scr-head" data-cand="' + c + '">' +
          '<button type="button" class="scr-pick" data-pick="' + c + '" aria-label="Edit candidate ' + LETTERS[c] + '">' + LETTERS[c] + '</button>' +
          '<span class="scr-pickname" aria-hidden="true"></span>' +
          '<input class="field scr-name" type="text" autocomplete="off" spellcheck="false" data-keys="own" data-cand="' + c + '" data-field="name" aria-label="Name of candidate ' + LETTERS[c] + '" placeholder="Candidate ' + LETTERS[c] + '">' +
          '</div>';
      }).join('') +
      '<div class="scr-tagcell"></div>' +
      [0, 1, 2].map(function (c) { return '<div class="scr-tagcell scr-l" data-tag="' + c + '"></div>'; }).join('') +
      G.GATES.map(function (gate, g) {
        var last = g === G.GATES.length - 1 ? ' scr-row-last' : '';
        return '<div class="scr-glabel scr-d' + last + '">' + esc(gate.label) + '</div>' +
          [0, 1, 2].map(function (c) {
            return '<div class="scr-cell' + last + '" data-cand="' + c + '" data-gate="' + gate.id + '" data-state="notyet">' +
              '<span class="scr-chipslot"></span><span class="scr-metric"></span></div>';
          }).join('');
      }).join('') +
      '<div class="scr-rlabel scr-l"></div>' +
      [0, 1, 2].map(function (c) {
        return '<div class="scr-result" data-cand="' + c + '" data-outcome="no"><div class="scr-result-main"></div><div class="scr-result-sub"></div></div>';
      }).join('');

    root.innerHTML =
      '<div class="scr-tools">' +
        '<button type="button" class="btn scr-btn" data-act="rules" aria-expanded="false">House rules</button>' +
        '<button type="button" class="btn scr-btn" data-act="reset" title="Put the three examples and the default rules back">Reset</button>' +
      '</div>' +
      '<div class="scr-board">' + boardHtml + '</div>' +
      '<i class="scr-sel" aria-hidden="true"></i>' +
      '<div class="scr-editor">' +
        '<div class="scr-ctl scr-ctl-name" data-ctl="name"><div class="scr-ctl-top"><label class="scr-ctl-label" for="' + uid + '-name">What is it called?</label></div>' +
          stepperHtml('id="' + uid + '-name" data-field="name" placeholder="Name this candidate"', {}, true) + '</div>' +
        FIELDS.map(controlHtml).join('') +
      '</div>' +
      '<div class="scr-rules" hidden>' +
        '<h3 class="scr-rules-head scr-d">House rules</h3>' +
        RULES.map(ruleHtml).join('') +
        '<p class="scr-rules-note">These are defaults, not laws. Change one and every verdict is worked out again. Sales a year only turns days off the cash cycle into dollars.</p>' +
      '</div>' +
      '<div class="scr-detail"></div>' +
      '<p class="scr-assume source-line" role="status"></p>' +
      '<div class="scr-bar" role="status"><span class="scr-bar-chip"></span><span class="scr-bar-text"></span></div>';
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
        if (typeof b === 'number' && typeof r === 'number' && isFinite(b) && isFinite(r)) { return String(CM.tidy(b + r)); }
        return shownValue(b, spec);
      }
      return shownValue(cand[spec.key], spec);
    }

    function writeField(c, key, text) {
      var cand = state.candidates[c];
      var spec = fieldSpec(key);
      if (key === 'name') { cand.name = String(text); }
      else if (key === 'buildHours') { cand.buildHours = storedValue(text, spec); cand.rolloutHours = 0; }
      else if (key === 'touchesCashPath' || key === 'ownerNamed') { cand[key] = text === true || text === 'true'; }
      else if (key === 'lens') { cand.lens = text === 'service' ? 'service' : 'product'; }
      else if (key === 'tier') { cand.tier = String(text); }
      else { cand[key] = storedValue(text, spec); }
      state.example[c] = false;
    }

    function ruleSpec(path) {
      for (var i = 0; i < RULES.length; i++) { if (RULES[i].path === path) { return RULES[i]; } }
      return null;
    }
    function readRule(path) { var p = path.split('.'); return state.assumptions[p[0]][p[1]]; }
    function writeRule(path, text) {
      var p = path.split('.');
      state.assumptions[p[0]][p[1]] = storedValue(text, ruleSpec(path) || {});
    }

    /* ---- drawing ---- */
    function renderEditor() {
      var cand = state.candidates[state.selected];
      var lens = cand.lens === 'service' ? 'service' : 'product';
      qa('.scr-editor input[data-field]').forEach(function (input) {
        var key = input.getAttribute('data-field');
        if (doc.activeElement === input) { return; }          // never rewrite the box being typed in
        input.value = key === 'name' ? (cand.name || '') : shownField(cand, fieldSpec(key));
      });
      qa('.scr-editor .scr-ctl[data-lens]').forEach(function (ctl) { ctl.hidden = ctl.getAttribute('data-lens') !== lens; });
      qa('.scr-editor .scr-seg').forEach(function (seg) {
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
      });
      rulesBox.hidden = !state.rulesOpen;
      if (layout === 'stage') { editor.hidden = state.rulesOpen; }
      var btn = q('[data-act="rules"]');
      btn.setAttribute('aria-expanded', state.rulesOpen ? 'true' : 'false');
      btn.textContent = state.rulesOpen ? 'Close rules' : 'House rules';
    }

    /*
     * The assumptions behind every figure, in one place on screen. The page has
     * room for the rules in Gates' own sentences; the stage gets the short form.
     * The limits are printed as they are set; nothing is worked out here.
     */
    function assumptionsLine(r) {
      var a = r.assumptions;
      var h = a.houseRules;
      var rates = 'Time at ' + CM.money(a.rates.loadedHourly) + ' an hour, building at ' + CM.money(a.rates.builderHourly) +
        ', ' + CM.number(a.rates.workWeeks) + ' working weeks a year. A run is ' + CM.number(a.tokens.in) + ' tokens in, ' +
        CM.number(a.tokens.out) + ' out.';
      if (layout === 'page') {
        return 'House rules, yours to change. ' + G.ORDER.map(function (id) { return r.gates[id].rule; }).join(' ') + ' ' + rates;
      }
      return 'House rules, yours to change: cost up to ' + CM.number(CM.tidy(h.costMaxShareOfReturn * 100)) + '% of return' + DOT +
        'return from ' + CM.money(h.minReturnPerYear) + ' a year, or on the cash path' + DOT +
        'payback within ' + CM.number(h.maxPaybackWeeks) + ' ' + plural(h.maxPaybackWeeks, 'week') + DOT +
        'growth from ' + CM.number(h.minGrowth) + TIMES + ', with an owner. ' + rates;
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
          cell.querySelector('.scr-chipslot').innerHTML = chipHtml(s.state);
          cell.querySelector('.scr-metric').textContent = s.state === 'notyet' ? '' : s.gate.metricText;
          cell.title = s.state === 'notyet' ? 'Not yet: an earlier gate said no.' : s.gate.reason;
        });

        var box = q('.scr-result[data-cand="' + c + '"]');
        var main = box.querySelector('.scr-result-main');
        var sub = box.querySelector('.scr-result-sub');
        if (r.verdict === 'YES') {
          anyWinner = anyWinner || r.winner;
          box.setAttribute('data-outcome', r.winner ? 'winner' : 'pass');
          main.innerHTML = '<b class="scr-d">' + esc(CM.money(r.twoYearValue)) + '</b><span>over two years</span>';
          if (r.cashFreed > 0) {
            var cash = aboutFigure(r.cashFreed);
            sub.textContent = 'Frees ' + (cash.about ? 'about ' : '') + cash.text + ' in cash, once';
          } else {
            sub.textContent = 'Pays back in ' + G.formatWeeks(r.paybackWeeks);
          }
        } else {
          box.setAttribute('data-outcome', 'no');
          main.innerHTML = '<span>Out at ' + esc(r.gates[r.firstNo].label) + '</span>';
          sub.textContent = '';
        }
        box.setAttribute('data-two-year', String(r.twoYearValue));
        box.title = r.summary;
      });

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

      q('.scr-assume').textContent = r.warnings.length
        ? 'Check ' + LETTERS[state.selected] + ': ' + r.warnings[0]
        : assumptionsLine(r);

      var states = gateStates(r);
      q('.scr-detail').innerHTML =
        '<h3 class="scr-detail-head scr-d">' + LETTERS[state.selected] + DOT + esc(r.name || 'Candidate ' + LETTERS[state.selected]) + '</h3>' +
        '<p class="scr-detail-sum">' + esc(r.summary) + '</p>' +
        r.warnings.map(function (w) { return '<p class="scr-detail-warn">' + esc(w) + '</p>'; }).join('') +
        '<ul class="scr-detail-list">' + states.map(function (s) {
          return '<li>' + chipHtml(s.state) + '<span class="scr-detail-gate scr-d">' + esc(s.gate.label) + '</span>' +
            '<span class="scr-detail-why">' + esc(s.state === 'notyet' ? 'Not yet. A candidate stops at its first NO.' : s.gate.reason) + '</span></li>';
        }).join('') + '</ul>';
      q('.scr-bar-chip').innerHTML = chipHtml(r.verdict === 'YES' ? 'pass' : 'no');
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
      if (spec.share) { next = Math.min(100, next); }
      input.value = String(next);
      if (input.hasAttribute('data-rule')) { writeRule(key, input.value); } else { writeField(state.selected, key, input.value); }
      changed();
    }

    function onClick(e) {
      var t = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!t || !root.contains(t)) {
        var headCell = e.target && e.target.closest ? e.target.closest('.scr-head') : null;
        if (headCell && root.contains(headCell)) { select(Number(headCell.getAttribute('data-cand'))); }
        return;
      }
      if (t.hasAttribute('data-pick')) { select(Number(t.getAttribute('data-pick'))); return; }
      if (t.classList.contains('scr-step')) { nudge(t); return; }
      if (t.hasAttribute('data-value')) {
        writeField(state.selected, t.closest('.scr-ctl').getAttribute('data-ctl'), t.getAttribute('data-value'));
        renderEditor(); changed(); return;
      }
      var act = t.getAttribute('data-act');
      if (act === 'reset') { reset(); }
      if (act === 'rules') { state.rulesOpen = !state.rulesOpen; renderRules(); }
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
      if (store) { try { store.removeItem(STORE_KEY); } catch (e) { /* nothing to remove */ } }
      if (doc.activeElement && root.contains(doc.activeElement) && doc.activeElement.blur) { doc.activeElement.blur(); }
      renderAll();
    }

    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('focusin', onFocusIn);
    renderAll();

    return {
      step: function () {},
      resize: function () {},
      destroy: function () {
        root.removeEventListener('input', onInput);
        root.removeEventListener('click', onClick);
        root.removeEventListener('focusin', onFocusIn);
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
    if (opts.persist === undefined && opts.layout !== 'page') { opts.persist = 'session'; }
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
