/*
 * scenes/title.js: the sleeve front.  ->  Scenes 'title', window.TitleScene, window.SleeveFX
 *
 * One scene, two modes, both pure functions of time on the Motion clock:
 *
 *   mode "walkin"  the vamp. Four gates on the right field count in and never
 *                  resolve: one, two, three pass, and the fourth bay is held
 *                  vacant (NOT YET, the frame only). The NO is the title's.
 *                  Most of the loop holds that picture, which is also the
 *                  static card; then the three shutters roll up, the dock
 *                  rests empty, and the gates are examined and pass again.
 *                  A 32 second loop (16 bars at 120 BPM) whose first and last
 *                  frames are the same frame, so there is no seam. It enters
 *                  on its first frame, the finished picture. One live line
 *                  counts down to the start.
 *   mode "build"   the title film, 8 seconds, once: the stack arrives behind
 *                  blocks on the swung off-beat, the gates rise shut, three
 *                  open, the fourth tries and cannot, and the slab drops with
 *                  NO printed on it. Stop-time in negative, then the fine print.
 *
 * The scene does not draw the card. The card is ordinary slide markup in the
 * theme's "title" layout (so the overview, the presenter view and the PDF show
 * the real thing); the scene is a hidden driver element inside that slide:
 *
 *     Deck.slide({ id: 'title', layout: 'title', html: TitleScene.markup('build') })
 *
 * TitleScene.markup(mode) writes the card from window.YOUR (speaker, event).
 *
 * Video capture, frame-exact (the film is a finite tween that starts when the
 * slide enters; the loop reads Motion.now()):
 *
 *     open  index.html#/cold-open/1
 *     Motion.useManualClock(0);
 *     window.__deck.goto('title', 0);     // do not wait on its promise: time is frozen
 *     Motion.setTime(t);                  // t = 0 .. TitleScene.film.duration (8 s)
 *
 * The walk-in loop the same way with 'walk-in' (from any other slide); one
 * turn of it is TitleScene.loop.period seconds (32) and frame 0 = frame 32.
 *
 * Also here, because the Act 1 slides share it: window.SleeveFX, the few
 * kinetic moves of the direction as functions of progress (block reveal,
 * voice wipe, drop) and a tiny "play this render function for N seconds".
 *
 * THE ONE PLACE THAT READS THE WALL CLOCK. The countdown has to be true, so it
 * reads Date.now(), not Motion.now(): a laptop that slept, or ?fast, must not
 * move the start time. Under a manual Motion clock (video capture) the wall
 * time is frozen at mount and advanced by the Motion clock, so frames repeat.
 * For a rehearsal, set  window.TitleScene.testNow = '2026-11-13T14:18:30'
 * before the slide enters.
 */
