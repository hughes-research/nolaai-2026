/*
 * video/title-sequence.js: the opening title film.  ->  window.__setTime, window.__duration
 *
 * "The Most Valuable AI Skill Is Saying No" · NOAI 2026 · 42 seconds, silent.
 *
 * A coded title sequence in the deck's SLEEVE direction: two inks on card
 * stock, one spot ink, 120 beats a minute. Nothing fades and nothing
 * overshoots. Things cut, hide behind a block, lift or drop.
 *
 * THE WHOLE FILM IS A PURE FUNCTION OF TIME. render(t) sets every moving
 * property from t alone and remembers nothing, so any frame can be drawn in
 * any order and is the same frame every time:
 *
 *     window.__setTime(seconds)   draw exactly that frame (freezes the Motion clock)
 *     window.__duration           length of the film in seconds
 *     window.__ready              true once the fonts are in and the stacks are fitted
 *     window.__marks              [{ t, name }] the beats worth looking at
 *     window.__film               { width, height, layout, fits, fontsOk, poster }
 *
 * Opened normally (video/title.html) it plays in real time on the Motion
 * clock, holds its last frame and offers a replay control.
 *
 * Two layouts from one score: 1920x1080, and a real re-layout for 1080x1080
 * (title.html?size=1080x1080). Any other size picks the nearer shape and
 * scales it to fit.
 *
 * Every fitted stack is justified ONCE, at load, after the fonts are ready
 * (THEME.fitStack), and the result is baked into inline styles. Nothing is
 * refitted while the film runs, so no frame can mis-justify.
 *
 * COPY. Every word on screen is from docs/BRIEF.md: the Shannon sentence
 * (section 6, line 1, character for character, with our swap marked as our
 * edit), the abstract's two lines, the four gate names, "Where the parts
 * live." and "Nobody pitches this." (section 8, the-winner), and the title
 * card (section 1, read from window.YOUR). The only invented words are the
 * generic pitch phrases in PITCHES: no brands, no numbers, no claims. No
 * figure appears anywhere in the film except the dates and the session time.
 *
 * Needs, loaded before it by title.html: ../deck/lib/motion.js,
 * ../deck/theme/theme.js (tokens.css and fonts.css), and
 * ../deck/content/your-numbers.js.
 */
