/*
 * deck/scenes/cost.js: the cost gate.
 *
 * Three scenes, one per slide of deck/slides/a2b-cost.js:
 *
 *   'cost-ladder'      slide gate-cost          every priced model as a dot on a log
 *                                               scale of price per task; the spread
 *   'cost-breakeven'   slide cost-people-scale  the seconds one run has to save to pay
 *                                               for itself, with a live hourly rate
 *   'cost'             slide cost-record-scale  bars for the five tiers at a volume you
 *   ('cost-showdown'                            can change, then score against price
 *    is the same scene)                         for every priced model
 *
 * EVERY NUMBER IS COMPUTED. Prices, the spread, the frontier, the step-ups and
 * the break-even seconds come from window.CostMath (which reads window.BENCHLM
 * and window.YOUR). Nothing here types a figure that CostMath can produce.
 *
 * HOW IT IS BUILT
 *   - Each scene is DOM and inline SVG, not canvas: the type is the deck's own
 *     (Archivo on its width axis, Fraunces), crisp at any window size.
 *   - Each scene has ONE function that writes its markup for a given state.
 *     The slide file calls the same function when the deck loads and puts the
 *     result inside the scene's host, as a poster. So the overview and the
 *     presenter view show the real chart, and if a scene ever failed to
 *     start the slide would still show a correct, static picture.
 *   - All motion runs on Motion (tweens and timelines), so ?fast and the
 *     manual clock work. Nothing fades: marks cut in, blocks grow, lines draw
 *     at one constant speed. Every state can be drawn at once, with no motion.
 *   - Controls are real buttons and range inputs, 72px tall, drawn like the
 *     theme's own. They are worked with the pointer; the engine hands the
 *     keyboard back to the deck after every use, so the clicker keeps working.
 *
 * window.CostScenes is the small API the slide file uses:
 *   CostScenes.poster(name)   -> html for a scene host ('ladder' | 'breakeven' | 'showdown')
 *   CostScenes.copy()         -> the computed words the slide chrome needs
 *   CostScenes.facts()        -> everything computed, for tests
 */
