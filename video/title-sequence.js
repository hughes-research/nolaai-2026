/*
 * video/title-sequence.js: the title film, "Four gates".  ->  window.__setTime, window.__duration
 *
 * "The Most Valuable AI Skill Is Saying No" · NOAI 2026 · 46 seconds.
 *
 * The talk in miniature. Four dock gates: COST, RETURN, EFFORT, POTENTIAL.
 * Three ideas come to them. The exciting one is pitched big, too big for the
 * door, and the first shutter drops through the floor: NO. The easy one
 * breezes through COST and dies at RETURN: NO. A held breath. The boring
 * one nobody pitched walks through all four on the walking bass, each door
 * lifting on a rising note, and becomes the point. Then the title, and the
 * slab: NO. The last frame holds as the walk-in card.
 *
 * All timing comes from video/score.js (window.SCORE), the same file
 * tools/build-audio.js writes the sound from, so the picture and the sound
 * are cut from one timeline.
 *
 * THE WHOLE FILM IS A PURE FUNCTION OF TIME. render(t) sets every moving
 * property from t alone, so any frame can be drawn in any order and is the
 * same frame every time:
 *
 *     window.__setTime(seconds)   draw exactly that frame (and freeze the clock)
 *     window.__duration           length of the film in seconds
 *     window.__ready              true once the fonts are in and the type is fitted
 *     window.__marks              [{ t, name }] the beats worth looking at
 *     window.__film               { width, height, layout, fontsOk, misfits, poster }
 *
 * Direction (docs/DIRECTION.md, Part 1): Card ground, Lampblack ink, Flare
 * once per frame on the point; Archivo and Fraunces italic; 120 BPM; nothing
 * fades and nothing overshoots. Things cut, hide behind a block, lift or drop.
 * After a NO every later gate is frame only. Nothing moves for 0.8 s before
 * a NO or 0.9 s after it, and a tell-tale mark stays where it hit.
 *
 * Copy: the abstract's two lines (docs/BRIEF.md), the four gate names, the
 * title card (read from deck/content/your-numbers.js when present). The three
 * idea names are generic on purpose. No figures appear except the date and
 * the session time.
 */
