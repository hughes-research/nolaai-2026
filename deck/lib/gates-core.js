/*
 * deck/lib/gates-core.js  ->  window.Gates
 * -----------------------------------------------------------------------------
 * The four-gate screen: COST, RETURN, EFFORT, POTENTIAL. One candidate in, every
 * intermediate number and a YES / NO out. This file is the math in section 4 of
 * docs/BRIEF.md ("The math"), written out line for line. docs/MATH.md explains
 * the same thing in plain language with a worked example.
 *
 *   laborValue      = minutesPerRun x runsPerWeek x workWeeks x loadedHourly / 60
 *   capacityValue   = service lens ? hoursFreedPerYear x capacityConversion x billableMarginPerHour : 0
 *   cashFreed       = product lens ? daysOffCashCycle x annualRevenue / 365 : 0
 *                     (one-time working capital; shown separately, NOT in yearly return)
 *   RETURN / year   = service lens ? max(laborValue, capacityValue) : laborValue
 *   COST / year     = runsPerWeek x workWeeks x pricePerRun(tier) + toolsPerMonth x 12
 *   EFFORT one-time = (buildHours + rolloutHours) x builderHourly
 *   EFFORT / year   = upkeepHoursPerMonth x 12 x builderHourly
 *   year1Net        = RETURN - COST - EFFORTone - EFFORTyear
 *   paybackWeeks    = EFFORTone / ((RETURN - COST - EFFORTyear) / 52)   (never, if that is <= 0)
 *   year2RunRate    = (RETURN - COST) x growth - EFFORTyear
 *   twoYearValue    = year1Net + year2RunRate        <- "the math picks" ranks by this
 *
 * House rules (defaults; editable in window.YOUR.houseRules):
 *   COST      says NO when yearly cost is more than 30% of yearly return.
 *   RETURN    says NO when yearly return is under $5,000 and the task does not touch the cash path.
 *   EFFORT    says NO when payback is longer than 26 weeks.
 *   POTENTIAL says NO when growth is below 1x or nobody owns the freed time.
 * Any NO and the candidate is out. Among the survivors, highest twoYearValue wins.
 *
 * Loads as a classic <script> (attaches to window) and under Node
 * (module.exports). Touches no DOM. Needs CostMath (for the price per run of a
 * tier) and reads window.YOUR for the speaker's rates and rules; both are
 * looked up when a function is called, so script order does not matter.
 *
 * API
 *   evaluate(candidate, assumptions)  -> the full result for one candidate (see below)
 *   rank(candidates, assumptions)     -> results, survivors first by twoYearValue, then the rest;
 *                                        each also has place (1 = top) and winner (true / false)
 *   minuteRule(loadedHourly, workWeeks) -> dollars a year for one minute saved a week (25 at defaults)
 *   cashPerDay(annualRevenue)         -> dollars freed by one day off the cash cycle
 *   defaultAssumptions()              -> { rates, company, tokens, houseRules }: window.YOUR over built-in defaults
 *   formatWeeks(weeks)                -> "about 15 weeks" / "never"
 *   GATES, ORDER                      -> the four gates, in screening order
 *
 * This code never returns NaN. Every division is guarded, every input is
 * cleaned first, and the two values that can honestly be infinite
 * (paybackWeeks, and the cost share when nothing comes back) say so.
 */
