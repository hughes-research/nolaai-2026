/*
 * deck/slides/a2b-cost.js: Act 2, the cost gate. Three slides, in running order:
 *
 *   gate-cost            What does it cost to run?            the price ladder
 *   cost-people-scale    For one person, cost almost never says no.   18 seconds
 *   cost-record-scale    100,000 records. Same task.          bars, then score against price
 *
 * The charts are the scenes in deck/scenes/cost.js. This file holds the slide
 * chrome (kicker, headline, source line, the gate strip) and the speaker notes.
 *
 * Every figure, on screen and in the notes, is computed: window.CostScenes
 * (which asks window.CostMath) writes the charts and the lines around them.
 * The headlines are the brief's copy. Nothing here types a price or a count.
 *
 * Each scene host is filled with a poster of its own chart when the deck
 * loads, so the overview and the presenter view show the real picture and a
 * scene that failed to start would still leave a correct slide on screen.
 */
(function () {
  'use strict';
  if (!window.Deck || typeof window.Deck.slide !== 'function') { return; }

  var CS = window.CostScenes || null;
  var CM = window.CostMath || null;
  var T = window.THEME || null;

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* The strip that says which of the four gates we are on: the theme's own markup, or the same thing by hand. */
  function gateStrip(now) {
    if (T && typeof T.gateStrip === 'function') { return T.gateStrip({ now: now }); }
    return '<nav class="gate-strip" data-now="' + now + '" aria-label="The four gates"><b>Cost</b><b>Return</b><b>Effort</b><b>Potential</b></nav>';
  }

  function poster(name) { return CS ? CS.poster(name) : ''; }

  /* The computed words. If the cost data cannot be read the slides still register, with the lines left empty. */
  var copy = {};
  var f = null;
  try {
    copy = CS.copy();
    f = CS.facts();
  } catch (err) {
    copy = { volumeText: '', frontierSentence: '', ladderAxis: '', ladderSource: '', breakevenSource: '', barsSource: '', scatterSource: '' };
    f = null;
  }

  /* ---- figures for the speaker notes, from the same place as the slides ---- */

  var n = {
    priced: '', rows: '', cheapest: '', dearest: '', dearestName: '', dearestPhrase: 'the dearest model on that list', tiesBoth: false, spread: '', rate: '',
    secDear: '', secFrontier: '', secSmall: '', small100k: '', premium100k: '',
    tokens: '', sentence: copy.frontierSentence || '', strict: '', same: '', frontier: '',
    up1: '', up1pts: '', up2: '', up2pts: '', estimated: '', volume: copy.volumeText || '', task: 'the same size of job'
  };
  if (f && CM) {
    var tier = f.tier;
    var s = f.summary;
    // the brief's plain-words gloss of the default task size; any other size is given in tokens
    n.task = f.tokensAreDefault ? 'read about a page and a half, write a few paragraphs' : f.tokensText;
    n.tokens = f.tokensText;
    n.priced = String(f.counts.priced);
    n.rows = String(f.counts.rows);
    n.cheapest = CM.money(f.spread.cheapestPrice);
    n.dearest = CM.money(f.spread.dearestPrice);
    n.dearestName = f.spread.dearest ? f.spread.dearest.name : '';
    // the dearest price is a tie in the file: "one of the two dearest", counted, never typed
    var tiedDear = (f.spread.tiedDearest || []);
    var countWord = ['', 'one', 'two', 'three', 'four', 'five'];
    n.dearestPhrase = tiedDear.length > 1
      ? 'one of the ' + (countWord[tiedDear.length] || String(tiedDear.length)) + ' dearest models on that list, ' + n.dearestName +
        ' (tied with ' + tiedDear.filter(function (m) { return m.name !== n.dearestName; }).map(function (m) { return m.name; }).join(' and ') + ')'
      : 'the dearest model on that list, ' + n.dearestName;
    n.tiesBoth = tiedDear.length > 1 && (f.spread.tiedCheapest || []).length > 1;
    n.spread = CM.ratio(f.spread.ratio);
    n.rate = CM.money(f.rate);
    n.secDear = CM.seconds(CM.breakEvenSeconds(f.spread.dearest, f.rate));
    n.secFrontier = tier.frontier ? CM.seconds(CM.breakEvenSeconds(tier.frontier, f.rate)) : '';
    n.secSmall = tier.small ? CM.seconds(CM.breakEvenSeconds(tier.small, f.rate)) : '';
    n.small100k = tier.small ? CM.money(CM.volumeCost(tier.small, CS.defaultVolume)) : '';
    n.premium100k = tier.premium ? CM.money(CM.volumeCost(tier.premium, CS.defaultVolume)) : '';
    n.strict = String(s.beatenByCheaper);
    n.same = String(s.beatenAtSamePriceOnly);
    n.frontier = String(s.frontier);
    n.estimated = String(f.priced.filter(function (m) { return m.estimated; }).length);
    if (tier.small && tier.mid && tier.frontier) {
      var a = CM.stepComparison(tier.small.modelName, tier.mid.modelName);
      var b = CM.stepComparison(tier.mid.modelName, tier.frontier.modelName);
      n.up1 = CM.ratio(a.priceRatio);
      n.up1pts = CM.number(CM.roundTo(a.scoreGain, 0));
      n.up2 = CM.ratio(b.priceRatio);
      n.up2pts = CM.number(CM.roundTo(b.scoreGain, 1));
      if (b.estimated) { n.up2pts = 'an estimated ' + n.up2pts; }
    }
  }

  /* ======================================================================
   * gate-cost: the price ladder
   * ==================================================================== */

  window.Deck.slide({
    id: 'gate-cost',
    act: 2,
    title: 'Gate 1: Cost',
    minutes: 1.5,
    layout: 'chart',
    steps: 1,
    html:
      gateStrip(1) +
      '<p class="kicker">Gate 1 · Cost</p>' +
      '<h2 class="headline">What does it cost to run?</h2>' +
      '<p class="label is-tight axis-note">' + esc(copy.ladderAxis) + '</p>' +
      '<div class="plot is-full scene cg-host cg-ladder" data-scene="cost-ladder">' + poster('ladder') + '</div>' +
      '<p class="source-line">' + esc(copy.ladderSource) + '</p>',
    notes: [
      'SAY: I build a cost and return analysis before I even start a project. You look this up before you start. Not after.',
      'Every dot is a model, one AI engine you pay by the use: ' + n.priced + ' of the ' + n.rows + ' in the BenchLM leaderboard file.',
      'Same task for every one: ' + n.task + '. The file counts that in tokens, pieces of words: ' + n.tokens + '.',
      'Price is per run, one go at that task. Cheapest: ' + n.cheapest + '. Dearest: ' + n.dearest + '.',
      'Log scale: each step along is ten times the last.',
      '',
      'DO: Click once for the spread: ' + n.spread + ' between the cheapest and the dearest.' +
        (n.tiesBoth ? ' Two models share the top price and two share the bottom one; the source line names them.' : '') +
        ' If someone asks about a dot, point at it with the mouse and its name comes up.',
      '',
      'NEXT: ' + n.spread + ' sounds like a lot. For one person, it is nothing.'
    ].join('\n')
  });

  /* ======================================================================
   * cost-people-scale: 18 seconds
   * ==================================================================== */

  window.Deck.slide({
    id: 'cost-people-scale',
    act: 2,
    title: 'Cost at people scale: ' + n.secDear,
    minutes: 1,
    layout: 'figure',
    steps: 1,
    html:
      gateStrip(1) +
      '<p class="kicker">Gate 1 · Cost · People scale</p>' +
      '<h2 class="headline is-s">For one person, cost almost never says no.</h2>' +
      '<div class="scene cg-host cg-be" data-scene="cost-breakeven">' + poster('breakeven') + '</div>' +
      '<p class="source-line">' + esc(copy.breakevenSource) + '</p>',
    notes: [
      'SAY: Take ' + n.dearestPhrase + '. ' + n.dearest + ' a run.',
      'At ' + n.rate + ' an hour it pays for itself if it saves ' + n.secDear + '. Once.',
      'LESSON ONE: at people scale, cost rarely says no. Effort and return decide.',
      '',
      'DO: The ' + n.rate + ' is an example rate. If the room pays more, drag the slider and the number follows. Click once for the other two tiers: the frontier model needs ' + n.secFrontier + ', the small one ' + n.secSmall + '. If asked: frontier is the top-scoring tier; premium is the "pro" tier, priced highest.',
      '',
      'NEXT: That’s one person, once. Now hand the same job to a machine, over and over.'
    ].join('\n')
  });

  /* ======================================================================
   * cost-record-scale: bars to scale, then score against price
   * ==================================================================== */

  window.Deck.slide({
    id: 'cost-record-scale',
    act: 2,
    title: 'Cost at record scale: plain code wins',
    minutes: 2,
    layout: 'chart',
    steps: 4,
    printSteps: [1, 4],   // the PDF gets the bars with the plain-code punchline, and the scatter
    html:
      gateStrip(1) +
      '<p class="kicker">Gate 1 · Cost · Record scale</p>' +
      '<h2 class="headline cg-swap" data-cg-view="bars" data-step-out="2"><span data-cg="n">' + esc(copy.volumeText) + '</span> <span data-cg="unit">records</span>. Same task.</h2>' +
      '<h2 class="headline is-s cg-swap" data-cg-view="scatter" data-step="2">' + esc(copy.frontierSentence) + '.</h2>' +
      '<div class="plot is-full scene cg-host cg-show" data-scene="cost">' + poster('showdown') + '</div>' +
      '<p class="source-line cg-swap" data-cg-view="bars" data-step-out="2">' + esc(copy.barsSource) + '</p>' +
      '<p class="source-line cg-swap" data-cg-view="scatter" data-step="2">' + esc(copy.scatterSource) + '</p>',
    notes: [
      'SAY: ' + n.volume + ' records. Each record is one run of that same task.',
      'Small model: ' + n.small100k + '. Premium: ' + n.premium100k + '. Drawn to scale.',
      'LESSON TWO: at record scale, the tool you pick is the whole game. And plain code wins.',
      'Just using a model alone may not be the most cost-effective answer.',
      '',
      'DO: Volume buttons if there is time.',
      'Click 1: plain code. About zero. No bar to draw.',
      'Click 2: score against price. Up is the overall score: the leaderboard’s average across its tests, so a rough grade. Along is price, the same log scale. ' + n.sentence + '. Only ' + n.frontier + ' are on the line.',
      'Click 3: small to mid, ' + n.up1 + ' the price for about ' + n.up1pts + ' points.',
      'Click 4: mid to frontier, another ' + n.up2 + ' for ' + n.up2pts + '.',
      'The scores are the file’s own. Hollow dots are the ' + n.estimated + ' it marks estimated. Talk in tiers, not ranks.',
      '',
      'NEXT: So which tool do you reach for first? Not the dearest one.'
    ].join('\n')
  });
}());
