/*
 * theme.js: the SLEEVE theme in JavaScript  ->  window.THEME
 *
 * Classic script, no dependencies (it uses lib/motion.js and engine/deck.js
 * when they are on the page, and works without them). Everything it knows
 * about colour, type and time is read from theme/tokens.css, so a change
 * there restyles canvas scenes too.
 *
 * WHAT IS IN HERE
 *
 *   THEME.name                       'sleeve'
 *   THEME.ready                      Promise: both fonts are loaded. Draw text after it.
 *   THEME.whenReady(fn)              same, as a callback (runs at once if already loaded)
 *
 *   THEME.color(name)                a token's computed value, cached
 *   THEME.refresh()                  forget the cache (after changing tokens at run time)
 *   THEME.inks(ground)               { ground, ink, accent, accentInk, muted } for 'card' or 'ink'
 *   THEME.heat(v, ground)            0..1 -> a colour on the heat ramp ('ink' mirrors it for a Lampblack field)
 *   THEME.heatRadius(v, min, max)    0..1 -> a dot radius (size first, ink second)
 *   THEME.data(i)                    1..5 -> a categorical series colour
 *
 *   THEME.font(kind, sizePx)         a canvas font string
 *   THEME.setFont(ctx, kind, sizePx) the same, applied to a context with width and tracking
 *
 *   THEME.motion                     { fast, base, slow } in seconds, note values, easings
 *
 *   THEME.fitStack(el, options)      justify a stack of display lines on the width axis
 *   THEME.fitAll(root)               fit every [data-fit] under root (done for you, see below)
 *   THEME.fillRange(input)           redraw the "on" part of a .slider track (done for you on input)
 *
 *   THEME.draw.*                     the canvas drawing kit: gate, verdict, axis, gridlines,
 *                                    bar, dot, label, callout, tag (+ hatch, arrow, rule,
 *                                    bracket, total, slot, clear)
 *
 *   THEME.tags                       the exact wording of the honesty labels
 *
 *   THEME.gateStrip(opts)            markup for the gate strip (where we are among the four gates)
 *   THEME.tag(kind, text)            markup for an honesty tag
 *   THEME.verdict(kind)              markup for a small NO / PASS / NOT YET mark
 *   THEME.slot(text)                 markup for a "YOUR NUMBER" slot
 *   THEME.landNo(slideEl, opts)      how a NO lands: recoil, then a stop-time hold in negative
 *
 * Every helper below has a comment with an example. The kit slides
 * (deck/slides/_kit.js, open index.html?kit) show all of them drawn.
 *
 * THE RULES THIS FILE ENFORCES (docs/DIRECTION.md, Part 1)
 *   - Flare is the point of the slide, once per slide. Nothing here uses it
 *     unless you ask for it by name (fill: 'accent', flare: true, kind: 'point').
 *   - NO and PASS are shapes and words in the base inks, never colours.
 *   - No line under 3px, no meaningful rule under 6px, no text under 28px:
 *     the helpers clamp to those floors.
 */
