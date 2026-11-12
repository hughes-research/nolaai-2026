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
 *   RETURN    says NO when yearly return is under $5,000 and the task takes no days off the cash cycle.
 *             Touching the cash path is not enough on its own: cash has to arrive sooner
 *             (daysOffCashCycle above zero, product lens; a service candidate has no cash days).
 *             touchesCashPath is still read and passed through, but it exempts nothing.
 *   EFFORT    says NO when payback is longer than 26 weeks.
 *   POTENTIAL says NO when growth is below 1x or nobody owns the freed time.
 * Any NO and the candidate is out. Among the survivors, highest twoYearValue wins.
 *
 * Three promises this file keeps
 *
 *   1. A value exactly on a limit passes. Computers cannot store most decimals
 *      exactly, so a payback that is 26 weeks on paper can come out as
 *      26.000000000000004. Every figure is therefore cleaned of that dust
 *      (rounded to 12 significant digits) and two figures within one part in a
 *      billion of each other count as equal. See tidy(), same() and compare().
 *
 *   2. A gate never passes on a number nobody entered. A blank field counts as
 *      "none" (0; growth counts as 1x). But a field that holds something
 *      unusable ("240/mo", a negative, a share of 50 where 0.5 was meant,
 *      growth as "150%", which could mean 1.5 times or 2.5 times) is not
 *      quietly replaced: the result says so in `warnings`, and every gate
 *      that needs that number says NO until it is fixed. The same goes for the
 *      rates and house rules.
 *
 *   3. The sentence on screen never contradicts the verdict. When a figure is
 *      so close to its limit that rounding would make the two look alike, the
 *      wording gets finer ("26.4 weeks") or says "just over" / "just under".
 *      The limit itself is always printed exactly as it was set.
 *
 * It also never returns NaN: every division is guarded, and the two values
 * that can honestly be infinite (paybackWeeks, and the cost share when nothing
 * comes back) say so.
 *
 * Loads as a classic <script> (attaches to window) and under Node
 * (module.exports). Touches no DOM. Needs CostMath (for the price per run of a
 * tier and for formatting) and reads window.YOUR for the speaker's rates and
 * rules; both are looked up when a function is called, so script order does
 * not matter.
 *
 * API
 *   evaluate(candidate, assumptions)  -> the full result for one candidate (see below)
 *   rank(candidates, assumptions)     -> results, survivors first by twoYearValue, then the rest;
 *                                        each also has place (1 = top) and winner (true / false)
 *   minuteRule(loadedHourly, workWeeks) -> dollars a year for one minute saved a week (25 at defaults)
 *   cashPerDay(annualRevenue)         -> dollars freed by one day off the cash cycle
 *   defaultAssumptions()              -> { rates, company, tokens, houseRules }: window.YOUR over built-in defaults
 *   companyLabel(company)             -> the example company's on-screen name, in step with its revenue
 *   formatWeeks(weeks)                -> "about 15 weeks" / "never"
 *   GATES, ORDER                      -> the four gates, in screening order
 */