(function () {
  'use strict';

  var W = window;
  var D = document;

  /* ======================================================================
   * Small helpers
   * ==================================================================== */

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function px(n) { return (Math.round(n * 10) / 10) + 'px'; }

  /* A range input's track is drawn thick up to its thumb (32px wide); t is 0..1 along the track. */
  function fillStyle(t) {
    var k = isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
    return '--fill: calc(16px + (100% - 32px) * ' + k.toFixed(4) + ')';
  }

  function log10(x) { return Math.log(x) / Math.LN10; }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  /*
   * Money that is never rounded into a different number. CostMath.money()
   * keeps two significant figures under a dollar, so $0.00225 would print as
   * "$0.0023"; wherever a figure is shown as the file's own (a row value, an
   * operand of a division, a hover chip) it must be the exact one.
   */
  function exactMoney(C, x) {
    var text = C.money(x);
    var n = Number(x && x.pricePerRun != null ? x.pricePerRun : x);
    if (!isNum(n) || n <= 0 || n >= 1) { return text; }
    var shown = Number(String(text).replace(/[^0-9.]/g, ''));
    if (Math.abs(shown - n) <= 1e-12 * Math.max(1, n)) { return text; }
    return '$' + C.number(C.tidy(n));
  }

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function theme() { return W.THEME || null; }

  /* The direction's clock, with plain fallbacks if the theme script is absent. */
  function clock() {
    var t = theme();
    var m = (t && t.motion) || {};
    var note = m.note || {};
    var ease = m.ease || {};
    return {
      beat: note.beat || 0.5,
      eighth: note.eighth || 0.25,
      sixteenth: note.sixteenth || 0.125,
      swing: note.swing || (1 / 3),
      speed: m.barSpeed || 900,                                    // px per second, for everything that grows
      arrive: typeof ease.arrive === 'function' ? ease.arrive : 'outExpo',
      swung: typeof m.swung === 'function' ? m.swung : function (i) { return Math.floor(i / 2) * 0.5 + (i % 2 ? 1 / 3 : 0); }
    };
  }

  /*
   * How long an entrance waits, in seconds. The theme's slide transition
   * covers the new slide for about the first half of its run, and nothing
   * should move under it. Zero in ?fast and in print.
   */
  function entranceDelay(api) {
    if (api && api.mode && (api.mode.fast || api.mode.print)) { return 0; }
    var raw = '';
    try { raw = W.getComputedStyle(D.documentElement).getPropertyValue('--deck-slide-duration').trim(); } catch (err) { raw = ''; }
    var n = parseFloat(raw);
    var seconds = isNaN(n) ? 0.5 : (/ms$/.test(raw) ? n / 1000 : n);
    return Math.max(0, Math.min(1, seconds)) * 0.7;
  }

  /* Average letter widths in em, measured once in the deck's fonts: the fallback for estimate() below. */
  var SIGN = { l1: 64, l2: 44, gap: 12, pad: 18 };      // a step-up sign: its two type sizes, the gap between lines, its padding
  var IN_BAR = 76;                                       // a value printed on its own bar: smaller than the 80px row, so no glyph is cut
  var EM = { num: 0.41, display: 0.45, label: 0.86, name: 0.47, body: 0.52, voice: 0.46 };
  var FONT = {
    num: { weight: 900, stretch: 'extra-condensed', family: 'Archivo' },
    display: { weight: 900, stretch: 'extra-condensed', family: 'Archivo', upper: true },
    label: { weight: 700, stretch: 'semi-expanded', family: 'Archivo', upper: true, track: 0.08 },
    name: { weight: 700, stretch: 'semi-condensed', family: 'Archivo' },
    body: { weight: 600, stretch: 'normal', family: 'Archivo' },
    voice: { weight: 600, stretch: 'normal', family: 'Fraunces', italic: true }
  };
  var ruler = null;
  var uid = 0;                                           // unique ids for the SVG masks and markers of each drawing

  /*
   * The width of a piece of text, in px. Used only to decide where things go
   * (which side a label sits on, whether a value fits inside its bar); the
   * type itself is laid out by the browser. Measured on a canvas in the
   * deck's own fonts once they are loaded; before that, and wherever a canvas
   * cannot set a font width, a per-letter estimate measured once by hand.
   */
  function estimate(text, sizePx, kind) {
    var spec = FONT[kind];
    var str = String(text);
    try {
      if (spec && D.fonts && D.fonts.check && D.fonts.check(spec.weight + ' ' + sizePx + 'px "' + spec.family + '"')) {
        if (!ruler) { ruler = D.createElement('canvas').getContext('2d'); }
        if (ruler && 'fontStretch' in ruler) {
          ruler.font = (spec.italic ? 'italic ' : '') + spec.weight + ' ' + sizePx + 'px "' + spec.family + '"';
          ruler.fontStretch = spec.stretch;
          if (spec.upper) { str = str.toUpperCase(); }
          return ruler.measureText(str).width + (spec.track ? spec.track * sizePx * str.length : 0);
        }
      }
    } catch (err) { /* fall through to the estimate */ }
    return str.length * sizePx * (EM[kind] || 0.5);
  }

  /* ======================================================================
   * Facts: everything the three slides say, computed once per call
   * ==================================================================== */

  var DEFAULT_VOLUME = 100000;                           // the brief's "100,000 records"
  var VOLUMES = [1, 1000, 100000, 1000000];              // the presets
  var RATE_RANGE = { min: 20, max: 150, step: 5 };       // dollars an hour, on the slider

  function facts() {
    var C = W.CostMath;
    if (!C) { throw new Error('CostMath is not loaded'); }
    var meta = (W.BENCHLM && W.BENCHLM.meta) || {};
    var tk = C.tokens();
    var priced = C.priced();
    var spread = C.spread();
    var tiers = C.tiers();
    var byId = {};
    tiers.forEach(function (t) { byId[t.id] = t; });
    var onFrontier = {};
    C.frontier().forEach(function (m) { onFrontier[m.name] = true; });

    // The default hourly rate, asked of CostMath itself: a $1 run pays for
    // itself in 3600 / rate seconds. (So the fallback lives in one place.)
    var perDollar = C.breakEvenSeconds(1);
    var rate = isNum(perDollar) && perDollar > 0 ? C.tidy(3600 / perDollar) : null;

    var source = (meta.source || 'BenchLM leaderboard export') + (meta.retrieved ? ', ' + meta.retrieved : '');
    var defaults = C.DEFAULT_TOKENS || {};

    return {
      C: C,
      tokens: tk,
      tokensText: C.number(tk['in']) + ' tokens in, ' + C.number(tk.out) + ' out',
      tokensAreDefault: tk['in'] === defaults['in'] && tk.out === defaults.out,
      priced: priced,
      spread: spread,
      tiers: tiers,
      tier: byId,
      counts: C.counts(),
      summary: C.frontierSummary(),
      onFrontier: onFrontier,
      rate: rate,
      source: source
    };
  }

  /* The models that stand for a tier, cheapest first (plain code has none). */
  function tierModels(f) {
    return f.tiers.filter(function (t) { return t.modelName && !t.missing && isNum(t.pricePerRun) && t.pricePerRun > 0; });
  }

  /* straight quotes to typographer's quotes, for display */
  function curly(text) { return String(text).replace(/"([^"]*)"/g, '“$1”'); }

  /* 'Premium "pro" model' -> 'Premium' */
  function tierWord(t) { return String(t.label || t.id).split(/\s+/)[0]; }

  /* Words the slide chrome needs (headlines stay in the slide file; these are the computed lines). */
  function copy() {
    var f = facts();
    var C = f.C;
    var c = f.counts;
    var dearest = f.spread.dearest;
    var estimatedPriced = f.priced.filter(function (m) { return m.estimated; }).length;
    return {
      volume: DEFAULT_VOLUME,
      volumeText: C.number(DEFAULT_VOLUME),
      frontierSentence: f.summary.sentence,
      ladderAxis: c.priced + ' models · price per task · ' + f.tokensText + ' · log scale',
      ladderSource: 'Source: ' + f.source + ' · ' + c.priced + ' of ' + c.rows + ' models have a usable price · ' +
        c.blank + ' blank and ' + c.zeroListed + ' listed at ' + C.money(0).replace(/^about /, '') + ' are left out',
      breakevenSource: 'Source: ' + f.source + (dearest ? ' · ' + dearest.name + ' at ' + C.money(dearest.pricePerRun) + ' a task' : '') +
        ' · one task = ' + f.tokensText,
      barsSource: 'Source: ' + f.source + ' · one record = one task = ' + f.tokensText,
      scatterSource: 'Source: ' + f.source + ' · the file marks ' + estimatedPriced + ' of these ' + f.summary.priced +
        ' scores estimated · rank order is not certain'
    };
  }

  /* ======================================================================
   * Styles: scoped to .cg-host, tokens only
   * ==================================================================== */

  var CSS = [
    /* a scene host that draws its own poster: no "scene name" box in thumbnails */
    '.slide.is-static [data-scene].cg-host::after { content: none; display: none; }',
    '.cg-host { position: relative; flex: 1 1 0; min-width: 0; min-height: 0; }',
    '.cg-host * { box-sizing: border-box; }',
    '.cg-host b { font-weight: inherit; }',
    '.cg-host :is([data-step], [data-step-only], [data-step-out]) { transition: none; }',
    '.cg-host .cg-a { position: absolute; }',
    '.cg-host .cg-hide { visibility: hidden; }',
    /* the gate strip's pointer reaches y = 128 and these headlines run under it: start their cap line clear of it, at y 160 */
    ':is([data-slide-id="gate-cost"], [data-slide-id="cost-people-scale"], [data-slide-id="cost-record-scale"], [data-thumb-of="gate-cost"], [data-thumb-of="cost-people-scale"], [data-thumb-of="cost-record-scale"]) > .kicker { margin-bottom: 70px; }',
    /* slide-level pieces that swap with the view of the cost scene */
    '.cg-swap:is([data-step], [data-step-out]):not(.is-visible), .cg-swap.cg-off { display: none; }',
    '.cg-wipe { position: absolute; left: var(--spine-w); top: 0; right: 0; bottom: 0; z-index: 6; background: var(--c-ink); pointer-events: none; }',
    /* shared type */
    '.cg-host .cg-num { font-family: var(--f-display); font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); letter-spacing: 0; white-space: nowrap; }',
    '.cg-host .cg-cap { font-family: var(--f-mono); font-size: var(--t-label); font-weight: var(--wght-label); font-stretch: var(--wdth-label-tight); letter-spacing: 0.08em; line-height: 1; text-transform: uppercase; white-space: nowrap; }',
    '.cg-host .cg-say { font-family: var(--f-voice); font-style: italic; font-weight: var(--wght-voice); font-stretch: normal; font-variation-settings: var(--voice-settings); font-optical-sizing: none; font-size: var(--t-voice); line-height: 1; white-space: nowrap; }',
    '.cg-host .cg-name { font-size: 36px; font-weight: 600; line-height: 1; white-space: nowrap; }',
    /* the hover chip: which model is that dot? */
    '.cg-tip { position: absolute; z-index: 5; padding: 12px 18px; background: var(--c-ink); color: var(--c-bg); font-size: 32px; font-weight: 600; line-height: 1.15; white-space: nowrap; pointer-events: none; }',
    '.cg-tip b { font-weight: 800; }',

    /* ---------------- the ladder ---------------- */
    '.cg-ladder .cg-rail { position: absolute; height: var(--w-rule); background: var(--c-line); }',
    '.cg-ladder .cg-dot { position: absolute; border-radius: 50%; background: var(--c-ink); }',
    '.cg-ladder .cg-tick { position: absolute; width: 0; }',
    '.cg-ladder .cg-tick > i { position: absolute; left: -3px; bottom: 100%; width: var(--w-rule); height: 12px; margin-bottom: 0; background: var(--c-line); }',
    '.cg-ladder .cg-tick > b { position: absolute; left: 0; top: 0; translate: -50% 0; }',
    '.cg-host .cg-times { position: absolute; height: 32px; }',
    '.cg-host .cg-times > i { position: absolute; left: 0; right: 0; top: 14px; height: var(--w-hair); background: var(--c-line); }',
    '.cg-host .cg-times > b { position: absolute; left: 50%; top: 0; translate: -50% 0; padding: 0 16px; background: var(--c-bg); }',
    '.cg-ladder .cg-flag { position: absolute; top: 0; width: 0; }',
    '.cg-ladder .cg-pole { position: absolute; left: -3px; top: 0; width: var(--w-rule); background: var(--c-line); }',
    '.cg-ladder .cg-flag-t { position: absolute; top: 0; display: flex; flex-direction: column; }',
    '.cg-ladder .cg-flag.is-right .cg-flag-t { left: 20px; align-items: flex-start; }',
    '.cg-ladder .cg-flag.is-left .cg-flag-t { right: 20px; align-items: flex-end; }',
    '.cg-ladder .cg-flag-t > .cg-num { font-size: 96px; margin-top: 16px; }',
    '.cg-ladder .cg-flag-t > .cg-name { margin-top: 16px; }',
    '.cg-ladder .cg-post { position: absolute; width: var(--w-rule); background: var(--c-line); }',
    '.cg-ladder .cg-spread { position: absolute; bottom: 0; z-index: 1; overflow: hidden; background: var(--c-accent); color: var(--c-accent-ink); }',
    '.cg-ladder .cg-spread-in { position: absolute; left: 0; top: 0; bottom: 0; }',
    '.cg-ladder .cg-sum { position: absolute; left: 34px; top: 18px; font-size: 54px; }',
    '.cg-ladder .cg-x { position: absolute; left: 34px; bottom: 16px; font-size: 190px; font-variant-numeric: tabular-nums; }',
    '.cg-ladder .cg-spread .cg-say { position: absolute; right: 36px; bottom: 30px; }',

    /* ---------------- break-even ---------------- */
    '.cg-be { display: grid; grid-template-columns: minmax(0, 1fr) 600px; column-gap: var(--s-7); align-items: start; }',
    '.cg-be-main { display: flex; flex-direction: column; align-items: flex-start; padding-top: var(--s-3); }',
    '.cg-be .cg-fig { display: flex; align-items: baseline; gap: 22px; font-size: 360px; }',
    '.cg-be .cg-fig > small { font-size: 0.37em; }',
    '.cg-be .cg-be-cap { margin-top: 40px; font-size: var(--t-voice-l); line-height: var(--lh-voice); white-space: normal; }',
    '.cg-be .cg-be-cap b { font-weight: inherit; white-space: nowrap; }',
    '.cg-be .cg-rate { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-top: 44px; }',
    '.cg-be .cg-rate-row { display: flex; align-items: center; gap: var(--s-4); }',
    '.cg-be .cg-rate input[type="range"] { --fill: 50%; appearance: none; -webkit-appearance: none; flex: none; width: 640px; height: 72px; margin: 0; padding: 0; border-radius: 0; cursor: pointer; outline: 0; touch-action: none;' +
      ' background: linear-gradient(var(--c-ink), var(--c-ink)) left center / var(--fill) 18px no-repeat, linear-gradient(var(--c-ink), var(--c-ink)) left center / 100% var(--w-rule) no-repeat; }',
    '.cg-be .cg-rate input[type="range"]::-webkit-slider-runnable-track { height: 72px; background: transparent; }',
    '.cg-be .cg-rate input[type="range"]::-moz-range-track { height: 72px; background: transparent; }',
    '.cg-be .cg-rate input[type="range"]::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 32px; height: 72px; border: 0; border-radius: 0; background: var(--c-ink); box-shadow: 0 0 0 6px var(--c-bg); }',
    '.cg-be .cg-rate input[type="range"]::-moz-range-thumb { width: 32px; height: 72px; border: 0; border-radius: 0; background: var(--c-ink); }',
    '.cg-be .cg-rate output { font-size: 72px; min-width: 2.2em; font-variant-numeric: tabular-nums; }',
    '.cg-be-side { display: flex; flex-direction: column; gap: var(--s-6); padding-top: var(--s-3); }',
    '.cg-be-cell { display: flex; flex-direction: column; align-items: flex-start; padding-top: 22px; border-top: var(--w-rule) solid var(--c-line); }',
    '.cg-be-cell .cg-fig { font-size: 150px; gap: 14px; margin-top: 30px; }',
    '.cg-be-cell .cg-fig > small { font-size: 56px; }',
    '.cg-be-cell .cg-name { margin-top: 26px; }',

    /* ---------------- the showdown: bars ---------------- */
    '.cg-show .cg-view { position: absolute; left: 0; top: 0; right: 0; bottom: 0; }',
    '.cg-show .cg-ctl { position: absolute; left: 40px; top: 0; right: 56px; height: 72px; display: flex; align-items: center; gap: var(--s-4); }',
    '.cg-show .cg-seg { display: flex; flex: none; }',
    '.cg-show .cg-seg > button { appearance: none; -webkit-appearance: none; height: 72px; margin: 0 0 0 -6px; padding: 0 26px; border: var(--w-rule) solid var(--c-ink); border-radius: 0; background: var(--c-bg); color: var(--c-ink);' +
      ' font-family: var(--f-display); font-size: 52px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: 1; cursor: pointer; outline: 0; touch-action: manipulation; }',
    '.cg-show .cg-seg > button:first-child { margin-left: 0; }',
    '.cg-show .cg-seg > button[aria-pressed="true"] { background: var(--c-ink); color: var(--c-bg); }',
    '.cg-show .cg-vol { --fill: 50%; appearance: none; -webkit-appearance: none; flex: none; width: 300px; height: 72px; margin: 0; padding: 0; border-radius: 0; cursor: pointer; outline: 0; touch-action: none;' +
      ' background: linear-gradient(var(--c-ink), var(--c-ink)) left center / var(--fill) 18px no-repeat, linear-gradient(var(--c-ink), var(--c-ink)) left center / 100% var(--w-rule) no-repeat; }',
    '.cg-show .cg-vol::-webkit-slider-runnable-track { height: 72px; background: transparent; }',
    '.cg-show .cg-vol::-moz-range-track { height: 72px; background: transparent; }',
    '.cg-show .cg-vol::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 32px; height: 72px; border: 0; border-radius: 0; background: var(--c-ink); box-shadow: 0 0 0 6px var(--c-bg); }',
    '.cg-show .cg-vol::-moz-range-thumb { width: 32px; height: 72px; border: 0; border-radius: 0; background: var(--c-ink); }',
    '.cg-show .cg-note { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }',
    '.cg-show .cg-axis { position: absolute; width: var(--w-rule); background: var(--c-line); }',
    '.cg-show .cg-row-l { position: absolute; left: 40px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }',
    '.cg-show .cg-row-l > b { font-size: 40px; font-weight: 700; line-height: 1; white-space: nowrap; }',
    '.cg-show .cg-row-l > span { font-size: 32px; font-weight: 500; line-height: 1; white-space: nowrap; color: var(--c-ink-soft); }',
    '.cg-show .cg-bar { position: absolute; background: var(--c-ink); }',
    '.cg-show .cg-val { position: absolute; font-size: 96px; }',
    '.cg-show .cg-val.is-in { color: var(--c-bg); font-size: ' + IN_BAR + 'px; }',
    '.cg-show .cg-long { position: absolute; color: var(--c-bg); }',
    '.cg-show .cg-whole { position: absolute; display: flex; align-items: center; gap: 22px; }',
    '.cg-show .cg-whole.is-none .cg-arrow { display: none; }',
    '.cg-show .cg-arrow { position: relative; width: 120px; height: 8px; background: var(--c-ink); flex: none; }',
    '.cg-show .cg-arrow::before { content: ""; position: absolute; left: -2px; top: 50%; translate: 0 -50%; border: 17px solid transparent; border-left: 0; border-right: 26px solid var(--c-ink); }',
    '.cg-show .cg-brk { position: absolute; border: var(--w-rule) solid var(--c-line); border-left: 0; }',
    '.cg-show .cg-mult { position: absolute; display: flex; flex-direction: column; align-items: flex-end; }',
    '.cg-show .cg-mult > .cg-sum { font-size: 74px; }',
    '.cg-show .cg-mult > .cg-x { font-size: 216px; margin-top: 20px; }',
    '.cg-show .cg-band { position: absolute; left: 0; right: 0; bottom: 0; background: var(--c-accent); color: var(--c-accent-ink); overflow: hidden; }',
    '.cg-show .cg-band-axis { position: absolute; top: 0; bottom: 0; width: var(--w-rule); background: var(--c-accent-ink); }',
    '.cg-show .cg-plain { position: absolute; left: 40px; top: 50%; translate: 0 -50%; font-family: var(--f-display); font-size: 112px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; }',
    '.cg-show .cg-plain > span { display: block; width: max-content; white-space: nowrap; }',
    '.cg-show .cg-plain > span + span { margin-top: 0.12em; }',
    '.cg-show .cg-zero { position: absolute; display: flex; align-items: baseline; gap: 26px; }',
    '.cg-show .cg-zero > .cg-approx { font-size: 180px; }',
    '.cg-show .cg-zero > .cg-num { font-size: 264px; }',
    '.cg-show .cg-nobar { position: absolute; right: 56px; }',

    /* ---------------- the showdown: scatter ---------------- */
    '.cg-show svg.cg-plot { position: absolute; left: 0; top: 0; overflow: visible; }',
    '.cg-show .cg-ax { stroke: var(--c-line); stroke-width: 6; fill: none; stroke-linecap: square; }',
    '.cg-show .cg-front { stroke: var(--c-ink); stroke-width: 6; fill: none; stroke-linejoin: miter; stroke-linecap: butt; }',
    /* a step-up is a comparison, not the frontier: a thinner dashed path that ends in an arrowhead at the dearer dot */
    '.cg-show .cg-arm { stroke: var(--c-ink); stroke-width: 4; stroke-dasharray: 14 10; fill: none; stroke-linejoin: miter; stroke-linecap: butt; }',
    '.cg-show .cg-arrowhead { fill: var(--c-ink); }',
    '.cg-show .cg-ring { fill: var(--c-bg); }',
    '.cg-show .cg-pt { fill: var(--c-ink); }',
    '.cg-show .cg-hole { fill: var(--c-bg); }',
    '.cg-show g.is-beaten .cg-pt { fill: var(--c-muted); }',
    '.cg-show .cg-lab { position: absolute; display: flex; align-items: center; gap: 14px; font-size: 32px; font-weight: 700; font-stretch: 88%; line-height: 1; white-space: nowrap; }',
    '.cg-show .cg-lab.is-col { flex-direction: column; gap: 8px; }',
    '.cg-show .cg-est { display: inline-flex; align-items: center; height: 48px; padding: 0 12px 0 42px; border: 4px solid var(--c-ink); background: repeating-linear-gradient(135deg, var(--c-ink) 0 4px, transparent 4px 11px) left top / 30px 100% no-repeat, var(--c-bg);' +
      ' font-family: var(--f-mono); font-size: var(--t-label); font-weight: var(--wght-label); font-stretch: var(--wdth-label-tight); letter-spacing: 0.08em; line-height: 1; text-transform: uppercase; }',
    '.cg-show .cg-tk { position: absolute; }',
    '.cg-show .cg-sign { position: absolute; display: flex; flex-direction: column; align-items: flex-start; padding: 18px 22px 18px; background: var(--c-ink); color: var(--c-bg); font-family: var(--f-display); font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: var(--lh-cap); text-transform: uppercase; white-space: nowrap; }',
    '.cg-show .cg-sign.is-point { background: var(--c-accent); color: var(--c-accent-ink); }',
    '.cg-show .cg-sign > b { font-size: ' + SIGN.l1 + 'px; font-weight: inherit; }',
    '.cg-show .cg-sign > span { font-size: ' + SIGN.l2 + 'px; margin-top: ' + SIGN.gap + 'px; }',
    '.cg-show .cg-legend { position: absolute; left: 40px; right: 56px; bottom: 0; height: 40px; display: flex; align-items: center; gap: 36px; }',
    '.cg-show .cg-legend > span { display: flex; align-items: center; gap: 14px; }',
    '.cg-show .cg-legend > .cg-xt { margin-left: auto; }',
    '.cg-show .cg-sw { display: block; width: 28px; height: 28px; border-radius: 50%; background: var(--c-ink); flex: none; }',
    '.cg-show .cg-sw.is-beaten { width: 20px; height: 20px; margin: 0 4px; background: var(--c-muted); }',
    '.cg-show .cg-sw.is-est { background: var(--c-bg); border: 7px solid var(--c-ink); }'
  ].join('\n');

  function installStyles() {
    if (D.getElementById('cg-styles')) { return; }
    var style = D.createElement('style');
    style.id = 'cg-styles';
    style.textContent = CSS;
    (D.head || D.documentElement).appendChild(style);
  }
  installStyles();

  /* ======================================================================
   * Scene 1: the price ladder
   * ==================================================================== */

  /* Sizes in the host's own box: 1832 wide (the spine's edge to the stage's edge). Heights hang from the bottom. */
  var LAD = {
    railLeft: 40, railRight: 1776,      // stage x 128 and 1864
    xCheap: 152, xDear: 1696,           // where the cheapest and the dearest dot sit
    band: 214,                          // height of the spread band, at the bottom
    tickBottom: 230,                    // bottom edge of the tick labels
    railBottom: 272,                    // bottom edge of the rail
    r: 14, gap: 4                       // a dot, and the air between two
  };

  /*
   * Stack dots that would overlap: each takes the lowest free place at its
   * own x. Ties in price make a column; near-ties lean on each other.
   * Points must be in the order they should be placed. Sets p.lift (px above the floor).
   */
  function stackDots(points, pitch) {
    var placed = [];
    points.forEach(function (p) {
      var tries = [0];
      placed.forEach(function (q) {
        var dx = Math.abs(p.x - q.x);
        if (dx < pitch) { tries.push(q.lift + Math.sqrt(pitch * pitch - dx * dx)); }
      });
      tries.sort(function (a, b) { return a - b; });
      for (var i = 0; i < tries.length; i++) {
        var lift = tries[i];
        var free = placed.every(function (q) {
          var dx = p.x - q.x;
          var dy = lift - q.lift;
          return dx * dx + dy * dy >= pitch * pitch - 0.01;
        });
        if (free) { p.lift = lift; break; }
      }
      placed.push(p);
    });
    return points;
  }

  function ladderModel(f) {
    var lo = f.spread.cheapestPrice;
    var hi = f.spread.dearestPrice;
    var decades = log10(hi / lo);
    var perDecade = decades > 0 ? (LAD.xDear - LAD.xCheap) / decades : 1;
    function X(price) { return LAD.xCheap + perDecade * log10(price / lo); }

    var reps = {};
    tierModels(f).forEach(function (t) { reps[t.modelName] = t; });

    // cheapest first; in a group at one price the tier's own model goes last, so it ends up on top
    var points = f.priced.map(function (m, i) { return { m: m, i: i, x: X(m.pricePerRun), tier: reps[m.name] || null, lift: 0 }; });
    points.sort(function (a, b) {
      return (a.m.pricePerRun - b.m.pricePerRun) || ((a.tier ? 1 : 0) - (b.tier ? 1 : 0)) || (a.i - b.i);
    });
    stackDots(points, 2 * LAD.r + LAD.gap);

    // decade ticks that fall on the rail
    var ticks = [];
    var eLo = Math.ceil(log10(lo) + (LAD.railLeft - LAD.xCheap) / perDecade - 1e-9);
    var eHi = Math.floor(log10(lo) + (LAD.railRight - LAD.xCheap) / perDecade + 1e-9);
    for (var e = eLo; e <= eHi; e++) {
      var value = Number('1e' + e);
      ticks.push({ value: value, x: X(value) });
    }

    // flags for the tier models: text on the side that has room
    var flags = points.filter(function (p) { return p.tier; }).sort(function (a, b) { return a.x - b.x; });
    var prevEdge = LAD.railLeft;
    flags.forEach(function (p) {
      var wide = Math.max(
        estimate(f.C.money(p.m.pricePerRun), 96, 'num'),
        estimate(p.m.name, 36, 'body'),
        estimate(tierWord(p.tier), 32, 'label')
      ) + 20;
      p.side = (p.x - wide >= prevEdge + 24) ? 'left' : 'right';
      prevEdge = p.side === 'left' ? p.x + 3 : p.x + wide;
    });

    return { lo: lo, hi: hi, perDecade: perDecade, X: X, points: points, ticks: ticks, flags: flags };
  }

  function ladderHTML(f, live) {
    var C = f.C;
    var L = ladderModel(f);
    var floor = LAD.railBottom + 6 + LAD.gap;               // bottom edge of a dot on the rail
    var step1 = live ? '' : ' data-step="1"';
    var h = [];

    h.push('<i class="cg-rail" data-cg="rail" style="left:' + px(LAD.railLeft) + ';width:' + px(LAD.railRight - LAD.railLeft) + ';bottom:' + px(LAD.railBottom) + '"></i>');

    L.ticks.forEach(function (t, i) {
      h.push('<span class="cg-tick" data-cg="tick" style="left:' + px(t.x) + ';top:calc(100% - ' + px(LAD.tickBottom + 32) + ')"><i></i><b class="cg-cap">' + esc(C.money(t.value)) + '</b></span>');
      if (i > 0) {
        var a = L.ticks[i - 1].x + 96;
        var b = t.x - 96;
        if (b - a > 160) {
          h.push('<span class="cg-times" data-cg="tick" style="left:' + px(a) + ';width:' + px(b - a) + ';bottom:' + px(LAD.tickBottom) + '"><i></i><b class="cg-cap">' + esc(C.ratio(t.value / L.ticks[i - 1].value)) + '</b></span>');
        }
      }
    });

    L.points.forEach(function (p) {
      h.push('<i class="cg-dot" data-cg="dot" data-x="' + px(p.x).replace('px', '') + '" data-lift="' + (Math.round(p.lift * 10) / 10) + '" data-name="' + esc(p.m.name) + '" data-price="' + esc(exactMoney(C, p.m.pricePerRun)) + '"' +
        ' style="left:' + px(p.x - LAD.r) + ';bottom:' + px(floor + p.lift) + ';width:' + px(2 * LAD.r) + ';height:' + px(2 * LAD.r) + '"></i>');
    });

    L.flags.forEach(function (p) {
      var poleBottom = floor + p.lift + LAD.r;               // the pole ends in the middle of its dot
      h.push('<div class="cg-flag is-' + p.side + '" data-cg="flag" style="left:' + px(p.x) + ';height:calc(100% - ' + px(poleBottom) + ')">' +
        '<i class="cg-pole" style="height:100%"></i>' +
        '<div class="cg-flag-t"><span class="cg-cap">' + esc(tierWord(p.tier)) + '</span>' +
        '<b class="cg-num">' + esc(C.money(p.m.pricePerRun)) + '</b>' +
        '<span class="cg-name">' + esc(p.m.name) + '</span></div></div>');
    });

    // the spread: a band exactly as long as the distance from the cheapest dot to the dearest
    var left = LAD.xCheap - 3;
    var width = LAD.xDear - LAD.xCheap + 6;
    var postHeight = LAD.railBottom - LAD.band;
    // the bay under the rail: two posts and a floor, put up with the click that lands the spread in it (never a resting empty box)
    h.push('<i class="cg-post"' + step1 + ' data-cg="post-l" style="left:' + px(left) + ';bottom:0;height:' + px(postHeight + LAD.band) + '"></i>');
    h.push('<i class="cg-post"' + step1 + ' data-cg="post-r" style="left:' + px(left + width - 6) + ';bottom:0;height:' + px(postHeight + LAD.band) + '"></i>');
    h.push('<i class="cg-post"' + step1 + ' data-cg="floor" style="left:' + px(left) + ';bottom:0;width:' + px(width) + ';height:6px"></i>');
    h.push('<div class="cg-spread"' + step1 + ' data-cg="spread" data-width="' + width + '" style="left:' + px(left) + ';width:' + px(width) + ';height:' + px(LAD.band) + '">' +
      '<div class="cg-spread-in" style="width:' + px(width) + '">' +
      '<div class="cg-num cg-sum" data-cg="sum">' + esc(C.money(L.hi)) + ' ÷ ' + esc(C.money(L.lo)) + ' =</div>' +
      '<div class="cg-num cg-x" data-cg="x">' + esc(C.ratio(f.spread.ratio)) + '</div>' +
      '<p class="cg-say" data-cg="say">Same task, every dot.</p>' +
      '</div></div>');

    return h.join('');
  }

  /* ======================================================================
   * Scene 2: break-even
   * ==================================================================== */

  function secondsParts(f, what, rate) {
    var C = f.C;
    var s = C.breakEvenSeconds(what, rate);
    var text = C.seconds(s, true);
    var unit = C.seconds(s).slice(text.length).trim() || 'seconds';
    return { value: s, text: text, unit: /^\d|^under|^more|^less|^−/.test(text) ? unit : '' };
  }

  function rateRange(f) {
    var lo = RATE_RANGE.min;
    var hi = RATE_RANGE.max;
    if (isNum(f.rate)) { lo = Math.min(lo, Math.floor(f.rate)); hi = Math.max(hi, Math.ceil(f.rate)); }
    return { min: lo, max: hi, step: RATE_RANGE.step };
  }

  function breakevenHTML(f, live, rate) {
    var C = f.C;
    var r = isNum(rate) ? rate : f.rate;
    var dearest = f.spread.dearest;
    var main = secondsParts(f, dearest, r);
    var range = rateRange(f);
    var step1 = live ? '' : ' data-step="1"';
    var h = [];

    h.push('<div class="cg-be-main">');
    h.push('<p class="cg-num cg-fig"><b data-cg="fig">' + esc(main.text) + '</b><small data-cg="unit">' + esc(main.unit) + '</small></p>');
    h.push('<p class="cg-say cg-be-cap">what the dearest model has to save<br>to pay for itself, at <b data-cg="rate">' + esc(C.money(r)) + '</b> an hour</p>');
    h.push('<div class="cg-rate" data-touch="own"><span class="cg-cap">Example rate · drag from ' + esc(C.money(range.min)) + ' to ' + esc(C.money(range.max)) + ' an hour</span>' +
      '<label class="cg-rate-row"><input type="range" data-cg="range" min="' + range.min + '" max="' + range.max + '" step="1" value="' + esc(r) + '" style="' + fillStyle((r - range.min) / (range.max - range.min)) + '" aria-label="Loaded hourly rate in dollars">' +
      '<output class="cg-num" data-cg="out">' + esc(C.money(r)) + '</output></label></div>');
    h.push('</div>');

    h.push('<div class="cg-be-side">');
    ['frontier', 'small'].forEach(function (id) {
      var t = f.tier[id];
      if (!t || t.missing) { return; }
      var s = secondsParts(f, t, r);
      h.push('<div class="cg-be-cell"' + step1 + ' data-cg="cell" data-tier="' + esc(id) + '">' +
        '<span class="cg-cap">' + esc(t.label) + '</span>' +
        '<p class="cg-num cg-fig"><b data-cg="cell-fig">' + esc(s.text) + '</b><small data-cg="cell-unit">' + esc(s.unit) + '</small></p>' +
        '<span class="cg-name">' + esc(t.modelName) + ' · ' + esc(C.money(t.pricePerRun)) + ' a task</span></div>');
    });
    h.push('</div>');
    return h.join('');
  }

  /* ======================================================================
   * Scene 3: the showdown. View A: bars, drawn to scale
   * ==================================================================== */

  var BAR = {
    axis: 469,            // left edge of the axis rule (stage x 557)
    x0: 475,              // bars start here, at the right edge of the axis rule (stage x 563)
    full: 1357,           // from there to the edge of the stage
    top: 96, rowH: 80, pitch: 90,   // rows start under the 72px control row
    band: 240             // the plain-code band, at the foot
  };
  var WHOLE = 'the whole bar.';
  var NONE = 'not one bar is a pixel long.';

  /* The snap points of the volume slider: 1, 2, 5, 10, 20, 50 ... up to the largest preset. */
  function volumeStops() {
    var max = VOLUMES[VOLUMES.length - 1];
    var out = [];
    for (var unit = 1; unit <= max; unit *= 10) {
      [1, 2, 5].forEach(function (k) { if (k * unit <= max) { out.push(k * unit); } });
    }
    return out;
  }

  function barsModel(f, volume) {
    var C = f.C;
    var models = tierModels(f);
    var dearest = models.length ? models[models.length - 1].pricePerRun : 0;
    var perDollar = dearest > 0 ? BAR.full / C.volumeCost(dearest, DEFAULT_VOLUME) : 0;   // fixed: the dearest bar fills the stage at the default volume
    var rows = models.map(function (t, i) {
      var cost = C.volumeCost(t.pricePerRun, volume);
      var true_ = cost * perDollar;
      var shown = true_ >= 1 ? Math.min(BAR.full, Math.round(true_)) : 0;       // under a pixel there is no bar to draw
      var text = exactMoney(C, cost);
      var wide = estimate(text, 96, 'num');
      var inside = shown + 22 + wide > BAR.full - 56;                            // no room after the bar: print the value on it
      return {
        tier: t, i: i, cost: cost, text: text, truePx: true_, px: shown,
        y: BAR.top + i * BAR.pitch,
        inside: inside,
        over: true_ > BAR.full + 0.5,
        // the one "screens long" line: the longest bar, and only once it is at least a screen long
        long: i === models.length - 1 && true_ >= 1920,
        wide: inside ? estimate(text, IN_BAR, 'num') : wide,
        lead: 0
      };
    });
    // the sliver worth pointing at: the smallest bar that is still a bar
    var sliver = null;
    rows.forEach(function (r) { if (r.px >= 1 && r.px < 12 && (!sliver || r.px < sliver.px)) { sliver = r; } });
    var first = rows[0];
    var last = rows[rows.length - 1];
    // the deadpan line of this view: an arrow at the sliver, or, when no bar reaches a pixel, the plain fact
    var dead = null;
    if (sliver) {
      dead = { mode: 'sliver', row: sliver, text: WHOLE, left: BAR.x0 + sliver.px + 12, top: sliver.y + (BAR.rowH - 54) / 2 };
    } else if (first && rows.every(function (r) { return r.px < 1; })) {
      // in the open stock under the rows, where no bar is, so the multiple keeps its place
      dead = { mode: 'none', row: null, text: NONE, left: BAR.x0 + 36, top: last.y + BAR.rowH + 44 };
    }
    return {
      rows: rows, perDollar: perDollar, sliver: sliver, dead: dead,
      sum: first && last ? exactMoney(C, last.cost) + ' ÷ ' + exactMoney(C, first.cost) + ' =' : '',
      mult: first && last && first.cost > 0 ? C.ratio(last.cost / first.cost) : ''
    };
  }

  /*
   * Where things go for one row at one bar length (also used while a bar is
   * moving). `lead` is room held between the bar and its value: the arrow and
   * "the whole bar." sit there, so the arrow's tip is at the sliver itself.
   */
  function rowLayout(r, lead) {
    var l = lead || 0;
    return {
      valueLeft: r.inside ? null : BAR.x0 + r.px + 22 + l,
      end: r.inside ? BAR.x0 + r.px : BAR.x0 + r.px + 22 + l + r.wide
    };
  }

  /* The room the sliver's deadpan line takes before its value: the gap to the arrow, the arrow, the words, a gap. */
  function wholeLead(dead, sayWidth) {
    if (!dead || dead.mode !== 'sliver') { return 0; }
    return 12 + 120 + 22 + (sayWidth || estimate(WHOLE, 54, 'voice')) + 36 - 22;
  }

  function valueTop(r) { return r.y + (BAR.rowH - (r.inside ? IN_BAR : 96) * 0.708) / 2; }

  /*
   * The bracket that ties the first bar to the last: a tick at the first row,
   * a rule down, and its foot standing on the last bar. If that bar stops
   * short of the bracket there is nothing to stand on, so it ends in a second
   * tick at the last row instead. `right` is the bracket's right edge.
   */
  function bracketBox(first, last, right) {
    var top = first.y + BAR.rowH / 2 - 3;
    var reaches = BAR.x0 + last.px >= right;
    return { top: top, height: (reaches ? last.y : last.y + BAR.rowH / 2 + 3) - top, foot: reaches ? '0' : '6px' };
  }

  function screensText(f, r) { return f.C.number(f.C.sig(r.truePx / 1920, 2)); }

  function barsHTML(f, live, volume, step) {
    var C = f.C;
    var B = barsModel(f, volume);
    var code = f.tier.code;
    var h = [];
    var out2 = live ? '' : ' data-step-out="2"';
    var band12 = live ? '' : ' data-step="1" data-step-out="2"';

    h.push('<div class="cg-view" data-cg="bars"' + out2 + '>');

    // controls: presets, a slider for anything between, and what the bars measure
    h.push('<div class="cg-ctl" data-cg="ctl" data-touch="own"><div class="cg-seg" role="group" aria-label="Number of records">');
    VOLUMES.forEach(function (v) {
      h.push('<button type="button" data-cg="preset" data-v="' + v + '" aria-pressed="' + (v === volume ? 'true' : 'false') + '">' + esc(C.number(v)) + '</button>');
    });
    var stops = volumeStops();
    var at = 0;
    stops.forEach(function (s, i) { if (Math.abs(log10(s) - log10(volume)) < Math.abs(log10(stops[at]) - log10(volume))) { at = i; } });
    h.push('</div><input type="range" class="cg-vol" data-cg="vol" min="0" max="' + (stops.length - 1) + '" step="1" value="' + at + '" style="' + fillStyle(at / Math.max(1, stops.length - 1)) + '" aria-label="Number of records">');
    h.push('<p class="cg-note"><span class="cg-cap">Cost of the whole batch</span><span class="cg-cap">US dollars · drawn to scale</span></p></div>');

    // the axis: one segment beside each row (left out beside a sliver, so the sliver stays an object) and one in each gap
    h.push('<i class="cg-axis" style="left:' + px(BAR.axis) + ';top:' + px(BAR.top - 12) + ';height:12px"></i>');
    B.rows.forEach(function (r, i) {
      var broken = r.px >= 1 && r.px < 12;
      h.push('<i class="cg-axis' + (broken ? ' cg-hide' : '') + '" data-cg="axis-row" style="left:' + px(BAR.axis) + ';top:' + px(r.y) + ';height:' + px(BAR.rowH) + '"></i>');
      if (i < B.rows.length - 1) {
        h.push('<i class="cg-axis" style="left:' + px(BAR.axis) + ';top:' + px(r.y + BAR.rowH) + ';height:' + px(B.rows[i + 1].y - r.y - BAR.rowH) + '"></i>');
      } else {
        // under the last row the axis runs on to the foot: a place is held for one more row
        h.push('<i class="cg-axis" style="left:' + px(BAR.axis) + ';top:' + px(r.y + BAR.rowH) + ';bottom:0"></i>');
      }
    });

    var dead = B.dead;
    var showWhole = !!dead && step < 1;
    var lead = showWhole ? wholeLead(dead) : 0;
    B.rows.forEach(function (r) {
      var lay = rowLayout(r, dead && r === dead.row ? lead : 0);
      h.push('<div class="cg-row-l" style="top:' + px(r.y) + ';height:' + px(BAR.rowH) + '"><b>' + esc(curly(r.tier.label)) + '</b><span>' + esc(r.tier.modelName) + '</span></div>');
      h.push('<i class="cg-bar" data-cg="bar" style="left:' + px(BAR.x0) + ';top:' + px(r.y) + ';height:' + px(BAR.rowH) + ';width:' + px(r.px) + '"></i>');
      h.push('<b class="cg-num cg-val' + (r.inside ? ' is-in' : '') + '" data-cg="val" style="top:' + px(valueTop(r)) + ';' +
        (r.inside ? 'right:56px' : 'left:' + px(lay.valueLeft)) + '">' + esc(r.text) + '</b>');
      h.push('<span class="cg-say cg-long' + (r.long ? '' : ' cg-hide') + '" data-cg="long" style="left:' + px(BAR.x0 + 40) + ';top:' + px(r.y + (BAR.rowH - 54) / 2) + '">' +
        esc(r.long ? 'this bar is ' + screensText(f, r) + ' screens long' : '') + '</span>');
    });

    // the deadpan line of this view: "the whole bar." with its arrow's tip at the sliver, or the plain fact when there is no bar at all
    h.push('<div class="cg-whole' + (dead && dead.mode === 'none' ? ' is-none' : '') + (showWhole ? '' : ' cg-hide') + '" data-cg="whole"' + (live ? '' : ' data-step-out="1"') +
      ' style="left:' + px(dead ? dead.left : 0) + ';top:' + px(dead ? dead.top : 0) + ';height:54px">' +
      '<i class="cg-arrow"></i><span class="cg-say" data-cg="whole-say">' + esc(dead ? dead.text : WHOLE) + '</span></div>');

    // the multiple, tied to the two bars it compares; shown while nothing runs into it
    var multLeft = 1250;
    var clear = B.rows.slice(0, -1).every(function (r) {
      return rowLayout(r, dead && r === dead.row ? lead : 0).end < multLeft - 70;
    });
    var first = B.rows[0];
    var last = B.rows[B.rows.length - 1];
    if (first && last && last !== first) {
      var brk = bracketBox(first, last, multLeft - 34);
      h.push('<i class="cg-brk' + (clear ? '' : ' cg-hide') + '" data-cg="brk" style="left:' + px(multLeft - 80) + ';width:46px;top:' + px(brk.top) + ';height:' + px(brk.height) + ';border-bottom-width:' + brk.foot + '"></i>');
      h.push('<div class="cg-mult' + (clear ? '' : ' cg-hide') + '" data-cg="mult" style="right:56px;top:' + px(first.y + 6) + '">' +
        '<span class="cg-num cg-sum" data-cg="msum">' + esc(B.sum) + '</span><b class="cg-num cg-x" data-cg="mx">' + esc(B.mult) + '</b></div>');
    }

    // plain code: the punchline
    var plain = code ? String(code.label).split('/')[0].trim() : 'Plain code';
    // the brief's punchline is "Plain code ≈ $0": the amount from CostMath, with its "about" set as the sign
    var zero = C.money(code ? code.pricePerRun : 0);                              // "about $0"
    var zeroParts = /^(\D*?)\s*(\$.*)$/.exec(zero) || [zero, '', zero];
    if (/^about$/i.test(zeroParts[1])) { zeroParts[1] = '≈'; }
    h.push('<div class="cg-band' + (live && step < 1 ? ' cg-hide' : '') + '" data-cg="band"' + band12 + ' style="height:' + px(BAR.band) + '">' +
      '<i class="cg-band-axis" style="left:' + px(BAR.axis) + '"></i>' +
      '<div class="cg-plain" data-cg="plain">' + plain.split(/\s+/).map(function (w) { return '<span>' + esc(w) + '</span>'; }).join('') + '</div>' +
      '<div class="cg-zero" data-cg="zero" style="left:' + px(BAR.x0 + 36) + ';bottom:26px">' + (zeroParts[1] ? '<span class="cg-num cg-approx">' + esc(zeroParts[1]) + '</span>' : '') + '<b class="cg-num">' + esc(zeroParts[2]) + '</b></div>' +
      '<p class="cg-say cg-nobar" data-cg="nobar" style="bottom:40px">No bar to draw.</p></div>');

    h.push('</div>');
    return h.join('');
  }

  /* ======================================================================
   * Scene 3, view B: score against price, every priced model
   * ==================================================================== */

  var SC = {
    width: 1832,
    axisX: 148,                 // the score axis (stage x 236)
    right: 1776,                // the right end of the price axis (stage x 1864)
    xCheap: 244, xDear: 1702,
    top: 70,                    // the top of the plot
    foot: 132,                  // room under the price axis: tick labels, then the legend
    r: 13,
    rBeaten: 9,                 // beaten marks are smaller as well as paler: size first, ink second
    arrow: 22,                  // the arrowhead at the end of a step-up
    nominalHeight: 630
  };

  function overlap(a, b, pad) {
    var p = pad || 0;
    return a.x0 < b.x1 + p && b.x0 < a.x1 + p && a.y0 < b.y1 + p && b.y0 < a.y1 + p;
  }

  function scatterModel(f, height) {
    var C = f.C;
    var H = height || SC.nominalHeight;
    var lo = f.spread.cheapestPrice;
    var hi = f.spread.dearestPrice;
    var perDecade = (SC.xDear - SC.xCheap) / log10(hi / lo);
    var scores = f.priced.map(function (m) { return m.overallScore; });
    var sMin = Math.min.apply(null, scores);
    var sMax = Math.max.apply(null, scores);
    var sLo = Math.floor((sMin - 3) / 5) * 5;
    var sHi = Math.ceil(sMax / 10) * 10;
    var y0 = SC.top;
    var y1 = H - SC.foot;
    function X(price) { return SC.xCheap + perDecade * log10(price / lo); }
    function Y(score) { return y1 - (score - sLo) / (sHi - sLo) * (y1 - y0); }

    var pts = f.priced.map(function (m) {
      return { m: m, x: X(m.pricePerRun), y: Y(m.overallScore), front: !!f.onFrontier[m.name], est: !!m.estimated };
    });
    var front = pts.filter(function (p) { return p.front; }).sort(function (a, b) { return a.x - b.x; });

    // the frontier as a staircase: at any budget, the best score that money buys
    var path = '';
    var length = 0;
    var reach = [];                                  // how far along the line each frontier point is
    front.forEach(function (p, i) {
      if (i === 0) { path = 'M' + p.x + ' ' + p.y; reach.push(0); return; }
      var q = front[i - 1];
      path += ' H' + p.x + ' V' + p.y;
      length += Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
      reach.push(length);
    });
    if (front.length) {
      var lastPt = front[front.length - 1];
      path += ' H' + SC.right;
      length += SC.right - lastPt.x;
    }

    // ticks
    var xt = [];
    for (var e = Math.ceil(log10(lo) + (SC.axisX + 40 - SC.xCheap) / perDecade); e <= Math.floor(log10(lo) + (SC.right - SC.xCheap) / perDecade + 1e-9); e++) {
      xt.push({ v: Number('1e' + e), x: X(Number('1e' + e)) });
    }
    var yt = [];
    for (var s = Math.ceil(sLo / 20) * 20; s <= sHi; s += 20) { if (s > sLo) { yt.push({ v: s, y: Y(s) }); } }

    // the two step-ups: small -> mid -> frontier tier, when all three are on the frontier
    function pointOf(tierId) {
      var t = f.tier[tierId];
      if (!t || !t.modelName) { return null; }
      return front.filter(function (p) { return p.m.name === t.modelName; })[0] || null;
    }
    // the lines under a sign's multiple; a gap built on a score the file marks estimated says so on the claim itself
    function gainLines(g, estimated) {
      var shown = Math.abs(g) >= 10 ? C.roundTo(g, 0) : C.roundTo(g, 1);
      if (estimated) { return ['for an estimated', C.number(shown) + ' points']; }
      return ['for ' + (Math.abs(shown - g) > 0.005 ? 'about ' : '') + C.number(shown) + ' points'];
    }
    function signBox(from, to, line1, rest) {
      var w = estimate(line1, SIGN.l1, 'display');
      rest.forEach(function (ln) { w = Math.max(w, estimate(ln, SIGN.l2, 'display')); });
      var hgt = 2 * SIGN.pad + SIGN.l1 * 0.708 + rest.length * (SIGN.gap + SIGN.l2 * 0.708);
      return { x0: from.x - 3, x1: from.x - 3 + w + 2 * 22, y1: to.y - 3, y0: to.y - 3 - hgt, sign: true };
    }
    // a step-up's arm: up from the cheaper dot, then across to the dearer one, stopping where its arrowhead meets that dot
    function armPath(from, to) {
      var endX = to.x - SC.r - 4;
      return { d: 'M' + from.x + ' ' + from.y + ' V' + to.y + ' H' + endX.toFixed(1), length: (from.y - to.y) + (endX - from.x) };
    }
    var a = pointOf('small');
    var b = pointOf('mid');
    var c = pointOf('frontier');
    var ups = [];
    if (a && b && b.x > a.x && b.y < a.y) {
      var s1 = C.stepComparison(a.m, b.m);
      var t1 = C.ratio(s1.priceRatio) + ' the price';
      var u1 = gainLines(s1.scoreGain, s1.estimated);
      var p1 = armPath(a, b);
      ups.push({ from: a, to: b, line1: t1, rest: u1, arm: p1.d, armLength: p1.length, box: signBox(a, b, t1, u1) });
    }
    if (b && c && c.x > b.x && c.y < b.y) {
      var s2 = C.stepComparison(b.m, c.m);
      var t2 = 'another ' + C.ratio(s2.priceRatio);
      var u2 = gainLines(s2.scoreGain, s2.estimated);
      var p2 = armPath(b, c);
      ups.push({ from: b, to: c, line1: t2, rest: u2, arm: p2.d, armLength: p2.length, box: signBox(b, c, t2, u2) });
    }

    // things a label must not sit on
    var blocks = [];
    pts.forEach(function (p) { blocks.push({ x0: p.x - SC.r - 2, x1: p.x + SC.r + 2, y0: p.y - SC.r - 2, y1: p.y + SC.r + 2, of: p }); });
    front.forEach(function (p, i) {
      var q = front[i + 1];
      var endX = q ? q.x : SC.right;
      blocks.push({ x0: p.x, x1: endX, y0: p.y - 5, y1: p.y + 5, line: true });
      if (q) { blocks.push({ x0: q.x - 5, x1: q.x + 5, y0: q.y, y1: p.y, line: true }); }
    });
    ups.forEach(function (u) {
      blocks.push(u.box);
      blocks.push({ x0: u.from.x - 5, x1: u.from.x + 5, y0: u.to.y, y1: u.from.y, line: true });
      blocks.push({ x0: u.from.x, x1: u.to.x, y0: u.to.y - 5, y1: u.to.y + 5, line: true });
    });

    // place the five labels: try a list of places, take the first that touches nothing
    var estWord = (theme() && theme().tags && theme().tags.estimated) || 'estimated';
    var TAG_W = estimate(estWord, 32, 'label') + 42 + 12 + 8 + 6;
    var placed = [];
    front.forEach(function (p) {
      var nameW = estimate(p.m.name, 32, 'name');
      var layouts = p.est
        ? [{ w: Math.max(nameW, TAG_W), h: 88, col: true }, { w: nameW + 14 + TAG_W, h: 48, col: false }]
        : [{ w: nameW, h: 32, col: false }];
      var best = null;
      var spots = [];
      layouts.forEach(function (lay) {
        var up = p.y - SC.r - 10 - lay.h;
        var mid = p.y - lay.h / 2;
        spots.push({ lay: lay, x0: p.x - 6 - lay.w, y0: up, align: 'right' });           // above, to the left, ending over its own dot
        spots.push({ lay: lay, x0: p.x + 6, y0: up, align: 'left' });                    // above, to the right, starting over its own dot
        spots.push({ lay: lay, x0: p.x - 18 - lay.w, y0: up, align: 'right' });
        spots.push({ lay: lay, x0: p.x + 18, y0: up, align: 'left' });
        spots.push({ lay: lay, x0: p.x - 24 - lay.w, y0: mid, align: 'right' });         // level, to the left
        [18, 36, 54, 72].forEach(function (d) { spots.push({ lay: lay, x0: p.x - 18 - lay.w + d, y0: up, align: 'right' }); });
        [24, 48, 72, 96].forEach(function (d) { spots.push({ lay: lay, x0: p.x + 18 + d, y0: up, align: 'left' }); });
        spots.push({ lay: lay, x0: p.x + 24, y0: mid, align: 'left' });                  // level, to the right
        spots.push({ lay: lay, x0: p.x + 18, y0: p.y + SC.r + 10, align: 'left' });      // below, to the right
      });
      for (var i = 0; i < spots.length && !best; i++) {
        var sp = spots[i];
        var box = { x0: sp.x0, x1: sp.x0 + sp.lay.w, y0: sp.y0, y1: sp.y0 + sp.lay.h };
        if (box.x0 < SC.axisX + 14 || box.x1 > SC.right || box.y0 < 0 || box.y1 > y1 - 8) { continue; }
        var hit = blocks.some(function (bl) { return bl.of !== p && overlap(box, bl, bl.line ? 6 : (bl.sign ? 16 : 4)); }) ||
          placed.some(function (pl) { return overlap(box, pl.box, 14); });
        if (!hit) { best = { p: p, box: box, col: sp.lay.col, align: sp.align }; }
      }
      if (!best) {                                    // nothing was free: above and to the left, and accept the touch
        var lay0 = layouts[0];
        best = { p: p, box: { x0: p.x - 18 - lay0.w, x1: p.x - 18, y0: p.y - SC.r - 10 - lay0.h, y1: p.y - SC.r - 10 }, col: lay0.col, align: 'right' };
      }
      placed.push(best);
    });
    // two one-line names side by side on almost the same baseline read as one jogging line: put them on one baseline
    placed.forEach(function (a) {
      placed.forEach(function (b) {
        if (a === b || a.col || b.col) { return; }
        var gapX = Math.max(a.box.x0, b.box.x0) - Math.min(a.box.x1, b.box.x1);
        var dy = a.box.y0 - b.box.y0;
        if (gapX < 120 && dy > 0 && dy < 16) {
          var lifted = { x0: a.box.x0, x1: a.box.x1, y0: b.box.y0, y1: b.box.y0 + (a.box.y1 - a.box.y0) };
          var clash = blocks.some(function (bl) { return bl.of !== a.p && overlap(lifted, bl, bl.line ? 6 : 4); });
          if (!clash) { a.box = lifted; }
        }
      });
    });

    return { H: H, X: X, Y: Y, y0: y0, y1: y1, sLo: sLo, sHi: sHi, pts: pts, front: front, path: path, length: length, reach: reach, xt: xt, yt: yt, ups: ups, labels: placed, perDecade: perDecade };
  }

  function dotSVG(p, beaten) {
    var r = p.front ? SC.r : SC.rBeaten;
    var cls = 'cg-mark' + (p.front ? ' is-front' : '') + (beaten ? ' is-beaten' : '');
    return '<g class="' + cls + '" data-cg="pt" data-x="' + p.x.toFixed(1) + '" data-y="' + p.y.toFixed(1) + '" data-front="' + (p.front ? 1 : 0) + '">' +
      '<circle class="cg-ring" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (r + 3) + '"/>' +
      '<circle class="cg-pt" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '"/>' +
      (p.est ? '<circle class="cg-hole" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (r - (p.front ? 6.5 : 5)) + '"/>' : '') + '</g>';
  }

  function scatterHTML(f, live, height, step) {
    var C = f.C;
    var S = scatterModel(f, height);
    var estWord = (theme() && theme().tags && theme().tags.estimated) || 'estimated';
    var in2 = live ? '' : ' data-step="2"';
    var h = [];

    h.push('<div class="cg-view" data-cg="scatter"' + in2 + '>');
    h.push('<svg class="cg-plot" data-cg="svg" width="' + SC.width + '" height="' + S.H + '" viewBox="0 0 ' + SC.width + ' ' + S.H + '" aria-hidden="true">');
    h.push('<path class="cg-ax" d="M' + SC.axisX + ' ' + S.y0 + ' V' + S.y1 + ' H' + SC.right + '"/>');
    S.xt.forEach(function (t) { h.push('<path class="cg-ax" d="M' + t.x.toFixed(1) + ' ' + S.y1 + ' v14"/>'); });
    S.yt.forEach(function (t) { h.push('<path class="cg-ax" d="M' + SC.axisX + ' ' + t.y.toFixed(1) + ' h-14"/>'); });
    // beaten models first, then the line, then the five on it
    S.pts.filter(function (p) { return !p.front; }).forEach(function (p) { h.push(dotSVG(p, true)); });
    h.push('<path class="cg-front" data-cg="front" data-length="' + S.length.toFixed(1) + '" d="' + S.path + '"/>');
    // each arm is dashed and drawn through a mask, so it can still be drawn at one speed; ids are unique per drawing
    S.ups.forEach(function (u, i) {
      var id = 'cg-arm-' + (++uid);
      h.push('<defs><marker id="' + id + '-h" markerUnits="userSpaceOnUse" markerWidth="' + SC.arrow + '" markerHeight="' + SC.arrow + '" viewBox="0 0 10 10" refX="10" refY="5" orient="auto">' +
        '<path class="cg-arrowhead" d="M0 0 L10 5 L0 10 Z"/></marker>' +
        '<mask id="' + id + '-m" maskUnits="userSpaceOnUse" x="0" y="0" width="' + SC.width + '" height="' + S.H + '">' +
        '<path data-cg="arm-mask" d="' + u.arm + '" stroke="#fff" stroke-width="' + (SC.arrow + 8) + '" fill="none"/></mask></defs>');
      h.push('<path class="cg-arm' + (live && step < 3 + i ? ' cg-hide' : '') + '" data-cg="arm" data-length="' + u.armLength.toFixed(1) + '"' + (live ? '' : ' data-step="' + (3 + i) + '"') +
        ' mask="url(#' + id + '-m)" marker-end="url(#' + id + '-h)" d="' + u.arm + '"/>');
    });
    h.push('</svg>');

    // axis words
    // the score axis does not start at zero: say where it starts, at its foot and in its caption
    h.push('<span class="cg-cap cg-a" style="left:40px;top:0">Overall score · axis starts at ' + esc(C.number(S.sLo)) + '</span>');
    h.push('<span class="cg-cap cg-tk" style="right:' + px(SC.width - SC.axisX + 26) + ';top:' + px(S.y1 - 16) + '">' + esc(C.number(S.sLo)) + '</span>');
    S.yt.forEach(function (t) { h.push('<span class="cg-cap cg-tk" style="right:' + px(SC.width - SC.axisX + 26) + ';top:' + px(t.y - 16) + '">' + esc(C.number(t.v)) + '</span>'); });
    S.xt.forEach(function (t, i) {
      h.push('<span class="cg-cap cg-tk" style="left:' + px(t.x) + ';top:' + px(S.y1 + 26) + ';translate:-50% 0">' + esc(C.money(t.v)) + '</span>');
      if (i > 0) {
        var a = S.xt[i - 1].x + 96;
        var b = t.x - 96;
        h.push('<span class="cg-times" style="left:' + px(a) + ';width:' + px(b - a) + ';top:' + px(S.y1 + 26) + '"><i></i><b class="cg-cap">' + esc(C.ratio(t.v / S.xt[i - 1].v)) + '</b></span>');
      }
    });

    // the five names
    S.labels.forEach(function (l, i) {
      var style = 'top:' + px(l.box.y0) + ';' + (l.align === 'right' ? 'right:' + px(SC.width - l.box.x1) : 'left:' + px(l.box.x0)) + ';' +
        (l.col ? 'align-items:' + (l.align === 'right' ? 'flex-end' : 'flex-start') + ';' : '');
      var tag = l.p.est ? '<span class="cg-est">' + esc(estWord) + '</span>' : '';
      var name = '<span>' + esc(l.p.m.name) + '</span>';
      h.push('<div class="cg-lab' + (l.col ? ' is-col' : '') + '" data-cg="lab" data-reach="' + S.reach[i].toFixed(1) + '" style="' + style + '">' +
        (l.col || l.align === 'right' ? tag + name : name + tag) + '</div>');
    });

    // the two step-ups
    S.ups.forEach(function (u, i) {
      var last = i === S.ups.length - 1;
      var body = ' style="left:' + px(u.box.x0) + ';bottom:' + px(S.H - u.box.y1) + '"><b>' + esc(u.line1) + '</b>' + u.rest.map(function (ln) { return '<span>' + esc(ln) + '</span>'; }).join('') + '</div>';
      if (live) {
        h.push('<div class="cg-sign' + (last || step === 3 + i ? ' is-point' : '') + (step < 3 + i ? ' cg-hide' : '') + '" data-cg="sign"' + body);
      } else if (last) {
        h.push('<div class="cg-sign is-point" data-step="' + (3 + i) + '"' + body);
      } else {
        // the sign of the moment takes Flare; when the next one lands it steps back to ink
        h.push('<div class="cg-sign is-point" data-step-only="' + (3 + i) + '"' + body);
        h.push('<div class="cg-sign" data-step="' + (4 + i) + '"' + body);
      }
    });

    // the five on the line are drawn last, over everything, so a sign can sit behind its dot
    h.push('<svg class="cg-plot" width="' + SC.width + '" height="' + S.H + '" viewBox="0 0 ' + SC.width + ' ' + S.H + '" aria-hidden="true">');
    S.front.forEach(function (p, i) { h.push(dotSVG(p, false).replace('data-cg="pt"', 'data-cg="pt" data-reach="' + S.reach[i].toFixed(1) + '"')); });
    h.push('</svg>');

    // legend and the price axis' own words
    var s = f.summary;
    h.push('<div class="cg-legend"><span class="cg-cap"><i class="cg-sw"></i>' + esc(s.frontier) + ' not beaten</span>' +
      '<span class="cg-cap"><i class="cg-sw is-beaten"></i>' + esc(s.dominated) + ' beaten</span>' +
      '<span class="cg-cap"><i class="cg-sw is-est"></i>' + esc(estWord) + '</span>' +
      '<span class="cg-cap cg-xt">Price of one task · log scale</span></div>');

    h.push('</div>');
    return h.join('');
  }

  /* ======================================================================
   * Posters: what the slide file puts inside each host
   * ==================================================================== */

  function fallback(message) {
    return '<p class="cg-cap" style="padding:40px">' + esc(message) + '</p>';
  }

  function poster(name) {
    try {
      var f = facts();
      if (name === 'ladder') { return ladderHTML(f, false); }
      if (name === 'breakeven') { return breakevenHTML(f, false, f.rate); }
      if (name === 'showdown') { return barsHTML(f, false, DEFAULT_VOLUME, 0) + scatterHTML(f, false, SC.nominalHeight, 4); }
    } catch (err) {
      return fallback('The cost data could not be read: ' + (err && err.message ? err.message : err));
    }
    return '';
  }

  /* ======================================================================
   * The live scenes
   * ==================================================================== */

  function q(root, name) { return root.querySelector('[data-cg="' + name + '"]'); }
  function qa(root, name) { return Array.prototype.slice.call(root.querySelectorAll('[data-cg="' + name + '"]')); }
  function show(el, on) { if (el) { el.classList.toggle('cg-hide', !on); } }

  /* A hover chip that names the nearest dot. Returns a function that removes it. */
  function hoverTips(host, getPoints, describe) {
    var tip = D.createElement('div');
    tip.className = 'cg-tip cg-hide';
    host.appendChild(tip);
    function move(e) {
      var rect = host.getBoundingClientRect();
      if (!rect.width) { return; }
      var k = host.offsetWidth / rect.width;
      var mx = (e.clientX - rect.left) * k;
      var my = (e.clientY - rect.top) * k;
      var best = null;
      var bestD = 44 * 44;
      getPoints().forEach(function (p) {
        var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
        if (d < bestD) { bestD = d; best = p; }
      });
      if (!best) { tip.classList.add('cg-hide'); return; }
      tip.textContent = '';
      describe(best, tip);
      tip.classList.remove('cg-hide');
      var w = tip.offsetWidth;
      var hgt = tip.offsetHeight;
      var x = Math.max(8, Math.min(host.offsetWidth - w - 8, best.x - w / 2));
      var y = best.y - 26 - hgt;
      if (y < 0) { y = best.y + 26; }
      tip.style.left = px(x);
      tip.style.top = px(y);
    }
    function leave() { tip.classList.add('cg-hide'); }
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    return function () {
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      if (tip.parentNode) { tip.parentNode.removeChild(tip); }
    };
  }

  function tipLine(tip, strong, rest) {
    var b = D.createElement('b');
    b.textContent = strong;
    tip.appendChild(b);
    tip.appendChild(D.createTextNode(rest));
  }

  /* Make `el` exactly as wide as `target` by changing its font size (measured once, set once). */
  function matchWidth(el, target, min) {
    if (!el || !target) { return; }
    var w = el.offsetWidth;
    var want = target.offsetWidth;
    var size = parseFloat(W.getComputedStyle(el).fontSize);
    if (!w || !want || !size) { return; }
    el.style.fontSize = px(Math.max(min || 28, size * want / w));
  }

  function whenFonts(fn) {
    var t = theme();
    if (t && typeof t.whenReady === 'function') { t.whenReady(fn); return; }
    if (D.fonts && D.fonts.ready) { D.fonts.ready.then(fn, fn); return; }
    fn();
  }

  /* ---------------------------------------------------------------- ladder */

  function defineLadder(host, opts, api) {
    var M = api.motion || W.Motion;
    var K = clock();
    var f = facts();
    var C = f.C;
    var alive = true;
    var tl = null;

    host.classList.add('cg-host', 'cg-ladder');
    host.innerHTML = ladderHTML(f, true);

    var rail = q(host, 'rail');
    var ticks = qa(host, 'tick');
    var dots = qa(host, 'dot');
    var flags = qa(host, 'flag');
    var band = q(host, 'spread');
    var sum = q(host, 'sum');
    var mult = q(host, 'x');
    var say = q(host, 'say');
    var bay = [q(host, 'post-l'), q(host, 'post-r'), q(host, 'floor')];
    var bandWidth = Number(band.getAttribute('data-width'));
    var finalMult = C.ratio(f.spread.ratio);
    var ratio = f.spread.ratio;

    whenFonts(function () { if (alive) { matchWidth(sum, mult, 40); } });

    var floor = LAD.railBottom + 6 + LAD.gap;
    var removeTips = hoverTips(host, function () {
      var H = host.offsetHeight;
      return dots.map(function (d) {
        return { x: Number(d.getAttribute('data-x')), y: H - floor - Number(d.getAttribute('data-lift')) - LAD.r, el: d };
      });
    }, function (p, tip) { tipLine(tip, p.el.getAttribute('data-name'), ' · ' + p.el.getAttribute('data-price') + ' a task'); });

    function stop() { if (tl) { tl.cancel(); tl = null; } }

    /* The state of a step, drawn at once. */
    function draw(step) {
      rail.style.clipPath = '';
      ticks.forEach(function (t) { show(t, true); });
      dots.forEach(function (d) { show(d, true); });
      flags.forEach(function (fl) { show(fl, true); });
      var on = step >= 1;
      bay.forEach(function (b) { show(b, on); });
      show(band, on); show(sum, on); show(say, on);
      band.style.clipPath = '';
      mult.textContent = finalMult;
    }

    /* Arriving: the rail is ruled, the dots land cheapest first, then the flags on swung beats, then the vacant bay. */
    function intro() {
      tl = M.timeline();
      var t0 = entranceDelay(api);
      var sweepStart = t0 + K.eighth + K.sixteenth;
      var sweep = 1.25;
      tl.add({ from: 100, to: 0, duration: K.eighth, ease: K.arrive, onUpdate: function (v) { rail.style.clipPath = 'inset(0 ' + v.toFixed(2) + '% 0 0)'; } }, t0);
      ticks.forEach(function (t) { show(t, false); });
      tl.at(t0 + K.eighth, function () { ticks.forEach(function (t) { show(t, true); }); }, function () { ticks.forEach(function (t) { show(t, false); }); });
      dots.forEach(function (d) {
        show(d, false);
        var when = sweepStart + sweep * (Number(d.getAttribute('data-x')) - LAD.xCheap) / (LAD.xDear - LAD.xCheap);
        tl.at(when, function () { show(d, true); }, function () { show(d, false); });
      });
      flags.forEach(function (fl, i) {
        show(fl, false);
        tl.at(sweepStart + sweep + K.eighth + K.swung(i), function () { show(fl, true); }, function () { show(fl, false); });
      });
      tl.play();
    }

    /* The spread: the band grows from the cheapest dot to the dearest at one speed, and the multiple it has reached ticks up. */
    function reveal() {
      tl = M.timeline();
      var time = bandWidth / K.speed;
      var ticksN = Math.max(1, Math.round(time / K.sixteenth));
      show(band, true); show(sum, false); show(say, true);
      bay.forEach(function (b) { show(b, true); });
      tl.add({
        from: 0, to: 1, duration: time, ease: 'linear',
        onUpdate: function (p) {
          band.style.clipPath = 'inset(0 ' + ((1 - p) * bandWidth).toFixed(1) + 'px 0 0)';
          var stepped = Math.floor(p * ticksN) / ticksN;
          mult.textContent = p >= 1 ? finalMult : C.ratio(Math.max(1, Math.round(Math.pow(ratio, stepped))));
        }
      }, 0);
      tl.at(time, function () { show(sum, true); band.style.clipPath = ''; mult.textContent = finalMult; },
        function () { show(sum, false); });
      tl.play();
    }

    return {
      step: function (n, dir) {
        stop();
        draw(n);
        if (api.mode && api.mode.print) { return; }
        if (n === 0 && dir === 0) { intro(); }
        if (n === 1 && dir > 0) { reveal(); }
      },
      destroy: function () { alive = false; stop(); removeTips(); }
    };
  }

  /* ------------------------------------------------------------ break-even */

  function defineBreakeven(host, opts, api) {
    var M = api.motion || W.Motion;
    var K = clock();
    var f = facts();
    var C = f.C;
    var range = rateRange(f);
    var rate = isNum(opts.rate) ? opts.rate : f.rate;
    var tl = null;
    var counting = null;

    host.classList.add('cg-host', 'cg-be');
    host.innerHTML = breakevenHTML(f, true, rate);

    var fig = q(host, 'fig');
    var unit = q(host, 'unit');
    var rateOut = q(host, 'rate');
    var out = q(host, 'out');
    var input = q(host, 'range');
    var cells = qa(host, 'cell');
    var dearest = f.spread.dearest;

    function fill() {
      var t = theme();
      if (t && typeof t.fillRange === 'function') { t.fillRange(input); return; }
      var k = (Number(input.value) - range.min) / (range.max - range.min);
      input.style.setProperty('--fill', 'calc(16px + (100% - 32px) * ' + k.toFixed(4) + ')');
    }

    /* Every figure on the slide, for the rate now on the slider. */
    function render() {
      var main = secondsParts(f, dearest, rate);
      fig.textContent = main.text;
      unit.textContent = main.unit;
      rateOut.textContent = C.money(rate);
      out.textContent = C.money(rate);
      cells.forEach(function (cell) {
        var s = secondsParts(f, f.tier[cell.getAttribute('data-tier')], rate);
        q(cell, 'cell-fig').textContent = s.text;
        q(cell, 'cell-unit').textContent = s.unit;
      });
    }

    function stop() {
      if (tl) { tl.cancel(); tl = null; }
      if (counting) { counting.cancel(); counting = null; }
    }

    function onInput() {
      // only the count-up gives way to the hand; the cells' reveal is left to finish, or they would stay hidden
      if (counting) { counting.cancel(); counting = null; }
      var raw = Number(input.value);
      // snap to the slider's step, but let the two ends and the deck's own rate through
      var snapped = Math.round(raw / range.step) * range.step;
      if (isNum(f.rate) && Math.abs(raw - f.rate) <= range.step / 2) { snapped = f.rate; }
      rate = Math.max(range.min, Math.min(range.max, snapped));
      if (Number(input.value) !== rate) { input.value = rate; }
      fill();
      render();
    }
    input.addEventListener('input', onInput);
    input.addEventListener('change', onInput);

    function draw(step) {
      render();
      fill();
      cells.forEach(function (cell) { show(cell, step >= 1); });
    }

    /* Arriving: the figure ticks up in twelve steps and lands on the beat. */
    function intro() {
      var main = secondsParts(f, dearest, rate);
      if (!isNum(main.value) || main.value < 2) { return; }
      var ease = (theme() && theme().motion && theme().motion.ease && theme().motion.ease.tick) || M.ease.steps(12);
      var arrive = typeof K.arrive === 'function' ? K.arrive : M.ease.outExpo;
      fig.textContent = C.seconds(0, true);
      counting = M.tween({
        from: 0, to: main.value, delay: entranceDelay(api), duration: 1.5, ease: function (p) { return arrive(ease(p)); },
        onUpdate: function (v, p) { fig.textContent = p >= 1 ? main.text : C.seconds(Math.round(v), true); },
        onDone: function () { fig.textContent = main.text; counting = null; }
      });
    }

    /* The other two tiers cut in, long-short. */
    function reveal() {
      tl = M.timeline();
      cells.forEach(function (cell, i) {
        show(cell, false);
        tl.at(K.swung(i), function () { show(cell, true); }, function () { show(cell, false); });
      });
      tl.play();
    }

    return {
      step: function (n, dir) {
        stop();
        draw(n);
        if (api.mode && api.mode.print) { return; }
        if (n === 0 && dir === 0) { intro(); }
        if (n === 1 && dir > 0) { reveal(); }
      },
      destroy: function () {
        stop();
        input.removeEventListener('input', onInput);
        input.removeEventListener('change', onInput);
      },
      /* for tests: the rate in use */
      rate: function () { return rate; }
    };
  }

  /* -------------------------------------------------------------- showdown */

  function defineShowdown(host, opts, api) {
    var M = api.motion || W.Motion;
    var K = clock();
    var f = facts();
    var C = f.C;
    var slide = host.closest ? host.closest('.slide') : null;
    var stops = volumeStops();
    var volume = isNum(opts.volume) && opts.volume >= 1 ? opts.volume : DEFAULT_VOLUME;
    var step = 0;
    var view = '';
    var alive = true;
    var running = [];              // the step's own animations
    var chase = [];                // bars on their way to a new length
    var wipe = null;
    var removeTips = null;
    var els = {};

    host.classList.add('cg-host', 'cg-show');
    var built = false;
    whenFonts(function () {
      // fonts that land after the first draw change the headline's height and every measured width
      if (!alive || !built || chase.length || running.some(function (t) { return t.playing; })) { return; }
      view = '';
      drawStep();
    });

    /* Slide-level pieces (two headlines, two source lines) swap with the view. Take them over from the engine. */
    var swaps = slide ? Array.prototype.slice.call(slide.querySelectorAll('.cg-swap')) : [];
    swaps.forEach(function (el) {
      el.removeAttribute('data-step');
      el.removeAttribute('data-step-out');
      el.classList.remove('is-visible', 'is-current-step');
    });
    function swapTo(name) {
      swaps.forEach(function (el) { el.classList.toggle('cg-off', el.getAttribute('data-cg-view') !== name); });
    }

    function play(t) { running = running.filter(function (r) { return r.playing; }); running.push(t); t.play(); return t; }
    function stopStep() { running.forEach(function (t) { t.cancel(); }); running = []; }
    function stopChase() { chase.forEach(function (t) { t.cancel(); }); chase = []; }
    function stopAll() { stopStep(); stopChase(); }

    function headline() {
      if (!slide) { return; }
      var n = slide.querySelector('[data-cg="n"]');
      var u = slide.querySelector('[data-cg="unit"]');
      if (n) { n.textContent = C.number(volume); }
      if (u) { u.textContent = volume === 1 ? 'record' : 'records'; }
    }

    /* ---------------- bars ---------------- */

    function collectBars() {
      els = {
        bars: qa(host, 'bar'), vals: qa(host, 'val'), longs: qa(host, 'long'), axis: qa(host, 'axis-row'),
        whole: q(host, 'whole'), wholeSay: q(host, 'whole-say'), brk: q(host, 'brk'), mult: q(host, 'mult'), msum: q(host, 'msum'), mx: q(host, 'mx'),
        band: q(host, 'band'), plain: q(host, 'plain'), zero: q(host, 'zero'), nobar: q(host, 'nobar'),
        presets: qa(host, 'preset'), vol: q(host, 'vol')
      };
    }

    function fillVol() {
      var t = theme();
      if (!els.vol) { return; }
      if (t && typeof t.fillRange === 'function') { t.fillRange(els.vol); return; }
      var k = Number(els.vol.value) / Math.max(1, stops.length - 1);
      els.vol.style.setProperty('--fill', 'calc(16px + (100% - 32px) * ' + k.toFixed(4) + ')');
    }

    function mountBars() {
      if (removeTips) { removeTips(); removeTips = null; }
      host.innerHTML = barsHTML(f, true, volume, step);
      view = 'bars';
      collectBars();
      fillVol();
      els.presets.forEach(function (b) { b.addEventListener('click', onPreset); });
      els.vol.addEventListener('input', onSlide);
      whenFonts(function () {
        if (!alive || view !== 'bars') { return; }
        fitPlain();
        matchWidth(els.msum, els.mx, 40);
      });
      fitPlain();
    }

    /* PLAIN / CODE: two lines justified to one measure on the width axis, where the theme can do it. */
    function fitPlain() {
      var t = theme();
      if (!els.plain || !t || typeof t.fitStack !== 'function') { return; }
      try {
        each(els.plain.children, function (ln) { ln.classList.add('ln'); });
        t.fitStack(els.plain, { measure: 250 });
      } catch (err) { /* the plain setting stands */ }
    }

    /* Put every label of the bars view where the current volume says. `moving` holds rows whose bar is still travelling. */
    function placeBars(B, moving) {
      var anyMoving = !!moving && moving.some(Boolean);
      var dead = B.dead;
      var showWhole = !!dead && step < 1 && !anyMoving;
      var sayW = 0;
      if (dead) {
        els.whole.classList.toggle('is-none', dead.mode === 'none');
        els.wholeSay.textContent = dead.text;
        sayW = els.wholeSay.offsetWidth || estimate(dead.text, 54, 'voice');
      }
      var lead = showWhole ? wholeLead(dead, sayW) : 0;
      B.rows.forEach(function (r, i) {
        var lay = rowLayout(r, dead && r === dead.row ? lead : 0);
        var val = els.vals[i];
        val.textContent = r.text;
        val.classList.toggle('is-in', r.inside);
        val.style.left = r.inside ? '' : px(lay.valueLeft);
        val.style.right = r.inside ? '56px' : '';
        val.style.top = px(valueTop(r));
        show(val, !(moving && moving[i]));
        var long = els.longs[i];
        long.textContent = r.long ? 'this bar is ' + screensText(f, r) + ' screens long' : '';
        show(long, r.long && !(moving && moving[i]));
        show(els.axis[i], !(r.px >= 1 && r.px < 12));
      });
      if (dead) {
        els.whole.style.left = px(dead.left);
        els.whole.style.top = px(dead.top);
      }
      show(els.whole, showWhole);
      if (els.mult) {
        els.msum.textContent = B.sum;
        els.mx.textContent = B.mult;
        matchWidth(els.msum, els.mx, 40);
        // the sum is set to the width of the multiple, so the multiple alone says how wide the pair is
        var edge = host.offsetWidth - 56 - (els.mx.offsetWidth || 400) - 100;
        var clear = !anyMoving && B.rows.slice(0, -1).every(function (r) {
          return rowLayout(r, dead && r === dead.row ? lead : 0).end < edge;
        });
        var brk = bracketBox(B.rows[0], B.rows[B.rows.length - 1], edge + 66);
        els.brk.style.left = px(edge + 20);
        els.brk.style.top = px(brk.top);
        els.brk.style.height = px(brk.height);
        els.brk.style.borderBottomWidth = brk.foot;
        show(els.mult, clear);
        show(els.brk, clear);
      }
      els.presets.forEach(function (b) { b.setAttribute('aria-pressed', Number(b.getAttribute('data-v')) === volume ? 'true' : 'false'); });
    }

    /* The bars view at the current volume, drawn at once. */
    function drawBars() {
      var B = barsModel(f, volume);
      B.rows.forEach(function (r, i) { els.bars[i].style.width = px(r.px); });
      placeBars(B, null);
      headline();
      show(els.band, step >= 1);
      show(els.plain, step >= 1); show(els.zero, step >= 1); show(els.nobar, step >= 1);
      if (els.band) { els.band.style.clipPath = ''; }
    }

    /* A preset: every bar travels to its new length at one speed, and its value cuts in when it stops. */
    function runTo(target) {
      // only the bars give way: the step's own reveal (the plain-code band landing) is left to finish
      stopChase();
      volume = target;
      var B = barsModel(f, volume);
      headline();
      var nearest = 0;
      stops.forEach(function (sv, i) { if (Math.abs(log10(sv) - log10(volume)) < Math.abs(log10(stops[nearest]) - log10(volume))) { nearest = i; } });
      els.vol.value = nearest;
      fillVol();
      // where each bar is now, even if it was still travelling (or had not started its entrance)
      var now = els.bars.map(function (b) { var w = parseFloat(b.style.width); return isNum(w) ? w : 0; });
      var moving = B.rows.map(function (r, i) { return Math.abs(r.px - now[i]) >= 1; });
      placeBars(B, moving);
      B.rows.forEach(function (r, i) {
        if (!moving[i]) { els.bars[i].style.width = px(r.px); return; }
        var from = now[i];
        var t = M.tween({
          from: from, to: r.px, duration: Math.abs(r.px - from) / K.speed, ease: 'linear',
          onUpdate: function (v) { els.bars[i].style.width = px(Math.round(v)); },
          onDone: function () {
            moving[i] = false;
            chase = chase.filter(function (c) { return c !== t; });
            placeBars(B, moving);
          }
        });
        chase.push(t);
      });
    }

    function onPreset(e) {
      var v = Number(e.currentTarget.getAttribute('data-v'));
      if (!isNum(v) || v === volume) { return; }
      if (api.mode && api.mode.print) { volume = v; drawBars(); return; }
      runTo(v);
    }

    /* The slider: direct. The bars follow the hand, no travel. */
    function onSlide() {
      stopAll();
      var v = stops[Math.max(0, Math.min(stops.length - 1, Math.round(Number(els.vol.value))))];
      volume = v;
      fillVol();
      drawBars();
    }

    /* Step 1: the Flare row waits a beat, then arrives: the band runs in from the spine, then the words cut in. */
    function landBand() {
      var tl = M.timeline();
      var width = host.offsetWidth;
      var grow = width / (K.speed * 4);
      show(els.band, false); show(els.plain, false); show(els.zero, false); show(els.nobar, false);
      show(els.whole, false);
      tl.at(K.beat, function () { show(els.band, true); }, function () { show(els.band, false); });
      tl.add({ from: width, to: 0, duration: grow, ease: K.arrive, onUpdate: function (v) { els.band.style.clipPath = 'inset(0 ' + v.toFixed(1) + 'px 0 0)'; } }, K.beat);
      tl.at(K.beat + grow, function () { show(els.plain, true); els.band.style.clipPath = ''; }, function () { show(els.plain, false); });
      tl.at(K.beat + grow + K.beat, function () { show(els.zero, true); }, function () { show(els.zero, false); });
      tl.at(K.beat + grow + K.beat + K.swing, function () { show(els.nobar, true); }, function () { show(els.nobar, false); });
      play(tl);
    }

    /* Arriving on the slide: bars grow from the axis in rank order on swung beats, each value cutting in when its bar stops. */
    function introBars() {
      var B = barsModel(f, volume);
      var moving = B.rows.map(function (r) { return r.px >= 1; });
      B.rows.forEach(function (r, i) { if (moving[i]) { els.bars[i].style.width = '0px'; } });
      placeBars(B, moving);
      B.rows.forEach(function (r, i) {
        if (!moving[i]) { return; }
        var t = M.tween({
          from: 0, to: r.px, delay: entranceDelay(api) + K.eighth + K.swung(i), duration: r.px / K.speed, ease: 'linear',
          onUpdate: function (v) { els.bars[i].style.width = px(Math.round(v)); },
          onDone: function () {
            moving[i] = false;
            chase = chase.filter(function (c) { return c !== t; });
            placeBars(B, moving);
          }
        });
        chase.push(t);
      });
    }

    /* ---------------- scatter ---------------- */

    function mountScatter() {
      if (removeTips) { removeTips(); removeTips = null; }
      host.innerHTML = scatterHTML(f, true, host.offsetHeight || SC.nominalHeight, step);
      view = 'scatter';
      var marks = qa(host, 'pt');
      els = { marks: marks, front: q(host, 'front'), arms: qa(host, 'arm'), armMasks: qa(host, 'arm-mask'), labs: qa(host, 'lab'), signs: qa(host, 'sign') };
      var S = scatterModel(f, host.offsetHeight || SC.nominalHeight);
      removeTips = hoverTips(host, function () {
        return S.pts.map(function (p) { return { x: p.x, y: p.y, p: p }; });
      }, function (pt, tip) {
        tipLine(tip, pt.p.m.name, ' · ' + exactMoney(C, pt.p.m.pricePerRun) + ' a task · score ' + C.number(C.roundTo(pt.p.m.overallScore, 1)) + (pt.p.est ? ' (estimated)' : ''));
      });
    }

    function drawScatter() {
      els.marks.forEach(function (g) { show(g, true); if (g.getAttribute('data-front') !== '1') { g.classList.add('is-beaten'); } });
      els.front.style.strokeDasharray = '';
      els.front.style.strokeDashoffset = '';
      show(els.front, true);
      els.labs.forEach(function (l) { show(l, true); });
      els.arms.forEach(function (a, i) { show(a, step >= 3 + i); });
      els.armMasks.forEach(function (m) { m.style.strokeDasharray = ''; m.style.strokeDashoffset = ''; });
      els.signs.forEach(function (s, i) {
        show(s, step >= 3 + i);
        s.classList.toggle('is-point', step === 3 + i || (step > 3 + i && i === els.signs.length - 1));
      });
    }

    /*
     * The scatter arrives: all 41 dots land in price order, in full ink. Then
     * the frontier is drawn left to right at one speed; every dot it passes
     * over that it beats drops to the muted ink, and the five on the line get
     * their names as the line reaches them.
     */
    function introScatter(delay) {
      var t0 = delay || 0;
      var sweep = 0.75;
      var x0 = SC.xCheap;
      var span = SC.xDear - SC.xCheap;
      var total = Number(els.front.getAttribute('data-length'));
      var drawTime = total / K.speed;
      var lineAt = t0 + sweep + K.beat;
      var S = scatterModel(f, host.offsetHeight || SC.nominalHeight);
      var endX = SC.right;

      // where the pen is (its x) after `d` px of line
      var legs = [];
      S.front.forEach(function (p, i) {
        var nx = S.front[i + 1];
        if (nx) { legs.push({ len: nx.x - p.x, x0: p.x, x1: nx.x }); legs.push({ len: p.y - nx.y, x0: nx.x, x1: nx.x }); }
        else { legs.push({ len: endX - p.x, x0: p.x, x1: endX }); }
      });
      function penX(d) {
        for (var i = 0; i < legs.length; i++) {
          if (d <= legs[i].len) { return legs[i].x0 + (legs[i].x1 - legs[i].x0) * (legs[i].len ? d / legs[i].len : 1); }
          d -= legs[i].len;
        }
        return endX;
      }

      var tl = M.timeline();
      els.marks.forEach(function (g) {
        show(g, false);
        g.classList.remove('is-beaten');
        var when = t0 + sweep * (Number(g.getAttribute('data-x')) - x0) / span;
        tl.at(when, function () { show(g, true); }, function () { show(g, false); });
      });
      els.labs.forEach(function (l) { show(l, false); });
      show(els.front, false);
      els.front.style.strokeDasharray = total + ' ' + total;
      tl.at(lineAt, function () { show(els.front, true); }, function () { show(els.front, false); });
      tl.add({
        from: 0, to: total, duration: drawTime, ease: 'linear',
        onUpdate: function (d) {
          els.front.style.strokeDashoffset = (total - d).toFixed(1);
          var x = penX(d);
          els.marks.forEach(function (g) {
            if (g.getAttribute('data-front') === '1') { return; }
            g.classList.toggle('is-beaten', d > 0 && Number(g.getAttribute('data-x')) <= x + 0.5);
          });
          els.labs.forEach(function (l) { show(l, d > 0 && d >= Number(l.getAttribute('data-reach')) - 0.5); });
        }
      }, lineAt);
      tl.at(lineAt + drawTime, function () { drawScatter(); }, null);
      play(tl);
    }

    /* A step-up: its arm is drawn at the same speed, and its sign cuts in when the arm lands. */
    function landSign(i) {
      var arm = els.arms[i];
      var mask = els.armMasks[i];
      var sign = els.signs[i];
      if (!arm || !sign || !mask) { return; }
      var len = Number(arm.getAttribute('data-length'));
      var full = len + SC.arrow;                 // the mask runs on past the end, so the arrowhead is uncovered last
      var time = len / K.speed;
      var tl = M.timeline();
      show(arm, true); show(sign, false);
      mask.style.strokeDasharray = full + ' ' + full;
      mask.style.strokeDashoffset = String(full);
      tl.add({ from: full, to: 0, duration: time, ease: 'linear', onUpdate: function (v) { mask.style.strokeDashoffset = v.toFixed(1); } }, 0);
      tl.at(time, function () { show(sign, true); mask.style.strokeDasharray = ''; mask.style.strokeDashoffset = ''; }, function () { show(sign, false); });
      play(tl);
    }

    /* ---------------- the two views ---------------- */

    function wantView(n) { return n >= 2 ? 'scatter' : 'bars'; }

    function setView(name) {
      swapTo(name);
      if (name === 'bars') { mountBars(); drawBars(); }
      else { mountScatter(); drawScatter(); }
    }

    /* Change view behind a block: it runs across from the spine, the view changes under it, and its left edge retreats. */
    function wipeTo(name, onCovered) {
      if (!slide) { setView(name); if (onCovered) { onCovered(); } return; }
      dropWipe();
      wipe = D.createElement('div');
      wipe.className = 'cg-wipe';
      wipe.style.clipPath = 'inset(0 100% 0 0)';
      slide.appendChild(wipe);
      var cover = K.eighth;
      var hold = K.sixteenth;
      var away = K.eighth + K.sixteenth;
      var tl = M.timeline();
      tl.add({ from: 100, to: 0, duration: cover, ease: 'inQuad', onUpdate: function (v) { if (wipe) { wipe.style.clipPath = 'inset(0 ' + v.toFixed(2) + '% 0 0)'; } } }, 0);
      tl.at(cover, function () { setView(name); if (onCovered) { onCovered(); } }, null);
      tl.add({ from: 0, to: 100, duration: away, ease: K.arrive, onUpdate: function (v, p) { if (wipe && p > 0) { wipe.style.clipPath = 'inset(0 0 0 ' + v.toFixed(2) + '%)'; } } }, cover + hold);
      tl.at(cover + hold + away, function () { dropWipe(); }, null);
      play(tl);
    }

    function dropWipe() {
      if (wipe && wipe.parentNode) { wipe.parentNode.removeChild(wipe); }
      wipe = null;
    }

    function drawStep() {
      var name = wantView(step);
      if (view !== name) { setView(name); }
      else if (name === 'bars') { drawBars(); }
      else { drawScatter(); }
    }

    return {
      step: function (n, dir) {
        var from = step;
        built = true;
        stopAll();
        dropWipe();
        step = n;
        var print = api.mode && api.mode.print;

        // going forward into the scatter: behind the block, and the dots start landing as the block leaves
        if (!print && dir > 0 && from === 1 && n === 2 && view === 'bars') {
          wipeTo('scatter', function () { introScatter(K.sixteenth + K.eighth); });
          return;
        }
        // going back out of the scatter: also behind the block, but nothing replays
        if (!print && dir < 0 && from === 2 && n === 1 && view === 'scatter') {
          wipeTo('bars', null);
          return;
        }

        drawStep();
        if (print) { return; }
        if (n === 0 && dir === 0) { introBars(); }
        if (n === 1 && dir > 0) { landBand(); }
        if (n === 3 && dir > 0) { landSign(0); }
        if (n === 4 && dir > 0) { landSign(1); }
      },
      destroy: function () {
        alive = false;
        stopAll();
        dropWipe();
        if (removeTips) { removeTips(); removeTips = null; }
      },
      /* for tests */
      volume: function () { return volume; },
      setVolume: function (v) { if (view === 'bars' && isNum(v) && v >= 1) { stopAll(); volume = v; drawBars(); } }
    };
  }

  /* ======================================================================
   * Registration
   * ==================================================================== */

  /* A scene that cannot read its data draws the reason instead of throwing. */
  function guarded(factory, name) {
    return function (host, opts, api) {
      try { return factory(host, opts || {}, api || {}); }
      catch (err) {
        host.classList.add('cg-host');
        host.innerHTML = fallback('Scene "' + name + '" could not start: ' + (err && err.message ? err.message : err));
        throw err;
      }
    };
  }

  if (W.Scenes && typeof W.Scenes.define === 'function') {
    W.Scenes.define('cost-ladder', guarded(defineLadder, 'cost-ladder'));
    W.Scenes.define('cost-breakeven', guarded(defineBreakeven, 'cost-breakeven'));
    W.Scenes.define('cost', guarded(defineShowdown, 'cost'));
    W.Scenes.define('cost-showdown', guarded(defineShowdown, 'cost-showdown'));
  }

  W.CostScenes = {
    poster: poster,
    copy: copy,
    facts: facts,
    volumes: VOLUMES.slice(),
    defaultVolume: DEFAULT_VOLUME,
    // exposed for tests
    _models: { ladder: ladderModel, bars: barsModel, scatter: scatterModel }
  };
}());
