/*
 * slides/a1-bandwagon.js: Act 1, The Bandwagon (minutes 0 to 10).
 *
 *   cold-open             1.0   the two lines of the abstract, as kinetic type
 *   title                 0.5   the title card builds (scenes/title.js, mode "build")
 *   bandwagon             2.5   Shannon, our edit, Shannon again
 *   whos-talking          2.5   "I say no for a living", four facts, the Waypoint standard
 *   exciting-vs-valuable  1.5   an illustration: what gets pitched, and the one that pays
 *   the-promise           2.0   the next 90 minutes as a path
 *                        ----
 *                        10.0
 *
 * On-screen copy is the final copy of docs/BRIEF.md section 8. The Shannon
 * sentences are section 6, character for character; the only change to them
 * is OUR edit, shown struck through with the replacement on a Flare block and
 * an "our edit" flag (the theme's .edit-mark).
 *
 * How the slides move
 *   - Every slide's html is its FINISHED state, so the overview, the presenter
 *     view and the PDF are right without running anything.
 *   - An entrance (what happens when a slide is reached going forward) is one
 *     render(t) function played on the Motion clock by SleeveFX.play (defined
 *     in scenes/title.js). It can be frozen on any frame:
 *     Motion.useManualClock(0), go to the slide, Motion.setTime(t).
 *   - Most builds inside a slide are the theme's own reveals: data-step with
 *     data-anim (voice wipe, drop) and a swung --delay. The one exception is
 *     the second line of the cold open, which is played the same way as an
 *     entrance (the theme re-fits every stack on a step change, and that
 *     would cut a CSS reveal on a fitted line short).
 *
 * Numbers: nothing here is typed that the deck can supply. Session length,
 * names and dates come from window.YOUR. The four facts about the speaker are
 * read from YOUR.speaker where it has them (see BIO below).
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var doc = document;
  var YOUR = window.YOUR || {};
  var ev = YOUR.event || {};
  var sp = YOUR.speaker || {};
  var THEME = window.THEME || null;
  var FX = window.SleeveFX || null;
  var TS = window.TitleScene || null;
  var M = window.Motion || null;

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function printing() { return doc.documentElement.classList.contains('mode-print'); }

  /* Speaker notes: SAY (two to five short lines), DO, NEXT. */
  function notes(say, doIt, next, story) {
    var out = ['SAY: ' + say.join('\n')];
    if (doIt) { out.push('DO: ' + doIt); }
    if (story) { out.push('YOUR STORY: ' + story); }
    if (next) { out.push('NEXT: ' + next); }
    return out.join('\n\n');
  }

  /* One running move per slide, kept on the slide's ctx so exit() and a
   * step change can end it. */
  function playOn(ctx, duration, render, onDone) {
    stopOn(ctx, false);
    if (!FX) { return; }
    ctx._fx = FX.play(duration, render, onDone);
  }
  function stopOn(ctx, finish) {
    if (ctx && ctx._fx) {
      if (finish) { ctx._fx.finish(); } else { ctx._fx.cancel(); }
      ctx._fx = null;
    }
  }

  var minutes = Number(ev.minutes) || 90;

  /* "Dustin T Hughes" on screen, "Dustin Hughes" out loud */
  var spokenName = (function () {
    var parts = String(sp.name || 'Dustin T Hughes').trim().split(/\s+/);
    return parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1] : parts[0];
  }());
  var company = sp.company || 'Laborde Products';

  /* ----------------------------------------------------------------------
   * The speaker's four facts (docs/BRIEF.md section 2, from his published
   * bio). People and locations are read out of YOUR.speaker.companyLine,
   * which is where your-numbers.js states them. Years of building software
   * and the year he started with AI are not in your-numbers.js yet: they are
   * read from YOUR.speaker.yearsBuilding / .aiSince when present, and fall
   * back to the bio's figures here.
   * -------------------------------------------------------------------- */
  function fromLine(re, fallback) {
    var m = re.exec(String(sp.companyLine || ''));
    return m ? Number(m[1]) : fallback;
  }
  var BIO = {
    people: Number(sp.people) || fromLine(/(\d+)\s+people/i, 95),
    locations: Number(sp.locations) || fromLine(/(\d+)\s+locations/i, 3),
    yearsBuilding: Number(sp.yearsBuilding) || 25,
    aiSince: Number(sp.aiSince) || 2013
  };
  var eventYear = (function () {
    var m = /(\d{4})/.exec(String(ev.date || ''));
    return m ? Number(m[1]) : BIO.aiSince;
  }());

  /* The plot of exciting-vs-valuable has a fixed size on the stage, so its
   * static copy (thumbnails) and its canvas (the stage) share one geometry. */
  var PLOT_W = 1736, PLOT_H = 792;

  /* ======================================================================
   * Styles for these six slides (tokens only, keyed to their own classes)
   * ==================================================================== */

  var css = [
    /* ---- cold-open ---- */
    '.co-stack { position: absolute; left: var(--m-x); top: 116px; width: 1088px; margin: 0; }',
    /* the wrapper the punch line drops out of. It must never lag behind the stack's font size while the
       stack is being fitted (?fast gives every element a 1ms transition), so it has no transitions at all */
    '.co-drop { display: block; margin-top: 0.15em; transition-property: none !important; }',
    '.stack .co-drop > .ln.is-punch { margin-top: 0; }',
    '.co-note { width: 656px; height: 764px; padding: 0 var(--m-right) 0 52px; display: flex; flex-direction: column; justify-content: flex-end; }',
    '.co-voice { font-size: 72px; line-height: 1.12; margin-bottom: 40px; }',
    '.co-voice > span { display: block; width: max-content; white-space: nowrap; }',
    '.co-worth { width: 548px; margin-bottom: 96px; }',

    /* ---- bandwagon ---- */
    '.bw-year { position: absolute; left: var(--m-x); top: var(--m-y); margin: 0; }',
    /* the quotation is set in by the width of its opening mark, so the mark hangs exactly on the margin */
    '.bw-quotes { --bw-hang: 0.42em; display: grid; align-items: end; margin-top: auto; padding-top: 96px; font-size: 104px; }',
    '.bw-quotes > .quote { grid-area: 1 / 1; max-width: none; margin-left: var(--bw-hang); padding-left: 0; text-indent: 0; }',
    '.bw-l { display: block; width: max-content; white-space: nowrap; text-indent: 0; }',
    '.bw-l.is-first { margin-left: calc(var(--bw-hang) * -1); }',
    '.bw-quotes + .attribution { margin-top: var(--s-6); margin-bottom: auto; margin-left: calc(104px * 0.42); }',
    /* the edit sits at the end of its line, so it may keep its place while hidden and come down as a block */
    '.bw-q1 .edit-mark > ins[data-step]:not(.is-visible) { display: inline-flex; }',
    /* when the first sentence leaves, everything in it leaves on the same frame (the edit has a delayed reveal) */
    '.bw-q1:not(.is-visible) * { transition: none !important; }',

    /* ---- whos-talking ---- */
    /* the line holds the middle of the slide on its own, then lifts to the head of it when the facts arrive.
       Stepping back is a cut, like every other step back in the deck. */
    '.wt-say { margin: 0; transition: translate var(--beat) var(--e-lift); }',
    '.slide[data-current-step="0"] > .wt-say { translate: 0 372px; transition: none; }',
    '.wt-facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: var(--gutter); margin-top: 56px; border-top: var(--w-rule) solid var(--c-line); }',
    '.wt-facts > .counter { padding-top: 26px; }',
    '.wt-facts .label { white-space: nowrap; font-stretch: var(--wdth-text); letter-spacing: 0.08em; }',
    '.wt-standard { margin-top: auto; }',
    '.wt-standard > .kicker { margin-bottom: 22px; }',
    /* THE WAYPOINT FOUR: four equal boxes in one row, numbered, the words in display caps on two
       lines. They are equals, so they share one width and one size. (waypoint-standard in Act 5
       is the same pattern, larger.) */
    '.four-boxes { counter-reset: four; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: var(--gutter); }',
    '.four-boxes > li { counter-increment: four; position: relative; display: flex; flex-direction: column; justify-content: flex-end; height: 284px; padding: 0 24px 26px; border: var(--w-bold) solid var(--c-line); font-family: var(--f-display); font-size: 98px; font-weight: var(--wght-display); font-stretch: var(--wdth-display); line-height: 0.8; text-transform: uppercase; white-space: nowrap; }',
    '.four-boxes > li::before { content: counter(four); position: absolute; left: 24px; top: 24px; font-size: 64px; line-height: var(--lh-cap); font-variant-numeric: tabular-nums; }',
    '.wt-line { margin-top: 28px; font-size: var(--t-voice-l); }',

    /* ---- exciting-vs-valuable ---- */
    '.xv-plot { flex: none; height: ' + PLOT_H + 'px; margin-top: 8px; }',
    '.xv-tag { position: absolute; right: var(--m-right); top: 236px; z-index: 2; }',
    /* the static copy of the plot, for thumbnails (the stage draws the same picture on a canvas) */
    '.slide.is-static .plot.xv-plot::after { content: none; }',
    '.xv-static .ink { fill: var(--c-ink); }',
    '.xv-static .ground { fill: var(--c-bg); }',
    '.xv-static .point { fill: var(--c-accent); }',
    '.xv-static .ring { fill: none; stroke: var(--c-ink); stroke-width: 6px; }',
    '.xv-static .shaft { fill: none; stroke: var(--c-ink); }',
    '.xv-static text { fill: var(--c-ink); }',

    /* ---- the-promise ---- */
    '.pr-head { width: max-content; }',
    '.pr-beats { margin-top: 150px; }',
    '.pr-beats > li { font-size: 42px; }',
    '.pr-beats > li::after { z-index: 2; }',
    '.pr-beats.is-building { border-top-color: transparent; background: linear-gradient(var(--c-line), var(--c-line)) no-repeat left top / calc(var(--pr-p, 1) * 100%) var(--w-rule); background-origin: border-box; }',
    '.pr-beats.is-building > li:not(.pr-on) { visibility: hidden; }',
    '.pr-beats.is-building > li:not(.pr-arrow)::after { visibility: hidden; }',
    '.pr-foot { margin-top: auto; margin-bottom: 36px; max-width: 1560px; }'
  ].join('\n');

  var style = doc.createElement('style');
  style.setAttribute('data-from', 'slides/a1-bandwagon.js');
  style.textContent = css;
  doc.head.appendChild(style);

  /* ======================================================================
   * cold-open
   * ----------------------------------------------------------------------
   * The first thing the room reads. Line one arrives the way the deck
   * speaks: three lines behind blocks on the swung off-beat, a held beat and
   * a half of nothing, and then WRONG. comes down like a shutter and the
   * stack recoils. One click brings the second line, in the other voice: a
   * Card block lifts from the floor, the italic wipes in line by line, and
   * WORTH THOUSANDS. arrives behind blocks.
   * ==================================================================== */

  var CO = { lines: [0.5 + 1 / 3, 1 + 1 / 3, 1.5 + 1 / 3], drop: 3, dropDur: 0.375, end: 3.75 };
  var CO2 = { lift: 0.5, voice: [0.5, 0.5 + 1 / 3, 1], worth: [1.5, 1.5 + 1 / 3], end: 2.25 };

  function coldOpenRender(p, t) {
    var i;
    for (i = 0; i < p.lines.length; i++) { FX.block(p.lines[i], t, CO.lines[i]); }
    var fall = FX.drop(FX.seg(t, CO.drop, CO.dropDur));
    p.drop.style.visibility = t >= CO.drop ? '' : 'hidden';
    if (fall >= 1) {
      p.drop.style.clipPath = '';
      p.punch.style.translate = '';
    } else {
      p.drop.style.clipPath = 'inset(-0.08em -0.3em -0.3em -0.3em)';
      p.punch.style.translate = '0 calc(' + (fall - 1).toFixed(4) + ' * (100% + 0.3em))';
    }
    var since = t - (CO.drop + CO.dropDur);
    var jolt = since >= 0 && since < 0.375 ? 14 * (1 - FX.arrive(since / 0.375)) : 0;
    for (i = 0; i < p.lines.length; i++) { p.lines[i].style.translate = jolt ? '0 ' + jolt.toFixed(2) + 'px' : ''; }
  }

  function coldOpenSecond(p, t) {
    var i;
    var up = FX.lift(FX.seg(t, 0, CO2.lift));
    p.note.style.clipPath = up >= 1 ? '' : 'inset(' + ((1 - up) * 100).toFixed(2) + '% 0 0 0)';
    for (i = 0; i < p.voice.length; i++) { FX.wipe(p.voice[i], t, CO2.voice[Math.min(i, CO2.voice.length - 1)]); }
    for (i = 0; i < p.worth.length; i++) { FX.block(p.worth[i], t, CO2.worth[Math.min(i, CO2.worth.length - 1)]); }
  }

  Deck.slide({
    id: 'cold-open',
    act: 1,
    title: 'Cold open',
    minutes: 1,
    layout: 'statement on-ink',
    steps: 1,
    html:
      '<h2 class="stack co-stack" data-fit>' +
        '<span class="ln">Your best</span>' +
        '<span class="ln">AI idea is</span>' +
        '<span class="ln">probably</span>' +
        '<span class="co-drop"><span class="ln is-punch">wrong.</span></span>' +
      '</h2>' +
      '<aside class="note on-card co-note" data-step="1">' +
        '<p class="voice co-voice">' +
          '<span>The boring one</span>' +
          '<span>you didn’t pitch</span>' +
          '<span>is probably</span>' +
        '</p>' +
        '<p class="stack co-worth" data-fit data-fit-gap="20">' +
          '<span class="ln">worth</span>' +
          '<span class="ln">thousands.</span>' +
        '</p>' +
      '</aside>',
    notes: notes([
      'Say nothing at first. Let the room read it.',
      '"Your best AI idea is probably wrong." Stop. Count two.',
      '(click) "The boring one you didn’t pitch is probably worth thousands."',
      'The next ' + minutes + ' minutes are how you tell which is which.'
    ],
      'One click for the second line. Do not rush the first.',
      '"I’m ' + spokenName.split(' ')[0] + '. Here is how we find out."'
    ),
    enter: function (ctx) {
      if (!FX || !FX.shouldPlay(ctx)) { return; }
      var stack = ctx.el.querySelector('.co-stack');
      var drop = ctx.el.querySelector('.co-drop');
      if (!stack || !drop) { return; }
      var parts = { lines: all(stack, ':scope > .ln'), drop: drop, punch: drop.querySelector('.ln') };
      playOn(ctx, CO.end, function (t) { coldOpenRender(parts, t); });
    },
    step: function (ctx, n, dir) {
      stopOn(ctx, true);
      if (n !== 1 || !(dir > 0) || !FX || printing()) { return; }
      var note = ctx.el.querySelector('.co-note');
      if (!note) { return; }
      var parts = { note: note, voice: all(note, '.co-voice > span'), worth: all(note, '.co-worth > .ln') };
      playOn(ctx, CO2.end, function (t) { coldOpenSecond(parts, t); });
    },
    exit: function (ctx) { stopOn(ctx, false); }
  });

  /* ======================================================================
   * title
   * ==================================================================== */

  /* the end of the session, for the notes: the part of "2:30–4:00 PM" after the dash */
  var endsAt = String(ev.time || '').split(/[–—-]/).pop().trim();

  Deck.slide({
    id: 'title',
    act: 1,
    title: 'Title',
    minutes: 0.5,
    layout: 'title',
    steps: 0,
    html: TS && TS.markup ? TS.markup('build') :
      '<p class="kicker">' + esc(ev.name || 'NOAI 2026') + '</p>' +
      '<h1 class="headline is-hero" style="position: absolute; left: var(--m-x); top: 150px; max-width: 1500px">' + esc(ev.title || 'The Most Valuable AI Skill Is Saying No') + '</h1>' +
      '<p class="sub" style="top: 640px">' + esc(ev.subtitle || 'Screening AI use cases for real return.') + '</p>' +
      '<p class="credit" style="top: 900px"><b>' + esc(sp.name || 'Dustin T Hughes') + '</b><span>' + esc((sp.role || 'VP of Technology') + ', ' + company) + '</span></p>',
    notes: notes([
      'I’m ' + spokenName + '. ' + (sp.role || 'VP of Technology') + ' at ' + company + '.',
      'This is a workshop, not a demo. You do the work, on paper.',
      (endsAt ? 'By ' + endsAt + ' you' : 'You') + ' will have run three of your own ideas through four gates, and said no to at least two of them.'
    ],
      'The card builds itself in about eight seconds. Talk over it. Nothing to click.',
      '"I did not pick the reading for this fest. The organizers did. It is one page, from 1956."'
    )
  });

  /* ======================================================================
   * bandwagon
   * ----------------------------------------------------------------------
   * State 0  Shannon's sentence, as he wrote it, attributed.
   * State 1  "Information theory" is struck through and AI is written in:
   *          a Flare block in the deck's own hand, flagged "our edit".
   * State 2  his other sentence, and the year.
   * The subject of the sentence has a line to itself, so the edit lands at
   * the end of a line and nothing else moves.
   * ==================================================================== */

  var SHANNON = 'Claude Shannon, The Bandwagon, 1956';
  var BW = { lines: [0.5 + 1 / 3, 1, 1 + 1 / 3], attribution: 1.75, end: 1.9 };

  Deck.slide({
    id: 'bandwagon',
    act: 1,
    title: 'The Bandwagon',
    minutes: 2.5,
    layout: 'quote',
    steps: 2,
    html:
      '<h2 class="headline is-hero bw-year" data-step="2" style="--delay: 1000ms">1956.</h2>' +
      '<div class="bw-quotes">' +
        '<blockquote class="quote is-l bw-q1" data-step-out="2">' +
          '<span class="bw-l is-first">“<span class="edit-mark"><s>Information theory</s><ins data-step="1" data-anim="stamp" style="--delay: 250ms">AI<small>' + esc((THEME && THEME.tags && THEME.tags.edit) || 'our edit') + '</small></ins></span></span>' +
          '<span class="bw-l">has, in the last few years, become</span>' +
          '<span class="bw-l">something of a scientific bandwagon.”</span>' +
        '</blockquote>' +
        '<blockquote class="quote is-l bw-q2" data-step="2">' +
          '<span class="bw-l is-first" data-step="2" data-anim="wipe">“Seldom do more than a few of nature’s</span>' +
          '<span class="bw-l" data-step="2" data-anim="wipe" style="--delay: 333ms">secrets give way at one time.”</span>' +
        '</blockquote>' +
      '</div>' +
      '<p class="attribution">' + esc(SHANNON) + '</p>',
    notes: notes([
      'The organizers assigned one page of reading. Claude Shannon, 1956, "The Bandwagon."',
      'Shannon founded information theory. He still wrote this, to say his own field was being oversold.',
      '(click) The assignment: swap two words. Read it again.',
      '(click) And this is the line I built today around. A few secrets give way at a time. The skill is picking which few.'
    ],
      'Click one makes the edit. It is flagged "our edit" so nobody thinks Shannon wrote "AI". Click two brings his second sentence and the year.',
      '"So who am I to tell you which few?"'
    ),
    enter: function (ctx) {
      if (!FX || !FX.shouldPlay(ctx)) { return; }
      var lines = all(ctx.el, '.bw-q1 > .bw-l');
      var attribution = ctx.el.querySelector('.attribution');
      playOn(ctx, BW.end, function (t) {
        for (var i = 0; i < lines.length; i++) { FX.wipe(lines[i], t, BW.lines[i]); }
        FX.cut(attribution, t >= BW.attribution);
      });
    },
    step: function (ctx) { stopOn(ctx, true); },
    exit: function (ctx) { stopOn(ctx, false); }
  });

  /* ======================================================================
   * whos-talking
   * ----------------------------------------------------------------------
   * State 0  the line, alone.     State 2  the Waypoint standard: four boxes
   * State 1  it lifts; four facts          land one by one.
   *          count up.            State 3  "A win only counts with all four."
   *
   * THE WAYPOINT FOUR (the close slide "waypoint-standard" uses the same
   * pattern, larger): an <ol> of four equal framed boxes in one row, each
   * numbered by a CSS counter, the words in display caps on two lines.
   * ==================================================================== */

  var FOUR = [['The', 'task'], ['The', 'prompt'], ['The', 'output'], ['The time', 'saved']];
  var SWUNG = [0, 333, 500, 833];

  function fact(label, value, opts) {
    var o = opts || {};
    return '<li class="counter">' +
      '<p class="label">' + esc(label) + '</p>' +
      '<p class="counter-v"><b data-count-to="' + value + '"' +
        (o.from != null ? ' data-count-from="' + o.from + '"' : '') +
        ' data-count-format="%d" data-count-duration="1.5" data-count-steps="12">' + value + '</b>' +
        (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + '</p>' +
      '</li>';
  }

  Deck.slide({
    id: 'whos-talking',
    act: 1,
    title: 'Who’s talking',
    minutes: 2.5,
    layout: 'figure',
    steps: 3,
    html:
      '<p class="say is-l wt-say">I say <b class="punch">no</b> for a living.</p>' +
      '<ul class="wt-facts" data-step="1" style="--delay: 333ms">' +      // cut in once the line has lifted clear
        fact('People', BIO.people) +
        fact('Locations', BIO.locations) +
        fact('Building software', BIO.yearsBuilding, { unit: 'years' }) +
        fact('AI since', BIO.aiSince, { from: eventYear }) +
      '</ul>' +
      '<div class="wt-standard">' +
        '<p class="kicker" data-step="2">The Waypoint standard</p>' +
        '<ol class="four-boxes">' +
          FOUR.map(function (w, i) {
            return '<li data-step="2" data-anim="stamp" style="--delay: ' + SWUNG[i] + 'ms">' + esc(w[0]) + '<br>' + esc(w[1]) + '</li>';
          }).join('') +
        '</ol>' +
        '<p class="sub wt-line" data-step="3" data-anim="wipe">A win only counts with all four.</p>' +
      '</div>',
    notes: notes([
      'I say no for a living. That is the job: deciding what we do not build.',
      '(click) ' + company + ' is a marine diesel distributor. ' + BIO.people + ' people, ' + BIO.locations + ' locations, a small technology team. Parts on one side, service techs on the other: a product business and a service business under one roof.',
      BIO.yearsBuilding + ' years building software. Working with AI since ' + BIO.aiSince + '.',
      '(click) I lead Waypoint, our company-wide AI program. It has one rule. A win only counts with the task, the prompt, the output and the time saved.',
      '(click) All four, or it does not count.'
    ],
      'Three clicks: the facts, the four boxes, the line.',
      '"Here is why I am that strict."',
      'one Waypoint win with all four boxes filled, and one thing you turned down.'
    )
  });

  /* ======================================================================
   * exciting-vs-valuable
   * ----------------------------------------------------------------------
   * An ILLUSTRATION, and labelled so on the slide at all times: the dots are
   * placed by a seeded generator to show a pattern. Nothing was measured.
   * On stage it is drawn with the theme's canvas kit (THEME.draw). The same
   * picture is in the slide's html as a static copy, so the overview and the
   * presenter's preview show the plot and not an empty box.
   *
   * Form (dataviz method): emphasis, not categories. One mark is the point;
   * the rest are the crowd. Told apart by shape first (the crowd goes hollow,
   * the point is ringed), then ink. Both groups are labelled directly, so
   * there is no legend. No hover layer: the marks carry no values.
   * ==================================================================== */

  var XV = { crowdLabel: 'What gets pitched', pointLabel: 'the boring one you didn’t pitch', xTitle: 'How exciting it sounds', yTitle: 'What it returns' };

  /* The illustration: seeded, so it is the same picture every time, in the
   * thumbnail and on the canvas. x = how exciting it sounds, y = what it
   * returns, both 0..1 with no unit. */
  function buildScatter(seed) {
    if (!M || !M.rng) { return null; }
    var rng = M.rng(seed);
    var crowd = [];
    var i;
    for (i = 0; i < 22; i++) {                       // what gets pitched: exciting, low return
      crowd.push({ x: 0.81 + rng.normal(0, 0.062), y: 0.20 + rng.normal(0, 0.07), core: true });
    }
    for (i = 0; i < 4; i++) {                        // a few stragglers on the way there
      crowd.push({ x: rng.range(0.46, 0.64), y: rng.range(0.08, 0.30) });
    }
    crowd.forEach(function (d) {
      d.x = Math.max(0.40, Math.min(0.965, d.x));
      d.y = Math.max(0.05, Math.min(0.42, d.y));
    });
    // dots 24px across must not sit on top of each other: push close pairs apart (deterministic)
    for (var pass = 0; pass < 40; pass++) {
      for (var a = 0; a < crowd.length; a++) {
        for (var b = a + 1; b < crowd.length; b++) {
          var dx = (crowd[b].x - crowd[a].x) * 1500, dy = (crowd[b].y - crowd[a].y) * 600;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 38) {
            var push = (38 - dist) / 2 / (dist || 1);
            var ux = dist ? dx : 1, uy = dist ? dy : 0;
            crowd[a].x -= ux * push / 1500; crowd[b].x += ux * push / 1500;
            crowd[a].y -= uy * push / 600; crowd[b].y += uy * push / 600;
          }
        }
      }
    }
    var dull = { x: 0.14, y: 0.80 };                 // nobody pitched it; it pays
    // where the crowd's label sits: centred over the cluster, just above its highest dot
    var top = 0, mid = 0, cores = 0;
    crowd.forEach(function (d) {
      top = Math.max(top, d.y);
      if (d.core) { mid += d.x; cores++; }
    });
    return {
      crowd: crowd,
      dull: dull,
      order: crowd.concat([dull]).sort(function (p, q) { return p.x - q.x; }),   // arrival: left to right
      crowdTop: top,
      crowdMid: cores ? mid / cores : 0.8
    };
  }

  /* Where things are in a plot of w x h stage pixels. */
  function plotGeometry(w, h) {
    var g = { w: w, h: h, x0: 6, x1: w - 40, yTop: 64, y0: h - 78 };
    g.ox = g.x0 + 60;
    g.oy = g.y0 - 30;
    g.pw = g.x1 - g.ox;
    g.ph = g.oy - g.yTop;
    g.px = function (d) { return g.ox + d.x * g.pw; };
    g.py = function (d) { return g.oy - d.y * g.ph; };
    g.crowdLabel = [g.ox + SC.crowdMid * g.pw, g.oy - SC.crowdTop * g.ph - 46];
    g.tipX = g.px(SC.dull) + 44;                     // where the callout's arrow ends
    g.tailX = g.tipX + 250;                          // and where it starts
    return g;
  }

  var SC = buildScatter(1956);
  var DOT = 12, POINT = 24, RING = 6, HALO = 15;

  /* The static copy: the finished picture as inline SVG, built from the same
   * dots and the same geometry as the canvas. Thumbnails show it; on stage
   * the scene removes it and draws. */
  function scatterSvg() {
    if (!SC) { return ''; }
    var g = plotGeometry(PLOT_W, PLOT_H);
    function n(v) { return Math.round(v * 10) / 10; }
    var solid = '', hollow = '';
    SC.crowd.forEach(function (d) {
      var c = 'cx="' + n(g.px(d)) + '" cy="' + n(g.py(d)) + '"';
      solid += '<circle class="ground" ' + c + ' r="' + HALO + '"/><circle class="ink" ' + c + ' r="' + DOT + '"/>';
      hollow += '<circle class="ground" ' + c + ' r="' + HALO + '"/><circle class="ring" ' + c + ' r="' + (DOT - RING / 2) + '"/>';
    });
    var dx = n(g.px(SC.dull)), dy = n(g.py(SC.dull));
    var head = 27, half = 15.1;                      // the axis arrowheads (6px shaft)
    return '<svg class="xv-static" viewBox="0 0 ' + PLOT_W + ' ' + PLOT_H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="shaft" stroke-width="6" d="M' + g.x0 + ' ' + g.y0 + 'H' + (g.x1 - head + 1) + 'M' + (g.x0 + 3) + ' ' + (g.y0 + 3) + 'V' + (g.yTop + head - 1) + '"/>' +
      '<path class="ink" d="M' + g.x1 + ' ' + g.y0 + 'l' + (-head) + ' ' + (-half) + 'v' + (2 * half) + 'zM' + (g.x0 + 3) + ' ' + g.yTop + 'l' + (-half) + ' ' + head + 'h' + (2 * half) + 'z"/>' +
      '<text class="label" x="' + (g.x1 - 44) + '" y="' + (g.y0 + 48) + '" text-anchor="end">' + esc(XV.xTitle) + '</text>' +
      '<text class="label" x="' + (g.x0 + 34) + '" y="' + (g.yTop + 18) + '">' + esc(XV.yTitle) + '</text>' +
      '<text class="label" x="' + n(g.crowdLabel[0]) + '" y="' + n(g.crowdLabel[1]) + '" text-anchor="middle">' + esc(XV.crowdLabel) + '</text>' +
      '<g data-step-out="1">' + solid + '<circle class="ink" cx="' + dx + '" cy="' + dy + '" r="' + DOT + '"/></g>' +
      '<g data-step="1">' + hollow +
        '<circle class="point" cx="' + dx + '" cy="' + dy + '" r="' + POINT + '"/><circle class="ring" cx="' + dx + '" cy="' + dy + '" r="' + (POINT + RING / 2 - 0.5) + '"/>' +
        '<path class="shaft" stroke-width="8" d="M' + n(g.tailX) + ' ' + dy + 'H' + n(g.tipX + 23) + '"/>' +
        '<path class="ink" d="M' + n(g.tipX) + ' ' + dy + 'l24 -13.4v26.8z"/>' +
        '<text class="voice" style="font-size: 64px" x="' + n(g.tailX + 24) + '" y="' + n(dy + 22.4) + '">' + esc(XV.pointLabel) + '</text>' +
      '</g>' +
    '</svg>';
  }

  function defineScatter() {
    if (!window.Scenes || !THEME || !SC) { return; }

    window.Scenes.define('exciting-scatter', function (host, opts, api) {
      var D = THEME.draw;
      var staticCopy = host.querySelector('.xv-static');
      if (staticCopy) { host.removeChild(staticCopy); }
      var canvas = doc.createElement('canvas');
      host.appendChild(canvas);
      var view = api.deck.fitCanvas(canvas);
      var isPrint = !!(api.mode && api.mode.print);
      var order = SC.order;

      /* ---- time ---- */
      var S = { axes: 0.5, dots: 1.25, each: 0.085, label: 0, end: 0 };
      S.label = S.dots + order.length * S.each + 0.25;
      S.end = S.label + 0.1;
      var P = { ring: 0.375, arrow: 0.5, end: 1.15 };
      var tEnter = S.end;                              // finished unless an entrance plays
      var tPoint = 0;                                  // 0 = not singled out, P.end = done
      var runEnter = null, runPoint = null;

      function halo(ctx, x, y) {                       // a ring of the ground keeps neighbours apart
        ctx.fillStyle = THEME.color('bg');
        ctx.beginPath();
        ctx.arc(x, y, HALO, 0, Math.PI * 2);
        ctx.fill();
      }

      function draw() {
        var g = plotGeometry(view.width, view.height);
        var ctx = view.ctx;
        ctx.clearRect(0, 0, g.w, g.h);

        // two axes meeting at the origin, each an arrow: more is that way. No ticks: there is no scale.
        var ax = FX ? FX.arrive(FX.seg(tEnter, S.axes, 0.5)) : 1;
        var ay = FX ? FX.arrive(FX.seg(tEnter, S.axes + 0.25, 0.5)) : 1;
        if (ax > 0.02) { D.arrow(ctx, g.x0, g.y0, g.x0 + (g.x1 - g.x0) * ax, g.y0, { width: 6, head: 4.5 }); }
        if (ay > 0.02) { D.arrow(ctx, g.x0 + 3, g.y0 + 3, g.x0 + 3, g.y0 - (g.y0 - g.yTop) * ay, { width: 6, head: 4.5 }); }
        if (ax >= 1) { D.label(ctx, XV.xTitle, g.x1 - 44, g.y0 + 26, { align: 'right', baseline: 'top' }); }
        if (ay >= 1) { D.label(ctx, XV.yTitle, g.x0 + 34, g.yTop - 4, { baseline: 'top' }); }

        // the dots, in order of arrival
        var singled = tPoint > 0;
        var ringP = FX ? FX.drop(FX.seg(tPoint, 0, P.ring)) : (singled ? 1 : 0);
        for (var n = 0; n < order.length; n++) {
          if (tEnter < S.dots + n * S.each) { break; }
          var d = order[n];
          var x = g.px(d), y = g.py(d);
          if (d === SC.dull && singled) {
            D.dot(ctx, x, y, DOT + (POINT - DOT) * ringP, { kind: 'point', ring: RING });
          } else {
            halo(ctx, x, y);
            D.dot(ctx, x, y, DOT, singled ? { kind: 'hollow', ring: RING } : null);
          }
        }

        // direct labels
        if (tEnter >= S.label) {
          D.label(ctx, XV.crowdLabel, g.crowdLabel[0], g.crowdLabel[1], { align: 'center', kind: 'label', size: 32 });
        }
        if (singled && tPoint >= P.ring) {
          var ty = g.py(SC.dull);
          var grow = FX ? FX.seg(tPoint, P.ring, P.arrow) : 1;         // drawn at one speed, tail to tip
          if (grow > 0.05) { D.arrow(ctx, g.tailX, ty, g.tailX - (g.tailX - g.tipX) * grow, ty, { width: 8 }); }
          if (tPoint >= P.ring + P.arrow) {
            D.label(ctx, XV.pointLabel, g.tailX + 24, ty, { kind: 'voice', size: 64, baseline: 'middle' });
          }
        }
      }

      function shouldPlay() {
        if (isPrint || !FX) { return false; }
        var stage = host.closest ? host.closest('.deck-stage') : null;
        return !(stage && stage.getAttribute('data-dir') === 'back');
      }

      function stop(h) { if (h) { h.cancel(); } return null; }

      draw();
      THEME.whenReady(draw);                           // again once the fonts are in

      return {
        step: function (n, dir) {
          if (dir === 0) {                               // mount
            tPoint = n >= 1 ? P.end : 0;
            if (n === 0 && shouldPlay()) {
              runEnter = FX.play(S.end, function (t) { tEnter = t; draw(); });
            } else {
              tEnter = S.end;
              draw();
            }
            return;
          }
          if (runEnter) { runEnter.finish(); runEnter = null; }
          runPoint = stop(runPoint);
          tEnter = S.end;
          if (n >= 1 && dir > 0 && FX && !isPrint) {
            runPoint = FX.play(P.end, function (t) { tPoint = t; draw(); });
          } else {
            tPoint = n >= 1 ? P.end : 0;
            draw();
          }
        },
        resize: function () { view = api.deck.fitCanvas(canvas); draw(); },
        destroy: function () { runEnter = stop(runEnter); runPoint = stop(runPoint); }
      };
    });
  }
  defineScatter();

  var ILLUSTRATION = (THEME && THEME.tags && THEME.tags.illustration) || 'Illustration, not data';

  Deck.slide({
    id: 'exciting-vs-valuable',
    act: 1,
    title: 'Exciting vs valuable',
    minutes: 1.5,
    layout: 'chart',
    steps: 1,
    html:
      '<h2 class="headline">Excitement is not a business case.</h2>' +
      '<div class="plot is-contained scene xv-plot" data-scene="exciting-scatter">' + scatterSvg() + '</div>' +
      '<span class="tag is-example xv-tag">' + esc(ILLUSTRATION) + '</span>' +
      '<p class="source-line">' + esc(ILLUSTRATION) + '. The dots are made up to show a pattern. Nothing on this slide was measured.</p>',
    notes: notes([
      'This is a drawing, not data. I made the dots up to show a pattern.',
      'Across: how exciting an idea sounds in the meeting. Up: what it returns.',
      'What gets pitched lives down here. Exciting, low return.',
      '(click) And up here is the one nobody brought to the meeting, because it is dull.',
      'Sounding good and paying back are two different axes. A pitch only tests the first one.'
    ],
      'One click singles out the dull dot.',
      '"For the next ' + minutes + ' minutes we check the second one."'
    )
  });

  /* ======================================================================
   * the-promise
   * ----------------------------------------------------------------------
   * The five beats as a path that draws itself: one rule runs left to right
   * at a constant speed, and each beat cuts in as the rule reaches it. The
   * last beat is the point of the slide and comes down as a block.
   * One click brings the footer, in the other voice.
   * ==================================================================== */

  var BEATS = ['Inventory two weeks of real work', 'Pick three', 'Four gates', 'The math picks', 'Build the winner'];
  var PR = { headline: 0.5, path: 1, pathDur: 2.5, drop: 0.375, end: 0 };
  PR.end = PR.path + PR.pathDur + 0.25;

  Deck.slide({
    id: 'the-promise',
    act: 1,
    title: 'The promise',
    minutes: 2,
    layout: 'list',
    steps: 1,
    html:
      '<h2 class="headline pr-head">In the next ' + minutes + ' minutes</h2>' +
      '<ol class="beats pr-beats">' +
        BEATS.map(function (b, i) { return '<li' + (i === BEATS.length - 1 ? ' class="is-point"' : '') + '>' + esc(b) + '</li>'; }).join('') +
      '</ol>' +
      '<p class="sub pr-foot" data-step="1" data-anim="wipe">You leave with one use case worth doing, and two you can stop thinking about.</p>',
    notes: notes([
      'Here is the deal for the next ' + minutes + ' minutes.',
      'You inventory two weeks of real work. Not ideas. Work. You pick three. Each one goes through four gates.',
      'The math picks, not the loudest voice in the room. Then we build the winner: a real one, from my own shop.',
      '(click) You leave with one use case worth doing, and two you can stop thinking about.',
      'The two you drop are worth as much as the one you keep.'
    ],
      'Hold up the worksheet. Check everyone has one and a pen. One click for the last line.',
      '"Four gates. Any one of them can say no."'
    ),
    enter: function (ctx) {
      if (!FX || !FX.shouldPlay(ctx)) { return; }
      var headline = ctx.el.querySelector('.headline');
      var list = ctx.el.querySelector('.pr-beats');
      if (!list) { return; }
      var items = all(list, ':scope > li');
      var n = items.length;
      var total = list.offsetWidth || 1;
      // where on the path each beat starts (its arrow sits just before it)
      var starts = items.map(function (li, i) { return i === 0 ? 0 : Math.max(0, li.offsetLeft / total) || i / n; });
      list.classList.add('is-building');
      playOn(ctx, PR.end, function (t) {
        FX.block(headline, t, PR.headline);
        var p = FX.seg(t, PR.path, PR.pathDur);               // constant speed: the path is drawn, not eased
        list.style.setProperty('--pr-p', p.toFixed(4));
        for (var i = 0; i < n; i++) {
          var on = t >= PR.path && p >= starts[i];
          items[i].classList.toggle('pr-on', on);
          if (i > 0) { items[i - 1].classList.toggle('pr-arrow', on); }
          if (i === n - 1) {
            var at = PR.path + starts[i] * PR.pathDur;
            var fall = FX.drop(FX.seg(t, at, PR.drop));
            items[i].style.clipPath = fall >= 1 ? '' : 'inset(-0.4em -0.4em ' + ((1 - fall) * 100).toFixed(2) + '% -0.4em)';
          }
        }
      }, function () {
        list.classList.remove('is-building');
        list.style.removeProperty('--pr-p');
        items.forEach(function (li) { li.classList.remove('pr-on', 'pr-arrow'); li.style.clipPath = ''; });
      });
    },
    step: function (ctx) { stopOn(ctx, true); },
    exit: function (ctx) { stopOn(ctx, false); }
  });
}());
