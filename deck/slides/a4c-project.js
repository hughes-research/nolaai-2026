/*
 * slides/a4c-project.js: Act 4 after the live scene. The real project.
 *
 *   slotting-results     2.5 min   four before / after pairs, then the old building
 *   seven-attempts       2.5 min   seven bars from a zero line, then the experiment log
 *   said-no              2 min     the four refusals: the title of the talk
 *   slotting-cost        2 min     three facts, then "if every try were a model call"
 *   slotting-scorecard   2 min     the project through its owner's own four gates
 *   how-we-built-it      0.5 min   the speaker's own list; skipped while it is empty
 *
 * WHERE THE NUMBERS COME FROM
 *   Every project figure and every line of project copy (methods, the rigor
 *   lines, the four refusals) is read from window.YOUR.slotting.results.
 *   Dollar figures are computed: the model-call totals by CostMath from the
 *   BenchLM file, the "minutes alone" screen by Gates.evaluate with the live
 *   rate and house rules. Nothing here is typed but copy.
 *
 * WHAT THE SPEAKER HAS NOT SUPPLIED
 *   YOUR.slotting.biggerReturn, .effort and .potential start empty. Nothing
 *   empty is ever drawn for the audience: while the bigger return has no
 *   value the scorecard stops at the NO on minutes (two steps, and the notes
 *   open with a NOT FILLED IN line and give the speaker his words). Once it
 *   has one, a third step adds it, any effort and potential values he has
 *   given (each simply absent while empty), and the closing line. Nothing is
 *   ever invented in their place, and no PASS is raised that the deck cannot
 *   compute.
 *
 * The motion lives in scenes/project.js; the html below is the finished
 * picture of each slide.
 */