(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window : null;
  var inNode = (typeof module === 'object' && module !== null && typeof module.exports === 'object');

  var MINUTES_PER_HOUR = 60;
  var MONTHS_PER_YEAR = 12;
  var WEEKS_PER_YEAR = 52;       // payback is counted in calendar weeks
  var DAYS_PER_YEAR = 365;
  var MAX_INPUT = 1e12;          // the largest figure any field accepts (a trillion)
  var MIN_INPUT = 1e-9;          // the smallest above zero (a billionth); anything smaller is a slip
  var TOO_BIG = 1e15;            // results past a quadrillion get a "check your inputs" warning
  var SIGNIFICANT_DIGITS = 12;   // see tidy()
  var HAIR = 1e-9;               // one part in a billion: closer than this is "the same"

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

  /*
   * Every number a candidate carries.
   *   kind   how it may be typed. 'count': a plain number. 'dollars': "$240" is
   *          fine too. 'share': 0 to 1, and "50%" is fine too. 'times': a
   *          multiplier, and "1.5x" is fine too (but not a percentage: "150%"
   *          could mean 1.5 times or 2.5 times, so it is sent back).
   *   blank  what the field counts as when it is left empty
   *   gates  the gates that cannot be judged while this field is unusable
   *   lens   the one lens the field belongs to, if it only matters for one
   */
  var CANDIDATE_FIELDS = [
    { key: 'minutesPerRun',         label: 'Minutes per run',          kind: 'count',   blank: 0, gates: ['cost', 'return', 'effort'] },
    { key: 'runsPerWeek',           label: 'Runs per week',            kind: 'count',   blank: 0, gates: ['cost', 'return', 'effort'] },
    { key: 'toolsPerMonth',         label: 'Tools per month',          kind: 'dollars', blank: 0, gates: ['cost', 'effort'] },
    { key: 'buildHours',            label: 'Build hours',              kind: 'count',   blank: 0, gates: ['effort'] },
    { key: 'rolloutHours',          label: 'Rollout hours',            kind: 'count',   blank: 0, gates: ['effort'] },
    { key: 'upkeepHoursPerMonth',   label: 'Upkeep hours per month',   kind: 'count',   blank: 0, gates: ['effort'] },
    { key: 'growth',                label: 'Growth',                   kind: 'times',   blank: 1, gates: ['potential'] },
    { key: 'daysOffCashCycle',      label: 'Days off the cash cycle',  kind: 'count',   blank: 0, gates: [], lens: 'product' },
    { key: 'capacityConversion',    label: 'Capacity conversion',      kind: 'share',   blank: 0, gates: ['cost', 'return', 'effort'], lens: 'service' },
    { key: 'billableMarginPerHour', label: 'Billable margin per hour', kind: 'dollars', blank: 0, gates: ['cost', 'return', 'effort'], lens: 'service' }
  ];

  /* The same for the shared assumptions. `aliases` are other spellings CostMath.tokens() accepts. */
  var GROUPS = ['rates', 'company', 'tokens', 'houseRules'];
  var ASSUMPTION_FIELDS = {
    rates: [
      { key: 'loadedHourly',  label: 'The loaded hourly rate',  kind: 'dollars', gates: ['cost', 'return', 'effort'] },
      { key: 'builderHourly', label: 'The builder hourly rate', kind: 'dollars', gates: ['effort'] },
      { key: 'workWeeks',     label: 'Work weeks per year',     kind: 'count',   gates: ['cost', 'return', 'effort'],
        max: WEEKS_PER_YEAR, tooHigh: 'is more than the 52 weeks in a year' }
    ],
    company: [
      { key: 'annualRevenue', label: 'Annual revenue', kind: 'dollars', gates: [] }
    ],
    tokens: [
      { key: 'in',  label: 'Tokens in',  kind: 'count', gates: ['cost', 'effort'], aliases: ['tokensIn', 'input'] },
      { key: 'out', label: 'Tokens out', kind: 'count', gates: ['cost', 'effort'], aliases: ['tokensOut', 'output'] }
    ],
    houseRules: [
      { key: 'costMaxShareOfReturn', label: 'The cost limit',     kind: 'share',   gates: ['cost'] },
      { key: 'minReturnPerYear',     label: 'The return floor',   kind: 'dollars', gates: ['return'] },
      { key: 'maxPaybackWeeks',      label: 'The payback limit',  kind: 'count',   gates: ['effort'] },
      { key: 'minGrowth',            label: 'The growth minimum', kind: 'times',   gates: ['potential'] }
    ]
  };
  var GROUP_LABELS = {
    rates: 'The rates', company: 'The example company', tokens: 'The task size', houseRules: 'The house rules'
  };

  /* Quick lookup of an assumption's rules by its name: SPEC.loadedHourly, SPEC.annualRevenue ... */
  var SPEC = {};
  GROUPS.forEach(function (group) {
    ASSUMPTION_FIELDS[group].forEach(function (spec) { SPEC[spec.key] = spec; });
  });


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
   * Clean arithmetic
   * ------------------------------------------------------------------------ */

  /*
   * Floating-point dust. A computer stores 0.1 as 0.1000000000000000055..., so
   * a payback that is exactly 26 weeks on paper can come out as
   * 26.000000000000004. Rounding to 12 significant digits removes the dust and
   * changes nothing a person could see. (CostMath.tidy is the same function.)
   */
  function tidy(x) {
    if (typeof x !== 'number' || !isFinite(x) || x === 0) return x;
    return Number(x.toPrecision(SIGNIFICANT_DIGITS));
  }

  /* Equal, give or take one part in a billion. */
  function same(a, b) {
    if (a === b) return true;
    if (!isFinite(a) || !isFinite(b)) return false;
    return Math.abs(a - b) <= HAIR * Math.max(Math.abs(a), Math.abs(b));
  }

  /*
   * Where a figure stands against its limit: 'same', 'over' or 'under'.
   * Each gate asks this exactly once and uses the one answer for both the
   * verdict and the wording, so the two can never disagree.
   */
  function compare(value, limit) {
    if (same(value, limit)) return 'same';
    return value > limit ? 'over' : 'under';
  }

  /*
   * Add up signed amounts: total(9000, -1.35, -1350). A result that is only
   * dust next to the amounts that went in is exactly zero, so "what is left
   * over" can be tested against zero safely.
   */
  function total() {
    var sum = 0;
    var biggest = 0;
    for (var i = 0; i < arguments.length; i++) {
      sum += arguments[i];
      biggest = Math.max(biggest, Math.abs(arguments[i]));
    }
    if (Math.abs(sum) <= HAIR * biggest) return 0;
    return tidy(sum);
  }

  function copy(obj) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    return out;
  }


  /* ---------------------------------------------------------------------------
   * Reading what was entered
   * ------------------------------------------------------------------------ */

  var PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;   // 45  0.5  .5  -3  1e3
  var WITH_COMMAS = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;          // 3,000  1,250,000.50

  /*
   * Text a person typed, as a number. Forgiving about the usual ways of
   * writing one ("3,000", "$240", "50%" for a share, "1.5x" for a multiple),
   * but only where the meaning is not in doubt: "240/mo" and "two" are not
   * numbers. (A percentage for growth is in doubt; see readNumber.)
   * Returns undefined for blank text and NaN for text that cannot be read.
   */
  function parseTyped(text, kind) {
    var s = text.replace(/\u00a0/g, ' ').trim();
    if (s === '') return undefined;
    var divideBy = 1;
    if (kind === 'dollars') {
      s = s.replace(/^([+-]?)\$\s*/, '$1');                     // "$240" -> "240"
    } else if (kind === 'share' && /%$/.test(s)) {              // "50%" -> 0.5
      s = s.slice(0, -1).trim();
      divideBy = 100;
    } else if (kind === 'times' && /[x\u00d7]$/i.test(s)) {     // "1.5x" -> 1.5
      s = s.slice(0, -1).trim();
    }
    if (WITH_COMMAS.test(s)) s = s.replace(/,/g, '');
    if (!PLAIN_NUMBER.test(s)) return NaN;
    return Number(s) / divideBy;
  }

  /*
   * One number, read from whatever was handed in. Exactly one of:
   *   { blank: true }             nothing was entered
   *   { value: n }                a usable number: 0, or between a billionth and a trillion
   *   { problem: true, why }      something was entered and it cannot be used;
   *                               `why` finishes the sentence "... which <why>."
   */
  function readNumber(raw, spec) {
    var n;
    if (raw === undefined || raw === null) return { blank: true };
    if (typeof raw === 'number') {
      n = raw;
    } else if (typeof raw === 'string') {
      // Growth as a percentage can be read two ways: "50%" is half the size to
      // one reader and half again as big to another, and "150%" is 1.5 times
      // or 2.5 times. Guessing would put a confident verdict on a number
      // nobody entered, so it is sent back with the way to write it.
      if (spec.kind === 'times' && /%\s*$/.test(raw)) {
        return { problem: true, why: 'is a percentage, and that can be read two ways (write a multiple instead: 1.5 for half again as big)' };
      }
      n = parseTyped(raw, spec.kind);
      if (n === undefined) return { blank: true };
      if (n !== n) return { problem: true, why: 'is not a plain number' };
    } else {
      return { problem: true, why: 'is not a number' };         // true / false, a list, ...
    }
    if (!isFinite(n)) return { problem: true, why: 'is not a number' };
    if (n < 0) return { problem: true, why: 'is below zero' };
    if (spec.kind === 'share' && n > 1) {
      return { problem: true, why: 'is not a share between 0 and 1 (write 0.5 for 50%)' };
    }
    if (n > (spec.max !== undefined ? spec.max : MAX_INPUT)) {
      return { problem: true, why: spec.tooHigh || 'is too large to be a real figure' };
    }
    if (n > 0 && n < MIN_INPUT) {
      return { problem: true, why: 'is too small to be a real figure' };
    }
    return { value: n === 0 ? 0 : n };                          // (turns -0 into 0)
  }

  var YES_WORDS = ['true', 'yes', 'y', 'on', '1'];
  var NO_WORDS = ['', 'false', 'no', 'n', 'off', '0'];

  /* A yes / no, forgiving of 'true', 'false', 'yes', 'no', 1 and 0 from forms. Blank is no. */
  function readYesNo(raw) {
    if (raw === undefined || raw === null || raw === false || raw === 0) return { value: false };
    if (raw === true || raw === 1) return { value: true };
    if (typeof raw === 'string') {
      var s = raw.trim().toLowerCase();
      if (YES_WORDS.indexOf(s) !== -1) return { value: true };
      if (NO_WORDS.indexOf(s) !== -1) return { value: false };
    }
    return { value: false, problem: true, why: 'is not a yes or a no (write true or false)' };
  }

  /*
   * Write down one unusable input. `problems` is a plain list; a later entry
   * for the same field replaces an earlier one.
   *   field   'toolsPerMonth', 'rates.loadedHourly', ...
   *   raw     what was entered
   *   why     finishes "... was entered as X, which <why>."
   *   then    what was done about it: { left: 0 }, { used: 30 }, or { say: 'a sentence.' }
   *   gates   the gates that cannot be judged until it is fixed
   */
  function note(problems, field, spec, raw, why, then) {
    forget(problems, field);
    problems.push({ field: field, label: spec.label, kind: spec.kind, raw: raw, why: why, then: then, gates: spec.gates || [] });
  }

  function forget(problems, field) {
    for (var i = problems.length - 1; i >= 0; i--) {
      if (problems[i].field === field) problems.splice(i, 1);
    }
  }

  /*
   * A word a candidate carries (its lens, its tier), as trimmed text.
   * Returns '' when nothing was entered and null when what was entered is not
   * a word at all (a number, true, a list). null is never turned into text:
   * String(NaN) is "NaN", and that must not reach a sentence on a slide.
   */
  function readWord(raw) {
    if (raw === undefined || raw === null) return '';
    return typeof raw === 'string' ? raw.trim() : null;
  }

  /* The tier a candidate names: an id ('small') or a tier object from CostMath.tiers(). */
  function tierWord(raw) {
    return readWord((raw && typeof raw === 'object' && typeof raw.id === 'string') ? raw.id : raw);
  }

  /* The first of these names that the object actually has. */
  function firstDefined(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (obj[keys[i]] !== undefined) return obj[keys[i]];
    }
    return undefined;
  }

  /*
   * Lay `over` on top of `base`: group by group ({ rates, company, tokens,
   * houseRules }) and value by value. A blank value leaves the base alone. A
   * value that is present but unusable also leaves the base alone, and is
   * written down in `problems`. A usable value clears any earlier problem
   * with the same field (a good override beats a bad default).
   *
   * With `flat`, the individual numbers may also be given without their group:
   * { loadedHourly: 60, annualRevenue: 5000000 }.
   *
   * The task size may be spelled { in, out }, { tokensIn, tokensOut } or
   * { input, output }, exactly as CostMath.tokens() accepts it.
   */
  function layOver(base, over, problems, flat) {
    var out = {};
    GROUPS.forEach(function (group) { out[group] = copy(base[group]); });
    if (over === undefined || over === null || typeof over !== 'object') return out;

    GROUPS.forEach(function (group) {
      var given = over[group];
      var usable = given !== undefined && given !== null && typeof given === 'object';
      if (given !== undefined && given !== null && !usable) {
        var everyGate = [];
        ASSUMPTION_FIELDS[group].forEach(function (spec) {
          spec.gates.forEach(function (g) { if (everyGate.indexOf(g) === -1) everyGate.push(g); });
        });
        note(problems, group, { label: GROUP_LABELS[group], kind: 'group', gates: everyGate }, given,
          'is not a set of values', { say: 'The usual values were used instead.' });
      }
      ASSUMPTION_FIELDS[group].forEach(function (spec) {
        var raw = usable ? firstDefined(given, [spec.key].concat(spec.aliases || [])) : undefined;
        if (raw === undefined && flat && group !== 'tokens') raw = over[spec.key];
        var field = group + '.' + spec.key;
        var read = readNumber(raw, spec);
        if (read.problem) {
          note(problems, field, spec, raw, read.why, { used: base[group][spec.key] });
        } else if (!read.blank) {
          out[group][spec.key] = read.value;
          forget(problems, field);
        }
      });
    });

    if (over.company && typeof over.company.label === 'string') out.company.label = over.company.label;
    return out;
  }

  /* Last step for any set of assumptions: make the company label agree with its revenue. */
  function finish(assumptions) {
    assumptions.company.label = companyLabel(assumptions.company);
    return assumptions;
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
    return finish(layOver(BUILT_IN, your(), [], false));
  }

  /*
   * What evaluate() actually uses: the defaults with the caller's overrides on
   * top. Overrides may be partial ({ rates: { loadedHourly: 60 } }) or flat
   * ({ loadedHourly: 60 }). Anything unusable, in the speaker's file or in the
   * overrides, lands in `problems`.
   */
  function resolveAssumptions(a, problems) {
    var base = layOver(BUILT_IN, your(), problems, false);
    return finish(layOver(base, a, problems, true));
  }

  /*
   * A candidate with every field present and usable. Blank numbers count as 0
   * (growth as 1). Unusable entries count the same way and are written down
   * in `problems`. Any extra fields the caller put on the candidate (a note, a
   * colour) are carried through untouched. The original object is never changed.
   */
  function cleanCandidate(c, problems) {
    c = (c && typeof c === 'object') ? c : {};
    var text = function (v) { return (v !== undefined && v !== null) ? String(v) : ''; };
    var out = copy(c);
    out.id = text(c.id);
    out.name = text(c.name);
    out.pitch = text(c.pitch);

    // Lens: 'service', or 'product' (also when left blank).
    var lens = readWord(c.lens);
    lens = (lens === null) ? null : lens.toLowerCase();
    out.lens = lens === 'service' ? 'service' : 'product';
    if (lens !== '' && lens !== 'service' && lens !== 'product') {
      note(problems, 'lens', { label: 'The lens', kind: 'word', gates: ['cost', 'return', 'effort'] }, c.lens,
        'is not "product" or "service"', { say: 'It was taken as product.' });
    }

    // Tier: the id as text, or '' when it is blank or not a word at all.
    // evaluate() looks the id up and reports a tier it cannot use.
    out.tier = tierWord(c.tier) || '';

    CANDIDATE_FIELDS.forEach(function (spec) {
      var read = readNumber(c[spec.key], spec);
      var matters = !spec.lens || spec.lens === out.lens;       // a service-only field on a product candidate is ignored
      if (read.problem && matters) note(problems, spec.key, spec, c[spec.key], read.why, { left: spec.blank });
      out[spec.key] = (read.value !== undefined) ? read.value : spec.blank;
    });

    var cash = readYesNo(c.touchesCashPath);
    out.touchesCashPath = cash.value;
    if (cash.problem) {
      note(problems, 'touchesCashPath', { label: 'Touches the cash path', kind: 'yesno', gates: ['return'] },
        c.touchesCashPath, cash.why, { say: 'It was taken as no.' });
    }
    var owner = readYesNo(c.ownerNamed);
    out.ownerNamed = owner.value;
    if (owner.problem) {
      note(problems, 'ownerNamed', { label: 'Owner named', kind: 'yesno', gates: ['potential'] },
        c.ownerNamed, owner.why, { say: 'It was taken as no.' });
    }
    return out;
  }


  /* ---------------------------------------------------------------------------
   * Wording helpers
   * ------------------------------------------------------------------------ */

  /*
   * A payback on its own: "about 15 weeks", "under a week", "never".
   * Do NOT put this next to the payback limit: 26.3 weeks reads "about 26
   * weeks", which looks like a pass against a 26-week limit. Beside the limit,
   * show result.gates.effort.metricText, which is worded against it.
   */
  function formatWeeks(weeks) {
    if (weeks === Infinity) return 'never';
    if (typeof weeks !== 'number' || weeks !== weeks) return 'n/a';
    if (weeks === 0) return '0 weeks';
    if (weeks < 1) return 'under a week';
    var w = Math.round(tidy(weeks));
    return 'about ' + w + (w === 1 ? ' week' : ' weeks');
  }

  function weeksWord(n) {
    return n === 1 ? ' week' : ' weeks';
  }

  /* The number a money text shows: "$3,600" -> 3600, "about $0" -> 0. */
  function shownAmount(moneyText) {
    return Number(moneyText.replace(/[^0-9.]/g, ''));
  }

  /* A house-rule amount printed exactly as it was set: "$5,000", "$4,999.50". */
  function exactMoney(CM, x) {
    if (x === 0) return '$0';
    if (CM.roundTo(x, 0) === x) return '$' + CM.number(x);
    if (CM.roundTo(x, 2) === x) return CM.cents(x);
    return '$' + CM.number(x);
  }

  /*
   * Close calls. Rounded for the screen, 30.4% against a 30% limit reads
   * "30% ... the limit is 30%", which makes a NO look like a mistake.
   *
   * `stands` is the gate's own finding: 'same', 'over' or 'under' (see
   * compare()). `steps` are ways of showing the value, coarsest first, each
   * { shown, text } where `shown` is the number the text displays. The first
   * one whose number sits on the true side of the (exactly printed) limit is
   * used. If even the finest still looks like the limit, the answer is "just
   * over" or "just under" the limit. A value that IS the limit is shown as
   * the limit.
   */
  function versus(stands, limit, limitText, steps) {
    if (stands === 'same') return limitText;
    var above = stands === 'over';
    for (var i = 0; i < steps.length; i++) {
      if (above ? steps[i].shown > limit : steps[i].shown < limit) return steps[i].text;
    }
    return (above ? 'just over ' : 'just under ') + limitText;
  }

  /* Cost as a share of return, worded against the cost limit. Both are shares (0.3 = 30%). */
  function shareVersus(CM, stands, share, limitShare, limitText) {
    var v = tidy(share * 100);
    var limit = tidy(limitShare * 100);
    if (stands === 'under' && v < 1 && limit >= 1) return 'under 1%';
    var shown = v >= 9.95 ? [CM.roundTo(v, 0), CM.roundTo(v, 1)]
      : v >= 1 ? [CM.roundTo(v, 1), CM.roundTo(v, 2)]
      : [CM.sig(v, 1), CM.sig(v, 2)];
    return versus(stands, limit, limitText, shown.map(function (n) { return { shown: n, text: CM.number(n) + '%' }; }));
  }

  /* Yearly return, worded against the return floor. */
  function returnVersus(CM, stands, value, floor, floorText) {
    var steps = [{ shown: value >= TOO_BIG ? value : shownAmount(CM.money(value)), text: CM.money(value) }];
    if (value >= 0.005 && value < TOO_BIG) steps.push({ shown: CM.roundTo(value, 2), text: CM.cents(value) });
    return versus(stands, floor, floorText, steps);
  }

  /* Payback (a real number of weeks, above zero), worded against the payback limit. */
  function weeksVersus(CM, stands, weeks, limit, limitText) {
    if (stands === 'same') return limitText;
    if (stands === 'under' && weeks < 1 && limit >= 1) return 'under a week';
    if (weeks >= TOO_BIG) return CM.number(weeks) + ' weeks';
    var exact = function (n) { return { shown: n, text: CM.number(n) + weeksWord(n) }; };
    var about = function (n) { return { shown: n, text: 'about ' + CM.number(n) + weeksWord(n) }; };
    var steps = weeks >= 1
      ? [about(CM.roundTo(weeks, 0)), exact(CM.roundTo(weeks, 1))]
      : [exact(CM.sig(weeks, 1)), exact(CM.sig(weeks, 2))];
    return versus(stands, limit, limitText, steps);
  }

  /* Growth, worded against the growth minimum. */
  function growthVersus(CM, stands, growth, minimum, minimumText) {
    var shown = growth >= 0.995 ? [CM.roundTo(growth, 2), CM.roundTo(growth, 3)] : [CM.sig(growth, 2), CM.sig(growth, 3)];
    return versus(stands, minimum, minimumText, shown.map(function (n) { return { shown: n, text: CM.number(n) + TIMES }; }));
  }

  /* An assumption or a stand-in value, written the way its kind is written. */
  function inItsUnit(CM, kind, value) {
    if (kind === 'dollars') return value === 0 ? '$0' : CM.money(value);
    if (kind === 'share') return CM.number(tidy(value * 100)) + '%';
    if (kind === 'times') return CM.number(value) + TIMES;
    return CM.number(value);
  }

  /* What was entered, for quoting back. null when it cannot sensibly be shown. */
  function quoteEntered(CM, raw) {
    if (typeof raw === 'string') {
      var s = raw.replace(/\s+/g, ' ').trim();
      return '"' + (s.length > 24 ? s.slice(0, 24) + '...' : s) + '"';
    }
    if (typeof raw === 'number' && isFinite(raw)) {
      return (raw > 0 && raw < MIN_INPUT) ? 'less than a billionth' : CM.number(raw);
    }
    return null;
  }

  /* One unusable input as a plain sentence or two. */
  function problemSentence(CM, p) {
    var entered = quoteEntered(CM, p.raw);
    var first;
    if (entered !== null) {
      first = p.label + ' was entered as ' + entered + ', which ' + p.why + '.';
    } else if (p.kind === 'word') {
      first = p.label + ' ' + p.why + '.';                      // "The lens is not "product" or "service"."
    } else {
      first = p.label + ' is not a usable ' + (p.kind === 'yesno' ? 'yes or no' : p.kind === 'group' ? 'set of values' : 'number') + '.';
    }
    var then = p.then || {};
    var second = then.say ? then.say
      : then.used !== undefined ? inItsUnit(CM, p.kind, then.used) + ' was used instead.'
      : 'It was left at ' + inItsUnit(CM, p.kind, then.left) + '.';
    return first + ' ' + second;
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
   *          { id, label, question, pass, metric, limit, metricText, rule, reason, blocked }
   *          `blocked` is true when the gate could not be judged because an
   *          input it needs was unusable; such a gate never passes.
   *   verdict                    'YES' or 'NO'
   *   firstNo                    the first failing gate id in screening order, or null
   *   failed                     every failing gate id, in order
   *   summary                    one sentence for the whole result
   *   warnings                   plain sentences: everything that had to be assumed.
   *                              SHOW THESE next to the verdict.
   *   inputProblems              the unusable inputs behind those warnings, as
   *                              { field, label, entered, message, gates }, so a
   *                              form can mark the field
   */
  function evaluate(candidate, assumptions) {
    var CM = costMath();
    var problems = [];
    var a = resolveAssumptions(assumptions, problems);
    var c = cleanCandidate(candidate, problems);
    var rules = a.houseRules;
    var warnings = [];
    var money = CM.money;

    // --- Price per run for the candidate's tier, from CostMath.tiers() ---------
    var tierEntered = (candidate && typeof candidate === 'object') ? candidate.tier : undefined;
    var tierIsAWord = tierWord(tierEntered) !== null;       // false for a number, true / false, a list ...
    var tier = c.tier === '' ? null : CM.tier(c.tier, a.tokens);
    var pricePerRun = 0;
    if (!tierIsAWord || (c.tier !== '' && !tier)) {
      note(problems, 'tier', { label: 'The tool tier', kind: 'word', gates: ['cost', 'effort'] }, tierIsAWord ? c.tier : tierEntered,
        'is not one of the tiers (' + CM.tierIds().join(', ') + ')', { say: 'The price per run was taken as $0.' });
    } else if (c.tier === '') {
      warnings.push('No tool tier was chosen, so the price per run was taken as $0.');
    } else if (typeof tier.pricePerRun !== 'number' || !isFinite(tier.pricePerRun)) {
      note(problems, 'tier', { label: 'The ' + tier.label + ' tier', kind: 'word', gates: ['cost', 'effort'] }, c.tier,
        'has no price in the benchmark file', { say: 'The price per run was taken as $0.' });
    } else {
      pricePerRun = tier.pricePerRun;
    }

    // --- The math, in the order of the brief ----------------------------------
    // Everything is multiplied before the one division, exactly as the formulas
    // are written, and every line is tidied, so round inputs give round answers.
    var isService = c.lens === 'service';
    var runsPerYear = tidy(c.runsPerWeek * a.rates.workWeeks);
    var minutesPerYear = c.minutesPerRun * c.runsPerWeek * a.rates.workWeeks;
    var hoursFreedPerYear = tidy(minutesPerYear / MINUTES_PER_HOUR);

    var laborValue = tidy(minutesPerYear * a.rates.loadedHourly / MINUTES_PER_HOUR);
    var capacityValue = isService
      ? tidy(minutesPerYear * c.capacityConversion * c.billableMarginPerHour / MINUTES_PER_HOUR)
      : 0;
    var cashFreed = isService ? 0 : tidy(c.daysOffCashCycle * a.company.annualRevenue / DAYS_PER_YEAR);

    // Service lens: the larger of the two, so the same hours are never counted twice.
    var returnPerYear = isService ? Math.max(laborValue, capacityValue) : laborValue;

    var costPerYear = tidy(runsPerYear * pricePerRun + c.toolsPerMonth * MONTHS_PER_YEAR);
    var effortOnce = tidy((c.buildHours + c.rolloutHours) * a.rates.builderHourly);
    var effortPerYear = tidy(c.upkeepHoursPerMonth * MONTHS_PER_YEAR * a.rates.builderHourly);

    var year1Net = total(returnPerYear, -costPerYear, -effortOnce, -effortPerYear);
    var yearlyNetBeforeBuild = total(returnPerYear, -costPerYear, -effortPerYear);

    // paybackWeeks = EFFORTone / (left over each year / 52), written as
    // EFFORTone x 52 / left over: the same thing, with one division.
    var paybackWeeks;
    if (yearlyNetBeforeBuild <= 0) paybackWeeks = Infinity;            // nothing is left over: never
    else if (effortOnce === 0) paybackWeeks = 0;                       // nothing to pay back
    else paybackWeeks = tidy(effortOnce * WEEKS_PER_YEAR / yearlyNetBeforeBuild);

    var year2RunRate = total(tidy(total(returnPerYear, -costPerYear) * c.growth), -effortPerYear);
    var twoYearValue = total(year1Net, year2RunRate);

    // Cost as a share of return. Nothing coming back and something going out
    // is an infinite share; nothing either way is zero.
    var costShareOfReturn = returnPerYear > 0
      ? tidy(costPerYear / returnPerYear)
      : (costPerYear > 0 ? Infinity : 0);

    // --- Unusable inputs: say so, and find the gates they block ----------------
    var blockedBy = { cost: [], 'return': [], effort: [], potential: [] };
    var inputProblems = problems.map(function (p) {
      var message = problemSentence(CM, p);
      warnings.push(message);
      p.gates.forEach(function (g) { blockedBy[g].push(message); });
      return { field: p.field, label: p.label, entered: quoteEntered(CM, p.raw), message: message, gates: p.gates.slice() };
    });
    function blockedReason(gate) {
      var list = blockedBy[gate.id];
      var more = list.length - 1;
      return list[0] + ' ' + gate.label + ' cannot be judged until that is fixed.' +
        (more > 0 ? ' (' + more + ' more input ' + (more === 1 ? 'problem is' : 'problems are') + ' listed in the warnings.)' : '');
    }

    // --- Gate 1: COST ----------------------------------------------------------
    // NO when yearly cost is MORE than the limit share of yearly return.
    var costLimitText = inItsUnit(CM, 'share', rules.costMaxShareOfReturn);
    var costStands = compare(costShareOfReturn, rules.costMaxShareOfReturn);
    var costPass = costStands !== 'over';
    var costReason;
    var costMetricText;
    if (costPerYear === 0) {
      costReason = 'It costs about $0 a year to run.';
      costMetricText = 'about $0 a year';
    } else if (returnPerYear <= 0 || !isFinite(costShareOfReturn)) {
      costReason = 'Running it costs ' + money(costPerYear) + ' a year and nothing comes back.';
      costMetricText = money(costPerYear) + ' a year';
    } else {
      var shareText = shareVersus(CM, costStands, costShareOfReturn, rules.costMaxShareOfReturn, costLimitText);
      costReason = 'Running it costs ' + money(costPerYear) + ' a year, which is ' + shareText +
        ' of the ' + money(returnPerYear) + ' it returns. The limit is ' + costLimitText + '.';
      costMetricText = money(costPerYear) + ' a year (' + shareText + ' of return)';
    }

    // --- Gate 2: RETURN --------------------------------------------------------
    // NO when yearly return is UNDER the floor and the task takes no days off
    // the cash cycle. Being on the cash path is not enough: cash has to arrive
    // sooner. Only a product candidate has cash days (cashFreed is 0 for service).
    var floorText = exactMoney(CM, rules.minReturnPerYear);
    var returnStands = compare(returnPerYear, rules.minReturnPerYear);
    var underFloor = returnStands === 'under';
    var cashDays = isService ? 0 : c.daysOffCashCycle;
    var cashSooner = cashDays > 0;
    var returnPass = !(underFloor && !cashSooner);
    var returnText = returnVersus(CM, returnStands, returnPerYear, rules.minReturnPerYear, floorText);
    var cashDaysText = CM.number(cashDays) + (cashDays === 1 ? ' day' : ' days');
    var returnReason;
    var returnMetricText = returnText + ' a year';
    if (returnStands === 'same') {
      returnReason = 'It returns ' + returnText + ' a year, which just meets the ' + floorText + ' floor.';
    } else if (!underFloor) {
      returnReason = 'It returns ' + returnText + ' a year. The floor is ' + floorText + '.';
    } else if (cashSooner) {
      returnReason = 'It returns ' + returnText + ' a year, under the ' + floorText +
        ' floor, but it gets cash in ' + cashDaysText + ' sooner, so it stays in.';
      returnMetricText = returnText + ' a year, cash ' + cashDaysText + ' sooner';
    } else if (c.touchesCashPath && !isService) {
      returnReason = 'It returns ' + returnText + ' a year, under the ' + floorText +
        ' floor. It is on the cash path, but it does not get cash in any sooner.';
    } else {
      returnReason = 'It returns ' + returnText + ' a year, under the ' + floorText +
        ' floor, and it does not get cash in any sooner.';
    }

    // --- Gate 3: EFFORT --------------------------------------------------------
    // NO when payback is LONGER than the limit.
    var weeksLimitText = CM.number(rules.maxPaybackWeeks) + weeksWord(rules.maxPaybackWeeks);
    var effortStands = compare(paybackWeeks, rules.maxPaybackWeeks);
    var effortPass = effortStands !== 'over';
    var effortReason;
    var effortMetricText;
    if (paybackWeeks === Infinity) {
      effortMetricText = 'never pays back';
      if (yearlyNetBeforeBuild < 0 && effortPerYear > 0) {
        effortReason = 'It never pays back: after running costs and ' + money(effortPerYear) +
          ' a year of upkeep, it loses ' + money(-yearlyNetBeforeBuild) + ' a year.';
      } else if (yearlyNetBeforeBuild < 0) {
        effortReason = 'It never pays back: it costs ' + money(-yearlyNetBeforeBuild) + ' a year more to run than it returns.';
      } else {
        effortReason = 'It never pays back: after running costs and upkeep, nothing is left over to cover the build.';
      }
    } else if (effortOnce === 0) {
      effortMetricText = '0 weeks to pay back';
      effortReason = 'There is nothing to build or roll out, so there is nothing to pay back.';
    } else {
      var paybackText = weeksVersus(CM, effortStands, paybackWeeks, rules.maxPaybackWeeks, weeksLimitText);
      effortMetricText = paybackText + ' to pay back';
      effortReason = effortPass
        ? 'The ' + money(effortOnce) + ' to build it and roll it out is paid back in ' + paybackText + '. The limit is ' + weeksLimitText + '.'
        : 'The ' + money(effortOnce) + ' to build it and roll it out takes ' + paybackText + ' to pay back. The limit is ' + weeksLimitText + '.';
    }

    // --- Gate 4: POTENTIAL -----------------------------------------------------
    // NO when growth is BELOW the minimum, or nobody owns the freed time.
    var growthLimitText = inItsUnit(CM, 'times', rules.minGrowth);
    var growthStands = compare(c.growth, rules.minGrowth);
    var shrinks = growthStands === 'under';
    var potentialPass = !shrinks && c.ownerNamed;
    var growthShown = growthVersus(CM, growthStands, c.growth, rules.minGrowth, growthLimitText);
    var growthSentence = shrinks
      ? 'Projected growth is ' + growthShown + ', below the ' + growthLimitText + ' minimum'
      : 'Projected growth is ' + growthShown + ' over the next year';
    var potentialReason = growthSentence + (c.ownerNamed
      ? (shrinks ? ', even though someone owns the freed time.' : ', and someone owns the freed time.')
      : (shrinks ? ', and nobody owns the freed time.' : ', but nobody owns the freed time, so the minutes will not turn into anything.'));

    // --- Assemble --------------------------------------------------------------
    var gates = {
      cost: {
        pass: costPass,
        metric: costShareOfReturn,
        limit: rules.costMaxShareOfReturn,
        metricText: costMetricText,
        rule: 'NO when yearly cost is more than ' + costLimitText + ' of yearly return.',
        reason: costReason
      },
      'return': {
        pass: returnPass,
        metric: returnPerYear,
        limit: rules.minReturnPerYear,
        metricText: returnMetricText,
        rule: 'NO when yearly return is under ' + floorText + ' and it takes no days off the cash cycle.',
        reason: returnReason
      },
      effort: {
        pass: effortPass,
        metric: paybackWeeks,
        limit: rules.maxPaybackWeeks,
        metricText: effortMetricText,
        rule: 'NO when payback is longer than ' + weeksLimitText + '.',
        reason: effortReason
      },
      potential: {
        pass: potentialPass,
        metric: c.growth,
        limit: rules.minGrowth,
        metricText: growthShown + ' growth, ' + (c.ownerNamed ? 'owner named' : 'no owner'),
        rule: 'NO when growth is below ' + growthLimitText + ' or nobody owns the freed time.',
        reason: potentialReason
      }
    };
    GATES.forEach(function (g) {
      var gate = gates[g.id];
      gate.id = g.id;
      gate.label = g.label;
      gate.question = g.question;
      gate.blocked = blockedBy[g.id].length > 0;
      if (gate.blocked) {
        // A gate does not pass on a number nobody entered.
        gate.pass = false;
        gate.metricText = 'cannot be judged yet';
        gate.reason = blockedReason(g);
      }
      // Last line of defence: no gate figure is ever NaN.
      if (gate.metric !== gate.metric) {
        gate.metric = 0;
        gate.pass = false;
        warnings.push('Could not compute the ' + g.label + ' figure; shown as 0.');
      }
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
      warnings: warnings,
      inputProblems: inputProblems
    };

    // Last line of defence: with cleaned, capped inputs no value here can be
    // NaN. If one ever is, show 0 and say so rather than put "NaN" on a slide.
    var tooLarge = false;
    for (var key in result) {
      if (typeof result[key] !== 'number') continue;
      if (result[key] !== result[key]) {
        result[key] = 0;
        warnings.push('Could not compute ' + key + '; shown as 0.');
      } else if (isFinite(result[key]) && Math.abs(result[key]) >= TOO_BIG) {
        tooLarge = true;
      }
    }
    if (tooLarge) warnings.push('These figures are too large to mean anything. Check the inputs for a slip.');
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
   * One number handed straight to a rule of thumb. Left out (or blank) means
   * "use the speaker's value". Something unusable (text, a negative) gives 0:
   * these helpers have no warnings to put it in, and a made-up default would
   * look like a real answer.
   */
  function argument(raw, spec, fallback) {
    var read = readNumber(raw, spec);
    if (read.blank) return fallback;
    return read.problem ? 0 : read.value;
  }

  /*
   * What one minute saved per week is worth in a year:
   *     1 minute x workWeeks x loadedHourly / 60
   * $25 at the defaults (50 weeks, $30 an hour). $50 at $60 an hour.
   */
  function minuteRule(loadedHourly, workWeeks) {
    var rates = defaultAssumptions().rates;
    var hourly = argument(loadedHourly, SPEC.loadedHourly, rates.loadedHourly);
    var weeks = argument(workWeeks, SPEC.workWeeks, rates.workWeeks);
    return tidy(1 * weeks * hourly / MINUTES_PER_HOUR);
  }

  /*
   * One day off the cash cycle frees about one day of sales:
   *     annualRevenue / 365
   * The standard working-capital approximation. Label it "about" on screen.
   */
  function cashPerDay(annualRevenue) {
    var revenue = argument(annualRevenue, SPEC.annualRevenue, defaultAssumptions().company.annualRevenue);
    return tidy(revenue / DAYS_PER_YEAR);
  }


  /* ---------------------------------------------------------------------------
   * The example company's label
   * ------------------------------------------------------------------------ */

  /* "$20M", "$20 million", "$20,000,000", "$750K" inside a sentence. */
  var AMOUNT_IN_TEXT = /\$\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(thousand|million|billion|trillion)\b|(k|mm|m|bn|b|t)\b)?/i;
  var UNIT_SIZE = {
    k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, trillion: 1e12
  };

  /*
   * The on-screen name of the example company, guaranteed to agree with the
   * revenue beside it.
   *
   * The label in your-numbers.js is free text ("Example: a $20M distributor")
   * and the dollar figure next to it on the slide is worked out from
   * annualRevenue. Change one and not the other and the slide would say
   * "a $20M distributor" beside a figure for $5M. So: the first dollar amount
   * in the label is taken to be the revenue, and when it disagrees with
   * annualRevenue it is rewritten from annualRevenue ("Example: a $5M
   * distributor"). A label with no dollar amount in it is returned as it is.
   *
   * Call it with nothing for the speaker's company, or with a
   * { annualRevenue, label } of your own. Slides should show this, not
   * YOUR.company.label directly. Gates.defaultAssumptions().company.label and
   * result.assumptions.company.label have already been through it.
   */
  function companyLabel(company) {
    var co = (company && typeof company === 'object') ? company : layOver(BUILT_IN, your(), [], false).company;
    var label = (typeof co.label === 'string') ? co.label : BUILT_IN.company.label;
    var revenue = co.annualRevenue;
    var CM = dep('CostMath', './cost-math.js');
    if (!CM || typeof revenue !== 'number' || !isFinite(revenue) || revenue < 0) return label;

    var found = AMOUNT_IN_TEXT.exec(label);
    if (!found) return label;
    var unit = (found[2] || found[3] || '').toLowerCase();
    var said = Number(found[1].replace(/,/g, '')) * (UNIT_SIZE[unit] || 1);
    var right = CM.shortMoney(revenue);
    if (CM.shortMoney(said) === right) return label;                       // already agrees
    return label.slice(0, found.index) + right + label.slice(found.index + found[0].length);
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
    companyLabel: companyLabel,
    formatWeeks: formatWeeks
  };

  if (root) root.Gates = Gates;
  if (inNode) module.exports = Gates;
})();
