/*
 * slides/a4b-live.js: Act 4, the live re-creation ("slotting-live").
 *
 * One slide, the centerpiece: the warehouse scene (scenes/warehouse.js) walks
 * through seven steps on SYNTHETIC data. The slide owns the captions (a kicker
 * and a headline per step) and the honesty tag; the scene owns everything else.
 *
 * Step 0 plays when the slide enters, so the slide has 6 builds for 7 steps.
 * Planned for 5 minutes (lead's decision D8).
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
      /* thumbnails do not run scenes: they get a still of the empty building instead */
      '.wh-preview{display:none;position:absolute;left:0;top:0;width:100%;height:100%;color:var(--c-ink);}' +
      '.slide.is-static .wh-preview{display:block;}' +
      '.slide.is-static [data-scene="warehouse"].wh-host::after{content:none;}' +
    '</style>' +
    '<div class="scene wh-host" data-scene="warehouse" data-opts=\'{}\'></div>' +
    (window.WarehouseScene && window.WarehouseScene.preview ? window.WarehouseScene.preview() : '') +
    captions.map(function (c, i) {
      return '<p class="kicker" data-step-only="' + i + '">' + (i + 1) + ' of ' + captions.length + ' · ' + c[0] + '</p>' +
        '<h2 class="headline is-s wh-head" data-step-only="' + i + '" data-anim="pop">' + c[1] + '</h2>';
    }).join('') +
    tag;

  window.Deck.slide({
    id: 'slotting-live',
    act: 4,
    title: 'The method, live (synthetic re-creation)',
    minutes: 5,
    layout: 'scene',
    steps: captions.length - 1,
    html: html,
    notes: [
      'SAY: This is not our building. It is a made-up warehouse running the same method, live in this browser.\n' +
      'Every dot is a part. Big dot, fast mover. Speck, slow.\n' +
      'All synthetic. Ours comes after.',

      'DO, step 1 (on screen as the slide opens): Point at the pack station, bottom left. Then the side view: floor, golden zone, reach, ladder.',

      'DO, step 2: Click. A year of orders rains in. Point at the hatched bars: those picks need a ladder.',

      'DO, step 3: Click. The as-is move. The dashed line is the walk for the busiest day. Point at the ladder count.',

      'DO, step 4: Click. Rule of thumb first: fast movers to the golden shelves by the door. Then the search: swap two parts, replay the orders, keep the swap if pick time drops.',

      'DO, step 5: Click. Both walks again, same orders, same speed. Solid is new, dashed is old. Say nothing until the dashed one gets home.',

      'DO, step 6: Click. Read the four lines, before then after. The 100% is a rule the search has to keep, not something it found.\n' +
      "SAY: Don't write these down. This is a made-up building, and its numbers are bigger than ours. The real result is next, and it's smaller.",

      'DO, step 7: Click. Read the headline, then the block. Stop.\n' +
      'SAY: That time is how long the arithmetic took on this laptop. Nothing on this slide calls a model.',

      'NEXT: Same method. Our building, our orders.'
    ].join('\n\n')
  });
}());
