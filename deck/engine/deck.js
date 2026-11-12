/*
 * deck.js: the presentation engine  ->  window.Deck, window.Scenes, window.__deck
 *
 * Hand-written, no dependencies except lib/motion.js. Classic script, works
 * from file://. Read docs/BRIEF.md section 9 for the contract this implements.
 *
 * ---------------------------------------------------------------------------
 * AUTHORING A SLIDE
 *
 *   Deck.slide({
 *     id: 'gate-cost',          unique; also the URL hash (#/gate-cost/1)
 *     act: 2,                   0-5; groups the progress bar and the overview
 *     title: 'Gate 1: Cost',    shown in the overview and the presenter view
 *     minutes: 2,               planned duration, used for pacing
 *     layout: 'chart',          adds class "layout-chart" to the slide root
 *     html: `...`,              the markup
 *     steps: 2,                 builds after the initial state
 *                               (default: the highest data-step in the html)
 *     notes: `...`,             speaker notes; blank line = new paragraph
 *     skip() { return false },  true leaves the slide out of the running order
 *     enter(ctx) {},            ctx = { el, step, deck }; runs before scenes mount,
 *                               so it may add markup (including data-step / data-scene)
 *     step(ctx, n, dir) {},     n = the new step, dir = +1 | -1 (changes only)
 *     exit(ctx) {},             runs when the slide has left the screen
 *   });
 *
 *   Markup the engine understands:
 *     data-step="n"        visible from step n onward     (class is-visible)
 *     data-step-only="n"   visible at step n only
 *     data-step-out="n"    hidden from step n onward (combine with data-step)
 *     data-anim="rise|fade|wipe|stamp|pop"   how it appears (see deck.css)
 *     style="--delay: 150ms"                 stagger a reveal
 *     data-count-to="3600" data-count-from="0" data-count-format="$,d"
 *       data-count-prefix="" data-count-suffix="" data-count-duration="1.2"
 *       data-count-ease="outExpo" data-count-steps="12"
 *                          counts up when it becomes visible. steps: the number
 *                          ticks N times instead of running smoothly. Deck-wide
 *                          defaults: Deck.config({ counters: { duration, ease, steps } })
 *     data-scene="name" data-opts='{"json":1}'   mounts a scene (below)
 *     data-keys="own"      keyboard events inside this element are left alone
 *     data-touch="own"     swipes and taps inside this element are left alone
 *
 * AUTHORING A SCENE
 *
 *   Scenes.define('warehouse', function (host, opts, api) {
 *     // host: sized element   opts: parsed data-opts
 *     // api: { token(name), motion, deck, fitCanvas(canvas), mode, slide }
 *     return { step(n, dir) {}, destroy() {}, resize() {} };
 *   });
 *
 *   The engine mounts scenes when the slide enters, calls step(currentStep, 0)
 *   once, then step(n, dir) on every change, and destroy() when the slide has
 *   left. destroy() MUST stop every Motion.raf loop and timer the scene started.
 *
 * THEMING
 *
 *   The engine reads the design tokens of docs/TOKENS.md and exposes its own
 *   knobs as --deck-* and --timer-* CSS variables. The full list, the markup
 *   of the progress bar, and the classes and attributes it keeps up to date
 *   for the theme are documented at the top of engine/deck.css.
 *
 * URL FLAGS (combine with &):
 *   ?fast       all motion 20x, CSS transitions instant (screenshots, tests)
 *   ?print      every slide at its final step, one per page (PDF export)
 *   ?presenter  the presenter view (normally opened with the S key)
 *   ?debug      show an on-screen badge when a slide or scene hook throws
 *
 * KEYS: see handleKey() below, or tools/README.md.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var STAGE_W = 1920;
  var STAGE_H = 1080;
  var M = window.Motion || null;
  var doc = document;

  /* ======================================================================
   * Flags and state
   * ==================================================================== */

  var params = new URLSearchParams(window.location.search);
  var mode = {
    print: params.has('print'),
    presenter: params.has('presenter') && !params.has('print'),
    debug: params.has('debug'),
    fast: params.has('fast') || params.has('print')
  };

  var registered = [];      // every Deck.slide() call, in order
  var registeredById = {};
  var slides = [];          // the running order: registered minus skipped
  var indexById = {};
  var groups = [];          // runs of consecutive slides in the same act: { act, first, count }
  var config = { title: '', startClock: null, acts: null, counters: null };
  var started = false;

  var state = { index: -1, step: 0, blackout: false, overview: false, notes: false, progress: true };
  var stageScale = 1;

  var live = null;          // record of the slide on screen (see mountSlide)
  var leaving = null;       // record of the slide fading out, or null
  var leaveTimer = null;
  var printed = [];         // print mode: every mounted record

  var errors = [];          // everything caught by safe(); read with __deck.errors()
  var listeners = {};       // Deck.on()
  var ui = {};              // DOM nodes the engine created
  var view = null;          // stageView or presenterView

  /* ======================================================================
   * Small helpers
   * ==================================================================== */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Create an element: h('div', 'class names', 'text'). */
  function h(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) { node.className = className; }
    if (text != null) { node.textContent = text; }
    return node;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** 754 -> "12:34". Minutes run past 59 on purpose: a 90 minute session reads "72:05". */
  function mmss(seconds) {
    var s = Math.floor(Math.abs(seconds) + 1e-6);
    return (seconds < -0.5 ? '-' : '') + Math.floor(s / 60) + ':' + pad2(s % 60);
  }

  /** Speaker notes are plain text. Blank line = paragraph. "YOUR STORY:" paragraphs get a class. */
  function notesHtml(text) {
    var clean = String(text || '').replace(/\r/g, '').split('\n')
      .map(function (line) { return line.trim(); }).join('\n').trim();
    if (!clean) { return '<p class="deck-notes-empty">No notes for this slide.</p>'; }
    return clean.split(/\n{2,}/).map(function (para) {
      var cls = /^YOUR STORY:/i.test(para) ? ' class="deck-notes-story"' : '';
      return '<p' + cls + '>' + escapeHtml(para).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* Text the engine shows uses \u escapes for anything outside ASCII, so this
   * file reads the same whatever encoding a page or an editor assumes:
   *   \u00b7 middle dot   \u2192 right arrow   \u21b5 return key
   *   \u2039 \u203a single angle quotes (back / next)   \u2212 minus sign */

  function actLabel(act) {
    var name = config.acts && config.acts[act];
    return 'Act ' + act + (name ? ' \u00b7 ' + name : '');
  }

  function emit(type, a, b) {
    (listeners[type] || []).slice().forEach(function (fn) {
      safe('Deck.on("' + type + '") listener', null, function () { fn(a, b); });
    });
  }

  /* ======================================================================
   * Error isolation
   *
   * Every slide and scene hook runs through safe(). A hook that throws is
   * recorded and the deck carries on. Nothing is shown or logged unless the
   * URL has ?debug, in which case a badge appears and the error is logged.
   * tools/shoot.js reads the record through __deck.errors().
   * ==================================================================== */

  function report(where, err, slideId) {
    errors.push({
      where: where,
      slide: slideId || null,
      message: String((err && err.message) || err),
      stack: (err && err.stack) || '',
      expected: !!(err && err.deckExpected),   // set by the demo slide that throws on purpose
      time: Date.now()
    });
    if (mode.debug) {
      if (window.console && console.error) { console.error('[deck] ' + where + (slideId ? ' in "' + slideId + '"' : '') + ':', err); }
      renderBadge();
    }
  }

  function safe(where, slideId, fn) {
    try { return fn(); }
    catch (err) { report(where, err, slideId); }
    return undefined;
  }

  function renderBadge() {
    if (!doc.body) { return; }
    if (!ui.badge) {
      ui.badge = h('div', 'deck-debug-badge');
      ui.badge.setAttribute('role', 'status');
      ui.badge.title = 'Click to dismiss';
      ui.badge.addEventListener('click', function () { ui.badge.hidden = true; });
      doc.body.appendChild(ui.badge);
    }
    var recent = errors.slice(-4);
    ui.badge.hidden = false;
    ui.badge.innerHTML = '<strong>' + errors.length + ' error' + (errors.length === 1 ? '' : 's') + '</strong>' +
      recent.map(function (e) {
        return '<div class="deck-debug-line">' + escapeHtml((e.slide ? e.slide + ' \u00b7 ' : '') + e.where + ': ' + e.message) + '</div>';
      }).join('');
  }

  /* ======================================================================
   * Scenes registry
   * ==================================================================== */

  var sceneDefs = {};

  var Scenes = {
    /** Scenes.define(name, function (host, opts, api) { return { step, destroy, resize }; }) */
    define: function (name, factory) {
      if (typeof name !== 'string' || typeof factory !== 'function') {
        report('Scenes.define', new Error('Scenes.define(name, factory) needs a string and a function'));
        return Scenes;
      }
      sceneDefs[name] = factory;
      return Scenes;
    },
    has: function (name) { return Object.prototype.hasOwnProperty.call(sceneDefs, name); },
    names: function () { return Object.keys(sceneDefs); }
  };

  /* ======================================================================
   * Slide registry
   * ==================================================================== */

  var STEP_ATTR_RE = /data-step(?:-only|-out)?\s*=\s*["']?(\d+)/g;

  function highestStep(html) {
    var max = 0;
    var m;
    STEP_ATTR_RE.lastIndex = 0;
    while ((m = STEP_ATTR_RE.exec(html))) { max = Math.max(max, Number(m[1])); }
    return max;
  }

  function registerSlide(def) {
    if (!def || typeof def.id !== 'string' || !def.id) {
      report('Deck.slide', new Error('a slide needs an id'));
      return Deck;
    }
    if (started) {
      report('Deck.slide', new Error('"' + def.id + '" was registered after Deck.start() and is ignored'), def.id);
      return Deck;
    }
    if (registeredById[def.id]) {
      report('Deck.slide', new Error('duplicate slide id "' + def.id + '"; the second one is ignored'), def.id);
      return Deck;
    }
    var html = def.html == null ? '' : String(def.html);
    var slide = {
      id: def.id,
      act: Number(def.act) || 0,
      title: def.title || def.id,
      minutes: Math.max(0, Number(def.minutes) || 0),
      layout: def.layout || '',
      html: html,
      notes: def.notes || '',
      steps: def.steps != null ? Math.max(0, Math.round(Number(def.steps)) || 0) : highestStep(html),
      def: def                   // hooks are called on the original object
    };
    registered.push(slide);
    registeredById[slide.id] = slide;
    return Deck;
  }

  /** Called once from start(): drop skipped slides and index the rest. */
  function buildRunningOrder() {
    slides = registered.filter(function (s) {
      if (typeof s.def.skip !== 'function') { return true; }
      return safe('skip()', s.id, function () { return s.def.skip(); }) !== true;
    });
    indexById = {};
    groups = [];
    slides.forEach(function (s, i) {
      indexById[s.id] = i;
      var last = groups[groups.length - 1];
      if (last && last.act === s.act) { last.count++; }
      else { groups.push({ act: s.act, first: i, count: 1 }); }
    });
  }

  /* ======================================================================
   * Steps and counters
   * ==================================================================== */

  var STEP_SELECTOR = '[data-step],[data-step-only],[data-step-out]';

  function isStepVisible(node, step) {
    var from = node.getAttribute('data-step');
    var only = node.getAttribute('data-step-only');
    var out = node.getAttribute('data-step-out');
    if (from !== null && step < Number(from)) { return false; }
    if (only !== null && step !== Number(only)) { return false; }
    if (out !== null && step >= Number(out)) { return false; }
    return true;
  }

  /** Toggle is-visible on every step-controlled element under root. */
  function applySteps(root, step) {
    root.setAttribute('data-current-step', step);
    var nodes = root.querySelectorAll(STEP_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var from = node.getAttribute('data-step');
      node.classList.toggle('is-visible', isStepVisible(node, step));
      node.classList.toggle('is-current-step', from !== null && Number(from) === step);
    }
  }

  /** True when no step-controlled ancestor (or the node itself) is hidden. */
  function isRevealed(node, root) {
    for (var n = node; n && n !== root; n = n.parentElement) {
      if (n.matches(STEP_SELECTOR) && !n.classList.contains('is-visible')) { return false; }
    }
    return true;
  }

  /* data-count-duration: seconds ("1.5"), or with a unit ("800ms", "2s").
   * A bare number above 30 is taken as milliseconds, because nobody means a 20 minute count. */
  function parseDuration(raw, fallback) {
    if (raw == null || raw === '') { return fallback; }
    var text = String(raw).trim();
    var n = parseFloat(text);
    if (isNaN(n)) { return fallback; }
    if (/ms$/i.test(text)) { return n / 1000; }
    if (/s$/i.test(text)) { return n; }
    return n > 30 ? n / 1000 : n;
  }

  var counterState = new WeakMap();   // element -> { shown, tween }

  /* The easing of a count: a named Motion easing, optionally cut into N ticks. */
  function counterEase(c) {
    var named = typeof c.ease === 'string' && c.ease !== 'spring' && c.ease !== 'steps' && typeof M.ease[c.ease] === 'function';
    var base = named ? M.ease[c.ease] : M.ease.outExpo;
    if (!(c.steps > 0)) { return base; }
    var stair = M.ease.steps(c.steps);
    return function (p) { return base(stair(p)); };
  }

  function setCounter(node, c, value, seconds) {
    if (!M) { node.textContent = c.prefix + value + c.suffix; return null; }
    var opts = { duration: seconds, format: c.format, prefix: c.prefix, suffix: c.suffix, ease: counterEase(c) };
    return M.count(node, seconds > 0 ? c.from : value, value, opts);
  }

  /**
   * Start, finish or reset every [data-count-to] under root so it matches
   * what is visible now. animate = false puts final values in place at once.
   */
  function updateCounters(root, animate) {
    var nodes = root.querySelectorAll('[data-count-to]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var st = counterState.get(node);
      var shown = isRevealed(node, root);
      if (st && st.shown === shown) { continue; }
      if (!st) { st = { shown: false, tween: null }; counterState.set(node, st); }
      if (st.tween) { st.tween.cancel(); st.tween = null; }
      st.shown = shown;

      var defaults = config.counters || {};
      var c = {
        to: Number(node.getAttribute('data-count-to')) || 0,
        from: Number(node.getAttribute('data-count-from')) || 0,
        format: node.getAttribute('data-count-format') || '',
        prefix: node.getAttribute('data-count-prefix') || '',
        suffix: node.getAttribute('data-count-suffix') || '',
        duration: parseDuration(node.getAttribute('data-count-duration'), defaults.duration != null ? Number(defaults.duration) : 1.2),
        ease: node.getAttribute('data-count-ease') || defaults.ease || '',
        steps: Number(node.getAttribute('data-count-steps') || defaults.steps) || 0
      };
      if (!shown) { setCounter(node, c, c.from, 0); }
      else if (!animate || mode.fast) { setCounter(node, c, c.to, 0); }
      else { st.tween = setCounter(node, c, c.to, c.duration); }
    }
  }

  function cancelCounters(root) {
    var nodes = root.querySelectorAll('[data-count-to]');
    for (var i = 0; i < nodes.length; i++) {
      var st = counterState.get(nodes[i]);
      if (st && st.tween) { st.tween.cancel(); st.tween = null; }
    }
  }

  /* ======================================================================
   * Mounting a slide (shared by the stage, print mode and nothing else)
   *
   * A "record" is everything the engine holds for one mounted slide:
   *   { slide, el, step, ctx, scenes: [{ name, host, inst }] }
   * ==================================================================== */

  function slideClass(slide, extra) {
    return 'slide' + (slide.layout ? ' layout-' + slide.layout : '') + ' act-' + slide.act + (extra ? ' ' + extra : '');
  }

  function mountSlide(slide, step, parent, animate) {
    var root = h('section', slideClass(slide, 'no-anim'));
    root.setAttribute('data-slide-id', slide.id);
    root.setAttribute('data-act', slide.act);
    root.setAttribute('data-current-step', step);
    safe('html', slide.id, function () { root.innerHTML = slide.html; });
    parent.appendChild(root);

    var rec = { slide: slide, el: root, step: step, scenes: [], ctx: null };
    rec.ctx = { el: root, step: step, deck: Deck, id: slide.id, steps: slide.steps };

    // 1. the slide's own hook first: it may add markup the next steps pick up
    safe('enter()', slide.id, function () { if (slide.def.enter) { slide.def.enter(rec.ctx); } });
    // 2. step visibility and counters
    applySteps(root, step);
    updateCounters(root, animate);
    // 3. scenes, once the DOM is attached and has its size
    mountScenes(rec);
    eachScene(rec, 'step', [step, 0]);
    return rec;
  }

  function mountScenes(rec) {
    var hosts = rec.el.querySelectorAll('[data-scene]');
    Array.prototype.forEach.call(hosts, function (host) {
      var name = host.getAttribute('data-scene');
      var opts = {};
      var raw = host.getAttribute('data-opts');
      if (raw) {
        safe('scene "' + name + '" data-opts (must be JSON)', rec.slide.id, function () { opts = JSON.parse(raw) || {}; });
      }
      var factory = sceneDefs[name];
      if (!factory) {
        report('scene', new Error('scene "' + name + '" is not defined'), rec.slide.id);
        host.classList.add('scene-missing');
        return;
      }
      var api = {
        /** Read a design token from CSS: api.token('color-accent') -> '#ffd166'. */
        token: function (tokenName, fallback) {
          var prop = String(tokenName).indexOf('--') === 0 ? tokenName : '--' + tokenName;
          var value = window.getComputedStyle(host).getPropertyValue(prop).trim();
          return value || (fallback != null ? fallback : '');
        },
        motion: M,
        deck: Deck,
        fitCanvas: fitCanvas,
        mode: mode,
        slide: rec.slide.id
      };
      var inst = safe('scene "' + name + '" mount', rec.slide.id, function () { return factory(host, opts, api) || {}; });
      if (inst) { rec.scenes.push({ name: name, host: host, inst: inst }); }
    });
  }

  function eachScene(rec, method, args) {
    rec.scenes.forEach(function (s) {
      if (typeof s.inst[method] !== 'function') { return; }
      safe('scene "' + s.name + '" ' + method + '()', rec.slide.id, function () { s.inst[method].apply(s.inst, args || []); });
    });
  }

  function destroyRecord(rec) {
    var id = rec.slide.id;
    safe('exit()', id, function () { if (rec.slide.def.exit) { rec.slide.def.exit(rec.ctx); } });
    eachScene(rec, 'destroy');
    rec.scenes = [];
    cancelCounters(rec.el);
    if (rec.el.parentNode) { rec.el.parentNode.removeChild(rec.el); }
  }

  /**
   * A static, inert copy of a slide at a given step, scaled down by CSS.
   * Used by the overview and the presenter view. No hooks run, no scenes
   * mount: scene hosts show their name instead.
   */
  function makeThumb(slide, step) {
    var box = h('div', 'deck-thumb');
    var root = h('section', slideClass(slide, 'is-static is-current'));
    root.setAttribute('data-thumb-of', slide.id);
    root.setAttribute('data-act', slide.act);
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('inert', '');
    safe('html (thumbnail)', slide.id, function () {
      root.innerHTML = slide.html;
      applySteps(root, step);
      updateCounters(root, false);
    });
    box.appendChild(root);
    return box;
  }

  /* ======================================================================
   * Canvas helper
   * ==================================================================== */

  /**
   * Deck.fitCanvas(canvas) sizes the canvas backing store so drawing is crisp
   * at the current window size, and returns { ctx, width, height, ratio }.
   * width/height are in STAGE units (the canvas's CSS size); the context is
   * already scaled, so draw in stage units and ignore ratio unless you need
   * device pixels. Call it on mount and again from your scene's resize().
   *
   * ratio = devicePixelRatio x stage scale, never more than 2 (and never a
   * backing store beyond 3840 x 2160).
   */
  function fitCanvas(canvas) {
    var parent = canvas.parentElement;
    var width = canvas.clientWidth || (parent && parent.clientWidth) || canvas.width || 300;
    var height = canvas.clientHeight || (parent && parent.clientHeight) || canvas.height || 150;
    var ratio = (window.devicePixelRatio || 1) * stageScale;
    ratio = Math.min(ratio, 2, (2 * STAGE_W) / width, (2 * STAGE_H) / height);
    ratio = Math.max(ratio, 0.25);
    var pxW = Math.max(1, Math.round(width * ratio));
    var pxH = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pxW) { canvas.width = pxW; }
    if (canvas.height !== pxH) { canvas.height = pxH; }
    var ctx = canvas.getContext('2d');
    if (ctx) { ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
    return { ctx: ctx, width: width, height: height, ratio: ratio };
  }

  /* ======================================================================
   * Navigation core (shared by the deck window and the presenter window)
   * ==================================================================== */

  function current() {
    var s = slides[state.index];
    return {
      index: state.index,
      id: s ? s.id : null,
      step: state.step,
      steps: s ? s.steps : 0,
      title: s ? s.title : '',
      act: s ? s.act : 0
    };
  }

  /**
   * The one function that changes position.
   * opts: { dir, instant, remote, catchUp }
   *   dir      +1 / -1; worked out from the positions when missing
   *   instant  no slide transition, no reveal animation
   *   remote   the change came from the other window: do not send it back
   *   catchUp  this is the window finding its place (page load, re-sync),
   *            not the speaker advancing: it must not start the elapsed timer
   */
  function go(index, step, opts) {
    opts = opts || {};
    if (!slides.length) { return false; }
    index = clamp(Math.round(Number(index) || 0), 0, slides.length - 1);
    var slide = slides[index];
    step = clamp(Math.round(Number(step) || 0), 0, slide.steps);

    var prevIndex = state.index;
    var prevStep = state.step;
    if (index === prevIndex && step === prevStep) { return false; }
    var forward = index > prevIndex || (index === prevIndex && step > prevStep);
    var dir = opts.dir != null ? opts.dir : (forward ? 1 : -1);

    state.index = index;
    state.step = step;
    if (view) {
      safe('engine', slide.id, function () {
        if (index !== prevIndex) { view.showSlide(index, step, dir, opts); }
        else { view.showStep(step, dir, opts); }
      });
    }
    writeHash();
    if (view) { safe('engine', slide.id, function () { view.refresh(); }); }
    if (!opts.remote) { sendState(false); }
    emit('change', current(), { dir: dir, remote: !!opts.remote });
    return true;
  }

  function next() {
    var s = slides[state.index];
    if (!s) { return; }
    if (state.step < s.steps) { go(state.index, state.step + 1, { dir: 1 }); }
    else if (state.index < slides.length - 1) { go(state.index + 1, 0, { dir: 1 }); }
  }

  function prev() {
    if (!slides[state.index]) { return; }
    if (state.step > 0) { go(state.index, state.step - 1, { dir: -1 }); }
    else if (state.index > 0) { go(state.index - 1, slides[state.index - 1].steps, { dir: -1 }); }
  }

  /** Accepts a 0-based index or a slide id. Returns -1 when the id is unknown. */
  function resolveIndex(indexOrId) {
    if (typeof indexOrId === 'number') { return indexOrId; }
    if (Object.prototype.hasOwnProperty.call(indexById, indexOrId)) { return indexById[indexOrId]; }
    return /^\d+$/.test(String(indexOrId)) ? Number(indexOrId) : -1;
  }

  /* ---------------------------------------------------------------- hash */

  function parseHash() {
    var m = /^#\/([^\/]+)(?:\/(\d+))?/.exec(window.location.hash || '');
    if (!m) { return null; }
    var id = m[1];
    try { id = decodeURIComponent(id); } catch (e) { /* keep the raw text */ }
    if (!Object.prototype.hasOwnProperty.call(indexById, id)) { return { index: 0, step: 0 }; }   // unknown id: first slide
    return { index: indexById[id], step: Number(m[2]) || 0 };
  }

  function writeHash() {
    var s = slides[state.index];
    if (!s || mode.print) { return; }
    var hash = '#/' + encodeURIComponent(s.id) + '/' + state.step;
    if (window.location.hash === hash) { return; }
    try { window.history.replaceState(null, '', hash); }
    catch (e) { window.location.hash = hash; }
  }

  function onHashChange() {
    var p = parseHash();
    if (p) { go(p.index, p.step, { instant: true }); }
    writeHash();
  }

  /* ======================================================================
   * Link between the deck window and the presenter window
   *
   * Both pages load the same index.html, so both know every slide. They only
   * exchange positions. It has to work on file://, where every page has an
   * opaque origin: so plain window.open / window.opener and postMessage('*'),
   * and each message is checked by shape and by which window sent it.
   *
   *   presenter -> deck   { type: 'hello' }           on load, then every 2 s
   *   deck -> presenter   { type: 'state', reply }    answer to hello
   *   either way          { type: 'state', id, step, blackout }   on any change
   *   deck -> presenter   ... the same message also carries `overview`: is the
   *                       overview grid what the audience sees right now?
   *   presenter -> deck   { type: 'cmd', cmd }        timer keys, O
   *   presenter -> deck   { type: 'pace', pace }      the elapsed timer, for safe keeping
   *   deck -> presenter   { type: 'pace', pace }      handed back to a presenter window
   *                                                   that says hello (see "pace" below)
   * ==================================================================== */

  var peer = null;          // the other window
  var lastLocalChange = 0;  // ms; stops a late 'hello' reply from undoing a fresh key press
  var lastHeard = 0;        // ms; presenter: when the deck last answered
  var peerOverview = false; // presenter: the deck window is showing its overview

  function post(msg) {
    if (!peer) { return; }
    try {
      if (peer.closed) { peer = null; return; }
      msg.__deck = 1;
      peer.postMessage(msg, '*');
    } catch (e) { /* the other window went away */ }
  }

  /**
   * Tell the other window where we are.
   * reply = true marks a message that is not news (an answer to hello, or a
   * change of the overview): the receiver treats it as catching up.
   */
  function sendState(reply) {
    var s = slides[state.index];
    if (!reply) { lastLocalChange = Date.now(); }
    post({ type: 'state', id: s ? s.id : null, step: state.step, blackout: state.blackout, overview: state.overview, reply: !!reply });
  }

  function onMessage(e) {
    var m = e.data;
    if (!m || m.__deck !== 1 || !e.source || e.source === window) { return; }

    if (mode.presenter) {
      if (e.source !== peer) { return; }
      lastHeard = Date.now();
    } else if (e.source !== peer) {
      // A presenter we do not know yet (for instance after this window was reloaded).
      if (m.type !== 'hello') { return; }
      peer = e.source;
    }

    if (m.type === 'hello' && !mode.presenter) {
      sendState(true);
      if (keptPace) { post({ type: 'pace', pace: keptPace }); }
      return;
    }

    if (m.type === 'state') {
      // The overview belongs to the deck window alone, so what it says about it is always true.
      if (mode.presenter && typeof m.overview === 'boolean' && m.overview !== peerOverview) {
        peerOverview = m.overview;
        renderPresenterFlags();
      }
      if (mode.presenter && m.reply && Date.now() - lastLocalChange < 800) { return; }
      if (m.id != null && Object.prototype.hasOwnProperty.call(indexById, m.id)) {
        var moved = go(indexById[m.id], m.step, { remote: true, catchUp: !!m.reply });
        // The presenter window moved on: the audience must see the slide, not a grid left open here.
        if (moved && !mode.presenter && state.overview) { setOverview(false); }
      }
      if (typeof m.blackout === 'boolean') { setBlackout(m.blackout, true); }
      return;
    }

    if (m.type === 'pace') {
      if (mode.presenter) { paceAdoptFromDeck(m.pace); }
      else { keepPace(m.pace); }
      return;
    }

    if (m.type === 'cmd' && !mode.presenter) {
      if (m.cmd === 'timer-toggle') { timerCommand('toggle'); }
      if (m.cmd === 'timer-reset') { timerCommand('reset'); }
      if (m.cmd === 'overview-toggle') { setOverview(!state.overview); }
    }
  }

  /**
   * The address of the presenter window. It has to build the SAME running
   * order as this window, so it gets every flag this window was opened with
   * (?demo, ?kit, ?debug, anything a slide file reads), except the three that
   * change what kind of page it is.
   */
  function presenterUrl() {
    var base = window.location.href.split('#')[0].split('?')[0];
    var flags = window.location.search.replace(/^\?/, '').split('&').filter(function (part) {
      var name = part.split('=')[0];
      return part !== '' && name !== 'presenter' && name !== 'print' && name !== 'fast';
    });
    var s = slides[state.index];
    return base + '?' + ['presenter'].concat(flags).join('&') + (s ? '#/' + encodeURIComponent(s.id) + '/' + state.step : '');
  }

  function openPresenter() {
    if (peer) {
      try { if (!peer.closed) { peer.focus(); return; } } catch (e) { /* fall through and reopen */ }
    }
    // 1280 x 820 fits a laptop screen; the presenter view lays itself out for any size.
    peer = window.open(presenterUrl(), 'deck-presenter', 'popup=yes,width=1280,height=820');
    if (!peer) { toast('The presenter window was blocked. Allow pop-ups for this page, then press S again.'); }
  }

  /*
   * "pace": the presenter view's elapsed timer, kept safe in the deck window.
   *
   * The timer runs in the presenter window, but that window is the one that
   * gets closed by accident. So it sends a copy of its timer here whenever the
   * timer changes (and every few seconds), and a presenter window that opens
   * later is handed that copy and carries on from it: closing and reopening
   * the presenter view does not lose the elapsed time. The copy also survives
   * a reload of this window (sessionStorage). Reset in the presenter view
   * clears it.
   */
  var keptPace = null;
  var KEPT_PACE_KEY = 'deck.pace.kept';

  function keepPace(snapshot) {
    keptPace = (snapshot && snapshot.started) ? snapshot : null;
    try {
      if (keptPace) { window.sessionStorage.setItem(KEPT_PACE_KEY, JSON.stringify(keptPace)); }
      else { window.sessionStorage.removeItem(KEPT_PACE_KEY); }
    } catch (e) { /* no storage: the copy still lives as long as this page does */ }
  }

  function recallKeptPace() {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(KEPT_PACE_KEY) || 'null');
      keptPace = (saved && saved.started) ? saved : null;
    } catch (e) { keptPace = null; }
  }

  /* ======================================================================
   * Things both windows can do
   * ==================================================================== */

  function setBlackout(on, remote) {
    on = !!on;
    if (state.blackout === on) { return; }
    state.blackout = on;
    doc.documentElement.classList.toggle('is-blackout', on);
    if (view) { view.refresh(); }
    if (!remote) { sendState(false); }
  }

  /** T and R: forwarded to the timer scene(s) on the current slide. */
  function timerCommand(method) {
    if (mode.presenter) { post({ type: 'cmd', cmd: 'timer-' + method }); return; }
    if (!live) { return; }
    live.scenes.forEach(function (s) {
      if (s.name !== 'timer' || typeof s.inst[method] !== 'function') { return; }
      safe('scene "timer" ' + method + '()', live.slide.id, function () { s.inst[method](); });
    });
  }

  /*
   * Keep the screen awake. A ten minute exercise timer is long enough for a
   * laptop to dim or sleep. Uses the Screen Wake Lock API where the browser
   * has it; does nothing, silently, where it does not.
   */
  var wakeLock = null;
  var wakeLockAsked = false;     // a request is in flight

  function keepAwake() {
    if (wakeLock || wakeLockAsked || !navigator.wakeLock || doc.visibilityState !== 'visible') { return; }
    try {
      wakeLockAsked = true;
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLockAsked = false;
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }, function () { wakeLockAsked = false; /* refused: battery saver, no permission */ });
    } catch (e) { wakeLockAsked = false; /* not available here */ }
  }

  function installKeepAwake() {
    keepAwake();
    doc.addEventListener('visibilitychange', keepAwake);   // the lock is dropped when the tab is hidden
    doc.addEventListener('keydown', keepAwake);            // some browsers want a user gesture first
    doc.addEventListener('pointerdown', keepAwake);
  }

  function toggleFullscreen() {
    var p;
    try {
      if (doc.fullscreenElement) { p = doc.exitFullscreen(); }
      else if (doc.documentElement.requestFullscreen) { p = doc.documentElement.requestFullscreen(); }
    } catch (e) { /* not allowed here; nothing to do */ }
    if (p && p.catch) { p.catch(function () {}); }
  }

  /* -------------------------------------------- "type a number, press Enter" */

  var jumpBuffer = '';
  var jumpTimer = null;
  var toastTimer = null;

  /** A short message in the corner chip (the same chip that shows typed slide numbers). */
  function toast(text) {
    if (!ui.jump) { return; }
    jumpBuffer = '';
    clearTimeout(jumpTimer);
    clearTimeout(toastTimer);
    ui.jump.textContent = text;
    ui.jump.hidden = false;
    toastTimer = setTimeout(function () { if (!jumpBuffer) { ui.jump.hidden = true; } }, 6000);
  }

  function showJump() {
    clearTimeout(jumpTimer);
    clearTimeout(toastTimer);
    if (ui.jump) {
      ui.jump.textContent = jumpBuffer ? 'Go to slide ' + jumpBuffer + ' \u21b5' : '';
      ui.jump.hidden = !jumpBuffer;
    }
    if (jumpBuffer) { jumpTimer = setTimeout(function () { jumpBuffer = ''; showJump(); }, 4000); }
  }

  /* ======================================================================
   * Keyboard
   * ==================================================================== */

  var TEXT_INPUT_TYPES = /^(text|search|url|tel|email|password|number|date|datetime-local|month|time|week|)$/i;

  function isTextEntry(node) {
    if (!node || node.nodeType !== 1) { return false; }
    if (node.isContentEditable) { return true; }
    var tag = node.tagName;
    if (tag === 'TEXTAREA') { return true; }
    return tag === 'INPUT' && TEXT_INPUT_TYPES.test(node.getAttribute('type') || '');
  }

  /** Keys typed here belong to the element, not to the deck. */
  function ownsKeys(node) {
    if (!node || node.nodeType !== 1) { return false; }
    if (node.isContentEditable) { return true; }
    return !!node.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-keys="own"]');
  }

  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) { return; }
    var target = e.target;
    if (ownsKeys(target)) {
      // One courtesy: Escape leaves a text field and hands the keyboard back to the deck.
      if (e.key === 'Escape' && isTextEntry(target) && !target.closest('[data-keys="own"]')) { target.blur(); }
      return;
    }
    // Space or Enter on a focused button or link activates it, as usual. It does not also advance.
    if ((e.key === ' ' || e.key === 'Enter') && target && target.closest && target.closest('button, a[href], summary, [role="button"]')) { return; }
    if (handleKey(e.key, e.shiftKey)) { e.preventDefault(); }
  }

  /** Returns true when the key was used. */
  function handleKey(key, shift) {
    // --- slide number entry: digits, then Enter ---
    if (/^[0-9]$/.test(key)) { jumpBuffer = (jumpBuffer + key).slice(0, 4); showJump(); return true; }
    if (jumpBuffer) {
      if (key === 'Enter') {
        var n = parseInt(jumpBuffer, 10);
        jumpBuffer = ''; showJump();
        if (state.overview) { setOverview(false); }
        if (state.blackout) { setBlackout(false); }
        go(n - 1, 0, {});
        return true;
      }
      if (key === 'Escape') { jumpBuffer = ''; showJump(); return true; }
      if (key === 'Backspace') { jumpBuffer = jumpBuffer.slice(0, -1); showJump(); return true; }
    }

    if (state.overview) { return overviewKey(key); }

    var k = key.length === 1 ? key.toLowerCase() : key;
    var isNext = k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === 'Enter' || ((k === ' ' || k === 'Spacebar') && !shift);
    var isPrev = k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace' || ((k === ' ' || k === 'Spacebar') && shift);

    // --- blackout: B or "." toggles; while black, a next/back key only brings the picture back ---
    if (k === 'b' || k === '.') { setBlackout(!state.blackout); return true; }
    if (state.blackout && (isNext || isPrev)) { setBlackout(false); return true; }

    if (isNext) { next(); return true; }
    if (isPrev) { prev(); return true; }

    switch (k) {
      case 'Home': go(0, 0, {}); return true;
      case 'End': go(slides.length - 1, 0, {}); return true;
      case 'f': toggleFullscreen(); return true;
      case 't': timerCommand('toggle'); return true;
      case 'r': timerCommand('reset'); return true;
    }

    if (mode.presenter) {
      if (k === '+' || k === '=') { presenterNotesSize(+4); return true; }
      if (k === '-' || k === '_') { presenterNotesSize(-4); return true; }
      return false;
    }

    switch (k) {
      case 'o': case 'Escape': setOverview(true); return true;
      case 's': openPresenter(); return true;
      case 'n': setNotes(!state.notes); return true;
      case 'p': setProgress(!state.progress); return true;
    }
    return false;
  }

  /* ======================================================================
   * STAGE VIEW: the deck window
   * ==================================================================== */

  var stageView = {
    showSlide: function (index, step, dir, opts) {
      finishLeave();                                  // never more than two slides in the DOM
      var outgoing = live;
      var instant = !!opts.instant || !outgoing;
      var duration = instant ? 0 : slideDuration();
      ui.stage.setAttribute('data-dir', dir < 0 ? 'back' : 'forward');

      // Reveal animations play when you arrive at step 0 going forward.
      // Arriving anywhere else (going back, a reload, a jump) shows the state at once.
      live = mountSlide(slides[index], step, ui.slides, step === 0 && !opts.instant);

      if (duration > 0) {
        void live.el.offsetWidth;                     // commit the starting style so the fade runs
        live.el.classList.remove('no-anim');
        live.el.classList.add('is-current');
      } else {
        live.el.classList.add('is-current');
        void live.el.offsetWidth;
        live.el.classList.remove('no-anim');
      }

      if (outgoing) {
        outgoing.el.classList.remove('is-current');
        outgoing.el.classList.add('is-leaving');
        leaving = outgoing;
        if (duration > 0) {
          // Hooks for the theme: a class on the stage and a fresh, empty block
          // above both slides, for the length of the transition.
          ui.transition = h('div', 'deck-transition');
          ui.transition.setAttribute('data-dir', dir < 0 ? 'back' : 'forward');
          ui.stage.insertBefore(ui.transition, ui.progress);
          ui.stage.classList.add('is-transitioning');
          leaveTimer = setTimeout(finishLeave, duration + 40);
        } else {
          finishLeave();
        }
      }
    },

    showStep: function (step, dir) {
      if (!live) { return; }
      live.step = step;
      live.ctx.step = step;
      applySteps(live.el, step);
      updateCounters(live.el, true);
      var def = live.slide.def;
      safe('step()', live.slide.id, function () { if (def.step) { def.step(live.ctx, step, dir); } });
      eachScene(live, 'step', [step, dir]);
    },

    refresh: function () {
      // where we are, as attributes the theme can select on
      var s = slides[state.index];
      if (s && ui.stage) {
        ui.stage.setAttribute('data-current-slide', s.id);
        ui.stage.setAttribute('data-current-act', s.act);
        ui.stage.setAttribute('data-current-layout', s.layout);
        ui.stage.setAttribute('data-current-step', state.step);
      }
      renderProgress();
      renderNotesOverlay();
      markOverview();
    }
  };

  /**
   * Length of the slide transition in ms (0 in ?fast). Read from the CSS
   * variable --deck-slide-duration through a hidden probe element, so the
   * theme can write it as 400ms, 0.4s, var(--d-base) or a calc().
   */
  function slideDuration() {
    if (mode.fast) { return 0; }
    var seconds = parseFloat(window.getComputedStyle(ui.probe).transitionDuration);
    return isNaN(seconds) ? 400 : Math.round(seconds * 1000);
  }

  /** The transition is over: run exit() on the old slide, destroy its scenes, remove it. */
  function finishLeave() {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    if (ui.transition) {
      if (ui.transition.parentNode) { ui.transition.parentNode.removeChild(ui.transition); }
      ui.transition = null;
      ui.stage.classList.remove('is-transitioning');
    }
    if (!leaving) { return; }
    var rec = leaving;
    leaving = null;
    destroyRecord(rec);
  }

  function buildStage() {
    var root = doc.getElementById('deck') || doc.body.appendChild(h('div'));
    root.id = 'deck';
    root.className = 'deck-viewport';
    root.textContent = '';
    ui.root = root;

    ui.stage = h('div', 'deck-stage');
    ui.slides = h('div', 'deck-slides');
    ui.probe = h('div', 'deck-probe');
    ui.stage.appendChild(ui.slides);
    ui.stage.appendChild(ui.probe);
    buildProgress();
    root.appendChild(ui.stage);

    // prev / next buttons: fade in at the bottom corners when the mouse moves
    ui.navPrev = navButton('deck-nav deck-nav-prev', 'Previous', '\u2039', prev);
    ui.navNext = navButton('deck-nav deck-nav-next', 'Next', '\u203a', next);
    root.appendChild(ui.navPrev);
    root.appendChild(ui.navNext);

    ui.notes = h('aside', 'deck-notes-overlay');
    ui.notes.hidden = true;
    root.appendChild(ui.notes);

    ui.overview = h('div', 'deck-overview');
    ui.overview.hidden = true;
    ui.overviewBody = h('div', 'deck-overview-body');
    ui.overview.appendChild(ui.overviewBody);
    ui.overview.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.deck-overview-item') : null;
      if (!item) { return; }
      setOverview(false);
      go(Number(item.getAttribute('data-index')), 0, { instant: true });
    });
    root.appendChild(ui.overview);

    ui.jump = h('div', 'deck-jump');
    ui.jump.hidden = true;
    root.appendChild(ui.jump);

    ui.blackout = h('div', 'deck-blackout');
    root.appendChild(ui.blackout);

    if (!slides.length) {
      ui.slides.appendChild(h('div', 'deck-empty', 'No slides are registered. Add Deck.slide({...}) calls in deck/slides/.'));
    }

    layoutStage();
    window.addEventListener('resize', onResize);
    doc.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('message', onMessage);
    doc.addEventListener('mousemove', wakeMouse);
    installFocusManners(root);
    installTouch(root);
    installKeepAwake();
  }

  function navButton(className, label, glyph, action) {
    var b = h('button', className, glyph);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', function () { action(); b.blur(); });
    return b;
  }

  /* ---------------------------------------------------- stage scaling */

  function layoutStage() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    stageScale = Math.min(vw / STAGE_W, vh / STAGE_H) || 1;
    var x = Math.round((vw - STAGE_W * stageScale) / 2);
    var y = Math.round((vh - STAGE_H * stageScale) / 2);
    ui.stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + stageScale + ')';
    ui.root.style.setProperty('--deck-scale', stageScale);
  }

  var resizeQueued = false;

  function onResize() {
    if (resizeQueued) { return; }
    resizeQueued = true;
    var run = function () {
      if (!resizeQueued) { return; }
      resizeQueued = false;
      layoutStage();
      if (live) { eachScene(live, 'resize'); }
      if (leaving) { eachScene(leaving, 'resize'); }
    };
    window.requestAnimationFrame(run);
    setTimeout(run, 120);         // rAF does not fire in a hidden tab
  }

  /* ----------------------------------------------------------- progress */

  /* The markup built here is documented in deck.css, section 6. */
  function buildProgress() {
    ui.progress = h('div', 'deck-progress');
    ui.progress.setAttribute('aria-hidden', 'true');

    var track = h('div', 'deck-progress-track');
    ui.progressFills = [];        // one per act
    ui.progressTicks = [];        // one per slide, in running order
    groups.forEach(function (g) {
      var seg = h('div', 'deck-progress-act');
      seg.setAttribute('data-act', g.act);
      seg.style.flexGrow = g.count;
      var fill = h('div', 'deck-progress-fill');
      var ticks = h('div', 'deck-progress-ticks');
      for (var i = 0; i < g.count; i++) {
        var tick = h('i', 'deck-progress-tick');
        ticks.appendChild(tick);
        ui.progressTicks.push(tick);
      }
      seg.appendChild(fill);
      seg.appendChild(ticks);
      track.appendChild(seg);
      ui.progressFills.push(fill);
    });

    var label = h('div', 'deck-progress-label');
    ui.progressActNum = h('span', 'deck-progress-actnum');
    ui.progressActName = h('span', 'deck-progress-actname');
    label.appendChild(ui.progressActNum);
    label.appendChild(ui.progressActName);

    var num = h('div', 'deck-progress-num');
    ui.progressCurrent = h('span', 'deck-progress-current');
    num.appendChild(ui.progressCurrent);
    num.appendChild(h('span', 'deck-progress-sep', ' / '));
    num.appendChild(h('span', 'deck-progress-total', String(slides.length)));   // counted, never typed

    ui.progress.appendChild(track);
    ui.progress.appendChild(label);
    ui.progress.appendChild(num);
    ui.stage.appendChild(ui.progress);
  }

  function renderProgress() {
    if (!ui.progress) { return; }
    var s = slides[state.index];
    if (!s) { return; }
    var actName = (config.acts && config.acts[s.act]) || '';

    // Position in "slides reached", with builds counted as fractions of a slide.
    var pos = state.index + 1 - (s.steps ? (s.steps - state.step) / (s.steps + 1) : 0);
    groups.forEach(function (g, i) {
      var frac = clamp((pos - g.first) / g.count, 0, 1);
      ui.progressFills[i].style.width = (frac * 100).toFixed(2) + '%';
      ui.progressFills[i].parentNode.classList.toggle('is-current', state.index >= g.first && state.index < g.first + g.count);
    });
    ui.progressTicks.forEach(function (tick, i) {
      tick.classList.toggle('is-done', i < state.index);
      tick.classList.toggle('is-current', i === state.index);
    });

    ui.progressActNum.textContent = s.act;
    ui.progressActName.textContent = actName;
    ui.progressCurrent.textContent = state.index + 1;
    ui.progress.setAttribute('data-act', s.act);
    ui.progress.setAttribute('data-act-name', actName);
    ui.progress.setAttribute('data-index', state.index + 1);
    ui.progress.setAttribute('data-total', slides.length);
    ui.progress.classList.toggle('is-hidden', !state.progress);
  }

  function setProgress(on) {
    state.progress = !!on;
    renderProgress();
  }

  /* ------------------------------------------------- in-window notes (N) */

  function setNotes(on) {
    state.notes = !!on;
    renderNotesOverlay();
  }

  function renderNotesOverlay() {
    if (!ui.notes) { return; }
    ui.notes.hidden = !state.notes;
    if (!state.notes) { return; }
    var s = slides[state.index];
    ui.notes.innerHTML = '<div class="deck-notes-head">' + escapeHtml(s ? (state.index + 1) + ' \u00b7 ' + s.title : '') +
      '<span>N to close</span></div>' + notesHtml(s ? s.notes : '');
  }

  /* ----------------------------------------------------------- overview */

  var overviewBuilt = false;
  var overviewSel = 0;

  function buildOverview() {
    overviewBuilt = true;
    ui.overviewBody.textContent = '';
    ui.overviewItems = [];
    groups.forEach(function (g) {
      var section = h('section', 'deck-overview-act');
      section.appendChild(h('h2', 'deck-overview-heading', actLabel(g.act)));
      var grid = h('div', 'deck-overview-grid');
      for (var i = g.first; i < g.first + g.count; i++) {
        var item = h('div', 'deck-overview-item');
        item.setAttribute('role', 'button');
        item.setAttribute('data-index', i);
        item.setAttribute('aria-label', 'Slide ' + (i + 1) + ': ' + slides[i].title);
        item.appendChild(makeThumb(slides[i], slides[i].steps));
        var caption = h('div', 'deck-overview-caption');
        caption.appendChild(h('span', 'deck-overview-num', String(i + 1)));
        caption.appendChild(h('span', 'deck-overview-title', slides[i].title));
        item.appendChild(caption);
        grid.appendChild(item);
        ui.overviewItems.push(item);
      }
      section.appendChild(grid);
      ui.overviewBody.appendChild(section);
    });
  }

  function setOverview(on) {
    on = !!on;
    if (state.overview === on || !ui.overview) { return; }
    state.overview = on;
    if (on && !overviewBuilt) { buildOverview(); }
    ui.overview.hidden = !on;
    ui.root.classList.toggle('is-overview', on);
    if (on) {
      overviewSel = Math.max(0, state.index);
      markOverview();
      var item = ui.overviewItems[overviewSel];
      if (item && item.scrollIntoView) { item.scrollIntoView({ block: 'center' }); }
    }
  }

  function markOverview() {
    if (!overviewBuilt || !state.overview) { return; }
    ui.overviewItems.forEach(function (item, i) {
      item.classList.toggle('is-current', i === state.index);
      item.classList.toggle('is-selected', i === overviewSel);
    });
  }

  function overviewSelect(i) {
    overviewSel = clamp(i, 0, ui.overviewItems.length - 1);
    markOverview();
    var item = ui.overviewItems[overviewSel];
    if (item && item.scrollIntoView) { item.scrollIntoView({ block: 'nearest' }); }
  }

  /** Up / down: the nearest thumbnail in the row above / below, by position on screen. */
  function overviewRow(dy) {
    var items = ui.overviewItems;
    var from = items[overviewSel].getBoundingClientRect();
    var best = -1;
    var bestScore = Infinity;
    for (var i = 0; i < items.length; i++) {
      var r = items[i].getBoundingClientRect();
      var rows = (r.top - from.top) * dy;
      if (rows < 4) { continue; }
      var score = rows * 1000 + Math.abs(r.left - from.left);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best !== -1) { overviewSelect(best); }
  }

  function overviewKey(key) {
    var k = key.length === 1 ? key.toLowerCase() : key;
    switch (k) {
      case 'o': case 'Escape': setOverview(false); return true;
      case 'ArrowRight': overviewSelect(overviewSel + 1); return true;
      case 'ArrowLeft': overviewSelect(overviewSel - 1); return true;
      case 'ArrowDown': overviewRow(1); return true;
      case 'ArrowUp': overviewRow(-1); return true;
      case 'Home': overviewSelect(0); return true;
      case 'End': overviewSelect(slides.length - 1); return true;
      case 'Enter': case ' ':
        setOverview(false);
        go(overviewSel, 0, { instant: true });
        return true;
      case 'f': toggleFullscreen(); return true;
    }
    return false;
  }

  /* ------------------------------------------------- mouse, focus, touch */

  var mouseTimer = null;
  var mouseAt = null;

  /**
   * Mouse moved: show the pointer and the prev/next buttons for a moment.
   * Browsers also fire "mousemove" when the page changes under a pointer that
   * is standing still (every slide change, for one). Those carry the same
   * coordinates as before and are ignored, as is the very first event.
   */
  function wakeMouse(e) {
    var moved = mouseAt !== null && (e.screenX !== mouseAt.x || e.screenY !== mouseAt.y);
    mouseAt = { x: e.screenX, y: e.screenY };
    if (!moved) { return; }
    ui.root.classList.add('is-mouse-active');
    clearTimeout(mouseTimer);
    mouseTimer = setTimeout(function () { ui.root.classList.remove('is-mouse-active'); }, 2500);
  }

  /*
   * A clicker sends PageDown. If the last thing the presenter clicked was a
   * slider or a button inside a scene, that control would keep the keyboard
   * and the clicker would stop working. So: after a MOUSE interaction with a
   * control that is not a text field, focus goes back to the page.
   * Text fields keep focus (Escape leaves them). data-keys="own" opts out.
   */
  function installFocusManners(root) {
    function release() {
      var a = doc.activeElement;
      if (!a || a === doc.body || !root.contains(a)) { return; }
      if (isTextEntry(a) || a.tagName === 'SELECT' || a.closest('[data-keys="own"]')) { return; }
      a.blur();
    }
    doc.addEventListener('pointerup', function () { setTimeout(release, 0); }, true);

    // A <select> has to keep focus while its list is open, so it is released
    // when a choice is made, and only if it was opened with the mouse.
    var clicked = null;
    doc.addEventListener('pointerdown', function (e) { clicked = e.target; }, true);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Tab') { clicked = null; } }, true);
    doc.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'SELECT' || !root.contains(t) || t.closest('[data-keys="own"]')) { return; }
      if (clicked && (clicked === t || t.contains(clicked))) { t.blur(); }
    }, true);
  }

  var TOUCH_OWN = 'input, textarea, select, button, a[href], label, [contenteditable=""], [contenteditable="true"], [data-keys="own"], [data-touch="own"]';

  /** Touch: tap the left or right 15% of the window, or swipe sideways. */
  function installTouch(root) {
    var start = null;
    root.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { start = null; return; }
      var t = e.touches[0];
      var own = !!(e.target && e.target.closest && e.target.closest(TOUCH_OWN));
      start = { x: t.clientX, y: t.clientY, time: Date.now(), own: own };
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      var s = start;
      start = null;
      if (!s || s.own || state.overview || !e.changedTouches.length) { return; }
      var t = e.changedTouches[0];
      var dx = t.clientX - s.x;
      var dy = t.clientY - s.y;
      var ms = Date.now() - s.time;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && ms < 1000) {
        if (dx < 0) { next(); } else { prev(); }
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && ms < 600) {
        var w = window.innerWidth;
        if (t.clientX < w * 0.15) { prev(); }
        else if (t.clientX > w * 0.85) { next(); }
      }
    }, { passive: true });
    root.addEventListener('touchcancel', function () { start = null; }, { passive: true });
  }

  /* ======================================================================
   * PRESENTER VIEW: index.html?presenter (opened with S)
   *
   * No stage, no scenes. Notes, clocks and pacing, kept in step with the
   * deck window through the link above.
   * ==================================================================== */

  // The elapsed timer. Reads Motion.now() so tests can drive it with the manual clock.
  var pace = { started: false, running: false, banked: 0, since: 0, arrivedIndex: -1, arrivedAt: 0 };

  function paceNow() { return M ? M.now() : Date.now() / 1000; }
  function paceElapsed() { return pace.banked + (pace.running ? paceNow() - pace.since : 0); }
  function paceStart() { if (!pace.running) { pace.started = true; pace.running = true; pace.since = paceNow(); paceSave(); } }
  function pacePause() { if (pace.running) { pace.banked = paceElapsed(); pace.running = false; paceSave(); } }
  function paceReset() { pace.started = false; pace.running = false; pace.banked = 0; pace.arrivedIndex = -1; pace.arrivedAt = 0; paceSave(); }

  /* The elapsed time survives a reload of the presenter window (sessionStorage:
   * this window only, gone when it closes, so yesterday's rehearsal never comes back). */
  var PACE_KEY = 'deck.presenter.pace';

  function paceSave() {
    try {
      window.sessionStorage.setItem(PACE_KEY, JSON.stringify({
        started: pace.started, running: pace.running, banked: paceElapsed(), wall: Date.now()
      }));
    } catch (e) { /* storage not available: the timer just will not survive a reload */ }
  }

  function paceRestore() {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(PACE_KEY) || 'null');
      if (!saved || !saved.started) { return; }
      pace.started = true;
      pace.banked = Number(saved.banked) || 0;
      if (saved.running) {
        pace.banked += Math.max(0, (Date.now() - Number(saved.wall)) / 1000);   // the time the reload took
        pace.running = true;
        pace.since = paceNow();
      }
    } catch (e) { /* start from zero */ }
  }

  /** Planned start of slide i, in seconds: the minutes of every slide before it. */
  function plannedStart(i) {
    var minutes = 0;
    for (var k = 0; k < i && k < slides.length; k++) { minutes += slides[k].minutes; }
    return minutes * 60;
  }

  /** Everything the pacing panel shows, as data (also exposed to tests as __deck.pacing()). */
  function pacing() {
    var s = slides[state.index];
    var start = plannedStart(state.index);
    var end = start + (s ? s.minutes * 60 : 0);
    var elapsed = paceElapsed();
    var status = 'waiting';
    var delta = 0;
    if (pace.started) {
      if (elapsed < start) { status = 'ahead'; delta = start - elapsed; }
      else if (elapsed > end) { status = 'behind'; delta = elapsed - end; }
      else { status = 'on-pace'; delta = end - elapsed; }
    }
    return {
      started: pace.started, running: pace.running, elapsed: elapsed,
      plannedStart: start, plannedEnd: end, status: status, delta: delta,
      arrived: pace.arrivedIndex === state.index ? pace.arrivedAt - start : null
    };
  }

  /** '14:30' -> minutes since midnight, or null. */
  function parseClock(text) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function clockLabel(minutesSinceMidnight) {
    var m = ((Math.round(minutesSinceMidnight) % 1440) + 1440) % 1440;
    var hh = Math.floor(m / 60);
    return (hh % 12 || 12) + ':' + pad2(m % 60) + (hh >= 12 ? ' PM' : ' AM');
  }

  var NOTES_SIZE_KEY = 'deck.presenter.notesSize';
  var notesSize = 36;

  function presenterNotesSize(delta) {
    notesSize = clamp(notesSize + delta, 20, 96);
    if (ui.pvNotes) { ui.pvNotes.style.fontSize = notesSize + 'px'; }
    try { window.localStorage.setItem(NOTES_SIZE_KEY, String(notesSize)); } catch (e) { /* private mode, file:// quirks */ }
  }

  var presenterView = {
    showSlide: function (index, step, dir, opts) { presenterMoved(dir, opts, true); },
    showStep: function (step, dir, opts) { presenterMoved(dir, opts, false); },
    refresh: function () { renderPresenter(); }
  };

  function presenterMoved(dir, opts, slideChanged) {
    // The elapsed timer starts on the first advance, whichever window made it.
    // (Finding our place on load, or after a re-sync, is not an advance.)
    if (dir > 0 && !pace.started && !(opts && opts.catchUp)) { paceStart(); }
    if (slideChanged) { pace.arrivedIndex = state.index; pace.arrivedAt = paceElapsed(); }
  }

  function buildPresenter() {
    var root = doc.getElementById('deck') || doc.body.appendChild(h('div'));
    root.id = 'deck';
    root.className = 'deck-presenter';
    root.textContent = '';
    ui.root = root;

    try {
      var saved = Number(window.localStorage.getItem(NOTES_SIZE_KEY));
      if (saved >= 20 && saved <= 96) { notesSize = saved; }
    } catch (e) { /* keep the default */ }
    paceRestore();

    // --- top bar: where we are, and the wall clock
    var top = h('header', 'deck-pv-top');
    ui.pvPos = h('div', 'deck-pv-pos');
    var where = h('div', 'deck-pv-where');
    ui.pvAct = h('div', 'deck-pv-act');
    ui.pvTitle = h('div', 'deck-pv-title');
    where.appendChild(ui.pvAct);
    where.appendChild(ui.pvTitle);
    ui.pvClock = h('div', 'deck-pv-clock');
    top.appendChild(ui.pvPos);
    top.appendChild(where);
    top.appendChild(ui.pvClock);

    // --- left: notes
    ui.pvNotes = h('section', 'deck-pv-notes');
    ui.pvNotes.style.fontSize = notesSize + 'px';
    ui.pvNotes.setAttribute('aria-label', 'Speaker notes');

    // --- right: this slide, next slide, timer, pacing
    var side = h('aside', 'deck-pv-side');

    var nowCard = h('div', 'deck-pv-card deck-pv-now');
    ui.pvNowLabel = h('div', 'deck-pv-label');
    ui.pvNowThumb = h('div', 'deck-pv-thumb');
    nowCard.appendChild(ui.pvNowLabel);
    nowCard.appendChild(ui.pvNowThumb);

    var nextCard = h('div', 'deck-pv-card deck-pv-next');
    nextCard.appendChild(h('div', 'deck-pv-label', 'Next'));
    ui.pvNextTitle = h('div', 'deck-pv-next-title');
    ui.pvNextThumb = h('div', 'deck-pv-thumb');
    nextCard.appendChild(ui.pvNextTitle);
    nextCard.appendChild(ui.pvNextThumb);

    var timerCard = h('div', 'deck-pv-card deck-pv-timer');
    timerCard.appendChild(h('div', 'deck-pv-label', 'Elapsed'));
    ui.pvElapsed = h('button', 'deck-pv-elapsed', '0:00');
    ui.pvElapsed.type = 'button';
    ui.pvElapsed.title = 'Click to pause or resume';
    ui.pvElapsed.addEventListener('click', function () {
      if (pace.running) { pacePause(); } else { paceStart(); }
      ui.pvElapsed.blur();
      renderPresenterClock();
    });
    ui.pvElapsedHint = h('div', 'deck-pv-hint');
    var reset = h('button', 'deck-pv-btn deck-pv-reset', 'Reset');
    reset.type = 'button';
    reset.addEventListener('click', function () { paceReset(); reset.blur(); renderPresenterClock(); });
    timerCard.appendChild(ui.pvElapsed);
    timerCard.appendChild(reset);
    timerCard.appendChild(ui.pvElapsedHint);

    var paceCard = h('div', 'deck-pv-card deck-pv-pace');
    paceCard.appendChild(h('div', 'deck-pv-label', 'Pacing'));
    ui.pvPlanned = h('div', 'deck-pv-row');
    ui.pvActual = h('div', 'deck-pv-row');
    ui.pvStatus = h('div', 'deck-pv-status');
    paceCard.appendChild(ui.pvPlanned);
    paceCard.appendChild(ui.pvActual);
    paceCard.appendChild(ui.pvStatus);

    side.appendChild(nowCard);
    side.appendChild(nextCard);
    side.appendChild(timerCard);
    side.appendChild(paceCard);

    var main = h('main', 'deck-pv-main');
    main.appendChild(ui.pvNotes);
    main.appendChild(side);

    // --- bottom bar: buttons
    var bar = h('footer', 'deck-pv-bar');
    function barButton(cls, label, action) {
      var b = h('button', 'deck-pv-btn ' + cls, label);
      b.type = 'button';
      b.addEventListener('click', function () { action(); b.blur(); });
      bar.appendChild(b);
      return b;
    }
    barButton('deck-pv-prev', '\u2039 Back', prev);
    barButton('deck-pv-go', 'Next \u203a', next);
    ui.pvLink = h('span', 'deck-pv-link');
    bar.appendChild(ui.pvLink);
    ui.pvBlack = h('span', 'deck-pv-blackout', 'Screen is black (B)');
    ui.pvBlack.hidden = true;
    bar.appendChild(ui.pvBlack);
    bar.appendChild(h('span', 'deck-pv-spacer'));
    bar.appendChild(h('span', 'deck-pv-keys', 'Notes size'));
    barButton('deck-pv-smaller', 'A\u2212', function () { presenterNotesSize(-4); }).setAttribute('aria-label', 'Smaller notes');
    barButton('deck-pv-bigger', 'A+', function () { presenterNotesSize(+4); }).setAttribute('aria-label', 'Larger notes');

    root.appendChild(top);
    root.appendChild(main);
    root.appendChild(bar);

    ui.jump = h('div', 'deck-jump');
    ui.jump.hidden = true;
    root.appendChild(ui.jump);

    if (!slides.length) { ui.pvNotes.textContent = 'No slides are registered.'; }

    // --- wiring
    peer = window.opener || null;
    doc.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('message', onMessage);
    window.addEventListener('resize', fitPresenterThumbs);
    post({ type: 'hello' });
    setInterval(function () { post({ type: 'hello' }); }, 2000);
    setInterval(renderPresenterClock, 250);
    setInterval(paceSave, 10000);
    window.addEventListener('pagehide', paceSave);
    installKeepAwake();
  }

  /** Thumbnails are 1920x1080 slides scaled by CSS; tell the CSS how wide the box is. */
  function fitPresenterThumbs() {
    [ui.pvNowThumb, ui.pvNextThumb].forEach(function (box) {
      if (!box) { return; }
      var w = box.clientWidth;
      if (w) { box.style.setProperty('--deck-thumb-w', w); }
    });
  }

  function renderPresenter() {
    var s = slides[state.index];
    if (!s || !ui.pvNotes) { return; }
    var upcoming = slides[state.index + 1];

    ui.pvPos.innerHTML = '<span class="deck-pv-num">' + (state.index + 1) + '</span><span class="deck-pv-total"> / ' + slides.length + '</span>';
    ui.pvAct.textContent = actLabel(s.act);
    ui.pvTitle.textContent = s.title;
    // Rewrite the notes only when the slide changes, so a build step does not
    // throw away how far down the speaker has scrolled.
    if (ui.pvNotesFor !== s.id) {
      ui.pvNotesFor = s.id;
      ui.pvNotes.innerHTML = notesHtml(s.notes);
      ui.pvNotes.scrollTop = 0;
    }

    ui.pvNowLabel.textContent = 'On screen' + (s.steps ? ' \u00b7 build ' + state.step + ' of ' + s.steps : '');
    ui.pvNowThumb.textContent = '';
    ui.pvNowThumb.appendChild(makeThumb(s, state.step));

    ui.pvNextThumb.textContent = '';
    if (state.step < s.steps) {
      ui.pvNextTitle.textContent = 'Build ' + (state.step + 1) + ' of ' + s.steps + (upcoming ? ', then: ' + upcoming.title : '');
      ui.pvNextThumb.appendChild(makeThumb(s, state.step + 1));
    } else if (upcoming) {
      ui.pvNextTitle.textContent = upcoming.title;
      ui.pvNextThumb.appendChild(makeThumb(upcoming, 0));
    } else {
      ui.pvNextTitle.textContent = 'End of deck';
    }
    ui.pvBlack.hidden = !state.blackout;
    fitPresenterThumbs();
    renderPresenterClock();
  }

  function renderPresenterClock() {
    if (!ui.pvClock) { return; }
    ui.pvClock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

    var p = pacing();
    ui.pvElapsed.textContent = mmss(p.elapsed);
    ui.pvElapsed.setAttribute('data-state', p.running ? 'running' : (p.started ? 'paused' : 'idle'));
    ui.pvElapsedHint.textContent = p.running ? 'Running. Click the time to pause.'
      : (p.started ? 'Paused. Click the time to resume.' : 'Starts on your first advance.');

    var startClock = parseClock(config.startClock);
    var wall = startClock == null ? '' : ' \u00b7 ' + clockLabel(startClock + p.plannedStart / 60);
    ui.pvPlanned.innerHTML = '<span>Planned</span><b>' + mmss(p.plannedStart) + ' \u2192 ' + mmss(p.plannedEnd) + escapeHtml(wall) + '</b>';
    var arrived = '';
    if (p.started && p.arrived != null) {
      arrived = Math.abs(p.arrived) < 1 ? ' \u00b7 arrived on time'
        : ' \u00b7 arrived ' + mmss(Math.abs(p.arrived)) + (p.arrived > 0 ? ' late' : ' early');
    }
    ui.pvActual.innerHTML = '<span>Actual</span><b>' + mmss(p.elapsed) + escapeHtml(arrived) + '</b>';

    var text = 'Timer has not started';
    if (p.status === 'ahead') { text = 'Ahead by ' + mmss(p.delta); }
    if (p.status === 'behind') { text = 'Behind by ' + mmss(p.delta); }
    if (p.status === 'on-pace') { text = 'On pace \u00b7 ' + mmss(p.delta) + ' left on this slide'; }
    ui.pvStatus.textContent = text;
    ui.pvStatus.setAttribute('data-status', p.status);

    var linked = !!peer && Date.now() - lastHeard < 5000;
    ui.pvLink.textContent = linked ? 'Linked to the deck' : 'Not linked. Open this view from the deck with S.';
    ui.pvLink.setAttribute('data-linked', linked ? 'yes' : 'no');
  }

  /* ======================================================================
   * PRINT VIEW: index.html?print
   *
   * Every slide in the running order, at its final step, one per page.
   * Scenes are mounted and stepped to the last step. tools/export-pdf.js
   * turns this page into dist/deck.pdf.
   * ==================================================================== */

  function buildPrint() {
    var root = doc.getElementById('deck') || doc.body.appendChild(h('div'));
    root.id = 'deck';
    root.className = 'deck-print';
    root.textContent = '';
    ui.root = root;
    slides.forEach(function (slide) {
      var page = h('div', 'deck-print-page');
      root.appendChild(page);
      var rec = mountSlide(slide, slide.steps, page, false);
      rec.el.classList.add('is-current');
      void rec.el.offsetWidth;
      rec.el.classList.remove('no-anim');
      printed.push(rec);
    });
    state.index = slides.length ? 0 : -1;
    state.step = slides.length ? slides[0].steps : 0;
  }

  /* ======================================================================
   * Test hooks: window.__deck
   * ==================================================================== */

  /**
   * Resolves (true) once finite CSS animations/transitions, finite Motion
   * tweens and the slide cross-fade have finished; (false) after 5 s.
   * Infinite loops are ignored.
   */
  function settle() {
    var startedAt = Date.now();
    return new Promise(function (resolve) {
      var calmFrames = 0;

      function busy() {
        if (leaving) { return true; }
        if (M && M.pending() > 0) { return true; }
        var list = doc.getAnimations ? doc.getAnimations() : [];
        for (var i = 0; i < list.length; i++) {
          var a = list[i];
          if (a.playState !== 'running') { continue; }
          var timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
          if (!timing || isFinite(timing.endTime)) { return true; }
        }
        return false;
      }

      function check() {
        if (Date.now() - startedAt > 5000) { resolve(false); return; }
        calmFrames = busy() ? 0 : calmFrames + 1;
        if (calmFrames >= 2) { resolve(true); return; }
        nextFrame(check);
      }

      // rAF, with a timeout behind it for windows that are not being painted
      function nextFrame(fn) {
        var done = false;
        function once() { if (!done) { done = true; fn(); } }
        window.requestAnimationFrame(once);
        setTimeout(once, 60);
      }

      var fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
      fonts.then(check, check);
    });
  }

  var hooks = {
    count: function () { return slides.length; },
    ids: function () { return slides.map(function (s) { return s.id; }); },
    stepsOf: function (i) {
      var s = slides[resolveIndex(i)];
      return s ? s.steps : 0;
    },
    /** goto(indexOrId, step): index is 0-based. Returns a promise that resolves when the slide has settled. */
    goto: function (indexOrId, step) {
      var i = resolveIndex(indexOrId);
      if (i < 0 || i >= slides.length) { return Promise.reject(new Error('__deck.goto: no slide "' + indexOrId + '"')); }
      if (!mode.print) {
        if (state.overview) { setOverview(false); }
        go(i, step || 0, { instant: true });
      }
      return settle();
    },
    current: function () {
      var c = current();
      return { index: c.index, id: c.id, step: c.step, steps: c.steps };
    },
    settle: settle,
    // extras used by tools/
    errors: function () { return errors.slice(); },
    mode: function () { return { fast: mode.fast, print: mode.print, presenter: mode.presenter, debug: mode.debug }; },
    scale: function () { return stageScale; },
    info: function (i) {
      var s = slides[resolveIndex(i)];
      return s ? { id: s.id, act: s.act, title: s.title, minutes: s.minutes, steps: s.steps, notes: s.notes } : null;
    },
    mounted: function () {
      var recs = mode.print ? printed : [live, leaving].filter(Boolean);
      return recs.map(function (r) { return { id: r.slide.id, scenes: r.scenes.map(function (s) { return s.name; }) }; });
    },
    scene: function (name) {     // the first mounted scene instance with that name, for tests
      var recs = mode.print ? printed : [live].filter(Boolean);
      for (var i = 0; i < recs.length; i++) {
        for (var k = 0; k < recs[i].scenes.length; k++) {
          if (recs[i].scenes[k].name === name) { return recs[i].scenes[k].inst; }
        }
      }
      return null;
    },
    pacing: pacing,
    blackout: function () { return state.blackout; },
    overview: function () { return state.overview; }
  };

  /* ======================================================================
   * Public API
   * ==================================================================== */

  /**
   * Deck.config({
   *   title: 'The talk',                       document title
   *   startClock: '14:30',                     session start (24-hour); the presenter view shows planned clock times
   *   acts: ['Walk-in', 'The Bandwagon', ...], act names by number: overview headings, presenter view, progress label
   *   counters: { duration: 1.5, ease: 'outExpo', steps: 12 }   deck-wide defaults for data-count-to
   * })
   * Call it before Deck.start(). It may be called more than once; later keys win.
   */
  function configure(opts) {
    opts = opts || {};
    Object.keys(opts).forEach(function (key) { config[key] = opts[key]; });
    if (config.title && !mode.presenter) { doc.title = config.title; }
    if (config.title && mode.presenter) { doc.title = 'Presenter \u00b7 ' + config.title; }
    return Deck;
  }

  function start() {
    if (started) { return Deck; }
    if (!doc.body) {
      doc.addEventListener('DOMContentLoaded', start);
      return Deck;
    }
    started = true;
    buildRunningOrder();

    var html = doc.documentElement;
    html.classList.add('deck-on');
    html.classList.add(mode.print ? 'mode-print' : (mode.presenter ? 'mode-presenter' : 'mode-stage'));
    if (mode.fast) { html.classList.add('mode-fast'); }
    if (mode.debug) { html.classList.add('mode-debug'); }
    if (mode.fast && M) { M.timeScale = 20; }

    if (mode.print) {
      safe('engine (print)', null, buildPrint);
    } else {
      view = mode.presenter ? presenterView : stageView;
      safe('engine (build)', null, mode.presenter ? buildPresenter : buildStage);
      if (slides.length) {
        var at = parseHash() || { index: 0, step: 0 };
        go(at.index, at.step, { instant: true, remote: true, catchUp: true });
        if (mode.presenter) { renderPresenter(); }
      }
    }
    if (errors.length && mode.debug) { renderBadge(); }
    emit('start', current());
    return Deck;
  }

  var Deck = {
    slide: registerSlide,
    config: configure,
    start: start,

    next: next,
    prev: prev,
    /** Deck.goto(indexOrId, step): 0-based index or slide id. */
    goto: function (indexOrId, step) {
      var i = resolveIndex(indexOrId);
      return i >= 0 && go(i, step || 0, {});
    },
    current: current,
    count: function () { return slides.length; },

    fitCanvas: fitCanvas,
    /** Deck.on('change', fn(current, { dir, remote })) and Deck.on('start', fn). Returns an unsubscribe function. */
    on: function (type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      return function () {
        var list = listeners[type] || [];
        var i = list.indexOf(fn);
        if (i !== -1) { list.splice(i, 1); }
      };
    },

    mode: mode,
    errors: errors,
    stage: { width: STAGE_W, height: STAGE_H }
  };
  Object.defineProperty(Deck.stage, 'scale', { enumerable: true, get: function () { return stageScale; } });

  window.Deck = Deck;
  window.Scenes = Scenes;
  window.__deck = hooks;
}());