(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window : null;
  var inNode = (typeof module === 'object' && module !== null && typeof module.exports === 'object');

  var MINUTES_PER_HOUR = 60;
  var MONTHS_PER_YEAR = 12;
  var WEEKS_PER_YEAR = 52;   // payback is counted in calendar weeks
  var DAYS_PER_YEAR = 365;
  var MAX_INPUT = 1e12;      // inputs are capped here so no sum can overflow

  /* Used when window.YOUR is missing or a value in it is not a usable number. */
  var BUILT_IN = {
    rates: { loadedHourly: 30, builderHourly: 75, workWeeks: 50 },
    company: { annualRevenue: 20000000, label: 'Example: a $20M distributor' },
    tokens: { in: 2000, out: 500 },
    houseRules: {
      costMaxShareOfReturn: 0.30,
      minReturnPerYear: 5000,
      maxPaybackWeeks: 26,
      minGrowth: 1
    }
  };

  /* The four gates in the order a candidate meets them. */
  var GATES = [
    { id: 'cost',      label: 'Cost',      question: 'What does it cost to run?' },
    { id: 'return',    label: 'Return',    question: 'What comes back: cash sooner, or more work done?' },
    { id: 'effort',    label: 'Effort',    question: 'What does it take to build it and keep it alive?' },
    { id: 'potential', label: 'Potential', question: 'If it works, how far does it grow?' }
  ];
  var ORDER = GATES.map(function (g) { return g.id; });

  var TIMES = '\u00d7'; // a real multiplication sign, for "1.5x" in sentences


  /* ---------------------------------------------------------------------------
   * Dependencies, looked up lazily
   * ------------------------------------------------------------------------ */

  /* window.NAME in the browser; require() as a fallback under Node. */
  function dep(globalName, nodePath) {
    if (root && root[globalName]) return root[globalName];
    if (inNode && typeof require === 'function') {
      try { return require(nodePath); } catch (e) { /* fall through */ }
    }
    return null;
  }

  function costMath() {
    var cm = dep('CostMath', './cost-math.js');
    if (!cm) throw new Error('Gates: CostMath is missing. Load deck/lib/cost-math.js.');
    return cm;
  }

  function your() {
    return dep('YOUR', '../content/your-numbers.js') || {};
  }


  /* ---------------------------------------------------------------------------
   * Input cleaning
   * ------------------------------------------------------------------------ */

  /*
   * A usable number between 0 and MAX_INPUT, or the fallback. Accepts numeric
   * strings (form fields hand us strings). Blank, negative, NaN and Infinity
   * all become the fallback. This is the first line of defence against NaN.
   */
  function num(x, fallback) {
    if (x === null || x === undefined || x === '' || typeof x === 'boolean') return fallback;
    var n = Number(x);
    if (!isFinite(n) || n < 0) return fallback;
    return Math.min(n, MAX_INPUT);
  }

  /* true / false, forgiving of 'true', 'false', 'yes', 'no', 1 and 0 from forms. */
  function bool(x) {
    if (typeof x === 'string') {
      var s = x.trim().toLowerCase();
      return !(s === '' || s === 'false' || s === 'no' || s === '0' || s === 'off');
    }
    return !!x;
  }

  function copy(obj) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    return out;
  }

  /* Lay the usable numbers of `over` on top of `base`, key by key. */
  function overlayNumbers(base, over) {
    var out = copy(base);
    if (!over || typeof over !== 'object') return out;
    for (var k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k) && typeof base[k] === 'number') {
        out[k] = num(over[k], base[k]);
      }
    }
    return out;
  }

  /* Merge one layer of { rates, company, tokens, houseRules } over another. */
  function mergeAssumptions(base, over) {
    over = over || {};
    var company = overlayNumbers(base.company, over.company);
    if (over.company && typeof over.company.label === 'string') company.label = over.company.label;
    return {
      rates: overlayNumbers(base.rates, over.rates),
      company: company,
      tokens: overlayNumbers(base.tokens, over.tokens),
      houseRules: overlayNumbers(base.houseRules, over.houseRules)
    };
  }

  /*
   * The assumptions in force: the speaker's file (window.YOUR) laid over the
   * built-in defaults. A fresh object every call, safe to edit:
   *
   *     var a = Gates.defaultAssumptions();
   *     a.rates.loadedHourly = 60;
   *     Gates.evaluate(candidate, a);
   */
  function defaultAssumptions() {
    return mergeAssumptions(BUILT_IN, your());
  }

  /*
   * What evaluate() actually uses: the defaults with the caller's overrides on
   * top. Overrides may be partial ({ rates: { loadedHourly: 60 } }). For
   * convenience the individual numbers may also be given flat
   * ({ loadedHourly: 60, annualRevenue: 5000000 }).
   */
  function resolveAssumptions(a) {
    var base = defaultAssumptions();
    if (!a || typeof a !== 'object') return base;
    var merged = mergeAssumptions(base, a);
    merged.rates = overlayNumbers(merged.rates, a);
    merged.company = overlayNumbers(merged.company, a);
    merged.houseRules = overlayNumbers(merged.houseRules, a);
    return merged;
  }

  /*
   * A candidate with every field present and usable. Missing numbers are 0.
   * Any extra fields the caller put on the candidate (a note, a colour) are
   * carried through untouched. The original object is never changed.
   */
  function cleanCandidate(c) {
    c = (c && typeof c === 'object') ? c : {};
    var text = function (v) { return (v !== undefined && v !== null) ? String(v) : ''; };
    // The tier may arrive as an id ('small') or as a tier object from CostMath.tiers().
    var tierId = (c.tier && typeof c.tier === 'object') ? c.tier.id : c.tier;

    var out = copy(c);
    out.id = text(c.id);
    out.name = text(c.name);
    out.pitch = text(c.pitch);
    out.lens = (String(c.lens || '').trim().toLowerCase() === 'service') ? 'service' : 'product';
    out.minutesPerRun = num(c.minutesPerRun, 0);
    out.runsPerWeek = num(c.runsPerWeek, 0);
    out.tier = text(tierId);
    out.toolsPerMonth = num(c.toolsPerMonth, 0);
    out.buildHours = num(c.buildHours, 0);
    out.rolloutHours = num(c.rolloutHours, 0);
    out.upkeepHoursPerMonth = num(c.upkeepHoursPerMonth, 0);
    out.growth = num(c.growth, 1);                                    // no projection given = stays the same size
    out.touchesCashPath = bool(c.touchesCashPath);
    out.daysOffCashCycle = num(c.daysOffCashCycle, 0);
    out.capacityConversion = Math.min(num(c.capacityConversion, 0), 1); // a share: 0 to 1
    out.billableMarginPerHour = num(c.billableMarginPerHour, 0);
    out.ownerNamed = bool(c.ownerNamed);
    return out;
  }


  /* ---------------------------------------------------------------------------
   * Wording helpers
   * ------------------------------------------------------------------------ */

  function formatWeeks(weeks) {
    if (weeks === Infinity) return 'never';
    if (typeof weeks !== 'number' || weeks !== weeks) return 'n/a';
    if (weeks === 0) return '0 weeks';
    if (weeks < 1) return 'under a week';
    var w = Math.round(weeks);
    return 'about ' + w + (w === 1 ? ' week' : ' weeks');
  }

  function growthText(g) {
    return String(Number(g.toFixed(2))) + TIMES;
  }

  /*
   * Close calls. Rounded for the screen, 30.4% against a 30% limit reads
   * "30% ... the limit is 30%", which makes a NO look like a mistake. When the
   * rounded figure would look the same as its limit but the two really differ,
   * use the more precise wording instead.
   */
  function unlessSameAs(limitText, roundedText, preciseText) {
    return roundedText === limitText ? preciseText : roundedText;
  }

  function withCommas(wholeNumber) {
    return String(wholeNumber).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* Dollars and cents, always: 4999.6 -> "$4,999.60". Only used for close calls. */
  function exactMoney(x) {
    var cents = Math.round(Math.abs(x) * 100);
    var text = '$' + withCommas(Math.floor(cents / 100)) + '.' + ('0' + (cents % 100)).slice(-2);
    return (x < 0 ? '\u2212' : '') + text;
  }


  /* ---------------------------------------------------------------------------
   * evaluate
   * ------------------------------------------------------------------------ */

  /*
   * Run one candidate through the four gates.
   *
   * Returns:
   *   id, name, candidate        the cleaned inputs
   *   assumptions                the rates, company, tokens and house rules used
   *   tier, tierLabel, pricePerRun
   *   runsPerYear, hoursFreedPerYear
   *   laborValue, capacityValue, cashFreed
   *   returnPerYear, costPerYear, costShareOfReturn
   *   effortOnce, effortPerYear
   *   yearlyNetBeforeBuild       RETURN - COST - EFFORTyear (what pays the build back)
   *   year1Net, paybackWeeks (Infinity = never), year2RunRate, twoYearValue
   *   gates: { cost, return, effort, potential }, each
   *          { id, label, question, pass, metric, metricText, rule, reason }
   *   verdict                    'YES' or 'NO'
   *   firstNo                    the first failing gate id in screening order, or null
   *   failed                     every failing gate id, in order
   *   summary                    one sentence for the whole result
   *   warnings                   anything we had to assume (for example an unknown tier)
   */
  function evaluate(candidate, assumptions) {
    var CM = costMath();
    var a = resolveAssumptions(assumptions);
    var c = cleanCandidate(candidate);
    var rules = a.houseRules;
    var warnings = [];
    var money = CM.money;

    // --- Price per run for the candidate's tier, from CostMath.tiers() ---------
    var tier = CM.tier(c.tier, a.tokens);
    var pricePerRun = 0;
    if (!tier) {
      warnings.push(c.tier === ''
        ? 'No tool tier was chosen, so the price per run was taken as $0.'
        : 'Unknown tool tier "' + c.tier + '", so the price per run was taken as $0.');
    } else if (typeof tier.pricePerRun !== 'number' || !isFinite(tier.pricePerRun)) {
      warnings.push('No price is available for the ' + tier.label + ' tier, so the price per run was taken as $0.');
    } else {
      pricePerRun = tier.pricePerRun;
    }

    // --- The math, in the order of the brief ----------------------------------
    var runsPerYear = c.runsPerWeek * a.rates.workWeeks;
    var hoursFreedPerYear = c.minutesPerRun * runsPerYear / MINUTES_PER_HOUR;

    // Multiply everything before the one division, exactly as the formula is
    // written. (Going through hoursFreedPerYear first can land a hair under a
    // round number, and a $5,000 return must not read as $4,999.99.)
    var laborValue = c.minutesPerRun * c.runsPerWeek * a.rates.workWeeks * a.rates.loadedHourly / MINUTES_PER_HOUR;

    var isService = c.lens === 'service';
    var capacityValue = isService ? hoursFreedPerYear * c.capacityConversion * c.billableMarginPerHour : 0;
    var cashFreed = isService ? 0 : c.daysOffCashCycle * a.company.annualRevenue / DAYS_PER_YEAR;

    // Service lens: the larger of the two, so the same hours are never counted twice.
    var returnPerYear = isService ? Math.max(laborValue, capacityValue) : laborValue;

    var costPerYear = runsPerYear * pricePerRun + c.toolsPerMonth * MONTHS_PER_YEAR;
    var effortOnce = (c.buildHours + c.rolloutHours) * a.rates.builderHourly;
    var effortPerYear = c.upkeepHoursPerMonth * MONTHS_PER_YEAR * a.rates.builderHourly;

    var year1Net = returnPerYear - costPerYear - effortOnce - effortPerYear;
    var yearlyNetBeforeBuild = returnPerYear - costPerYear - effortPerYear;
    var paybackWeeks = yearlyNetBeforeBuild > 0
      ? effortOnce / (yearlyNetBeforeBuild / WEEKS_PER_YEAR)
      : Infinity;
    var year2RunRate = (returnPerYear - costPerYear) * c.growth - effortPerYear;
    var twoYearValue = year1Net + year2RunRate;

    // Cost as a share of return. Nothing coming back and something going out
    // is an infinite share; nothing either way is zero.
    var costShareOfReturn = returnPerYear > 0
      ? costPerYear / returnPerYear
      : (costPerYear > 0 ? Infinity : 0);

    // --- Gate 1: COST ----------------------------------------------------------
    // Compared by multiplying, not dividing, so a zero return needs no special case.
    var costPass = !(costPerYear > rules.costMaxShareOfReturn * returnPerYear);
    var costReason;
    if (costPerYear === 0) {
      costReason = 'It costs about $0 a year to run.';
    } else if (returnPerYear <= 0) {
      costReason = 'Running it costs ' + money(costPerYear) + ' a year and nothing comes back.';
    } else {
      var limitShare = CM.percent(rules.costMaxShareOfReturn);
      var shareText = costShareOfReturn === rules.costMaxShareOfReturn
        ? limitShare
        : unlessSameAs(limitShare, CM.percent(costShareOfReturn), (costShareOfReturn * 100).toFixed(2) + '%');
      costReason = 'Running it costs ' + money(costPerYear) + ' a year, which is ' + shareText +
        ' of the ' + money(returnPerYear) + ' it returns. The limit is ' + limitShare + '.';
    }

    // --- Gate 2: RETURN --------------------------------------------------------
    var underFloor = returnPerYear < rules.minReturnPerYear;
    var returnPass = !(underFloor && !c.touchesCashPath);
    var floorText = money(rules.minReturnPerYear);
    var returnText = returnPerYear === rules.minReturnPerYear
      ? floorText
      : unlessSameAs(floorText, money(returnPerYear), exactMoney(returnPerYear));
    var returnReason;
    if (returnPerYear === rules.minReturnPerYear) {
      returnReason = 'It returns ' + returnText + ' a year, which just meets the ' + floorText + ' floor.';
    } else if (!underFloor) {
      returnReason = 'It returns ' + returnText + ' a year. The floor is ' + floorText + '.';
    } else if (c.touchesCashPath) {
      returnReason = 'It returns ' + returnText + ' a year, under the ' + floorText +
        ' floor, but it touches the cash path, so it stays in.';
    } else {
      returnReason = 'It returns ' + returnText + ' a year, under the ' + floorText +
        ' floor, and it does not touch the cash path.';
    }

    // --- Gate 3: EFFORT --------------------------------------------------------
    var effortPass = paybackWeeks <= rules.maxPaybackWeeks;
    var limitWeeks = String(Number(rules.maxPaybackWeeks.toFixed(1))) + ' weeks';
    var paybackText = (paybackWeeks === Infinity || paybackWeeks === rules.maxPaybackWeeks)
      ? formatWeeks(paybackWeeks)
      : unlessSameAs('about ' + limitWeeks, formatWeeks(paybackWeeks), paybackWeeks.toFixed(1) + ' weeks');
    var effortReason;
    if (paybackWeeks === Infinity) {
      if (yearlyNetBeforeBuild < 0 && effortPerYear > 0) {
        effortReason = 'It never pays back: after running costs and ' + money(effortPerYear) +
          ' a year of upkeep, it loses ' + money(-yearlyNetBeforeBuild) + ' a year.';
      } else if (yearlyNetBeforeBuild < 0) {
        effortReason = 'It never pays back: it costs ' + money(-yearlyNetBeforeBuild) + ' a year more to run than it returns.';
      } else {
        effortReason = 'It never pays back: after running costs and upkeep, nothing is left over to cover the build.';
      }
    } else if (effortOnce === 0) {
      effortReason = 'There is nothing to build or roll out, so there is nothing to pay back.';
    } else if (effortPass) {
      effortReason = 'The ' + money(effortOnce) + ' to build it and roll it out is paid back in ' +
        paybackText + '. The limit is ' + limitWeeks + '.';
    } else {
      effortReason = 'The ' + money(effortOnce) + ' to build it and roll it out takes ' +
        paybackText + ' to pay back. The limit is ' + limitWeeks + '.';
    }

    // --- Gate 4: POTENTIAL -----------------------------------------------------
    var shrinks = c.growth < rules.minGrowth;
    var potentialPass = !shrinks && c.ownerNamed;
    var growthSentence = shrinks
      ? 'Projected growth is ' + growthText(c.growth) + ', below the ' + growthText(rules.minGrowth) + ' minimum'
      : 'Projected growth is ' + growthText(c.growth) + ' over the next year';
    var potentialReason = growthSentence + (c.ownerNamed
      ? (shrinks ? ', even though someone owns the freed time.' : ', and someone owns the freed time.')
      : (shrinks ? ', and nobody owns the freed time.' : ', but nobody owns the freed time, so the minutes will not turn into anything.'));

    // --- Assemble --------------------------------------------------------------
    var gates = {
      cost: {
        pass: costPass,
        metric: costShareOfReturn,
        metricText: costPerYear === 0
          ? 'about $0 a year'
          : money(costPerYear) + ' a year' + (returnPerYear > 0 ? ' (' + CM.percent(costShareOfReturn) + ' of return)' : ''),
        rule: 'NO when yearly cost is more than ' + CM.percent(rules.costMaxShareOfReturn) + ' of yearly return.',
        reason: costReason
      },
      'return': {
        pass: returnPass,
        metric: returnPerYear,
        metricText: money(returnPerYear) + ' a year',
        rule: 'NO when yearly return is under ' + money(rules.minReturnPerYear) + ' and the task does not touch the cash path.',
        reason: returnReason
      },
      effort: {
        pass: effortPass,
        metric: paybackWeeks,
        metricText: paybackWeeks === Infinity ? 'never pays back' : formatWeeks(paybackWeeks) + ' to pay back',
        rule: 'NO when payback is longer than ' + limitWeeks + '.',
        reason: effortReason
      },
      potential: {
        pass: potentialPass,
        metric: c.growth,
        metricText: growthText(c.growth) + ' growth, ' + (c.ownerNamed ? 'owner named' : 'no owner'),
        rule: 'NO when growth is below ' + growthText(rules.minGrowth) + ' or nobody owns the freed time.',
        reason: potentialReason
      }
    };
    GATES.forEach(function (g) {
      gates[g.id].id = g.id;
      gates[g.id].label = g.label;
      gates[g.id].question = g.question;
    });

    var failed = ORDER.filter(function (id) { return !gates[id].pass; });
    var firstNo = failed.length ? failed[0] : null;
    var verdict = firstNo ? 'NO' : 'YES';
    var summary = firstNo
      ? 'NO at ' + gates[firstNo].label + '. ' + gates[firstNo].reason
      : 'YES. It passes all four gates, with a two-year value of ' + money(twoYearValue) + '.';

    var result = {
      id: c.id,
      name: c.name,
      candidate: c,
      assumptions: a,
      tier: tier ? tier.id : null,
      tierLabel: tier ? tier.label : null,
      pricePerRun: pricePerRun,
      runsPerYear: runsPerYear,
      hoursFreedPerYear: hoursFreedPerYear,
      laborValue: laborValue,
      capacityValue: capacityValue,
      cashFreed: cashFreed,
      returnPerYear: returnPerYear,
      costPerYear: costPerYear,
      costShareOfReturn: costShareOfReturn,
      effortOnce: effortOnce,
      effortPerYear: effortPerYear,
      yearlyNetBeforeBuild: yearlyNetBeforeBuild,
      year1Net: year1Net,
      paybackWeeks: paybackWeeks,
      year2RunRate: year2RunRate,
      twoYearValue: twoYearValue,
      gates: gates,
      verdict: verdict,
      firstNo: firstNo,
      failed: failed,
      summary: summary,
      warnings: warnings
    };

    // Last line of defence: with cleaned, capped inputs no value here can be
    // NaN. If one ever is, show 0 and say so rather than put "NaN" on a slide.
    for (var key in result) {
      if (typeof result[key] === 'number' && result[key] !== result[key]) {
        result[key] = 0;
        warnings.push('Could not compute ' + key + '; shown as 0.');
      }
    }
    return result;
  }


  /* ---------------------------------------------------------------------------
   * rank: "let the math pick"
   * ------------------------------------------------------------------------ */

  /*
   * Evaluate a list of candidates and order them: survivors (verdict YES)
   * first, highest twoYearValue on top; then the ones that got a NO, also by
   * twoYearValue. Ties keep the order they were given in.
   *
   * Each result gains `place` (1 = top of the list) and `winner` (true for the
   * best survivor only; if nothing survives, nobody wins).
   */
  function rank(candidates, assumptions) {
    var list = Array.isArray(candidates) ? candidates : [];
    var results = list.map(function (c, index) {
      var r = evaluate(c, assumptions);
      r.inputOrder = index;
      return r;
    });
    results.sort(function (x, y) {
      var xs = x.verdict === 'YES' ? 0 : 1;
      var ys = y.verdict === 'YES' ? 0 : 1;
      return (xs - ys) || (y.twoYearValue - x.twoYearValue) || (x.inputOrder - y.inputOrder);
    });
    results.forEach(function (r, i) {
      r.place = i + 1;
      r.winner = (i === 0 && r.verdict === 'YES');
    });
    return results;
  }


  /* ---------------------------------------------------------------------------
   * Rules of thumb
   * ------------------------------------------------------------------------ */

  /*
   * What one minute saved per week is worth in a year:
   *     1 minute x workWeeks x loadedHourly / 60
   * $25 at the defaults (50 weeks, $30 an hour). $50 at $60 an hour.
   */
  function minuteRule(loadedHourly, workWeeks) {
    var rates = defaultAssumptions().rates;
    var hourly = num(loadedHourly, rates.loadedHourly);
    var weeks = num(workWeeks, rates.workWeeks);
    return 1 * weeks * hourly / MINUTES_PER_HOUR;
  }

  /*
   * One day off the cash cycle frees about one day of sales:
   *     annualRevenue / 365
   * The standard working-capital approximation. Label it "about" on screen.
   */
  function cashPerDay(annualRevenue) {
    var revenue = num(annualRevenue, defaultAssumptions().company.annualRevenue);
    return revenue / DAYS_PER_YEAR;
  }


  /* ---------------------------------------------------------------------------
   * Export
   * ------------------------------------------------------------------------ */
  var Gates = {
    GATES: GATES,
    ORDER: ORDER,
    evaluate: evaluate,
    rank: rank,
    minuteRule: minuteRule,
    cashPerDay: cashPerDay,
    defaultAssumptions: defaultAssumptions,
    formatWeeks: formatWeeks
  };

  if (root) root.Gates = Gates;
  if (inNode) module.exports = Gates;
})();