(function () {
  'use strict';

  var doc = document;
  var M = window.Motion || null;

  /* ======================================================================
   * Tokens
   * ==================================================================== */

  var cache = {};
  var rootStyle = null;

  /* Fallbacks, used only if tokens.css is missing (a scene opened on its own). */
  var FALLBACK = {
    '--c-bg': '#F4EDDE', '--c-bg-alt': '#E8E0CE', '--c-ink': '#050505', '--c-ink-soft': '#3D3934',
    '--c-muted': '#8A8275', '--c-line': '#050505', '--c-accent': '#FF6842', '--c-accent-ink': '#050505',
    '--c-no': '#050505', '--c-no-ink': '#F4EDDE', '--c-pass': '#050505', '--c-pass-ink': '#F4EDDE',
    '--c-warn': '#050505', '--c-before': '#8A8275', '--c-after': '#050505',
    '--c-data-1': '#050505', '--c-data-2': '#4B4640', '--c-data-3': '#7F786C', '--c-data-4': '#ADA595', '--c-data-5': '#D3CBB9',
    '--c-heat-0': '#ACA79D', '--c-heat-1': '#8B877F', '--c-heat-2': '#696660', '--c-heat-3': '#484642', '--c-heat-4': '#272623', '--c-heat-5': '#050505'
  };

  function tokenName(name) {
    var n = String(name);
    if (n.indexOf('--') === 0) { return n; }
    if (/^(c|f|t|m|s|w|r|d|e)-/.test(n)) { return '--' + n; }
    return '--c-' + n;                       // 'accent' -> '--c-accent'
  }

  /**
   * THEME.color(name) -> the computed value of a token, as a string.
   * Accepts '--c-accent', 'c-accent' or just 'accent'. Cached; call
   * THEME.refresh() if you change a token at run time.
   *
   *     ctx.fillStyle = THEME.color('ink');
   *     ctx.strokeStyle = THEME.color('--c-line');
   */
  function color(name) {
    var prop = tokenName(name);
    if (cache[prop] != null) { return cache[prop]; }
    if (!rootStyle) { rootStyle = window.getComputedStyle(doc.documentElement); }
    var v = rootStyle.getPropertyValue(prop).trim();
    // a token that points at another token resolves through getComputedStyle already
    if (!v) { v = FALLBACK[prop] || ''; }
    cache[prop] = v;
    return v;
  }

  /** THEME.refresh(): forget cached tokens and ramps. */
  function refresh() {
    cache = {};
    rootStyle = null;
    heatStops = null;
    heatStopsInk = null;
  }

  /**
   * THEME.inks(ground) -> the inks to draw with on a ground.
   * ground: 'card' (default) or 'ink' (a Lampblack field). On Lampblack the
   * two base inks swap; Flare stays Flare.
   *
   *     var k = THEME.inks('card');
   *     ctx.fillStyle = k.ink;      // Lampblack on Card, Card on Lampblack
   */
  function inks(ground) {
    var dark = ground === 'ink' || ground === 'dark' || ground === 'lampblack';
    return {
      ground: dark ? color('ink') : color('bg'),
      ink: dark ? color('bg') : color('ink'),
      accent: color('accent'),
      accentInk: color('accent-ink'),
      muted: color('muted'),
      dark: dark
    };
  }

  function parseColor(str) {
    var s = String(str).trim();
    var m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) { return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)]; }
    m = /^#([0-9a-f]{6})/i.exec(s);
    if (m) { return [parseInt(m[1].substr(0, 2), 16), parseInt(m[1].substr(2, 2), 16), parseInt(m[1].substr(4, 2), 16)]; }
    m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
    if (m) { return [Number(m[1]), Number(m[2]), Number(m[3])]; }
    return [5, 5, 5];
  }

  var heatStops = null;
  var heatStopsInk = null;

  /**
   * THEME.heat(v, ground) -> a colour on the sequential ramp, v from 0 (cold:
   * rarely picked) to 1 (hot: picked constantly). Interpolates --c-heat-0 …
   * --c-heat-5: a heavier and heavier screen of Lampblack, monotonic in
   * lightness, so it survives a washed-out projector. The cold end is still
   * a visible mark. Pair it with size:
   *
   *     ctx.fillStyle = THEME.heat(velocity);
   *     THEME.draw.dot(ctx, x, y, THEME.heatRadius(velocity, 4, 14), { fill: THEME.heat(velocity) });
   *
   * ground: 'card' (default) or 'ink'. On a Lampblack field the ramp is
   * mirrored: cold is a dim screen, hot is full Card.
   *
   *     THEME.heat(velocity, 'ink')
   */
  function heat(v, ground) {
    var i;
    if (!heatStops) {
      heatStops = [];
      for (i = 0; i <= 5; i++) { heatStops.push(parseColor(color('--c-heat-' + i))); }
      // mirrored for a Lampblack ground: the four mid screens, lightest last, then on to Card
      var card = parseColor(color('--c-bg'));
      var h0 = heatStops[0];
      heatStopsInk = [heatStops[3], heatStops[2], heatStops[1], h0,
        [(h0[0] + card[0]) / 2, (h0[1] + card[1]) / 2, (h0[2] + card[2]) / 2], card];
    }
    var dark = ground === 'ink' || ground === 'dark' || ground === 'lampblack';
    var stops = dark ? heatStopsInk : heatStops;
    var t = v < 0 ? 0 : (v > 1 ? 1 : (v || 0));
    var f = t * 5;
    var k = Math.min(4, Math.floor(f));
    var u = f - k;
    var a = stops[k];
    var b = stops[k + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * u) + ',' + Math.round(a[1] + (b[1] - a[1]) * u) + ',' + Math.round(a[2] + (b[2] - a[2]) * u) + ')';
  }

  /**
   * THEME.heatRadius(v, min, max) -> a dot radius for v in 0..1. Area, not
   * radius, grows with v, so a dot twice as hot looks twice as big.
   * Size is the first encoding of velocity; ink is the second.
   */
  function heatRadius(v, min, max) {
    var lo = min == null ? 4 : min;
    var hi = max == null ? 14 : max;
    var t = v < 0 ? 0 : (v > 1 ? 1 : (v || 0));
    return Math.sqrt(lo * lo + (hi * hi - lo * lo) * t);
  }

  /**
   * THEME.data(i) -> categorical series colour, i from 1 to 5 (darkest first).
   * Five screens of Lampblack: tell series apart by pattern or shape too
   * (THEME.draw.bar takes pattern: 'solid' | 'hollow' | 'hatch').
   */
  function data(i) {
    var k = Math.max(1, Math.min(5, Math.round(i) || 1));
    return color('--c-data-' + k);
  }

  /* ======================================================================
   * Fonts
   * ==================================================================== */

  /* Canvas text cannot set an arbitrary width on the font's width axis, only
   * the CSS keywords. These are the ones the direction uses. */
  var KINDS = {
    display: { weight: 900, stretch: 'extra-condensed', family: 'Archivo', upper: true, track: 0, floor: 28 },
    num:     { weight: 900, stretch: 'extra-condensed', family: 'Archivo', upper: false, track: 0, floor: 28 },
    label:   { weight: 700, stretch: 'expanded', family: 'Archivo', upper: true, track: 0.1, floor: 28 },
    body:    { weight: 500, stretch: 'normal', family: 'Archivo', upper: false, track: 0, floor: 28 },
    strong:  { weight: 700, stretch: 'normal', family: 'Archivo', upper: false, track: 0, floor: 28 },
    small:   { weight: 600, stretch: 'normal', family: 'Archivo', upper: false, track: 0, floor: 28 },
    voice:   { weight: 600, stretch: 'normal', family: 'Fraunces', italic: true, upper: false, track: 0, floor: 28 }
  };
  var FALLBACK_FAMILY = { Archivo: '"Archivo", "Arial Narrow", Arial, sans-serif', Fraunces: '"Fraunces", Georgia, serif' };

  /**
   * THEME.font(kind, sizePx) -> a canvas font string.
   * kind: 'display' (Archivo 900, condensed, caps) · 'num' (same, for figures)
   *       'label' (wide caps) · 'body' · 'strong' · 'small' (source lines)
   *       'voice' (Fraunces italic).
   * Sizes under 28 are raised to 28: nothing on stage is smaller.
   *
   *     ctx.font = THEME.font('body', 40);
   *
   * The string carries the width keyword, but only THEME.setFont() also sets
   * the tracking that labels need. Prefer THEME.draw.label() for text.
   */
  function font(kind, sizePx) {
    var k = KINDS[kind] || KINDS.body;
    var size = Math.max(k.floor, Number(sizePx) || 40);
    return (k.italic ? 'italic ' : '') + k.weight + ' ' + (k.stretch !== 'normal' ? k.stretch + ' ' : '') + size + 'px ' + FALLBACK_FAMILY[k.family];
  }

  /**
   * THEME.setFont(ctx, kind, sizePx) -> the kind's settings ({ upper, track, size }).
   * Sets ctx.font, ctx.fontStretch and ctx.letterSpacing, which the font
   * string alone cannot do in every browser.
   *
   *     var k = THEME.setFont(ctx, 'label', 32);
   *     ctx.fillText(k.upper ? 'BEFORE' : 'Before', x, y);
   */
  function setFont(ctx, kind, sizePx) {
    var k = KINDS[kind] || KINDS.body;
    var size = Math.max(k.floor, Number(sizePx) || 40);
    ctx.font = font(kind, size);
    try { ctx.fontStretch = k.stretch; } catch (e) { /* older browsers: the keyword in the string is all we get */ }
    try { ctx.letterSpacing = (k.track * size).toFixed(2) + 'px'; } catch (e2) { /* no tracking */ }
    try { ctx.fontKerning = 'normal'; } catch (e3) { /* default */ }
    return { upper: k.upper, track: k.track * size, size: size, kind: kind in KINDS ? kind : 'body' };
  }

  /* THEME.ready: resolves when both families are usable (or at once if the
   * browser has no font loading API). Canvas scenes should draw after it,
   * and again in resize(). */
  var fontsLoaded = false;
  var ready = (function () {
    if (!doc.fonts || !doc.fonts.load) { fontsLoaded = true; return Promise.resolve(); }
    var done = function () { fontsLoaded = true; };
    return Promise.all([
      doc.fonts.load('900 100px Archivo'),
      doc.fonts.load('500 40px Archivo'),
      doc.fonts.load('italic 600 60px Fraunces')
    ]).then(function () { return doc.fonts.ready; }).then(done, done);
  }());

  /**
   * THEME.whenReady(fn): run fn once the fonts are loaded.
   *
   *     THEME.whenReady(function () { draw(); });
   */
  function whenReady(fn) {
    if (fontsLoaded) { fn(); return; }
    ready.then(fn, fn);
  }

  /* ======================================================================
   * Motion: 120 BPM. Every duration is a note value. Nothing fades.
   * ==================================================================== */

  function bezier(x1, y1, x2, y2) {
    function cx(t) { return 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t; }
    function cy(t) { return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t; }
    return function (x) {
      if (x <= 0) { return 0; }
      if (x >= 1) { return 1; }
      var lo = 0, hi = 1, t = x, i;
      for (i = 0; i < 32; i++) { t = (lo + hi) / 2; if (cx(t) < x) { lo = t; } else { hi = t; } }
      return cy(t);
    };
  }

  /**
   * THEME.motion
   *
   *   fast, base, slow        seconds: an eighth, a beat, two beats (= --d-fast/base/slow)
   *   note                    { beat, eighth, sixteenth, swing, bar } in seconds
   *   dur                     named moves in seconds:
   *                             blockIn, blockOut  the block reveal (bar grows, bar retreats)
   *                             voice              a Fraunces line wiping in
   *                             lift, drop         a gate opening / shutting
   *                             jolt               the recoil after a drop
   *                             holdBefore         stillness before a NO lands (0.8)
   *                             holdAfter          stillness after it (0.9)
   *                             hold               the stop-time hold in negative (1.0)
   *                             count              a counter: twelve ticks
   *   ease                    names for Motion.tween: { out, inOut } are Motion easing
   *                           names; arrive, lift, drop, cut, tick are functions with the
   *                           exact curves of the CSS tokens. Motion takes either.
   *   barSpeed                px per second. Bars and routes grow at ONE constant speed,
   *                           so $45 is done in a blink and $15,000 keeps the room waiting.
   *   growTime(px)            seconds a bar of that length takes
   *   swung(i)                start time in seconds of the i-th item of a swung stagger
   *                           (long-short, never even): 0, 0.333, 0.5, 0.833, 1.0 …
   *
   *     Motion.tween({ from: 0, to: 1, duration: THEME.motion.dur.lift, ease: THEME.motion.ease.lift, onUpdate: draw });
   *     var seconds = THEME.motion.growTime(barWidthPx);
   */
  var arrive = bezier(0.16, 1, 0.3, 1);
  var motion = {
    fast: 0.25,
    base: 0.5,
    slow: 1,
    note: { beat: 0.5, eighth: 0.25, sixteenth: 0.125, swing: 1 / 3, bar: 2 },
    dur: {
      blockIn: 0.125, blockOut: 0.25, voice: 1 / 3, lift: 0.5, drop: 0.375, jolt: 0.375,
      holdBefore: 0.8, holdAfter: 0.9, hold: 1, sleeve: 0.5, count: 1.5
    },
    ease: {
      out: 'outExpo',
      inOut: 'inOutCubic',
      snap: function (t) { return t < 1 ? 0 : 1; },
      arrive: arrive,
      lift: bezier(0.2, 0.8, 0.2, 1),
      drop: bezier(0.55, 0, 1, 0.45),
      cut: function (t) { return t < 1 ? 0 : 1; },
      tick: function (t) { return Math.floor(Math.max(0, Math.min(1, t)) * 12 + 1e-9) / 12; }
    },
    barSpeed: 900,
    growTime: function (px) { return Math.abs(px) / motion.barSpeed; },
    swung: function (i) { return Math.floor(i / 2) * 0.5 + (i % 2 ? 1 / 3 : 0); },
    bezier: bezier
  };

  /* ======================================================================
   * fitStack: the Sleeve signature
   * ----------------------------------------------------------------------
   * Every line of a stack is justified to the same measure by moving
   * Archivo's width axis (62 to 125), never by scaling or distorting.
   * Long lines condense, short lines expand, cap height stays constant.
   * The INK is flush on both edges: the real side bearings of the first and
   * last glyph of each line are measured and taken out.
   * ==================================================================== */

  var CAP = 0.688, LH = 0.708, WMIN = 62, WMAX = 125;
  var STOPS = [[62, 'ultra-condensed'], [75, 'condensed'], [87.5, 'semi-condensed'], [100, 'normal'], [112.5, 'semi-expanded'], [125, 'expanded']];
  var scanCtx = null;
  var bearingCache = {};

  function bearingsAtStop(ch, k, weight) {
    var key = ch + '|' + k + '|' + weight;
    if (bearingCache[key]) { return bearingCache[key]; }
    if (!scanCtx) {
      var cv = doc.createElement('canvas');
      cv.width = 640; cv.height = 560;
      scanCtx = cv.getContext('2d', { willReadFrequently: true });
    }
    var c = scanCtx, S = 400, X = 80, W = 640, H = 560;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    c.font = weight + ' ' + S + 'px Archivo';
    try { c.fontStretch = STOPS[k][1]; } catch (e) { /* keyword unsupported: bearings stay at normal width */ }
    try { c.letterSpacing = '0px'; } catch (e2) { /* none */ }
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#000';
    var adv = c.measureText(ch).width;
    c.fillText(ch, X, 420);
    var d = c.getImageData(0, 0, W, H).data, minx = W, maxx = -1, x, y;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 127) { if (x < minx) { minx = x; } if (x > maxx) { maxx = x; } }
      }
    }
    return (bearingCache[key] = maxx < 0 ? [0, 0] : [(minx - X) / S, (X + adv - (maxx + 1)) / S]);
  }

  function inkBearings(ch, wdth, weight) {
    var k = 0;
    while (k < STOPS.length - 2 && wdth > STOPS[k + 1][0]) { k++; }
    var a = bearingsAtStop(ch, k, weight), b = bearingsAtStop(ch, k + 1, weight);
    var f = (wdth - STOPS[k][0]) / (STOPS[k + 1][0] - STOPS[k][0]);
    f = Math.max(0, Math.min(1, f));
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  /* The stage is scaled with a CSS transform, and thumbnails are scaled
   * again, so a bounding box is not in stage pixels. This is the factor
   * between the two for one element. */
  function scaleOf(el) {
    var w = parseFloat(window.getComputedStyle(el).width);
    var r = el.getBoundingClientRect().width;
    return w > 0 && r > 0 ? r / w : 1;
  }

  function stackLines(el) {
    var lines = Array.prototype.slice.call(el.querySelectorAll('.ln'));
    if (lines.length) { return lines; }
    // no .ln spans: make them, one per <br>-separated line
    var parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts.map(function (p) { return '<span class="ln">' + p.trim() + '</span>'; }).join('');
    return Array.prototype.slice.call(el.querySelectorAll('.ln'));
  }

  /**
   * THEME.fitStack(el, options) -> { size, pitch, widths } (stage px)
   *
   * Markup: a block with class "stack" and one span.ln per line (or plain
   * lines separated by <br>; they are wrapped for you). Give the block a
   * width: that is the measure.
   *
   *     <h2 class="stack" data-fit style="width: 1088px">
   *       <span class="ln">Your best</span>
   *       <span class="ln">AI idea is</span>
   *       <span class="ln">probably</span>
   *       <span class="ln"><b class="punch">wrong.</b></span>
   *     </h2>
   *
   * You rarely call this yourself: anything with a data-fit attribute is
   * fitted automatically when its slide enters, when the window is resized,
   * and once more when the fonts have loaded. Call it by hand only after
   * changing a stack's text from JavaScript:
   *
   *     THEME.fitStack(ctx.el.querySelector('.stack'));
   *
   * Options (each can also be a data attribute on the element):
   *   size      data-fit-size      fix the font size in px instead of fitting the longest line
   *   height    data-fit-h         total height from the first cap-top to the last baseline;
   *                                the lines are spaced to fill it exactly
   *   gap       data-fit-gap       extra px between lines (instead of height)
   *   max       data-fit-max       largest font size allowed, px
   *   leading                      line pitch as a multiple of the size when neither height
   *                                nor gap is given. Default 0.75 for three or more lines,
   *                                0.708 (cap-height boxes touching) for two.
   *
   * Rules of the house: keep line lengths within about 2 : 1 (rewrite the
   * line if not), and never fit parallel labels (the four gate names share
   * one width because they are equals). Fitted stacks are always DOM.
   */
  function fitStack(el, options) {
    if (!el || !el.querySelectorAll) { return null; }
    var o = options || {};
    var ds = el.dataset || {};
    var lines = stackLines(el);
    var n = lines.length;
    if (!n) { return null; }

    var cs = window.getComputedStyle(el);
    var measure = o.measure || parseFloat(cs.width) || el.clientWidth;
    if (!(measure > 0)) { return null; }
    var k = scaleOf(el);
    var weight = parseInt(cs.fontWeight, 10) || 900;
    var i;

    function w(l) { return l.getBoundingClientRect().width / k; }
    function ends(l) {
      var t = (l.textContent || '').trim();
      if (cs.textTransform === 'uppercase') { t = t.toUpperCase(); }
      return [t.charAt(0), t.charAt(t.length - 1)];
    }
    function ink(l, wdth, s) {
      var e = ends(l);
      return w(l) - (inkBearings(e[0], wdth, weight)[0] + inkBearings(e[1], wdth, weight)[1]) * s;
    }

    // Measuring means changing a style and reading the box in the same task.
    // A CSS transition on the stack, on a line, or on a wrapper between them
    // (the deck's ?fast mode gives EVERY element a 1ms one) would make the
    // box lag one change behind, so transitions are switched off on the whole
    // stack while it is fitted.
    var frozen = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
    var held = frozen.map(function (node) {
      var was = [node.style.getPropertyValue('transition'), node.style.getPropertyPriority('transition')];
      node.style.setProperty('transition', 'none', 'important');
      return was;
    });
    function release() {
      void el.offsetWidth;                       // commit the fitted styles before transitions come back
      frozen.forEach(function (node, j) {
        if (held[j][0]) { node.style.setProperty('transition', held[j][0], held[j][1]); }
        else { node.style.removeProperty('transition'); }
      });
    }

    el.style.fontSize = '100px';
    lines.forEach(function (l) {
      l.style.fontStretch = WMIN + '%';
      l.style.letterSpacing = '0';
      l.style.marginRight = '0';
      l.style.marginLeft = '0';
      l.style.marginBottom = '0';
    });
    var widest = 0;
    lines.forEach(function (l) { widest = Math.max(widest, ink(l, WMIN, 100) / 100); });
    if (!(widest > 0)) { el.style.fontSize = ''; release(); return null; }

    var fixed = o.size || parseFloat(ds.fitSize);
    var s = fixed > 0 ? fixed : Math.floor(measure / widest * 10) / 10;
    var max = o.max || parseFloat(ds.fitMax);
    if (max > 0 && s > max) { s = max; }
    el.style.fontSize = s + 'px';

    var widths = [];
    lines.forEach(function (l) {
      var lo = WMIN, hi = WMAX, mid;
      for (i = 0; i < 18; i++) {
        mid = (lo + hi) / 2;
        l.style.fontStretch = mid + '%';
        if (ink(l, mid, s) > measure) { hi = mid; } else { lo = mid; }
      }
      var v = Math.round(lo * 10) / 10;
      l.style.fontStretch = v + '%';
      var chars = (l.textContent || '').trim().length;
      var rest = measure - ink(l, v, s);
      var ls = 0;
      // a line that is still short at full width gets the rest as tracking,
      // but never more than a tenth of an em: beyond that, rewrite the line
      if (rest > 0.5 && chars > 1) {
        ls = Math.min(rest / (chars - 1), s * 0.1);
        l.style.letterSpacing = ls.toFixed(3) + 'px';
      }
      l.style.marginLeft = (-inkBearings(ends(l)[0], v, weight)[0] * s).toFixed(2) + 'px';
      l.style.marginRight = (-ls).toFixed(3) + 'px';
      l.setAttribute('data-wdth', v);
      widths.push(v);
    });

    var height = o.height || parseFloat(ds.fitH);
    var gapOpt = o.gap != null ? o.gap : (ds.fitGap != null && ds.fitGap !== '' ? parseFloat(ds.fitGap) : null);
    var gap;
    if (height > 0 && n > 1) { gap = (height - CAP * s) / (n - 1) - LH * s; }
    else if (gapOpt != null && !isNaN(gapOpt)) { gap = gapOpt; }
    else { gap = ((o.leading || (n >= 3 ? 0.75 : LH)) - LH) * s; }
    lines.forEach(function (l, j) { l.style.marginBottom = (j < n - 1 ? gap.toFixed(2) : 0) + 'px'; });

    el.setAttribute('data-fit-done', s);
    release();
    return { size: s, pitch: LH * s + gap, widths: widths, measure: measure };
  }

  /**
   * THEME.fitAll(root): fit every [data-fit] stack under root (default: the
   * whole document). The theme calls it on slide change, on resize and when
   * the fonts arrive, so slide authors only write the data-fit attribute.
   */
  function fitAll(root) {
    var scope = root && root.querySelectorAll ? root : doc;
    var nodes = Array.prototype.slice.call(scope.querySelectorAll('[data-fit]'));
    if (scope !== doc && scope.matches && scope.matches('[data-fit]')) { nodes.unshift(scope); }
    nodes.forEach(function (el) {
      try { fitStack(el); } catch (err) { /* one bad stack must not stop the deck */ }
    });
    return nodes.length;
  }

  /* ---- range inputs ----------------------------------------------------------
   * A .slider's track is drawn thin, and thick up to the thumb. CSS cannot
   * know where the thumb is, so the theme writes it into --fill. This is
   * automatic for every range input in the deck; call THEME.fillRange(input)
   * yourself only after setting input.value from JavaScript. */

  function isRange(node) { return !!node && node.tagName === 'INPUT' && node.type === 'range'; }

  /**
   * THEME.fillRange(input): redraw the "on" part of a range input's track.
   *     input.value = 60; THEME.fillRange(input);
   */
  function fillRange(input) {
    var min = parseFloat(input.min); if (isNaN(min)) { min = 0; }
    var max = parseFloat(input.max); if (isNaN(max)) { max = 100; }
    var v = parseFloat(input.value); if (isNaN(v)) { v = min; }
    var t = max > min ? (v - min) / (max - min) : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    // the thumb is 32px wide and stays inside the track, so the fill ends at its centre
    input.style.setProperty('--fill', 'calc(16px + (100% - 32px) * ' + t.toFixed(4) + ')');
  }

  function fillRanges(root) {
    if (!root || !root.querySelectorAll) { return; }
    if (isRange(root)) { fillRange(root); }
    Array.prototype.forEach.call(root.querySelectorAll('input[type="range"]'), fillRange);
  }

  /* ---- wiring: fit on enter, on resize, when fonts land ------------------- */

  var fitQueued = false;
  function queueFit() {
    if (fitQueued) { return; }
    fitQueued = true;
    var run = function () { fitQueued = false; if (fontsLoaded) { fitAll(doc); } };
    if (window.requestAnimationFrame) { window.requestAnimationFrame(run); } else { setTimeout(run, 16); }
  }

  function wire() {
    // 1. anything with data-fit that enters the document (a slide being
    //    mounted, an overview thumbnail, a presenter preview) is fitted at
    //    once, in the same task, so it never paints unfitted
    if (window.MutationObserver && doc.body) {
      var mo = new MutationObserver(function (records) {
        if (!fontsLoaded) { return; }
        for (var r = 0; r < records.length; r++) {
          var added = records[r].addedNodes;
          for (var a = 0; a < added.length; a++) {
            var node = added[a];
            if (node.nodeType !== 1) { continue; }
            fillRanges(node);
            if (node.hasAttribute && node.hasAttribute('data-fit-done')) { continue; }
            if ((node.matches && node.matches('[data-fit]')) || (node.querySelector && node.querySelector('[data-fit]'))) {
              var list = node.matches('[data-fit]') ? [node] : Array.prototype.slice.call(node.querySelectorAll('[data-fit]'));
              list.forEach(function (el) {
                if (el.hasAttribute('data-fit-done')) { return; }
                try { fitStack(el); } catch (err) { /* keep going */ }
              });
            }
          }
        }
      });
      mo.observe(doc.body, { childList: true, subtree: true });
    }
    // 2. fonts: everything again, properly, once they are in
    whenReady(function () { fitAll(doc); });
    // 2b. range inputs: keep the thick "on" part of the track in step with the value
    doc.addEventListener('input', function (e) { if (isRange(e.target)) { fillRange(e.target); } }, true);
    doc.addEventListener('change', function (e) { if (isRange(e.target)) { fillRange(e.target); } }, true);
    fillRanges(doc);
    // 3. resize: the fit does not depend on the window, but sub-pixel text
    //    layout does, a little. Refit when the scale settles.
    window.addEventListener('resize', queueFit);
    // 4. slide and step changes (a stack revealed by a step is already fitted;
    //    this catches stacks whose text a slide changed in enter())
    if (window.Deck && typeof window.Deck.on === 'function') {
      window.Deck.on('change', queueFit);
      window.Deck.on('start', queueFit);
    }
  }
  if (doc.body) { wire(); } else { doc.addEventListener('DOMContentLoaded', wire); }

  /* ======================================================================
   * The drawing kit
   * ----------------------------------------------------------------------
   * All coordinates are stage pixels (Deck.fitCanvas has already scaled the
   * context). Every helper saves and restores the context. `opts.ground`
   * is 'card' (default) or 'ink' and swaps the two base inks.
   * ==================================================================== */

  var draw = {};

  function resolveFill(name, k) {
    if (!name || name === 'ink') { return k.ink; }
    if (name === 'ground' || name === 'card' || name === 'bg') { return k.ground; }
    if (name === 'accent' || name === 'flare' || name === 'point') { return k.accent; }
    if (name === 'muted' || name === 'before') { return k.muted; }
    if (/^(#|rgb|hsl)/.test(name)) { return name; }
    return color(name);
  }

  function lineFloor(w, meaning) { return Math.max(meaning ? 6 : 3, w); }

  /**
   * THEME.draw.clear(ctx, w, h, ground): wipe the canvas to the ground.
   *     THEME.draw.clear(ctx, fit.width, fit.height);          // Card
   *     THEME.draw.clear(ctx, fit.width, fit.height, 'ink');   // Lampblack field
   */
  draw.clear = function (ctx, w, h, ground) {
    ctx.save();
    ctx.fillStyle = inks(ground).ground;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  /**
   * THEME.draw.rule(ctx, x1, y1, x2, y2, opts): a straight rule.
   * opts: { width: 6, color: 'ink', dash: [14, 10], ground }
   *     THEME.draw.rule(ctx, 0, 100, 600, 100);                     // 6px Lampblack
   *     THEME.draw.rule(ctx, 0, 100, 600, 100, { dash: [14, 10], color: 'muted', width: 4 });   // the "before" line
   */
  draw.rule = function (ctx, x1, y1, x2, y2, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    ctx.save();
    ctx.strokeStyle = resolveFill(o.color, k);
    ctx.lineWidth = lineFloor(o.width == null ? 6 : o.width, false);
    ctx.lineCap = 'butt';
    if (o.dash) { ctx.setLineDash(o.dash); }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  /**
   * THEME.draw.arrow(ctx, x1, y1, x2, y2, opts): a shaft with a solid
   * triangular head at (x2, y2). The through-arrow under a PASS, and the
   * pointer of a callout.
   * opts: { width: 8, head: 3 (head length as a multiple of width), color, ground }
   *     THEME.draw.arrow(ctx, 40, 668, 430, 668);                   // through a gate
   */
  draw.arrow = function (ctx, x1, y1, x2, y2, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var lw = lineFloor(o.width == null ? 8 : o.width, false);
    var head = lw * (o.head || 3);
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(ang);
    ctx.fillStyle = ctx.strokeStyle = resolveFill(o.color, k);
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    if (len > head) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len - head + 1, 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(len - head, -head * 0.56);
    ctx.lineTo(len - head, head * 0.56);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  /**
   * THEME.draw.hatch(ctx, x, y, w, h, opts): the caution pattern, 45 degree
   * lines in the base ink. It means "careful": ladder levels, estimated
   * values. It is what --c-warn looks like, because there is no third ink.
   * opts: { gap: 12, width: 4, color: 'ink', frame: true, ground }
   *     THEME.draw.hatch(ctx, x, yLadder, slotW, slotH);            // a ladder-level shelf
   */
  draw.hatch = function (ctx, x, y, w, h, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var gap = o.gap || 12;
    var lw = Math.max(3, o.width || 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = resolveFill(o.color, k);
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (var d = -h; d < w + gap; d += gap) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
    ctx.restore();
    if (o.frame !== false) {
      ctx.save();
      ctx.strokeStyle = resolveFill(o.color, k);
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      ctx.restore();
    }
  };

  /**
   * THEME.draw.label(ctx, text, x, y, opts) -> { w, h, x, y } (the box it used)
   *
   * Text in the deck's hand. (x, y) is the left end of the baseline unless
   * align / baseline say otherwise.
   * opts:
   *   kind      'label' (default: wide caps, 32) | 'body' | 'strong' | 'small' |
   *             'num' | 'display' | 'voice'
   *   size      px. Floors: 28 for anything, and you should keep labels at 32+, body at 36+
   *   align     'left' | 'center' | 'right'
   *   baseline  'alphabetic' | 'top' | 'middle' | 'bottom'   ('top' is the cap-top for Archivo)
   *   color     'ink' (default) | 'ground' | 'accent' | 'muted' | a token | a colour
   *   plate     'ground' | 'ink' | 'accent': a solid block behind the text, so a label
   *             can sit on top of a drawing. The text takes the plate's own ink.
   *   pad       plate padding, px (default 0.35 of the size)
   *   ground    'card' | 'ink'
   *
   *     THEME.draw.label(ctx, 'Before', 40, 60);                                   // wide caps
   *     THEME.draw.label(ctx, '$3,600', barEnd + 22, y, { kind: 'num', size: 96, baseline: 'middle' });
   *     THEME.draw.label(ctx, 'Pack station', x, y, { plate: 'ink' });             // Card on a Lampblack block
   *
   * Flare is never text on Card: color 'accent' is refused unless the ground is 'ink'
   * and the size is display size (96 or more). Use plate: 'accent' instead.
   */
  draw.label = function (ctx, text, x, y, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    ctx.save();
    var f = setFont(ctx, o.kind || 'label', o.size || defaultSize(o.kind));
    var str = String(text == null ? '' : text);
    if (f.upper && o.upper !== false) { str = str.toUpperCase(); }
    var size = f.size;
    // letterSpacing adds tracking after the last glyph too: take it back out
    var width = ctx.measureText(str).width - (str.length ? f.track : 0);
    var align = o.align || 'left';
    var left = align === 'center' ? x - width / 2 : (align === 'right' ? x - width : x);
    var capH = (f.kind === 'voice' ? 0.7 : CAP) * size;
    var base = o.baseline || 'alphabetic';
    var by = base === 'top' ? y + capH : (base === 'middle' ? y + capH / 2 : (base === 'bottom' ? y - size * 0.22 : y));

    var fill = resolveFill(o.color, k);
    if (o.plate) {
      var pad = o.pad == null ? Math.round(size * 0.35) : o.pad;
      var plateFill = o.plate === 'ink' ? k.ink : (o.plate === 'accent' ? k.accent : k.ground);
      ctx.fillStyle = plateFill;
      ctx.fillRect(left - pad * 1.3, by - capH - pad, width + pad * 2.6, capH + pad * 2);
      fill = o.plate === 'ink' ? k.ground : (o.plate === 'accent' ? k.accentInk : k.ink);
    } else if (fill === k.accent && !(k.dark && size >= 96)) {
      fill = k.ink;                          // Flare is never text on Card
    }
    ctx.fillStyle = fill;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, left, by);
    ctx.restore();
    return { w: width, h: capH, x: left, y: by - capH };
  };

  function defaultSize(kind) {
    return { label: 32, body: 40, strong: 40, small: 28, num: 96, display: 96, voice: 54 }[kind || 'label'] || 32;
  }

  /**
   * THEME.draw.axis(ctx, x1, y1, x2, y2, opts): one 6px Lampblack axis line.
   * Charts in this deck have ONE axis rule, at most three ticks, and no box.
   * opts:
   *   width   6
   *   ticks   [{ at: 0..1, label: '$0' }, …]   at most three are drawn
   *   side    which side the ticks and labels go: 'below' | 'above' | 'left' | 'right'
   *   gap     [from, to] as 0..1: break the rule there, so a sliver of a bar
   *           beside the axis stays a visible object
   *   label   an axis title, wide caps, at the far end
   *   ground
   *
   *     THEME.draw.axis(ctx, 560, 236, 560, 984);                                  // the bar chart's spine
   *     THEME.draw.axis(ctx, 200, 900, 1700, 900, { ticks: [{ at: 0, label: '0' }, { at: 1, label: '100' }] });
   *     THEME.draw.axis(ctx, 560, 236, 560, 984, { gap: [0, 0.13] });              // let the $45 sliver show
   */
  draw.axis = function (ctx, x1, y1, x2, y2, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var lw = lineFloor(o.width == null ? 6 : o.width, true);
    var vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    function pt(t) { return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]; }
    ctx.save();
    ctx.strokeStyle = k.ink;
    ctx.fillStyle = k.ink;
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    var segs = [[0, 1]];
    if (o.gap && o.gap.length === 2) {
      var g0 = Math.max(0, Math.min(o.gap[0], o.gap[1])), g1 = Math.min(1, Math.max(o.gap[0], o.gap[1]));
      segs = [];
      if (g0 > 0) { segs.push([0, g0]); }
      if (g1 < 1) { segs.push([g1, 1]); }
    }
    segs.forEach(function (s) {
      var a = pt(s[0]), b = pt(s[1]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    });
    ctx.restore();
    var side = o.side || (vertical ? 'left' : 'below');
    var tickLen = o.tickLength || 18;
    (o.ticks || []).slice(0, 3).forEach(function (tk) {
      var p = pt(tk.at);
      var dx = side === 'left' ? -1 : (side === 'right' ? 1 : 0);
      var dy = side === 'above' ? -1 : (side === 'below' ? 1 : 0);
      draw.rule(ctx, p[0], p[1], p[0] + dx * tickLen, p[1] + dy * tickLen, { width: lw, ground: o.ground });
      if (tk.label != null) {
        draw.label(ctx, tk.label, p[0] + dx * (tickLen + 14), p[1] + dy * (tickLen + 14), {
          kind: o.tickKind || 'label', size: o.tickSize || 32, ground: o.ground,
          align: dx < 0 ? 'right' : (dx > 0 ? 'left' : 'center'),
          baseline: dy > 0 ? 'top' : (dy < 0 ? 'alphabetic' : 'middle')
        });
      }
    });
    if (o.label) {
      var e = pt(1);
      draw.label(ctx, o.label, e[0] + (vertical ? 0 : -4), e[1] + (vertical ? -20 : -22), {
        kind: 'label', size: 32, ground: o.ground, align: vertical ? 'left' : 'right'
      });
    }
  };

  /**
   * THEME.draw.gridlines(ctx, x, y, w, h, opts): quiet reference lines
   * inside a plot. Bar charts in this deck have none (the value is printed at
   * the end of the bar); use these for scatter plots and curves, sparingly.
   * 3px, in the muted ink, dashed, so they can never be mistaken for data.
   * opts: { xs: [0..1, …], ys: [0..1, …], dash: [3, 12], color: 'muted', ground }
   *
   *     THEME.draw.gridlines(ctx, plotX, plotY, plotW, plotH, { ys: [0.5, 1] });
   */
  draw.gridlines = function (ctx, x, y, w, h, opts) {
    var o = opts || {};
    var style = { width: 3, color: o.color || 'muted', dash: o.dash || [3, 12], ground: o.ground };
    (o.ys || []).forEach(function (t) { var yy = Math.round(y + h - h * t) + 0.5; draw.rule(ctx, x, yy, x + w, yy, style); });
    (o.xs || []).forEach(function (t) { var xx = Math.round(x + w * t) + 0.5; draw.rule(ctx, xx, y, xx, y + h, style); });
  };

  /**
   * THEME.draw.bar(ctx, x, y, w, h, opts) -> { x, y, w, h }
   *
   * One bar: a hard-edged block. Drawn to scale, never inflated: a 4px
   * sliver stays a 4px sliver (thin the axis beside it with draw.axis gap
   * and point at it with draw.callout).
   * opts:
   *   fill      'ink' (default) | 'accent' (the row that is the point) | 'muted' | token | colour
   *   pattern   'solid' (default) | 'hollow' (a 6px frame: the "before") | 'hatch' (estimated / caution)
   *   value     text printed at the end of the bar in display numerals
   *   valueSize 96
   *   inside    true prints the value inside the bar's far end, in the ground ink
   *             (for the bar that runs off the stage)
   *   ground
   *
   *     THEME.draw.bar(ctx, 560, 368, 81.6, 96, { value: '$900' });
   *     THEME.draw.bar(ctx, 560, 600, 1360, 96, { value: '$15,000', inside: true });
   *     THEME.draw.bar(ctx, 100, 300, 420, 64, { pattern: 'hollow' });             // before
   *     THEME.draw.bar(ctx, 100, 380, 260, 64);                                    // after
   */
  draw.bar = function (ctx, x, y, w, h, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var fill = resolveFill(o.fill, k);
    var pattern = o.pattern || 'solid';
    ctx.save();
    if (pattern === 'hollow') {
      var lw = Math.min(6, Math.max(3, Math.abs(w) / 2), Math.abs(h) / 2);
      ctx.strokeStyle = fill;
      ctx.lineWidth = lw;
      if (Math.abs(w) <= lw * 2) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
      else { ctx.strokeRect(x + lw / 2 * Math.sign(w || 1), y + lw / 2, w - lw * Math.sign(w || 1), h - lw); }
    } else if (pattern === 'hatch') {
      draw.hatch(ctx, Math.min(x, x + w), y, Math.abs(w), h, { color: o.fill, ground: o.ground });
    } else {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    if (o.value != null) {
      var size = o.valueSize || Math.min(96, Math.max(36, Math.round(h * 0.9)));
      if (o.inside) {
        draw.label(ctx, o.value, x + w - 22, y + h / 2, {
          kind: 'num', size: size, align: 'right', baseline: 'middle', ground: o.ground,
          color: fill === k.accent ? 'ink' : 'ground'
        });
      } else {
        draw.label(ctx, o.value, x + w + 22, y + h / 2, { kind: 'num', size: size, baseline: 'middle', ground: o.ground });
      }
    }
    return { x: x, y: y, w: w, h: h };
  };

  /**
   * THEME.draw.dot(ctx, x, y, r, opts): a round mark. The only circles in
   * the deck are dots. Categories are told apart by solid / hollow / ringed
   * before any ink is spent.
   * opts:
   *   kind    'solid' (default) | 'hollow' (a ring) | 'ringed' (a dot inside a ring) |
   *           'point' (THE point: Flare with a Lampblack ring, because Flare alone
   *           on Card is not enough contrast)
   *   fill    'ink' | 'muted' | 'accent' | token | colour (for THEME.heat(v))
   *   ring    ring width, px (default: 4 for 'point', a quarter of r otherwise, min 3)
   *   ground
   * Dots that carry meaning are 8px across or more: r is raised to 4.
   *
   *     THEME.draw.dot(ctx, x, y, 12);                                 // a model
   *     THEME.draw.dot(ctx, x, y, 12, { kind: 'hollow' });             // an estimated one
   *     THEME.draw.dot(ctx, x, y, 14, { kind: 'point' });              // the one to look at
   *     THEME.draw.dot(ctx, x, y, THEME.heatRadius(v), { fill: THEME.heat(v) });
   */
  draw.dot = function (ctx, x, y, r, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var kind = o.kind || 'solid';
    var rad = o.decor ? Math.max(1.5, r) : Math.max(4, r);
    var fill = resolveFill(o.fill, k);
    ctx.save();
    if (kind === 'point') {
      var pr = o.ring || 4;
      ctx.fillStyle = k.accent;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = k.ink;
      ctx.lineWidth = pr;
      ctx.beginPath(); ctx.arc(x, y, rad + pr / 2 - 0.5, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === 'hollow') {
      var hw = Math.max(3, o.ring || rad * 0.3);
      ctx.strokeStyle = fill;
      ctx.lineWidth = hw;
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, rad - hw / 2), 0, Math.PI * 2); ctx.stroke();
    } else if (kind === 'ringed') {
      var rw = Math.max(3, o.ring || rad * 0.22);
      ctx.strokeStyle = fill;
      ctx.lineWidth = rw;
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, rad - rw / 2), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, rad * 0.42), 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  /**
   * THEME.draw.tag(ctx, text, x, y, opts) -> { w, h }
   *
   * The honesty label, drawn ON the picture it qualifies so a screenshot of
   * the chart still carries it. (x, y) is the top-left corner unless align
   * says otherwise. Looks the same as the .tag CSS component.
   * opts:
   *   kind    'example' (default): hollow frame        "Example"
   *           'synthetic': solid Lampblack block       "Synthetic data"
   *           'laborde': solid block, double rule      "Laborde results, Oct 2026"
   *           'estimated': hatched edge                "estimated"
   *   size    32 (the floor for a label that carries meaning; 'estimated' may go to 28)
   *   align   'left' | 'right' | 'center'
   *   ground
   *
   *     THEME.draw.tag(ctx, THEME.tags.recreation, 24, 24, { kind: 'synthetic' });
   *     THEME.draw.tag(ctx, THEME.tags.estimated, x + 18, y - 20, { kind: 'estimated', size: 28 });
   */
  draw.tag = function (ctx, text, x, y, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var kind = o.kind || 'example';
    var size = Math.max(28, o.size || 32);
    ctx.save();
    var f = setFont(ctx, 'label', size);
    var str = String(text == null ? tags[kind] || '' : text).toUpperCase();
    var tw = ctx.measureText(str).width - f.track;
    var padX = Math.round(size * 0.62), h = Math.round(size * 1.75);
    var notch = kind === 'estimated' ? Math.round(h * 0.5) : 0;
    var w = Math.round(tw + padX * 2 + notch);
    var left = o.align === 'right' ? x - w : (o.align === 'center' ? x - w / 2 : x);
    var solid = kind === 'synthetic' || kind === 'laborde';
    if (solid) {
      ctx.fillStyle = k.ink;
      ctx.fillRect(left, y, w, h);
      if (kind === 'laborde') {                       // the double rule: a real, final figure
        ctx.fillStyle = k.ink;
        ctx.fillRect(left, y + h + 5, w, 5);
      }
    } else {
      ctx.fillStyle = k.ground;
      ctx.fillRect(left, y, w, h);
      ctx.strokeStyle = k.ink;
      ctx.lineWidth = 4;
      ctx.strokeRect(left + 2, y + 2, w - 4, h - 4);
    }
    ctx.restore();
    if (notch) { draw.hatch(ctx, left, y, notch + 4, h, { ground: o.ground, gap: 10, width: 3, frame: true }); }
    draw.label(ctx, str, left + notch + padX, y + h / 2, {
      kind: 'label', size: size, baseline: 'middle', ground: o.ground, color: solid ? 'ground' : 'ink'
    });
    return { w: w, h: h + (kind === 'laborde' ? 10 : 0), x: left, y: y };
  };

  /**
   * THEME.draw.callout(ctx, text, x, y, tx, ty, opts): a note that points.
   * The text sits at (x, y); an 8px arrow runs from beside it to the target
   * (tx, ty). This is how a sliver gets noticed and where the deadpan line
   * goes ("the whole bar."). One per chart.
   * opts:
   *   kind    'voice' (default: Fraunces italic, 54) | 'label' | 'body'
   *   size    px (voice is never under 54)
   *   align   'left' | 'right' | 'center' (where the text is anchored at x)
   *   elbow   true: no diagonals. The arrow leaves horizontally, then turns (a right
   *           angle, mitred). If the target is straight above or below the text, it
   *           simply drops (or rises) from the text to the target.
   *   width   arrow width, 8
   *   ground
   *
   *     THEME.draw.callout(ctx, 'the whole bar.', 760, 300, 568, 300);
   *     THEME.draw.callout(ctx, 'Drawn to scale.', 1700, 240, 1400, 420, { align: 'right', elbow: true });
   */
  draw.callout = function (ctx, text, x, y, tx, ty, opts) {
    var o = opts || {};
    var kind = o.kind || 'voice';
    var size = kind === 'voice' ? Math.max(54, o.size || 54) : (o.size || defaultSize(kind));
    var box = draw.label(ctx, text, x, y, { kind: kind, size: size, align: o.align, baseline: 'middle', ground: o.ground });
    var lw = o.width || 8;
    var gapPx = 22;
    // leave from the side of the text that faces the target
    var fromLeft = tx < box.x + box.w / 2;
    var sx = fromLeft ? box.x - gapPx : box.x + box.w + gapPx;
    var sy = y;
    var over = tx >= box.x - gapPx && tx <= box.x + box.w + gapPx;      // the target is under (or over) the text
    if (o.elbow && over && Math.abs(ty - sy) > size) {
      var below = ty > sy;
      draw.arrow(ctx, tx, below ? box.y + box.h + gapPx : box.y - gapPx, tx, ty, { width: lw, ground: o.ground });
    } else if (o.elbow && Math.abs(ty - sy) > lw) {
      var k = inks(o.ground);
      ctx.save();
      ctx.strokeStyle = k.ink;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, sy);
      ctx.lineTo(tx, ty + (ty > sy ? -lw * 3 : lw * 3));
      ctx.stroke();
      ctx.restore();
      draw.arrow(ctx, tx, ty + (ty > sy ? -lw * 3 - 1 : lw * 3 + 1), tx, ty, { width: lw, ground: o.ground });
    } else {
      draw.arrow(ctx, sx, sy, tx, ty, { width: lw, ground: o.ground });
    }
    return box;
  };

  /**
   * THEME.draw.bracket(ctx, x, y1, y2, opts): a square bracket tying two
   * things together, so a multiple is tied to what it compares ("$15,000 ÷
   * $45 =" above the 333×, bracketing the two bars).
   * opts: { depth: 28 (how far the arms reach, negative reaches left), width: 6, ground }
   *     THEME.draw.bracket(ctx, 1200, 300, 648, { depth: -28 });
   */
  draw.bracket = function (ctx, x, y1, y2, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var d = o.depth == null ? 28 : o.depth;
    var lw = lineFloor(o.width || 6, true);
    ctx.save();
    ctx.strokeStyle = k.ink;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x + d, y1);
    ctx.lineTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.lineTo(x + d, y2);
    ctx.stroke();
    ctx.restore();
  };

  /**
   * THEME.draw.total(ctx, x, y, w, opts): the double rule under a final
   * figure. It marks a total, as on a ledger.
   *     THEME.draw.total(ctx, numX, baselineY + 18, numW);
   */
  draw.total = function (ctx, x, y, w, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    ctx.save();
    ctx.fillStyle = k.ink;
    ctx.fillRect(x, y, w, 6);
    ctx.fillRect(x, y + 12, w, 6);
    ctx.restore();
  };

  /**
   * THEME.draw.slot(ctx, x, y, w, h, opts): a value the speaker has not
   * supplied. A dashed frame reading YOUR NUMBER. Never draw an invented
   * figure where one of these belongs.
   * opts: { text: 'Your number', size: 32, ground }
   *     if (value == null) { THEME.draw.slot(ctx, x, y, 420, 140); }
   */
  draw.slot = function (ctx, x, y, w, h, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    ctx.save();
    ctx.strokeStyle = k.ink;
    ctx.lineWidth = 6;
    ctx.setLineDash([22, 14]);
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    ctx.restore();
    draw.label(ctx, o.text || tags.yours, x + w / 2, y + h / 2, {
      kind: 'label', size: o.size || 32, align: 'center', baseline: 'middle', ground: o.ground
    });
  };

  /**
   * THEME.draw.verdict(ctx, x, y, kind, opts) -> { w, h }
   *
   * The small verdict chip, for tables, legends and strips. Shape and word,
   * in the base inks:
   *   'no'      a solid block + NO
   *   'pass'    a hollow frame with a raised (thick) lintel + PASS
   *   'notyet'  the frame only, dashed + NOT YET
   * (x, y) is the top-left corner. opts: { size: 64 (height; 48 minimum), word: true,
   * align: 'left' | 'center' | 'right', flare: false (true only when this NO is the
   * point of the slide), ground }
   *
   *     THEME.draw.verdict(ctx, x, y, 'no');
   *     THEME.draw.verdict(ctx, x, y, result.pass ? 'pass' : 'no', { size: 56 });
   */
  draw.verdict = function (ctx, x, y, kind, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var h = Math.max(48, o.size || 64);
    var st = kind === 'no' ? 'no' : (kind === 'pass' ? 'pass' : 'notyet');
    var word = st === 'no' ? 'NO' : (st === 'pass' ? 'PASS' : 'NOT YET');
    var fs = Math.round(h * 0.78);
    ctx.save();
    setFont(ctx, st === 'notyet' ? 'label' : 'display', st === 'notyet' ? Math.max(28, Math.round(h * 0.44)) : fs);
    var tw = ctx.measureText(word).width - (st === 'notyet' ? 0.1 * Math.max(28, Math.round(h * 0.44)) : 0);
    ctx.restore();
    var padX = Math.round(h * 0.28);
    var w = o.word === false ? Math.round(h * 0.62) : Math.round(tw + padX * 2);
    var left = o.align === 'right' ? x - w : (o.align === 'center' ? x - w / 2 : x);
    var lw = Math.max(4, Math.round(h * 0.08));
    ctx.save();
    if (st === 'no') {
      ctx.fillStyle = o.flare ? k.accent : k.ink;
      ctx.fillRect(left, y, w, h);
    } else {
      ctx.strokeStyle = k.ink;
      ctx.lineWidth = lw;
      if (st === 'notyet') { ctx.setLineDash([lw * 2.5, lw * 1.75]); }
      ctx.strokeRect(left + lw / 2, y + lw / 2, w - lw, h - lw);
      if (st === 'pass') {                      // the raised lintel
        ctx.fillStyle = k.ink;
        ctx.fillRect(left, y, w, Math.round(h * 0.26));
      }
    }
    ctx.restore();
    if (o.word !== false) {
      if (st === 'no') {
        draw.label(ctx, word, left + w / 2, y + h / 2 + 1, { kind: 'display', size: fs, align: 'center', baseline: 'middle', ground: o.ground, color: o.flare ? 'ink' : 'ground' });
      } else if (st === 'pass') {
        var ps = Math.round(h * 0.56);
        draw.label(ctx, word, left + w / 2, y + h * 0.26 + (h * 0.74 - lw) / 2, { kind: 'display', size: Math.max(28, ps), align: 'center', baseline: 'middle', ground: o.ground });
      } else {
        draw.label(ctx, word, left + w / 2, y + h / 2, { kind: 'label', size: Math.max(28, Math.round(h * 0.44)), align: 'center', baseline: 'middle', ground: o.ground });
      }
    }
    return { w: w, h: h, x: left, y: y };
  };

  /**
   * THEME.draw.gate(ctx, x, y, w, h, state, progress, opts)
   *
   * The gate: a loading-dock door seen from the front. Two posts and a
   * lintel, a floor line, and a shutter that hangs just inside the frame.
   * (x, y, w, h) is the bay from the outside of the posts to the bottom of
   * the floor line. Draw a row of gates with their posts overlapping
   * (step = w - line width) so neighbours share a post.
   *
   * state:
   *   'idle'   (also 'notyet')  frame only: the bay is visibly vacant
   *   'shut'   (also 'now')     shutter down to the floor: the gate being examined
   *                             (its name is printed on the shutter)
   *   'pass'                    shutter raised to the top fifth, the word PASS on it,
   *                             an open bay with a through-arrow at floor level
   *   'no'                      shutter dropped all the way THROUGH the floor line,
   *                             the word NO at its foot
   *
   * progress: 0..1, linear time. The helper applies the direction's own
   *   easing (lift for PASS, gravity for NO), so every gate in the deck moves
   *   the same way. PASS: 0 = shut, 1 = raised; the word cuts in at 0.75.
   *   NO: 0 = vacant, 1 = through the floor; the word rides on the shutter.
   *   Leave it out for the final state.
   *
   * opts:
   *   name      the gate's name, printed in the bay (idle / pass) or on the shutter (no)
   *   number    1..4: prints "GATE 1" above the name
   *   flare     true ONLY when this NO is the point of the slide. Default: Lampblack.
   *   through   how far a NO goes past the floor, px (default 9% of h)
   *   tell      true: leave the tell-tale mark on the floor where a NO hit
   *             (use it with state 'idle' after a NO has been cleared)
   *   word      false to leave PASS / NO off (very small gates)
   *   arrow     false to leave the through-arrow off
   *   line      line width of the frame (default: 8 for big gates, never under 3)
   *   ground
   *
   *     THEME.draw.gate(ctx, 40, 40, 300, 480, 'pass', 1, { name: 'Cost', number: 1 });
   *     THEME.draw.gate(ctx, 332, 40, 300, 480, 'no', t / THEME.motion.dur.drop, { name: 'Return', number: 2 });
   *     THEME.draw.gate(ctx, 624, 40, 300, 480, 'idle', 1, { name: 'Effort', number: 3 });   // NOT YET
   *
   * Gate logic (binding): after a gate says NO, every later gate is 'idle',
   * never 'pass'. Hold the bay vacant for motion.dur.holdBefore before a NO
   * and keep everything still for motion.dur.holdAfter after it.
   */
  draw.gate = function (ctx, x, y, w, h, state, progress, opts) {
    var o = opts || {};
    var k = inks(o.ground);
    var st = state === 'notyet' ? 'idle' : (state === 'now' ? 'shut' : (state || 'idle'));
    var p = progress == null ? 1 : Math.max(0, Math.min(1, progress));
    var lw = o.line || Math.max(3, Math.min(8, Math.round(w * 0.022)));
    var gap = lw;                                   // the shutter hangs this far inside the frame
    var through = o.through == null ? Math.round(h * 0.09) : o.through;
    var floorY = y + h - lw;                         // top of the floor line
    var sx = x + lw + gap, sw = w - 2 * (lw + gap);  // shutter left, width
    var sTop = y + lw + gap;
    var full = floorY - sTop;                        // a shutter that just reaches the floor
    var raised = Math.max(lw * 3, Math.round(full * 0.2));
    var big = w >= 220;

    ctx.save();
    // frame: lintel, posts, floor
    ctx.fillStyle = k.ink;
    ctx.fillRect(x, y, w, lw);
    ctx.fillRect(x, y, lw, h - lw);
    ctx.fillRect(x + w - lw, y, lw, h - lw);
    ctx.fillRect(x, floorY, w, lw);
    if (o.tell && st !== 'no') {                     // the scar a NO leaves: the floor is cut and dropped
      ctx.fillStyle = k.ground;
      ctx.fillRect(sx, floorY, sw, lw);
      ctx.fillStyle = k.ink;
      ctx.fillRect(sx, floorY + lw, sw, lw);
    }

    // shutter
    var sh = 0;
    var shutterFill = k.ink;
    if (st === 'shut') { sh = full; }
    else if (st === 'pass') { sh = full - (full - raised) * motion.ease.lift(p); }
    else if (st === 'no') { sh = (full + lw + through) * motion.ease.drop(p); shutterFill = o.flare ? k.accent : k.ink; }
    if (sh > 0) {
      ctx.fillStyle = shutterFill;
      ctx.fillRect(sx, sTop, sw, sh);
      if (st === 'pass' && p >= 1) {                 // the pull tab
        var tabW = Math.max(lw * 3, Math.round(sw * 0.17));
        ctx.fillRect(sx + (sw - tabW) / 2, sTop + sh, tabW, Math.max(4, Math.round(lw * 1.75)));
      }
    }
    ctx.restore();

    var padX = Math.round(sw * 0.055);
    var onShutter = st === 'no' ? (o.flare ? 'ink' : 'ground') : 'ground';

    // the gate's own text: in the open bay, or printed on a NO shutter
    if (o.name && big) {
      // the gate's own text sits in the same place in every state: it is read in
      // the open bay, and printed on the shutter when one has come down over it
      var bodyTop = sTop + raised + Math.round(full * 0.06);
      var showBody = st !== 'no' || sh > (bodyTop - sTop) + full * 0.2;
      var bodyInk = st === 'no' ? onShutter : (st === 'shut' ? 'ground' : 'ink');
      if (st === 'pass' && p < 1) { showBody = false; }
      if (showBody) {
        var numSize = Math.max(28, Math.round(w * 0.066));
        if (o.number != null) {
          draw.label(ctx, 'Gate ' + o.number, sx + padX, bodyTop, { kind: 'label', size: numSize, baseline: 'top', ground: o.ground, color: bodyInk });
        }
        var nameSize = fitText(ctx, String(o.name), 'display', Math.round(w * 0.21), sw - padX * 2);
        draw.label(ctx, o.name, sx + padX, bodyTop + (o.number != null ? numSize * 1.25 : 0), { kind: 'display', size: nameSize, baseline: 'top', ground: o.ground, color: bodyInk });
      }
    }

    // the verdict word rides on the shutter
    if (o.word !== false && sw > 60) {
      if (st === 'pass' && p >= 0.75) {
        var ps = fitText(ctx, 'PASS', 'display', Math.round(raised * 0.62 / CAP), sw - padX * 2);
        draw.label(ctx, 'PASS', sx + padX, sTop + (raised - CAP * ps) / 2, { kind: 'display', size: ps, baseline: 'top', ground: o.ground, color: 'ground' });
      } else if (st === 'no' && sh > 0) {
        var ns = fitText(ctx, 'NO', 'display', Math.round(full * 0.44), sw - padX * 1.2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sTop, sw, sh);
        ctx.clip();
        draw.label(ctx, 'NO', sx + padX * 0.6, sTop + sh - Math.round(ns * 0.06) - (big ? Math.round(full * 0.03) : 4), { kind: 'display', size: ns, ground: o.ground, color: onShutter });
        ctx.restore();
      }
    }

    // carried forward: the through-arrow at floor level
    if (st === 'pass' && p >= 1 && o.arrow !== false && sw > 90) {
      var ay = floorY - Math.max(lw * 4, Math.round(full * 0.12));
      draw.arrow(ctx, sx + padX, ay, sx + sw - padX, ay, { width: Math.max(4, lw), ground: o.ground });
    }
    return { x: x, y: y, w: w, h: h, line: lw, floorY: floorY, shutter: { x: sx, y: sTop, w: sw, h: sh } };
  };

  /* the largest size, up to `max`, at which `text` fits in `room` px */
  function fitText(ctx, text, kind, max, room) {
    ctx.save();
    var f = setFont(ctx, kind, 100);
    var str = f.upper ? text.toUpperCase() : text;
    var w100 = ctx.measureText(str).width;
    ctx.restore();
    var s = Math.min(max, Math.floor(room / (w100 / 100)));
    return Math.max(28, s);
  }

  /* ======================================================================
   * The honesty labels, worded once
   * ==================================================================== */

  var tags = {
    example: 'Example',
    synthetic: 'Synthetic data',
    recreation: 'Animated re-creation · synthetic data',
    laborde: 'Laborde results, Oct 2026',
    estimated: 'estimated',
    illustration: 'Illustration, not data',
    yours: 'Your number',
    edit: 'our edit'
  };

  /* ======================================================================
   * Markup helpers: small strings for slide html
   * ----------------------------------------------------------------------
   * Slides are written as template strings, so these return strings:
   *
   *     html: `<p class="kicker">Gate 1 · Cost</p>
   *            ${THEME.gateStrip({ now: 1 })}
   *            <h2 class="headline">What does it cost to run?</h2> ...`
   * ==================================================================== */

  var GATES = ['Cost', 'Return', 'Effort', 'Potential'];

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * THEME.gateStrip(opts) -> html
   *
   * The strip that says where a slide is among the four gates. It sits in a
   * fixed place (top right) on every slide that belongs to a gate.
   * opts:
   *   now      1..4 (or 'cost' | 'return' | 'effort' | 'potential'): the gate
   *            being discussed. Drawn as a solid plate with a pointer.
   *   states   optional verdicts so far, by gate: ['pass', 'no', null, null].
   *            PASS is a raised lintel over the word; NO is a block dropped
   *            through the strip's floor line. Anything after a NO stays plain.
   *
   *     THEME.gateStrip({ now: 2 })
   *     THEME.gateStrip({ now: 3, states: ['pass', 'pass'] })
   */
  function gateStrip(opts) {
    var o = opts || {};
    var now = o.now;
    if (typeof now === 'string' && isNaN(Number(now))) {
      now = GATES.map(function (g) { return g.toLowerCase(); }).indexOf(now.toLowerCase()) + 1;
    }
    now = Number(now) || 0;
    var states = o.states || [];
    var blocked = false;
    var cells = GATES.map(function (name, i) {
      var st = blocked ? null : states[i];
      if (st === 'no') { blocked = true; }
      var cls = st === 'pass' ? ' class="is-pass"' : (st === 'no' ? ' class="is-no"' : '');
      return '<b' + cls + '>' + name + '</b>';
    }).join('');
    return '<nav class="gate-strip"' + (now ? ' data-now="' + now + '"' : '') + ' aria-label="The four gates">' + cells + '</nav>';
  }

  /**
   * THEME.tag(kind, text) -> html for an honesty tag. kind: 'example' |
   * 'synthetic' | 'recreation' | 'laborde' | 'estimated' | 'illustration'.
   * The wording comes from THEME.tags unless you pass your own text.
   *
   *     THEME.tag('laborde')        // <span class="tag is-laborde">Laborde results, Oct 2026</span>
   *     THEME.tag('example', 'Example candidates')
   */
  function tagHtml(kind, text) {
    var k = kind || 'example';
    var cls = { recreation: 'synthetic', illustration: 'example' }[k] || k;
    return '<span class="tag is-' + cls + '">' + esc(text == null ? (tags[k] || k) : text) + '</span>';
  }

  /**
   * THEME.verdict(kind, opts) -> html for the small verdict mark.
   * kind: 'no' | 'pass' | 'notyet' (anything else is NOT YET).
   * opts: { size: 'l' | 'xl', flare: true only when this NO is the point of the slide }
   *
   *     THEME.verdict(result.pass ? 'pass' : 'no')
   */
  function verdictHtml(kind, opts) {
    var o = opts || {};
    var st = kind === 'no' ? 'no' : (kind === 'pass' ? 'pass' : 'notyet');
    var word = st === 'no' ? 'No' : (st === 'pass' ? 'Pass' : 'Not yet');
    return '<span class="verdict is-' + st + (o.size ? ' is-' + o.size : '') + (o.flare && st === 'no' ? ' is-flare' : '') + '">' + word + '</span>';
  }

  /**
   * THEME.slot(text, size) -> html for a value the speaker has not supplied.
   *
   *     value == null ? THEME.slot() : CostMath.money(value)
   */
  function slotHtml(text, size) {
    return '<span class="slot-yours' + (size ? ' is-' + size : '') + '">' + esc(text == null ? tags.yours : text) + '</span>';
  }

  /* ======================================================================
   * How a NO lands
   * ==================================================================== */

  /**
   * THEME.landNo(slideEl, opts) -> { cancel() }
   *
   * Call it at the moment a NO hits (the shutter reaches the floor, the slab
   * stops). The rest of the slide recoils 14px and settles inside three
   * sixteenths, and the slide prints in negative (Card and Lampblack swap,
   * Flare stays) for a stop-time hold. Then it cuts back to positive.
   * Nothing else should move during the hold.
   *
   * opts:
   *   hold     seconds in negative. Default 1 (two beats); never longer than a bar (2).
   *   recoil   elements that recoil: a selector inside the slide, or a list.
   *            Default: every direct child of the slide except .gate-strip and
   *            anything with class "no-jolt". (The NO itself should not recoil:
   *            give it class "no-jolt".)
   *   onDone   called when the slide is back in positive
   *
   *     step(ctx, n) { if (n === 2) { THEME.landNo(ctx.el); } }
   *
   * It runs on the Motion clock, so ?fast and video capture stay in step.
   * Use it for a real NO, a few times in 90 minutes: it is a held chord.
   */
  function landNo(slideEl, opts) {
    var o = opts || {};
    if (!slideEl) { return { cancel: function () {} }; }
    var hold = Math.min(motion.note.bar, Math.max(0, o.hold == null ? motion.dur.hold : o.hold));
    var targets;
    if (typeof o.recoil === 'string') { targets = Array.prototype.slice.call(slideEl.querySelectorAll(o.recoil)); }
    else if (o.recoil && o.recoil.length != null) { targets = Array.prototype.slice.call(o.recoil); }
    else {
      targets = Array.prototype.filter.call(slideEl.children, function (c) {
        return !c.classList.contains('no-jolt') && !c.classList.contains('gate-strip');
      });
    }
    var done = false;
    targets.forEach(function (t) { t.classList.remove('is-jolt'); });
    void slideEl.offsetWidth;                       // restart the recoil if it is already there
    targets.forEach(function (t) { t.classList.add('is-jolt'); });
    slideEl.classList.add('is-negative');
    function finish() {
      if (done) { return; }
      done = true;
      slideEl.classList.remove('is-negative');
      targets.forEach(function (t) { t.classList.remove('is-jolt'); });
      if (typeof o.onDone === 'function') { o.onDone(); }
    }
    var handle = null;
    var timer = null;
    if (M && M.tween) { handle = M.tween({ from: 0, to: 1, duration: hold, ease: 'linear', onDone: finish }); }
    else { timer = setTimeout(finish, hold * 1000); }
    return {
      cancel: function () {
        if (handle) { handle.cancel(); }
        if (timer) { clearTimeout(timer); }
        finish();
      }
    };
  }

  /* ======================================================================
   * Public
   * ==================================================================== */

  window.THEME = {
    name: 'sleeve',
    ready: ready,
    whenReady: whenReady,
    color: color,
    refresh: refresh,
    inks: inks,
    heat: heat,
    heatRadius: heatRadius,
    data: data,
    font: font,
    setFont: setFont,
    motion: motion,
    fitStack: fitStack,
    fitAll: fitAll,
    fillRange: fillRange,
    draw: draw,
    tags: tags,
    gates: GATES,
    gateStrip: gateStrip,
    tag: tagHtml,
    verdict: verdictHtml,
    slot: slotHtml,
    landNo: landNo,
    metrics: { cap: CAP, lineHeight: LH, widthMin: WMIN, widthMax: WMAX }
  };
}());