(function () {
  'use strict';

  var doc = document;
  var M = window.Motion;
  var THEME = window.THEME;
  var YOUR = window.YOUR || {};

  if (!M || !THEME) {
    doc.body.textContent = 'The title film needs ../deck/lib/motion.js and ../deck/theme/theme.js next to it.';
    return;
  }

  /* ======================================================================
   * Time: 120 BPM. Every duration below is a note value.
   * ==================================================================== */

  var note = THEME.motion.note;
  var BEAT = note.beat;              // 0.5
  var EIGHTH = note.eighth;          // 0.25
  var SIX = note.sixteenth;          // 0.125
  var SWING = note.swing;            // 0.333: the swung off-beat
  var DROP = THEME.motion.dur.drop;  // 0.375: three sixteenths of gravity
  var arrive = THEME.motion.ease.arrive;   // fast in, dead stop
  var lift = THEME.motion.ease.lift;       // a shutter going up
  var drop = THEME.motion.ease.drop;       // gravity: no bounce, no overshoot
  var CAP = THEME.metrics.cap;             // Archivo's cap height, 0.688 em
  var LH = THEME.metrics.lineHeight;       // 0.708: the cap-height line box

  /** Progress 0..1 of a move that starts at `start` and lasts `dur`. */
  function seg(t, start, dur) {
    var p = (t - start) / dur;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  /* ======================================================================
   * The score. Scene starts are in film seconds; everything inside a scene
   * is in seconds from that scene's start. 21 bars.
   * ==================================================================== */

  var T = {
    shannon: 0,       // 1. Black. "1956." Shannon's sentence sets itself. Our edit.
    pitches: 7.5,     // 2. The pitches, each hit by a NO: one, two, four, eight.
    survivor: 17,     // 3. One dull line. The shutter comes down on it too, and lifts. PASS.
    premise: 22,      // 4. "Your best AI idea is probably wrong." / "The boring one ..."
    gates: 28,        // 5. The four gates shut, one to a beat.
    title: 31,        // 6. The title card. Three gates open. The fourth strains three times. NO.
    end: 42
  };

  var S1 = {
    yearIn: 0.5,                    // "1956." arrives behind a block
    yearOut: 1.5,                   // and leaves behind one
    kicker: 1.5 + SIX,              // the year cuts to a label as the block covers it
    lines: 1.5 + SWING,             // the sentence: lines wipe in, swung
    attribution: 3.5,
    strike: 4.5,                    // "Information theory" is struck through
    edit: 5                         // "AI" drops in above it, flagged as our edit
  };

  var S2 = {
    phase: [0, 3, 5, 7],            // one bay, two, four, eight
    lines: [EIGHTH, EIGHTH + SWING],
    drops: [
      [1.75],                                         // 0.8 s of nothing first
      [3.75, 4.25],                                   // a beat apart
      [5.5, 5.75, 6, 6.25],                           // an eighth apart
      [7.25, 7.375, 7.5, 7.625, 7.75, 7.875, 8, 8.125] // a sixteenth apart
    ]
  };

  var S3 = {
    line: 0.5,                      // after a beat of empty card stock
    aside: 1,
    frame: 1.5,                     // the gate stands up around it
    shut: 2,                        // the shutter comes down on it too
    lift: 3,                        // and goes back up: one beat
    pass: 3 + BEAT - SIX,           // PASS cuts in a sixteenth before it stops
    open: 3.5,                      // pull tab, through-arrow
    carried: 4
  };

  var S4 = {
    lines: [SWING, BEAT + SWING, 2 * BEAT + SWING],
    punch: 3 * BEAT + SWING,
    note: 2.5,
    voice: 3,
    worth: [4, 4 + SWING]
  };

  var S5 = { drops: [0.5, 1, 1.5, 2] };

  var S6 = {
    cover: 0,                       // the sleeve covers the stage in an eighth
    pull: EIGHTH,                   // and pulls back to the spine in a beat
    kicker: 0.75,
    lines: [BEAT + SWING, 2 * BEAT + SWING, 3 * BEAT + SWING, 4 * BEAT + SWING],
    sub: 2.75,
    name: 3 + SWING / 2,
    role: 3 + SWING,
    lifts: [3.5, 4, 4.5],           // one, two, three: on the beat
    strains: [5, 5.5, 6],           // the fourth tries, and slams shut on the next beat. Three times.
    drop: 7.5,                      // a full second of nothing, then the slab
    land: 7.5 + DROP,
    positive: 9,                    // stop-time in negative until here
    fine: [9, 9 + SWING / 2, 9 + SWING]
  };

  var DURATION = T.end;

  /* ======================================================================
   * Copy
   * ==================================================================== */

  /* Claude Shannon, "The Bandwagon", IRE Transactions on Information Theory,
   * 1956. docs/BRIEF.md section 6, line 1. Checked against the page there.
   * DO NOT EDIT THIS STRING. The swap is drawn as a visible edit, never typed in. */
  var SHANNON = 'Information theory has, in the last few years, become something of a scientific bandwagon.';
  var SHANNON_STRUCK = 'Information theory';
  var SHANNON_OURS = 'AI';
  var SHANNON_SOURCE = 'Claude Shannon, The Bandwagon, 1956';
  var YEAR = (/\d{4}/.exec(SHANNON_SOURCE) || [''])[0] + '.';

  /* Generic pitch phrases anyone has heard in a meeting. Invented, and kept
   * generic on purpose: no brands, no products, no numbers. The first three
   * are the brief's own examples. */
  var PITCHES = [
    'An AI|chatbot',
    'An AI agent for everything',
    'AI strategy offsite',
    'AI meeting notes',
    'An AI roadmap',
    'Our own AI model',
    'AI press release',
    'AI vision statement',
    'AI innovation lab',
    'AI hackathon',
    'An AI dashboard',
    'AI in every product',
    'AI for the board deck',
    'AI-first rebrand',
    'Another chatbot'
  ];

  var SURVIVOR = 'Where the parts live.';          // brief, section 8: the-winner
  var SURVIVOR_ASIDE = 'Nobody pitches this.';     // brief, section 8: the-winner
  var PREMISE_1 = ['Your best', 'AI idea is', 'probably', 'wrong.'];                       // abstract, line 1
  var PREMISE_2 = ['The boring one', 'you didn’t pitch', 'is probably'];              // abstract, line 2 ...
  var PREMISE_2_PUNCH = ['worth', 'thousands.'];                                           // ... and its end
  var GATES = THEME.gates || ['Cost', 'Return', 'Effort', 'Potential'];
  var VENUE_POSITION = '29°57.7′N 090°03.5′W';   // docs/DIRECTION.md, Part 1, section 7

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Break a sentence in two at the space nearest its middle. */
  function halve(text) {
    var s = String(text || '').trim();
    var best = -1, mid = s.length / 2, i;
    for (i = 0; i < s.length; i++) {
      if (s.charAt(i) === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) { best = i; }
    }
    return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
  }

  var TITLE_BREAKS = { 'the most valuable ai skill is saying': ['The most', 'valuable', 'AI skill', 'is saying'] };

  /* The title card's words, from window.YOUR (the speaker's one file). */
  function cardWords() {
    var sp = YOUR.speaker || {};
    var ev = YOUR.event || {};
    var minutes = Number(ev.minutes) || 90;
    var title = String(ev.title || 'The Most Valuable AI Skill Is Saying No').trim().split(/\s+/);
    var slab = /^no[.!]?$/i.test(title[title.length - 1]) ? title.pop() : 'No';
    var date = String(ev.date || 'Friday, Nov 13, 2026');
    var comma = date.indexOf(',');
    // the designed breaks for the real title; any other title is split two words to a line
    var four = TITLE_BREAKS[title.join(' ').toLowerCase()];
    if (!four) {
      four = [];
      for (var i = 0; i < title.length; i += 2) { four.push(title.slice(i, i + 2).join(' ')); }
    }
    return {
      kicker: 'A ' + minutes + '-minute workshop',
      four: four,                                                    // The most / valuable / AI skill / is saying
      two: [four.slice(0, Math.ceil(four.length / 2)).join(' '), four.slice(Math.ceil(four.length / 2)).join(' ')],   // The most valuable / AI skill is saying
      slab: slab,
      subtitle: String(ev.subtitle || 'Screening AI use cases for real return.'),
      name: sp.name || 'Dustin T Hughes',
      role: [sp.role || 'VP of Technology', sp.company || 'Laborde Products'].join(', '),
      catalogue: ['Waypoint', ev.name || 'NOAI 2026', VENUE_POSITION].join(' · '),
      when: comma > 0 ? [date.slice(0, comma).trim(), date.slice(comma + 1).trim()] : [date],
      time: [String(ev.time || '2:30–4:00 PM'), minutes + ' minutes'],
      room: halve(String(ev.venue || 'Education Center').split(',')[0].trim())
    };
  }

  /* ======================================================================
   * Stage and layout
   * ==================================================================== */

  var query = (function () {
    var out = {};
    String(window.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) { return; }
      var i = kv.indexOf('=');
      out[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    return out;
  }());

  /* The shape asked for: ?size=1080x1080, or ?square. Default 1920x1080. */
  var asked = /^(\d+)x(\d+)$/i.exec(query.size || '');
  var askedW = asked ? Number(asked[1]) : ('square' in query ? 1080 : 1920);
  var askedH = asked ? Number(asked[2]) : 1080;
  var wide = askedW / askedH > 1.25;
  var W = wide ? 1920 : 1080;
  var H = 1080;

  /** pick(a, b): a on the wide stage, b on the square one. */
  function pick(a, b) { return wide ? a : b; }

  var MX = pick(128, 72);            // the left edge of the type
  var MY = 64;                       // the label line at the head of a card
  var LINE = 8;                      // posts, lintels, floors

  var film = doc.getElementById('film');
  if (!film) {
    film = doc.createElement('div');
    film.id = 'film';
    doc.body.appendChild(film);
  }
  film.className = 'film ' + (wide ? 'is-wide' : 'is-square');
  film.style.width = W + 'px';
  film.style.height = H + 'px';

  function el(tag, cls, parent, css, html) {
    var n = doc.createElement(tag);
    if (cls) { n.className = cls; }
    if (css) { n.style.cssText = css; }
    if (html != null) { n.innerHTML = html; }
    if (parent) { parent.appendChild(n); }
    return n;
  }

  function px(v) { return (Math.round(v * 100) / 100) + 'px'; }

  function box(x, y, w, h) {
    return 'left:' + px(x) + ';top:' + px(y) + ';' + (w != null ? 'width:' + px(w) + ';' : '') + (h != null ? 'height:' + px(h) + ';' : '');
  }

  /** On or off. '' (not 'visible'), so a hidden scene keeps its children hidden. */
  function show(node, on) {
    var v = on ? '' : 'hidden';
    if (node.style.visibility !== v) { node.style.visibility = v; }
  }

  function scene(id, ground) {
    var sc = el('section', 'sc ' + ground, film);
    sc.id = id;
    return sc;
  }

  /* width of a string at 100px in a given class, measured once at build */
  var probe = null;
  function width100(text, cls) {
    if (!probe) { probe = el('span', '', film, 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;font-size:100px'); }
    probe.className = cls;
    probe.textContent = text;
    return probe.getBoundingClientRect().width;
  }

  /* ======================================================================
   * The moves
   * ==================================================================== */

  var fits = {};          // every fitted stack, as baked: name -> { size, pitch, widths, measure }

  /**
   * A stack: display lines justified to one measure on Archivo's width axis.
   * o: { x, y, measure, lines, name, size, height (px, or a function read at bake time), leading, bars, cls }
   * Built unfitted; bakeStack() fits it once the fonts are in.
   */
  function makeStack(parent, o) {
    var node = el('div', 'a stack' + (o.cls ? ' ' + o.cls : ''), parent, box(o.x, o.y, o.measure));
    var s = { el: node, o: o, lines: [], bars: [], fit: null };
    o.lines.forEach(function (text) { s.lines.push(el('span', 'ln', node, '', esc(text))); });
    stacks.push(s);
    return s;
  }
  var stacks = [];

  function barOver(size) { return Math.max(4, Math.round(size * 0.024)); }

  function bakeStack(s) {
    var o = s.o;
    var height = typeof o.height === 'function' ? o.height() : o.height;
    var f = THEME.fitStack(s.el, { measure: o.measure, size: o.size, height: height, leading: o.leading, max: o.max });
    if (!f) { throw new Error('Could not fit the stack "' + (o.name || o.lines.join(' / ')) + '"'); }
    s.fit = f;
    if (o.name) { fits[o.name] = { size: f.size, pitch: Math.round(f.pitch * 100) / 100, widths: f.widths, measure: f.measure }; }
    if (o.bars !== false) {
      s.lines.forEach(function (ln, k) {
        // a little taller than the cap-height box: round letters and figures overshoot it
        s.bars.push(el('i', 'bar', s.el, 'top:' + px(k * f.pitch - barOver(f.size)) + ';height:' + px(LH * f.size + 2 * barOver(f.size)) + ';width:0'));
      });
    }
    return f;
  }

  /**
   * Block reveal: a bar of the line's own ink runs across the measure in a
   * sixteenth, then its left edge retreats in an eighth and leaves the line
   * behind. With leave = true it is the same move run to take a line away:
   * the bar covers the line, the line is cut, the bar retreats over nothing.
   */
  function block(s, k, t, start, leave) {
    var g = arrive(seg(t, start, SIX));
    var r = arrive(seg(t, start + SIX, EIGHTH));
    var m = s.fit.measure;
    var bar = s.bars[k];
    var ln = s.lines[k];
    bar.style.left = px(r * m);
    bar.style.width = px(Math.max(0, (g - r) * m));
    if (leave) {
      ln.style.clipPath = '';
      show(ln, g < 1);
    } else {
      show(ln, true);
      ln.style.clipPath = r >= 1 ? '' : 'inset(-0.2em ' + ((1 - r) * 100).toFixed(3) + '% -0.2em -0.2em)';
    }
  }

  /** Voice wipe: a Fraunces line wipes in from the left over a swung beat. */
  function wipe(node, t, start, dur) {
    var p = arrive(seg(t, start, dur || SWING));
    node.style.clipPath = p >= 1 ? '' : 'inset(-0.3em ' + ((1 - p) * 104).toFixed(3) + '% -0.3em -0.9em)';
  }

  /** A rule drawn from its left end. */
  function rule(node, t, start, dur) {
    var p = arrive(seg(t, start, dur || EIGHTH));
    node.style.transform = p >= 1 ? '' : 'scaleX(' + p.toFixed(4) + ')';
  }

  /* ======================================================================
   * The gate: a loading-dock door seen from the front. Two posts and a
   * lintel, a floor line, and a shutter that hangs one line inside the frame.
   *
   * dock(parent, o) builds a row of o.n bays that share posts.
   *   o: { x, y, w, h, n, through }   (x, y, w, h): outside of the posts, lintel top to floor bottom
   * Each bay has two layers with the same origin, so the same words can be
   * printed in both: `open` (the bay, in ink) and `shut` (the shutter, in the
   * ground's ink, clipped to the shutter's height). A word is read in the
   * open bay, and printed on the shutter when one has come down over it.
   * ==================================================================== */

  function dock(parent, o) {
    var n = o.n;
    var step = (o.w - LINE) / n;
    var frame = el('div', 'a frame', parent, box(0, 0, W, H));
    var floor = el('i', 'a ink', parent, box(o.x, o.y + o.h - LINE, o.w, LINE) + 'transform-origin:0 50%');
    var i;
    el('i', 'a ink', frame, box(o.x, o.y, o.w, LINE));
    for (i = 0; i <= n; i++) { el('i', 'a ink', frame, box(o.x + i * step, o.y, LINE, o.h - LINE)); }
    var d = {
      o: o, frame: frame, floor: floor, bays: [], step: step,
      full: o.h - 3 * LINE,                                            // a shutter that just reaches the floor
      sw: step - 3 * LINE                                              // shutter width
    };
    d.raised = Math.max(3 * LINE, Math.round(d.full * 0.2));           // a raised shutter: the top fifth
    d.through = d.full + LINE + (o.through || 0);                      // a NO goes through the floor
    for (i = 0; i < n; i++) {
      var bx = o.x + i * step + 2 * LINE;
      var by = o.y + 2 * LINE;
      var open = el('div', 'a bay', parent, box(bx, by, d.sw, d.full));
      var shut = el('div', 'a shut', parent, box(bx, by, d.sw, 0));
      d.bays.push({ x: bx, y: by, w: d.sw, open: open, shut: shut, h: -1 });
    }
    return d;
  }

  function setShutter(bay, h) {
    var v = Math.round(h * 10) / 10;
    if (bay.h === v) { return; }
    bay.shut.style.height = v + 'px';
    if (bay.words) { bay.words.style.height = Math.max(0, v - (bay.band || 0)) + 'px'; }
    bay.h = v;
  }

  /** The word NO, printed at the foot of a shutter. It rides down with the edge.
   *  bay.band is the height of the foot of the shutter that carries it: nothing
   *  else is printed there, so the NO never crosses the words it comes down on. */
  function printNo(d, bay, size, pad, right) {
    var bottom = d.through - d.full + pad * 0.6 - 0.02 * size;
    bay.band = bottom + LH * size + Math.round(size * 0.07);
    return el('b', 'a t-display no', bay.shut,
      (right ? 'right:' : 'left:') + px(pad) + ';bottom:' + px(bottom) + ';font-size:' + px(size), 'No');
  }

  /** The layer of a shutter that carries the bay's own words (above the NO's band). */
  function shutWords(bay) {
    bay.words = el('div', 'a', bay.shut, box(0, 0, bay.w, 0) + 'overflow:hidden');
    return bay.words;
  }

  /** The word PASS, printed on the part of a shutter that stays down when it is raised. */
  function printPass(d, bay, pad) {
    var room = bay.w - pad * 2;
    var size = Math.min(d.raised * 0.62 / CAP, room / (width100('PASS', 't-display') / 100));
    return el('b', 'a t-display pass', bay.shut,
      'left:' + px(pad) + ';top:' + px((d.raised - CAP * size) / 2) + ';font-size:' + px(size), 'Pass');
  }

  /** The pull tab under a raised shutter. */
  function pullTab(parent, d, bay) {
    var w = Math.max(3 * LINE, Math.round(bay.w * 0.17));
    return el('i', 'a ink', parent, box(bay.x + (bay.w - w) / 2, bay.y + d.raised, w, Math.round(LINE * 1.75)));
  }

  /* ======================================================================
   * 1. Black. "1956." The sentence sets itself. Our edit.
   * ==================================================================== */

  function buildShannon() {
    var sc = scene('s-shannon', 'on-ink');
    var words = SHANNON.split(' ');
    var breaks = pick([7, 6, 1], [2, 5, 2, 3, 2]);
    var fs = pick(100, 90);
    var lineH = 1.14 * fs;
    var qy = pick(398, 340);
    var lines = [], at = 0;
    breaks.forEach(function (n) { lines.push(words.slice(at, at + n).join(' ')); at += n; });
    if (lines.join(' ') !== SHANNON || lines[0].indexOf(SHANNON_STRUCK) !== 0) {
      throw new Error('The Shannon sentence must be set exactly as written.');
    }

    var p = {};
    p.year = makeStack(sc, { name: 'year', x: MX, y: pick(292, 330), measure: pick(1240, 936), lines: [YEAR] });
    p.kicker = el('p', 'a t-label', sc, box(MX, MY), esc(YEAR));

    p.quote = el('p', 'a t-voice quote', sc, box(MX, qy) + 'font-size:' + px(fs) + ';line-height:' + px(lineH));
    p.lines = lines.map(function (text, i) {
      var html = esc(text);
      if (i === 0) {
        html = '<span class="hang">“</span><span class="struck">' + esc(SHANNON_STRUCK) + '<i class="strike"></i></span>' + esc(text.slice(SHANNON_STRUCK.length));
      }
      if (i === lines.length - 1) { html += '”'; }
      return el('span', 'ql', p.quote, '', html);
    });
    p.strike = p.quote.querySelector('.strike');

    // our edit: the replacement is written above the struck words, in a different
    // hand (Archivo caps on a Flare block), and carries its own flag
    var editFs = 1.04 * fs;
    var plateH = (LH + 0.24) * editFs;
    p.editTop = qy - plateH + 0.05 * fs;
    // It comes down like a shutter, in place: its top edge stays, its foot drops, and
    // the flag is part of the same block, so the swap is never on screen unmarked.
    p.editH = plateH;
    p.edit = el('div', 'a edit', sc, box(MX - 0.06 * fs, p.editTop, null, plateH) + 'font-size:' + px(editFs),
      '<div class="edit-plate" style="height:' + px(plateH) + '"><b class="t-display edit-new">' + esc(SHANNON_OURS) + '</b><small class="edit-flag">' +
      esc(THEME.tags.edit).replace(' ', '<br>') + '</small></div>');
    p.edit.style.width = px(Math.ceil(p.edit.firstChild.getBoundingClientRect().width));

    var ay = qy + lines.length * lineH + pick(52, 44);
    p.attr = el('p', 'a attr', sc, box(MX, ay), '<i class="ink attr-rule"></i><span class="t-label' + pick('', ' is-tight') + '">' + esc(SHANNON_SOURCE) + '</span>');
    p.attrRule = p.attr.firstChild;
    p.attrText = p.attr.lastChild;

    // five short lines want a quicker stagger than three long ones
    p.lineAt = lines.map(function (_, i) { return S1.lines + (lines.length > 3 ? THEME.motion.swung(i) : i * BEAT); });
    p.el = sc;
    return p;
  }

  function drawShannon(p, t) {
    if (t < S1.yearOut) { block(p.year, 0, t, S1.yearIn, false); }
    else { block(p.year, 0, t, S1.yearOut, true); }
    show(p.kicker, t >= S1.kicker);
    for (var i = 0; i < p.lines.length; i++) { wipe(p.lines[i], t, p.lineAt[i]); }
    show(p.attr, t >= S1.attribution);
    rule(p.attrRule, t, S1.attribution);
    rule(p.strike, t, S1.strike);
    var fall = drop(seg(t, S1.edit, DROP));
    show(p.edit, t >= S1.edit);
    p.edit.style.height = px(fall * p.editH);
  }

  /* ======================================================================
   * 2. The pitches. Each one meets a gate, and each gate says NO: one bay,
   *    then two, four, eight, a beat apart, an eighth apart, a sixteenth.
   *    The speed-up is spatial (each NO lands in its own bay), so nothing
   *    flashes in place.
   * ==================================================================== */

  var DOCK_X = pick(48, 40);
  var DOCK_W = W - 2 * DOCK_X;
  var ROW1 = [{ y: 56, h: 952, through: 72 }];                                       // the shutter runs off the stage
  var ROW2 = [{ y: 32, h: 476, through: 32 }, { y: 556, h: 476, through: 32 }];

  function pitchHtml(text) { return esc(text).replace(/\|/g, '<br>'); }

  function buildPitches() {
    var sc = scene('s-pitches', 'on-card');
    var shapes = pick(
      [{ cols: 1, rows: ROW1 }, { cols: 2, rows: ROW1, fs: 150, pad: 56, top: 60, no: 430 },
        { cols: 4, rows: ROW1, fs: 100, pad: 32, top: 44, no: 320 }, { cols: 4, rows: ROW2, fs: 66, pad: 30, top: 30, no: 196 }],
      [{ cols: 1, rows: ROW1 }, { cols: 2, rows: ROW1, fs: 86, pad: 36, top: 48, no: 350 },
        { cols: 2, rows: ROW2, fs: 80, pad: 36, top: 34, no: 230 }, { cols: 4, rows: ROW2, fs: 43, pad: 16, top: 24, no: 170 }]);
    var next = 0;
    var p = { el: sc, phases: [] };

    shapes.forEach(function (shape, k) {
      var host = el('div', 'a ph', sc, box(0, 0, W, H));
      var ph = { el: host, bays: [], docks: [], stack: null };
      shape.rows.forEach(function (row) {
        var d = dock(host, { x: DOCK_X, y: row.y, w: DOCK_W, h: row.h, n: shape.cols, through: row.through });
        ph.docks.push(d);
        d.bays.forEach(function (bay) {
          var text = PITCHES[next++];
          if (k === 0) {
            // the first pitch gets the whole stage: a fitted stack, top left,
            // and room at the foot of the bay for what is coming
            // (one line across the wide stage, two on the square one)
            var so = { x: MX - bay.x, y: 64, measure: W - 2 * MX, lines: pick([text.replace('|', ' ')], text.split('|')), leading: 0.8 };
            ph.stack = makeStack(bay.open, { name: 'pitch', x: so.x, y: so.y, measure: so.measure, lines: so.lines, leading: so.leading });
            makeStack(shutWords(bay), { x: so.x, y: so.y, measure: so.measure, lines: so.lines, leading: so.leading, bars: false });
            printNo(d, bay, pick(620, 470), MX - bay.x, true);
          } else {
            // the rest are equals: one size, one width, never justified
            var lh = 0.84;
            var css = box(shape.pad, shape.top - (lh - LH) / 2 * shape.fs, bay.w - shape.pad * 2) + 'font-size:' + px(shape.fs) + ';line-height:' + lh;
            el('p', 'a t-display pitch', bay.open, css, pitchHtml(text));
            el('p', 'a t-display pitch', shutWords(bay), css, pitchHtml(text));
            printNo(d, bay, shape.no, shape.pad * 0.8, false);
          }
          bay.d = d;
          ph.bays.push(bay);
        });
      });
      p.phases.push(ph);
    });
    return p;
  }

  function drawPitches(p, t) {
    for (var k = 0; k < p.phases.length; k++) {
      var ph = p.phases[k];
      var on = t >= S2.phase[k] && (k === p.phases.length - 1 || t < S2.phase[k + 1]);
      show(ph.el, on);
      if (!on) { continue; }
      if (ph.stack) {
        for (var j = 0; j < ph.stack.lines.length; j++) { block(ph.stack, j, t, S2.lines[Math.min(j, S2.lines.length - 1)], false); }
      }
      for (var i = 0; i < ph.bays.length; i++) {
        setShutter(ph.bays[i], ph.bays[i].d.through * drop(seg(t, S2.drops[k][i], DROP)));
      }
    }
  }

  /* ======================================================================
   * 3. One dull line. The gate stands up around it and the shutter comes
   *    down on it as well, but only to the floor, and with no word on it.
   *    Then it lifts. PASS.
   * ==================================================================== */

  function buildSurvivor() {
    var sc = scene('s-survivor', 'on-card');
    var d = dock(sc, { x: DOCK_X, y: 56, w: DOCK_W, h: 952, n: 1, through: 0 });
    var bay = d.bays[0];
    var x = MX - bay.x;
    var fs = pick(132, 128);
    var top = pick(372, 330);
    var sayLines = pick([SURVIVOR], (function () { var w = SURVIVOR.split(' '); return [w.slice(0, 2).join(' '), w.slice(2).join(' ')]; }()));
    var asideTop = top + sayLines.length * 1.04 * fs + pick(26, 30);
    var p = { el: sc, d: d, bay: bay, say: [], aside: [] };

    [bay.open, bay.shut].forEach(function (layer) {
      p.say.push(el('p', 'a t-say', layer, box(x, top) + 'font-size:' + px(fs), sayLines.map(esc).join('<br>')));
      p.aside.push(el('p', 'a t-voice', layer, box(x, asideTop) + 'font-size:' + px(pick(64, 60)) + ';white-space:nowrap', esc(SURVIVOR_ASIDE)));
    });

    p.pass = printPass(d, bay, x);
    p.tab = pullTab(sc, d, bay);

    // carried forward: the through-arrow at floor level, and the words under the bay
    var aw = pick(12, 10);
    p.arrowW = bay.w - 2 * x;
    p.arrowHead = aw * 6;
    p.arrow = el('i', 'a arrow', bay.open, box(x, d.full - Math.max(4 * LINE, Math.round(d.full * 0.12)) - aw * 3.5, p.arrowW, aw * 7) + '--aw:' + px(aw));
    p.carried = el('p', 'a t-label', sc, box(MX, 56 + 952 + 20), 'Carried forward');
    return p;
  }

  function drawSurvivor(p, t) {
    var d = p.d, i;
    for (i = 0; i < 2; i++) {
      show(p.say[i], t >= S3.line);
      wipe(p.aside[i], t, S3.aside);
    }
    // the gate stands up: the floor is drawn, the frame rises from it
    var up = arrive(seg(t, S3.frame, EIGHTH));
    rule(d.floor, t, S3.frame);
    show(d.floor, t >= S3.frame);
    d.frame.style.clipPath = up >= 1 ? '' : 'inset(' + ((1 - up) * 100).toFixed(3) + '% 0 0 0)';
    // down to the floor, a held breath, and up again
    var h = t < S3.lift ? d.full * drop(seg(t, S3.shut, DROP)) : d.full - (d.full - d.raised) * lift(seg(t, S3.lift, BEAT));
    setShutter(p.bay, h);
    show(p.pass, t >= S3.pass);
    show(p.tab, t >= S3.open);
    var a = seg(t, S3.open, BEAT);                       // drawn at one constant speed
    show(p.arrow, t >= S3.open);
    p.arrow.style.width = px(Math.max(p.arrowHead, a * p.arrowW));
    show(p.carried, t >= S3.carried);
  }

  /* ======================================================================
   * 4. The premise, in the abstract's own two lines.
   * ==================================================================== */

  function buildPremise() {
    var sc = scene('s-premise', 'on-ink');
    var p = { el: sc };
    var measure = pick(1088, 900);
    var top = pick(120, 72);
    p.stack = makeStack(sc, { name: 'premise', x: MX, y: top, measure: measure, lines: PREMISE_1 });
    p.field = el('i', 'a flare', sc, box(0, 0, 0, 0));
    sc.appendChild(p.stack.el);                           // type above the field
    p.fieldW = MX + measure + pick(48, 108);

    if (wide) {
      p.note = el('div', 'a note on-card', sc, box(1264, 316, 656, 764));
      p.voice = PREMISE_2.map(function (text, i) {
        return el('p', 'a t-voice', p.note, box(52, 178 + i * 72) + 'font-size:64px;line-height:72px;white-space:nowrap', esc(text));
      });
      p.worth = makeStack(p.note, { name: 'worth', x: 52, y: 446, measure: 552, lines: PREMISE_2_PUNCH, leading: 0.8 });
      p.noteTravel = 1080;
    } else {
      p.note = el('div', 'a note on-card', sc, box(0, 804, 1080, 276));      // bakePremise() butts it against the Flare field
      p.voice = PREMISE_2.map(function (text, i) {
        return el('p', 'a t-voice', p.note, box(MX, 42 + i * 64) + 'font-size:56px;line-height:64px;white-space:nowrap', esc(text));
      });
      p.worth = makeStack(p.note, { name: 'worth', x: 560, y: 62, measure: 448, lines: PREMISE_2_PUNCH, leading: 0.8 });
    }
    return p;
  }

  function bakePremise(p) {
    // called after the stacks are fitted: place the Flare field behind the punch line
    var f = p.stack.fit;
    var gap = 0.15 * f.size;
    var last = p.stack.lines[p.stack.lines.length - 1];
    last.style.marginTop = px(gap);
    last.classList.add('is-punch');
    var y = p.stack.o.y + (p.stack.lines.length - 1) * f.pitch + gap;
    p.field.style.cssText += box(0, y - 0.085 * f.size, p.fieldW, (LH + 0.17) * f.size);
    p.punchBar = p.stack.bars[p.stack.bars.length - 1];
    p.punchBar.style.top = px((p.stack.lines.length - 1) * f.pitch + gap - barOver(f.size));
    if (!wide) {
      // the note is the rest of the card below the field
      var foot = Math.round(y - 0.085 * f.size + (LH + 0.17) * f.size);
      p.note.style.top = px(foot);
      p.note.style.height = px(H - foot);
      var room = H - foot;
      p.voice.forEach(function (v, i) { v.style.top = px((room - 3 * 64) / 2 - 4 + i * 64); });
      p.worth.el.style.top = px((room - (LH * 0.8 + CAP) * p.worth.fit.size) / 2 + 6);
    }
  }

  function drawPremise(p, t) {
    var n = p.stack.lines.length, i;
    for (i = 0; i < n - 1; i++) { block(p.stack, i, t, S4.lines[i], false); }
    // the punch: its block is the Flare field, and it stays
    var g = arrive(seg(t, S4.punch, SIX));
    p.field.style.clipPath = g >= 1 ? '' : 'inset(0 ' + ((1 - g) * 100).toFixed(3) + '% 0 0)';
    show(p.field, t >= S4.punch);
    show(p.stack.lines[n - 1], t >= S4.punch + SIX);
    p.punchBar.style.width = '0';

    show(p.note, t >= S4.note);
    if (wide) {
      var fall = drop(seg(t, S4.note, DROP));
      p.note.style.transform = fall >= 1 ? '' : 'translateY(' + px(-(1 - fall) * p.noteTravel) + ')';
    } else {
      var across = arrive(seg(t, S4.note, EIGHTH));
      p.note.style.clipPath = across >= 1 ? '' : 'inset(0 ' + ((1 - across) * 100).toFixed(3) + '% 0 0)';
    }
    for (i = 0; i < p.voice.length; i++) { wipe(p.voice[i], t, S4.voice + THEME.motion.swung(i)); }
    for (i = 0; i < p.worth.lines.length; i++) { block(p.worth, i, t, S4.worth[i], false); }
  }

  /* ======================================================================
   * 5. The four gates shut, one to a beat. Each name runs up its door.
   * ==================================================================== */

  /* a name running up a bay: its foot at (x, bottom), cap-top to the left */
  function nameUp(layer, text, x, bottom, size) {
    return el('b', 'a t-display up', layer, 'left:0;top:0;font-size:' + px(size) + ';transform:translate(' + px(x) + ',' + px(bottom) + ') rotate(-90deg)', esc(text));
  }

  function buildGates() {
    var sc = scene('s-gates', 'on-card');
    var d = dock(sc, { x: DOCK_X, y: 56, w: DOCK_W, h: 952, n: 4, through: 0 });
    var pad = pick(36, 18);
    var labelH = 32;
    // one size for all four, because they are equals: the longest name sets it
    var longest = 0;
    GATES.forEach(function (g) { longest = Math.max(longest, width100(g.toUpperCase(), 't-display')); });
    var room = d.full - pad * 2 - labelH - pick(56, 44);
    var size = Math.min(pick(214, 176), Math.floor(room / (longest / 100)));
    d.bays.forEach(function (bay, i) {
      [bay.open, bay.shut].forEach(function (layer, k) {
        el('p', 'a t-label' + pick('', ' is-tight'), layer, box(pad, pad), 'Gate ' + (i + 1));
        if (k === 1) { nameUp(layer, GATES[i], pad - 0.01 * size, d.full - pad + 0.02 * size, size); }
      });
    });
    return { el: sc, d: d };
  }

  function drawGates(p, t) {
    for (var i = 0; i < p.d.bays.length; i++) {
      setShutter(p.d.bays[i], p.d.full * drop(seg(t, S5.drops[i], DROP)));
    }
  }

  /* ======================================================================
   * 6. The title card. The sleeve pulls back to the spine, the stack arrives
   *    behind blocks, three gates open on three beats, the fourth strains
   *    three times and cannot, and after a second of nothing the slab drops
   *    with NO printed on it. Stop-time in negative. Then the fine print.
   * ==================================================================== */

  function buildTitle() {
    var sc = scene('s-title', 'on-card');
    var w = cardWords();
    var spineW = pick(88, 56);
    var x = pick(128, 96);
    var p = { el: sc, spineW: spineW };

    // the slab's own rectangle, and the field that prints in negative beside it
    var slabBox = pick({ x: 926, y: 0, w: 994, h: 1080 }, { x: spineW, y: 500, w: W - spineW, h: 580 });
    var fieldBox = pick({ x: spineW, y: 0, w: 926 - spineW, h: 1080 }, { x: spineW, y: 0, w: W - spineW, h: 500 });
    p.field = el('i', 'a lfield', sc, box(fieldBox.x, fieldBox.y, fieldBox.w, fieldBox.h));

    // ---- the slab: one object. The NO is printed on it and never moves on its own.
    p.slabClip = el('div', 'a', sc, box(slabBox.x, slabBox.y, slabBox.w, slabBox.h) + 'overflow:hidden');
    p.slab = el('div', 'a slab', p.slabClip, box(0, 0, slabBox.w, slabBox.h));
    p.slabH = slabBox.h;
    var sx = pick(44, x - spineW);                          // the slab's inner left edge
    var noTop = pick(150, 124);
    var noMeasure = pick(906, 600);
    p.catalogue = el('p', 'a catalogue', p.slab, box(sx, pick(64, 36)), esc(w.catalogue));
    p.no = makeStack(p.slab, { name: 'no', x: sx, y: noTop, measure: noMeasure, lines: [w.slab], bars: false });
    p.rule = el('i', 'a lamp', p.slab, box(sx, pick(847, 80), pick(906, W - spineW - 2 * sx), 6) + 'transform-origin:0 50%');
    p.cols = [];
    p.fine = [['When', w.when], ['Time', w.time], ['Room', w.room]];
    p.slabInner = { sx: sx, noTop: noTop, noMeasure: noMeasure };

    // ---- the left field
    p.left = el('div', 'a lgroup', sc, box(0, 0, W, H));
    p.kicker = el('p', 'a t-label', p.left, box(x, pick(64, 56)), esc(w.kicker));
    // on the wide card the four lines are spaced to stand exactly as tall as the NO, as on the deck's title slide
    p.title = makeStack(p.left, {
      name: 'title', x: x, y: pick(150, 122), measure: pick(750, W - x - 64), lines: pick(w.four, w.two),
      leading: pick(null, 0.83), height: pick(function () { return CAP * p.no.fit.size; }, null)
    });
    p.titleLines = pick(S6.lines, [S6.lines[0], S6.lines[2]]);
    var sub = pick(halve(w.subtitle), [w.subtitle]);
    p.sub = el('p', 'a t-voice', p.left, box(x, pick(800, 330)) + 'font-size:54px;line-height:' + px(54 * 1.1) + ';white-space:nowrap', sub.map(esc).join('<br>'));
    p.credit = el('p', 'a credit' + pick('', ' is-row'), p.left, box(x, pick(938, 414)), '<b>' + esc(w.name) + '</b><span>' + esc(w.role) + '</span>');
    p.name = p.credit.firstChild;
    p.role = p.credit.lastChild;

    // ---- the spine: it starts as the whole sleeve and pulls back to the left edge
    p.spine = el('i', 'a spine', sc, box(0, 0, spineW, H));
    p.words = w;
    return p;
  }

  function bakeTitle(p) {
    // called after the stacks are fitted
    var w = p.words;
    var sc = p.el;
    var noFit = p.no.fit;
    var capH = CAP * noFit.size;                       // the NO is exactly as tall as the dock
    var s = p.slabInner;
    var slabLeft = pick(926, p.spineW), slabTop = pick(0, 500);

    // the fine print
    if (wide) {
      p.fine.forEach(function (c, i) {
        p.cols.push(el('div', 'a fine', p.slab, box(s.sx + [0, 326, 652][i], 877, null, null),
          '<span class="t-label">' + esc(c[0]) + '</span><b class="t-display">' + c[1].map(esc).join('<br>') + '</b>'));
      });
    } else {
      // a column beside the NO, as tall as the NO: top on its cap line, foot on its baseline
      var colX = s.sx + s.noMeasure + 44;
      var ddSize = 42, blockH = 22 + 14 + ddSize * 0.92 + CAP * ddSize;
      var step = (capH - blockH) / 2;
      p.fine.forEach(function (c, i) {
        p.cols.push(el('div', 'a fine is-s', p.slab, box(colX, s.noTop + i * step - 5, null, null),
          '<span class="t-label is-tight">' + esc(c[0]) + '</span><b class="t-display">' + c[1].map(esc).join('<br>') + '</b>'));
      });
    }

    // ---- the count-in dock stands exactly where the NO will land
    var dk = dock(sc, { x: slabLeft + s.sx, y: slabTop + s.noTop, w: pick(906, W - p.spineW - 2 * s.sx), h: capH + LINE, n: 4, through: 0 });
    p.dock = dk;
    var longest = 0;
    GATES.forEach(function (g) { longest = Math.max(longest, width100(g.toUpperCase(), 't-display')); });
    var nameSize = Math.min(104, Math.floor((dk.full - dk.raised - 30) / (longest / 100)));
    p.passes = [];
    p.tabs = [];
    dk.bays.forEach(function (bay, i) {
      var nx = (bay.w - LH * nameSize) / 2;
      [bay.open, bay.shut].forEach(function (layer) { nameUp(layer, GATES[i], nx, dk.full - 14, nameSize); });
      if (i < 3) {
        p.passes.push(printPass(dk, bay, Math.round(bay.w * 0.07)));
        p.tabs.push(pullTab(sc, dk, bay));
      }
    });
    p.dockNodes = [dk.frame, dk.floor].concat(dk.bays.map(function (b) { return b.open; }), dk.bays.map(function (b) { return b.shut; }), p.tabs);
    // paint order: the slab above the dock, the spine above everything
    sc.appendChild(p.slabClip);
    sc.appendChild(p.spine);
    // how far gate four gets on each try, as a share of the lift it never completes
    p.reach = [0.16, 0.27, 0.4].map(function (k) { return k * (dk.full - dk.raised); });
  }

  /* Gate four: up for an eighth, a sixteenth of strain, and it falls shut in a
   * sixteenth, landing exactly on the next beat. u is seconds into the try. */
  function strain(u, reach) {
    if (u < 0 || u >= BEAT) { return 0; }
    if (u < EIGHTH) { return reach * lift(u / EIGHTH); }
    if (u < EIGHTH + SIX) { return reach - 5 * Math.abs(Math.sin((u - EIGHTH) * Math.PI * 16)); }
    return reach * (1 - drop((u - EIGHTH - SIX) / SIX));
  }

  function drawTitle(p, t) {
    var dk = p.dock, i;

    // the sleeve pull: the cover retreats left and becomes the spine
    var pull = arrive(seg(t, S6.pull, BEAT));
    p.spine.style.width = px(W - pull * (W - p.spineW));

    // the left field. Labels cut; display lines arrive behind a block; the voice wipes
    show(p.kicker, t >= S6.kicker);
    for (i = 0; i < p.title.lines.length; i++) { block(p.title, i, t, p.titleLines[i], false); }
    wipe(p.sub, t, S6.sub);
    show(p.name, t >= S6.name);
    show(p.role, t >= S6.role);

    // the count-in: one, two, three
    var covered = t >= S6.land;
    for (i = 0; i < p.dockNodes.length; i++) { show(p.dockNodes[i], !covered); }
    if (!covered) {
      for (i = 0; i < 3; i++) {
        setShutter(dk.bays[i], dk.full - (dk.full - dk.raised) * lift(seg(t, S6.lifts[i], BEAT)));
        show(p.passes[i], t >= S6.lifts[i] + BEAT - SIX);
        show(p.tabs[i], t >= S6.lifts[i] + BEAT);
      }
      // the fourth tries, and cannot. Three times, each harder than the last.
      var up = 0;
      for (i = 0; i < S6.strains.length; i++) { up += strain(t - S6.strains[i], p.reach[i]); }
      setShutter(dk.bays[3], dk.full - up);
    }

    // NO. The slab falls for three sixteenths and stops dead.
    var fall = drop(seg(t, S6.drop, DROP));
    show(p.slabClip, t >= S6.drop);
    p.slab.style.transform = fall >= 1 ? '' : 'translateY(' + px(-(1 - fall) * p.slabH) + ')';

    // impact: the rest of the card recoils and settles inside three sixteenths,
    // and prints in negative for the stop-time hold. Nothing else moves.
    var since = t - S6.land;
    var jolt = since >= 0 && since < DROP ? 14 * (1 - arrive(since / DROP)) : 0;
    p.left.style.transform = jolt ? 'translateY(' + px(jolt) + ')' : '';
    var negative = t >= S6.land && t < S6.positive;
    if (p.el.classList.contains('is-negative') !== negative) { p.el.classList.toggle('is-negative', negative); }

    // back in positive: the rule is drawn and the fine print cuts in, swung
    show(p.catalogue, t >= S6.fine[0]);
    show(p.rule, t >= S6.fine[0]);
    rule(p.rule, t, S6.fine[0]);
    for (i = 0; i < p.cols.length; i++) { show(p.cols[i], t >= S6.fine[i]); }
  }

  /* ======================================================================
   * The cut between scenes: a block of the next card's stock runs in from
   * the left in an eighth. The last cut is the sleeve itself.
   * ==================================================================== */

  var P = {};
  var cover = null;

  function build() {
    P.shannon = buildShannon();
    P.pitches = buildPitches();
    P.survivor = buildSurvivor();
    P.premise = buildPremise();
    P.gates = buildGates();
    P.title = buildTitle();
    cover = el('i', 'a cover', film, box(0, 0, 0, H));
    stacks.forEach(bakeStack);                 // every stack, once, now that the fonts are in
    bakePremise(P.premise);
    bakeTitle(P.title);
  }

  var CUTS = [
    { at: T.pitches, ink: 'card' },
    { at: T.premise, ink: 'lamp' },
    { at: T.gates, ink: 'card' },
    { at: T.title, ink: 'lamp' }               // the sleeve covers the stage; the title's spine takes over from it
  ];

  function render(time) {
    var t = time < 0 ? 0 : (time > DURATION ? DURATION : time);
    var a = t < T.pitches + EIGHTH;
    var b = !a && t < T.survivor;
    var c = t >= T.survivor && t < T.premise + EIGHTH;
    var d = t >= T.premise + EIGHTH && t < T.gates + EIGHTH;
    var e = t >= T.gates + EIGHTH && t < T.title + EIGHTH;
    var f = t >= T.title + EIGHTH;
    show(P.shannon.el, a);
    show(P.pitches.el, b);
    show(P.survivor.el, c);
    show(P.premise.el, d);
    show(P.gates.el, e);
    show(P.title.el, f);
    if (a) { drawShannon(P.shannon, t - T.shannon); }
    if (b) { drawPitches(P.pitches, t - T.pitches); }
    if (c) { drawSurvivor(P.survivor, t - T.survivor); }
    if (d) { drawPremise(P.premise, t - T.premise); }
    if (e) { drawGates(P.gates, t - T.gates); }
    if (f) { drawTitle(P.title, t - T.title); }

    var w = 0, ink = '';
    for (var i = 0; i < CUTS.length; i++) {
      if (t >= CUTS[i].at && t < CUTS[i].at + EIGHTH) { w = arrive(seg(t, CUTS[i].at, EIGHTH)) * W; ink = CUTS[i].ink; }
    }
    if (w > 0) {
      cover.className = 'a cover ' + ink;
      cover.style.width = px(w);
      show(cover, true);
    } else {
      show(cover, false);
    }
    current = t;
  }

  /* ======================================================================
   * Transport
   * ==================================================================== */

  var ready = false;
  var manual = false;          // true once __setTime has been called: the clock is frozen
  var pending = null;
  var current = 0;
  var playing = false;
  var origin = 0;              // Motion time at film time 0
  var ui = null;

  window.__duration = DURATION;
  window.__ready = false;
  window.__marks = [
    { t: 0.02, name: 'black' }, { t: 1.2, name: '1956' }, { t: 4.2, name: 'shannon as written' },
    { t: 7.2, name: 'our edit' }, { t: T.pitches + 1.5, name: 'pitch 1' }, { t: T.pitches + 2.6, name: 'no 1' },
    { t: T.pitches + 4.9, name: 'two' }, { t: T.pitches + 6.9, name: 'four' }, { t: T.pitches + 9.2, name: 'eight' },
    { t: T.survivor + 1.45, name: 'the dull line' }, { t: T.survivor + 2.8, name: 'shut' }, { t: T.survivor + 4.6, name: 'pass' },
    { t: T.premise + 2.4, name: 'wrong' }, { t: T.premise + 5.8, name: 'worth thousands' },
    { t: T.gates + 2.8, name: 'four gates' }, { t: T.title + 3.45, name: 'title built' },
    { t: T.title + 4.95, name: 'three open' }, { t: T.title + 6.3, name: 'the fourth strains' },
    { t: T.title + 7.2, name: 'held' }, { t: T.title + 8.5, name: 'negative' }, { t: DURATION, name: 'title card' }
  ];

  /** Draw exactly the frame at `seconds`. Freezes the clock: no real time passes after this. */
  window.__setTime = function (seconds) {
    var t = Math.max(0, Math.min(DURATION, Number(seconds) || 0));
    if (!manual) {
      manual = true;
      playing = false;
      origin = 0;
      M.useManualClock(t);
      doc.documentElement.classList.add('is-capture');
    }
    if (!ready) { pending = t; return false; }
    M.setTime(t);              // runs one frame of the Motion loop, which draws
    render(M.now() - origin);  // and once more by hand, so the frame is drawn even with no loop running
    return true;
  };

  function frame(now) {
    if (manual) { render(now - origin); return; }
    if (!playing) { return; }
    var t = now - origin;
    if (t >= DURATION) { t = DURATION; playing = false; }
    render(t);
    updateUi();
  }

  function play(from) {
    if (manual) { return; }
    origin = M.now() - (from || 0);
    playing = true;
    updateUi();
  }

  function pause() {
    playing = false;
    updateUi();
  }

  function fitToWindow() {
    var sc = Math.min(window.innerWidth / W, window.innerHeight / H);
    if (!(sc > 0)) { sc = 1; }
    if (Math.abs(sc - 1) < 0.0005) { film.style.transform = ''; film.style.left = '0'; film.style.top = '0'; return; }
    film.style.transform = 'scale(' + sc + ')';
    film.style.left = Math.round((window.innerWidth - W * sc) / 2) + 'px';
    film.style.top = Math.round((window.innerHeight - H * sc) / 2) + 'px';
  }

  /* ---- the replay control (never in a capture: __setTime hides it) ---- */

  function buildUi() {
    ui = el('div', 'film-ui', doc.body, '',
      '<button type="button" data-do="replay" title="Replay (R)">Replay</button>' +
      '<button type="button" data-do="toggle" title="Play / pause (Space)">Pause</button>' +
      '<span class="film-ui-time" aria-live="off"></span>' +
      '<span class="film-ui-note">Silent film · Space pause · R replay · ← → one beat</span>');
    ui.addEventListener('click', function (ev) {
      var act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-do');
      if (act === 'replay') { play(0); }
      if (act === 'toggle') { toggle(); }
    });
    doc.addEventListener('keydown', function (ev) {
      if (manual) { return; }
      if (ev.key === 'r' || ev.key === 'R') { play(0); }
      else if (ev.key === ' ') { ev.preventDefault(); toggle(); }
      else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        playing = false;
        var to = Math.round(current / BEAT) * BEAT + (ev.key === 'ArrowRight' ? BEAT : -BEAT);
        render(Math.max(0, Math.min(DURATION, to)));
        updateUi();
      }
    });
    var hideTimer = null;
    doc.addEventListener('mousemove', function () {
      doc.documentElement.classList.add('is-awake');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { doc.documentElement.classList.remove('is-awake'); }, 1800);
    });
  }

  function toggle() {
    if (playing) { pause(); }
    else if (current >= DURATION) { play(0); }
    else { play(current); }
  }

  function updateUi() {
    if (!ui) { return; }
    var ended = !playing && current >= DURATION;
    doc.documentElement.classList.toggle('is-ended', ended);
    doc.documentElement.classList.toggle('is-paused', !playing && !ended);
    ui.querySelector('[data-do="toggle"]').textContent = playing ? 'Pause' : 'Play';
    ui.querySelector('.film-ui-time').textContent = current.toFixed(1) + ' / ' + DURATION.toFixed(0) + ' s';
  }

  function start() {
    try {
      build();                   // measured at scale 1, before any window scaling
    } catch (err) {
      window.__error = String(err && err.message || err);
      throw err;
    }
    var fontsOk = !doc.fonts || !doc.fonts.check || (doc.fonts.check('900 100px Archivo') && doc.fonts.check('italic 600 60px Fraunces'));
    window.__film = {
      width: W, height: H, layout: wide ? 'wide' : 'square', fits: fits, fontsOk: fontsOk,
      poster: DURATION, scenes: T
    };
    ready = true;
    window.__ready = true;
    fitToWindow();
    window.addEventListener('resize', fitToWindow);
    M.raf(frame);
    if ('t' in query && !manual) { pending = Number(query.t) || 0; window.__setTime(pending); }
    if (manual) { window.__setTime(pending == null ? 0 : pending); return; }
    buildUi();
    render(0);
    play(0);
  }

  THEME.whenReady(start);
}());
