/*
 * slides/a4b-live.js: Act 4, the live re-creation ("slotting-live").
 *
 * One slide, the centerpiece: the warehouse scene (scenes/warehouse.js) walks
 * through seven steps on SYNTHETIC data. The slide owns the captions (a kicker
 * and a headline per step) and the honesty tag; the scene owns everything else.
 *
 * Step 0 plays when the slide enters, so the slide has 6 builds for 7 steps.
 *
 * Every number in a caption is computed: the counts come from Slotting.params()
 * here, and the scene overwrites each [data-wh] span with the value from the
 * run it actually made (including the measured milliseconds).
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var Slotting = window.Slotting;
  var THEME = window.THEME;

  function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* What the captions can know before the scene has run. */
  var P = Slotting ? Slotting.params() : null;
  var facts = P ? {
    parts: commas(P.parts),
    slots: commas(2 * P.aisles * 2 * P.baysPerFace * Slotting.LEVELS),
    orders: commas(P.orders),
    tried: commas(P.iterations)
  } : { parts: '', slots: '', orders: '', tried: '' };

  function fill(key, fallback) {
    return '<span data-wh="' + key + '">' + (facts[key] != null ? facts[key] : (fallback || '')) + '</span>';
  }

  var captions = [
    ['The building', fill('parts') + ' parts. ' + fill('slots') + ' shelf slots.'],
    ['A year of orders', 'The hot parts are everywhere.'],
    ['The as-is move', 'One day of picking. Count the ladders.'],
    ['The optimizer', 'Rule of thumb. Then ' + fill('tried') + ' swaps.'],
    ['Same orders again', 'Same orders. Shorter walk.'],
    ['Before and after', 'Same parts. Same orders. New shelves.'],
    ['What it took', fill('tried') + ' swaps tried in ' + fill('ms', '…') + ' ms.']
  ];

  var tag = THEME && typeof THEME.tag === 'function'
    ? THEME.tag('recreation')
    : '<span class="tag is-synthetic">Animated re-creation · synthetic data</span>';

  var html =
    '<style>' +
      /* the headline sits under the kicker, and stays on one line above the map */
      '.layout-scene > .headline.wh-head{top:124px;white-space:nowrap;max-width:none;margin:0;}' +
    '</style>' +
    '<div class="scene" data-scene="warehouse" data-opts=\'{}\'></div>' +
    captions.map(function (c, i) {
      return '<p class="kicker" data-step-only="' + i + '">' + (i + 1) + ' of ' + captions.length + ' · ' + c[0] + '</p>' +
        '<h2 class="headline is-s wh-head" data-step-only="' + i + '" data-anim="pop">' + c[1] + '</h2>';
    }).join('') +
    tag;

  window.Deck.slide({
    id: 'slotting-live',
    act: 4,
    title: 'The method, live (synthetic re-creation)',
    minutes: 6,
    layout: 'scene',
    steps: captions.length - 1,
    html: html,
    notes: [
      'SAY: This is not our building. It is a made-up warehouse, running the same method, in this browser.',
      'Every dot is a part on a shelf. Big dot, fast mover.',
      'Everything on this slide is synthetic. The real numbers are the next slide.',

      'DO, step 1 (on screen when the slide opens): Point at the pack station, bottom left. Then the side view on the right: floor, golden zone, reach, ladder.',

      'DO, step 2: Click. A year of orders rains in. Let the dots grow. Point at the hatched bars: those picks need a ladder.',

      'DO, step 3: Click. The as-is move. Pickers walk the busiest day. Let it run to the end. Watch the ladder count, not the map.',

      'DO, step 4: Click. First a rule of thumb: fast movers to the golden zone, nearest the pack station. Then the search. Swap two parts, replay the orders, keep the swap if the walk got shorter. Point at the curve coming down.',

      'DO, step 5: Click. Same orders, same pickers, same speed. Say nothing until they are done.',

      'DO, step 6: Click. Read the four lines, before then after.',

      'DO, step 7: Click. Read the headline, then the block. Stop.',

      'SAY: What you watched was a replay of a search this laptop finished a moment ago. The time on screen is how long the arithmetic really took.',
      'Plain math. I used an AI assistant to help write it. Nothing here calls a model.',

      'NEXT: That was a toy on made-up data. Here are the real numbers.'
    ].join('\n\n')
  });
}());
