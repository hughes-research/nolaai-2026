/*
 * slides/a4a-winner.js: Act 4 opens. The winner, and the problem it solves.
 *
 *   the-winner         1 min     the boring idea, and the 6,493 parts
 *   slotting-problem   1.5 min   a rack from the side, and the 23% ladder figure
 *
 * (The live warehouse scene, slides/a4b-live.js, runs between this file and
 * slides/a4c-project.js.)
 *
 * Every project figure is read from window.YOUR.slotting.results through
 * window.PROJECT (scenes/project.js). Nothing is typed here but copy.
 * Confidentiality: results and counts only; the rack is a generic drawing,
 * not the real one, and says so on the slide.
 */
(function () {
  'use strict';
  if (!window.Deck || !window.PROJECT) { return; }

  var P = window.PROJECT;
  var R = P.results;
  var T = window.THEME || null;
  var esc = P.esc;
  var num = P.num;

  var parts = num(R.parts);
  var slots = num(R.slots);
  var partsBig = P.numDisplay(R.parts);       // display type: the comma gets air
  var slotsBig = P.numDisplay(R.slots);
  var ladder = num(R.ladderPctAsIs) + '%';
  var label = esc(R.label || (T && T.tags.laborde) || '');

  /* ====================================================================
   * the-winner
   * ================================================================== */

  Deck.slide({
    id: 'the-winner',
    act: 4,
    title: 'The winner: where the parts live',
    minutes: 1,
    layout: 'px-winner',
    html: `
      <h2 class="say is-l px-winner-say">The winner:<br>where the parts live.</h2>
      <span class="tag is-laborde px-tag-tr">${label}</span>
      <p class="sub px-winner-sub" data-px>Warehouse slotting. Nobody pitches this.</p>
      <div class="px-fact" data-step="1">
        <p class="num px-fact-n"><b>${partsBig}</b></p>
        <p class="px-fact-t">
          <span class="px-fact-t1" data-px>parts were moving to a new building.</span>
          <span class="voice px-fact-t2" data-px>Every one needed an address.</span>
        </p>
      </div>
      ${P.driver('winner')}
    `,
    notes: `
      SAY: Here is the one that won at my place. Warehouse slotting.
      Slotting is deciding which shelf each part lives on.
      Nobody pitches this. It is not exciting. It is where the parts live.

      YOUR STORY: how slotting came up, and who brought it up.

      DO: Click once for the number.

      SAY: ${parts} parts were moving to a new building. Every one needed a new address.
      Somebody was going to decide where each one went. The only question was how.

      NEXT: Here is what that decision looks like on one rack.
    `
  });

  /* ====================================================================
   * slotting-problem
   * ================================================================== */

  /* The rack: six shelf levels in four zones, the same generic rack the
     re-creation uses. One level is 106px; the floor line is 8px. */
  var LEVEL = 106;
  var FLOOR = 8;
  var ZONES = [
    { id: 'floor', name: 'Floor', gloss: 'bend', from: 1, count: 1 },
    { id: 'golden', name: 'Golden zone', gloss: 'waist to shoulder', from: 2, count: 2 },
    { id: 'reach', name: 'Reach', gloss: '', from: 4, count: 1 },
    { id: 'ladder', name: 'Ladder', gloss: '', from: 5, count: 2 }
  ];

  function rackHtml() {
    var levels = '';
    for (var l = 1; l <= 6; l++) {
      levels += '<div class="px-lev' + (l === 1 ? ' is-ground' : '') + (l >= 5 ? ' is-high' : '') + '" data-l="' + l + '" data-px style="bottom:' + (FLOOR + (l - 1) * LEVEL) + 'px">' +
        '<i class="px-beam"></i><div class="px-parts">' + new Array(8).join('<i></i>') + '</div></div>';
    }
    return '<div class="px-rack" aria-hidden="true">' +
      '<i class="px-hatch" data-px></i>' +
      levels +
      '<i class="px-post is-l" data-px></i><i class="px-post is-r" data-px></i>' +
      '<i class="px-floor" data-px></i>' +
      '</div>';
  }

  function zonesHtml() {
    return ZONES.map(function (z) {
      var bottom = FLOOR + (z.from - 1) * LEVEL + 10;
      var height = z.count * LEVEL - 20;
      // the ladder zone's own label gives way to the band that names it
      var out = z.id === 'ladder' ? ' data-step-out="1"' : '';
      return '<p class="px-zone" data-z="' + z.id + '" data-px' + out + ' style="bottom:' + bottom + 'px;height:' + height + 'px">' +
        '<b class="label">' + esc(z.name) + '</b>' + (z.gloss ? '<span>' + esc(z.gloss) + '</span>' : '') + '</p>';
    }).join('');
  }

  Deck.slide({
    id: 'slotting-problem',
    act: 4,
    title: parts + ' parts. ' + slots + ' slots.',
    minutes: 1.5,
    layout: 'px-problem',
    html: `
      <h2 class="headline">${partsBig} parts. ${slotsBig} slots.</h2>
      <div class="px-prob">
        <p class="px-lead" data-step="1" data-px>Move them across in their current order and</p>
        <div class="px-band" data-step="1" data-px>
          <p class="num px-band-n" data-px><b>${ladder}</b></p>
          <p class="label px-band-src" data-px>${label}</p>
          <p class="px-band-t" data-px>of picks need a ladder.</p>
        </div>
        ${zonesHtml()}
        ${rackHtml()}
        <span class="tag is-example px-rack-tag" data-px>Rack drawing: illustration</span>
      </div>
      <p class="source-line">${label}</p>
      ${P.driver('rack')}
    `,
    notes: `
      SAY: ${parts} parts. ${slots} slots to put them in.
      This is a rack from the side. Floor shelf: you bend. The golden zone is waist to shoulder: no bending, no reaching.
      Above that you reach. Above that you go and get a ladder.

      DO: Click once for the ladder figure.

      SAY: The easy move is to carry every part across in the order it sits in today. That is the as-is move: no re-slotting.
      Do that, and ${ladder} of picks need a ladder.
      Taller racks make it worse. More of the shelf is up high, and whatever lands there stays there.

      NEXT: I can't show you our building. I can show you the method, running.
    `
  });
}());
