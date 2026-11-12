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
 *   YOUR.slotting.biggerReturn, .effort and .potential start empty. Each
 *   empty value is drawn as the theme's "YOUR NUMBER" slot, and the closing
 *   line of the scorecard is left out. Fill them in and the slide completes
 *   itself. Nothing is ever invented in their place.
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

  var label = esc(R.label || (T && T.tags.laborde) || '');
  var caveats = (R.caveats || []).map(function (c) { return esc(lowerFirst(c)); });
  var slot = function (size) { return T ? T.slot(null, size) : '<span class="slot-yours">Your number</span>'; };
  var storyLines = ((window.YOUR.story || {}).howWeBuiltIt || []).filter(function (line) { return isFilled(line); });

  /* a line of copy from the numbers file, closed with a full stop for the notes */
  function sentence(s) { s = String(s || '').trim(); return s ? s + (/[.!?]$/.test(s) ? '' : '.') : ''; }

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
        '<i class="pair-arrow" data-px></i>' +
        '<p class="pair-v is-after" data-px><b data-suffix="' + suffix + '">' + num(p.to) + suffix + '</b>' + unit + '</p>' +
        (isFilled(p.less) ? '<p class="pair-note" data-px>' + num(p.less, 1) + '% less</p>' : '<span></span>') +
        '</div>';
    }

    Deck.slide({
      id: 'slotting-results',
      act: 4,
      title: 'The real numbers',
      minutes: 2.5,
      layout: 'px-results-slide',
      html: `
        <h2 class="headline">The real numbers.</h2>
        <span class="tag is-laborde px-tag-tr">${label}</span>
        <div class="px-results">
          <div class="px-res-head"><span></span><span class="label">As-is move</span><span></span><span class="label">Optimized</span><span></span></div>
          ${pairs.map(pairHtml).join('')}
        </div>
        <div class="px-old" data-step="2">
          <p class="label">Versus the<br>old building</p>
          <p class="px-old-f" data-px><b class="num">${num(old.walkPctLess, 1)}%</b><span>less walking</span></p>
          <p class="px-old-f" data-px><b class="num">${num(old.pickTimePctLess, 1)}%</b><span>less pick time</span></p>
          <p class="deadpan" data-px>In a bigger<br>building.</p>
        </div>
        <p class="source-line">Laborde results, ${esc(R.asOf)} · ${caveats[0] || ''} · ${caveats[1] || ''}<span class="px-src-more px-src-line2" data-step="2">${esc(R.caveats && R.caveats[2] || '')} · results depend on where the pack station is</span></p>
        ${P.driver('results')}
      `,
      notes: `
        SAY: That was a re-creation on made-up data. These are the real numbers, from the runs of ${R.asOf}.
        On the left, the as-is move: every part carried across in the order it sits in today. On the right, the layout the tool chose.

        DO: Click once. The four results come in one at a time. Read each one as it lands.

        SAY: Walk per pick run: ${num(R.walkFtAsIs)} feet down to ${num(R.walkFtOptimized)}. That is ${num(R.walkPctLess, 1)} percent less.
        Pick time per year: ${num(R.pickHoursAsIs)} hours down to ${num(R.pickHoursOptimized)}. ${num(R.pickTimePctLess, 1)} percent less.
        Picks that need a ladder: ${num(R.ladderPctAsIs)} percent down to ${num(R.ladderPctOptimized)} percent.
        Fast movers in the golden zone: ${num(R.goldenPctAsIs)} percent up to ${num(R.goldenPctOptimized)} percent.

        SAY: The caveats, out loud. Three things before you write any of that down.
        These are measured against the as-is move: every part in its current order. That is the baseline, and it says so on the slide.
        The pick times are placeholders. They stand until we do a time study on the floor.
        And they are for the pack station we chose. Move the pack station and the numbers move.

        DO: Click once more for the old building.

        SAY: Against the old building as it runs today: ${num(old.walkPctLess, 1)} percent less walking and ${num(old.pickTimePctLess, 1)} percent less pick time. In a bigger building.
        One more caveat, and it is on the slide: the old building's floor plan is an estimate.

        NEXT: It did not come out like that the first time. Or the third.
      `
    });
  });

  /* ====================================================================
   * seven-attempts
   * ================================================================== */

  guard('seven-attempts', function () {
    var attempts = (R.attempts || []).filter(function (a) { return a && isFinite(Number(a.pct)); });

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
      return '<div class="px-att-col" data-dir="' + (up ? 1 : -1) + '" style="left:' + (i * AT.col) + 'px;width:' + AT.col + 'px">' +
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
        <h2 class="headline is-s">Seven attempts. The first three lost to the old building.</h2>
        <p class="label axis-note">Percent less walking than the old building · drawn to scale</p>
        <div class="px-att" style="height:${AT.h}px">
          <i class="px-att-zero" data-px style="top:${AT.y0}px"></i>
          ${attempts.map(attemptHtml).join('')}
          <ul class="px-rigor" data-step="3" style="left:${firstUp * AT.col - 4}px;top:${AT.y0 + AT.rule + 18 + 182 + 26}px">
            ${(R.rigor || []).map(function (line) { return '<li data-px>' + esc(line) + '</li>'; }).join('')}
          </ul>
        </div>
        <p class="sub px-att-line" data-step="2" data-px>The gains came from measuring real orders, not from fancier solvers.</p>
        <p class="source-line">Laborde project records · ${esc(R.attemptsNote || '')}</p>
        ${P.driver('attempts')}
      `,
      notes: `
        SAY: This is what the work actually looked like. Seven attempts.
        The line is the old building. Above it is less walking than we do today. Below it is more.

        DO: Click once for the first three.

        SAY: ${attempts.filter(function (a) { return a.pct < 0; }).map(attemptLine).join(' ')}
        Three attempts in, we were losing to the old building. And the fancier the math got, the worse it did.
        We retired two of them.

        YOUR STORY: what made you keep going after three losses.

        DO: Click once for the climb.

        SAY: ${attempts.filter(function (a) { return a.pct >= 0; }).map(attemptLine).join(' ')}
        The gains came from measuring real orders, not from fancier solvers.

        DO: Click once for three lines from our own experiment log.

        SAY: ${(R.rigor || []).map(sentence).join(' ')}
        The first one: we found placements that could not physically happen, so we marked our own headline down.
        The second: two ways of measuring the same layout disagreed, and we reported the lower one.

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
        <div class="dock px-no-dock">
          ${refusals.map(function (r) {
            return '<article class="gate is-no is-flare is-still">' +
              '<i class="gate-shutter"></i>' +
              '<h3 class="gate-name" data-px>' + esc(r.what) + '</h3>' +
              '<p class="gate-q" data-px>' + esc(r.why) + '</p>' +
              '</article>';
          }).join('')}
        </div>
        ${P.driver('no')}
      `,
      notes: `
        SAY: This is the title of the talk, inside one project. Four things we said no to.

        DO: Click once for each. Say the idea as it appears, let the NO land, then give the reason.

        SAY: One. ${refusalLine(0)} Plain rules do the job, and no data leaves the building.

        SAY: Two. ${refusalLine(1)} You just saw them: attempts two and three.

        SAY: Three. ${refusalLine(2)} Every part was moving anyway. After that, a full re-slot on a schedule is hard to justify.

        SAY: Four. ${refusalLine(3)} We found the figure online with no primary source behind it. We excluded it as unverified.

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
      return '<div class="px-cb-row" style="top:' + top + 'px">' +
        (sliver ? '<i class="px-cb-cut" data-px></i>' : '') +
        '<p class="px-cb-name" data-px>' + esc(r.label) + '</p>' +
        '<i class="px-cb-bar" data-px data-w="' + w + '" style="width:' + w + 'px"></i>' +
        '<b class="num px-cb-val' + (biggest ? ' is-inside' : '') + '" data-px' + (biggest ? '' : ' style="left:' + (435 + w + 22) + 'px"') + '>' + esc(r.text) + '</b>' +
        '</div>';
    }

    var costStrip = T ? T.gateStrip({ now: 1 }) : '';
    var tokensLine = mc.tokens ? 'assumes ' + num(mc.tokens.in) + ' tokens in / ' + num(mc.tokens.out) + ' out per call' : '';
    var pricedAs = mc.rows.map(function (r) { return esc(r.model); }).join(', ');

    Deck.slide({
      id: 'slotting-cost',
      act: 4,
      title: 'What it costs to run: nothing',
      minutes: 2,
      layout: 'px-cost-slide',
      steps: mc.ok ? 2 : 0,
      html: `
        <p class="kicker">Cost · on the real project</p>
        ${costStrip}
        <h2 class="headline px-cost-head">What it costs to run: nothing.</h2>
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
          <p class="px-cb-lead">If each of those ${callsWords} tries were a model call:</p>
          <p class="label px-cb-note" data-px>Cost of one run · US dollars · bars drawn to scale</p>
          <div class="px-cb-plot" style="height:${mc.rows.length * (CB.row + CB.gap)}px">
            <i class="px-cb-axis" data-px></i>
            ${mc.rows.map(costRowHtml).join('')}
            <p class="deadpan" data-px>Nobody would. That is the point.</p>
          </div>
          <div class="px-cb-band" data-px>
            <p class="px-cb-band-name">Plain code</p>
            <i class="px-cb-band-axis"></i>
            <p class="voice px-cb-band-val" data-px>the electricity.</p>
          </div>
          <p class="sub px-cb-line" data-step="2" data-px>The model’s job was to help write the tool. Not to be the tool.</p>
        </div>` : ''}
        <p class="source-line"><span${mc.ok ? ' class="px-src-more" data-step-out="1"' : ''}>${label}</span>${mc.ok ? `<span class="px-src-more" data-step="1">Source: ${esc(mc.source)} · tiers priced as ${pricedAs} · ${tokensLine}</span>` : ''}</p>
        ${P.driver('cost')}
      `,
      notes: `
        SAY: Gate one, on a real project. What does it cost to run? Nothing.
        ${num(commits.aiCoAuthored)} of our ${num(commits.total)} commits were co-written with an AI coding assistant. AI helped write this tool.
        When the tool runs, the number of AI models running is ${num(R.aiModelsAtRunTime)}. It is plain math.
        One run tries ${callsWords} swaps in about ${num(run.minutes)} minutes, on one machine with ${num(run.cores)} cores.

        DO: Click once for the thought experiment.

        SAY: Now pretend every one of those ${callsWords} tries was a call to a model. Same task size I have used all afternoon.
        ${mc.rows.map(function (r) { return r.label + ': ' + r.text + ' for one run.'; }).join(' ')}
        Plain code: the electricity.
        Nobody would build it this way. That is the point. It is the wrong tool for the job, and the cost gate tells you so before you start.

        DO: Click once for the line.

        SAY: The model's job was to help write the tool. Not to be the tool.

        NEXT: So it passes cost. Now the other three gates. My own project, my own rules.
      `
    });
  });

  /* ====================================================================
   * slotting-scorecard
   * ================================================================== */

  guard('slotting-scorecard', function () {
    var ma = P.minutesAlone();
    var bigger = (Array.isArray(SL.biggerReturn) ? SL.biggerReturn : []).filter(function (b) { return b && isFilled(b.value); });
    var effort = SL.effort || {};
    var potential = SL.potential || {};
    var returnPass = ma.pass === true;
    var costPass = ma.costPass !== false;
    var showClose = bigger.length > 0 && ma.pass === false;
    var costText = (ma.ok && M) ? M.formatNumber(ma.costPerYear, '$,d') : money(0);
    var nextAfterScorecard = storyLines.length ? 'Here is how we actually built it.' : 'We just got the minutes back. So who owns them?';

    function biggerHtml() {
      if (!bigger.length) { return slot(); }
      var shown = bigger.slice(0, 3);
      return '<div class="px-br">' + shown.map(function (b) {
        // the figure is set as large as its own length and the bay allow
        var len = Math.max(1, String(b.value).length);
        var size = Math.max(44, Math.min(shown.length > 1 ? 72 : 104, Math.floor(318 / (0.43 * len))));
        return '<div class="px-br-item">' +
          '<b class="num px-br-v" style="--brv:' + size + 'px">' + esc(b.value) + '</b>' +
          (isFilled(b.label) ? '<span class="px-br-l">' + esc(b.label) + '</span>' : '') +
          (isFilled(b.note) ? '<span class="px-br-n">' + esc(b.note) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>';
    }

    function kv(name, value, unit) {
      return '<div class="px-kv" data-px><p class="label">' + esc(name) + '</p>' +
        (isFilled(value)
          ? '<p class="px-kv-v"><b class="num">' + esc(typeof value === 'number' ? num(value) : value) + '</b>' + (unit ? '<span>' + esc(unit) + '</span>' : '') + '</p>'
          : slot('s')) +
        '</div>';
    }

    var verdictMark = function (pass) { return T ? T.verdict(pass ? 'pass' : 'no') : (pass ? 'Pass' : 'No'); };
    var growthText = isFilled(potential.growth) ? (typeof potential.growth === 'number' ? num(potential.growth) + '×' : String(potential.growth)) : null;

    Deck.slide({
      id: 'slotting-scorecard',
      act: 4,
      title: 'My own project, through my own gates',
      minutes: 2,
      layout: 'px-score-slide',
      steps: 3,
      html: `
        <h2 class="headline is-s px-sc-head">My own project,<br>through my own gates.</h2>
        ${showClose ? '<p class="voice is-l px-sc-close" data-step="3" data-px>The minutes said no.<br>The move said yes.</p>' : ''}
        <div class="dock px-sc-dock">
          <article class="gate px-g-cost is-still ${costPass ? 'is-pass' : 'is-no'}">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Cost</h3>
            <div class="px-find" data-step="1">
              <p class="px-find-hero" data-px><b class="num">${esc(costText)}</b><span>to run</span></p>
            </div>
            <p class="gate-why">${costPass ? 'carried forward' : 'over the cost limit'}</p>
          </article>
          <article class="gate px-g-return is-still ${returnPass ? 'is-pass is-minutes-pass' : 'has-tell'}">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Return</h3>
            <div class="px-find px-find-min is-blend" data-step="2" data-step-out="3">
              <p class="label" data-px>On minutes alone</p>
              <p class="px-find-l" data-px style="margin-top:14px">${num(ma.hours)} hours a year</p>
              <p class="num px-find-eq" data-px>= ${ma.ok ? money(ma.value) : ''}</p>
            </div>
            <div class="px-find px-find-rec2" data-step="3">
              <p class="label" data-px="rec">On minutes alone</p>
              <p class="px-find-rec" data-px="rec"><b class="num">${ma.ok ? money(ma.value) : ''}</b><span class="px-per">a year</span>${verdictMark(returnPass)}</p>
            </div>
            <div class="px-brx ${bigger.length ? 'is-point' : 'is-empty'}" data-step="3" data-px>
              <p class="label">The bigger return</p>
              ${biggerHtml()}
            </div>
            <p class="gate-why">${returnPass ? 'carried forward' : 'under the ' + (ma.ok ? money(ma.limit) : '') + ' floor'}</p>
          </article>
          <article class="gate px-g-effort is-still">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Effort</h3>
            <div class="px-find" data-step="3">
              ${kv('Build', effort.buildHours, 'hours')}
              ${kv('Upkeep', effort.upkeepHoursPerMonth, 'hours a month')}
            </div>
          </article>
          <article class="gate px-g-potential is-still">
            <i class="gate-shutter"></i>
            <h3 class="gate-name">Potential</h3>
            <div class="px-find" data-step="3">
              ${kv('Growth', growthText, '')}
              ${isFilled(potential.note) ? '<p class="px-kv-note" data-px>' + esc(potential.note) + '</p>' : ''}
            </div>
          </article>
        </div>
        <p class="source-line">${label} · ${num(ma.hours)} hours = ${num(R.pickHoursAsIs)} − ${num(R.pickHoursOptimized)} pick hours a year${ma.ok ? ' · valued at ' + money(ma.rate) + ' an hour, an example rate' : ''}</p>
        ${P.driver('scorecard', { costPass: costPass, returnPass: returnPass })}
      `,
      notes: `
        SAY: Now the uncomfortable part. My own favourite project, through my own four gates, in front of you.

        DO: Click once for Cost.

        SAY: Cost. ${costText} to run. No model runs when it runs. Pass.

        DO: Click once for Return.

        SAY: Return, on minutes alone. The tool saves ${num(ma.hours)} pick hours a year. At ${ma.ok ? money(ma.rate) : 'the example rate'} an hour that is ${ma.ok ? money(ma.value) : 'a small number'}.
        My own house rule says under ${ma.ok ? money(ma.limit) : 'the floor'} a year is a no. So on minutes alone: no.
        If minutes were the whole story, this project stops at gate two, and I would be telling you so.

        DO: Click once for the bigger return.

        YOUR STORY: the bigger return. The move is the one free re-slot: every part was moving anyway, so the choice was never automate or not. It was guess or calculate. Say what calculating was worth, in your own numbers.

        YOUR STORY: effort. What it took to build, and what it takes to keep alive.

        YOUR STORY: potential. Where it goes next.

        SAY: The minutes said no. The move said yes.

        NEXT: ${nextAfterScorecard}
      `
    });
  });

  /* ====================================================================
   * how-we-built-it
   * ================================================================== */

  guard('how-we-built-it', function () {
    var story = storyLines;

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
          ${story.slice(0, 6).map(function (line) {
            // a line the speaker has not written yet stays visibly unwritten
            return /^\s*YOUR STORY\b/i.test(line)
              ? '<li>' + (T ? T.slot('Your story') : '<span class="slot-yours">Your story</span>') + '</li>'
              : '<li>' + esc(line) + '</li>';
          }).join('')}
        </ol>
      `,
      notes: `
        YOUR STORY: how you actually built it, in the order it happened. One breath per line.

        NEXT: We just got the minutes back. So who owns them?
      `
    });
  });

}());
