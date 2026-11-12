/*
 * scenes/project.js: the real project's story (Act 4, everything except the
 * live warehouse scene).
 *
 * WHAT IS IN HERE
 *
 *   window.PROJECT            small helpers shared by slides/a4a-winner.js and
 *                             slides/a4c-project.js: the facts (read from
 *                             window.YOUR.slotting.results, never typed here),
 *                             number formatting, and the computed figures
 *                             (the minutes-alone screen, the model-call totals).
 *
 *   Scenes 'project'          one scene, seven kinds. It draws nothing itself:
 *                             the slide's html already holds the finished
 *                             picture (so the overview, the presenter preview
 *                             and the PDF show it), and the scene only plays it
 *                             in. It is mounted on a hidden element:
 *
 *       <i class="px-driver" data-scene="project" data-opts='{"kind":"attempts"}' hidden></i>
 *
 *                             kinds: winner, rack, results, attempts, no, cost, scorecard
 *
 * HOW THE MOTION WORKS
 *
 *   Each kind writes ONE Motion.timeline for the whole slide, cut into one
 *   segment per step. Arriving at a step plays its segment; stepping back,
 *   reloading, printing or jumping seeks straight to the end of it. Because
 *   it is a timeline, any frame can be rendered at any time:
 *
 *       __deck.scene('project').seq.tl.seek(seconds)
 *
 *   All time comes from Motion.now() (the playhead is a Motion.tween), so
 *   ?fast and frozen-clock capture work. Gate shutters use the theme's own
 *   CSS moves (.gate.is-pass / .is-no), started from the timeline.
 *
 *   The house rules it follows (docs/DIRECTION.md, Part 1): nothing fades,
 *   small type cuts, Fraunces wipes, bars grow at one constant speed, counters
 *   tick twelve times, 0.8s of nothing before a NO and 0.9s after it.
 *
 * Confidentiality: results and counts only. No names of systems, vendors,
 * people, buildings, doors or aisles appear here or in the slides.
 */