(function () {
  'use strict';

  var doc = document;
  var M = window.Motion || null;
  var THEME = window.THEME || null;

  /* ======================================================================
   * Easing and small helpers
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

  var te = (THEME && THEME.motion && THEME.motion.ease) || {};
  var arrive = typeof te.arrive === 'function' ? te.arrive : bezier(0.16, 1, 0.3, 1);
  var lift = typeof te.lift === 'function' ? te.lift : bezier(0.2, 0.8, 0.2, 1);
  var drop = typeof te.drop === 'function' ? te.drop : bezier(0.55, 0, 1, 0.45);

  /* 120 BPM. Every time below is a note value. */
  var BEAT = 0.5, SWING = 1 / 3, EIGHTH = 0.25, SIXTEENTH = 0.125, DROP = 0.375;

  /** Progress 0..1 of a move that starts at `start` and lasts `dur`. */
  function seg(t, start, dur) {
    var p = (t - start) / dur;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }

  /* ======================================================================
   * SleeveFX: the direction's moves, as functions of progress
   * ----------------------------------------------------------------------
   * Nothing fades. A display line arrives behind a block; a Fraunces line
   * wipes; a block drops. Each helper sets the state for a progress value,
   * so a slide's entrance is one render(t) function and can be frozen on any
   * frame. With no call at all an element is in its final state.
   * ==================================================================== */

  var FX = {
    BEAT: BEAT, SWING: SWING, EIGHTH: EIGHTH, SIXTEENTH: SIXTEENTH, DROP: DROP,
    arrive: arrive, lift: lift, drop: drop, seg: seg,

    /**
     * Block reveal at local time t for a line that starts at `start`: a bar of
     * the line's own ink runs across it in a sixteenth, then the bar's left
     * edge retreats in an eighth and leaves the line behind.
     */
    block: function (el, t, start) {
      if (!el) { return; }
      var g = arrive(seg(t, start, SIXTEENTH));
      var r = arrive(seg(t, start + SIXTEENTH, EIGHTH));
      if (r >= 1) { FX.clear(el); return; }
      el.classList.add('fx-line');
      el.style.setProperty('--fx-g', g.toFixed(4));
      el.style.setProperty('--fx-r', r.toFixed(4));
    },

    /** Voice wipe: left to right in a swung beat. */
    wipe: function (el, t, start, dur) {
      if (!el) { return; }
      var p = arrive(seg(t, start, dur || SWING));
      if (p >= 1) { el.style.clipPath = ''; return; }
      el.style.clipPath = 'inset(-0.3em ' + ((1 - p) * 104).toFixed(2) + '% -0.3em -0.6em)';
    },

    /** Cut: on or off, on the grid. */
    cut: function (el, on) {
      if (el) { el.style.visibility = on ? '' : 'hidden'; }
    },

    /** Back to the stylesheet's own (final) state. */
    clear: function (el) {
      if (!el) { return; }
      el.classList.remove('fx-line');
      el.style.removeProperty('--fx-g');
      el.style.removeProperty('--fx-r');
    },

    /**
     * Play render(t) for t = 0 .. duration on the Motion clock. A finite
     * tween, so Deck's settle() waits for it and ?fast runs it 20x.
     * Returns { cancel(), finish(), active }.
     */
    play: function (duration, render, onDone) {
      var done = false;
      function end() {
        if (done) { return; }
        done = true;
        render(duration);
        if (onDone) { onDone(); }
      }
      if (!M || !M.tween) { end(); return { cancel: function () {}, finish: function () {}, active: false }; }
      render(0);
      var tw = M.tween({ from: 0, to: duration, duration: duration, ease: 'linear', immediate: false, onUpdate: function (v) { if (!done) { render(v); } }, onDone: end });
      return {
        cancel: function () { tw.cancel(); },
        finish: function () { tw.cancel(); end(); },
        get active() { return !done && tw.active; }
      };
    },

    /**
     * Should a slide play its entrance? Only when it is reached going forward
     * at step 0, on stage. Going back, a jump to a later step, the PDF and the
     * thumbnails all show the finished state at once.
     */
    shouldPlay: function (ctx) {
      if (!ctx || !ctx.el || ctx.step !== 0) { return false; }
      if (doc.documentElement.classList.contains('mode-print')) { return false; }
      var stage = ctx.el.closest ? ctx.el.closest('.deck-stage') : null;
      return !(stage && stage.getAttribute('data-dir') === 'back');
    }
  };

  window.SleeveFX = FX;

  /* ======================================================================
   * Styles: the block reveal, the count-in dock, the walk-in band
   * (tokens only; everything is keyed to this file's own class names)
   * ==================================================================== */

  var css = [
    /* block reveal, driven by --fx-g (the bar's leading edge) and --fx-r (its trailing edge) */
    '.fx-line { position: relative; clip-path: inset(-0.16em calc((1 - var(--fx-g, 1)) * (100% + 0.3em) - 0.15em) -0.16em -0.2em); }',
    '.fx-line::after { content: ""; position: absolute; left: -0.05em; right: -0.05em; top: -0.03em; bottom: -0.03em; z-index: 5;',
    '  background: currentColor; clip-path: inset(0 0 0 calc(var(--fx-r, 1) * 100%)); pointer-events: none; }',

    /* ---- the count-in dock: the theme\'s gates, narrow, with the name running up the bay ---- */
    '.tc-dock { position: absolute; left: 970px; top: 150px; --gw: 232.5px; --gh: 630.6px; }',
    '.tc-dock .gate { --gcap: 0px; }',
    '.tc-dock .gate-n, .tc-dock .gate-q, .tc-dock .gate-why { display: none; }',
    '.tc-dock .gate-name { left: 0; right: auto; top: 0; width: max-content; font-size: 104px; letter-spacing: 0;',
    '  transform-origin: 0 0; transform: translate(79.5px, 600px) rotate(-90deg); }',
    '.tc-dock .gate.is-pass > .gate-name::after { content: none; }',
    /* every frame of the dock is set by hand: nothing here may ease behind it */
    '.tc-dock .gate, .tc-dock .gate-shutter { transition-property: none !important; }',

    /* ---- the title film: the left field prints in negative for the stop-time hold ---- */
    '.tc-ground { left: var(--spine-w); top: 0; width: calc(926px - var(--spine-w)); height: 1080px; background: var(--c-bg); }',
    '.tc-neg { color: var(--c-ink); }',

    /* ---- walk-in: the catalogue line on Card, and the Flare band the gates stand on ---- */
    '.layout-title > .wk-cat { left: 970px; top: 64px; }',
    '.layout-title > .slab.wk-band { left: 926px; top: 780.6px; width: 994px; height: 299.4px; }',
    '.wk-band > .wk-do { left: 44px; top: 48px; width: 384px; }',
    '.wk-band > .wk-rule { left: 466px; top: 48px; width: var(--w-rule); height: 205px; background: var(--c-line); }',
    '.wk-band > .wk-live { left: 510px; top: 48px; width: 440px; margin: 0; }',
    '.wk-live-k { display: block; white-space: nowrap; }',
    '.wk-live-v { display: block; margin-top: 35px; font-size: 200px; text-transform: uppercase; white-space: nowrap; }'
  ].join('\n');

  var style = doc.createElement('style');
  style.setAttribute('data-from', 'scenes/title.js');
  style.textContent = css;
  doc.head.appendChild(style);

  /* ======================================================================
   * The card's words, from window.YOUR
   * ==================================================================== */

  /* The catalogue line (docs/DIRECTION.md, Part 1, section 7) ends with the
   * city. It reads YOUR.event.city when that is set; the session is in New
   * Orleans (docs/BRIEF.md section 1). There are no coordinates on the card:
   * nothing offline could source them. */
  var CITY = 'New Orleans';
  var PROGRAM = 'Waypoint';
  var DEFAULT_TITLE = 'The Most Valuable AI Skill Is Saying No';

  function your() { return window.YOUR || {}; }

  /* Break a sentence in two at the space nearest its middle. */
  function halve(text) {
    var s = String(text || '').trim();
    var best = -1, mid = s.length / 2, i;
    for (i = 0; i < s.length; i++) {
      if (s.charAt(i) === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) { best = i; }
    }
    return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
  }

  /* The title as stack lines plus the word on the slab. The designed breaks
   * are used for the real title; any other title is split two words a line. */
  function titleLines(title) {
    var t = String(title || DEFAULT_TITLE).trim();
    var words = t.split(/\s+/);
    var last = words[words.length - 1];
    var slabWord = /^no[.!]?$/i.test(last) ? words.pop() : 'No';
    if (t.toLowerCase() === DEFAULT_TITLE.toLowerCase()) {
      return { lines: ['The most', 'valuable', 'AI skill', 'is saying'], slab: slabWord };
    }
    var lines = [];
    var per = Math.max(1, Math.ceil(words.length / 4));
    for (var i = 0; i < words.length; i += per) { lines.push(words.slice(i, i + per).join(' ')); }
    return { lines: lines, slab: slabWord };
  }

  function words() {
    var Y = your();
    var sp = Y.speaker || {};
    var ev = Y.event || {};
    var minutes = Number(ev.minutes) || 90;
    var date = String(ev.date || 'Friday, Nov 13, 2026');
    var comma = date.indexOf(',');
    var room = String(ev.venue || 'Education Center').split(',')[0].trim();
    return {
      kicker: 'A ' + minutes + '-minute workshop',
      title: titleLines(ev.title),
      sub: halve(ev.subtitle || 'Screening AI use cases for real return.'),
      name: sp.name || 'Dustin T Hughes',
      role: [sp.role || 'VP of Technology', sp.company || 'Laborde Products'].join(', '),
      catalogue: [PROGRAM, ev.name || 'NOAI 2026', ev.city || CITY].join(' · '),
      when: comma > 0 ? [date.slice(0, comma).trim(), date.slice(comma + 1).trim()] : [date],
      time: [String(ev.time || '2:30–4:00 PM'), minutes + ' minutes'],
      room: halve(room),
      gates: (THEME && THEME.gates) || ['Cost', 'Return', 'Effort', 'Potential']
    };
  }

  function lines(list) { return list.map(esc).join('<br>'); }

  function gateHtml(name, i, state) {
    return '<article class="gate ' + state + '"><i class="gate-shutter"></i>' +
      '<p class="gate-n">Gate ' + (i + 1) + '</p><h3 class="gate-name">' + esc(name) + '</h3></article>';
  }

  /** The dock of four count-in gates. states: one class per gate. */
  function dockHtml(w, states) {
    return '<div class="dock is-still tc-dock" aria-hidden="true">' +
      w.gates.map(function (g, i) { return gateHtml(g, i, states[i]); }).join('') + '</div>';
  }

  /* ======================================================================
   * The live line: "Starts in 12:34" / "Starts 2:30" / "Starting now"
   * ==================================================================== */

  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  /**
   * The start of the session as a local Date, from YOUR.event.date
   * ("Friday, Nov 13, 2026") and YOUR.event.startsAt ("2:30"). The programme
   * prints the time without AM or PM, so that comes from YOUR.event.time
   * ("2:30–4:00 PM"); failing that, an hour from 1 to 7 is the afternoon.
   * Returns null when it cannot be read, and the card then says "Starts 2:30".
   */
  function parseStart(ev) {
    if (!ev) { return null; }
    var d = /([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(String(ev.date || ''));
    if (!d) {                                          // "13 Nov 2026": the day first
      var alt = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})/.exec(String(ev.date || ''));
      if (alt) { d = [alt[0], alt[2], alt[1], alt[3]]; }
    }
    var t = /(\d{1,2})[:.](\d{2})\s*(?:([ap])\.?m\.?)?/i.exec(String(ev.startsAt || ''));
    if (!d || !t) { return null; }
    var month = MONTHS[d[1].toLowerCase()];
    if (month == null) { return null; }
    var hh = Number(t[1]), mm = Number(t[2]);
    if (!(hh >= 0 && hh < 24 && mm >= 0 && mm < 60)) { return null; }
    var mer = t[3] ? t[3].toLowerCase() : '';
    if (!mer) {
      var all = String(ev.time || '').match(/\d{1,2}[:.]\d{2}\s*[ap]\.?m\.?|[ap]\.?m\.?/gi) || [];
      if (all.length) {
        var first = /([ap])\.?m\.?$/i.exec(all[0]);
        var lastM = /([ap])\.?m\.?$/i.exec(all[all.length - 1]);
        mer = ((first || lastM)[1] || '').toLowerCase();
      } else if (hh >= 1 && hh <= 7) {
        mer = 'p';
      }
    }
    if (mer === 'p' && hh < 12) { hh += 12; }
    if (mer === 'a' && hh === 12) { hh = 0; }
    var at = new Date(Number(d[3]), month, Number(d[2]), hh, mm, 0, 0);
    return isNaN(at.getTime()) ? null : at;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * What the live line says at wall time nowMs.
   *   more than 99:59 away, or unreadable   Starts 2:30
   *   inside 99:59                          Starts in 12:34
   *   from the start time on                Starting now
   *   after the session has ended           Starts 2:30   (the programme's own words)
   */
  function liveLine(nowMs, start, ev) {
    var fallback = { key: 'Starts', value: String((ev && ev.startsAt) || '2:30'), state: 'static' };
    if (!start || nowMs == null || isNaN(nowMs)) { return fallback; }
    var left = Math.ceil((start.getTime() - nowMs) / 1000);
    var length = ((ev && Number(ev.minutes)) || 90) * 60;
    if (left > 5999) { return fallback; }
    if (left > 0) { return { key: 'Starts in', value: Math.floor(left / 60) + ':' + pad2(left % 60), state: 'countdown' }; }
    if (left > -length) { return { key: 'Starting', value: 'now', state: 'now' }; }
    return fallback;
  }

  /* ======================================================================
   * Markup
   * ==================================================================== */

  /**
   * TitleScene.markup('build' | 'walkin') -> the children of a slide in the
   * theme's "title" layout, in their finished state, plus the hidden driver.
   */
  function markup(mode) {
    var w = words();
    var left =
      '<p class="kicker">' + esc(w.kicker) + '</p>' +
      '<h1 class="stack title-stack" data-fit data-fit-h="622.6">' +
        w.title.lines.map(function (l) { return '<span class="ln">' + esc(l) + '</span>'; }).join('') +
      '</h1>' +
      '<p class="sub">' + lines(w.sub) + '</p>' +
      '<p class="credit"><b>' + esc(w.name) + '</b><span>' + esc(w.role) + '</span></p>';

    if (mode === 'walkin') {
      var ev = your().event || {};
      var live = liveLine(null, null, ev);
      return left +
        '<p class="catalogue wk-cat">' + esc(w.catalogue) + '</p>' +
        dockHtml(w, ['is-pass', 'is-pass', 'is-pass', '']) +
        '<div class="slab wk-band">' +
          '<p class="stack wk-do" data-fit data-fit-max="88" data-fit-h="205"><span class="ln">Take a</span><span class="ln">worksheet</span><span class="ln">and a pen</span></p>' +
          '<i class="wk-rule"></i>' +
          '<p class="wk-live" role="timer"><span class="label wk-live-k">' + esc(live.key) + '</span><b class="num wk-live-v">' + esc(live.value) + '</b></p>' +
        '</div>' +
        '<i data-scene="title" data-opts=\'{"mode":"walkin"}\' hidden></i>';
    }

    return left +
      '<div class="slab">' +
        '<p class="catalogue">' + esc(w.catalogue) + '</p>' +
        '<div class="mega">' + esc(w.title.slab) + '</div>' +
        '<dl class="slab-fine">' +
          '<div><dt>When</dt><dd>' + lines(w.when) + '</dd></div>' +
          '<div><dt>Time</dt><dd>' + lines(w.time) + '</dd></div>' +
          '<div><dt>Room</dt><dd>' + lines(w.room) + '</dd></div>' +
        '</dl>' +
      '</div>' +
      '<i data-scene="title" data-opts=\'{"mode":"build"}\' hidden></i>';
  }

  /* ======================================================================
   * The gates, driven by hand
   * ----------------------------------------------------------------------
   * The dock uses the theme's gate component with its own moves switched off
   * (.is-still), so every frame is a function of time. A gate here is a state
   * class (is-shut or is-pass, which prints the word) plus a shutter height.
   * ==================================================================== */

  var GH = 630.6, GL = 8;
  var FULL = GH - GL * 3;          // a shutter that just reaches the floor
  var RAISED = FULL * 0.2;         // a raised shutter: the top fifth
  var TRY = 90;                    // how far gate four gets before it gives up

  function collectGates(dock) {
    var out = [];
    each(dock ? dock.querySelectorAll('.gate') : [], function (el) {
      out.push({ el: el, shutter: el.querySelector('.gate-shutter'), state: '', h: -1 });
    });
    return out;
  }

  function setGate(g, state, h) {
    if (!g) { return; }
    if (g.state !== state) {
      g.el.classList.remove('is-shut', 'is-pass');
      if (state) { g.el.classList.add(state); }     // '' is NOT YET: the frame only
      g.state = state;
    }
    var px = Math.round(h * 10) / 10;
    if (g.h !== px && g.shutter) { g.shutter.style.height = px + 'px'; g.h = px; }
  }

  /* Gate four: lifts a little, trembles, falls shut. u is local time. */
  function tryHeight(u) {
    var up = 0;
    if (u >= 0 && u < 0.25) { up = TRY * lift(u / 0.25); }
    else if (u >= 0.25 && u < 0.5) { up = TRY + 4 * Math.sin((u - 0.25) * 2 * Math.PI * 12); }
    else if (u >= 0.5 && u < 0.625) { up = TRY * (1 - drop((u - 0.5) / SIXTEENTH)); }
    return FULL - up;
  }

  /* ======================================================================
   * The walk-in loop: 16 bars, 32 seconds. Frame 0 = frame 32.
   * ----------------------------------------------------------------------
   *   0 .. 20     the picture: three PASS, the fourth bay vacant
   *   20, 20⅓, 20½  the PASS words cut out and the shutters roll up (a beat)
   *   21 .. 23    the dock rests: four empty frames, NOT YET
   *   23, 25, 27  a gate is examined: its shutter drops to the floor
   *   24, 26, 28  one bar later it lifts to the top fifth; PASS cuts in a
   *               sixteenth before it stops
   *   28.5 .. 32  the picture again
   * Gate four is never examined here: it waits for the title, where the NO
   * drops. A shut shutter is only ever seen for the one bar of examination.
   * ==================================================================== */

  var LOOP = {
    period: 32,
    retracts: [20, 20 + SWING, 20.5],  // long-short, like every stagger
    shuts: [23, 25, 27],               // one gate a bar: one, two, three
    lifts: [24, 26, 28],
    pose: 0                            // the frame a PDF gets, and the frame it enters on
  };

  function renderLoop(gates, t) {
    for (var i = 0; i < 3; i++) {
      var g = gates[i];
      if (t < LOOP.retracts[i]) {
        setGate(g, 'is-pass', RAISED);
      } else if (t < LOOP.shuts[i]) {
        setGate(g, '', RAISED * (1 - lift(seg(t, LOOP.retracts[i], BEAT))));
      } else if (t < LOOP.lifts[i]) {
        setGate(g, 'is-shut', FULL * drop(seg(t, LOOP.shuts[i], DROP)));
      } else {
        var up = lift(seg(t, LOOP.lifts[i], BEAT));
        setGate(g, t >= LOOP.lifts[i] + BEAT - SIXTEENTH ? 'is-pass' : 'is-shut', FULL - (FULL - RAISED) * up);
      }
    }
    setGate(gates[3], '', 0);
  }

  /* ======================================================================
   * The title film: 8 seconds
   * ==================================================================== */

  var FILM = {
    duration: 8,
    kicker: 0.5,
    lines: [SWING, BEAT + SWING, BEAT * 2 + SWING, BEAT * 3 + SWING],   // each on the swung off-beat
    sub: 2.25,
    name: 2 + 2 * SWING,
    role: 2.5 + SWING,
    rise: [2, 2 + SWING / 2, 2 + SWING, 2.5], riseDur: EIGHTH,          // four gates rise shut
    lifts: [3, 3.5, 4],                                                  // one, two, three: on the beat
    tries: 4.25,                                                         // the fourth tries, and cannot
    drop: 5.1875,                                                        // three sixteenths of gravity
    land: 5.1875 + DROP,
    hold: [5.1875 + DROP, 6.75],                                         // stop-time: the left field in negative
    fine: [7, 7 + SWING / 2, 7 + SWING]                                  // the fine print, swung
  };

  function renderFilm(p, t) {
    var i;

    // the left column. Labels cut; display lines arrive behind a block; the voice wipes.
    FX.cut(p.kicker, t >= FILM.kicker);
    for (i = 0; i < p.lines.length; i++) { FX.block(p.lines[i], t, FILM.lines[Math.min(i, FILM.lines.length - 1)]); }
    FX.wipe(p.sub, t, FILM.sub);
    FX.cut(p.name, t >= FILM.name);
    FX.cut(p.role, t >= FILM.role);

    // the count-in: four gates rise shut, then open one, two, three
    var covered = t >= FILM.land;
    p.dock.style.visibility = covered ? 'hidden' : '';
    if (!covered) {
      for (i = 0; i < 4; i++) {
        var up = arrive(seg(t, FILM.rise[i], FILM.riseDur));
        p.gates[i].el.style.clipPath = up >= 1 ? '' : 'inset(' + ((1 - up) * 100).toFixed(2) + '% 0 0 0)';
        if (i < 3) {
          var e = lift(seg(t, FILM.lifts[i], BEAT));
          setGate(p.gates[i], t >= FILM.lifts[i] + BEAT - SIXTEENTH ? 'is-pass' : 'is-shut', FULL - (FULL - RAISED) * e);
        } else {
          setGate(p.gates[i], 'is-shut', tryHeight(t - FILM.tries));
        }
      }
    }

    // NO. The slab falls for three sixteenths and stops dead.
    var fall = drop(seg(t, FILM.drop, DROP));
    p.slab.style.visibility = t >= FILM.drop ? '' : 'hidden';
    p.slab.style.translate = fall >= 1 ? '' : '0 ' + (-(1 - fall) * 1080).toFixed(1) + 'px';

    // impact: the left field recoils and prints in negative for the hold
    var since = t - FILM.land;
    var jolt = since >= 0 && since < DROP ? 14 * (1 - arrive(since / DROP)) : 0;
    var negative = t >= FILM.hold[0] && t < FILM.hold[1];
    for (i = 0; i < p.left.length; i++) {
      p.left[i].style.translate = jolt ? '0 ' + jolt.toFixed(2) + 'px' : '';
      p.left[i].classList.toggle('is-negative', negative);
      p.left[i].classList.toggle('tc-neg', negative);
    }
    p.ground.classList.toggle('is-negative', negative);

    // after the hold: the rule wipes, the fine print cuts in, swung
    FX.cut(p.catalogue, t >= FILM.fine[0]);
    if (p.fine) {
      var rule = arrive(seg(t, FILM.fine[0], EIGHTH));
      p.fine.style.visibility = t >= FILM.fine[0] ? '' : 'hidden';
      p.fine.style.clipPath = rule >= 1 ? '' : 'inset(0 ' + ((1 - rule) * 100).toFixed(2) + '% 0 0)';
    }
    for (i = 0; i < p.cols.length; i++) { FX.cut(p.cols[i], t >= FILM.fine[Math.min(i, 2)]); }
  }

  /* ======================================================================
   * The scene
   * ==================================================================== */

  function define() {
    window.Scenes.define('title', function (host, opts, api) {
      var Motion = (api && api.motion) || M;
      var root = (host.closest && host.closest('.slide')) || host.parentNode;
      var printing = !!(api && api.mode && api.mode.print);
      var walkin = opts && opts.mode === 'walkin';
      var stopLoop = null;
      var film = null;

      /* ------------------------------------------------------- walk-in */
      if (walkin) {
        var gates = collectGates(root.querySelector('.tc-dock'));
        var ev = your().event || {};
        var start = parseStart(ev);
        var keyEl = root.querySelector('.wk-live-k');
        var valueEl = root.querySelector('.wk-live-v');
        var shown = '';

        // the wall clock (see the note at the top of this file)
        var testNow = window.TitleScene && window.TitleScene.testNow;
        var wall0 = testNow != null ? new Date(testNow).getTime() : Date.now();
        var motion0 = Motion ? Motion.now() : 0;
        var scale0 = Motion && Motion.timeScale ? Motion.timeScale : 1;
        var wall = function () {
          if (testNow != null || (Motion && Motion.isManual && Motion.isManual())) {
            return wall0 + (Motion.now() - motion0) / scale0 * 1000;
          }
          return Date.now();
        };

        var paintLive = function () {
          var line = printing ? liveLine(null, null, ev) : liveLine(wall(), start, ev);
          var text = line.key + '|' + line.value;
          if (text === shown) { return; }
          shown = text;
          if (keyEl) { keyEl.textContent = line.key; }
          if (valueEl) { valueEl.textContent = line.value; }
        };

        if (gates.length === 4) {
          if (printing || !Motion) {
            renderLoop(gates, LOOP.pose);
          } else {
            var t0 = Motion.now() - LOOP.pose;            // enter on the finished picture
            var frame = function (now) {
              var t = (now - t0) % LOOP.period;
              if (t < 0) { t += LOOP.period; }
              renderLoop(gates, t);
              paintLive();
            };
            frame(t0);
            stopLoop = Motion.raf(frame);
          }
        }
        paintLive();

        return {
          step: function () {},
          resize: function () {},
          destroy: function () { if (stopLoop) { stopLoop(); stopLoop = null; } }
        };
      }

      /* ---------------------------------------------------- title film */
      var slab = root.querySelector('.slab');
      var stack = root.querySelector('.title-stack');
      if (!slab || !stack) { return {}; }

      var stage = root.closest ? root.closest('.deck-stage') : null;
      var back = !!(stage && stage.getAttribute('data-dir') === 'back');
      if (printing || back || !Motion) { return {}; }      // the markup is already the finished card

      // parts that exist only while the film runs: the ground that goes negative, and the dock
      var ground = doc.createElement('i');
      ground.className = 'tc-ground';
      root.insertBefore(ground, root.firstChild);
      var holder = doc.createElement('div');
      holder.innerHTML = dockHtml(words(), ['is-shut', 'is-shut', 'is-shut', 'is-shut']);
      var dock = holder.firstChild;
      root.insertBefore(dock, slab);

      var credit = root.querySelector('.credit');
      var parts = {
        kicker: root.querySelector('.kicker'),
        lines: Array.prototype.slice.call(stack.querySelectorAll('.ln')),
        sub: root.querySelector('.sub'),
        name: credit ? credit.querySelector('b') : null,
        role: credit ? credit.querySelector('span') : null,
        dock: dock,
        gates: collectGates(dock),
        slab: slab,
        ground: ground,
        catalogue: slab.querySelector('.catalogue'),
        fine: slab.querySelector('.slab-fine'),
        cols: Array.prototype.slice.call(slab.querySelectorAll('.slab-fine > div')),
        left: []
      };
      [parts.kicker, stack, parts.sub, credit].forEach(function (el) { if (el) { parts.left.push(el); } });

      film = FX.play(FILM.duration, function (t) { renderFilm(parts, t); }, function () {
        if (dock.parentNode) { dock.parentNode.removeChild(dock); }
        if (ground.parentNode) { ground.parentNode.removeChild(ground); }
      });

      return {
        step: function () {},
        resize: function () {},
        destroy: function () { if (film) { film.cancel(); film = null; } }
      };
    });
  }

  window.TitleScene = {
    markup: markup,
    words: words,
    parseStart: parseStart,
    liveLine: liveLine,
    film: FILM,
    loop: LOOP,
    testNow: null
  };

  if (window.Scenes && typeof window.Scenes.define === 'function') { define(); }
}());