(function () {
  'use strict';

  var doc = document;
  var S = window.SCORE;
  var YOUR = window.YOUR || {};
  if (!S) { doc.body.textContent = 'The title film needs score.js next to it.'; return; }

  /* ======================================================================
   * Time
   * ==================================================================== */

  var BEAT = S.beat, EIGHTH = S.eighth, SIX = S.sixteenth, SWING = S.swing, DROP = S.drop;
  var DURATION = S.duration;
  var CAP = 0.688;                 // Archivo's cap height, in em
  var LH = 0.708;                  // the cap-height line box

  function seg(t, start, dur) {
    var p = (t - start) / dur;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  /* cubic-bezier easing, solved by Newton steps then bisection */
  function bezier(x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
    function b(p1, p2) { return 3 * p2 - 6 * p1; }
    function c(p1) { return 3 * p1; }
    function at(s, p1, p2) { return ((a(p1, p2) * s + b(p1, p2)) * s + c(p1)) * s; }
    function slope(s, p1, p2) { return 3 * a(p1, p2) * s * s + 2 * b(p1, p2) * s + c(p1); }
    return function (x) {
      if (x <= 0) { return 0; }
      if (x >= 1) { return 1; }
      var s = x, i;
      for (i = 0; i < 8; i++) {
        var d = at(s, x1, x2) - x, sl = slope(s, x1, x2);
        if (Math.abs(d) < 1e-7) { return at(s, y1, y2); }
        if (Math.abs(sl) < 1e-6) { break; }
        s -= d / sl;
      }
      var lo = 0, hi = 1;
      s = x;
      for (i = 0; i < 40; i++) {
        var v = at(s, x1, x2);
        if (Math.abs(v - x) < 1e-7) { break; }
        if (v < x) { lo = s; } else { hi = s; }
        s = (lo + hi) / 2;
      }
      return at(s, y1, y2);
    };
  }
  var arrive = bezier(0.16, 1, 0.3, 1);    // fast in, dead stop
  var lift = bezier(0.2, 0.8, 0.2, 1);     // a shutter going up
  var drop = bezier(0.55, 0, 1, 0.45);     // gravity: no bounce, no overshoot

  /* ======================================================================
   * Words
   * ==================================================================== */

  function cardWords() {
    var sp = YOUR.speaker || {};
    var ev = YOUR.event || {};
    var minutes = Number(ev.minutes) || 90;
    var date = String(ev.date || 'Friday, Nov 13, 2026');
    var comma = date.indexOf(',');
    var room = String(ev.venue || 'Education Center').split(',')[0].trim();
    return {
      kicker: 'A ' + minutes + '-minute workshop',
      four: ['The most', 'valuable', 'AI skill', 'is saying'],
      two: ['The most valuable', 'AI skill is saying'],
      slab: 'No',
      subtitle: String(ev.subtitle || 'Screening AI use cases for real return.'),
      name: sp.name || 'Dustin T Hughes',
      role: [sp.role || 'VP of Technology', sp.company || 'Laborde Products'].join(', '),
      catalogue: ['Waypoint', ev.name || 'NOAI 2026', 'New Orleans'].join(' · '),
      when: comma > 0 ? [date.slice(0, comma).trim(), date.slice(comma + 1).trim()] : [date],
      time: [String(ev.time || '2:30–4:00 PM'), minutes + ' minutes'],
      room: halve(room)
    };
  }

  function halve(text) {
    var s = String(text || '').trim();
    var best = -1, mid = s.length / 2, i;
    for (i = 0; i < s.length; i++) {
      if (s.charAt(i) === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) { best = i; }
    }
    return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ======================================================================
   * Stage
   * ==================================================================== */

  var query = {};
  String(window.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
    if (!kv) { return; }
    var i = kv.indexOf('=');
    query[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
  });
  var asked = /^(\d+)x(\d+)$/i.exec(query.size || '');
  var askedW = asked ? Number(asked[1]) : ('square' in query ? 1080 : 1920);
  var askedH = asked ? Number(asked[2]) : 1080;
  var wide = askedW / askedH > 1.25;
  var W = wide ? 1920 : 1080;
  var H = 1080;
  function pick(a, b) { return wide ? a : b; }

  var LINE = 8;                                   // posts, lintels, floors
  var L = pick({
    mx: 128, kickerY: 64, titleY: 128, measure: 1664,
    dock: { x: 440, y: 344, w: 1168, h: 476 },
    signMax: 64, signGap: 24,
    arrowH: 40, aw: 8, notch: [36, 14],
    microY: 890, microLines: 1,
    voiceY: 950, voiceSize: 60, voiceTop: false,
    crates: { big: [320, 540], mid: [240, 240], small: [240, 200] }, cratePad: 20,
    titleSizes: { mid: 120, quiet: 96 }
  }, {
    mx: 64, kickerY: 56, titleY: 112, measure: 952,
    dock: { x: 268, y: 424, w: 620, h: 420 },
    signMax: 48, signGap: 20,
    arrowH: 36, aw: 6, notch: [28, 14],
    microY: 908, microLines: 2,
    voiceY: 120, voiceSize: 60, voiceTop: true,
    crates: { big: [196, 450], mid: [112, 200], small: [112, 170] }, cratePad: 12,
    titleSizes: { mid: 100, quiet: 80 }
  });

  var film = doc.getElementById('film');
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
  function show(node, on) {
    var v = on ? '' : 'hidden';
    if (node.style.visibility !== v) { node.style.visibility = v; }
  }
  function widthOf(node) { return node.getBoundingClientRect().width; }

  var misfits = [];

  /* Set a node's font-stretch (Archivo's width axis, 62 to 125) so its width
   * is as close to `target` as the axis allows without going over. */
  function fitStretch(node, target, lo, hi) {
    lo = lo || 62; hi = hi || 125;
    node.style.fontStretch = hi + '%';
    if (widthOf(node) <= target) { return hi; }
    node.style.fontStretch = lo + '%';
    if (widthOf(node) > target) { return -lo; }
    for (var i = 0; i < 16; i++) {
      var m = (lo + hi) / 2;
      node.style.fontStretch = m + '%';
      if (widthOf(node) > target) { hi = m; } else { lo = m; }
    }
    node.style.fontStretch = lo + '%';
    return lo;
  }

  /* A fitted stack: the largest size at which the longest line fits the
   * measure at width 62, then every line walked up the width axis to fill it. */
  function fitStack(lines, measure, name) {
    var widest = 0;
    lines.forEach(function (ln) { ln.style.fontSize = '100px'; ln.style.fontStretch = '62%'; widest = Math.max(widest, widthOf(ln)); });
    var size = Math.floor(measure / widest * 100 * 10) / 10;
    lines.forEach(function (ln) {
      ln.style.fontSize = px(size);
      fitStretch(ln, measure);
      var w = widthOf(ln);
      if (w < measure - 4 || w > measure + 1) { misfits.push(name + ': "' + ln.textContent + '" is ' + Math.round(w) + 'px on ' + measure); }
    });
    return size;
  }

  function width100(text, cls) {
    var p = el('span', cls, film, 'position:absolute;left:0;top:0;visibility:hidden;font-size:100px', esc(text));
    var w = widthOf(p);
    film.removeChild(p);
    return w;
  }

  /* ======================================================================
   * The moves
   * ==================================================================== */

  /* Block reveal: a Lampblack bar runs across the line in a sixteenth, then
   * its left edge retreats in an eighth and leaves the line behind. */
  function makeReveal(parent, node, x, y, size, w) {
    var over = Math.max(4, Math.round(size * 0.03));
    return { node: node, w: w, bar: el('i', 'a bar', parent, box(x, y - over, 0, LH * size + 2 * over)), x: x };
  }
  function reveal(r, t, start) {
    var g = arrive(seg(t, start, SIX));
    var b = arrive(seg(t, start + SIX, EIGHTH));
    r.bar.style.left = px(r.x + b * r.w);
    r.bar.style.width = px(Math.max(0, (g - b) * r.w));
    show(r.node, t >= start + SIX);
    r.node.style.clipPath = b >= 1 ? '' : 'inset(-0.3em ' + ((1 - b) * 100).toFixed(3) + '% -0.3em -0.3em)';
  }
  /* Voice wipe: a Fraunces line wipes in from the left over a swung beat. */
  function wipe(node, t, start) {
    var p = arrive(seg(t, start, SWING));
    show(node, t >= start);
    node.style.clipPath = p >= 1 ? '' : 'inset(-0.4em ' + ((1 - p) * 104).toFixed(3) + '% -0.4em -0.9em)';
  }
  /* A rule drawn from its left end. */
  function rule(node, t, start, dur) {
    var p = arrive(seg(t, start, dur || EIGHTH));
    show(node, t >= start);
    node.style.transform = p >= 1 ? '' : 'scaleX(' + p.toFixed(4) + ')';
  }

  /* ======================================================================
   * The dock: four bays that share posts, a floor, a sign over each door.
   * ==================================================================== */

  var dockScene, D;

  function buildDock() {
    var sc = el('section', 'sc', film);
    var o = L.dock;
    var step = (o.w - LINE) / 4;
    var full = o.h - 3 * LINE;
    D = {
      sc: sc, o: o, step: step, full: full, sw: step - 3 * LINE,
      raised: Math.round(full * 0.2), floorTop: o.y + o.h - LINE, floorBottom: o.y + o.h,
      bays: [], through: L.notch[1]
    };
    D.floor = el('i', 'a ink', sc, box(o.x, D.floorTop, o.w, LINE) + 'transform-origin:0 50%');

    var gates = S.gates;
    var signLongest = 0;
    gates.forEach(function (g) { signLongest = Math.max(signLongest, width100(g, 't-display')); });
    var signSize = Math.min(L.signMax, Math.floor((step - 2 * LINE) / (signLongest / 100)));
    var noSize = Math.min(Math.floor((D.sw - 2 * L.cratePad) / (width100('No', 't-display') / 100)), Math.floor(full * 0.42 / CAP));
    var passSize = Math.min(D.raised * 0.6 / CAP, (D.sw - 2 * L.cratePad) / (width100('Pass', 't-display') / 100));

    for (var i = 0; i < 4; i++) {
      var x = o.x + i * step;
      var bay = { i: i, x: x + 2 * LINE, y: o.y + 2 * LINE, frame: [] };
      // the frame of this bay: its left post, its lintel, and (last bay) the right post
      bay.frame.push(el('i', 'a ink', sc, box(x, o.y, LINE, o.h - LINE)));
      bay.frame.push(el('i', 'a ink', sc, box(x, o.y, step + LINE, LINE)));
      if (i === 3) { bay.frame.push(el('i', 'a ink', sc, box(x + step, o.y, LINE, o.h - LINE))); }
      // the sign over the door: its baseline sits signGap above the lintel
      bay.sign = el('b', 'a t-display', sc, box(x + LINE, o.y - L.signGap - CAP * signSize) + 'font-size:' + px(signSize), esc(gates[i]));
      // the check / PASS shutter (Lampblack) and the NO shutter (Flare, through the floor)
      bay.chk = el('div', 'a shut', sc, box(bay.x, bay.y, D.sw, 0));
      bay.pass = el('b', 'a t-display', bay.chk, box(L.cratePad, (D.raised - CAP * passSize) / 2) + 'font-size:' + px(passSize), 'Pass');
      bay.no = el('div', 'a shut is-no', sc, box(bay.x, bay.y, D.sw, 0));
      bay.noWord = el('b', 'a t-display', bay.no, 'left:' + px(L.cratePad) + ';bottom:' + px(D.through + LINE + L.cratePad * 0.75) + ';font-size:' + px(noSize), 'No');
      bay.tab = el('i', 'a ink', sc, box(bay.x + (D.sw - Math.round(D.sw * 0.2)) / 2, bay.y + D.raised, Math.round(D.sw * 0.2), 14));
      // under the bay: the tell-tale notch, the through-arrow, the microcopy
      bay.notch = el('i', 'a ink', sc, box(bay.x + (D.sw - L.notch[0]) / 2, D.floorBottom, L.notch[0], L.notch[1]));
      bay.arrowW = D.sw;
      bay.arrow = el('i', 'a arrow', sc, box(bay.x, D.floorBottom + L.notch[1] + 4, D.sw, L.arrowH) + '--aw:' + px(L.aw));
      bay.carried = micro(sc, bay, ['Carried', 'forward']);
      bay.h = -1; bay.nh = -1;
      D.bays.push(bay);
    }

    dockScene = sc;
    return sc;
  }

  /* Microcopy under a bay: 32px wide caps, never smaller; set on one line if
   * the bay allows it (wide stage), on two otherwise, narrowed on the width axis to fit. */
  function micro(parent, bay, lines, room) {
    var node = el('p', 'a t-label micro', parent, box(bay.x, L.microY));
    room = room || D.sw;
    var one = lines.join(' ');
    if (L.microLines === 1) {
      node.textContent = one;
      if (fitStretch(node, room, 62, 80) > 0) { return node; }
    }
    node.innerHTML = lines.map(esc).join('<br>');
    if (fitStretch(node, room, 62, 80) < 0) { misfits.push('micro: "' + one + '" does not fit ' + room + 'px'); }
    return node;
  }

  function setChk(bay, h) {
    var v = Math.round(h * 10) / 10;
    if (bay.h !== v) { bay.chk.style.height = v + 'px'; bay.h = v; }
  }
  function setNo(bay, h) {
    var v = Math.round(h * 10) / 10;
    if (bay.nh !== v) { bay.no.style.height = v + 'px'; bay.nh = v; }
  }

  /* ======================================================================
   * The ideas
   * ==================================================================== */

  var IDEAS = [];
  var introKicker;

  function waitX(idea, i) {
    if (i >= 4) { return L.dock.x + L.dock.w + 16; }                 // the far side of the dock
    return L.dock.x + i * D.step - 12 - idea.cw;
  }

  function buildIdeas(sc) {
    introKicker = el('p', 'a t-label', sc, box(L.mx, L.kickerY), esc(S.intro.kickerText));
    S.ideas.forEach(function (s) {
      var p = { s: s, lines: [], reveals: [], strikes: [], voice: [] };
      p.kicker = el('p', 'a t-label', sc, box(L.mx, L.kickerY), esc(s.kicker));
      // the title, in the idea's own register
      var lines = wide ? [s.title.join(' ')] : s.title.slice();     // one line on the wide stage
      var cls = s.register === 'quiet' ? 'a t-say' : 'a t-display';
      p.lines = lines.map(function (text) { return el('span', cls + ' ln', sc, '', esc(text)); });
      var size, pitch;
      if (s.register === 'loud') {
        size = fitStack(p.lines, L.measure, 'idea ' + s.n);
        pitch = 0.8 * size;
      } else {
        size = L.titleSizes[s.register];
        p.lines.forEach(function (ln) { ln.style.fontSize = px(size); });
        var widest = Math.max.apply(null, p.lines.map(widthOf));
        if (widest > L.measure) { size = Math.floor(size * L.measure / widest); p.lines.forEach(function (ln) { ln.style.fontSize = px(size); }); }
        pitch = s.register === 'quiet' ? 1.04 * size : 0.8 * size;
      }
      p.size = size;
      var topAdj = s.register === 'quiet' ? (1.04 - CAP) / 2 * size + 0.02 * size : 0;
      p.lines.forEach(function (ln, k) {
        var y = L.titleY + k * pitch - topAdj;
        ln.style.left = px(L.mx); ln.style.top = px(y);
        var w = widthOf(ln);
        if (s.register !== 'quiet') { p.reveals.push(makeReveal(sc, ln, L.mx, L.titleY + k * pitch, size, w)); }
        var th = Math.max(8, Math.round(0.06 * size));
        p.strikes.push(el('i', 'a strike', sc, box(L.mx - 0.04 * size, L.titleY + k * pitch + CAP * size / 2 - th / 2, w + 0.08 * size, th)));
      });
      p.titleBottom = L.titleY + (p.lines.length - 1) * pitch + CAP * size;

      // the voice line
      if (s.voice) {
        var vl = L.voiceTop ? s.voice.lines.slice() : [s.voice.lines.join(' ')];
        var vsize = L.voiceSize;
        var nodes = vl.map(function (text) { return el('p', 'a t-voice', sc, 'font-size:' + px(vsize), esc(text)); });
        // one line on the wide stage, as large as fits (never under 54); broken in two on the square
        var widestV = Math.max.apply(null, nodes.map(widthOf));
        if (widestV > L.measure) {
          if (L.voiceTop && nodes.length === 1) {
            nodes[0].parentNode.removeChild(nodes[0]);
            nodes = halve(vl[0]).map(function (text) { return el('p', 'a t-voice', sc, 'font-size:' + px(vsize), esc(text)); });
            widestV = Math.max.apply(null, nodes.map(widthOf));
          }
          if (widestV > L.measure) {
            vsize = Math.floor(vsize * L.measure / widestV);
            if (vsize < 54) { misfits.push('voice: "' + vl.join(' ') + '" would be ' + vsize + 'px'); vsize = 54; }
            nodes.forEach(function (n) { n.style.fontSize = px(vsize); });
          }
        }
        nodes.forEach(function (n, k) { n.style.left = px(L.mx); n.style.top = px(L.voiceY + k * vsize * 1.16); });
        p.voice = nodes;
      }

      // the crate
      var c = L.crates[s.size];
      p.cw = c[0]; p.ch = c[1];
      p.crate = el('div', 'a crate', sc, box(0, D.floorTop - p.ch, p.cw, p.ch));
      var numSize = Math.min((p.ch * 0.5) / CAP, (p.cw - 2 * L.cratePad) / (width100(String(s.n), 't-display') / 100));
      el('b', 'a t-display', p.crate, box(L.cratePad, L.cratePad) + 'font-size:' + px(numSize), String(s.n));

      // the reason under the bay that says NO (on the wide stage it may run on under the
      // next bay: after a NO every later gate is frame only and has no words of its own)
      p.reasons = [];
      s.gates.forEach(function (g) {
        if (g.verdict === 'no') { p.reasons.push({ gate: g.gate, node: micro(sc, D.bays[g.gate], wide ? s.reason : s.reasonShort, wide ? D.sw + D.step : D.sw) }); }
      });
      IDEAS.push(p);
    });
  }

  function crateX(p, t) {
    var s = p.s;
    var x = -p.cw - 40;
    var pe = arrive(seg(t, s.enter[0], s.enter[1] - s.enter[0]));
    x = x + (waitX(p, 0) - x) * pe;
    s.gates.forEach(function (g) {
      if (g.verdict === 'pass') {
        var q = arrive(seg(t, g.travel[0], g.travel[1] - g.travel[0]));
        if (q > 0) { x = waitX(p, g.gate) + (waitX(p, g.gate + 1) - waitX(p, g.gate)) * q; }
      }
    });
    return x;
  }

  /* Which idea the dock belongs to at time t: the cover swaps them while it is full. */
  function ideaAt(t) {
    var k = 0;
    for (var i = 1; i < IDEAS.length; i++) { if (t >= S.ideas[i - 1].out + SIX) { k = i; } }
    return k;
  }

  function drawDock(t) {
    var i, k = ideaAt(t);
    var intro = S.intro;

    // the dock stands up: the floor is drawn, each bay rises from it and its sign cuts in
    rule(D.floor, t, intro.floor, EIGHTH);
    for (i = 0; i < 4; i++) {
      var bay = D.bays[i];
      var up = arrive(seg(t, intro.bays[i], EIGHTH));
      for (var f = 0; f < bay.frame.length; f++) {
        show(bay.frame[f], up > 0);
        bay.frame[f].style.clipPath = up >= 1 ? '' : 'inset(' + ((1 - up) * 100).toFixed(3) + '% 0 0 0)';
      }
      show(bay.sign, t >= intro.bays[i] + EIGHTH);
      // reset: frame only
      setChk(bay, 0); setNo(bay, 0);
      show(bay.pass, false); show(bay.tab, false); show(bay.arrow, false); show(bay.carried, false); show(bay.notch, false);
    }
    show(introKicker, t >= intro.kicker && t < S.ideas[0].kickerAt);

    // tell-tale marks: where each earlier idea's NO went through the floor
    IDEAS.forEach(function (p, j) {
      if (j >= k) { return; }
      p.s.gates.forEach(function (g) { if (g.verdict === 'no') { show(D.bays[g.gate].notch, true); } });
    });

    for (var j = 0; j < IDEAS.length; j++) {
      var p = IDEAS[j], s = p.s, on = j === k;
      var started = on && t >= s.kickerAt;
      show(p.kicker, started);
      var voiceOn = !!s.voice && on && t >= s.voice.at;
      var titleGone = L.voiceTop && voiceOn;     // on the square stage the voice takes the title's place
      for (i = 0; i < p.lines.length; i++) {
        var at = s.titleAt[Math.min(i, s.titleAt.length - 1)];
        if (!on || titleGone) { show(p.lines[i], false); if (p.reveals[i]) { p.reveals[i].bar.style.width = '0'; } }
        else if (p.reveals[i]) { reveal(p.reveals[i], t, at); }
        else { show(p.lines[i], t >= at); p.lines[i].style.clipPath = ''; }
        if (on && !titleGone && s.after) { rule(p.strikes[i], t, s.after, EIGHTH); } else { show(p.strikes[i], false); }
      }
      for (i = 0; i < p.voice.length; i++) {
        if (on && s.voice) { wipe(p.voice[i], t, s.voice.at + i * BEAT); } else { show(p.voice[i], false); }
      }
      for (i = 0; i < p.reasons.length; i++) { show(p.reasons[i].node, on && t >= s.after); }

      show(p.crate, on && t >= s.enter[0]);
      if (!on) { continue; }
      p.crate.style.transform = 'translateX(' + px(crateX(p, t)) + ')';
      var winner = !!s.winner && t >= s.winner;
      if (p.crate.classList.contains('is-winner') !== winner) { p.crate.classList.toggle('is-winner', winner); }

      // the gates this idea meets
      s.gates.forEach(function (g) {
        var b = D.bays[g.gate];
        if (g.verdict === 'pass') {
          var h = t < g.lift ? D.full * drop(seg(t, g.drop, DROP)) : D.full - (D.full - D.raised) * lift(seg(t, g.lift, BEAT));
          setChk(b, h);
          show(b.pass, t >= g.passWord);
          show(b.tab, t >= g.tab);
          var a = seg(t, g.travel[0], g.travel[1] - g.travel[0]);            // drawn at one constant speed
          show(b.arrow, a > 0);
          b.arrow.style.width = px(Math.max(L.aw * 5, a * b.arrowW));
          show(b.carried, t >= g.carried);
        } else {
          setNo(b, (D.full + LINE + D.through) * drop(seg(t, g.drop, DROP)));
        }
      });
    }
  }

  /* ======================================================================
   * The title card: the deck's title slide. The sleeve pulls back to the
   * spine, the stack arrives behind blocks, the slab drops with NO on it,
   * two beats of stop-time in negative, then the fine print.
   * ==================================================================== */

  var TT = {};

  function buildTitle() {
    var sc = el('section', 'sc', film);
    var w = cardWords();
    var spineW = pick(88, 56);
    var x = pick(128, 96);
    TT.sc = sc; TT.spineW = spineW; TT.w = w;

    var slabBox = pick({ x: 926, y: 0, w: 994, h: 1080 }, { x: spineW, y: 560, w: W - spineW, h: 520 });
    var fieldBox = pick({ x: spineW, y: 0, w: 926 - spineW, h: 1080 }, { x: spineW, y: 0, w: W - spineW, h: 560 });
    TT.field = el('i', 'a lfield', sc, box(fieldBox.x, fieldBox.y, fieldBox.w, fieldBox.h));
    TT.left = el('div', 'a lgroup', sc, box(0, 0, W, H));

    // the slab: one object. The NO is printed on it and never moves on its own.
    TT.slabClip = el('div', 'a', sc, box(0, 0, W, H) + 'overflow:hidden');
    TT.slab = el('div', 'a slab', TT.slabClip, box(slabBox.x, slabBox.y, slabBox.w, slabBox.h));
    TT.slabFall = slabBox.y + slabBox.h;
    var sx = pick(44, x - spineW);
    var noTop = pick(128, 88);
    var noH = pick(560, 376);                            // cap height of the NO
    var noMeasure = pick(906, 600);
    TT.catalogue = el('p', 'a t-label', TT.slab, box(sx, pick(64, 32)), esc(w.catalogue));
    fitStretch(TT.catalogue, pick(906, W - x - 56), 62, 125);
    TT.no = el('b', 'a t-display', TT.slab, box(sx, noTop) + 'font-size:' + px(noH / CAP), esc(w.slab));
    var noStretch = fitStretch(TT.no, noMeasure, 62, 125);
    if (noStretch < 0) { misfits.push('title NO does not fit its measure'); }
    TT.cols = [];
    var fine = [['When', w.when], ['Time', w.time], ['Room', w.room]];
    if (wide) {
      TT.rule = el('i', 'a ink', TT.slab, box(sx, 752, 906, LINE) + 'transform-origin:0 50%');
      fine.forEach(function (c, i) {
        var col = el('div', 'a fine', TT.slab, box(sx + [0, 326, 652][i], 788), '<span class="t-label">' + esc(c[0]) + '</span><b class="t-display">' + c[1].map(esc).join('<br>') + '</b>');
        TT.cols.push(col);
        if (widthOf(col.lastChild) > 310) { misfits.push('fine print "' + c[1].join(' ') + '" is too wide'); }
      });
    } else {
      TT.rule = null;
      var colX = sx + widthOf(TT.no) + 48;
      var blockH = 32 + 12 + 2 * 40 * 0.92;
      var gap = (noH - 3 * blockH) / 2;
      fine.forEach(function (c, i) {
        var col = el('div', 'a fine is-s', TT.slab, box(colX, noTop + i * (blockH + gap) - 4), '<span class="t-label">' + esc(c[0]) + '</span><b class="t-display">' + c[1].map(esc).join('<br>') + '</b>');
        TT.cols.push(col);
        if (colX + widthOf(col) > W - spineW - 40) { misfits.push('square fine print "' + c[1].join(' ') + '" runs off the slab'); }
      });
      if (gap < 8) { misfits.push('square fine print is taller than the NO'); }
    }

    // the left field
    TT.kicker = el('p', 'a t-label', TT.left, box(x, pick(64, 44)), esc(w.kicker));
    var lines = pick(w.four, w.two);
    TT.lines = lines.map(function (text) { return el('span', 'a t-display ln', TT.left, '', esc(text)); });
    var measure = pick(710, W - x - 56);
    var size = fitStack(TT.lines, measure, 'title');
    var top = pick(128, 100);
    var pitch = wide ? (noH - CAP * size) / (lines.length - 1) : 0.8 * size;
    if (pitch < 0.75 * size) { misfits.push('title leading under 0.75'); }
    TT.reveals = [];
    TT.lines.forEach(function (ln, k) {
      ln.style.left = px(x); ln.style.top = px(top + k * pitch);
      TT.reveals.push(makeReveal(TT.left, ln, x, top + k * pitch, size, widthOf(ln)));
    });
    TT.lineAt = wide ? S.title.lines : [S.title.lines[0], S.title.lines[2]];
    var stackBottom = top + (lines.length - 1) * pitch + CAP * size;

    // the subtitle: two lines on the wide card; one on the square if it fits
    var subY = pick(752, stackBottom + 30);
    TT.sub = el('p', 'a t-voice', TT.left, box(x, subY) + 'font-size:54px;line-height:' + px(54 * 1.12));
    TT.sub.textContent = w.subtitle;
    if (wide || widthOf(TT.sub) > measure) { TT.sub.innerHTML = halve(w.subtitle).map(esc).join('<br>'); }
    var subLines = TT.sub.innerHTML.indexOf('<br>') >= 0 ? 2 : 1;
    var nameY = pick(904, subY + subLines * 54 * 1.12 + 28);
    TT.name = el('p', 'a name', TT.left, box(x, nameY), esc(w.name));
    TT.role = el('p', 'a role', TT.left, box(x, nameY + 48 + 18), esc(w.role));
    var limit = pick(1080 - 56, 560 - 20);
    if (nameY + 48 + 18 + 36 > limit) {
      // no room under the name: the role goes beside it, or not at all
      TT.role.style.left = px(x + widthOf(TT.name) + 22);
      TT.role.style.top = px(nameY + 48 - 36 * 0.92);
      if (x + widthOf(TT.name) + 22 + widthOf(TT.role) > W - 56) { TT.role.textContent = ''; }
    }

    // the spine: it starts as the whole sleeve and pulls back to the left edge
    TT.spine = el('i', 'a spine', sc, box(0, 0, spineW, H));
    sc.appendChild(TT.slabClip);
    sc.appendChild(TT.spine);
  }

  function drawTitle(t) {
    var T = S.title, i;
    var pull = arrive(seg(t, T.pull, BEAT));
    TT.spine.style.width = px(W - pull * (W - TT.spineW));
    show(TT.kicker, t >= T.kicker);
    for (i = 0; i < TT.reveals.length; i++) { reveal(TT.reveals[i], t, TT.lineAt[i]); }
    wipe(TT.sub, t, T.sub);
    show(TT.name, t >= T.name);
    show(TT.role, t >= T.role);

    // NO: the slab falls for three sixteenths and stops dead
    var fall = drop(seg(t, T.drop, DROP));
    show(TT.slabClip, t >= T.drop);
    TT.slab.style.transform = fall >= 1 ? '' : 'translateY(' + px(-(1 - fall) * TT.slabFall) + ')';
    var since = t - T.land;
    var jolt = since >= 0 && since < DROP ? 14 * (1 - arrive(since / DROP)) : 0;
    TT.left.style.transform = jolt ? 'translateY(' + px(jolt) + ')' : '';
    var negative = t >= T.land && t < T.positive;
    if (TT.sc.classList.contains('is-negative') !== negative) { TT.sc.classList.toggle('is-negative', negative); }

    show(TT.catalogue, t >= T.fine[0]);
    if (TT.rule) { rule(TT.rule, t, T.fine[0], EIGHTH); }
    for (i = 0; i < TT.cols.length; i++) { show(TT.cols[i], t >= T.fine[i]); }
  }

  /* ======================================================================
   * Cuts: between ideas a Lampblack block runs across the stage in a
   * sixteenth and retreats in an eighth; the dock is reset behind it.
   * Into the title, the block covers the stage and becomes the spine.
   * ==================================================================== */

  var cover;

  function build() {
    buildDock();
    buildIdeas(dockScene);
    buildTitle();
    cover = el('i', 'a ink', film, box(0, 0, 0, H));
  }

  function render(time) {
    var t = Math.max(0, Math.min(DURATION, time));
    var inTitle = t >= S.title.pull;
    show(dockScene, !inTitle);
    show(TT.sc, inTitle);
    if (inTitle) { drawTitle(t); } else { drawDock(t); }

    var cx = 0, cw = 0;
    for (var i = 0; i < S.ideas.length - 1; i++) {
      var at = S.ideas[i].out;
      if (t >= at && t < at + SIX + EIGHTH) {
        var g = arrive(seg(t, at, SIX)), b = arrive(seg(t, at + SIX, EIGHTH));
        cx = b * W; cw = (g - b) * W;
      }
    }
    if (t >= S.title.cover && t < S.title.pull) { cx = 0; cw = arrive(seg(t, S.title.cover, EIGHTH)) * W; }
    show(cover, cw > 0);
    if (cw > 0) { cover.style.left = px(cx); cover.style.width = px(cw); }
    current = t;
  }

  /* ======================================================================
   * Transport
   * ==================================================================== */

  var ready = false, manual = false, pending = null, current = 0, playing = false, origin = 0, ui = null;

  var marks = [{ t: 0.1, name: 'floor' }, { t: 2.9, name: 'the dock' }];
  S.ideas.forEach(function (s) {
    marks.push({ t: s.enter[1] + 0.2, name: 'idea ' + s.n + ' arrives' });
    s.gates.forEach(function (g) {
      marks.push({ t: g.land, name: 'idea ' + s.n + ' ' + (g.verdict === 'no' ? 'NO' : 'check') + ' at ' + S.gates[g.gate] });
      if (g.verdict === 'pass') { marks.push({ t: g.carried, name: 'idea ' + s.n + ' through ' + S.gates[g.gate] }); }
    });
    if (s.voice) { marks.push({ t: s.voice.at + 1, name: 'idea ' + s.n + ' voice' }); }
    if (s.winner) { marks.push({ t: s.winner + 0.1, name: 'the winner' }); }
  });
  marks.push({ t: S.title.drop - 0.1, name: 'title built' }, { t: S.title.land, name: 'NO lands' },
    { t: S.title.land + 0.5, name: 'negative' }, { t: DURATION, name: 'title card' });

  window.__duration = DURATION;
  window.__ready = false;
  window.__marks = marks;

  window.__setTime = function (seconds) {
    var t = Math.max(0, Math.min(DURATION, Number(seconds) || 0));
    if (!manual) { manual = true; playing = false; doc.documentElement.classList.add('is-capture'); }
    if (!ready) { pending = t; return false; }
    render(t);
    return true;
  };

  function now() { return performance.now() / 1000; }
  function loop() {
    if (manual) { return; }
    if (playing) {
      var t = now() - origin;
      if (t >= DURATION) { t = DURATION; playing = false; }
      render(t);
      updateUi();
    }
    requestAnimationFrame(loop);
  }
  function play(from) { if (manual) { return; } origin = now() - (from || 0); playing = true; updateUi(); }
  function toggle() {
    if (playing) { playing = false; updateUi(); }
    else { play(current >= DURATION ? 0 : current); }
  }
  function fitToWindow() {
    var sc = Math.min(window.innerWidth / W, window.innerHeight / H);
    if (!(sc > 0)) { sc = 1; }
    if (Math.abs(sc - 1) < 0.0005) { film.style.transform = ''; film.style.left = '0'; film.style.top = '0'; return; }
    film.style.transform = 'scale(' + sc + ')';
    film.style.left = Math.round((window.innerWidth - W * sc) / 2) + 'px';
    film.style.top = Math.round((window.innerHeight - H * sc) / 2) + 'px';
  }
  function buildUi() {
    ui = el('div', 'film-ui', doc.body, '',
      '<button type="button" data-do="replay">Replay</button><button type="button" data-do="toggle">Pause</button>' +
      '<span class="film-ui-time"></span><span>Picture only: the MP4 has the sound · Space pause · R replay · ← → one beat</span>');
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
    var hide = null;
    doc.addEventListener('mousemove', function () {
      doc.documentElement.classList.add('is-awake');
      clearTimeout(hide);
      hide = setTimeout(function () { doc.documentElement.classList.remove('is-awake'); }, 1800);
    });
  }
  function updateUi() {
    if (!ui) { return; }
    ui.querySelector('[data-do="toggle"]').textContent = playing ? 'Pause' : 'Play';
    ui.querySelector('.film-ui-time').textContent = current.toFixed(1) + ' / ' + DURATION.toFixed(0) + ' s';
  }

  function start() {
    try { build(); } catch (err) { window.__error = String(err && err.message || err); throw err; }
    var fontsOk = doc.fonts.check('900 100px Archivo') && doc.fonts.check('italic 600 60px Fraunces');
    window.__film = { width: W, height: H, layout: wide ? 'wide' : 'square', fontsOk: fontsOk && !misfits.length, misfits: misfits, poster: DURATION };
    ready = true;
    window.__ready = true;
    fitToWindow();
    window.addEventListener('resize', fitToWindow);
    if ('t' in query && !manual) { window.__setTime(Number(query.t) || 0); return; }
    if (manual) { window.__setTime(pending == null ? 0 : pending); return; }
    buildUi();
    render(0);
    play(0);
    requestAnimationFrame(loop);
  }

  Promise.all([
    doc.fonts.load('900 100px Archivo'), doc.fonts.load('500 100px Archivo'),
    doc.fonts.load('italic 600 60px Fraunces')
  ]).then(function () { return doc.fonts.ready; }).then(start, function (err) { window.__error = 'fonts: ' + err; start(); });
}());
