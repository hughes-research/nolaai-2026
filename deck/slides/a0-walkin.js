/*
 * slides/a0-walkin.js: Act 0, the walk-in.
 *
 * One slide, on screen while the room fills. It is the title card with the
 * NO held back: on the right field the four gates count in and never resolve
 * (the loop lives in scenes/title.js, mode "walkin"), standing on a Flare
 * band that carries the one instruction and the one live line.
 *
 *   title, subtitle                      window.YOUR.event
 *   "Take a worksheet and a pen"         final copy, docs/BRIEF.md section 8
 *   "Starts in 12:34"                    counts down to YOUR.event.date + startsAt;
 *                                        "Starts 2:30" when that cannot be read or is
 *                                        more than 99:59 away; "Starting now" from the
 *                                        start time on
 *
 * The NO slab is kept for the title slide, where it drops.
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var YOUR = window.YOUR || {};
  var ev = YOUR.event || {};
  var TS = window.TitleScene;

  /* If scenes/title.js did not load, the room still gets a card it can read. */
  function plainCard() {
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    return '<p class="kicker">' + esc(ev.name || 'NOAI 2026') + '</p>' +
      '<h1 class="headline is-hero" style="position: absolute; left: var(--m-x); top: 150px; max-width: 1500px">' + esc(ev.title || 'The Most Valuable AI Skill Is Saying No') + '</h1>' +
      '<p class="sub" style="top: 620px">' + esc(ev.subtitle || 'Screening AI use cases for real return.') + '</p>' +
      '<p class="say is-s" style="position: absolute; left: var(--m-x); top: 800px">Take a worksheet and a pen. Starts ' + esc(ev.startsAt || '2:30') + '.</p>';
  }

  Deck.slide({
    id: 'walk-in',
    act: 0,
    title: 'Walk-in',
    minutes: 0,
    layout: 'title',
    steps: 0,
    html: TS && TS.markup ? TS.markup('walkin') : plainCard(),
    notes: [
      'SAY: Nothing. This loops while the room fills.',
      'DO: Leave it up until you are ready to start. Put the worksheets and pens where people walk in. The line bottom right counts down to ' + (ev.startsAt || '2:30') + ' on this laptop’s clock, so check the laptop’s clock is right.',
      'NEXT: One click, then say nothing. Let the first line land.'
    ].join('\n\n')
  });
}());