(function () {
  'use strict';
  if (!window.Deck || !window.PROJECT) { return; }

  var P = window.PROJECT;
  var R = P.results;
  var SL = P.slotting;
  var T = window.THEME || null;
  var M = window.Motion || null;
  var esc = P.esc;
  var num = P.num;
  var money = P.money;
  var lowerFirst = P.lowerFirst;
  var isFilled = P.isFilled;

  var label = esc(R.label || (T && T.tags.laborde) || '');      // only where an Oct 27–28 run figure is shown
  var RECORDS = 'Laborde project records';
  var RECORDS_DATED = 'Laborde project records, Mar–Nov 2026';  // the commit count runs Mar 25 to Nov 4, 2026
  var caveats = (R.caveats || []).map(function (c) { return esc(lowerFirst(c)); });
  /* the speaker's own list for how-we-built-it. A line still marked YOUR
     STORY is not written yet: it stays off the screen, and the slide is
     skipped while nothing written remains. */
  var storyLines = ((window.YOUR.story || {}).howWeBuiltIt || []).filter(function (line) {
    return isFilled(line) && !/^\s*YOUR STORY\b/i.test(String(line));
  });
  /* the hand-off into Act 5, said while clicking (who-owns starts after it) */
  var BRIDGE = 'Mine was never about the minutes. Yours might be. Look at the one you kept.';

  /* a line of copy from the numbers file, closed with a full stop */
  var sentence = P.sentence;

  /* Each slide is registered inside its own guard: if a value in the numbers
     file breaks one slide, the others still register, and tools/shoot.js
     reports the one that did not. */
  function guard(id, register) {
    try { register(); }
    catch (err) {
      if (window.console && console.error) { console.error('[a4c-project] slide "' + id + '" was not registered:', err); }
    }
  }

  /* ====================================================================
   * slotting-results
   * ================================================================== */

  guard('slotting-results', function () {
    var old = R.oldBuilding || {};
    var pairs = [
      { what: 'Walk per pick run', from: R.walkFtAsIs, to: R.walkFtOptimized, unit: 'ft', less: R.walkPctLess },
      { what: 'Pick time per year', from: R.pickHoursAsIs, to: R.pickHoursOptimized, unit: 'hours', less: R.pickTimePctLess },
      { what: 'Picks that need a ladder', from: R.ladderPctAsIs, to: R.ladderPctOptimized, pct: true, point: true },
      { what: 'Fast movers in the golden zone', from: R.goldenPctAsIs, to: R.goldenPctOptimized, pct: true }
    ];

    function pairHtml(p) {
      var suffix = p.pct ? '%' : '';
      var unit = p.unit ? '<small>' + esc(p.unit) + '</small>' : '';
      return '<div class="pair' + (p.point ? ' is-point' : '') + '" data-from="' + p.from + '" data-to="' + p.to + '"' + (p.point ? ' data-point' : '') + '>' +
        '<p class="pair-what">' + esc(p.what) + '</p>' +
        '<p class="pair-v is-before"><b>' + num(p.from) + suffix + '</b>' + unit + '</p>' +
        '<i class="pair-arrow" data-step="1" data-px></i>' +
        '<p class="pair-v is-after" data-step="1" data-px><b data-suffix="' + suffix + '">' + num(p.to) + suffix + '</b>' + unit + '</p>' +
        (isFilled(p.less) ? '<p class="pair-note" data-step="1" data-px>' + num(p.less, 1) + '% less</p>' : '<span></span>') +
        '</div>';
    }

    Deck.slide({
      id: 'slotting-results',
      act: 4,
      title: 'The real numbers',
      minutes: 2.5,
      layout: 'px-results-slide',
      html: `
        <h2 class="headline px-h4">The real numbers.</h2>
        <span class="tag is-laborde px-tag-tr">${label}</span>
        <div class="px-results">
          <div class="px-res-head"><span></span><span class="label">As-is move</span><span></span><span class="label">Optimized</span><span></span></div>
          ${pairs.map(pairHtml).join('')}
        </div>
        <div class="px-old" data-step="2">
          <p class="label">Optimized, versus the old building today</p>
          <div class="px-old-row">
            <p class="px-old-f" data-px><b class="num">${num(old.walkPctLess, 1)}%</b><span>less walking</span></p>
            <p class="px-old-f" data-px><b class="num">${num(old.pickTimePctLess, 1)}%</b><span>less pick time</span></p>
            <p class="deadpan" data-px>In a bigger building.</p>
          </div>
        </div>
        <p class="source-line">Laborde results, ${esc(R.asOf)} · ${caveats[0] || ''} · ${caveats[1] || ''}<span class="px-src-line2">results depend on where the pack station is<span class="px-src-more" data-step="2"> · ${caveats[2] || ''}</span></span></p>
        ${P.driver('results')}
      `,
      notes: `
        SAY: That was a re-creation on made-up data. These are the real numbers, from the runs of ${R.asOf}.
        Left: the as-is move, every part carried across in today's order. Right: the layout the tool chose.

        DO: Click once. Read each result as it lands.

        SAY: The caveats, out loud, before anyone writes these down.
        The baseline is the as-is move. It says so on the slide.
        The pick times are placeholders until we do a time study on the floor.
        And they hold for the pack station we chose. Move it and the numbers move.

        DO: Click once more for the old building.

        SAY: Against the old building as it runs today: ${num(old.walkPctLess, 1)} percent less walking, ${num(old.pickTimePctLess, 1)} percent less pick time. In a bigger building.
        The old building's floor plan is an estimate. That is on the slide too.

        NEXT: It did not come out like that the first time. Or the third.
      `
    });
  });

  /* ====================================================================
   * seven-attempts
   * ================================================================== */

  guard('seven-attempts', function () {
    var attempts = (R.attempts || []).filter(function (a) { return a && isFinite(Number(a.pct)); });
    var old7 = R.oldBuilding || {};

    /* Geometry of the chart, in stage px. Linear, from zero, drawn to scale. */
    var AT = (function () {
      var PX = 9;                 // px per percentage point
      var VAL = 64;               // room for a value at the end of a bar
      var RULE = 6;
      var COL = 248, BAR = 200;
      var maxUp = 0, maxDown = 0;
      attempts.forEach(function (a) {
        if (a.pct > maxUp) { maxUp = a.pct; }
        if (-a.pct > maxDown) { maxDown = -a.pct; }
      });
      var y0 = VAL + Math.round(maxUp * PX);
      var h = y0 + RULE + Math.round(maxDown * PX) + VAL;
      return { px: PX, val: VAL, rule: RULE, col: COL, bar: BAR, y0: y0, h: h };
    }());

    function attemptHtml(a, i) {
      var up = a.pct >= 0;
      var h = Math.max(3, Math.round(Math.abs(a.pct) * AT.px));
      var last = i === attempts.length - 1;
      var bar, val, lab, ret = '';
      if (up) {
        bar = 'bottom:' + (AT.h - AT.y0) + 'px;height:' + h + 'px';
        val = 'bottom:' + (AT.h - AT.y0 + h + 14) + 'px';
        lab = 'top:' + (AT.y0 + AT.rule + 18) + 'px';
      } else {
        bar = 'top:' + (AT.y0 + AT.rule) + 'px;height:' + h + 'px';
        val = 'top:' + (AT.y0 + AT.rule + h + 14) + 'px';
        lab = 'bottom:' + (AT.h - AT.y0 + 16) + 'px';
        if (a.retired) { ret = '<span class="px-att-ret" data-px style="top:' + (AT.y0 + AT.rule + h - 58) + 'px">retired</span>'; }
      }
      // data-step: static copies (overview, presenter preview) follow the builds too
      return '<div class="px-att-col" data-step="' + (up ? 2 : 1) + '" data-dir="' + (up ? 1 : -1) + '" style="left:' + (i * AT.col) + 'px;width:' + AT.col + 'px">' +
        '<i class="px-att-bar' + (a.retired ? ' is-retired is-struck' : '') + (last && up ? ' is-point' : '') + '" data-px data-h="' + h + '" style="' + bar + '"></i>' +
        '<b class="num px-att-val" data-px style="' + val + '">' + P.signedPct(a.pct) + '</b>' +
        ret +
        '<p class="px-att-lab" data-px style="' + lab + '"><b class="num">' + esc(a.n) + '</b><span>' + esc(a.method) + '</span></p>' +
        '</div>';
    }

    var firstUp = 0;
    attempts.forEach(function (a, i) { if (a.pct < 0) { firstUp = i + 1; } });

    /* one attempt, as the speaker would read it out */
    function attemptLine(a) {
      return 'Attempt ' + a.n + ': ' + lowerFirst(a.method) + '. ' + P.signedPct(a.pct) + '.' + (a.retired ? ' Retired.' : '');
    }

    Deck.slide({
      id: 'seven-attempts',
      act: 4,
      title: 'Seven attempts',
      minutes: 2.5,
      layout: 'chart px-attempts-slide',
      html: `
        <h2 class="headline px-h4">Seven attempts.<br>The first three lost to the old building.</h2>
        <p class="label axis-note">Percent less walking · zero is the old building · drawn to scale</p>
        <div class="px-att" style="height:${AT.h}px">
          <i class="px-att-zero" data-px style="top:${AT.y0}px"></i>
          ${attempts.map(attemptHtml).join('')}
          <ul class="px-rigor" data-step="3" style="left:${firstUp * AT.col - 4}px;top:${AT.y0 + AT.rule + 18 + 182 + 26}px">
            ${(R.rigor || []).map(function (line) { return '<li data-px>' + esc(sentence(line)) + '</li>'; }).join('')}
          </ul>
        </div>
        <p class="sub px-att-line" data-step="2" data-px>The gains came from measuring real orders, not from fancier solvers.</p>
        <p class="source-line">Laborde project records · ${esc(R.attemptsNote || '')}</p>
        ${P.driver('attempts')}
      `,
      notes: `
        SAY: This is what the work actually looked like. Seven attempts.
        The line is the old building. Above it: less walking than today. Below it: more.

        DO: Click once for the first three. Read them as they land.

        SAY: Three attempts in, we were losing to the old building. The fancier the math got, the worse it did. We retired two of them.

        YOUR STORY: what made you keep going after three losses.

        DO: Click once for the climb. Read the four bars as they land.

        SAY: Attempt four added annealing: try a swap, keep it if the walk gets shorter.
        The gains came from measuring against real orders. Not from fancier math.
        These are from the March model, on a placeholder floor plan. The October runs, on the real shelving plan with every part, came out at ${num(old7.walkPctLess, 1)}% against the old building: the number on the last slide.

        DO: Click once for three lines from our own experiment log.

        SAY: We found placements that could not physically happen, so we marked our own headline down.
        Two ways of measuring the same layout disagreed. We reported the lower one.
        And a bug once said 220 percent. We called it nonsense and fixed it.

        NEXT: That is the building of it. Now the part this talk is named after.
      `
    });
  });

  /* ====================================================================
   * said-no
   * ================================================================== */

  guard('said-no', function () {
    var refusals = (R.saidNo || []).slice(0, 4);

    /* one refusal, as the speaker would read it out */
    function refusalLine(i) {
      var r = refusals[i];
      return r ? sentence(r.what) + ' ' + sentence(r.why) : '';
    }

    Deck.slide({
      id: 'said-no',
      act: 4,
      title: 'What we said no to',
      minutes: 2,
      layout: 'px-no-slide',
      steps: refusals.length,
      html: `
        <h2 class="headline is-hero px-no-head">What we said no to.</h2>
        <span class="tag is-laborde is-records px-tag-tr px-no-tag">${RECORDS}</span>
        <div class="dock px-no-dock">
          ${refusals.map(function (r, i) {
            // data-step: static copies (overview, presenter preview) follow the builds too
            return '<article class="gate is-no is-flare is-still">' +
              '<i class="gate-shutter"></i>' +
              // a hyphen inside a word never breaks ("a-year" stays whole); one after a figure may
              '<h3 class="gate-name" data-step="' + (i + 1) + '" data-px>' + esc(r.what).replace(/[A-Za-z]+(?:-[A-Za-z]+)+/g, '<span class="px-nobr">$&</span>') + '</h3>' +
              '<p class="gate-q" data-step="' + (i + 1) + '" data-px>' + esc(sentence(r.why)) + '</p>' +
              '</article>';
          }).join('')}
        </div>
        ${P.driver('no')}
      `,
      notes: `
        SAY: Four of them, inside one project.

        DO: Click once for each. Say the idea as it appears, let the NO land, then give the reason.

        SAY: One. ${refusalLine(0)} Plain rules do the job, and no data leaves the building.

        SAY: Two. ${refusalLine(1)} You just saw them: attempts two and three.

        SAY: Three. ${refusalLine(2)} Every part was moving anyway. After that, a full re-slot on a schedule is hard to justify.

        SAY: Four. ${refusalLine(3)} We found it online. Unverified, so it stays out.

        YOUR STORY: which of the four was hardest to say no to, and who you had to say it to.

        NEXT: So what does the thing we did build cost to run?
      `
    });
  });

  /* ====================================================================
   * slotting-cost
   * ================================================================== */

  guard('slotting-cost', function () {
    var commits = R.commits || {};
    var run = R.run || {};
    var mc = P.modelCalls();
    var callsWords = (mc.calls >= 1e6 && mc.calls % 1e6 === 0) ? num(mc.calls / 1e6) + ' million' : num(mc.calls);
    var callsBig = (mc.calls >= 1e6 && mc.calls % 1e6 === 0)
      ? '<b>' + num(mc.calls / 1e6) + '</b><small>million</small>'
      : '<b>' + num(mc.calls) + '</b>';

    /* Bars: linear, from zero. The dearest tier runs to the edge of the stage. */
    var CB = (function () {
      var LMAX = 1357;            // from the axis to the right edge of the stage
      var ROW = 80, GAP = 16;
      var max = 0;
      mc.rows.forEach(function (r) { if (r.total > max) { max = r.total; } });
      return { lmax: LMAX, row: ROW, gap: GAP, max: max };
    }());

    function costRowHtml(r, i) {
      var w = CB.max > 0 ? Math.max(1, Math.round(r.total / CB.max * CB.lmax * 10) / 10) : 0;
      var top = i * (CB.row + CB.gap);
      var biggest = r.total === CB.max;
      var sliver = w < 12;
      // a sliver stands alone: the axis is broken beside it and an arrow points at it
      var PTR = 56 + 18, GAP = 16;
      var valLeft = 435 + w + 22 + (sliver ? GAP + PTR + 14 : 0);
      return '<div class="px-cb-row" style="top:' + top + 'px">' +
        (sliver ? '<i class="px-cb-cut" data-px></i>' : '') +
        '<p class="px-cb-name" data-px>' + esc(P.curly(r.label)) + '</p>' +
        '<i class="px-cb-bar" data-px data-w="' + w + '" style="width:' + w + 'px"></i>' +
        (sliver ? '<i class="px-cb-ptr" data-px style="left:' + (435 + w + GAP + 18) + 'px"></i>' : '') +
        '<b class="num px-cb-val' + (biggest ? ' is-inside' : '') + '" data-px' + (biggest ? '' : ' style="left:' + valLeft + 'px"') + '>' + esc(r.text) + '</b>' +
        '</div>';
    }

    var costStrip = T ? T.gateStrip({ now: 1 }) : '';
    var NB = '\u00a0';
    var tokensLine = mc.tokens ? [num(mc.tokens.in), 'tokens', 'in', '/', num(mc.tokens.out), 'out', 'per', 'call'].join(NB) : '';
    var pricedAs = mc.rows.map(function (r) { return '<span class="px-nobr">' + esc(r.model) + '</span>'; }).join(', ');

    Deck.slide({
      id: 'slotting-cost',
      act: 4,
      title: 'What it costs to run: nothing',
      minutes: 2,
      layout: 'px-cost-slide',
      steps: mc.ok ? 2 : 0,
      html: `
        ${costStrip}
        <h2 class="headline px-h4 px-cost-head">What it costs to run:<br>nothing.</h2>
        <div class="px-facts"${mc.ok ? ' data-step-out="1"' : ''}>
          <div class="px-fact3" data-px data-count="${commits.aiCoAuthored}">
            <p class="counter-v"><b>${num(commits.aiCoAuthored)}</b><small>of ${num(commits.total)}</small></p>
            <p>commits co‑written with an AI coding assistant</p>
          </div>
          <div class="px-fact3" data-px>
            <p class="counter-v"><b>${num(R.aiModelsAtRunTime)}</b></p>
            <p>AI models running when it runs</p>
          </div>
          <div class="px-fact3" data-px${(mc.calls >= 1e6 && mc.calls % 1e6 === 0) ? ' data-count="' + (mc.calls / 1e6) + '"' : ''}>
            <p class="counter-v">${callsBig}</p>
            <p>swaps tried in about ${num(run.minutes)} minutes</p>
          </div>
        </div>
        ${mc.ok ? `
        <div class="px-cb" data-step="1">
          <p class="px-cb-recap" data-px><b>${num(commits.aiCoAuthored)} of ${num(commits.total)}</b> commits co‑written with AI · <b>${num(R.aiModelsAtRunTime)}</b> AI models at run time · <b>${callsWords}</b> swaps in about ${num(run.minutes)}&nbsp;minutes</p>
          <p class="px-cb-lead">If each of those ${callsWords} tries were a model call:</p>
          <p class="label px-cb-note" data-px>${esc((T && T.tags.example) || 'Example')} · Cost of one run · US dollars · bars drawn to scale</p>
          <div class="px-cb-plot" style="height:${mc.rows.length * (CB.row + CB.gap)}px">
            <i class="px-cb-axis" data-px></i>
            ${mc.rows.map(costRowHtml).join('')}
          </div>
          <div class="px-cb-band" data-px>
            <p class="px-cb-band-name">Plain code</p>
            <i class="px-cb-band-axis"></i>
            <p class="voice px-cb-band-val" data-px>the electricity.</p>
          </div>
          <p class="sub px-cb-line" data-step="2" data-px>The model’s job was to help write the tool. Not to be the tool.</p>
        </div>` : ''}
        <p class="source-line"><span${mc.ok ? ' class="px-src-more" data-step-out="1"' : ''}>${RECORDS_DATED}</span>${mc.ok ? `<span class="px-src-more" data-step="1">${RECORDS_DATED} · Source: ${esc(mc.source)} · tiers: ${pricedAs} · ${tokensLine}</span>` : ''}</p>
        ${P.driver('cost')}
      `,
      notes: `
        SAY: Gate one, on a real project: nothing.
        ${num(commits.aiCoAuthored)} of our ${num(commits.total)} commits, the saved versions of the code, were co-written with an AI coding assistant.
        When the tool runs, ${num(R.aiModelsAtRunTime)} AI models run. It is plain math: ${callsWords} swaps in about ${num(run.minutes)} minutes, on one ${num(run.cores)}-core machine.

        DO: Click once for the thought experiment.

        SAY: This is a deliberately silly design. Would anyone call a model ${callsWords} times? Nobody would. That is the point: wrong tool.
        I show it because that is what "put AI in the loop" means for a problem like this. Tokens are pieces of words; it is the same task size as the cost slides.
        ${mc.rows.map(function (r) { return P.curly(r.label) + ': ' + r.text + '.'; }).join(' ')} For one run.
        Plain code: the electricity.

        DO: Click once for the line.

        SAY: The model's job was to help write the tool. Not to be the tool.

        NEXT: So it passes cost. That is one gate of four.
      `
    });
  });

  /* ====================================================================
   * slotting-scorecard
   * ================================================================== */

  guard('slotting-scorecard', function () {
    var ma = P.minutesAlone();
    var sup = P.supplied();
    var MAX_BIGGER = 3;
    if (sup.bigger.length > MAX_BIGGER && window.console && console.error) {
      console.error('[slotting-scorecard] "The bigger return" has ' + sup.bigger.length + ' entries; the slide shows the first ' + MAX_BIGGER + '. Put the rest in the notes.');
    }
    var bigger = sup.bigger.slice(0, MAX_BIGGER);
    var filled = sup.filled;
    var returnPass = ma.pass === true;
    var costPass = ma.costPass !== false;
    var showClose = filled && ma.pass === false;
    var costText = (ma.ok && M) ? M.formatNumber(ma.costPerYear, '$,d') : money(0);
    var minutesMoney = ma.ok ? money(ma.value) : '';
    var floorMoney = ma.ok ? money(ma.limit) : '';
    var ladderFrom = num(R.ladderPctAsIs) + '%';
    var ladderTo = num(R.ladderPctOptimized) + '%';
    var nextAfterScorecard = storyLines.length ? 'Here is how we actually built it.' : BRIDGE;
    var growthText = sup.growth == null ? null : (typeof sup.growth === 'number' ? num(sup.growth) + '×' : String(sup.growth));
    var hasEffort = sup.buildHours != null || sup.upkeepHoursPerMonth != null;
    var hasPotential = growthText != null || sup.potentialNote != null;

    /* what is still empty in your-numbers.js, in words, for the notes */
    var empty = [];
    if (!filled) { empty.push('the bigger return'); }
    if (!hasEffort) { empty.push('the effort'); }
    else {
      if (sup.buildHours == null) { empty.push('the build hours'); }
      if (sup.upkeepHoursPerMonth == null) { empty.push('the upkeep hours'); }
    }
    if (growthText == null) { empty.push('the growth'); }
    function andList(list) {
      return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
    }

    /* A value is printed as typed when it is words ('6 weeks', '$48,000'); a
       plain number gets its thousands commas and nothing else (no unit is
       guessed). The figure is set as large as its length and the bay allow. */
    function biggerHtml() {
      var n = bigger.length;
      var cls = n === 1 ? 'is-one' : (n === 2 ? 'is-many' : 'is-many is-three');
      return '<div class="px-br ' + cls + '">' + bigger.map(function (b, i) {
        var text = typeof b.value === 'number' ? num(b.value) : String(b.value);
        var cap = n === 1 ? 104 : (i === 0 && n === 2 ? 72 : 56);
        var size = Math.max(48, Math.min(cap, Math.floor(362 / (0.46 * Math.max(1, text.length)))));
        return '<div class="px-br-item">' +
          '<b class="num px-br-v" data-brv="' + size + '" style="--brv:' + size + 'px">' + esc(text) + '</b>' +
          (isFilled(b.label) ? '<span class="px-br-l">' + esc(b.label) + '</span>' : '') +
          // with more than one entry the notes go to the speaker notes, not the bay
          (n === 1 && isFilled(b.note) ? '<span class="px-br-n">' + esc(b.note) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>';
    }

    /* a value the speaker has given; one he has not is simply absent */
    function kv(name, value, unit) {
      if (!isFilled(value)) { return ''; }
      return '<div class="px-kv" data-px><p class="label">' + esc(name) + '</p>' +
        '<p class="px-kv-v"><b class="num">' + esc(typeof value === 'number' ? num(value) : value) + '</b>' + (unit ? '<span>' + esc(unit) + '</span>' : '') + '</p>' +
        '</div>';
    }

    var verdictMark = function (pass) { return T ? T.verdict(pass ? 'pass' : 'no') : (pass ? 'Pass' : 'No'); };
    var notYet = (!returnPass && T) ? '<p class="px-notyet" data-step="2" data-px>' + T.verdict('notyet') + '</p>' : '';
    // the reason, in the rule's own two parts: under the floor, and cash comes in no sooner
    var returnWhy = returnPass ? 'carried forward'
      : esc('under ' + floorMoney + ',') + '<br>and no cash sooner';

    /* the bigger return, in words, for the notes */
    var biggerSay = sup.bigger.map(function (b) {
      var v = typeof b.value === 'number' ? num(b.value) : String(b.value);
      return (isFilled(b.label) ? sentence(b.label + ': ' + v) : sentence(v)) + (isFilled(b.note) ? ' ' + sentence(P.upperFirst(b.note)) : '');
    }).join(' ');
    var effortSay = [
      sup.buildHours != null ? (typeof sup.buildHours === 'number' ? num(sup.buildHours) + ' hours to build' : 'Build: ' + sup.buildHours) : '',
      sup.upkeepHoursPerMonth != null ? (typeof sup.upkeepHoursPerMonth === 'number' ? num(sup.upkeepHoursPerMonth) + ' hours a month to keep alive' : 'Upkeep: ' + sup.upkeepHoursPerMonth) : ''
    ].filter(Boolean).join(', ');
    var potentialSay = [growthText != null ? 'Growth: ' + growthText : '', sup.potentialNote != null ? String(sup.potentialNote) : ''].filter(Boolean).join(', ');

    var notesHead = `
        ${empty.length ? 'NOT FILLED IN: ' + andList(empty) + (empty.length > 1 ? ' are' : ' is') + ' empty in your-numbers.js' + (filled ? '. Nothing empty is shown.' : ', so this slide stops at the NO.') : ''}

        SAY: Now the uncomfortable part. My own favorite project, through my own four gates.

        DO: Click: Cost.

        SAY: ${costText} to run. No model runs when it runs. Pass.

        DO: Click: Return. Let the NO land before you speak.

        SAY: On minutes alone it saves ${num(ma.hours)} pick hours a year. At ${ma.ok ? money(ma.rate) : 'the example rate'} an hour, ${minutesMoney || 'a small number'}.
        My rule: under ${floorMoney || 'the floor'} a year, and no days off the cash cycle, is a no.
        Picking is on my cash path. But walking less doesn't bring cash in any sooner. So: no.
        And any no ends it. Effort and Potential never get asked.`;

    var notesEmpty = `
        DO: Nothing more to click here. The line under the gates lands on its own.

        SAY: So on minutes alone my own project fails my own screen. ${minutesMoney} a year.
        I'm not going to put a number up here that I can't show you all four Waypoint boxes for.
        My rule says stop at the first no. We built it anyway, and I'm telling you that in the open.
        What made it worth doing: every part was moving anyway. The choice was never automate or not.
        It was guess or calculate. And calculating took ladder picks from ${ladderFrom} to ${ladderTo}.
        The move was free. The build was not.

        YOUR STORY: why you built it anyway, in one sentence you can defend.
`;

    var later = [effortSay ? 'SAY: ' + sentence(effortSay) : '', potentialSay ? 'SAY: ' + sentence(potentialSay) : '', showClose ? 'SAY: The minutes said no. The move said yes.' : '']
      .filter(Boolean).map(function (line) { return '\n        ' + line + '\n'; }).join('');
    var notesFilled = `
        DO: Click: the bigger return.

        SAY: My rule says stop at the first no. I'm overruling it in the open, and here is why.
        The move was the one free re-slot. Every part was moving anyway, so it was never automate or not. It was guess or calculate.
        The move was free. The build was not.

        SAY: ${biggerSay}

        YOUR STORY: the bigger return, in a sentence or two.
${later}`;

    Deck.slide({
      id: 'slotting-scorecard',
      act: 4,
      title: 'My own project, through my own gates',
      // how-we-built-it carries half a minute only while it is in the running order
      minutes: storyLines.length ? 2 : 2.5,
      layout: 'px-score-slide',
      steps: filled ? 3 : 2,
      html: `
        <h2 class="headline px-h4 px-sc-head">My own project,<br>through my own gates.</h2>
        <p class="source-line px-sc-src">${label}<br>${num(ma.hours)} hours = ${num(R.pickHoursAsIs)} − ${num(R.pickHoursOptimized)} pick hours a year${ma.ok ? '<br>valued at ' + money(ma.rate) + ' an hour, an example rate' : ''}</p>
        <div class="dock px-sc-dock">
          <article class="gate px-g-cost is-still ${costPass ? 'is-pass' : 'is-no'}">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Cost</h3>
            <div class="px-find" data-step="1">
              <p class="px-find-hero" data-px><b class="num">${esc(costText)}</b><span>to run</span></p>
            </div>
            <p class="gate-why">${costPass ? 'carried forward' : 'over the cost limit'}</p>
          </article>
          <article class="gate px-g-return is-still ${returnPass ? 'is-pass is-minutes-pass' : 'is-no is-flare has-tell'}">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Return</h3>
            <div class="px-find px-find-min${returnPass ? ' is-blend' : ''}" data-step="2">
              <p class="label" data-px>On minutes alone</p>
              <p class="px-find-l" data-px style="margin-top:14px">${num(ma.hours)} hours a year</p>
              <p class="num px-find-eq" data-px>= ${minutesMoney}</p>
            </div>
            ${filled ? `
            <div class="px-find px-find-rec2" data-step="3">
              <p class="px-find-rec" data-px="rec"><b class="num">${minutesMoney}</b><span class="px-per">on minutes alone</span>${verdictMark(returnPass)}</p>
            </div>
            <div class="px-brx is-point" data-step="3" data-px>
              <p class="label">The bigger return</p>
              ${biggerHtml()}
            </div>` : ''}
            <p class="gate-why">${returnWhy}</p>
          </article>
          <article class="gate px-g-effort is-still">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Effort</h3>
            ${filled && hasEffort ? `<div class="px-find" data-step="3">
              ${kv('Build', sup.buildHours, 'hours')}
              ${kv('Upkeep', sup.upkeepHoursPerMonth, 'hours a month')}
            </div>` : ''}
            ${notYet}
          </article>
          <article class="gate px-g-potential is-still">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Potential</h3>
            ${filled && hasPotential ? `<div class="px-find" data-step="3">
              ${kv('Growth', growthText, '')}
              ${sup.potentialNote != null ? '<p class="px-kv-note" data-px>' + esc(sup.potentialNote) + '</p>' : ''}
            </div>` : ''}
            ${notYet}
          </article>
        </div>
        <p class="voice is-l px-sc-close px-sc-reslot" data-step="2" data-px>The move was the<br>one free re-slot.</p>
        ${showClose ? '<p class="voice is-l px-sc-close" data-step="3" data-px>The minutes said no.<br>The move said yes.</p>' : ''}
        ${P.driver('scorecard', { costPass: costPass, returnPass: returnPass, filled: filled })}
      `,
      notes: notesHead + '\n' + (filled ? notesFilled : notesEmpty) + `
        NEXT: ${nextAfterScorecard}
      `
    });
  });

  /* ====================================================================
   * how-we-built-it
   * ================================================================== */

  guard('how-we-built-it', function () {
    var story = storyLines;
    if (story.length > 6 && window.console && console.error) {
      console.error('[how-we-built-it] The story list has ' + story.length + ' lines; the slide shows the first 6. Put the rest in the notes.');
    }

    Deck.slide({
      id: 'how-we-built-it',
      act: 4,
      title: 'How we actually built it',
      minutes: 0.5,
      layout: 'list',
      skip: function () { return story.length === 0; },
      html: `
        <h2 class="headline">How we actually built it.</h2>
        <ol class="list px-how${story.length > 4 ? ' is-many' : ''}">
          ${story.slice(0, 6).map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('')}
        </ol>
      `,
      notes: `
        YOUR STORY: how you actually built it, in the order it happened. One breath per line.

        NEXT: ${BRIDGE}
      `
    });
  });

}());