(function () {
  'use strict';

  var M = window.Motion || null;
  var T = window.THEME || null;

  /* ======================================================================
   * The facts and the figures computed from them  ->  window.PROJECT
   * ==================================================================== */

  var Y = window.YOUR || {};
  var SL = Y.slotting || {};
  var R = SL.results || {};

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** How many decimals a figure was written with: 133.6 -> 1, 23 -> 0. */
  function decimalsOf(x) {
    var s = String(x);
    var i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(4, s.length - i - 1);
  }

  /** 6493 -> "6,493" · (47, 1) -> "47.0" */
  function num(x, decimals) {
    if (typeof x !== 'number' || !isFinite(x)) { return '\u2014'; }      // a figure that is missing from the numbers file
    var d = decimals == null ? decimalsOf(x) : decimals;
    var fmt = ',' + (d > 0 ? '.' + d + 'f' : 'd');
    return M ? M.formatNumber(x, fmt) : String(x);
  }

  /** -27.2 -> "−27.2%" · 16.4 -> "+16.4%" (a real minus sign, never a hyphen) */
  function signedPct(x) {
    var body = num(Math.abs(x)) + '%';
    return (x < 0 ? '−' : '+') + body;
  }

  /** A figure for display type: the thousands comma gets a little air, so it
      never fuses with the 4 or the 1 beside it (returns html). */
  function numDisplay(x, decimals) {
    return num(x, decimals).replace(/,/g, '<span class="px-comma">,</span>');
  }

  /** Straight double quotes to curly ones, for labels set on screen. */
  function curly(s) {
    return String(s == null ? '' : s).replace(/"([^"]*)"/g, '\u201c$1\u201d');
  }

  /** A line of copy closed with a full stop (for lists set as sentences). */
  function sentence(s) {
    s = String(s == null ? '' : s).trim();
    return s ? s + (/[.!?]$/.test(s) ? '' : '.') : '';
  }

  function lowerFirst(s) {
    s = String(s || '');
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function upperFirst(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function isFilled(v) {
    return !(v == null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && !isFinite(v)));
  }

  function money(x) {
    return window.CostMath ? window.CostMath.money(x) : '$' + num(x);
  }

  function tidy(x) {
    return window.CostMath ? window.CostMath.tidy(x) : Math.round(x * 1e6) / 1e6;
  }

  /**
   * The project "on minutes alone", pushed through the same four-gate math as
   * every other candidate (Gates.evaluate), so the verdict follows the live
   * rate and the live house rules. Hours saved a year come from the two pick
   * time figures; nothing else goes in.
   *
   * Picking IS on the cash path (the cash-path slide draws it), so the
   * candidate says so. It takes no days off the cash cycle: fewer walking
   * hours do not bring cash in sooner. The house rule (brief, section 4):
   * RETURN says NO when yearly return is under the floor AND the task takes no
   * days off the cash cycle; touching the path is not enough on its own.
   * The same rule is applied here as well as in Gates, so the slide can never
   * wave the minutes through on the cash-path tick alone (an older Gates did).
   */
  var DAYS_OFF_CASH_CYCLE = 0;
  function minutesAlone() {
    var hours = tidy(Number(R.pickHoursAsIs) - Number(R.pickHoursOptimized));
    var out = { hours: hours, rate: null, value: null, pass: null, limit: null, daysOff: DAYS_OFF_CASH_CYCLE, costPass: null, costPerYear: null, ok: false };
    var G = window.Gates;
    if (!G || !isFinite(hours)) { return out; }
    try {
      var A = G.defaultAssumptions();
      var weeks = Number(A.rates.workWeeks) || 50;
      var ev = G.evaluate({
        id: 'slotting-minutes', name: 'Warehouse slotting, on minutes alone', lens: 'product',
        minutesPerRun: tidy(hours * 60 / weeks), runsPerWeek: 1,      // = hours a year, written the way the math takes it
        tier: 'code', toolsPerMonth: 0,                               // no model runs when the tool runs
        buildHours: 0, rolloutHours: 0, upkeepHoursPerMonth: 0, growth: 1,
        touchesCashPath: true, daysOffCashCycle: DAYS_OFF_CASH_CYCLE, ownerNamed: true
      }, A);
      var ret = ev.gates['return'];
      var value = Number(ret.metric);
      var limit = Number(ret.limit);
      // under the floor (exactly on it is not under), with no cash days: NO
      var under = value < limit && Math.abs(value - limit) > 1e-9 * Math.max(1, Math.abs(limit));
      out.rate = A.rates.loadedHourly;
      out.value = ev.laborValue;
      out.pass = !!ret.pass && !(under && !(DAYS_OFF_CASH_CYCLE > 0));
      out.limit = ret.limit;
      out.costPass = !!ev.gates.cost.pass;
      out.costPerYear = ev.costPerYear;
      out.ok = true;
    } catch (e) { /* the slide shows what it can */ }
    return out;
  }

  /**
   * What the speaker has supplied for the bigger return, the effort and the
   * potential. An entry of the bigger return counts only once it has a value:
   * nothing the speaker has left empty is ever drawn for the audience.
   */
  function supplied() {
    var list = (Array.isArray(SL.biggerReturn) ? SL.biggerReturn : []).filter(function (b) {
      return b && isFilled(b.value);
    });
    var effort = SL.effort || {};
    var potential = SL.potential || {};
    return {
      bigger: list,
      filled: list.length > 0,
      buildHours: isFilled(effort.buildHours) ? effort.buildHours : null,
      upkeepHoursPerMonth: isFilled(effort.upkeepHoursPerMonth) ? effort.upkeepHoursPerMonth : null,
      growth: isFilled(potential.growth) ? potential.growth : null,
      potentialNote: isFilled(potential.note) ? potential.note : null
    };
  }

  /**
   * "If each of the tries were a model call": the total for one run at three
   * price tiers, from CostMath (which reads the BenchLM file) and the task
   * size on screen.
   */
  function modelCalls() {
    var run = R.run || {};
    var calls = tidy((Number(run.starts) || 0) * (Number(run.stepsPerStart) || 0));
    var CM = window.CostMath;
    var out = { calls: calls, tokens: null, rows: [], source: '', ok: false };
    if (!CM || !(calls > 0)) { return out; }
    try {
      out.tokens = CM.tokens();
      ['small', 'frontier', 'premium'].forEach(function (id) {
        var t = CM.tier(id);
        if (!t || t.missing || !(t.pricePerRun > 0)) { return; }
        var total = CM.volumeCost(t.pricePerRun, calls);
        out.rows.push({ id: id, label: t.label, model: t.modelName, perRun: t.pricePerRun, total: total, text: CM.money(total) });
      });
      var meta = (window.BENCHLM && window.BENCHLM.meta) || {};
      out.source = (meta.source || 'BenchLM leaderboard export') + (meta.retrieved ? ', ' + meta.retrieved : '');
      out.ok = out.rows.length > 0;
    } catch (e) { /* the slide leaves the comparison out */ }
    return out;
  }

  window.PROJECT = {
    results: R,
    slotting: SL,
    esc: esc,
    num: num,
    numDisplay: numDisplay,
    curly: curly,
    sentence: sentence,
    decimalsOf: decimalsOf,
    signedPct: signedPct,
    lowerFirst: lowerFirst,
    upperFirst: upperFirst,
    isFilled: isFilled,
    money: money,
    tidy: tidy,
    minutesAlone: minutesAlone,
    supplied: supplied,
    modelCalls: modelCalls,
    driver: function (kind, extra) {
      var opts = { kind: kind };
      Object.keys(extra || {}).forEach(function (k) { opts[k] = extra[k]; });
      return '<i class="px-driver" data-scene="project" data-opts=\'' + JSON.stringify(opts) + '\' hidden></i>';
    }
  };

  /* ======================================================================
   * Scoped styles. Everything is keyed to a px- class that only these slides
   * use, and everything is written with the theme's tokens.
   * ==================================================================== */

  var CSS = [
    '.px-driver { display: none !important; }',
    /* a piece the timeline has not reached yet. Only while the scene is live:
       static copies (overview, presenter preview) show the finished picture. */
    '.px-live [data-px]:not(.is-on) { visibility: hidden; }',
    '.px-tag-tr { position: absolute; right: var(--m-right); top: 62px; z-index: 2; }',
    '.px-comma { margin: 0 0.015em 0 0.025em; }',
    '.px-nobr { white-space: nowrap; }',

    /* ---- the-winner ---- */
    '.px-winner-say { margin-top: 84px; }',
    '.px-winner-sub { margin-top: 40px; }',
    '.px-fact { margin-top: auto; margin-bottom: 22px; display: flex; align-items: flex-end; gap: 64px; padding-top: 44px; border-top: var(--w-rule) solid var(--c-line); }',
    '.px-fact-n { flex: none; font-size: var(--t-mega); min-width: 620px; }',
    '.px-fact-t { display: flex; flex-direction: column; gap: 22px; padding-bottom: 4px; }',
    '.px-fact-t1 { font-size: 52px; font-weight: 700; line-height: 1.08; }',
    '.px-fact-t2 { font-size: var(--t-voice-l); }',

    /* ---- slotting-problem: the rack from the side ---- */
    '.px-prob { position: relative; flex: 1 1 0; min-height: 0; margin-bottom: 8px; }',
    '.px-prob > * { position: absolute; }',
    '.px-lead { left: 0; bottom: 668px; font-size: var(--t-body-l); font-weight: 600; line-height: 1.1; white-space: nowrap; }',
    '.px-band { left: calc((var(--m-x) - var(--spine-w)) * -1); right: calc(var(--m-right) * -1); bottom: 432px; height: 212px; background: var(--c-accent); color: var(--c-accent-ink); }',
    '.px-band > * { position: absolute; }',
    '.px-band-n { left: calc(var(--m-x) - var(--spine-w)); top: 26px; font-size: 232px; }',
    '.px-band-src { left: 452px; top: 34px; color: var(--c-accent-ink); white-space: nowrap; }',
    '.px-band-t { left: 452px; bottom: 30px; font-size: 56px; font-weight: 800; line-height: 1; white-space: nowrap; }',
    '.px-rack { right: 0; bottom: 0; width: 560px; height: 668px; }',
    '.px-rack > * { position: absolute; }',
    '.px-floor { left: -330px; right: calc(var(--m-right) * -1); bottom: 0; height: var(--w-bold); background: var(--c-line); }',
    '.px-post { bottom: var(--w-bold); width: 12px; height: 660px; background: var(--c-line); }',
    '.px-post.is-l { left: 0; }',
    '.px-post.is-r { right: 0; }',
    '.px-lev { left: 12px; right: 12px; height: 106px; }',
    '.px-lev > * { position: absolute; }',
    '.px-beam { left: 0; right: 0; bottom: 0; height: var(--w-bold); background: var(--c-line); }',
    '.px-lev.is-ground > .px-beam { display: none; }',
    '.px-parts { left: 0; right: 0; bottom: var(--w-bold); display: flex; justify-content: space-evenly; align-items: flex-end; }',
    '.px-lev.is-ground > .px-parts { bottom: 0; }',
    '.px-parts > i { width: 44px; height: 44px; border-radius: 50%; background: var(--c-ink); }',
    /* on the hatched levels each part keeps a ring of the ground, so dot and hatch stay two things */
    '.px-lev.is-high .px-parts > i { box-shadow: 0 0 0 6px var(--c-bg); }',
    '.px-prob.is-banded .px-lev.is-high .px-parts > i, .slide.is-static .px-prob:has(> .px-band.is-visible) .px-lev.is-high .px-parts > i { box-shadow: none; }',
    '.slide.is-static .px-prob:has(> .px-band.is-visible) .px-hatch { visibility: hidden; }',
    '.px-hatch { left: 12px; right: 12px; height: 212px; bottom: 432px; background-image: repeating-linear-gradient(135deg, var(--c-ink) 0 4px, transparent 4px 16px); }',
    '.px-zone { right: 592px; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 8px; padding-right: 30px; border-right: var(--w-rule) solid var(--c-line); text-align: right; white-space: nowrap; }',
    '.px-zone > span { font-size: 36px; font-weight: var(--wght-text); line-height: 1; }',
    '.px-rack-tag { right: 0; bottom: -78px; }',

    /* ---- slotting-results: four before / after pairs ---- */
    '.px-results { display: flex; flex-direction: column; }',
    '.px-res-head, .px-results .pair { display: grid; grid-template-columns: 492px 344px 96px 344px 1fr; column-gap: var(--s-4); }',
    '.px-res-head { padding-bottom: 16px; }',
    '.px-res-head > .label { font-stretch: var(--wdth-label-tight); }',
    '.px-results .pair { --ps: 118px; align-items: end; padding: 20px 0 22px; border-top: var(--w-hair) solid var(--c-line); }',
    '.px-results .px-res-head + .pair { border-top: var(--w-rule) solid var(--c-line); }',
    '.px-results .pair-v { min-width: 0; }',
    '.px-results .pair-what { text-wrap: balance; }',
    /* the old building is its own band, under a double rule that closes the table:
       nothing in it sits under the AS-IS / OPTIMIZED heads */
    '.px-old { margin-top: 14px; padding-top: 26px; border-top: 18px double var(--c-line); }',
    '.px-old > .label { font-stretch: var(--wdth-label-tight); }',
    '.px-old-row { display: flex; align-items: baseline; gap: 72px; margin-top: 22px; }',
    '.px-old-f { display: flex; align-items: baseline; gap: 18px; white-space: nowrap; }',
    '.px-old-f > .num { font-size: 104px; }',
    '.px-old-f > span { font-size: var(--t-body-l); font-weight: 700; line-height: 1; }',
    '.px-old-row > .deadpan { margin-left: auto; white-space: nowrap; }',
    '.px-src-more:is([data-step], [data-step-out]):not(.is-visible) { display: none; }',
    '.px-src-line2 { display: block; }',

    /* ---- seven-attempts: columns from a zero line ---- */
    '.px-att { position: relative; flex: none; }',
    '.px-att > * { position: absolute; }',
    '.px-att-zero { left: 0; right: calc(var(--m-right) * -1); height: var(--w-rule); background: var(--c-line); }',
    '.px-att-col { top: 0; bottom: 0; }',
    '.px-att-col > * { position: absolute; }',
    '.px-att-bar { left: 0; width: 200px; background: var(--c-ink); }',
    '.px-att-bar.is-retired.is-struck { background: transparent; border: var(--w-rule) solid var(--c-ink); }',
    '.px-att-bar.is-point { background: var(--c-accent); border: var(--w-rule) solid var(--c-ink); }',
    '.px-att-val { left: 0; font-size: 72px; white-space: nowrap; }',
    '.px-att-ret { left: 0; width: 200px; text-align: center; font-size: var(--t-label); font-weight: var(--wght-label); font-stretch: var(--wdth-label-tight); line-height: 1; letter-spacing: 0.06em; text-transform: uppercase; }',
    '.px-att-lab { left: 0; width: 236px; display: flex; flex-direction: column; gap: 10px; }',
    '.px-att-lab > .num { font-size: 72px; }',
    '.px-att-lab > span { font-size: var(--t-label); font-weight: 600; font-stretch: 87.5%; line-height: 1.14; }',
    '.px-att-line { margin-top: 26px; font-size: var(--t-voice); line-height: 1.1; white-space: nowrap; }',
    '.px-rigor { display: flex; flex-direction: column; gap: 12px; }',
    '.px-rigor > li { position: relative; padding-left: 46px; font-size: 38px; font-weight: 600; line-height: 1.12; white-space: nowrap; }',
    '.px-rigor > li::before { content: ""; position: absolute; left: 0; top: 0.5em; width: 26px; height: var(--w-rule); background: var(--c-ink); }',

    /* ---- said-no: four gates, four shutters ---- */
    '.px-no-head { margin-bottom: 0; }',
    '.px-no-dock { --gw: 458px; --gh: 780px; position: absolute; left: 96px; top: 262px; }',
    '.px-no-dock .gate-name { top: 52px; white-space: normal; font-size: 68px; line-height: 0.94; letter-spacing: 0; text-wrap: balance; }',
    '.px-no-tag { top: 180px; }',
    '.px-no-dock .gate-q { top: auto; bottom: calc(var(--gcap) + var(--gl) + var(--gw) * 0.035 + var(--gw) * 0.733 * var(--cap) + 34px); font-size: var(--t-body-l); font-weight: 700; line-height: 1.1; text-wrap: balance; }',
    '.px-no-dock .gate.is-flare > .gate-q { color: var(--c-accent-ink); mix-blend-mode: normal; }',
    /* static copies (overview, presenter preview): a refusal not reached yet is a vacant bay */
    '.slide.is-static .px-no-dock .gate:has(> .gate-name:not(.is-visible)) > .gate-shutter { height: 0; }',

    /* ---- slotting-cost ---- */
    '.px-facts { flex: 1 1 0; min-height: 0; display: grid; grid-template-columns: 1.02fr 0.78fr 1.2fr; border-top: var(--w-rule) solid var(--c-line); }',
    '.px-facts[data-step-out]:not(.is-visible), .px-cb[data-step]:not(.is-visible) { display: none; }',
    '.px-fact3 { display: flex; flex-direction: column; justify-content: flex-start; gap: 44px; padding: 60px var(--s-5) 0 0; min-width: 0; }',
    '.px-fact3 + .px-fact3 { padding-left: var(--s-5); border-left: var(--w-rule) solid var(--c-line); }',
    '.px-fact3:last-child { padding-right: 0; }',
    '.px-fact3 > .counter-v { --cs: 330px; font-size: var(--cs); }',
    '.px-fact3 > .counter-v > small { font-size: 112px; }',
    '.px-fact3 > p:last-child { font-size: 52px; font-weight: 700; line-height: 1.1; max-width: 560px; text-wrap: balance; }',
    '.px-cost-head { margin-top: 76px; }',
    '.px-cb-recap { margin-top: 0; font-size: 36px; font-weight: 600; line-height: 1.1; white-space: nowrap; }',
    '.px-cb-recap > b { font-weight: 800; }',
    '.px-cb { flex: none; display: flex; flex-direction: column; }',
    '.px-cb > * { flex: none; }',
    '.px-cb-lead { margin-top: 10px; font-size: 48px; font-weight: 700; line-height: 1.08; }',
    '.px-cb-note { margin-top: 12px; font-stretch: var(--wdth-label-tight); }',
    '.px-cb-plot { position: relative; margin-top: 20px; margin-right: calc(var(--m-right) * -1); }',
    '.px-cb-plot > * { position: absolute; }',
    '.px-cb-axis { left: 429px; top: 0; bottom: 0; width: var(--w-rule); background: var(--c-line); }',
    '.px-cb-row { left: 0; right: 0; height: 80px; }',
    '.px-cb-row > * { position: absolute; }',
    '.px-cb-name { left: 0; top: 0; height: 80px; display: flex; align-items: center; font-size: var(--t-body); font-weight: 700; line-height: 1; white-space: nowrap; }',
    '.px-cb-bar { left: 435px; top: 0; height: 80px; background: var(--c-ink); }',
    '.px-cb-val { top: 10px; font-size: 88px; white-space: nowrap; }',
    '.px-cb-val.is-inside { left: auto; right: var(--m-right); color: var(--c-bg); }',
    /* a sliver: the axis is broken beside it (12px clear above and below), so the bar stands alone, and an arrow points at it */
    '.px-cb-cut { left: 423px; top: -12px; width: 18px; height: 104px; background: var(--c-bg); }',
    '.px-cb-ptr { top: 36px; width: 56px; height: 8px; background: var(--c-ink); }',
    '.px-cb-ptr::before { content: ""; position: absolute; left: -14px; top: -10px; border: 14px solid transparent; border-left-width: 0; border-right: 18px solid var(--c-ink); }',
    '.px-cb-plot > .deadpan { right: var(--m-right); top: 14px; }',
    '.px-cb-band { position: relative; flex: none; height: 156px; margin: 0 calc(var(--m-right) * -1) 0 calc((var(--m-x) - var(--spine-w)) * -1); background: var(--c-accent); color: var(--c-accent-ink); }',
    '.px-cb-band > * { position: absolute; }',
    '.px-cb-band-name { left: calc(var(--m-x) - var(--spine-w)); top: 48px; font-family: var(--f-display); font-size: 88px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; }',
    '.px-cb-band-axis { left: calc(var(--m-x) - var(--spine-w) + 429px); top: 0; bottom: 0; width: var(--w-rule); background: var(--c-accent-ink); }',
    '.px-cb-band-val { left: calc(var(--m-x) - var(--spine-w) + 478px); bottom: 28px; font-size: 124px; line-height: 0.9; white-space: nowrap; }',
    '.px-cb-line { margin-top: 22px; font-size: var(--t-voice); line-height: 1.05; white-space: nowrap; }',

    /* ---- slotting-scorecard ---- */
    '.px-sc-head { max-width: 1000px; margin-bottom: 0; line-height: 0.8; text-wrap: initial; }',
    '.px-sc-close { position: absolute; right: var(--m-right); top: 62px; text-align: right; line-height: 1.12; white-space: nowrap; }',
    '.px-sc-dock { --gw: 440px; --gh: 664px; position: absolute; left: var(--m-x); top: 236px; }',
    '.px-sc-dock .gate { --gcap: 80px; }',
    '.px-sc-dock .gate-name { top: calc(var(--gl) * 2 + var(--graised) + 36px); }',
    '.px-sc-dock .gate-why { font-size: var(--t-label); font-stretch: var(--wdth-tight); letter-spacing: 0.03em; white-space: nowrap; }',
    '.px-sc-dock .gate.is-no > .gate-shutter::after { font-size: calc(var(--gw) * 0.47); bottom: calc(var(--gl) + var(--gthrough) + var(--gw) * 0.04); }',
    /* the NO's reason runs to two lines: the floor, and no days off the cash cycle */
    '.px-sc-dock .px-g-return > .gate-why { white-space: normal; line-height: 1.08; }',
    /* after the NO, the gates that never get asked say so: NOT YET, frame only */
    '.px-notyet { position: absolute; left: calc(var(--gl) * 2 + var(--gpad)); top: var(--gh); height: var(--gcap); z-index: 1; display: flex; align-items: center; }',
    '.px-notyet > .verdict { --vh: 56px; }',
    /* static copies at step 3: the closing line has taken the re-slot line's place */
    '.slide.is-static .px-sc-reslot:has(~ .px-sc-close.is-visible) { visibility: hidden; }',
    /* static copies (overview, presenter preview) follow the step: a gate whose
       finding is not printed yet is a vacant bay, and RETURN only shows its NO
       while the minutes are on screen */
    '.slide.is-static .px-sc-dock .gate:not(:has(> .px-find.is-visible)) > .gate-shutter { height: 0; }',
    '.slide.is-static .px-sc-dock .gate:not(:has(> .px-find.is-visible)) > .gate-why { visibility: hidden; }',
    '.slide.is-static .px-sc-dock .gate:not(:has(> .px-find.is-visible))::after, .slide.is-static .px-sc-dock .gate:not(:has(> .px-find.is-visible)) > .gate-name::after { content: none; }',
    '.slide.is-static .px-g-return:not(.is-pass):has(> .px-find-rec2.is-visible) > .gate-shutter { height: 0; }',
    '.slide.is-static .px-g-return:not(.is-pass):has(> .px-find-rec2.is-visible) > .gate-why { visibility: hidden; }',
    '.slide.is-static .px-g-return:not(.is-pass):not(:has(> .px-find-rec2.is-visible))::after { content: none; }',
    '.slide.is-static .px-find-min:has(~ .px-find-rec2.is-visible) { display: none; }',
    '.px-find { position: absolute; left: calc(var(--gl) * 2 + var(--gpad)); right: calc(var(--gl) * 2 + var(--gpad)); top: calc(var(--gl) * 2 + var(--graised) + 126px); z-index: 1; display: flex; flex-direction: column; align-items: flex-start; }',
    '.px-find[data-step]:not(.is-visible) { display: none; }',
    '.px-find.is-blend { color: var(--card); mix-blend-mode: difference; }',
    '.px-find .label { font-stretch: var(--wdth-text); letter-spacing: 0.06em; white-space: nowrap; }',
    '.px-find-l { font-size: var(--t-body); font-weight: 600; line-height: 1.14; white-space: nowrap; }',
    '.px-find-eq { font-size: 100px; margin-top: 16px; white-space: nowrap; }',
    '.px-find-hero { display: flex; align-items: baseline; gap: 18px; margin-top: 6px; white-space: nowrap; }',
    '.px-find-hero > .num { font-size: 200px; }',
    '.px-find-hero > span { font-size: 56px; font-weight: 800; line-height: 1; }',
    /* step 3: the NO on minutes stays on the record as the tell-tale under the
       floor, where a NO's reason is printed; the bay above is free again */
    '.px-sc-dock .px-find.px-find-rec2 { top: var(--gh); height: var(--gcap); left: calc(var(--gl) * 2); right: 0; flex-direction: row; align-items: center; }',
    '.px-find-rec { display: flex; align-items: center; gap: 14px; white-space: nowrap; }',
    '.px-find-rec > .num { font-size: 44px; }',
    '.px-find-rec > span.px-per { font-size: var(--t-label); font-weight: 700; font-stretch: var(--wdth-tight); line-height: 1; }',
    '.px-find-rec > .verdict { --vh: 48px; order: -1; }',
    '.px-find-rec > .verdict.is-pass { --vh: 56px; }',
    /* if the rate is ever set so high that the minutes pass on their own */
    '.px-g-return:has(> .px-find-rec2.is-visible) > .gate-why { visibility: hidden !important; }',
    '.px-g-return.is-minutes-pass > .gate-name::after { content: none; }',
    /* the bigger return: a block inside the bay, above the floor line (a block
       through the floor is the shape of a NO). One designed layout per count. */
    '.px-brx { position: absolute; left: calc(var(--gl) * 2); right: calc(var(--gl) * 2); top: calc(var(--gl) * 2 + var(--graised) + 114px); bottom: calc(var(--gcap) + var(--gl) * 2); z-index: 2; display: flex; flex-direction: column; padding: 18px var(--gpad) 16px; overflow: hidden; }',
    '.px-brx[data-step]:not(.is-visible) { display: none; }',
    '.px-brx > .label { flex: none; font-stretch: var(--wdth-text); letter-spacing: 0.02em; white-space: nowrap; }',
    '.px-brx.is-point { background: var(--c-accent); color: var(--c-accent-ink); }',
    '.px-br { display: flex; flex-direction: column; gap: 18px; margin-top: 20px; min-height: 0; }',
    '.px-br-item { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }',
    '.px-br-item + .px-br-item { padding-top: 16px; border-top: var(--w-rule) solid var(--c-accent-ink); }',
    '.px-br-item.is-cut { display: none; }',
    '.px-br-v { max-width: 100%; font-size: var(--brv, 96px); line-height: 0.84; overflow-wrap: anywhere; }',
    '.px-br-l { font-size: 36px; font-weight: 700; line-height: 1.08; text-wrap: balance; }',
    '.px-br-n { font-size: 36px; font-weight: var(--wght-text); line-height: 1.1; text-wrap: balance; }',
    '.px-br.is-tight .px-br-n { display: none; }',
    /* two or three entries: the first leads, the others are one-line rows */
    '.px-br.is-many .px-br-item + .px-br-item { flex-direction: row; flex-wrap: wrap; align-items: baseline; column-gap: 14px; row-gap: 4px; }',
    '.px-br.is-many .px-br-item + .px-br-item > .px-br-v { font-size: min(var(--brv), 56px); }',
    '.px-br.is-many .px-br-l { font-size: 32px; }',
    '.px-br.is-three .px-br-item { flex-direction: row; flex-wrap: wrap; align-items: baseline; column-gap: 14px; row-gap: 4px; }',
    '.px-br.is-three .px-br-item > .px-br-v { font-size: min(var(--brv), 56px); }',
    '.px-kv { align-self: stretch; display: flex; flex-direction: column; align-items: flex-start; }',
    '.px-kv + .px-kv { margin-top: 26px; padding-top: 22px; border-top: var(--w-hair) solid var(--c-line); }',
    /* a long figure pushes its unit onto the next line instead of through the gate wall */
    '.px-kv-v { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 14px; row-gap: 8px; margin-top: 12px; max-width: 100%; white-space: nowrap; }',
    '.px-kv-v > .num { font-size: 96px; }',
    '.px-kv-v > span { font-size: var(--t-body); font-weight: 700; line-height: 1; }',
    '.px-kv-note { margin-top: 14px; font-size: 36px; font-weight: 600; line-height: 1.14; }',

    /* ---- how-we-built-it ---- */
    '.px-how.is-many > li { min-height: 104px; font-size: var(--t-body); }'
  ].join('\n');

  (function inject() {
    if (document.getElementById('px-style')) { return; }
    var el = document.createElement('style');
    el.id = 'px-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }());

  if (!window.Scenes || !M) { return; }

  /* ======================================================================
   * Time: the theme's note values and curves (120 BPM)
   * ==================================================================== */

  var TM = (T && T.motion) || {};
  var DUR = TM.dur || {};
  var EASE = TM.ease || {};
  var BEAT = (TM.note && TM.note.beat) || 0.5;
  var SWING = (TM.note && TM.note.swing) || 1 / 3;
  var SIXTEENTH = (TM.note && TM.note.sixteenth) || 0.125;
  var D_VOICE = DUR.voice || 1 / 3;
  var D_LIFT = DUR.lift || 0.5;
  var D_DROP = DUR.drop || 0.375;
  var D_COUNT = DUR.count || 1.5;
  var HOLD_BEFORE = DUR.holdBefore || 0.8;
  var HOLD_AFTER = DUR.holdAfter || 0.9;
  var HOLD = DUR.hold || 1;
  var E_ARRIVE = EASE.arrive || 'outExpo';
  var E_LIFT = EASE.lift || 'outCubic';
  var E_DROP = EASE.drop || 'inCubic';
  var SLEEVE = 0.55;                 // the slide transition has cleared the stage by now
  var EPS = 0.02;                    // the gap between two steps' segments

  var arrive = typeof E_ARRIVE === 'function' ? E_ARRIVE : M.ease.outExpo;
  /* a counter: twelve ticks, the last ones small, landing exactly on the value */
  function tickEase(p) { return p >= 1 ? 1 : arrive(Math.floor(p * 12 + 1e-9) / 12); }

  /* ======================================================================
   * The sequencer: one seekable timeline, one segment per step
   * ==================================================================== */

  function Sequencer() {
    var tl = M.timeline();
    var marks = [0];                 // marks[n] = where step n's segment starts; marks[n + 1] = where it ends
    var head = null;                 // the tween that moves the playhead while a segment plays
    var seq = { tl: tl, marks: marks, animated: false, onFreeze: null };

    /** Where the segment being written starts. */
    seq.base = function () { return marks[marks.length - 1] + EPS; };
    /** Close the segment being written at time t. */
    seq.end = function (t) { marks.push(Math.max(seq.base(), t || 0)); return seq; };

    seq.at = function (t, fn, undo) { tl.at(t, fn, undo); return seq; };
    seq.tw = function (t, dur, ease, fn) {
      tl.add({ from: 0, to: 1, duration: dur, ease: ease || 'linear', onUpdate: fn }, t);
      return seq;
    };

    function each(els, fn) {
      if (!els) { return; }
      if (els.nodeType) { fn(els); return; }
      Array.prototype.forEach.call(els, fn);
    }

    /** Cut: on or off, on the grid. All small type arrives this way. */
    seq.cut = function (t, els) {
      each(els, function (el) {
        tl.at(t, function () { el.classList.add('is-on'); }, function () { el.classList.remove('is-on'); });
      });
      return seq;
    };
    /** Take something away again (the opposite of cut). */
    seq.hide = function (t, els) {
      each(els, function (el) {
        tl.at(t, function () { el.classList.remove('is-on'); }, function () { el.classList.add('is-on'); });
      });
      return seq;
    };
    /** Toggle a class at a time. */
    seq.cls = function (t, els, name, on) {
      each(els, function (el) {
        tl.at(t, function () { el.classList.toggle(name, on !== false); }, function () { el.classList.toggle(name, on === false); });
      });
      return seq;
    };
    /** Voice wipe: uncovered left to right. Fraunces lines and bands. */
    seq.wipe = function (t, els, dur, tight) {
      var m = tight ? '0' : '-0.4em';
      var ml = tight ? '0' : '-2em';
      each(els, function (el) {
        seq.cut(t, el);
        seq.tw(t, dur || D_VOICE, E_ARRIVE, function (v) {
          el.style.clipPath = v >= 1 ? '' : 'inset(' + m + ' ' + ((1 - v) * 100).toFixed(2) + '% ' + m + ' ' + ml + ')';
        });
      });
      return seq;
    };
    /** Drop: uncovered from the top down, with gravity. Blocks. */
    seq.drop = function (t, els, dur) {
      each(els, function (el) {
        seq.cut(t, el);
        seq.tw(t, dur || D_DROP, E_DROP, function (v) {
          el.style.clipPath = v >= 1 ? '' : 'inset(-0.4em -0.4em ' + ((1 - v) * 100).toFixed(2) + '% -2em)';
        });
      });
      return seq;
    };
    /** Lift: uncovered from the floor up, like a shutter. */
    seq.lift = function (t, els, dur) {
      each(els, function (el) {
        seq.cut(t, el);
        seq.tw(t, dur || D_LIFT, E_LIFT, function (v) {
          el.style.clipPath = v >= 1 ? '' : 'inset(' + ((1 - v) * 100).toFixed(2) + '% 0 0 0)';
        });
      });
      return seq;
    };
    /** A counter that ticks from one value to another and lands exactly. */
    seq.count = function (t, el, from, to, opts) {
      var o = opts || {};
      var dTo = o.decimals == null ? decimalsOf(to) : o.decimals;
      var dRun = Math.max(dTo, decimalsOf(from));
      var pre = o.prefix || '';
      var suf = o.suffix || '';
      seq.tw(t, o.duration || D_COUNT, tickEase, function (v) {
        var done = v >= 1;
        var x = done ? to : (v <= 0 ? from : from + (to - from) * v);
        var d = done ? dTo : (v <= 0 ? decimalsOf(from) : dRun);
        if (o.display) { el.innerHTML = esc(pre) + numDisplay(x, d) + esc(suf); }
        else { el.textContent = pre + num(x, d) + suf; }
      });
      return seq;
    };

    /**
     * Show step n. animate = true plays its segment from the start;
     * otherwise the finished state is put in place at once.
     */
    seq.show = function (n, animate) {
      if (head) { head.cancel(); head = null; }
      var last = marks[marks.length - 1];
      var a = marks[n] == null ? last : marks[n];
      var b = marks[n + 1] == null ? last : marks[n + 1];
      seq.animated = false;
      if (seq.onFreeze) { seq.onFreeze(); }
      if (!animate || b - a <= EPS * 2) { tl.seek(b); return; }
      tl.seek(a);
      seq.animated = true;
      head = M.tween({
        from: a, to: b, duration: b - a, ease: 'linear', immediate: false,
        onUpdate: function (v) { tl.seek(v); },
        onDone: function () { head = null; seq.animated = false; }
      });
    };

    seq.stop = function () {
      if (head) { head.cancel(); head = null; }
      seq.animated = false;
    };

    return seq;
  }

  /* ======================================================================
   * Gates: the theme's own component, started from the timeline
   * ==================================================================== */

  var GATE_STATES = ['is-pass', 'is-no', 'is-shut', 'is-flare', 'has-tell'];

  /** Put a gate in a state. animated = true lets the theme play its move. */
  function setGate(gate, classes, animated) {
    if (!gate) { return; }
    if (!animated) { gate.classList.add('is-still'); }
    GATE_STATES.forEach(function (c) { gate.classList.remove(c); });
    (classes || []).forEach(function (c) { gate.classList.add(c); });
    if (animated) { gate.classList.remove('is-still'); }
  }

  /** The recoil on impact (no negative hold): restart the theme's jolt. */
  function jolt(els) {
    Array.prototype.forEach.call(els || [], function (el) {
      el.classList.remove('is-jolt');
      void el.offsetWidth;
      el.classList.add('is-jolt');
    });
  }

  /**
   * The bigger return is the speaker's own text and can be any length. Each
   * count of entries has its own designed layout (in the styles); if the words
   * still do not fit the bay: drop the notes (they belong in the speaker notes),
   * then step the figures down (never under 64px, never down to the size of
   * their labels), then show only the entries that fit and say so in the
   * console, which tools/shoot.js reports.
   */
  function fitBigger(box, state) {
    var list = box && box.querySelector('.px-br');
    if (!list || !box.clientHeight) { return; }
    var items = Array.prototype.slice.call(list.querySelectorAll('.px-br-item'));
    var vals = Array.prototype.slice.call(list.querySelectorAll('.px-br-v'));
    list.classList.remove('is-tight');
    items.forEach(function (it) { it.classList.remove('is-cut'); });
    vals.forEach(function (v) { v.style.setProperty('--brv', v.getAttribute('data-brv') + 'px'); });
    function over() { return box.scrollHeight > box.clientHeight + 1; }
    if (!over()) { return; }
    list.classList.add('is-tight');
    for (var size = 88; over() && size >= 64; size -= 8) {
      vals.forEach(function (v) {
        if (Number(v.getAttribute('data-brv')) > size) { v.style.setProperty('--brv', size + 'px'); }
      });
    }
    var shown = items.length;
    while (over() && shown > 1) { items[--shown].classList.add('is-cut'); }
    if ((shown < items.length || over()) && !state.warned) {
      state.warned = true;
      if (window.console && console.error) {
        console.error('[slotting-scorecard] "The bigger return" does not fit its bay: ' + shown + ' of ' + items.length +
          ' entries are shown. Shorten the label or value in deck/content/your-numbers.js, or move the rest to the notes.');
      }
    }
  }

  /* ======================================================================
   * The seven kinds
   * ==================================================================== */

  var BUILD = {};

  /* ---- the-winner ------------------------------------------------------ */
  BUILD.winner = function (c) {
    var seq = c.seq, q = c.q;
    var b = seq.base();
    seq.wipe(b + SLEEVE + BEAT, q('.px-winner-sub'));
    seq.end(b + SLEEVE + BEAT + D_VOICE);

    b = seq.base();
    var n = q('.px-fact-n b');
    if (n) { seq.count(b + SIXTEENTH, n, 0, Number(R.parts) || 0, { display: true }); }
    seq.cut(b + SIXTEENTH + D_COUNT, q('.px-fact-t1'));
    seq.wipe(b + SIXTEENTH + D_COUNT + BEAT + SWING, q('.px-fact-t2'));
    seq.end(b + SIXTEENTH + D_COUNT + BEAT + SWING + D_VOICE);
    c.entrance = true;
  };

  /* ---- slotting-problem: the rack ---------------------------------------- */
  BUILD.rack = function (c) {
    var seq = c.seq, q = c.q, qa = c.qa;
    var b = seq.base() + SLEEVE;
    // the floor, the uprights, then one shelf level at a time, from the floor up
    seq.wipe(b, q('.px-floor'), SIXTEENTH * 2, true);
    seq.lift(b + SIXTEENTH * 2, qa('.px-post'), D_LIFT);
    var t = b + SIXTEENTH * 2 + D_LIFT;
    var starts = [0, BEAT + SWING, BEAT * 2, BEAT * 3 + SWING, BEAT * 5, BEAT * 5 + SWING];   // long-short, a rest between zones
    var levels = qa('.px-lev');
    Array.prototype.forEach.call(levels, function (lev) {
      var i = Number(lev.getAttribute('data-l')) - 1;
      seq.cut(t + starts[i], lev);
    });
    seq.cut(t + starts[0], q('.px-zone[data-z="floor"]'));
    seq.cut(t + starts[1], q('.px-zone[data-z="golden"]'));
    seq.cut(t + starts[3], q('.px-zone[data-z="reach"]'));
    seq.cut(t + starts[4], q('.px-zone[data-z="ladder"]'));
    seq.cut(t + starts[5] + SWING, q('.px-hatch'));
    seq.cut(t + starts[5] + BEAT * 2, q('.px-rack-tag'));
    seq.end(t + starts[5] + BEAT * 2 + EPS);

    // step 1: the sentence, then the band that IS the ladder zone, then the figure
    var prob = q('.px-prob');
    if (prob) { prob.classList.remove('is-banded'); }
    b = seq.base();
    seq.cut(b + SIXTEENTH, q('.px-lead'));
    var bandAt = b + SIXTEENTH + BEAT * 2;
    seq.wipe(bandAt, q('.px-band'), BEAT, true);
    seq.hide(bandAt, q('.px-hatch'));
    seq.cls(bandAt, q('.px-prob'), 'is-banded', true);
    var n = q('.px-band-n b');
    if (n) {
      seq.cut(bandAt, q('.px-band-n'));
      seq.count(bandAt, n, 0, Number(R.ladderPctAsIs) || 0, { suffix: '%' });
    }
    seq.cut(bandAt + D_COUNT, q('.px-band-t'));
    seq.cut(bandAt + D_COUNT, q('.px-band-src'));
    seq.end(bandAt + D_COUNT + EPS);
    c.entrance = true;
  };

  /* ---- slotting-results ---------------------------------------------------- */
  BUILD.results = function (c) {
    var seq = c.seq, q = c.q, qa = c.qa;
    seq.end(0);                                    // step 0: the as-is column, at rest

    var b = seq.base() + SIXTEENTH;
    var rows = qa('.px-results .pair');
    var t = b;
    Array.prototype.forEach.call(rows, function (row) {
      var after = row.querySelector('.pair-v.is-after');
      var val = after && after.querySelector('b');
      var from = Number(row.getAttribute('data-from'));
      var to = Number(row.getAttribute('data-to'));
      var point = row.hasAttribute('data-point');
      if (point) { row.classList.remove('is-point'); t += BEAT; }   // the row that is the point waits one beat of nothing
      seq.cut(t, row.querySelector('.pair-arrow'));
      seq.cut(t, after);
      if (val) { seq.count(t, val, from, to, { suffix: val.getAttribute('data-suffix') || '' }); }
      seq.cut(t + D_COUNT, row.querySelector('.pair-note'));
      if (point) { seq.cls(t + D_COUNT, row, 'is-point', true); }
      t += BEAT * 2;
    });
    seq.end(t - BEAT * 2 + D_COUNT + EPS);

    b = seq.base() + SIXTEENTH;
    var figs = qa('.px-old-f');
    seq.cut(b, figs[0]);
    seq.cut(b + BEAT + SWING, figs[1]);
    seq.wipe(b + BEAT * 4, q('.px-old .deadpan'));
    seq.end(b + BEAT * 4 + D_VOICE);
  };

  /* ---- seven-attempts ------------------------------------------------------ */
  BUILD.attempts = function (c) {
    var seq = c.seq, q = c.q, qa = c.qa;
    var SPEED = 380;                               // px per second: every bar at one speed
    var cols = Array.prototype.slice.call(qa('.px-att-col'));

    function grow(col, t) {
      var bar = col.querySelector('.px-att-bar');
      var full = Number(bar.getAttribute('data-h')) || 0;
      var dur = Math.max(SIXTEENTH / 2, full / SPEED);
      seq.cut(t, bar);
      seq.tw(t, dur, 'linear', function (v) { bar.style.height = (full * v).toFixed(1) + 'px'; });
      seq.cut(t + dur, col.querySelector('.px-att-val'));
      return t + dur;
    }

    var b = seq.base() + SLEEVE;
    seq.wipe(b, q('.px-att-zero'), BEAT, true);
    seq.end(b + BEAT);

    // step 1: the dip. Three attempts, each lower than the last.
    b = seq.base() + SIXTEENTH;
    var t = b, stop = b;
    cols.filter(function (col) { return col.getAttribute('data-dir') === '-1'; }).forEach(function (col) {
      seq.cut(t, col.querySelector('.px-att-lab'));
      stop = grow(col, t + BEAT);
      var bar = col.querySelector('.px-att-bar');
      if (bar.classList.contains('is-retired')) {
        // drawn in full, like any attempt, and then struck from the record
        bar.classList.remove('is-struck');
        stop += BEAT * 2;
        seq.cls(stop, bar, 'is-struck', true);
        seq.cut(stop, col.querySelector('.px-att-ret'));
      }
      t = stop + BEAT * 2;
    });
    seq.end(stop + EPS);

    // step 2: the climb. The last one waits a full beat of nothing.
    b = seq.base() + SIXTEENTH;
    t = b;
    var ups = cols.filter(function (col) { return col.getAttribute('data-dir') === '1'; });
    ups.forEach(function (col, i) {
      var point = col.querySelector('.px-att-bar').classList.contains('is-point');
      seq.cut(t, col.querySelector('.px-att-lab'));
      stop = grow(col, t + (point ? BEAT * 2 : BEAT));
      t = stop + (i % 2 ? BEAT : BEAT + SWING);
    });
    seq.wipe(stop + BEAT * 2, q('.px-att-line'), BEAT);
    seq.end(stop + BEAT * 3);

    // step 3: the experiment log, three lines
    b = seq.base() + SIXTEENTH;
    var lines = qa('.px-rigor > li');
    Array.prototype.forEach.call(lines, function (li, i) {
      seq.wipe(b + i * (BEAT * 2 + (i % 2 ? SWING : 0)), li, BEAT * 0.75);
    });
    seq.end(b + (lines.length - 1) * (BEAT * 2 + SWING) + BEAT);
    c.entrance = true;
  };

  /* ---- said-no ----------------------------------------------------------------- */
  BUILD.no = function (c) {
    var seq = c.seq, qa = c.qa;
    var gates = Array.prototype.slice.call(qa('.px-no-dock .gate'));
    var head = c.q('.px-no-head');
    var landing = null;                            // the running negative hold, if any

    seq.onFreeze = function () {
      if (landing) { landing.cancel(); landing = null; }
      gates.forEach(function (g) { g.classList.add('is-still'); });
    };
    c.cleanup.push(function () { if (landing) { landing.cancel(); landing = null; } });

    gates.forEach(function (g) { setGate(g, [], false); });
    seq.end(0);                                    // step 0: four vacant bays

    gates.forEach(function (gate, i) {
      var last = i === gates.length - 1;
      var b = seq.base() + SIXTEENTH;
      var name = gate.querySelector('.gate-name');
      var why = gate.querySelector('.gate-q');
      seq.cut(b, name);
      // the theme holds the bay vacant for 0.8s, then the shutter drops
      seq.at(b, function () { setGate(gate, ['is-no', 'is-flare'], seq.animated); },
        function () { setGate(gate, [], false); });
      var hit = b + HOLD_BEFORE + D_DROP;
      seq.at(hit, function () {
        if (!seq.animated) { return; }
        if (last && T && T.landNo) {
          // the fourth one is the title of the talk: recoil, then a stop-time hold in negative
          landing = T.landNo(c.slide, { recoil: [head], onDone: function () { landing = null; } });
        } else {
          jolt([head]);
        }
      });
      var after = hit + (last ? HOLD + SIXTEENTH : HOLD_AFTER);
      seq.cut(after, why);
      seq.end(after + EPS);
    });
  };

  /* ---- slotting-cost --------------------------------------------------------- */
  BUILD.cost = function (c) {
    var seq = c.seq, q = c.q, qa = c.qa;
    var SPEED = (TM.barSpeed || 900);              // the deck's one bar speed

    // step 0: the three facts
    var b = seq.base() + SLEEVE;
    Array.prototype.forEach.call(qa('.px-fact3'), function (f, i) {
      var t = b + i * (BEAT + (i % 2 ? SWING : 0));
      var n = f.querySelector('.counter-v b');
      seq.cut(t, f);
      if (n && f.hasAttribute('data-count')) { seq.count(t, n, 0, Number(f.getAttribute('data-count')), { duration: BEAT * 2 }); }
    });
    seq.end(b + BEAT * 5);

    // step 1: the thought experiment, drawn to scale
    b = seq.base() + SIXTEENTH;
    seq.cut(b, q('.px-cb-recap'));
    seq.cut(b, q('.px-cb-note'));
    seq.lift(b + BEAT, q('.px-cb-axis'), BEAT);
    var t = b + BEAT * 2;
    var stop = t;
    Array.prototype.forEach.call(qa('.px-cb-row'), function (row, i) {
      var bar = row.querySelector('.px-cb-bar');
      var full = Number(bar.getAttribute('data-w')) || 0;
      var dur = Math.max(SIXTEENTH / 2, full / SPEED);
      seq.cut(t, row.querySelector('.px-cb-name'));
      seq.cut(t, bar);
      seq.cut(t, row.querySelector('.px-cb-cut'));
      seq.tw(t, dur, 'linear', function (v) { bar.style.width = (full * v).toFixed(1) + 'px'; });
      stop = t + dur;
      seq.cut(stop, row.querySelector('.px-cb-val'));
      seq.cut(stop, row.querySelector('.px-cb-ptr'));
      t = stop + (i % 2 ? BEAT : BEAT + SWING);
    });
    // one full beat of nothing, then the row that is the point
    var bandAt = stop + BEAT * 2;
    seq.drop(bandAt, q('.px-cb-band'), D_DROP);
    seq.wipe(bandAt + D_DROP + BEAT, q('.px-cb-band-val'), BEAT);
    seq.wipe(bandAt + D_DROP + BEAT * 4, q('.px-cb-plot > .deadpan'));
    seq.end(bandAt + D_DROP + BEAT * 4 + D_VOICE);

    // step 2: the line
    b = seq.base() + SIXTEENTH;
    seq.wipe(b, q('.px-cb-line'), BEAT);
    seq.end(b + BEAT);
    c.entrance = true;
  };

  /* ---- slotting-scorecard ------------------------------------------------------ */
  BUILD.scorecard = function (c) {
    var seq = c.seq, q = c.q, qa = c.qa;
    var gCost = q('.px-g-cost'), gRet = q('.px-g-return'), gEff = q('.px-g-effort'), gPot = q('.px-g-potential');
    var all = [gCost, gRet, gEff, gPot].filter(Boolean);
    var costPass = c.opts.costPass !== false;
    var retPass = c.opts.returnPass === true;
    var shutter = gRet && gRet.querySelector('.gate-shutter');

    seq.onFreeze = function () { all.forEach(function (g) { g.classList.add('is-still'); }); };
    all.forEach(function (g) { setGate(g, [], false); });
    seq.end(0);                                    // step 0: four vacant bays, named

    // step 1: COST
    var b = seq.base() + SIXTEENTH;
    seq.cut(b, qa('.px-g-cost .px-find [data-px]'));
    seq.at(b + BEAT * 2, function () { setGate(gCost, [costPass ? 'is-pass' : 'is-no'], seq.animated); },
      function () { setGate(gCost, [], false); });
    seq.end(b + BEAT * 2 + (costPass ? D_LIFT : HOLD_BEFORE + D_DROP + HOLD_AFTER) + EPS);

    // step 2: RETURN, on minutes alone
    b = seq.base() + SIXTEENTH;
    var lines = qa('.px-find-min [data-px]');
    Array.prototype.forEach.call(lines, function (el, i) { seq.cut(b + i * BEAT * 1.5, el); });
    var verdictAt = b + Math.max(0, lines.length - 1) * BEAT * 1.5 + BEAT;
    seq.at(verdictAt, function () { setGate(gRet, [retPass ? 'is-pass' : 'is-no'], seq.animated); },
      function () { setGate(gRet, [], false); });
    var settled = verdictAt + (retPass ? D_LIFT : HOLD_BEFORE + D_DROP + HOLD_AFTER);
    if (!retPass) {
      seq.at(verdictAt + HOLD_BEFORE + D_DROP, function () {
        if (seq.animated) { jolt([q('.px-sc-head'), gCost, gEff, gPot]); }
      });
      // any NO ends it: the two gates after it say NOT YET, with the NO's reason
      seq.cut(settled, qa('.px-notyet'));
    }
    var reslot = q('.px-sc-reslot');
    if (reslot) { seq.wipe(settled + BEAT * 2, reslot, BEAT); settled += BEAT * 3; }
    seq.end(settled + EPS);
    if (!c.opts.filled) { return; }                // nothing supplied: the slide stops at the NO

    // step 3: the bigger return, then effort and potential as the speaker gives them
    b = seq.base() + SIXTEENTH;
    var t = b;
    if (!retPass && shutter) {
      // The NO on minutes stays on the record (the small mark, and the cut in
      // the floor where it hit). The shutter goes back up for a second look.
      var full = 0;
      seq.at(t, function () { full = shutter.offsetHeight; gRet.classList.add('is-still'); });
      seq.tw(t, D_LIFT, E_LIFT, function (v) {
        if (v <= 0 || v >= 1) { shutter.style.height = ''; return; }
        if (!full) { full = shutter.offsetHeight; }
        shutter.style.height = (full * (1 - v)).toFixed(1) + 'px';
      });
      seq.at(t + D_LIFT, function () { setGate(gRet, ['has-tell'], false); },
        function () { setGate(gRet, ['is-no'], false); });
      // the minutes stay printed on the shutter while it goes up, and go with it
      seq.hide(t + D_LIFT, qa('.px-find-min [data-px]'));
      t += D_LIFT;
    }
    seq.cut(t, qa('.px-find-rec2 [data-px="rec"]'));
    var brx = q('.px-brx');
    if (brx) {
      // it comes up from the floor, where the NO went down
      seq.lift(t + BEAT * 3, brx, D_LIFT);
      var fitState = { warned: false };
      c.fit.push(function () { fitBigger(brx, fitState); });
    }
    seq.cut(t + BEAT * 5 + SWING, qa('.px-g-effort .px-find [data-px]'));
    seq.cut(t + BEAT * 7, qa('.px-g-potential .px-find [data-px]'));
    var close = q('.px-sc-close:not(.px-sc-reslot)');
    if (close) {
      // the closing line takes the re-slot line's place
      if (reslot) { seq.hide(t + BEAT * 10, reslot); }
      seq.wipe(t + BEAT * 10, close, BEAT);
    }
    seq.end(t + BEAT * (close ? 11 : 7) + EPS);
  };

  /* ======================================================================
   * The scene
   * ==================================================================== */

  window.Scenes.define('project', function (host, opts, api) {
    var slide = host.closest ? host.closest('.slide') : null;
    var build = BUILD[opts && opts.kind];
    if (!slide || !build) { return {}; }

    var seq = Sequencer();
    var ctx = {
      slide: slide, seq: seq, api: api, opts: opts || {}, cleanup: [], fit: [], entrance: false,
      q: function (sel) { return slide.querySelector(sel); },
      qa: function (sel) { return slide.querySelectorAll(sel); }
    };
    slide.classList.add('px-live');
    build(ctx);

    var first = true;
    return {
      seq: seq,
      step: function (n, dir) {
        // Arriving on the slide at step 0 plays the entrance; a step forward
        // plays that step; anything else (back, reload, jump, print) is a cut.
        var arriving = first && dir === 0 && n === 0 && ctx.entrance && !(api.mode && api.mode.print);
        first = false;
        seq.show(n, dir > 0 || arriving);
        ctx.fit.forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } });
      },
      resize: function () {
        ctx.fit.forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } });
      },
      destroy: function () {
        seq.stop();
        ctx.cleanup.forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } });
        slide.classList.remove('px-live');
      }
    };
  });
}());
