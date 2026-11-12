#!/usr/bin/env node
/*
 * tools/test-libs.js
 * -----------------------------------------------------------------------------
 * Checks the numbers the whole talk stands on. No test framework: every check
 * prints one PASS or FAIL line, and the script exits non-zero if anything
 * failed.
 *
 *     node tools/test-libs.js               everything, including a real browser
 *     node tools/test-libs.js --no-browser  skip the browser part (no Playwright needed)
 *
 * What it covers
 *   1. The CSV parser and the generated data file (deck/lib/benchlm-data.js).
 *   2. Every benchmark-derived fact in docs/BRIEF.md section 4, recomputed.
 *   3. The four-gate math, on the three example candidates and on edge cases.
 *   4. The speaker's file (deck/content/your-numbers.js): shape and sanity.
 *   5. The same libraries loaded in a real browser from file://, compared with
 *      the Node results.
 *   6. Regressions: every defect an independent review confirmed, pinned down
 *      (ties on a limit, close-call wording, unusable inputs, formatters).
 *   7. docs/MATH.md, read and compared with what the code prints, digit for digit.
 *
 * Sections 2 and 3 pass their assumptions in explicitly (2,000 / 500 tokens,
 * $30 an hour, and so on) and use their own copy of the three example
 * candidates. So they keep passing after the speaker edits your-numbers.js.
 * Section 4 says, as a NOTE rather than a failure, when that file no longer
 * matches what shipped.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var url = require('url');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var FILES = {
  your: path.join(ROOT, 'deck', 'content', 'your-numbers.js'),
  data: path.join(ROOT, 'deck', 'lib', 'benchlm-data.js'),
  cost: path.join(ROOT, 'deck', 'lib', 'cost-math.js'),
  gates: path.join(ROOT, 'deck', 'lib', 'gates-core.js')
};
var CSV_PATH = path.join(ROOT, 'data', 'benchlm-leaderboard.csv');

var SKIP_BROWSER = process.argv.indexOf('--no-browser') !== -1;

/* Typographic characters the formatters use (written this way to keep this file ASCII). */
var MINUS = String.fromCharCode(0x2212);
var TIMES = String.fromCharCode(0x00d7);
var MIDDOT = String.fromCharCode(0x00b7);


/* -----------------------------------------------------------------------------
 * A very small test harness
 * -------------------------------------------------------------------------- */
var passed = 0;
var failed = 0;
var notes = 0;

function section(title) {
  console.log('\n== ' + title + ' ==');
}

function show(v) {
  if (typeof v === 'number') return String(v);
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

function ok(condition, label, detail) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label + (detail ? '\n        ' + detail : ''));
  }
  return !!condition;
}

/* Exactly equal (===). */
function is(actual, expected, label) {
  return ok(actual === expected, label, 'expected ' + show(expected) + ', got ' + show(actual));
}

/* Equal as data (compared as JSON). */
function same(actual, expected, label) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  return ok(a === e, label, 'expected ' + e + '\n        got      ' + a);
}

/* Equal within a tolerance. The default allows for floating-point dust only. */
function near(actual, expected, label, tolerance) {
  var tol = (tolerance === undefined) ? 1e-9 * Math.max(1, Math.abs(expected)) : tolerance;
  var good = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
  return ok(good, label, 'expected ' + expected + ' (+/- ' + tol + '), got ' + show(actual));
}

function throws(fn, label) {
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  return ok(threw, label, 'expected an error, but none was thrown');
}

function note(message) {
  notes += 1;
  console.log('NOTE  ' + message);
}

/* Every path inside a value where a NaN is hiding. Empty list = clean. */
function findNaN(value, where, seen) {
  var found = [];
  seen = seen || [];
  if (typeof value === 'number') {
    if (value !== value) found.push(where || '(value)');
  } else if (value && typeof value === 'object') {
    if (seen.indexOf(value) !== -1) return found;
    seen.push(value);
    Object.keys(value).forEach(function (k) {
      found = found.concat(findNaN(value[k], (where ? where + '.' : '') + k, seen));
    });
  }
  return found;
}

/* Every string inside a value that would look broken on a slide. */
function findBadText(value, where, seen) {
  var found = [];
  seen = seen || [];
  if (typeof value === 'string') {
    if (/NaN|undefined|Infinity|\[object/.test(value)) found.push((where || '(value)') + ': ' + value);
  } else if (value && typeof value === 'object') {
    if (seen.indexOf(value) !== -1) return found;
    seen.push(value);
    Object.keys(value).forEach(function (k) {
      found = found.concat(findBadText(value[k], (where ? where + '.' : '') + k, seen));
    });
  }
  return found;
}

function names(list) {
  return list.map(function (m) { return m.name; });
}


/* -----------------------------------------------------------------------------
 * The brief's defaults and the three example candidates, pinned here so the
 * math checks do not move when the speaker edits your-numbers.js.
 * -------------------------------------------------------------------------- */
var BRIEF_TOKENS = { in: 2000, out: 500 };
var BRIEF = {
  rates: { loadedHourly: 30, builderHourly: 75, workWeeks: 50 },
  company: { annualRevenue: 20000000, label: 'Example: a $20M distributor' },
  tokens: { in: 2000, out: 500 },
  houseRules: { costMaxShareOfReturn: 0.30, minReturnPerYear: 5000, maxPaybackWeeks: 26, minGrowth: 1 }
};

var EXAMPLES = [
  {
    id: 'chatbot', name: 'Customer chatbot for parts lookup', pitch: 'The exciting one', lens: 'product',
    minutesPerRun: 4, runsPerWeek: 150, tier: 'frontier', toolsPerMonth: 250,
    buildHours: 400, rolloutHours: 40, upkeepHoursPerMonth: 30, growth: 1.5,
    touchesCashPath: false, daysOffCashCycle: 0, ownerNamed: false
  },
  {
    id: 'notes', name: 'Meeting-notes summaries for managers', pitch: 'The easy one', lens: 'product',
    minutesPerRun: 10, runsPerWeek: 20, tier: 'small', toolsPerMonth: 240,
    buildHours: 4, rolloutHours: 8, upkeepHoursPerMonth: 1, growth: 1,
    touchesCashPath: false, daysOffCashCycle: 0, ownerNamed: false
  },
  {
    id: 'reminders', name: 'Invoice follow-up reminders', pitch: 'The boring one', lens: 'product',
    minutesPerRun: 6, runsPerWeek: 60, tier: 'small', toolsPerMonth: 0,
    buildHours: 24, rolloutHours: 6, upkeepHoursPerMonth: 1.5, growth: 1.5,
    touchesCashPath: true, daysOffCashCycle: 2, ownerNamed: true
  }
];

/* A fresh copy of the brief's assumptions with a few values replaced. */
function briefWith(overrides) {
  var a = JSON.parse(JSON.stringify(BRIEF));
  overrides = overrides || {};
  Object.keys(overrides).forEach(function (group) {
    Object.keys(overrides[group]).forEach(function (k) { a[group][k] = overrides[group][k]; });
  });
  return a;
}

/* A plain passing candidate to bend into edge cases. */
function baseCandidate(overrides) {
  var c = {
    id: 'base', name: 'Base', lens: 'product', minutesPerRun: 6, runsPerWeek: 60, tier: 'small',
    toolsPerMonth: 0, buildHours: 24, rolloutHours: 6, upkeepHoursPerMonth: 1.5, growth: 1.5,
    touchesCashPath: true, daysOffCashCycle: 2, ownerNamed: true
  };
  Object.keys(overrides || {}).forEach(function (k) { c[k] = overrides[k]; });
  return c;
}


/* =============================================================================
 * 1. CSV parser and generated data
 * ========================================================================== */
function testCsvAndData(build, BENCHLM) {
  section('1. CSV parser');
  var parse = build.parseCsv;

  same(parse('a,b\n1,2\n'), [['a', 'b'], ['1', '2']], 'plain rows');
  same(parse('"x, y",z'), [['x, y', 'z']], 'a comma inside quotes stays in the field');
  same(parse('"He said ""no""",1'), [['He said "no"', '1']], 'doubled quotes become one quote');
  same(parse('"line1\nline2",2\r\n3,4'), [['line1\nline2', '2'], ['3', '4']], 'a line break inside quotes stays in the field; CRLF ends a row');
  same(parse('a,,c\n,,'), [['a', '', 'c'], ['', '', '']], 'empty fields are kept');
  same(parse('"",""'), [['', '']], 'quoted empty fields');
  same(parse('a,b\n1,2'), [['a', 'b'], ['1', '2']], 'no newline at the end of the file');
  same(parse('a,b\n1,2\n\n\n'), [['a', 'b'], ['1', '2']], 'blank lines at the end are ignored');
  same(parse(String.fromCharCode(0xFEFF) + '"a","b"\n"1","2"'), [['a', 'b'], ['1', '2']], 'a byte-order mark is dropped');
  same(parse('a,b\r1,2\r'), [['a', 'b'], ['1', '2']], 'bare CR line endings');
  throws(function () { parse('"never closed,1\n2,3'); }, 'an unclosed quote is an error');
  throws(function () { parse('"a"b,c'); }, 'text straight after a closing quote is an error');

  var head = '"rank","model","creator","sourceType","overallScore","evidenceStatus","interval90Lower","interval90Upper",' +
    '"coding","agentic","reasoning","knowledge","math","multimodalGrounded","multilingual","instructionFollowing","inputPrice","outputPrice"\n';
  var rowA = '"1","Model, ""A""","Maker","Proprietary","90.5","estimated","80","100","1","2","3","4","5","6","7","8","2","10"\n';
  var rowB = '"2","Model B","Maker","Open Weight","70","supported","60","80","","","","","","","","","",""\n';
  var rowC = '"3","Model C","Maker","Open Weight","60","supported","50","70","","","","","","","","","0","0"\n';
  var tiny = build.build(head + rowA + rowB + rowC);
  is(tiny.models.length, 3, 'a small CSV builds three models');
  is(tiny.models[0].name, 'Model, "A"', 'quoted name with a comma and quotes survives');
  is(tiny.models[0].overallScore, 90.5, 'numbers are numbers');
  is(tiny.models[0].estimated, true, 'estimated flag is a boolean');
  same(tiny.models[0].interval90, [80, 100], 'interval90 is [low, high]');
  is(tiny.models[1].inputPrice, null, 'a blank price is null');
  is(tiny.models[1].coding, null, 'a blank category score is null');
  same(tiny.models.map(function (m) { return m.priceStatus; }), ['priced', 'blank', 'zero-listed'], 'priceStatus: priced, blank, zero-listed');
  throws(function () { build.build(head.replace('"inputPrice",', '') + rowA); }, 'a missing column stops the build');
  throws(function () { build.build(head + rowA.replace('"2","10"', '"cheap","10"')); }, 'a price that is not a number stops the build');
  throws(function () { build.build(head + rowA + rowA.replace('"1",', '"9",')); }, 'a duplicate model name stops the build');
  throws(function () { build.build(head + '"1","Short row"\n'); }, 'a row with missing fields stops the build');

  section('1. Generated data file');
  var fresh = build.build(fs.readFileSync(CSV_PATH, 'utf8'));
  ok(fresh.output === fs.readFileSync(FILES.data, 'utf8'),
    'deck/lib/benchlm-data.js is up to date with the CSV',
    'run: node tools/build-data.js');
  is(BENCHLM.meta.source, 'BenchLM leaderboard export', 'meta.source');
  is(BENCHLM.meta.retrieved, 'November 2026', 'meta.retrieved');
  is(BENCHLM.meta.rows, 50, 'meta.rows is 50');
  is(BENCHLM.models.length, 50, '50 models');
  ok(typeof BENCHLM.meta.orderingNote === 'string' && /rank confidence/.test(BENCHLM.meta.orderingNote),
    'meta.orderingNote carries the file\'s own caution about rank order');

  var statuses = { priced: 0, blank: 0, 'zero-listed': 0 };
  var shapeProblems = [];
  var numberFields = ['rank', 'overallScore'];
  var nullableNumbers = ['coding', 'agentic', 'reasoning', 'knowledge', 'math', 'multimodalGrounded',
    'multilingual', 'instructionFollowing', 'inputPrice', 'outputPrice'];
  BENCHLM.models.forEach(function (m) {
    if (statuses[m.priceStatus] === undefined) shapeProblems.push(m.name + ': priceStatus ' + m.priceStatus);
    else statuses[m.priceStatus] += 1;
    numberFields.forEach(function (f) {
      if (typeof m[f] !== 'number' || !isFinite(m[f])) shapeProblems.push(m.name + ': ' + f + ' is not a number');
    });
    nullableNumbers.forEach(function (f) {
      if (!(m[f] === null || (typeof m[f] === 'number' && isFinite(m[f])))) shapeProblems.push(m.name + ': ' + f + ' is neither a number nor null');
    });
    ['name', 'creator', 'sourceType', 'evidenceStatus'].forEach(function (f) {
      if (typeof m[f] !== 'string' || m[f] === '') shapeProblems.push(m.name + ': ' + f + ' is not text');
    });
    if (typeof m.estimated !== 'boolean') shapeProblems.push(m.name + ': estimated is not true/false');
    if (m.estimated !== (m.evidenceStatus === 'estimated')) shapeProblems.push(m.name + ': estimated disagrees with evidenceStatus');
    if (!Array.isArray(m.interval90) || m.interval90.length !== 2 ||
        typeof m.interval90[0] !== 'number' || typeof m.interval90[1] !== 'number') {
      shapeProblems.push(m.name + ': interval90 is not [low, high]');
    }
    var expectStatus = (m.inputPrice === null || m.outputPrice === null) ? 'blank'
      : (m.inputPrice === 0 && m.outputPrice === 0) ? 'zero-listed' : 'priced';
    if (m.priceStatus !== expectStatus) shapeProblems.push(m.name + ': priceStatus does not match its prices');
  });
  ok(shapeProblems.length === 0, 'every model has the documented shape (numbers are numbers, blanks are null)', shapeProblems.slice(0, 5).join('; '));
  same(BENCHLM.models.map(function (m) { return m.rank; }), BENCHLM.models.map(function (_, i) { return i + 1; }), 'ranks run 1 to 50 in order');
  is(statuses.priced, 41, '41 priced');
  is(statuses.blank, 5, '5 blank');
  is(statuses['zero-listed'], 4, '4 listed at $0');
  is(BENCHLM.models.filter(function (m) { return m.estimated; }).length, 17, '17 estimated');

  // Spot checks against the CSV text itself, independent of our parser.
  var csvText = fs.readFileSync(CSV_PATH, 'utf8');
  ok(csvText.indexOf('"26","Claude Haiku 5.5","Anthropic","Proprietary","66.17","supported"') !== -1 &&
     /"Claude Haiku 5\.5".*"0\.1","0\.5",/.test(csvText),
    'spot check: the CSV row for Claude Haiku 5.5 reads rank 26, score 66.17, prices 0.1 / 0.5');
  var haiku = BENCHLM.models.filter(function (m) { return m.name === 'Claude Haiku 5.5'; })[0];
  same([haiku.rank, haiku.overallScore, haiku.inputPrice, haiku.outputPrice, haiku.estimated], [26, 66.17, 0.1, 0.5, false],
    'spot check: the generated record for Claude Haiku 5.5 says the same');
}


/* =============================================================================
 * 2. Benchmark facts (brief, section 4, "Tiers")
 * ========================================================================== */
function testCostMath(C, BENCHLM) {
  var T = BRIEF_TOKENS;

  section('2. Counts');
  same(C.counts(), { rows: 50, priced: 41, blank: 5, zeroListed: 4, estimated: 17 }, 'counts(): 50 rows, 41 priced, 5 blank, 4 zero-listed, 17 estimated');
  is(C.priced(T).length, 41, 'priced() returns 41 models');
  is(C.excluded().blank.length, 5, 'excluded().blank lists 5');
  is(C.excluded().zeroListed.length, 4, 'excluded().zeroListed lists 4');
  ok(C.excluded().zeroListed.every(function (m) { return m.sourceType === 'Open Weight'; }), 'every model listed at $0 is open-weight');

  section('2. Price per run at 2,000 in / 500 out');
  near(C.pricePerRun('Claude Haiku 5.5', T), 0.00045, 'Claude Haiku 5.5 costs $0.00045 a run');
  near(C.pricePerRun(C.model('GPT-5.5 Pro'), T), 0.15, 'GPT-5.5 Pro costs $0.15 a run (model object accepted)');
  near(C.pricePerRun('Claude Haiku 5.5', { in: 1000000, out: 0 }), 0.1, 'one million tokens in costs the input price');
  near(C.pricePerRun('Claude Haiku 5.5', { in: 0, out: 1000000 }), 0.5, 'one million tokens out costs the output price');
  is(C.pricePerRun('Muse Wonder Full', T), null, 'a model with a blank price has no price per run (null)');
  is(C.pricePerRun('GLM-5.3', T), null, 'a model listed at $0 is left out of price math (null)');
  is(C.pricePerRun('No Such Model', T), null, 'an unknown model has no price per run (null)');

  var list = C.priced(T);
  var sorted = list.every(function (m, i) { return i === 0 || list[i - 1].pricePerRun <= m.pricePerRun; });
  ok(sorted, 'priced() is sorted cheapest first');
  ok(list.every(function (m) { return typeof m.pricePerRun === 'number' && m.pricePerRun > 0; }), 'every priced model carries a positive pricePerRun');

  section('2. Spread');
  var s = C.spread(T);
  near(s.cheapest.pricePerRun, 0.00045, 'cheapest is $0.00045 a run');
  near(s.dearest.pricePerRun, 0.15, 'dearest is $0.15 a run');
  near(s.cheapestPrice, 0.00045, 'cheapestPrice');
  near(s.dearestPrice, 0.15, 'dearestPrice');
  is(Math.round(s.ratio), 333, 'spread ratio rounds to 333');
  is(C.ratio(s.ratio), '333' + TIMES, 'ratio() prints it as 333 with a multiplication sign');
  is(s.cheapest.name, 'Claude Haiku 5.5', 'the cheapest named is Claude Haiku 5.5 (best score at that price)');
  is(s.dearest.name, 'GPT-5.5 Pro', 'the dearest named is GPT-5.5 Pro (best score at that price)');
  same(names(s.tiedCheapest), ['Claude Haiku 5.5', 'GPT-6 Luna'], 'two models tie for cheapest');
  same(names(s.tiedDearest), ['GPT-5.5 Pro', 'GPT-5.4 Pro'], 'two models tie for dearest');
  is(C.money(s.cheapest), '$0.00045', 'money() prints the cheapest as $0.00045');
  is(C.money(s.dearest), '$0.15', 'money() prints the dearest as $0.15');

  section('2. Efficient frontier');
  var f = C.frontier(T);
  same(names(f), ['Claude Haiku 5.5', 'Gemini 3.8 Flash', 'GPT-6.1 Terra', 'Gemini 4 Carbon', 'Claude Fable 5.2'],
    'frontier is exactly Haiku 5.5, Gemini 3.8 Flash, GPT-6.1 Terra, Gemini 4 Carbon, Fable 5.2');
  is(C.dominatedCount(T), 36, '36 models are dominated');
  is(C.dominatedCount(T) + f.length, C.counts().priced, 'dominated + frontier = all 41 priced models');
  is(C.dominated(T).length, 36, 'dominated() lists the 36');
  // Independent check of the definition, straight from the raw data.
  var raw = BENCHLM.models.filter(function (m) { return m.priceStatus === 'priced'; }).map(function (m) {
    return { name: m.name, score: m.overallScore, price: (2000 * m.inputPrice + 500 * m.outputPrice) / 1e6 };
  });
  var rawFrontier = raw.filter(function (m) {
    return !raw.some(function (o) { return o !== m && o.price <= m.price + 1e-15 && o.score > m.score; });
  }).sort(function (a, b) { return a.price - b.price; });
  same(names(rawFrontier), names(f), 'an independent recomputation from the raw data gives the same frontier');
  ok(f.every(function (m, i) { return i === 0 || (f[i - 1].pricePerRun < m.pricePerRun && f[i - 1].overallScore < m.overallScore); }),
    'along the frontier, price and score both rise');
  same(f.map(function (m) { return m.estimated; }), [false, false, true, false, true],
    'frontier models carry the file\'s estimated flag (Terra and Fable 5.2 are estimated)');

  section('2. Tiers (the table in the brief)');
  var tiers = C.tiers(T);
  same(tiers.map(function (t) { return t.id; }), ['code', 'small', 'mid', 'frontier', 'premium'], 'five tiers in order: code, small, mid, frontier, premium');
  same(tiers.map(function (t) { return t.modelName; }), [null, 'Claude Haiku 5.5', 'Gemini 4 Carbon', 'Claude Fable 5.2', 'GPT-5.5 Pro'], 'representative models');
  same(tiers.map(function (t) { return [t.inputPrice, t.outputPrice]; }), [[null, null], [0.1, 0.5], [2, 10], [8, 40], [30, 180]],
    'list prices: 0.10/0.50, 2/10, 8/40, 30/180');
  var table = [
    ['code', 0, 0, 0, 'about $0', 'about $0', 'about $0'],
    ['small', 0.00045, 0.45, 45, '$0.00045', '$0.45', '$45'],
    ['mid', 0.009, 9, 900, '$0.009', '$9', '$900'],
    ['frontier', 0.036, 36, 3600, '$0.036', '$36', '$3,600'],
    ['premium', 0.15, 150, 15000, '$0.15', '$150', '$15,000']
  ];
  table.forEach(function (row, i) {
    var t = tiers[i];
    near(t.pricePerRun, row[1], row[0] + ': per run ' + row[4]);
    near(t.per1000, row[2], row[0] + ': per 1,000 ' + row[5]);
    near(t.per100000, row[3], row[0] + ': per 100,000 ' + row[6]);
    same([C.money(t.pricePerRun), C.money(t.per1000), C.money(t.per100000)], [row[4], row[5], row[6]], row[0] + ': prints as ' + row.slice(4).join(' / '));
  });
  same(tiers.map(function (t) { return t.estimated; }),
    [false].concat(['Claude Haiku 5.5', 'Gemini 4 Carbon', 'Claude Fable 5.2', 'GPT-5.5 Pro'].map(function (n) { return C.model(n).estimated; })),
    'each tier carries its model\'s estimated flag from the file');
  same(tiers.map(function (t) { return t.estimated; }), [false, false, false, true, true], 'estimated: frontier and premium tiers are, small and mid are not');
  is(C.tier('frontier', T).modelName, 'Claude Fable 5.2', 'tier("frontier") looks a tier up by id');
  is(C.tier('Plain code', T).id, 'code', 'tier() accepts "Plain code" for the code tier');
  is(C.tier('pro', T).id, 'premium', 'tier() accepts "pro" for the premium tier');
  is(C.tier('nonsense', T), null, 'tier() returns null for an unknown tier');
  near(C.volumeCost(0.036, 100000), 3600, 'volumeCost(0.036, 100,000) is $3,600');
  is(C.volumeCost(0.15, 0), 0, 'volumeCost of zero runs is 0');
  near(C.volumeCost(C.tier('premium', T).pricePerRun, 10000000), 1500000, 'ten million premium runs cost $1,500,000');

  section('2. Break-even seconds at $30 an hour');
  near(C.breakEvenSeconds(s.dearest, 30, T), 18, 'the dearest model must save 18 seconds');
  near(C.breakEvenSeconds('Claude Fable 5.2', 30, T), 4.32, 'Claude Fable 5.2 must save about 4.3 seconds');
  is(C.breakEvenSeconds('Claude Fable 5.2', 30, T).toFixed(1), '4.3', 'which rounds to 4.3');
  near(C.breakEvenSeconds('Claude Haiku 5.5', 30, T), 0.054, 'Claude Haiku 5.5 must save about 0.05 seconds');
  is(C.breakEvenSeconds('Claude Haiku 5.5', 30, T).toFixed(2), '0.05', 'which rounds to 0.05');
  near(C.breakEvenSeconds('GPT-5.5 Pro', 60, T), 9, 'at $60 an hour the dearest model needs 9 seconds');
  near(C.breakEvenSeconds(0.15, 30), 18, 'breakEvenSeconds accepts a price per run');
  is(C.breakEvenSeconds('GPT-5.5 Pro', 0, T), Infinity, 'at $0 an hour nothing pays for a run (Infinity, not NaN)');
  is(C.breakEvenSeconds('GLM-5.3', 30, T), null, 'an unpriced model has no break-even (null)');

  section('2. Stepping up the frontier');
  var step1 = C.stepComparison('Claude Haiku 5.5', 'Gemini 4 Carbon', T);
  near(step1.priceRatio, 20, 'Haiku 5.5 to Gemini 4 Carbon is 20 times the price');
  near(step1.scoreGain, 21.74, 'for 21.74 points of overall score');
  is(Math.round(step1.scoreGain), 22, 'which is about 22 points');
  var step2 = C.stepComparison('Gemini 4 Carbon', 'Claude Fable 5.2', T);
  near(step2.priceRatio, 4, 'Carbon to Fable 5.2 is 4 times the price');
  near(step2.scoreGain, 3.5, 'for 3.5 points');
  is(step2.estimated, true, 'the Fable 5.2 step is flagged estimated');
  same([C.stepComparison('Nope', 'Claude Fable 5.2', T).priceRatio, C.stepComparison('Nope', 'Claude Fable 5.2', T).scoreGain], [null, null],
    'a step from an unknown model gives nulls, not NaN');

  section('2. Token assumptions');
  same(C.tokens({ in: 100, out: 50 }), { in: 100, out: 50 }, 'tokens() takes an override');
  same(C.tokens({ tokensIn: 7, tokensOut: 9 }), { in: 7, out: 9 }, 'tokens() accepts tokensIn / tokensOut');
  same(C.tokens({ in: 'abc', out: -5 }), C.tokens(), 'a bad override falls back to the default');
  near(C.spread({ in: 4000, out: 1000 }).ratio, s.ratio, 'doubling the task size leaves the spread ratio alone');
  near(C.spread({ in: 4000, out: 1000 }).dearestPrice, 0.30, 'and doubles the dearest price');
  same(C.tiers({ in: 0, out: 0 }).map(function (t) { return t.pricePerRun; }), [0, 0, 0, 0, 0], 'a task of zero tokens costs nothing on any tier');
  ok(findNaN(C.spread({ in: 0, out: 0 })).length === 0 && findNaN(C.frontier({ in: 0, out: 0 })).length === 0,
    'zero tokens produce no NaN in spread() or frontier()');

  section('2. Formatters');
  var moneyCases = [
    [0, 'about $0'], [0.00045, '$0.00045'], [0.009, '$0.009'], [0.036, '$0.036'], [0.15, '$0.15'],
    [0.45, '$0.45'], [0.5, '$0.50'], [1.35, '$1.35'], [9, '$9'], [36.00000000000001, '$36'], [45, '$45'],
    [150, '$150'], [900, '$900'], [3600, '$3,600'], [15000, '$15,000'], [17546.625, '$17,547'],
    [1500000, '$1,500,000'], [-48270, MINUS + '$48,270'], [0.999, '$1'], [99.999, '$100'],
    ['45', '$45'], [null, 'n/a'], [undefined, 'n/a'], [NaN, 'n/a'], ['abc', 'n/a']
  ];
  moneyCases.forEach(function (c) { is(C.money(c[0]), c[1], 'money(' + show(c[0]) + ') is ' + c[1]); });
  is(C.aboutMoney(54794.52), '$54,800', 'aboutMoney(54794.52) is $54,800');
  is(C.aboutMoney(109589.04), '$109,600', 'aboutMoney(109589.04) is $109,600');
  is(C.aboutMoney(17546.625), '$17,500', 'aboutMoney(17546.625) is $17,500');
  is(C.aboutMoney(462), '$462', 'aboutMoney leaves amounts under $1,000 alone');
  is(C.money(15.4 * 30), '$462', '15.4 hours at $30 an hour prints as $462, the figure the brief puts on the slotting scorecard');
  same([String(32.8 - 17.4), C.number(32.8 - 17.4), C.money((32.8 - 17.4) * 30)], ['15.399999999999999', '15.4', '$462'],
    'the same figure from the two pick-hour numbers: 32.8 - 17.4 is 15.399999999999999 to a computer, and number() / money() still print 15.4 and $462');
  same(['small', 'frontier', 'premium'].map(function (id) { return C.money(C.volumeCost(C.tier(id, T), 10 * 1000000)); }), ['$4,500', '$360,000', '$1,500,000'],
    'ten million model calls (the slotting-cost slide): $4,500 small, $360,000 frontier, $1,500,000 premium');
  var ratioCases = [[333.33, '333' + TIMES], [20, '20' + TIMES], [4, '4' + TIMES], [1.5, '1.5' + TIMES], [1, '1' + TIMES], [NaN, 'n/a']];
  ratioCases.forEach(function (c) { is(C.ratio(c[0]), c[1], 'ratio(' + show(c[0]) + ') is ' + c[1]); });
  var percentCases = [[0.218, '22%'], [0.57609, '58%'], [0.3, '30%'], [0.00015, 'under 1%'], [0, '0%'], [0.063, '6.3%'], [1, '100%'], [NaN, 'n/a']];
  percentCases.forEach(function (c) { is(C.percent(c[0]), c[1], 'percent(' + show(c[0]) + ') is ' + c[1]); });
}


/* =============================================================================
 * 3. The four gates (brief, section 4, "The math")
 * ========================================================================== */
function testGates(G, C) {
  section('3. Rules of thumb');
  is(G.minuteRule(30, 50), 25, 'one minute a week is worth exactly $25 a year at $30 an hour, 50 weeks');
  is(G.minuteRule(60, 50), 50, 'and exactly $50 at $60 an hour');
  is(G.minuteRule(0, 50), 0, 'and $0 at $0 an hour (no NaN)');
  near(G.cashPerDay(20000000), 54794.52, 'cashPerDay(20,000,000) is about $54,795', 0.01);
  is(Math.round(G.cashPerDay(20000000)), 54795, 'which rounds to 54,795');
  is(C.aboutMoney(G.cashPerDay(20000000)), '$54,800', 'and prints as "about $54,800" for the slide');
  is(G.cashPerDay(0), 0, 'cashPerDay(0) is 0');

  section('3. Candidate A: customer chatbot (the exciting one)');
  var a = G.evaluate(EXAMPLES[0], BRIEF);
  near(a.pricePerRun, 0.036, 'runs on the frontier tier at $0.036 a run');
  near(a.hoursFreedPerYear, 500, 'frees 500 hours a year');
  is(a.laborValue, 15000, 'labor value $15,000');
  is(a.returnPerYear, 15000, 'return $15,000 a year');
  near(a.costPerYear, 3270, 'cost $3,270 a year ($270 of runs + $3,000 of licences)');
  near(a.costShareOfReturn, 0.218, 'cost is 21.8% of return');
  is(a.effortOnce, 33000, 'one-time effort $33,000');
  is(a.effortPerYear, 27000, 'upkeep $27,000 a year');
  near(a.yearlyNetBeforeBuild, -15270, 'it loses $15,270 a year before the build is even counted');
  is(a.paybackWeeks, Infinity, 'payback never (Infinity)');
  near(a.year1Net, -48270, 'year 1 net -$48,270');
  near(a.year2RunRate, -9405, 'year 2 run rate -$9,405');
  near(a.twoYearValue, -57675, 'two-year value -$57,675');
  is(a.cashFreed, 0, 'frees no cash');
  same([a.gates.cost.pass, a.gates['return'].pass, a.gates.effort.pass, a.gates.potential.pass], [true, true, false, false],
    'passes Cost and Return, fails Effort (and Potential: nobody owns the time)');
  is(a.verdict, 'NO', 'verdict NO');
  is(a.firstNo, 'effort', 'the first NO is at Effort');
  ok(/never pays back/.test(a.gates.effort.reason), 'the Effort reason says it never pays back', a.gates.effort.reason);

  section('3. Candidate B: meeting-notes summaries (the easy one)');
  var b = G.evaluate(EXAMPLES[1], BRIEF);
  near(b.pricePerRun, 0.00045, 'runs on the small tier at $0.00045 a run');
  is(b.returnPerYear, 5000, 'return is exactly $5,000 a year');
  near(b.costPerYear, 2880.45, 'cost $2,880.45 a year ($0.45 of runs + $2,880 of licences)');
  near(b.costShareOfReturn, 0.57609, 'cost is 57.6% of return, over the 30% limit');
  is(b.effortOnce, 900, 'one-time effort $900');
  is(b.effortPerYear, 900, 'upkeep $900 a year');
  near(b.paybackWeeks, 38.3748, 'payback about 38 weeks', 0.001);
  near(b.year1Net, 319.55, 'year 1 net $319.55');
  near(b.year2RunRate, 1219.55, 'year 2 run rate $1,219.55');
  near(b.twoYearValue, 1539.10, 'two-year value $1,539.10');
  same([b.gates.cost.pass, b.gates['return'].pass, b.gates.effort.pass, b.gates.potential.pass], [false, true, false, false],
    'fails Cost; Return passes (exactly at the $5,000 floor); also fails Effort and Potential');
  is(b.verdict, 'NO', 'verdict NO');
  is(b.firstNo, 'cost', 'the first NO is at Cost');
  ok(/58%/.test(b.gates.cost.reason) && /30%/.test(b.gates.cost.reason), 'the Cost reason names 58% against the 30% limit', b.gates.cost.reason);

  section('3. Candidate C: invoice follow-up reminders (the boring one)');
  var c = G.evaluate(EXAMPLES[2], BRIEF);
  near(c.hoursFreedPerYear, 300, 'frees 300 hours a year');
  is(c.returnPerYear, 9000, 'return $9,000 a year');
  near(c.costPerYear, 1.35, 'cost $1.35 a year');
  is(c.effortOnce, 2250, 'one-time effort $2,250');
  is(c.effortPerYear, 1350, 'upkeep $1,350 a year');
  near(c.paybackWeeks, 15.2968, 'payback about 15.3 weeks', 0.001);
  is(Math.round(c.paybackWeeks), 15, 'which is about 15 weeks');
  near(c.year1Net, 5398.65, 'year 1 net $5,398.65');
  near(c.year2RunRate, 12147.975, 'year 2 run rate $12,147.98');
  near(c.twoYearValue, 17546.625, 'two-year value $17,546.63');
  is(C.aboutMoney(c.twoYearValue), '$17,500', 'which is about $17,500');
  near(c.cashFreed, 109589.04, 'frees $109,589 of cash (2 days of a $20M year)', 0.01);
  is(C.aboutMoney(c.cashFreed), '$109,600', 'which is about $109,600');
  same([c.gates.cost.pass, c.gates['return'].pass, c.gates.effort.pass, c.gates.potential.pass], [true, true, true, true], 'passes all four gates');
  is(c.verdict, 'YES', 'verdict YES');
  is(c.firstNo, null, 'no failing gate');
  near(c.year1Net + c.year2RunRate, c.twoYearValue, 'twoYearValue = year1Net + year2RunRate');
  ok(Math.abs((c.returnPerYear - c.costPerYear - c.effortOnce - c.effortPerYear) - c.year1Net) < 1e-9, 'year1Net = RETURN - COST - EFFORTone - EFFORTyear');
  ok(c.cashFreed > 0 && Math.abs(c.returnPerYear - c.laborValue) < 1e-9, 'cash freed is reported separately and is not added to yearly return');

  section('3. Result shape');
  var required = ['laborValue', 'capacityValue', 'hoursFreedPerYear', 'cashFreed', 'returnPerYear', 'costPerYear',
    'effortOnce', 'effortPerYear', 'year1Net', 'paybackWeeks', 'year2RunRate', 'twoYearValue'];
  ok(required.every(function (k) { return typeof c[k] === 'number' && c[k] === c[k]; }), 'every intermediate value is present and is a number');
  same(Object.keys(c.gates), ['cost', 'return', 'effort', 'potential'], 'gates are cost, return, effort, potential, in that order');
  ok(Object.keys(c.gates).every(function (k) {
    var g = c.gates[k];
    return typeof g.pass === 'boolean' && typeof g.metric === 'number' && typeof g.rule === 'string' && g.rule.length > 10 &&
      typeof g.reason === 'string' && g.reason.length > 10;
  }), 'each gate has pass (true/false), metric (number), rule and reason (sentences)');
  same(G.ORDER, ['cost', 'return', 'effort', 'potential'], 'Gates.ORDER lists the screening order');
  ok(/30%/.test(c.gates.cost.rule) && /\$5,000/.test(c.gates['return'].rule) && /26 weeks/.test(c.gates.effort.rule) && /1/.test(c.gates.potential.rule),
    'each rule sentence states its house-rule threshold');
  var stricter = G.evaluate(EXAMPLES[2], briefWith({ houseRules: { maxPaybackWeeks: 12 } }));
  ok(!stricter.gates.effort.pass && stricter.firstNo === 'effort' && /12 weeks/.test(stricter.gates.effort.rule),
    'changing a house rule changes the verdict and the rule sentence (12-week payback: C gets NO at Effort)');
  var richer = G.evaluate(EXAMPLES[1], briefWith({ rates: { loadedHourly: 60 } }));
  is(richer.returnPerYear, 10000, 'changing the hourly rate changes the return (B at $60 an hour returns $10,000)');
  near(G.evaluate(EXAMPLES[0], briefWith({ tokens: { in: 4000, out: 1000 } })).pricePerRun, 0.072, 'changing the task size changes the price per run');
  is(G.evaluate(EXAMPLES[1], { loadedHourly: 60 }).assumptions.rates.loadedHourly, 60, 'assumptions may also be given flat ({ loadedHourly: 60 })');

  section('3. Let the math pick: rank()');
  var input = JSON.parse(JSON.stringify(EXAMPLES));
  var ranked = G.rank(input, BRIEF);
  same(ranked.map(function (r) { return r.id; }), ['reminders', 'notes', 'chatbot'], 'order: reminders (survivor), then notes, then chatbot');
  same(ranked.map(function (r) { return r.verdict; }), ['YES', 'NO', 'NO'], 'verdicts: YES, NO, NO');
  same(ranked.map(function (r) { return r.winner; }), [true, false, false], 'the boring one wins');
  same(ranked.map(function (r) { return r.place; }), [1, 2, 3], 'places 1, 2, 3');
  same(input, EXAMPLES, 'rank() does not change the candidates it is given');
  var twoSurvivors = G.rank([baseCandidate({ id: 'small-win', runsPerWeek: 40 }), EXAMPLES[0], baseCandidate({ id: 'big-win', runsPerWeek: 200 })], BRIEF);
  same(twoSurvivors.map(function (r) { return r.id; }), ['big-win', 'small-win', 'chatbot'], 'among survivors the higher two-year value comes first; a NO never outranks a YES');
  var noSurvivors = G.rank([EXAMPLES[0], EXAMPLES[1]], BRIEF);
  ok(noSurvivors.every(function (r) { return r.winner === false; }), 'when nothing survives, nobody wins');
  var tagged = G.evaluate(Object.assign({ colour: 'teal', note: 'mine' }, EXAMPLES[2]), BRIEF);
  same([tagged.candidate.colour, tagged.candidate.note, tagged.candidate.pitch], ['teal', 'mine', 'The boring one'],
    'extra fields on a candidate are carried through to result.candidate');
  same(G.rank([], BRIEF), [], 'rank([]) is an empty list');
  same(G.rank(null, BRIEF), [], 'rank(null) is an empty list');

  section('3. Service lens');
  var service = { id: 'svc', lens: 'service', minutesPerRun: 30, runsPerWeek: 20, tier: 'code', buildHours: 10, growth: 1,
    ownerNamed: true, billableMarginPerHour: 80, daysOffCashCycle: 3, touchesCashPath: true };
  var s0 = G.evaluate(Object.assign({}, service, { capacityConversion: 0 }), BRIEF);
  near(s0.hoursFreedPerYear, 500, 'service example frees 500 hours a year');
  is(s0.capacityValue, 0, 'capacityConversion 0: capacity value is $0');
  is(s0.returnPerYear, 15000, 'capacityConversion 0: return falls back to labor value, $15,000');
  var s1 = G.evaluate(Object.assign({}, service, { capacityConversion: 1 }), BRIEF);
  near(s1.capacityValue, 40000, 'capacityConversion 1: capacity value is 500 hours x $80 = $40,000');
  near(s1.returnPerYear, 40000, 'capacityConversion 1: return is the larger of the two, $40,000 (not $55,000: hours are not counted twice)');
  var sQuarter = G.evaluate(Object.assign({}, service, { capacityConversion: 0.25 }), BRIEF);
  near(sQuarter.capacityValue, 10000, 'capacityConversion 0.25: capacity value $10,000');
  is(sQuarter.returnPerYear, 15000, 'capacityConversion 0.25: labor value is larger, so return is $15,000');
  is(s1.cashFreed, 0, 'the service lens frees no cash-cycle money, whatever daysOffCashCycle says');
  var sOver = G.evaluate(Object.assign({}, service, { capacityConversion: 7 }), BRIEF);
  ok(sOver.capacityValue === 0 && sOver.warnings.length === 1 && sOver.gates['return'].blocked && sOver.verdict === 'NO',
    'capacityConversion above 1 is not quietly treated as 1: it is reported and Return cannot pass', show(sOver.warnings));
  is(G.evaluate(Object.assign({}, service, { lens: 'product', capacityConversion: 1 }), BRIEF).capacityValue, 0, 'the product lens has no capacity value');

  section('3. Gate boundaries');
  // RETURN: under the floor is NO unless it takes days off the cash cycle.
  // Being on the cash path is not enough on its own: cash has to arrive sooner.
  var small = baseCandidate({ minutesPerRun: 2, runsPerWeek: 10, touchesCashPath: false, daysOffCashCycle: 0, buildHours: 1, rolloutHours: 0, upkeepHoursPerMonth: 0 });
  var smallOff = G.evaluate(small, BRIEF);
  is(smallOff.returnPerYear, 500, 'a $500-a-year task');
  ok(!smallOff.gates['return'].pass && smallOff.firstNo === 'return', 'is NO at Return when it is off the cash path');
  var smallOnNoDays = G.evaluate(Object.assign({}, small, { touchesCashPath: true, daysOffCashCycle: 0 }), BRIEF);
  ok(!smallOnNoDays.gates['return'].pass && smallOnNoDays.firstNo === 'return',
    'on the cash path with 0 days off the cash cycle, a small return is still NO at Return', smallOnNoDays.gates['return'].reason);
  is(smallOnNoDays.gates['return'].reason,
    'It returns $500 a year, under the $5,000 floor. It is on the cash path, but it does not get cash in any sooner.',
    'and the reason says so in plain words');
  var smallOnMissing = G.evaluate(Object.assign({}, small, { touchesCashPath: true, daysOffCashCycle: undefined }), BRIEF);
  ok(!smallOnMissing.gates['return'].pass, 'on the cash path with the days left blank, a small return is NO at Return');
  var smallOneDay = G.evaluate(Object.assign({}, small, { touchesCashPath: true, daysOffCashCycle: 1 }), BRIEF);
  ok(smallOneDay.gates['return'].pass, 'one day off the cash cycle and a small return passes Return', smallOneDay.gates['return'].reason);
  is(smallOneDay.gates['return'].reason,
    'It returns $500 a year, under the $5,000 floor, but it gets cash in 1 day sooner, so it stays in.',
    'and the reason names the day');
  is(smallOneDay.gates['return'].metricText, '$500 a year, cash 1 day sooner', 'and the metric text shows the day');
  ok(G.evaluate(Object.assign({}, small, { touchesCashPath: false, daysOffCashCycle: 2 }), BRIEF).gates['return'].pass,
    'cash days count even when the cash-path box was left unticked (the rule is the days)');
  var serviceDays = G.evaluate(Object.assign({}, small, { lens: 'service', capacityConversion: 0, billableMarginPerHour: 0, touchesCashPath: true, daysOffCashCycle: 3 }), BRIEF);
  ok(!serviceDays.gates['return'].pass, 'a service candidate has no cash days, so a small return is NO at Return whatever the days field says');
  is(smallOff.gates['return'].rule, 'NO when yearly return is under $5,000 and it takes no days off the cash cycle.', 'the Return rule sentence names cash days, not the cash path');
  // The real project, on minutes alone: 15.4 hours a year at the loaded rate,
  // on the cash path but no days off the cash cycle (the slotting scorecard).
  var slotLike = G.evaluate({ id: 'slotting', name: 'Slotting', lens: 'product', tier: 'code', minutesPerRun: 15.4 * 60 / BRIEF.rates.workWeeks,
    runsPerWeek: 1, touchesCashPath: true, daysOffCashCycle: 0, growth: 1, ownerNamed: true }, BRIEF);
  ok(slotLike.hoursFreedPerYear === 15.4 && slotLike.returnPerYear === 462, 'a slotting-like candidate: 15.4 hours a year at $30 an hour is $462 a year',
    slotLike.hoursFreedPerYear + ' h, ' + slotLike.returnPerYear);
  ok(slotLike.gates.cost.pass && !slotLike.gates['return'].pass && slotLike.firstNo === 'return' && slotLike.verdict === 'NO',
    'and it is NO at Return: on the cash path, but no days off the cash cycle', slotLike.summary);
  is(slotLike.gates['return'].metricText, '$462 a year', 'and the Return figure reads $462 a year');
  // COST: exactly 30% passes, a dollar more fails.
  var atLimit = G.evaluate(baseCandidate({ minutesPerRun: 10, runsPerWeek: 20, tier: 'code', toolsPerMonth: 125 }), BRIEF);
  ok(atLimit.costPerYear === 1500 && atLimit.returnPerYear === 5000 && atLimit.gates.cost.pass, 'cost at exactly 30% of return passes ("more than 30%" is the rule)');
  ok(!G.evaluate(baseCandidate({ minutesPerRun: 10, runsPerWeek: 20, tier: 'code', toolsPerMonth: 126 }), BRIEF).gates.cost.pass, 'cost just over 30% of return fails');
  // EFFORT: exactly 26 weeks passes, a little more fails.
  var paybackCase = { minutesPerRun: 8, runsPerWeek: 26, tier: 'code', buildHours: 26, growth: 1, ownerNamed: true };
  var at26 = G.evaluate(paybackCase, briefWith({ rates: { builderHourly: 100 } }));
  ok(at26.paybackWeeks === 26 && at26.gates.effort.pass, 'payback of exactly 26 weeks passes ("longer than 26 weeks" is the rule)', 'payback ' + at26.paybackWeeks);
  var over26 = G.evaluate(Object.assign({}, paybackCase, { buildHours: 26.4 }), briefWith({ rates: { builderHourly: 100 } }));
  ok(!over26.gates.effort.pass, 'payback of 26.4 weeks fails');
  ok(/26\.4 weeks/.test(over26.gates.effort.reason), 'and the reason shows 26.4, not a rounded 26 that would look like a pass', over26.gates.effort.reason);
  // POTENTIAL
  var shrinking = G.evaluate(baseCandidate({ growth: 0.8 }), BRIEF);
  ok(!shrinking.gates.potential.pass && shrinking.firstNo === 'potential', 'growth below 1 is NO at Potential');
  ok(G.evaluate(baseCandidate({ growth: 1 }), BRIEF).gates.potential.pass, 'growth of exactly 1 passes Potential');
  var noOwner = G.evaluate(baseCandidate({ ownerNamed: false }), BRIEF);
  ok(!noOwner.gates.potential.pass && noOwner.firstNo === 'potential', 'no owner for the freed time is NO at Potential');
  ok(/nobody owns/.test(noOwner.gates.potential.reason), 'and the reason says nobody owns the freed time', noOwner.gates.potential.reason);
  // firstNo follows the screening order even when several gates fail.
  is(G.evaluate(baseCandidate({ toolsPerMonth: 5000, growth: 0.5, ownerNamed: false }), BRIEF).firstNo, 'cost', 'with several failing gates, firstNo is the earliest in cost, return, effort, potential');

  section('3. Tiers inside the gate math');
  var onCode = G.evaluate(baseCandidate({ tier: 'code', toolsPerMonth: 10 }), BRIEF);
  is(onCode.pricePerRun, 0, 'a tier of plain code costs $0 a run');
  is(onCode.costPerYear, 120, 'so yearly cost is only the tools: $120');
  var tierIds = C.tiers(BRIEF_TOKENS).map(function (t) { return t.id; });
  ok(tierIds.every(function (id) {
    var r = G.evaluate(baseCandidate({ tier: id }), BRIEF);
    return Math.abs(r.pricePerRun - C.tier(id, BRIEF_TOKENS).pricePerRun) < 1e-15 && r.tier === id;
  }), 'every tier id gives the candidate the price per run from CostMath.tiers()');
  var unknown = G.evaluate(baseCandidate({ tier: 'quantum' }), BRIEF);
  ok(unknown.pricePerRun === 0 && unknown.warnings.length === 1, 'an unknown tier is priced at $0 and says so in warnings', show(unknown.warnings));

  section('3. Edge cases never produce NaN');
  var edgeCases = {
    'zero runs': baseCandidate({ runsPerWeek: 0 }),
    'zero minutes (zero return)': baseCandidate({ minutesPerRun: 0 }),
    'zero return with a licence to pay': baseCandidate({ minutesPerRun: 0, toolsPerMonth: 100 }),
    'growth below 1': baseCandidate({ growth: 0.5 }),
    'growth of zero': baseCandidate({ growth: 0 }),
    'no owner': baseCandidate({ ownerNamed: false }),
    'service lens, capacityConversion 0': { lens: 'service', minutesPerRun: 30, runsPerWeek: 20, tier: 'small', capacityConversion: 0, billableMarginPerHour: 80, ownerNamed: true },
    'service lens, capacityConversion 1': { lens: 'service', minutesPerRun: 30, runsPerWeek: 20, tier: 'small', capacityConversion: 1, billableMarginPerHour: 80, ownerNamed: true },
    'service lens, nothing else filled in': { lens: 'service' },
    'a tier of plain code': baseCandidate({ tier: 'code' }),
    'no tier at all': baseCandidate({ tier: undefined }),
    'unknown tier': baseCandidate({ tier: 'nope' }),
    'no build effort and no upkeep': baseCandidate({ buildHours: 0, rolloutHours: 0, upkeepHoursPerMonth: 0 }),
    'no build effort, losing money': baseCandidate({ buildHours: 0, rolloutHours: 0, upkeepHoursPerMonth: 0, toolsPerMonth: 5000 }),
    'empty candidate {}': {},
    'null candidate': null,
    'undefined candidate': undefined,
    'numbers typed as text': { minutesPerRun: '6', runsPerWeek: '60', tier: 'small', buildHours: '24', rolloutHours: '6', upkeepHoursPerMonth: '1.5', growth: '1.5', touchesCashPath: 'true', daysOffCashCycle: '2', ownerNamed: 'yes' },
    'garbage text in number fields': { minutesPerRun: 'lots', runsPerWeek: 'abc', tier: 'small', buildHours: '', growth: 'x', toolsPerMonth: null },
    'negative numbers': baseCandidate({ minutesPerRun: -5, runsPerWeek: -3, toolsPerMonth: -100, buildHours: -1, growth: -2, daysOffCashCycle: -4 }),
    'NaN and Infinity as inputs': baseCandidate({ minutesPerRun: NaN, runsPerWeek: Infinity, buildHours: -Infinity, growth: NaN, upkeepHoursPerMonth: Infinity }),
    'absurdly large numbers': baseCandidate({ minutesPerRun: 1e300, runsPerWeek: 1e300, toolsPerMonth: 1e300, buildHours: 1e300, upkeepHoursPerMonth: 1e300, growth: 1e300, daysOffCashCycle: 1e300 })
  };
  var assumptionCases = {
    'the brief defaults': BRIEF,
    'no assumptions passed': undefined,
    'zero work weeks': briefWith({ rates: { workWeeks: 0 } }),
    'zero hourly rates': briefWith({ rates: { loadedHourly: 0, builderHourly: 0 } }),
    'zero revenue': briefWith({ company: { annualRevenue: 0 } }),
    'zero tokens': briefWith({ tokens: { in: 0, out: 0 } }),
    'house rules all zero': briefWith({ houseRules: { costMaxShareOfReturn: 0, minReturnPerYear: 0, maxPaybackWeeks: 0, minGrowth: 0 } }),
    'garbage assumptions': { rates: { loadedHourly: 'abc', builderHourly: NaN, workWeeks: -1 }, company: { annualRevenue: null }, tokens: { in: 'x' }, houseRules: { maxPaybackWeeks: Infinity } }
  };
  var allowedInfinite = { paybackWeeks: true, costShareOfReturn: true };
  Object.keys(edgeCases).forEach(function (caseName) {
    var problems = [];
    Object.keys(assumptionCases).forEach(function (assumptionName) {
      var r;
      try {
        r = G.evaluate(edgeCases[caseName], assumptionCases[assumptionName]);
      } catch (e) {
        problems.push('[' + assumptionName + '] threw: ' + e.message);
        return;
      }
      findNaN(r).forEach(function (p) { problems.push('[' + assumptionName + '] NaN at ' + p); });
      findBadText(r).forEach(function (p) { problems.push('[' + assumptionName + '] bad text at ' + p); });
      Object.keys(r).forEach(function (k) {
        if (typeof r[k] === 'number' && !isFinite(r[k]) && !allowedInfinite[k]) problems.push('[' + assumptionName + '] ' + k + ' is ' + r[k]);
      });
      if (r.verdict !== 'YES' && r.verdict !== 'NO') problems.push('[' + assumptionName + '] verdict is ' + r.verdict);
      var failing = G.ORDER.filter(function (id) { return !r.gates[id].pass; });
      if ((failing[0] || null) !== r.firstNo) problems.push('[' + assumptionName + '] firstNo ' + r.firstNo + ' does not match the gates');
      if ((r.verdict === 'YES') !== (failing.length === 0)) problems.push('[' + assumptionName + '] verdict does not match the gates');
    });
    ok(problems.length === 0, caseName + ': no NaN, no broken wording, verdict consistent (' + Object.keys(assumptionCases).length + ' sets of assumptions)', problems.slice(0, 4).join('\n        '));
  });

  var zeroRuns = G.evaluate(baseCandidate({ runsPerWeek: 0, toolsPerMonth: 50 }), BRIEF);
  same([zeroRuns.returnPerYear, zeroRuns.costPerYear, zeroRuns.verdict], [0, 600, 'NO'], 'zero runs: return $0, cost is the licence alone, verdict NO');
  is(zeroRuns.paybackWeeks, Infinity, 'zero runs: payback never (Infinity, not NaN)');
  is(zeroRuns.costShareOfReturn, Infinity, 'zero return with a cost: cost share is Infinity (not NaN)');
  is(G.evaluate({}, BRIEF).costShareOfReturn, 0, 'zero return and zero cost: cost share is 0 (not NaN)');
  var nothingToBuild = G.evaluate(baseCandidate({ buildHours: 0, rolloutHours: 0 }), BRIEF);
  ok(nothingToBuild.paybackWeeks === 0 && nothingToBuild.gates.effort.pass, 'nothing to build: payback is 0 weeks and Effort passes');
  var typed = G.evaluate(edgeCases['numbers typed as text'], BRIEF);
  near(typed.twoYearValue, 17546.625, 'numbers typed as text give the same answer as numbers');
  is(G.evaluate(baseCandidate({ ownerNamed: 'false' }), BRIEF).gates.potential.pass, false, 'the text "false" for ownerNamed means false');
}


/* =============================================================================
 * 4. The speaker's file
 * ========================================================================== */
function testYour(YOUR, G, C) {
  section('4. your-numbers.js: shape');
  var speaker = YOUR.speaker || {};
  same([speaker.name, speaker.role, speaker.company, speaker.companyLine],
    ['Dustin T Hughes', 'VP of Technology', 'Laborde Products', 'Marine diesel distributor ' + MIDDOT + ' 95 people ' + MIDDOT + ' 3 locations'],
    'speaker: name, role, company, companyLine');
  ok(YOUR.event && typeof YOUR.event.name === 'string' && YOUR.event.name.length > 0, 'event has a name');
  ok(['loadedHourly', 'builderHourly', 'workWeeks'].every(function (k) { return typeof YOUR.rates[k] === 'number' && YOUR.rates[k] >= 0; }), 'rates are three usable numbers');
  ok(typeof YOUR.company.annualRevenue === 'number' && YOUR.company.annualRevenue >= 0 && typeof YOUR.company.label === 'string', 'company has annualRevenue and a label');
  ok(typeof YOUR.tokens['in'] === 'number' && typeof YOUR.tokens.out === 'number', 'tokens has in and out');
  ok(['costMaxShareOfReturn', 'minReturnPerYear', 'maxPaybackWeeks', 'minGrowth'].every(function (k) { return typeof YOUR.houseRules[k] === 'number'; }), 'houseRules has its four numbers');
  ok(typeof YOUR.links.screenerUrl === 'string' && typeof YOUR.links.repoUrl === 'string', 'links has screenerUrl and repoUrl (text, may be empty)');
  ok(Array.isArray(YOUR.story.howWeBuiltIt), 'story.howWeBuiltIt is a list');
  ok(YOUR.slotting && typeof YOUR.slotting === 'object' && YOUR.slotting.sim && typeof YOUR.slotting.sim === 'object',
    'slotting is present with a sim block (its contents belong to the slotting task, not to these libraries)');
  ok(Array.isArray(YOUR.candidates) && YOUR.candidates.length >= 1, 'candidates is a non-empty list');
  var ids = YOUR.candidates.map(function (c) { return c.id; });
  ok(ids.every(function (id, i) { return typeof id === 'string' && id && ids.indexOf(id) === i; }), 'every candidate has its own id');
  var tierIds = C.tierIds();
  ok(YOUR.candidates.every(function (c) { return tierIds.indexOf(c.tier) !== -1; }), 'every candidate names a known tier (' + tierIds.join(', ') + ')');

  // Slips that are easy to make and silently change every verdict.
  ok(YOUR.houseRules.costMaxShareOfReturn >= 0 && YOUR.houseRules.costMaxShareOfReturn <= 1,
    'houseRules.costMaxShareOfReturn is a share between 0 and 1', 'write 0.30 for 30%, not 30');
  ok(YOUR.rates.workWeeks <= 52, 'rates.workWeeks is at most 52');
  ok(YOUR.candidates.every(function (c) { return c.capacityConversion === undefined || (c.capacityConversion >= 0 && c.capacityConversion <= 1); }),
    'every capacityConversion is a share between 0 and 1', 'write 0.5 for 50%, not 50');
  ok(YOUR.candidates.every(function (c) { return c.lens === 'product' || c.lens === 'service'; }), 'every candidate has a lens of product or service');

  section('4. your-numbers.js: runs cleanly through the gates');
  var ranked = G.rank(YOUR.candidates);
  ok(findNaN(ranked).length === 0, 'no NaN anywhere in the results for your candidates', findNaN(ranked).slice(0, 3).join(', '));
  ok(ranked.every(function (r) { return r.warnings.length === 0; }), 'no warnings for your candidates', show(ranked.map(function (r) { return r.warnings; })));
  var inForce = G.defaultAssumptions();
  var mismatched = [];
  Object.keys(BRIEF).forEach(function (group) {
    Object.keys(BRIEF[group]).forEach(function (key) {
      if (group === 'company' && key === 'label') return;    // the label is checked on its own, in "The company label follows the revenue"
      if (inForce[group][key] !== YOUR[group][key]) mismatched.push(group + '.' + key);
    });
  });
  ok(mismatched.length === 0, 'Gates.defaultAssumptions() carries every rate, the example revenue, the token counts and every house rule from your-numbers.js', mismatched.join(', '));
  same(C.tokens(), YOUR.tokens, 'CostMath uses your task size by default');
  is(G.minuteRule(), YOUR.rates.workWeeks * YOUR.rates.loadedHourly / 60, 'minuteRule() with no arguments uses your rates');
  near(G.cashPerDay(), YOUR.company.annualRevenue / 365, 'cashPerDay() with no arguments uses your example revenue');
  var edited = G.defaultAssumptions();
  edited.rates.loadedHourly = 12345;
  ok(G.defaultAssumptions().rates.loadedHourly === YOUR.rates.loadedHourly, 'defaultAssumptions() hands out a fresh copy each time');

  section('4. your-numbers.js: still what shipped?');
  var shippedAssumptions = JSON.stringify(G.defaultAssumptions()) === JSON.stringify(BRIEF);
  if (shippedAssumptions) {
    ok(true, 'rates, company, tokens and house rules are the brief\'s defaults');
    is(G.minuteRule(), 25, 'so minuteRule() is exactly 25');
  } else {
    note('rates, company, tokens or house rules in your-numbers.js differ from the brief\'s defaults. Fine if you meant to change them.');
  }
  var shippedCandidates = YOUR.candidates.length === EXAMPLES.length && EXAMPLES.every(function (example, i) {
    return Object.keys(example).every(function (key) { return YOUR.candidates[i][key] === example[key]; });
  });
  if (shippedCandidates) {
    ok(true, 'the three example candidates are exactly as specified (chatbot, notes, reminders)');
  } else {
    note('the candidates in your-numbers.js differ from the three shipped examples. Fine if you swapped in your own.');
  }
  if (shippedAssumptions && shippedCandidates) {
    same(ranked.map(function (r) { return [r.id, r.verdict, r.firstNo]; }),
      [['reminders', 'YES', null], ['notes', 'NO', 'cost'], ['chatbot', 'NO', 'effort']],
      'as shipped: reminders YES; notes NO at Cost; chatbot NO at Effort');
    near(ranked[0].twoYearValue, 17546.625, 'as shipped: the winner\'s two-year value is $17,546.63');
  }
}


/* =============================================================================
 * 5a. Loading rules, checked without a browser
 * ========================================================================== */
function testLoading(YOUR, BENCHLM) {
  section('5. Offline contract (static checks on the four deck files)');
  Object.keys(FILES).forEach(function (key) {
    var rel = path.relative(ROOT, FILES[key]);
    var src = fs.readFileSync(FILES[key], 'utf8');
    var problems = [];
    if (/\bfetch\s*\(/.test(src)) problems.push('uses fetch()');
    if (/XMLHttpRequest/.test(src)) problems.push('uses XMLHttpRequest');
    if (/^\s*(import|export)\s/m.test(src)) problems.push('uses ES module syntax');
    if (/\bdocument\s*\./.test(src)) problems.push('touches document');
    if (/https?:\/\//.test(src)) problems.push('contains a web address');
    ok(problems.length === 0, rel + ': no fetch, no XHR, no ES modules, no DOM, no web addresses', problems.join(', '));
  });
  ['data', 'cost', 'gates'].forEach(function (key) {
    var src = fs.readFileSync(FILES[key], 'utf8');
    ok(/^[\x00-\x7F]*$/.test(src), path.relative(ROOT, FILES[key]) + ': source is plain ASCII (safe under any page encoding)');
  });

  section('5. Classic-script loading with a window but no document (Node vm)');
  function load(order, extraWindow) {
    var sandbox = { window: extraWindow || {} };
    vm.createContext(sandbox);
    order.forEach(function (key) {
      vm.runInContext(fs.readFileSync(FILES[key], 'utf8'), sandbox, { filename: FILES[key] });
    });
    return sandbox.window;
  }
  var w;
  try {
    w = load(['your', 'data', 'cost', 'gates']);
    ok(w.YOUR && w.BENCHLM && w.CostMath && w.Gates, 'all four attach to window with no document, module or require present');
    same(w.Gates.rank(w.YOUR.candidates).map(function (r) { return [r.id, r.verdict, r.twoYearValue]; }),
      require(FILES.gates).rank(YOUR.candidates).map(function (r) { return [r.id, r.verdict, r.twoYearValue]; }),
      'window-loaded libraries give the same ranking as the Node modules');
  } catch (e) {
    ok(false, 'libraries load as classic scripts', e.stack);
  }
  try {
    var reversed = load(['gates', 'cost', 'data', 'your']);
    is(reversed.Gates.rank(reversed.YOUR.candidates).length, YOUR.candidates.length, 'script order does not matter (loaded in reverse and still works)');
  } catch (e2) {
    ok(false, 'libraries load in reverse order', e2.stack);
  }
  try {
    var bare = load(['data', 'cost', 'gates']);
    same(bare.CostMath.tokens(), { in: 2000, out: 500 }, 'without your-numbers.js, the task size falls back to 2,000 in / 500 out');
    same(bare.Gates.defaultAssumptions(), BRIEF, 'without your-numbers.js, Gates falls back to the brief\'s defaults');
    is(bare.Gates.minuteRule(), 25, 'without your-numbers.js, minuteRule() is exactly 25');
    near(bare.CostMath.breakEvenSeconds('GPT-5.5 Pro'), 18, 'without your-numbers.js, break-even uses $30 an hour: 18 seconds');
  } catch (e3) {
    ok(false, 'libraries work without your-numbers.js', e3.stack);
  }
  try {
    var broken = load(['data', 'cost', 'gates'], { YOUR: { rates: { loadedHourly: 'abc', workWeeks: -5 }, tokens: { in: NaN }, houseRules: null, company: 'oops' } });
    same(broken.Gates.defaultAssumptions(), BRIEF, 'a your-numbers.js full of bad values falls back to the defaults, value by value');
    ok(findNaN(broken.Gates.rank(EXAMPLES)).length === 0, 'and still produces no NaN');
  } catch (e4) {
    ok(false, 'libraries survive a broken your-numbers.js', e4.stack);
  }
  try {
    // A made-up price list, to pin down the frontier rule itself: a model is out
    // only when something at the same or a lower price has a HIGHER score.
    var entry = function (name, score, price) {
      return { rank: 0, name: name, overallScore: score, estimated: false, inputPrice: price, outputPrice: price,
        priceStatus: price === null ? 'blank' : (price === 0 ? 'zero-listed' : 'priced') };
    };
    var madeUp = load(['cost'], { BENCHLM: { meta: {}, models: [
      entry('Twin A', 50, 1), entry('Twin B', 50, 1),      // same price, same score: neither outscores the other
      entry('Dearer and worse', 40, 2),                    // beaten by the twins
      entry('Top', 60, 3), entry('Same price as Top, lower score', 55, 3),
      entry('No price', 99, null), entry('Listed at zero', 99, 0)
    ] } }).CostMath;
    same(names(madeUp.frontier()), ['Twin A', 'Twin B', 'Top'], 'frontier rule on a made-up list: ties stay, anything outscored at the same or a lower price goes');
    is(madeUp.dominatedCount(), 2, 'frontier rule on a made-up list: two are dominated');
    same(madeUp.counts(), { rows: 7, priced: 5, blank: 1, zeroListed: 1, estimated: 0 }, 'made-up list: unpriced and $0 rows are counted but kept out of price math');
    near(madeUp.spread().ratio, 3, 'made-up list: spread is 3 times');
  } catch (e7) {
    ok(false, 'frontier rule on a made-up list', e7.stack);
  }
  try {
    var noData = load(['cost', 'gates']);
    var message = '';
    try { noData.CostMath.priced(); } catch (e5) { message = e5.message; }
    ok(/benchlm-data\.js/.test(message), 'without the data file, CostMath says exactly which file is missing', message);
  } catch (e6) {
    ok(false, 'libraries load without the data file', e6.stack);
  }
  is(JSON.stringify(require(FILES.data)), JSON.stringify(BENCHLM), 'the Node module and the test agree on the data');
}


/* =============================================================================
 * 5b. A real browser, from file://
 * ========================================================================== */

/*
 * One picture of everything the libraries compute. It runs unchanged in Node
 * and (as text) inside the browser page, and the two results must be
 * identical. Infinity is written as text so it survives JSON.
 */
function snapshot(BENCHLM, CostMath, Gates, YOUR) {
  function clean(key, value) {
    return (typeof value === 'number' && !isFinite(value)) ? String(value) : value;
  }
  var s = CostMath.spread();
  var service = { id: 'svc', lens: 'service', minutesPerRun: 30, runsPerWeek: 20, tier: 'mid', buildHours: 10, growth: 1.2,
    ownerNamed: true, capacityConversion: 0.6, billableMarginPerHour: 80 };
  var out = {
    benchlm: BENCHLM,
    your: YOUR,
    tokens: CostMath.tokens(),
    counts: CostMath.counts(),
    priced: CostMath.priced().map(function (m) { return [m.name, m.pricePerRun]; }),
    spread: [s.cheapest.name, s.cheapestPrice, s.dearest.name, s.dearestPrice, s.ratio],
    frontier: CostMath.frontier().map(function (m) { return m.name; }),
    dominatedCount: CostMath.dominatedCount(),
    tiers: CostMath.tiers(),
    breakEven: CostMath.priced().map(function (m) { return CostMath.breakEvenSeconds(m); }),
    steps: [CostMath.stepComparison('Claude Haiku 5.5', 'Gemini 4 Carbon'), CostMath.stepComparison('Gemini 4 Carbon', 'Claude Fable 5.2')],
    formats: [0, 0.00045, 0.45, 45, 3600, 15000, -48270, 1.005, 1e21].map(CostMath.money)
      .concat([333.33, 1.5, 0.0125].map(CostMath.ratio)).concat([0.218, 0.00015, -0.004].map(CostMath.percent))
      .concat([CostMath.aboutMoney(54794.52), CostMath.cents(12147.975), CostMath.shortMoney(20000000), CostMath.number(0.003375)])
      .concat([18, 4.32, 0.054, Infinity, null].map(function (x) { return CostMath.seconds(x); })),
    frontierSummary: CostMath.frontierSummary(),
    tierBreakEven: CostMath.tiers().map(function (t) { return CostMath.breakEvenSeconds(t, 30); }),
    companyLabel: [Gates.companyLabel(), Gates.companyLabel({ annualRevenue: 5000000, label: 'Example: a $20M distributor' })],
    closeCalls: [
      Gates.evaluate({ tier: 'code', minutesPerRun: 6, runsPerWeek: 23, buildHours: 23, growth: 1, touchesCashPath: true, ownerNamed: true }),
      Gates.evaluate({ tier: 'code', minutesPerRun: 6, runsPerWeek: 23, buildHours: 23.03, growth: 0.999, touchesCashPath: true, ownerNamed: true }),
      Gates.evaluate({ tier: 'small', minutesPerRun: 6, runsPerWeek: 80, toolsPerMonth: '$299.85', growth: '1.5x', touchesCashPath: true, ownerNamed: 'yes' }),
      Gates.evaluate({ tier: 'small', minutesPerRun: 10, runsPerWeek: 20, toolsPerMonth: '240/mo', growth: -0.5, ownerNamed: 'maybe' }, { rates: { loadedHourly: 'thirty' } }),
      Gates.evaluate({ tier: NaN, lens: Infinity, minutesPerRun: 6, runsPerWeek: 60, growth: '150%', ownerNamed: true })
    ],
    assumptions: Gates.defaultAssumptions(),
    ranked: Gates.rank(YOUR.candidates),
    service: Gates.evaluate(service),
    empty: Gates.evaluate({}),
    minuteRule: Gates.minuteRule(),
    cashPerDay: Gates.cashPerDay()
  };
  return JSON.stringify(out, clean);
}

async function testBrowser(nodeSnapshot) {
  section('5. Real browser, loaded from file://');
  if (SKIP_BROWSER) {
    note('browser check skipped (--no-browser).');
    return;
  }
  var playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    ok(false, 'Playwright is available', 'could not load "playwright" (' + e.message + '). Install it, or run with --no-browser to skip this part.');
    return;
  }

  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-libs-'));
  var browser = null;
  try {
    browser = await playwright.chromium.launch();

    // Two pages: the natural script order, and the reverse.
    var orders = { 'natural order': ['your', 'data', 'cost', 'gates'], 'reverse order': ['gates', 'cost', 'data', 'your'] };
    var orderNames = Object.keys(orders);
    for (var i = 0; i < orderNames.length; i++) {
      var orderName = orderNames[i];
      var tags = orders[orderName].map(function (key) {
        return '<script src="' + url.pathToFileURL(FILES[key]).href + '"></script>';
      }).join('\n');
      var html = '<!doctype html>\n<html><head><meta charset="utf-8"><title>test-libs</title></head><body>\n' +
        '<script>window.__before = Object.getOwnPropertyNames(window);</script>\n' + tags + '\n</body></html>\n';
      var htmlPath = path.join(tmpDir, 'page-' + i + '.html');
      fs.writeFileSync(htmlPath, html, 'utf8');

      var page = await browser.newPage();
      var errors = [];
      var requests = [];
      page.on('pageerror', function (err) { errors.push(String(err && err.message || err)); });
      page.on('console', function (msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('request', function (req) { requests.push(req.url()); });

      var pageUrl = url.pathToFileURL(htmlPath).href;
      await page.goto(pageUrl);

      ok(/^file:\/\//.test(pageUrl) && requests.length === 5 && requests.every(function (u) { return /^file:\/\//.test(u); }),
        orderName + ': the page and its four scripts all load from file:// and nothing else is requested', show(requests));
      ok(errors.length === 0, orderName + ': no script errors', errors.join(' | '));

      var present = await page.evaluate('[typeof window.BENCHLM, typeof window.CostMath, typeof window.Gates, typeof window.YOUR]');
      same(present, ['object', 'object', 'object', 'object'], orderName + ': window.BENCHLM, CostMath, Gates and YOUR exist');

      var added = await page.evaluate('Object.getOwnPropertyNames(window).filter(function (k) { return window.__before.indexOf(k) === -1 && k !== "__before"; }).sort()');
      same(added, ['BENCHLM', 'CostMath', 'Gates', 'YOUR'], orderName + ': the scripts add exactly those four names to window and nothing else');

      var bodyChildren = await page.evaluate('document.body.querySelectorAll(":not(script)").length');
      is(bodyChildren, 0, orderName + ': loading the libraries adds nothing to the page');

      var browserSnapshot = await page.evaluate('(' + snapshot.toString() + ')(window.BENCHLM, window.CostMath, window.Gates, window.YOUR)');
      var agree = browserSnapshot === nodeSnapshot;
      var detail = '';
      if (!agree) {
        var at = 0;
        while (at < browserSnapshot.length && browserSnapshot[at] === nodeSnapshot[at]) at += 1;
        detail = 'first difference at character ' + at + '\n        node:    ...' + nodeSnapshot.slice(Math.max(0, at - 60), at + 60) +
          '\n        browser: ...' + browserSnapshot.slice(Math.max(0, at - 60), at + 60);
      }
      ok(agree, orderName + ': every number and sentence matches Node (' + nodeSnapshot.length + ' characters compared)', detail);

      var line = await page.evaluate('window.YOUR.speaker.companyLine');
      is(line, 'Marine diesel distributor ' + MIDDOT + ' 95 people ' + MIDDOT + ' 3 locations', orderName + ': accented and special characters arrive intact');

      await page.close();
    }
  } catch (err) {
    ok(false, 'browser check ran to the end', String(err && err.stack || err));
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}


/* =============================================================================
 * 6. Regressions: defects an independent review confirmed. Each stays fixed.
 * ========================================================================== */

/* A candidate on plain code that passes everything, to bend toward one limit. */
function plain(overrides) {
  var c = { lens: 'product', tier: 'code', growth: 1, touchesCashPath: true, daysOffCashCycle: 1, ownerNamed: true };
  Object.keys(overrides || {}).forEach(function (k) { c[k] = overrides[k]; });
  return c;
}

/* A small repeatable random-number source, so a failing case can be found again. */
function makeRandom(seed) {
  var state = seed;
  return function () {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/* "1,234.5" -> 1234.5 */
function plainNumber(text) {
  return Number(String(text).replace(/,/g, ''));
}

/* The dollars a money text names: "$3,600" -> 3600, "about $0" -> 0. */
function dollars(text) {
  if (/quadrillion/.test(text)) return 1e15;
  return Number(String(text).replace(/[^0-9.]/g, ''));
}

/*
 * Does every gate's sentence agree with its verdict? Reads the sentences the
 * way a person in the room would: finds the figure and the limit in the text
 * and checks that the figure sits on the side of the limit the verdict says.
 * Returns a list of complaints; an empty list means the result reads right.
 */
function wordingProblems(r) {
  var out = [];
  var rules = r.assumptions.houseRules;
  var closeTo = function (a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); };
  var bad = function (gate, what, text) { out.push(gate + ': ' + what + ' | ' + text); };

  /* "just over" / "just under" / a plain figure, against the limit as printed. */
  function side(word, shown, limit) {
    if (word === 'just over') return 'over';
    if (word === 'just under') return 'under';
    return shown > limit ? 'over' : shown < limit ? 'under' : 'equal';
  }

  // --- Cost ---
  (function () {
    var g = r.gates.cost;
    var t = g.reason;
    if (g.blocked) { if (g.pass) bad('cost', 'cannot be judged, yet passes', t); return; }
    if (t === 'It costs about $0 a year to run.') { if (!g.pass) bad('cost', 'costs nothing, yet NO', t); return; }
    if (/ and nothing comes back\.$/.test(t)) { if (g.pass) bad('cost', 'nothing comes back, yet PASS', t); return; }
    var m = /^Running it costs .+ a year, which is (just over |just under |under )?([\d,.]+)% of the .+ it returns\. The limit is ([\d,.]+)%\.$/.exec(t);
    if (!m) { bad('cost', 'sentence not understood', t); return; }
    var word = (m[1] || '').trim();
    var shown = plainNumber(m[2]);
    var limit = plainNumber(m[3]);
    if (!closeTo(limit, rules.costMaxShareOfReturn * 100)) bad('cost', 'the limit printed is not the limit set (' + rules.costMaxShareOfReturn * 100 + '%)', t);
    var says = word === 'under' ? (shown <= limit ? 'under' : 'unclear') : side(word, shown, limit);
    if (word.indexOf('just') === 0 && shown !== limit) bad('cost', '"just" is not about the limit', t);
    if (says === 'unclear') bad('cost', 'cannot tell which side of the limit', t);
    if ((says === 'over') === g.pass) bad('cost', 'the sentence says ' + says + ' the limit but the gate ' + (g.pass ? 'passes' : 'says NO'), t);
    if (g.metricText.indexOf('(' + (m[1] || '') + m[2] + '% of return)') === -1) bad('cost', 'metricText shows a different share: ' + g.metricText, t);
    if (g.rule.indexOf('more than ' + m[3] + '% of') === -1) bad('cost', 'the rule names a different limit: ' + g.rule, t);
  })();

  // --- Return ---
  (function () {
    var g = r.gates['return'];
    var t = g.reason;
    if (g.blocked) { if (g.pass) bad('return', 'cannot be judged, yet passes', t); return; }
    var forms = [
      [/^It returns (.+) a year, which just meets the (.+) floor\.$/, 'meets', true],
      [/^It returns (.+) a year\. The floor is (.+)\.$/, 'over', true],
      [/^It returns (.+) a year, under the (.+) floor, but it gets cash in (.+) sooner, so it stays in\.$/, 'under', true],
      [/^It returns (.+) a year, under the (.+) floor\. It is on the cash path, but it does not get cash in any sooner\.$/, 'under', false],
      [/^It returns (.+) a year, under the (.+) floor, and it does not get cash in any sooner\.$/, 'under', false]
    ];
    var hit = null;
    forms.forEach(function (f) { var m = f[0].exec(t); if (m && !hit) hit = { m: m, claims: f[1], pass: f[2] }; });
    // The exemption is cash days, never the cash-path tick on its own.
    var cashDays = r.candidate.lens === 'service' ? 0 : r.candidate.daysOffCashCycle;
    if (!hit) { bad('return', 'sentence not understood', t); return; }
    var figure = hit.m[1];
    var floorText = hit.m[2];
    if (!closeTo(dollars(floorText), rules.minReturnPerYear)) bad('return', 'the floor printed is not the floor set (' + rules.minReturnPerYear + ')', t);
    var j = /^(just over|just under) (.+)$/.exec(figure);
    if (j && j[2] !== floorText) bad('return', '"just" is not about the floor', t);
    var says = j ? side(j[1], 0, 0) : side('', dollars(figure), dollars(floorText));
    if (hit.claims === 'meets' ? figure !== floorText : says !== hit.claims) bad('return', 'the figure shown (' + figure + ') does not sit ' + hit.claims + ' the floor', t);
    if (g.pass !== hit.pass) bad('return', 'the sentence and the verdict disagree', t);
    var daysText = hit.m[3];
    if (daysText !== undefined) {
      if (!(cashDays > 0)) bad('return', 'stays in on cash days, but the candidate takes none off', t);
      var dm = /^([\d,.]+) (day|days)$/.exec(daysText);
      if (!dm || !closeTo(plainNumber(dm[1]), cashDays) || (dm[2] === 'day') !== (cashDays === 1)) bad('return', 'the cash days shown are not the days entered (' + cashDays + ')', t);
      if (g.metricText !== figure + ' a year, cash ' + daysText + ' sooner') bad('return', 'metricText shows a different figure: ' + g.metricText, t);
    } else {
      if (hit.claims === 'under' && cashDays > 0) bad('return', 'NO under the floor although it takes ' + cashDays + ' days off the cash cycle', t);
      if (hit.claims === 'under' && /on the cash path/.test(t) !== (r.candidate.touchesCashPath === true && r.candidate.lens !== 'service')) bad('return', 'says on the cash path or not, against the input', t);
      if (g.metricText !== figure + ' a year') bad('return', 'metricText shows a different figure: ' + g.metricText, t);
    }
    if (g.rule.indexOf('takes no days off the cash cycle') === -1) bad('return', 'the rule does not name the cash-days exemption: ' + g.rule, t);
    if (g.rule.indexOf('under ' + floorText + ' and') === -1) bad('return', 'the rule names a different floor: ' + g.rule, t);
  })();

  // --- Effort ---
  (function () {
    var g = r.gates.effort;
    var t = g.reason;
    if (g.blocked) { if (g.pass) bad('effort', 'cannot be judged, yet passes', t); return; }
    if (/^It never pays back/.test(t)) {
      if (g.pass || g.metricText !== 'never pays back') bad('effort', 'never pays back, yet PASS or a different metricText', t);
      return;
    }
    if (/^There is nothing to build/.test(t)) { if (!g.pass) bad('effort', 'nothing to pay back, yet NO', t); return; }
    var paid = /is paid back in (.+)\. The limit is ([\d,.]+) weeks?\.$/.exec(t);
    var takes = /takes (.+) to pay back\. The limit is ([\d,.]+) weeks?\.$/.exec(t);
    var m = paid || takes;
    if (!m) { bad('effort', 'sentence not understood', t); return; }
    var figure = m[1];
    var limit = plainNumber(m[2]);
    var limitText = /The limit is (.+)\.$/.exec(t)[1];
    if (!closeTo(limit, rules.maxPaybackWeeks)) bad('effort', 'the limit printed is not the limit set (' + rules.maxPaybackWeeks + ')', t);
    var says;
    var j = /^(just over|just under) (.+)$/.exec(figure);
    if (j) {
      if (j[2] !== limitText) bad('effort', '"just" is not about the limit', t);
      says = side(j[1], 0, 0);
    } else if (figure === 'under a week') {
      says = limit >= 1 ? 'under' : 'unclear';
    } else if (figure === limitText) {
      says = 'equal';
    } else {
      var n = /^(?:about )?([\d,.]+) weeks?$/.exec(figure);
      if (!n) { bad('effort', 'figure not understood: ' + figure, t); return; }
      says = side('', plainNumber(n[1]), limit);
      if (says === 'equal') says = 'unclear';      // looks like the limit without being the limit
    }
    if (says === 'unclear') bad('effort', 'cannot tell which side of the limit', t);
    if ((says === 'over') === g.pass || !!paid !== g.pass) bad('effort', 'the sentence says ' + says + ' the limit but the gate ' + (g.pass ? 'passes' : 'says NO'), t);
    if (g.metricText !== figure + ' to pay back') bad('effort', 'metricText shows a different figure: ' + g.metricText, t);
    if (g.rule.indexOf('longer than ' + limitText + '.') === -1) bad('effort', 'the rule names a different limit: ' + g.rule, t);
  })();

  // --- Potential ---
  (function () {
    var g = r.gates.potential;
    var t = g.reason;
    if (g.blocked) { if (g.pass) bad('potential', 'cannot be judged, yet passes', t); return; }
    var below = new RegExp('^Projected growth is (.+), below the ([\\d,.]+)' + TIMES + ' minimum(, even though someone owns the freed time\\.|, and nobody owns the freed time\\.)$').exec(t);
    var fine = new RegExp('^Projected growth is (.+) over the next year(, and someone owns the freed time\\.|, but nobody owns the freed time, so the minutes will not turn into anything\\.)$').exec(t);
    if (!below && !fine) { bad('potential', 'sentence not understood', t); return; }
    var figure = (below || fine)[1];
    var minimum = rules.minGrowth;
    var minimumText = new RegExp('below ([\\d,.]+' + TIMES + ') or nobody').exec(g.rule);
    if (!minimumText || !closeTo(plainNumber(minimumText[1].replace(TIMES, '')), minimum)) bad('potential', 'the rule does not name the minimum set (' + minimum + '): ' + g.rule, t);
    var says;
    var j = /^(just over|just under) (.+)$/.exec(figure);
    if (j) {
      says = side(j[1], 0, 0);
      if (minimumText && j[2] !== minimumText[1]) bad('potential', '"just" is not about the minimum', t);
    } else if (minimumText && figure === minimumText[1]) {
      says = 'equal';
    } else {
      says = side('', plainNumber(figure.replace(TIMES, '').replace(/^about /, '')), minimum);
      if (says === 'equal') says = 'unclear';
    }
    if (says === 'unclear') bad('potential', 'cannot tell which side of the minimum', t);
    if (below ? says !== 'under' : says === 'under') bad('potential', 'the figure shown (' + figure + ') contradicts the sentence', t);
    var owned = /someone owns the freed time\.$/.test(t);
    if (g.pass !== (!!fine && owned)) bad('potential', 'the sentence and the verdict disagree', t);
    if (g.metricText.indexOf(figure + ' growth, ') !== 0) bad('potential', 'metricText shows a different figure: ' + g.metricText, t);
  })();

  // --- The one-line summary ---
  if (r.firstNo) {
    if (r.summary !== 'NO at ' + r.gates[r.firstNo].label + '. ' + r.gates[r.firstNo].reason) out.push('summary: is not the first failing gate\'s sentence | ' + r.summary);
  } else if (!/^YES\. /.test(r.summary)) {
    out.push('summary: every gate passes but the summary does not say YES | ' + r.summary);
  }
  return out;
}


function testTies(G) {
  section('6. A value exactly on a limit passes (floating-point ties)');

  // EFFORT. 6 minutes x 23 a week returns $3,450; 23 build hours cost $1,725;
  // 1,725 / (3,450 / 52) is exactly 26 weeks.
  var e1 = G.evaluate(plain({ minutesPerRun: 6, runsPerWeek: 23, buildHours: 23 }), BRIEF);
  is(e1.paybackWeeks, 26, 'effort: $1,725 against $3,450 a year is exactly 26 weeks (it used to be 26.000000000000004)');
  ok(e1.gates.effort.pass && e1.verdict === 'YES', 'effort: payback of exactly 26 weeks passes', e1.summary);
  var e2 = G.evaluate(plain({ minutesPerRun: 3, runsPerWeek: 104, toolsPerMonth: 250, buildHours: 15, rolloutHours: 8, upkeepHoursPerMonth: 1.5 }), BRIEF);
  ok(e2.paybackWeeks === 26 && e2.gates.effort.pass, 'effort: the same tie with upkeep and licences passes Effort', 'payback ' + e2.paybackWeeks);

  // RETURN, service lens. 10 minutes x 10 a week = 83.33 hours; x 0.3 x $200 is exactly $5,000.
  var r1 = G.evaluate({ lens: 'service', minutesPerRun: 10, runsPerWeek: 10, tier: 'code', capacityConversion: 0.3,
    billableMarginPerHour: 200, growth: 1, touchesCashPath: false, ownerNamed: true }, BRIEF);
  is(r1.capacityValue, 5000, 'return: 83.33 hours x 0.3 x $200 is exactly $5,000 (it used to be 4999.999999999999)');
  ok(r1.gates['return'].pass && r1.verdict === 'YES', 'return: a service return of exactly $5,000 passes', r1.summary);
  ok(/just meets the \$5,000 floor/.test(r1.gates['return'].reason), 'return: and the sentence says it just meets the floor', r1.gates['return'].reason);

  // COST.
  var c1 = G.evaluate(plain({ minutesPerRun: 6, runsPerWeek: 80, tier: 'small', toolsPerMonth: 299.85 }), BRIEF);
  is(c1.costPerYear, 3600, 'cost: 4,000 small-model runs plus $299.85 a month is exactly $3,600 (it used to be 3600.0000000000005)');
  ok(c1.gates.cost.pass, 'cost: exactly 30% of a $12,000 return passes', c1.gates.cost.reason);
  var seventy = briefWith({ houseRules: { costMaxShareOfReturn: 0.7 } });
  var c2 = G.evaluate(plain({ minutesPerRun: 9, runsPerWeek: 12, tier: 'premium', toolsPerMonth: 150 }), seventy);
  ok(c2.costPerYear === 1890 && c2.returnPerYear === 2700 && c2.gates.cost.pass, 'cost: $1,890 of $2,700 is exactly 70% and passes a 70% limit', c2.gates.cost.reason);
  var c3 = G.evaluate(plain({ minutesPerRun: 12, runsPerWeek: 150, toolsPerMonth: 2625 }), seventy);
  ok(c3.costPerYear === 31500 && c3.gates.cost.pass, 'cost: $31,500 of $45,000 is exactly 70% and passes a 70% limit', c3.gates.cost.reason);

  // Grids of ordinary whole-number candidates, judged against exact
  // whole-number arithmetic (no decimals anywhere, so no rounding to argue about).

  // EFFORT, default rates, plain code, no upkeep:
  //   pass  <=>  buildHours x 75 x 52  <=  limit x (minutes x runs x 25)
  var wrong = [];
  var ties = 0;
  var checked = 0;
  [13, 26, 39, 52, 104].forEach(function (limit) {
    var rules = briefWith({ houseRules: { maxPaybackWeeks: limit } });
    for (var m = 1; m <= 20; m++) {
      for (var r = 1; r <= 40; r++) {
        var yearly = m * r * 25;
        if ((limit * yearly) % 3900 !== 0) continue;   // no whole number of build hours lands exactly on the limit
        var tieHours = limit * yearly / 3900;
        [tieHours - 1, tieHours, tieHours + 1].forEach(function (hours) {
          if (hours < 1) return;
          var expected = hours * 3900 <= limit * yearly;
          var got = G.evaluate(plain({ minutesPerRun: m, runsPerWeek: r, buildHours: hours }), rules).gates.effort.pass;
          checked += 1;
          if (hours === tieHours) ties += 1;
          if (got !== expected) wrong.push(m + ' min x ' + r + '/week, ' + hours + ' build hours, limit ' + limit + ': expected ' + (expected ? 'PASS' : 'NO'));
        });
      }
    }
  });
  ok(wrong.length === 0 && ties > 500, 'effort: ' + ties + ' whole-number candidates whose payback is exactly the limit all pass, and one build hour more is a NO (' + checked + ' checked against exact arithmetic)',
    wrong.length + ' wrong, for example: ' + wrong.slice(0, 3).join('; '));

  // COST, counted in units of a thousandth of a cent so that model prices are whole numbers:
  //   pass  <=>  cost x 100  <=  limitPercent x return
  wrong = []; ties = 0; checked = 0;
  var priceUnits = { code: 0, small: 45, mid: 900, frontier: 3600, premium: 15000 };   // price per run x 100,000
  [30, 70].forEach(function (limitPercent) {
    var rules = briefWith({ houseRules: { costMaxShareOfReturn: limitPercent / 100 } });
    Object.keys(priceUnits).forEach(function (tier) {
      for (var m = 1; m <= 12; m++) {
        [1, 3, 5, 10, 12, 20, 25, 40, 50, 60, 80, 100, 150, 200, 400].forEach(function (r) {
          var returnUnits = m * r * 25 * 100000;
          var runUnits = r * 50 * priceUnits[tier];
          var room = limitPercent * returnUnits / 100 - runUnits;      // what is left for licences, per year
          if (room < 0 || room % 12000 !== 0) return;                  // no whole number of cents a month lands on the limit
          var tieCents = room / 12000;
          [tieCents - 1, tieCents, tieCents + 1].forEach(function (cents) {
            if (cents < 0) return;
            var expected = (runUnits + cents * 12000) * 100 <= limitPercent * returnUnits;
            var got = G.evaluate(plain({ minutesPerRun: m, runsPerWeek: r, tier: tier, toolsPerMonth: cents / 100 }), rules).gates.cost.pass;
            checked += 1;
            if (cents === tieCents) ties += 1;
            if (got !== expected) wrong.push(tier + ', ' + m + ' min x ' + r + '/week, $' + (cents / 100) + ' a month, limit ' + limitPercent + '%: expected ' + (expected ? 'PASS' : 'NO'));
          });
        });
      }
    });
  });
  ok(wrong.length === 0 && ties > 500, 'cost: ' + ties + ' candidates whose cost is exactly the limit share all pass, and one cent a month more is a NO (' + checked + ' checked against exact arithmetic)',
    wrong.length + ' wrong, for example: ' + wrong.slice(0, 3).join('; '));

  // RETURN on the service lens, with conversion counted in hundredths:
  //   capacity x 6,000 = minutes x runs x 50 x conversionHundredths x margin;  the floor x 6,000 = 30,000,000
  wrong = []; ties = 0; checked = 0;
  for (var mins = 1; mins <= 60; mins++) {
    [1, 2, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100].forEach(function (r) {
      [10, 20, 25, 30, 40, 50, 60, 75, 80, 100].forEach(function (conversion) {
        [40, 50, 60, 75, 80, 100, 120, 125, 150, 200, 250, 300].forEach(function (margin) {
          var capacity = mins * r * 50 * conversion * margin;
          var labor = mins * r * 25 * 6000;
          if (Math.abs(capacity - 30000000) > 300000) return;          // only the close calls
          var expected = Math.max(capacity, labor) >= 30000000;
          var got = G.evaluate({ lens: 'service', minutesPerRun: mins, runsPerWeek: r, tier: 'code', capacityConversion: conversion / 100,
            billableMarginPerHour: margin, growth: 1, touchesCashPath: false, ownerNamed: true }, BRIEF).gates['return'].pass;
          checked += 1;
          if (capacity === 30000000) ties += 1;
          if (got !== expected) wrong.push(mins + ' min x ' + r + '/week x ' + conversion + '% x $' + margin + ': expected ' + (expected ? 'PASS' : 'NO'));
        });
      });
    });
  }
  ok(wrong.length === 0 && ties > 300, 'return: ' + ties + ' service candidates whose capacity value is exactly $5,000 all pass (' + checked + ' close calls checked against exact arithmetic)',
    wrong.length + ' wrong, for example: ' + wrong.slice(0, 3).join('; '));

  section('6. How close is "exactly"? One part in a billion, no more');
  // Each candidate sits exactly on its limit. Move the LIMIT by one part in
  // 10^k: clearly past it (k up to 8) must be a NO; inside a rounding hair
  // (k of 10 or more) is still the limit.
  var onPayback = plain({ minutesPerRun: 6, runsPerWeek: 23, buildHours: 23 });             // payback exactly 26 weeks
  var onCost = plain({ minutesPerRun: 10, runsPerWeek: 20, toolsPerMonth: 125 });           // cost exactly 30% of return
  var onFloor = plain({ minutesPerRun: 10, runsPerWeek: 20, touchesCashPath: false, daysOffCashCycle: 0 });      // return exactly $5,000
  var onGrowth = plain({ minutesPerRun: 10, runsPerWeek: 20, growth: 1 });                  // growth exactly 1x
  var hairProblems = [];
  [1, 2, 3, 4, 6, 8, 10, 12].forEach(function (k) {
    var step = Math.pow(10, -k);
    var expectPass = k >= 10;
    var cases = [
      ['effort', G.evaluate(onPayback, briefWith({ houseRules: { maxPaybackWeeks: 26 * (1 - step) } }))],
      ['cost', G.evaluate(onCost, briefWith({ houseRules: { costMaxShareOfReturn: 0.3 * (1 - step) } }))],
      ['return', G.evaluate(onFloor, briefWith({ houseRules: { minReturnPerYear: 5000 * (1 + step) } }))],
      ['potential', G.evaluate(onGrowth, briefWith({ houseRules: { minGrowth: 1 + step } }))]
    ];
    cases.forEach(function (c) {
      if (c[1].gates[c[0]].pass !== expectPass) hairProblems.push(c[0] + ' at one part in 10^' + k + ': expected ' + (expectPass ? 'PASS' : 'NO') + ' | ' + c[1].gates[c[0]].reason);
      wordingProblems(c[1]).forEach(function (p) { hairProblems.push('at one part in 10^' + k + ': ' + p); });
    });
    // And the other way: a limit moved the same distance in the candidate's favour always passes.
    var easier = [
      ['effort', G.evaluate(onPayback, briefWith({ houseRules: { maxPaybackWeeks: 26 * (1 + step) } }))],
      ['cost', G.evaluate(onCost, briefWith({ houseRules: { costMaxShareOfReturn: 0.3 * (1 + step) } }))],
      ['return', G.evaluate(onFloor, briefWith({ houseRules: { minReturnPerYear: 5000 * (1 - step) } }))],
      ['potential', G.evaluate(onGrowth, briefWith({ houseRules: { minGrowth: 1 - step } }))]
    ];
    easier.forEach(function (c) {
      if (!c[1].gates[c[0]].pass) hairProblems.push(c[0] + ' with the limit eased by one part in 10^' + k + ': expected PASS | ' + c[1].gates[c[0]].reason);
      wordingProblems(c[1]).forEach(function (p) { hairProblems.push('eased by one part in 10^' + k + ': ' + p); });
    });
  });
  ok(hairProblems.length === 0, 'a limit missed by one part in 10, 100 ... 100,000,000 is a NO; by one part in 10 billion or less it is a tie and passes; every sentence agrees',
    hairProblems.slice(0, 4).join('\n        '));
}


function testCloseCalls(G) {
  section('6. Close calls: the sentence never contradicts the verdict');

  var a = G.evaluate(plain({ minutesPerRun: 10, runsPerWeek: 20, toolsPerMonth: 126.67 }), BRIEF);
  ok(!a.gates.cost.pass && /30\.4% of return/.test(a.gates.cost.metricText) && /which is 30\.4% of/.test(a.gates.cost.reason),
    'cost at 30.4% is a NO and both the sentence and metricText say 30.4%, not 30%', a.gates.cost.metricText + ' | ' + a.gates.cost.reason);

  var b = G.evaluate(plain({ minutesPerRun: 6, runsPerWeek: 23, buildHours: 23.03 }), BRIEF);
  ok(!b.gates.effort.pass && /takes just over 26 weeks to pay back\. The limit is 26 weeks\./.test(b.gates.effort.reason) && b.gates.effort.metricText === 'just over 26 weeks to pay back',
    'payback of 26.03 weeks is a NO that reads "just over 26 weeks" (not "26.0 weeks ... the limit is 26")', b.gates.effort.metricText + ' | ' + b.gates.effort.reason);

  var c = G.evaluate(plain({ minutesPerRun: 10, runsPerWeek: 20, toolsPerMonth: 125.008 }), BRIEF);
  ok(!c.gates.cost.pass && /which is just over 30% of/.test(c.gates.cost.reason), 'cost at 30.002% is a NO that reads "just over 30%" (not "30.00% ... the limit is 30%")', c.gates.cost.reason);

  var d = G.evaluate(plain({ minutesPerRun: 10, runsPerWeek: 20, touchesCashPath: false, daysOffCashCycle: 0 }), briefWith({ rates: { loadedHourly: 29.99998 } }));
  ok(!d.gates['return'].pass && /^It returns just under \$5,000 a year, under the \$5,000 floor/.test(d.gates['return'].reason),
    'a return of $4,999.997 is a NO that reads "just under $5,000" (not "$5,000.00 ... under the $5,000 floor")', d.gates['return'].reason);
  var d2 = G.evaluate(plain({ minutesPerRun: 10, runsPerWeek: 20, touchesCashPath: false, daysOffCashCycle: 0 }), briefWith({ rates: { loadedHourly: 29.9976 } }));
  ok(/^It returns \$4,999\.60 a year, under the \$5,000 floor/.test(d2.gates['return'].reason), 'a return of $4,999.60 shows its cents', d2.gates['return'].reason);

  var e = G.evaluate(plain({ minutesPerRun: 6, runsPerWeek: 60, growth: 0.999 }), BRIEF);
  ok(!e.gates.potential.pass && e.gates.potential.reason.indexOf('Projected growth is 0.999' + TIMES + ', below the 1' + TIMES + ' minimum') === 0,
    'growth of 0.999 is a NO that reads 0.999, not "1x, below the 1x minimum"', e.gates.potential.reason);
  var e2 = G.evaluate(plain({ minutesPerRun: 6, runsPerWeek: 60, growth: 0.99999 }), BRIEF);
  ok(!e2.gates.potential.pass && e2.gates.potential.reason.indexOf('Projected growth is just under 1' + TIMES) === 0, 'growth of 0.99999 reads "just under 1x"', e2.gates.potential.reason);

  // An edited house rule is printed as it was set, not rounded.
  var f = G.evaluate(plain({ minutesPerRun: 10, runsPerWeek: 20, toolsPerMonth: 53 }), briefWith({ houseRules: { costMaxShareOfReturn: 0.125 } }));
  ok(!f.gates.cost.pass && /more than 12\.5% of/.test(f.gates.cost.rule) && /The limit is 12\.5%\.$/.test(f.gates.cost.reason),
    'a cost limit of 12.5% is printed as 12.5% in the rule and the sentence (not 13%)', f.gates.cost.rule + ' | ' + f.gates.cost.reason);
  var g = G.evaluate(plain({ minutesPerRun: 6, runsPerWeek: 23, buildHours: 23.3 }), briefWith({ houseRules: { maxPaybackWeeks: 26.25 } }));
  ok(!g.gates.effort.pass && /longer than 26\.25 weeks\./.test(g.gates.effort.rule) && /takes 26\.3 weeks to pay back\. The limit is 26\.25 weeks\./.test(g.gates.effort.reason),
    'a payback limit of 26.25 weeks is printed as 26.25, and a 26.34-week payback reads 26.3 against it', g.gates.effort.reason);
  var h = G.evaluate(plain({ minutesPerRun: 10, runsPerWeek: 20, touchesCashPath: false, daysOffCashCycle: 0 }), briefWith({ houseRules: { minReturnPerYear: 5000.5, minGrowth: 1.125 } }));
  ok(/under \$5,000\.50 and/.test(h.gates['return'].rule) && h.gates.potential.rule.indexOf('below 1.125' + TIMES) !== -1,
    'a return floor of $5,000.50 and a growth minimum of 1.125x are printed exactly', h.gates['return'].rule + ' | ' + h.gates.potential.rule);

  var closeCalls = [a, b, c, d, d2, e, e2, f, g, h];
  var complaints = [];
  closeCalls.forEach(function (r) { complaints = complaints.concat(wordingProblems(r)); });
  ok(complaints.length === 0, 'each of those results reads right gate by gate (figure, limit, rule, metricText and verdict all agree)', complaints.slice(0, 4).join('\n        '));

  // A repeatable sweep of candidates nudged around every limit, including odd limits.
  var random = makeRandom(20261113);
  var pick = function (list) { return list[Math.floor(random() * list.length)]; };
  var nudge = function (value) {
    var k = pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
    return value * (1 + pick([-1, 1]) * pick([1, 2, 5]) * Math.pow(10, -k));
  };
  var sweepProblems = [];
  var swept = 0;
  for (var i = 0; i < 4000; i++) {
    var rules = {
      costMaxShareOfReturn: pick([0.3, 0.3, 0.125, 0.07, 0.005, 1 / 3, 0.7, 1]),
      minReturnPerYear: pick([5000, 5000, 4999.5, 50, 0.5, 120000]),
      maxPaybackWeeks: pick([26, 26, 26.25, 12, 1, 0.5, 104]),
      minGrowth: pick([1, 1, 1.125, 0.5, 2])
    };
    var minutes = pick([1, 2, 5, 6, 10, 12]);
    var runs = pick([1, 4, 10, 20, 23, 60, 200]);
    var yearly = minutes * runs * 25;
    var tools = pick([0, nudge(rules.costMaxShareOfReturn * yearly / 12), rules.costMaxShareOfReturn * yearly / 12]);
    var left = yearly - tools * 12;
    if (Math.abs(left) < 1e-6) left = 0;        // rounding dust of this test's own sums, not a figure anyone would enter
    var build = left > 0 ? pick([0, nudge(rules.maxPaybackWeeks * left / 3900), rules.maxPaybackWeeks * left / 3900]) : pick([0, 10]);
    if (build > 0 && build < 1e-6) build = 0;   // a millionth of an hour is not a build; under a billionth the library refuses it
    var candidate = plain({
      minutesPerRun: minutes, runsPerWeek: runs, toolsPerMonth: tools, buildHours: build,
      growth: pick([nudge(rules.minGrowth), rules.minGrowth, 1.5]),
      touchesCashPath: random() < 0.5, daysOffCashCycle: pick([0, 0, 1, 2]), ownerNamed: random() < 0.8
    });
    var assumptions = briefWith({ houseRules: rules, rates: { loadedHourly: pick([30, 30, nudge(rules.minReturnPerYear / yearly * 30)]) } });
    var result = G.evaluate(candidate, assumptions);
    swept += 1;
    if (result.warnings.length) sweepProblems.push('unexpected warning: ' + result.warnings[0]);
    wordingProblems(result).forEach(function (p) { sweepProblems.push(p); });
    findBadText(result).forEach(function (p) { sweepProblems.push('bad text: ' + p); });
  }
  ok(sweepProblems.length === 0, swept + ' candidates nudged to within a hair of each limit (round and odd limits): every sentence, rule and metricText agrees with its verdict',
    sweepProblems.length + ' complaints, for example:\n        ' + sweepProblems.slice(0, 4).join('\n        '));

  // The same reading test on ordinary candidates of every kind: all five
  // tiers, both lenses, licences, rollout, upkeep, and rates that are not round.
  var kindProblems = [];
  var kinds = 0;
  for (var j = 0; j < 4000; j++) {
    var isService = random() < 0.3;
    var ordinary = {
      lens: isService ? 'service' : 'product',
      minutesPerRun: pick([0.5, 1, 2, 3, 4, 5, 6, 7.5, 10, 12, 15, 20, 30, 45]),
      runsPerWeek: pick([1, 2, 3, 5, 10, 12, 20, 23, 25, 40, 50, 60, 80, 100, 104, 150, 250]),
      tier: pick(['code', 'code', 'small', 'mid', 'frontier', 'premium']),
      toolsPerMonth: pick([0, 0, 10, 25, 49.99, 100, 125, 240, 250, 299.85, 500]),
      buildHours: pick([0, 1, 4, 8, 10, 15, 23, 24, 26, 40, 80, 120, 400]),
      rolloutHours: pick([0, 0, 2, 6, 8, 40]),
      upkeepHoursPerMonth: pick([0, 0, 0.5, 1, 1.5, 2, 4, 30]),
      growth: pick([1, 1, 1.5, 2, 0.9, 1.1, 1.25, 0.5, 3]),
      touchesCashPath: random() < 0.5,
      daysOffCashCycle: pick([0, 0, 0, 0.5, 1, 2, 5]),
      ownerNamed: random() < 0.85
    };
    if (isService) {
      ordinary.capacityConversion = pick([0, 0.1, 0.25, 0.3, 0.5, 0.6, 0.75, 1]);
      ordinary.billableMarginPerHour = pick([40, 50, 80, 95, 100, 120, 200]);
    }
    var ordinaryAssumptions = briefWith({
      rates: { loadedHourly: pick([30, 30, 22.5, 45, 60, 18.75, 33.33]), builderHourly: pick([75, 75, 50, 100, 62.5]), workWeeks: pick([50, 50, 48, 52, 49.5]) },
      houseRules: { costMaxShareOfReturn: pick([0.3, 0.3, 0.125, 0.7, 0.25]), minReturnPerYear: pick([5000, 5000, 2500, 1200, 12000]),
        maxPaybackWeeks: pick([26, 26, 13, 52, 26.25]), minGrowth: pick([1, 1, 1.1, 1.25, 0.5]) }
    });
    var ordinaryResult = G.evaluate(ordinary, ordinaryAssumptions);
    kinds += 1;
    if (ordinaryResult.warnings.length) kindProblems.push('unexpected warning: ' + ordinaryResult.warnings[0]);
    wordingProblems(ordinaryResult).forEach(function (p) { kindProblems.push(p + ' for ' + show(ordinary)); });
    findBadText(ordinaryResult).forEach(function (p) { kindProblems.push('bad text: ' + p); });
    findNaN(ordinaryResult).forEach(function (p) { kindProblems.push('NaN at ' + p); });
  }
  ok(kindProblems.length === 0, kinds + ' ordinary candidates of every kind (five tiers, both lenses, licences, upkeep, odd rates and rules): every sentence agrees with its verdict',
    kindProblems.length + ' complaints, for example:\n        ' + kindProblems.slice(0, 4).join('\n        '));
}


function testUnusableInputs(G, C) {
  section('6. An input that cannot be used is never quietly replaced');
  var notes = EXAMPLES[1];
  var reminders = EXAMPLES[2];
  var withField = function (base, key, value) { var c = Object.assign({}, base); c[key] = value; return c; };

  // Everyday spellings that leave no doubt are simply read.
  var dollar = G.evaluate(withField(notes, 'toolsPerMonth', '$240'), BRIEF);
  ok(Math.abs(dollar.costPerYear - 2880.45) < 1e-9 && dollar.firstNo === 'cost' && dollar.warnings.length === 0,
    '"$240" a month is read as 240: still $2,880.45 a year and still NO at Cost (it used to become $0 and pass)', show([dollar.costPerYear, dollar.firstNo, dollar.warnings]));
  var timesX = G.evaluate(withField(reminders, 'growth', '1.5x'), BRIEF);
  ok(timesX.twoYearValue === 17546.625 && timesX.warnings.length === 0 && G.evaluate(withField(reminders, 'growth', '1.5' + TIMES), BRIEF).twoYearValue === 17546.625,
    'growth typed as "1.5x" is read as 1.5 (it used to become 1x)');
  // "150%" could mean 1.5 times as big or 2.5 times as big, and "50%" half the size or half again: not guessed.
  var percentGrowth = G.evaluate(withField(reminders, 'growth', '150%'), BRIEF);
  ok(percentGrowth.warnings.length === 1 && /150%/.test(percentGrowth.warnings[0]) && /can be read two ways/.test(percentGrowth.warnings[0]) && /1\.5 for half again/.test(percentGrowth.warnings[0]) &&
     percentGrowth.gates.potential.blocked && percentGrowth.firstNo === 'potential',
    'growth typed as "150%" is not guessed at (1.5 times, or 2.5 times?): one warning says how to write it, and Potential cannot pass (it used to become 1x silently)', show(percentGrowth.warnings));
  ok(G.evaluate(withField(reminders, 'growth', '50%'), BRIEF).gates.potential.blocked, 'the same for "50%" (half the size, or half again as big?)');
  ok(G.evaluate(reminders, briefWith({ houseRules: { minGrowth: '100%' } })).gates.potential.blocked, 'and for a growth minimum written as a percentage');
  var comma = G.evaluate(withField(reminders, 'runsPerWeek', '3,000'), BRIEF);
  ok(comma.runsPerYear === 150000 && comma.warnings.length === 0, 'runs typed as "3,000" are 3,000 runs a week (it used to become 0)');
  var halfShare = G.evaluate({ lens: 'service', minutesPerRun: 30, runsPerWeek: 20, tier: 'small', capacityConversion: '50%', billableMarginPerHour: 80, growth: 1, ownerNamed: true }, BRIEF);
  ok(halfShare.returnPerYear === 20000 && halfShare.warnings.length === 0, 'capacity conversion typed as "50%" is read as 0.5: return $20,000');

  // Anything else is reported, and the gate that needs it cannot pass.
  var perMonth = G.evaluate(withField(notes, 'toolsPerMonth', '240/mo'), BRIEF);
  ok(perMonth.warnings.length === 1 && /240\/mo/.test(perMonth.warnings[0]) && perMonth.gates.cost.blocked && !perMonth.gates.cost.pass && perMonth.firstNo === 'cost',
    '"240/mo" is not a number: one warning names it, and Cost cannot pass on a made-up $0', show(perMonth.warnings));
  ok(/cannot be judged until that is fixed/.test(perMonth.summary) && perMonth.gates.cost.metricText === 'cannot be judged yet', 'and the summary says the gate cannot be judged', perMonth.summary);
  same(perMonth.inputProblems.map(function (p) { return [p.field, p.entered, p.gates]; }), [['toolsPerMonth', '"240/mo"', ['cost', 'effort']]],
    'inputProblems names the field, what was entered and the gates it blocks, so a form can mark it');

  var negativeGrowth = G.evaluate(withField(reminders, 'growth', -0.5), BRIEF);
  ok(negativeGrowth.verdict === 'NO' && negativeGrowth.firstNo === 'potential' && negativeGrowth.gates.potential.blocked && negativeGrowth.warnings.length === 1,
    'negative growth is a NO at Potential with a warning (it used to count as 1x and pass)', negativeGrowth.summary);
  var fifty = G.evaluate({ lens: 'service', minutesPerRun: 30, runsPerWeek: 20, tier: 'small', capacityConversion: 50, billableMarginPerHour: 80, growth: 1, ownerNamed: true }, BRIEF);
  ok(fifty.warnings.length === 1 && /write 0\.5 for 50%/.test(fifty.warnings[0]) && fifty.gates['return'].blocked && fifty.verdict === 'NO' && fifty.capacityValue === 0,
    'a capacity conversion of 50 (meant as 50%) is not quietly treated as 100%: warning, and Return cannot pass', show(fifty.warnings));
  var negativeBuild = G.evaluate(withField(reminders, 'buildHours', -5), BRIEF);
  ok(negativeBuild.gates.effort.blocked && !negativeBuild.gates.effort.pass && !/nothing to pay back/.test(negativeBuild.gates.effort.reason),
    'negative build hours do not become "nothing to pay back": Effort cannot pass', negativeBuild.gates.effort.reason);
  var tooBig = G.evaluate(withField(reminders, 'runsPerWeek', 5e12), BRIEF);
  ok(tooBig.warnings.length === 1 && /too large/.test(tooBig.warnings[0]) && tooBig.runsPerYear === 0 && tooBig.verdict === 'NO',
    'a figure above a trillion is refused, not quietly capped', show(tooBig.warnings));
  var maybe = G.evaluate(withField(reminders, 'ownerNamed', 'maybe'), BRIEF);
  ok(maybe.warnings.length === 1 && maybe.gates.potential.blocked && maybe.verdict === 'NO', 'ownerNamed "maybe" is not a yes: warning, and Potential cannot pass', show(maybe.warnings));
  var lens = G.evaluate(withField(reminders, 'lens', 'servce'), BRIEF);
  ok(lens.warnings.length === 1 && lens.gates['return'].blocked, 'a misspelt lens is reported instead of quietly becoming "product"', show(lens.warnings));
  var tier = G.evaluate(withField(reminders, 'tier', 'quantum'), BRIEF);
  ok(tier.warnings.length === 1 && tier.gates.cost.blocked && tier.verdict === 'NO', 'an unknown tier is priced at $0 for the arithmetic, reported, and Cost cannot pass', show(tier.warnings));
  // A tier or a lens that is not a word at all must be reported without its
  // computer spelling ("NaN", "Infinity", "[object Object]") reaching a sentence.
  var notWords = [NaN, Infinity, -Infinity, true, false, 0, 6, [], [3], {}, { id: 7 }, function () {}];
  var wordProblems = [];
  notWords.forEach(function (junkValue) {
    ['tier', 'lens'].forEach(function (field) {
      var r = G.evaluate(withField(reminders, field, junkValue), BRIEF);
      var what = field + ' = ' + (typeof junkValue === 'function' ? 'a function' : typeof junkValue === 'number' ? String(junkValue) : JSON.stringify(junkValue));
      if (r.warnings.length !== 1) wordProblems.push(what + ': expected one warning, got ' + show(r.warnings));
      if (!r.gates.cost.blocked || r.gates.cost.pass || r.verdict !== 'NO') wordProblems.push(what + ': Cost should not be judged');
      if (r.inputProblems.length !== 1 || r.inputProblems[0].field !== field) wordProblems.push(what + ': inputProblems should name ' + field);
      findBadText({ gates: r.gates, summary: r.summary, warnings: r.warnings }).forEach(function (p) { wordProblems.push(what + ': ' + p); });
    });
  });
  ok(wordProblems.length === 0, 'a tier or a lens that is not a word (NaN, Infinity, true, 6, a list ...) is reported in plain words, never as "NaN" or "Infinity", and Cost cannot pass',
    wordProblems.slice(0, 4).join('\n        '));
  var nanTier = G.evaluate(withField(reminders, 'tier', NaN), BRIEF);
  is(nanTier.warnings[0], 'The tool tier is not one of the tiers (code, small, mid, frontier, premium). The price per run was taken as $0.', 'the sentence for a tier of NaN');
  is(G.evaluate(withField(reminders, 'tier', 6), BRIEF).warnings[0], 'The tool tier was entered as 6, which is not one of the tiers (code, small, mid, frontier, premium). The price per run was taken as $0.', 'the sentence for a tier of 6');
  is(G.evaluate(withField(reminders, 'lens', NaN), BRIEF).warnings[0], 'The lens is not "product" or "service". It was taken as product.', 'the sentence for a lens of NaN');
  var tierObject = G.evaluate(withField(reminders, 'tier', C.tier('small', BRIEF_TOKENS)), BRIEF);
  ok(tierObject.warnings.length === 0 && tierObject.tier === 'small' && tierObject.verdict === 'YES', 'a tier object from CostMath.tier() is still accepted as the tier');
  var blankTier = G.evaluate(withField(reminders, 'tier', '  '), BRIEF);
  ok(blankTier.warnings.length === 1 && /^No tool tier was chosen/.test(blankTier.warnings[0]) && blankTier.inputProblems.length === 0 && blankTier.pricePerRun === 0,
    'a blank tier is still "no tier chosen": priced at $0 with a warning, not an input problem', show(blankTier.warnings));
  var cashDays = G.evaluate(withField(reminders, 'daysOffCashCycle', 'two'), BRIEF);
  ok(cashDays.warnings.length === 1 && cashDays.cashFreed === 0 && cashDays.verdict === 'YES',
    'unreadable days off the cash cycle: reported, cash freed shown as $0, and no gate is touched (none reads it)', show(cashDays.warnings));
  var offLens = G.evaluate(withField(reminders, 'capacityConversion', 'n/a'), BRIEF);
  ok(offLens.warnings.length === 0 && offLens.verdict === 'YES', 'a service-only field on a product candidate is ignored, whatever it holds');

  // Blank is not broken.
  var blank = G.evaluate({ lens: 'product', tier: 'code', minutesPerRun: 6, runsPerWeek: 60, toolsPerMonth: '', buildHours: null, growth: undefined, touchesCashPath: true, ownerNamed: true }, BRIEF);
  ok(blank.warnings.length === 0 && blank.verdict === 'YES' && blank.candidate.growth === 1 && blank.costPerYear === 0, 'blank fields count as none (growth as 1x) and raise no warning');

  // The same rule for the rates and the house rules.
  var badRate = G.evaluate(reminders, { rates: { loadedHourly: 'thirty' }, company: BRIEF.company, tokens: BRIEF.tokens, houseRules: BRIEF.houseRules });
  ok(badRate.warnings.length === 1 && /hourly rate/.test(badRate.warnings[0]) && /\$30 was used instead/.test(badRate.warnings[0]) && badRate.gates['return'].blocked && badRate.verdict === 'NO',
    'an unreadable hourly rate is reported, $30 is used for the arithmetic, and the gates that need it cannot pass', show(badRate.warnings));
  var badRule = G.evaluate(reminders, briefWith({ houseRules: { maxPaybackWeeks: -1 } }));
  ok(badRule.warnings.length === 1 && badRule.gates.effort.blocked && badRule.gates.cost.pass && badRule.firstNo === 'effort', 'an unusable payback limit blocks Effort and only Effort', show(badRule.warnings));
  var shareAsPercent = G.evaluate(reminders, briefWith({ houseRules: { costMaxShareOfReturn: 30 } }));
  ok(shareAsPercent.warnings.length === 1 && shareAsPercent.gates.cost.blocked, 'a cost limit written as 30 instead of 0.30 is caught', show(shareAsPercent.warnings));
  ok(G.evaluate(reminders, briefWith({ houseRules: { costMaxShareOfReturn: '30%' } })).warnings.length === 0, 'while "30%" is read as 0.30');
  var tooManyWeeks = G.evaluate(reminders, briefWith({ rates: { workWeeks: 60 } }));
  ok(tooManyWeeks.warnings.length === 1 && /52 weeks/.test(tooManyWeeks.warnings[0]), 'more than 52 work weeks in a year is caught', show(tooManyWeeks.warnings));

  section('6. Rules of thumb with an unusable argument');
  is(G.cashPerDay(-5), 0, 'cashPerDay(-5) is 0, not the $54,795 of the example company');
  is(G.cashPerDay('abc'), 0, 'cashPerDay("abc") is 0');
  near(G.cashPerDay('$20,000,000'), 54794.52, 'cashPerDay("$20,000,000") reads the amount', 0.01);
  is(G.minuteRule(-10), 0, 'minuteRule(-10) is 0, not $25');
  is(G.minuteRule('abc', 50), 0, 'minuteRule("abc", 50) is 0');
  is(G.minuteRule(30, 60), 0, 'minuteRule(30, 60) is 0: there are not 60 working weeks in a year');
  is(G.minuteRule('', null), G.minuteRule(), 'blank arguments still mean "use the defaults"');
  is(C.breakEvenSeconds('GPT-5.5 Pro', -5, BRIEF_TOKENS), null, 'breakEvenSeconds at a negative hourly rate has no answer (null), not the 18 seconds of the default rate');
  is(C.breakEvenSeconds('GPT-5.5 Pro', 'abc', BRIEF_TOKENS), null, 'breakEvenSeconds at an unreadable hourly rate has no answer (null)');
  is(C.seconds(C.breakEvenSeconds('GPT-5.5 Pro', 'abc', BRIEF_TOKENS)), 'n/a', 'which prints as n/a');

  section('6. Junk in, nothing broken out');
  var random = makeRandom(4242);
  var pick = function (list) { return list[Math.floor(random() * list.length)]; };
  var junk = [undefined, null, '', ' ', 0, 1, 6, 60, 0.5, 1.5, -1, -0.5, 1e12, 1e13, 1e300, 5e-324, NaN, Infinity, -Infinity, true, false,
    '6', '1.5', '-3', '$240', '3,000', '150%', '50%', '1.5x', '240/mo', 'abc', 'two', '1,5', '0x10', '1e3', 'NaN', 'Infinity', 'undefined', 'null',
    [], [3], {}, { id: 'small' }, { id: 7 }, function () {}];
  // What a person typed is quoted back to them inside "double quotes"; that
  // part of a sentence is theirs. Everything outside the quotes is ours and
  // must never read "NaN", "Infinity", "undefined" or "[object Object]".
  var withoutQuotes = function (value) {
    return JSON.parse(JSON.stringify(value, function (key, v) { return typeof v === 'string' ? v.replace(/"[^"]*"/g, '""') : v; }));
  };
  var problems = [];
  var evaluated = 0;
  var yesCount = 0;
  var keys = ['id', 'name', 'lens', 'minutesPerRun', 'runsPerWeek', 'tier', 'toolsPerMonth', 'buildHours', 'rolloutHours', 'upkeepHoursPerMonth',
    'growth', 'touchesCashPath', 'daysOffCashCycle', 'capacityConversion', 'billableMarginPerHour', 'ownerNamed'];
  for (var i = 0; i < 3000; i++) {
    var candidate = baseCandidate({});
    var spoiled = 1 + Math.floor(random() * 4);
    for (var s = 0; s < spoiled; s++) candidate[pick(keys)] = pick(junk.concat(['product', 'service', 'code', 'small', 'premium']));
    var assumptions = BRIEF;
    if (random() < 0.3) {
      assumptions = JSON.parse(JSON.stringify(BRIEF));
      var group = pick(['rates', 'company', 'tokens', 'houseRules']);
      if (random() < 0.15) assumptions[group] = pick(junk);
      else assumptions[group][pick(Object.keys(BRIEF[group]))] = pick(junk);
    }
    var r;
    try {
      r = G.evaluate(candidate, assumptions);
    } catch (err) {
      problems.push('threw: ' + err.message + ' for ' + show(candidate));
      continue;
    }
    evaluated += 1;
    if (r.verdict === 'YES') yesCount += 1;
    var where = ' for ' + show(candidate) + (assumptions === BRIEF ? '' : ' with ' + show(assumptions));
    findNaN(r).forEach(function (p) { problems.push('NaN at ' + p + where); });
    // Broken-looking text, ignoring what the user typed (quoted back) and the candidate's own text fields.
    var sentences = { summary: r.summary, warnings: r.warnings, inputProblems: r.inputProblems.map(function (p) { return p.message; }), gates: {} };
    G.ORDER.forEach(function (id) { sentences.gates[id] = { reason: r.gates[id].reason, rule: r.gates[id].rule, metricText: r.gates[id].metricText }; });
    findBadText(withoutQuotes(sentences)).forEach(function (p) { problems.push('bad text at ' + p + where); });
    var texts = JSON.stringify({ gates: r.gates, summary: r.summary }).replace(/"metric":[^,}]+|"limit":[^,}]+/g, '');
    if (/\de[+-]\d/.test(texts.replace(/\\"[^"]*\\"/g, ''))) problems.push('computer notation in a sentence' + where);
    var failing = G.ORDER.filter(function (id) { return !r.gates[id].pass; });
    if ((failing[0] || null) !== r.firstNo || (r.verdict === 'YES') !== (failing.length === 0)) problems.push('verdict does not match the gates' + where);
    if (r.inputProblems.length !== r.warnings.filter(function (w) { return !/^No tool tier|^These figures are too large/.test(w); }).length) problems.push('warnings and inputProblems disagree' + where);
    r.inputProblems.forEach(function (p) {
      p.gates.forEach(function (id) { if (r.gates[id].pass || !r.gates[id].blocked) problems.push('gate ' + id + ' passes although ' + p.field + ' was unusable' + where); });
    });
    wordingProblems(r).forEach(function (p) { problems.push(p + where); });
  }
  ok(problems.length === 0 && evaluated === 3000 && yesCount > 50, '3,000 candidates with junk in random fields (and sometimes junk assumptions): no error, no NaN, no broken wording, and never a pass on an unusable input (' + yesCount + ' still came out YES on clean inputs)',
    problems.length + ' problems, for example:\n        ' + problems.slice(0, 4).join('\n        '));

  // The one NaN the review found: a number so small it underflows to nothing
  // (gates.effort.metric was NaN while the sentence said "nothing to pay back").
  // A figure under a billionth is now sent back like any other slip.
  var tiny = G.evaluate({ minutesPerRun: 5e-324, runsPerWeek: 1, tier: 'code', growth: 1, ownerNamed: true, touchesCashPath: true }, BRIEF);
  ok(findNaN(tiny).length === 0 && tiny.gates.effort.metric === tiny.paybackWeeks && tiny.gates.effort.blocked && !tiny.gates.effort.pass &&
     tiny.warnings.length === 1 && /too small to be a real figure/.test(tiny.warnings[0]),
    'the smallest number a computer can hold is refused as too small: no NaN inside gates.effort, and Effort is not judged on it',
    show([tiny.gates.effort.metric, tiny.gates.effort.pass, tiny.warnings]));
  var nanSweep = [];
  [5e-324, 1e-320, 1e-300, 1e-200, 1e-100, 1e-30, 1e-12, 1e-9, 1e-6].forEach(function (small) {
    ['minutesPerRun', 'runsPerWeek', 'toolsPerMonth', 'buildHours', 'rolloutHours', 'upkeepHoursPerMonth', 'growth'].forEach(function (field) {
      [{}, { tier: 'code', buildHours: 0, rolloutHours: 0 }, { lens: 'service', capacityConversion: small, billableMarginPerHour: small }].forEach(function (extra) {
        var r = G.evaluate(Object.assign(baseCandidate({}), extra, withField({}, field, small)), BRIEF);
        findNaN(r).forEach(function (p) { nanSweep.push(field + ' = ' + small + ': NaN at ' + p); });
        findBadText({ gates: r.gates, summary: r.summary, warnings: r.warnings }).forEach(function (p) { nanSweep.push(field + ' = ' + small + ': ' + p); });
        if ((small < 1e-9) !== (r.inputProblems.length > 0)) nanSweep.push(field + ' = ' + small + ': ' + (small < 1e-9 ? 'should be refused' : 'should be accepted') + ' ' + show(r.warnings));
      });
    });
  });
  ok(nanSweep.length === 0, 'vanishingly small figures in any field: never NaN at any depth, never broken wording; under a billionth is refused, a billionth and up is used', nanSweep.slice(0, 4).join('\n        '));
  is(G.minuteRule(5e-324), 0, 'minuteRule(5e-324) is 0');
}


function testFormatters(G, C) {
  section('6. Formatters: no computer notation, no bare zero for something that is not zero');
  is(C.money(1e21), 'more than $1 quadrillion', 'money(1e21) is words, not "$1e+21"');
  is(C.money(1.6666666666666667e46), 'more than $1 quadrillion', 'money(1.67e46) is words, not "$1.6,666,...e+46"');
  is(C.money(-1e30), 'less than ' + MINUS + '$1 quadrillion', 'and a huge loss reads "less than -$1 quadrillion"');
  is(C.money(999999999999), '$999,999,999,999', 'just under a trillion still prints in full');
  is(C.ratio(1e21), 'more than 1 quadrillion' + TIMES, 'ratio(1e21) is words, not "1e+21x"');
  is(C.percent(2e306), 'more than 1 quadrillion%', 'percent(2e306) is words, not "Infinity%"');
  var huge = G.evaluate(Object.assign({}, EXAMPLES[2], { minutesPerRun: 1e12, runsPerWeek: 1e12 }), BRIEF);
  ok(!/e\+\d/.test(huge.summary) && !/e\+\d/.test(huge.gates['return'].metricText) && /more than \$1 quadrillion/.test(huge.summary),
    'two fields at the trillion cap: the summary says "more than $1 quadrillion", no exponent', huge.summary);
  ok(huge.warnings.some(function (w) { return /too large to mean anything/.test(w); }), 'and the result warns that the figures are too large to mean anything', show(huge.warnings));

  var down = C.stepComparison('Claude Fable 5.2', 'Claude Haiku 5.5', BRIEF_TOKENS).priceRatio;
  near(down, 0.0125, 'stepping down from Fable 5.2 to Haiku 5.5 is one eightieth of the price (0.0125)');
  is(C.ratio(down), '0.013' + TIMES, 'ratio(0.0125) is 0.013x, not "0x"');
  is(C.ratio(0.04), '0.04' + TIMES, 'ratio(0.04) is 0.04x, not "0x"');
  is(C.ratio(0.5), '0.5' + TIMES, 'ratio(0.5) is 0.5x');
  is(C.ratio(0.00001), 'under 0.001' + TIMES, 'a ratio too small to print says "under 0.001x"');
  is(C.ratio(0), '0' + TIMES, 'only a ratio of exactly zero prints as 0x');
  is(C.percent(-0.004), MINUS + '0.4%', 'percent(-0.004) keeps its sign: -0.4%, not "under 1%"');
  is(C.percent(-0.218), MINUS + '22%', 'percent(-0.218) is -22%');

  // Halves round up, the way they do on paper.
  is(C.money(1.005), '$1.01', 'money(1.005) is $1.01');
  is(C.money(0.0135), '$0.014', 'money(0.0135) is $0.014');
  is(C.cents(12147.975), '$12,147.98', 'cents(12147.975) is $12,147.98 (toFixed(2) would say .97)');
  is(C.cents(5000), '$5,000.00', 'cents(5000) is $5,000.00');
  is(C.cents(0.004), 'under $0.01', 'cents() never prints $0.00 for something that is not zero');
  same([C.cents(-0.001), C.ratio(-0.00001), C.seconds(-0.0000001)], ['about $0', 'about 0' + TIMES, 'about 0 seconds'],
    'a tiny negative is "about 0", not a minus sign stuck on the front of "under ..."');

  // Every formatter, on a wide spread of sizes and both signs: never computer
  // notation, never "NaN", and never a bare zero for something that is not zero.
  var spreadOfValues = [5e-324, 1e-300, 1e-12, 1e-9, 9.9e-7, 0.000001, 0.00045, 0.0049, 0.005, 0.0125, 0.0135, 0.095, 0.945, 0.9949, 0.995, 1, 1.005,
    9.95, 99.994, 99.995, 100, 999.5, 54794.52, 999999.5, 1e9, 1e12, 9.99e14, 1e15, 1e21, 1e300, 1.7e308];
  var formatterProblems = [];
  ['money', 'cents', 'aboutMoney', 'shortMoney', 'number', 'ratio', 'percent', 'seconds'].forEach(function (name) {
    spreadOfValues.forEach(function (value) {
      [value, -value].forEach(function (x) {
        var text = C[name](x);
        var digits = String(text).replace(/[^0-9]/g, '');
        if (typeof text !== 'string' || /NaN|undefined|Infinity|e[+-]\d|\[object/.test(text)) formatterProblems.push(name + '(' + x + ') -> ' + text);
        else if (/^0+$/.test(digits) && !/^(about|under) /.test(text)) formatterProblems.push(name + '(' + x + ') prints a bare zero: ' + text);
        else if (new RegExp('^' + MINUS + '(under|about|more|less)').test(text)) formatterProblems.push(name + '(' + x + ') has a stray minus sign: ' + text);
      });
    });
  });
  ok(formatterProblems.length === 0, 'eight formatters x ' + spreadOfValues.length + ' sizes x both signs: no exponent, no "NaN", no bare zero for a non-zero value, no stray minus sign',
    formatterProblems.slice(0, 5).join('; '));
  is(C.cents(-319.55), MINUS + '$319.55', 'cents(-319.55)');
  is(C.shortMoney(20000000), '$20M', 'shortMoney(20,000,000) is $20M');
  is(C.shortMoney(20400000), '$20.4M', 'shortMoney(20,400,000) is $20.4M');
  is(C.shortMoney(999999), '$1M', 'shortMoney(999,999) is $1M, not $1,000K');
  is(C.shortMoney(750000), '$750K', 'shortMoney(750,000) is $750K');
  is(C.number(1234.5), '1,234.5', 'number(1234.5) is 1,234.5');
  is(C.number(0.0000001), '0.0000001', 'number() never uses an exponent for a small figure');

  section('6. Clean numbers: no floating-point hairs in what the libraries return');
  is(C.breakEvenSeconds('GPT-5.5 Pro', 20, BRIEF_TOKENS), 27, 'break-even at $20 an hour is exactly 27 seconds (it used to be 26.999999999999996)');
  is(C.breakEvenSeconds('GPT-5.5 Pro', 45, BRIEF_TOKENS), 12, 'break-even at $45 an hour is exactly 12 seconds (it used to be 11.999999999999998)');
  is(C.breakEvenSeconds('Claude Fable 5.2', 30, BRIEF_TOKENS), 4.32, 'Fable 5.2 at $30 an hour is exactly 4.32 seconds');
  is(C.tier('mid', BRIEF_TOKENS).per100000, 900, '100,000 mid-tier runs cost exactly 900 (it used to be 899.9999999999999)');
  is(C.tier('frontier', BRIEF_TOKENS).per100000, 3600, '100,000 frontier runs cost exactly 3600 (it used to be 3599.9999999999995)');
  is(C.volumeCost(0.009, 100000), 900, 'volumeCost(0.009, 100,000) is exactly 900');
  var hairy = [];
  [15, 20, 24, 25, 30, 36, 40, 45, 50, 60, 75, 90, 120].forEach(function (rate) {
    C.priced(BRIEF_TOKENS).forEach(function (m) {
      var s = C.breakEvenSeconds(m, rate, BRIEF_TOKENS);
      if (String(s).replace('.', '').replace(/^0+/, '').length > 12) hairy.push(m.name + ' at $' + rate + ': ' + s);
    });
  });
  ok(hairy.length === 0, 'no break-even figure, for any priced model at 13 hourly rates, carries more than 12 significant digits', hairy.slice(0, 3).join('; '));
  var cc = G.evaluate(EXAMPLES[2], BRIEF);
  is(cc.costPerYear, 1.35, 'candidate C costs exactly 1.35 a year (it used to be 1.3499999999999999)');
  is(cc.year2RunRate, 12147.975, 'candidate C has a year-2 run rate of exactly 12147.975 (it used to be 12147.974999999999)');
  is(cc.twoYearValue, 17546.625, 'and a two-year value of exactly 17546.625');
  var secondsCases = [[18, '18 seconds'], [27, '27 seconds'], [4.32, '4.3 seconds'], [0.054, '0.05 seconds'], [0.54, '0.54 seconds'], [1, '1 second'],
    [0, '0 seconds'], [Infinity, 'never'], [null, 'n/a'], [0.0000001, 'under 0.001 seconds']];
  secondsCases.forEach(function (c) { is(C.seconds(c[0]), c[1], 'seconds(' + show(c[0]) + ') is ' + c[1]); });
  is(C.seconds(26.999999999999996, true), '27', 'seconds(x, true) gives the number alone, and 26.999999999999996 is 27');
  same(['GPT-5.5 Pro', 'Claude Fable 5.2', 'Claude Haiku 5.5'].map(function (n) { return C.seconds(C.breakEvenSeconds(n, 30, BRIEF_TOKENS)); }),
    ['18 seconds', '4.3 seconds', '0.05 seconds'], 'the three break-even figures of the brief print as 18, 4.3 and 0.05 seconds');

  section('6. Tiers and task sizes are accepted everywhere');
  is(C.breakEvenSeconds(C.tier('premium', BRIEF_TOKENS), 30), 18, 'breakEvenSeconds takes a tier object: premium is 18 seconds (it used to be null)');
  is(C.breakEvenSeconds(C.tier('frontier', BRIEF_TOKENS), 30), 4.32, 'frontier tier object: 4.32 seconds');
  is(C.breakEvenSeconds(C.tier('code', BRIEF_TOKENS), 30), 0, 'plain-code tier object: 0 seconds');
  is(C.pricePerRun(C.tier('premium', BRIEF_TOKENS)), 0.15, 'pricePerRun takes a tier object: 0.15 (it used to be null)');
  is(C.pricePerRun(C.tier('premium', BRIEF_TOKENS), { in: 4000, out: 1000 }), 0.3, 'and reprices it for another task size when one is given');
  is(C.pricePerRun('frontier', BRIEF_TOKENS), 0.036, 'pricePerRun takes a tier id');
  is(C.breakEvenSeconds('frontier', 30, BRIEF_TOKENS), 4.32, 'breakEvenSeconds takes a tier id');
  is(C.money(C.volumeCost(C.tier('premium', BRIEF_TOKENS), 10000000)), '$1,500,000', 'volumeCost takes a tier object: ten million premium runs are $1,500,000');
  is(C.model(C.tier('small', BRIEF_TOKENS)).name, 'Claude Haiku 5.5', 'model() of a tier object is the model that stands for it');
  near(C.stepComparison(C.tier('small', BRIEF_TOKENS), C.tier('mid', BRIEF_TOKENS), BRIEF_TOKENS).priceRatio, 20, 'stepComparison takes tier objects');
  var sizes = [{ in: 4000, out: 1000 }, { tokensIn: 4000, tokensOut: 1000 }, { input: 4000, output: 1000 }];
  same(sizes.map(function (t) { return G.evaluate(EXAMPLES[2], { tokens: t }).pricePerRun; }), [0.0009, 0.0009, 0.0009],
    'Gates.evaluate reads the task size under all three spellings (tokensIn / tokensOut used to be ignored)');
  same(sizes.map(function (t) { return G.evaluate(EXAMPLES[2], { tokens: t }).pricePerRun; }), sizes.map(function (t) { return C.tier('small', t).pricePerRun; }),
    'and agrees with CostMath.tier() for the same object');
  var badSize = G.evaluate(EXAMPLES[2], { tokens: { tokensIn: 'lots' } });
  ok(badSize.warnings.length === 1 && badSize.gates.cost.blocked && badSize.pricePerRun === 0.00045, 'an unreadable task size is reported and blocks Cost', show(badSize.warnings));

  section('6. The frontier line, said truthfully');
  var fs0 = C.frontierSummary(BRIEF_TOKENS);
  same([fs0.priced, fs0.frontier, fs0.dominated, fs0.beatenByCheaper, fs0.beatenAtSamePriceOnly], [41, 5, 36, 31, 5],
    'frontierSummary(): 41 priced, 5 on the frontier, 36 beaten at the same price or less, 31 of them by something strictly cheaper, 5 only at the same price');
  is(fs0.sentence, '36 of 41 are beaten by something that costs the same or less', 'the sentence for the slide is the true one');
  is(fs0.strictSentence, '31 of 41 cost more than something that beats them', 'and "cost more than something that beats them" is true of 31, not 36');
  var pricedList = C.priced(BRIEF_TOKENS);
  var strictly = C.dominated(BRIEF_TOKENS).filter(function (m) {
    return pricedList.some(function (o) { return o.pricePerRun < m.pricePerRun && o.overallScore > m.overallScore; });
  });
  is(strictly.length, 31, 'an independent count from the price list agrees: 31');
  same(names(C.dominated(BRIEF_TOKENS)).filter(function (n) { return names(strictly).indexOf(n) === -1; }).sort(),
    ['Claude Sonnet 5.5', 'GPT-6 Luna', 'GPT-6.1 Sol', 'Gemini 3.7 Flash', 'Gemini 4 Argon'], 'the five beaten only at their own price are named');
}


function testCompanyLabel(G, C, YOUR) {
  section('6. The company label follows the revenue');
  is(G.companyLabel({ annualRevenue: 20000000, label: 'Example: a $20M distributor' }), 'Example: a $20M distributor', 'a label that agrees with the revenue is left alone');
  is(G.companyLabel({ annualRevenue: 5000000, label: 'Example: a $20M distributor' }), 'Example: a $5M distributor', 'change only the revenue to 5,000,000 and the label reads $5M');
  is(G.companyLabel({ annualRevenue: 750000, label: 'Example: a $20M distributor' }), 'Example: a $750K distributor', 'or $750K');
  is(G.companyLabel({ annualRevenue: 20000000, label: 'Example: a $20 million distributor' }), 'Example: a $20 million distributor', 'other spellings of the same amount are left alone ($20 million)');
  is(G.companyLabel({ annualRevenue: 20000000, label: 'Example: a $20,000,000 distributor' }), 'Example: a $20,000,000 distributor', 'and $20,000,000');
  is(G.companyLabel({ annualRevenue: 5000000, label: 'Example: a mid-sized distributor' }), 'Example: a mid-sized distributor', 'a label with no dollar amount is left alone');
  var five = G.evaluate(EXAMPLES[2], briefWith({ company: { annualRevenue: 5000000 } }));
  is(five.assumptions.company.label, 'Example: a $5M distributor', 'evaluate() hands back a label that matches the revenue it used');
  is(five.assumptions.company.label + ' ' + C.aboutMoney(G.cashPerDay(5000000)) + ' per day', 'Example: a $5M distributor $13,700 per day', 'so the slide line can no longer pair "$20M" with $13,700 a day');
  is(G.companyLabel(), G.defaultAssumptions().company.label, 'companyLabel() with no argument is the speaker\'s company');

  // The one line here that is about the speaker's own file. One FAIL, with the fix spelled out.
  var corrected = G.companyLabel({ annualRevenue: YOUR.company.annualRevenue, label: YOUR.company.label });
  ok(corrected === YOUR.company.label, 'your-numbers.js: the dollar amount in company.label matches company.annualRevenue',
    'the label says "' + YOUR.company.label + '" but annualRevenue is ' + C.number(YOUR.company.annualRevenue) + '.\n        In your-numbers.js, change the label to: \'' + corrected +
    '\'\n        (Until you do, the deck shows the corrected label, so nothing wrong appears on screen.)');
  // Whatever the file says, the label on screen and the dollars beside it come from one revenue figure.
  var onScreen = G.companyLabel() + ' ' + String.fromCharCode(0x2248) + ' ' + C.aboutMoney(G.cashPerDay()) + ' per day';
  var amountInLabel = /\$\s?\d/.test(YOUR.company.label);
  ok(!amountInLabel || G.companyLabel().indexOf(C.shortMoney(YOUR.company.annualRevenue)) !== -1 || G.companyLabel() === YOUR.company.label,
    'the gate-return-cash line pairs the label with its own revenue: "' + onScreen + '"');
  is(C.aboutMoney(G.cashPerDay()), C.aboutMoney(YOUR.company.annualRevenue / 365), 'and the dollars a day beside it are that revenue divided by 365');
}


/* =============================================================================
 * 7. docs/MATH.md says what the code prints
 * ========================================================================== */
function testMathDoc(G, C) {
  section('7. docs/MATH.md agrees with the code, digit for digit');
  var docPath = path.join(ROOT, 'docs', 'MATH.md');
  if (!fs.existsSync(docPath)) { ok(false, 'docs/MATH.md exists'); return; }
  var doc = fs.readFileSync(docPath, 'utf8');
  var lines = doc.split(/\r?\n/);
  var money = C.money;
  var cents = C.cents;

  /* The cells of the table row that starts with this first cell (bold marks dropped). */
  function row(firstCell, nth) {
    var found = lines.filter(function (line) {
      if (line.charAt(0) !== '|') return false;
      var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim().replace(/\*\*/g, ''); });
      return cells[0] === firstCell;
    });
    var line = found[nth || 0];
    return line ? line.split('|').slice(1, -1).map(function (c) { return c.trim().replace(/\*\*/g, ''); }) : null;
  }
  function rowIs(firstCell, expectedRest, label, nth) {
    var cells = row(firstCell, nth);
    return ok(!!cells && JSON.stringify(cells.slice(1)) === JSON.stringify(expectedRest), label,
      cells ? 'the page says ' + JSON.stringify(cells.slice(1)) + '\n        the code says ' + JSON.stringify(expectedRest) : 'no table row starts with "' + firstCell + '"');
  }
  function says(snippet, label) {
    return ok(doc.indexOf(snippet) !== -1, label, 'docs/MATH.md does not contain: ' + snippet);
  }

  var results = EXAMPLES.map(function (c) { return G.evaluate(c, BRIEF); });
  var a = results[0];
  var b = results[1];
  var c = results[2];
  var yesNo = function (flag) { return flag ? 'yes' : 'no'; };

  // --- The worked example (candidate C), to the cent ---
  says('= **' + money(c.pricePerRun) + ' a run**', 'worked example, step 1: price per run ' + money(c.pricePerRun));
  says(C.number(c.hoursFreedPerYear * 60) + ' minutes a year = ' + C.number(c.hoursFreedPerYear) + ' hours', 'step 2: ' + C.number(c.hoursFreedPerYear * 60) + ' minutes = ' + C.number(c.hoursFreedPerYear) + ' hours');
  says('= **' + money(c.returnPerYear) + ' a year**', 'step 2: return ' + money(c.returnPerYear));
  says('= ' + C.number(c.runsPerYear) + ' runs a year', 'step 3: ' + C.number(c.runsPerYear) + ' runs a year');
  says('= **' + cents(c.costPerYear) + ' a year**', 'step 3: cost ' + cents(c.costPerYear));
  says('= **' + money(c.effortOnce) + '**', 'step 4: one-time effort ' + money(c.effortOnce));
  says('= **' + money(c.effortPerYear) + ' a year**', 'step 4: yearly effort ' + money(c.effortPerYear));
  says(money(c.returnPerYear) + ' ' + MINUS + ' ' + cents(c.costPerYear) + ' ' + MINUS + ' ' + money(c.effortOnce) + ' ' + MINUS + ' ' + money(c.effortPerYear) + ' = **' + cents(c.year1Net) + '**',
    'step 5: year 1 net ' + cents(c.year1Net));
  says('= ' + cents(c.yearlyNetBeforeBuild) + '\n', 'step 6: left over each year ' + cents(c.yearlyNetBeforeBuild));
  says(cents(c.yearlyNetBeforeBuild) + ' ' + String.fromCharCode(0xf7) + ' 52 = ' + cents(c.yearlyNetBeforeBuild / 52), 'step 6: per week ' + cents(c.yearlyNetBeforeBuild / 52));
  says('= **' + C.number(C.roundTo(c.paybackWeeks, 1)) + ' weeks**', 'step 6: payback ' + C.number(C.roundTo(c.paybackWeeks, 1)) + ' weeks');
  var grown = (c.returnPerYear - c.costPerYear) * c.candidate.growth;
  says('= ' + cents(grown) + ' ' + MINUS + ' ' + money(c.effortPerYear) + ' = **' + cents(c.year2RunRate) + '**', 'step 7: year 2 run rate ' + cents(grown) + ' - ' + money(c.effortPerYear) + ' = ' + cents(c.year2RunRate));
  says(cents(c.year1Net) + ' + ' + cents(c.year2RunRate) + ' = **' + cents(c.twoYearValue) + '**', 'step 8: two-year value ' + cents(c.twoYearValue));
  says('= **' + cents(c.cashFreed) + '**, once', 'cash freed ' + cents(c.cashFreed));
  rowIs('Cost', [c.gates.cost.metricText, 'NO above 30%', 'PASS'], 'gate table: Cost shows "' + c.gates.cost.metricText + '"');
  rowIs('Return', [c.gates['return'].metricText, 'NO under $5,000 (unless it gets cash in sooner)', 'PASS'], 'gate table: Return shows "' + c.gates['return'].metricText + '"');
  rowIs('Effort', [c.gates.effort.metricText, 'NO beyond 26 weeks', 'PASS'], 'gate table: Effort shows "' + c.gates.effort.metricText + '"');
  rowIs('Potential', [c.gates.potential.metricText, 'NO below 1' + TIMES + ' or with no owner', 'PASS'], 'gate table: Potential shows "' + c.gates.potential.metricText + '"');

  // --- What you will see on screen ---
  rowIs('Year 1 net', [cents(c.year1Net), money(c.year1Net), C.aboutMoney(c.year1Net)], 'on-screen table: year 1 net as cents / money / about');
  rowIs('Year 2 run rate', [cents(c.year2RunRate), money(c.year2RunRate), C.aboutMoney(c.year2RunRate)], 'on-screen table: year 2 run rate');
  rowIs('Two-year value', [cents(c.twoYearValue), money(c.twoYearValue), C.aboutMoney(c.twoYearValue)], 'on-screen table: two-year value');
  rowIs('Cash freed, once', [cents(c.cashFreed), money(c.cashFreed), C.aboutMoney(c.cashFreed)], 'on-screen table: cash freed');
  rowIs('Payback', [C.number(C.roundTo(c.paybackWeeks, 1)) + ' weeks', G.formatWeeks(c.paybackWeeks), G.formatWeeks(c.paybackWeeks)], 'on-screen table: payback');
  says('"' + c.summary + '"', 'the on-screen summary sentence for C is quoted as the code writes it');
  says('"about ' + C.aboutMoney(c.twoYearValue) + ' over two years, and about ' + C.aboutMoney(c.cashFreed) + ' of cash freed once"', 'and the spoken version uses the "about" figures');

  // --- The three candidates side by side, as the deck shows them ---
  var each = function (fn) { return results.map(fn); };
  rowIs('Tier', each(function (r) { return r.tierLabel; }), 'side by side: tier', 1);
  rowIs('Price per run', each(function (r) { return money(r.pricePerRun); }), 'side by side: price per run');
  rowIs('Return per year', each(function (r) { return money(r.returnPerYear); }), 'side by side: return per year');
  rowIs('Cost per year', each(function (r) { return r.gates.cost.metricText; }), 'side by side: cost per year');
  rowIs('Effort, one time', each(function (r) { return money(r.effortOnce); }), 'side by side: one-time effort');
  rowIs('Effort per year', each(function (r) { return money(r.effortPerYear); }), 'side by side: yearly effort');
  rowIs('Payback', each(function (r) { return r.gates.effort.metricText; }), 'side by side: payback', 1);
  rowIs('Year 1 net', each(function (r) { return money(r.year1Net); }), 'side by side: year 1 net', 1);
  rowIs('Year 2 run rate', each(function (r) { return money(r.year2RunRate); }), 'side by side: year 2 run rate', 1);
  rowIs('Two-year value', each(function (r) { return money(r.twoYearValue); }), 'side by side: two-year value', 1);
  G.GATES.forEach(function (gate) {
    rowIs(gate.label + ' gate', each(function (r) { return r.gates[gate.id].pass ? 'PASS' : 'NO'; }), 'side by side: ' + gate.label + ' gate');
  });
  rowIs('Verdict', each(function (r) { return r.firstNo ? 'NO at ' + r.gates[r.firstNo].label : 'YES'; }), 'side by side: verdict');
  says('the ' + money(a.returnPerYear - a.costPerYear) + ' it nets after running costs, so it loses ' + money(-a.yearlyNetBeforeBuild) + ' every year', 'the paragraph about A: nets ' + money(a.returnPerYear - a.costPerYear) + ', loses ' + money(-a.yearlyNetBeforeBuild));
  says('eats ' + C.percent(b.costShareOfReturn) + ' of the ' + money(b.returnPerYear) + ' it returns', 'the paragraph about B: ' + C.percent(b.costShareOfReturn) + ' of ' + money(b.returnPerYear));
  says('B costs ' + cents(b.costPerYear) + ' a year to run, nets ' + cents(b.year1Net) + ' in year 1 and is worth ' + cents(b.twoYearValue) + ' over two years', 'B to the cent: ' + [cents(b.costPerYear), cents(b.year1Net), cents(b.twoYearValue)].join(', '));

  // --- Rules of thumb ---
  says('1 minute ' + TIMES + ' 50 weeks ' + TIMES + ' $30 ' + String.fromCharCode(0xf7) + ' 60 = ' + money(G.minuteRule(30, 50)) + '. At $60 an hour it is ' + money(G.minuteRule(60, 50)) + '.', 'the minute rule: ' + money(G.minuteRule(30, 50)) + ' and ' + money(G.minuteRule(60, 50)));
  says('that is ' + money(G.cashPerDay(20000000)) + ', shown on the slide as "about ' + C.aboutMoney(G.cashPerDay(20000000)) + '"', 'cash per day: ' + money(G.cashPerDay(20000000)) + ', about ' + C.aboutMoney(G.cashPerDay(20000000)));

  // --- Benchmark figures ---
  var T = BRIEF_TOKENS;
  var counts = C.counts();
  var s = C.spread(T);
  var summary = C.frontierSummary(T);
  var last = function (firstCell) { var cells = row(firstCell); return cells ? cells[cells.length - 1] : null; };
  var middle = function (firstCell) { var cells = row(firstCell); return cells ? cells[1] : ''; };
  is(last('Models in the file'), String(counts.rows), 'benchmark table: models in the file');
  is(last('Marked "estimated"'), String(counts.estimated), 'benchmark table: marked estimated');
  is(last('Usable prices'), String(counts.priced), 'benchmark table: usable prices');
  is(last('Blank prices'), String(counts.blank), 'benchmark table: blank prices');
  ok(names(C.excluded().blank).every(function (n) { return middle('Blank prices').indexOf(n) !== -1; }), 'benchmark table: every blank-price model is named');
  is(last('Listed at $0'), String(counts.zeroListed), 'benchmark table: listed at $0');
  ok(names(C.excluded().zeroListed).every(function (n) { return middle('Listed at $0').indexOf(n) !== -1; }), 'benchmark table: every $0-listed model is named');
  is(last('Cheapest price per run'), money(s.cheapestPrice), 'benchmark table: cheapest price per run');
  ok(names(s.tiedCheapest).every(function (n) { return middle('Cheapest price per run').indexOf(n) !== -1; }), 'benchmark table: the models tied for cheapest are named');
  is(last('Dearest price per run'), money(s.dearestPrice), 'benchmark table: dearest price per run');
  ok(names(s.tiedDearest).every(function (n) { return middle('Dearest price per run').indexOf(n) !== -1; }), 'benchmark table: the models tied for dearest are named');
  is(last('The spread'), C.ratio(s.ratio), 'benchmark table: the spread');
  ok(middle('The spread').indexOf(money(s.dearestPrice) + ' ' + String.fromCharCode(0xf7) + ' ' + money(s.cheapestPrice) + ' = ' + C.number(C.roundTo(s.ratio, 1))) !== -1, 'benchmark table: the spread sum is written out');
  is(last('On the efficient frontier'), String(summary.frontier), 'benchmark table: on the efficient frontier');
  is(last('Beaten at the same price or less'), summary.dominated + ' of ' + summary.priced, 'benchmark table: beaten at the same price or less');
  is(last('Beaten by something cheaper'), summary.beatenByCheaper + ' of ' + summary.priced, 'benchmark table: beaten by something strictly cheaper');
  is(last('Beaten only at the same price'), summary.beatenAtSamePriceOnly + ' of ' + summary.priced, 'benchmark table: beaten only at the same price');
  says('"' + summary.sentence + '" is true', 'the page quotes the safe frontier sentence');
  var up1 = C.stepComparison('Claude Haiku 5.5', 'Gemini 4 Carbon', T);
  var up2 = C.stepComparison('Gemini 4 Carbon', 'Claude Fable 5.2', T);
  is(last('Haiku 5.5 ' + String.fromCharCode(0x2192) + ' Gemini 4 Carbon, price'), C.ratio(up1.priceRatio), 'benchmark table: Haiku to Carbon, price');
  is(last('Haiku 5.5 ' + String.fromCharCode(0x2192) + ' Gemini 4 Carbon, score'), C.number(up1.scoreGain), 'benchmark table: Haiku to Carbon, score');
  is(last('Gemini 4 Carbon ' + String.fromCharCode(0x2192) + ' Fable 5.2, price'), C.ratio(up2.priceRatio), 'benchmark table: Carbon to Fable, price');
  is(last('Gemini 4 Carbon ' + String.fromCharCode(0x2192) + ' Fable 5.2, score'), C.number(up2.scoreGain), 'benchmark table: Carbon to Fable, score');
  is(last('Break-even, dearest model'), C.seconds(C.breakEvenSeconds(s.dearest, 30, T)), 'benchmark table: break-even, dearest model');
  is(last('Break-even, Claude Fable 5.2'), C.seconds(C.breakEvenSeconds('Claude Fable 5.2', 30, T)), 'benchmark table: break-even, Fable 5.2');
  ok(middle('Break-even, Claude Fable 5.2').indexOf('exactly ' + C.number(C.breakEvenSeconds('Claude Fable 5.2', 30, T))) !== -1, 'benchmark table: and its exact figure');
  is(last('Break-even, Claude Haiku 5.5'), C.seconds(C.breakEvenSeconds('Claude Haiku 5.5', 30, T)), 'benchmark table: break-even, Haiku 5.5');
  ok(middle('Break-even, Claude Haiku 5.5').indexOf('exactly ' + C.number(C.breakEvenSeconds('Claude Haiku 5.5', 30, T))) !== -1, 'benchmark table: and its exact figure');
  says('The ' + (counts.blank + counts.zeroListed) + ' models with a blank price or a $0 listing', 'the page counts the ' + (counts.blank + counts.zeroListed) + ' models left out of price math');

  C.frontier(T).forEach(function (m) {
    rowIs(m.name, [money(m.pricePerRun), C.number(m.pricePerRun), C.number(m.overallScore), yesNo(m.estimated)], 'frontier table: ' + m.name);
  });
  C.tiers(T).forEach(function (t) {
    rowIs(t.label, [t.modelName || 'no model', t.modelName ? money(t.inputPrice) + ' / ' + money(t.outputPrice) : 'none',
      money(t.pricePerRun), money(t.per1000), money(t.per100000), yesNo(t.estimated)], 'tier table: ' + t.label);
  });

  // --- The rest of the benchmark table: the "how it is worked out" column ---
  var ARROW = String.fromCharCode(0x2192);
  var DIVIDE = String.fromCharCode(0xf7);
  var listPrice = function (m) { return money(m.inputPrice) + ' in / ' + money(m.outputPrice) + ' out'; };
  ok(s.tiedCheapest.every(function (m) { return listPrice(m) === listPrice(s.cheapest); }) && middle('Cheapest price per run').indexOf('both listed at ' + listPrice(s.cheapest)) !== -1,
    'benchmark table: the cheapest are listed at ' + listPrice(s.cheapest));
  ok(s.tiedDearest.every(function (m) { return listPrice(m) === listPrice(s.dearest); }) && middle('Dearest price per run').indexOf('both listed at ' + listPrice(s.dearest)) !== -1,
    'benchmark table: the dearest are listed at ' + listPrice(s.dearest));
  is(middle('Haiku 5.5 ' + ARROW + ' Gemini 4 Carbon, price'), money(up1.to.pricePerRun) + ' ' + DIVIDE + ' ' + money(up1.from.pricePerRun), 'benchmark table: Haiku to Carbon, the price sum');
  is(middle('Haiku 5.5 ' + ARROW + ' Gemini 4 Carbon, score'), C.number(up1.to.overallScore) + ' ' + MINUS + ' ' + C.number(up1.from.overallScore) + ', about ' + Math.round(up1.scoreGain) + ' points',
    'benchmark table: Haiku to Carbon, the score sum');
  is(middle('Gemini 4 Carbon ' + ARROW + ' Fable 5.2, price'), money(up2.to.pricePerRun) + ' ' + DIVIDE + ' ' + money(up2.from.pricePerRun), 'benchmark table: Carbon to Fable, the price sum');
  is(middle('Gemini 4 Carbon ' + ARROW + ' Fable 5.2, score'), C.number(up2.to.overallScore) + ' ' + MINUS + ' ' + C.number(up2.from.overallScore), 'benchmark table: Carbon to Fable, the score sum');
  var strictlyCheaper = C.dominated(T).filter(function (m) {
    return C.priced(T).some(function (o) { return o.pricePerRun < m.pricePerRun && o.overallScore > m.overallScore; });
  });
  var samePriceOnly = names(C.dominated(T)).filter(function (n) { return names(strictlyCheaper).indexOf(n) === -1; });
  ok(samePriceOnly.length === summary.beatenAtSamePriceOnly && samePriceOnly.every(function (n) { return middle('Beaten only at the same price').indexOf(n) !== -1; }),
    'benchmark table: the models beaten only at their own price are named', samePriceOnly.join(', '));
  says('It marks ' + counts.estimated + ' of its ' + counts.rows + ' rows', 'the page repeats the file\'s own count of estimated rows');
  says('"' + summary.dominated + ' of ' + summary.priced + ' cost more than something that beats them" is not: only ' + summary.beatenByCheaper + ' do, and the other ' + summary.beatenAtSamePriceOnly + ' are beaten',
    'the page says why the other wording is false, with the counts from the code');
  says('(' + [s.ratio, up1.priceRatio, up2.priceRatio].map(C.ratio).join(', ') + ') unchanged', 'the page names the three ratios that do not move with the task size');
  near(C.spread({ in: 4000, out: 1000 }).ratio, s.ratio, 'and doubling the task size does leave the spread alone');
  near(C.breakEvenSeconds(s.dearest, 60, T) * 2, C.breakEvenSeconds(s.dearest, 30, T), 'and at $60 an hour the break-even does halve');

  // --- Section 2: the shared assumptions ---
  is((row('Loaded hourly rate') || [])[1], money(BRIEF.rates.loadedHourly), 'assumptions table: loaded hourly rate');
  is((row('Builder hourly rate') || [])[1], money(BRIEF.rates.builderHourly), 'assumptions table: builder hourly rate');
  is((row('Work weeks') || [])[1], String(BRIEF.rates.workWeeks), 'assumptions table: work weeks');
  is((row('Annual revenue') || [])[1], money(BRIEF.company.annualRevenue), 'assumptions table: annual revenue');
  is((row('Task size') || [])[1], C.number(BRIEF.tokens['in']) + ' tokens in, ' + C.number(BRIEF.tokens.out) + ' out', 'assumptions table: task size');

  // --- Section 7: the rounding examples are what the formatters print ---
  var examples = function (firstCell) { var cells = row(firstCell); return cells ? cells[2].split(' ' + MIDDOT + ' ') : null; };
  same(examples('Money'), [0.00045, 0.45, 1.35, 45, 3600].map(money), 'rounding table: money');
  same(examples('Money in an "about" line'), [G.cashPerDay(20000000), c.twoYearValue].map(function (x) { return 'about ' + C.aboutMoney(x); }), 'rounding table: money in an "about" line');
  same(examples('Money to the cent'), [cents(c.year2RunRate)], 'rounding table: money to the cent');
  same(examples('"How many times"'), [s.ratio, c.candidate.growth, C.stepComparison('Claude Fable 5.2', 'Claude Haiku 5.5', T).priceRatio].map(C.ratio), 'rounding table: how many times');
  same(examples('Shares'), [b.costShareOfReturn, 0.063, c.costShareOfReturn].map(C.percent), 'rounding table: shares');
  same(examples('Seconds'), [s.dearest, 'Claude Fable 5.2', 'Claude Haiku 5.5'].map(function (m) { return C.seconds(C.breakEvenSeconds(m, 30, T)); }), 'rounding table: seconds');
  says('past a quadrillion they say "' + money(1e21) + '"', 'the page quotes what money() says past a quadrillion');
  says('the warning "' + G.evaluate(Object.assign({}, EXAMPLES[2], { minutesPerRun: 1e12, runsPerWeek: 1e12 }), BRIEF).warnings[0] + '"', 'and the warning that goes with it');

  // --- Section 9: what the page tells slide builders is true ---
  says('`CostMath.number(a - b)`, which prints ' + C.number(32.8 - 17.4), 'builders: number(32.8 - 17.4) prints ' + C.number(32.8 - 17.4));
  says('`String(a - b)`, which prints ' + String(32.8 - 17.4), 'builders: and String() of the same difference prints ' + String(32.8 - 17.4));
  ['metricText', 'reason', 'rule', 'blocked'].forEach(function (key) { ok(key in c.gates.cost, 'builders: result.gates.cost.' + key + ' exists'); });
  ok(typeof c.summary === 'string' && Array.isArray(c.warnings) && Array.isArray(c.inputProblems), 'builders: result.summary, .warnings and .inputProblems exist');
  ['companyLabel', 'cashPerDay', 'formatWeeks'].forEach(function (fn) { ok(typeof G[fn] === 'function', 'builders: Gates.' + fn + '() exists'); });
  ['aboutMoney', 'frontierSummary', 'seconds', 'breakEvenSeconds', 'money', 'cents', 'shortMoney', 'number', 'volumeCost', 'tier', 'tiers'].forEach(function (fn) {
    ok(typeof C[fn] === 'function', 'builders: CostMath.' + fn + '() exists');
  });
  var pageNames = (doc.split('## 9.')[1] || '').match(/\b(?:CostMath|Gates)\.[A-Za-z]+/g) || [];
  ok(pageNames.length >= 8 && pageNames.every(function (n) { var parts = n.split('.'); return typeof (parts[0] === 'Gates' ? G : C)[parts[1]] === 'function'; }),
    'builders: every CostMath / Gates function named in section 9 exists (' + pageNames.length + ' mentions)', pageNames.join(' '));

  // --- House rules, as the page states them ---
  rowIs('1', ['Cost', 'A year of running costs is more than this share of a year of return', C.percent(BRIEF.houseRules.costMaxShareOfReturn)], 'house-rule table: cost limit');
  rowIs('2', ['Return', 'The yearly return is under this amount *and* it takes no days off the cash cycle', money(BRIEF.houseRules.minReturnPerYear)], 'house-rule table: return floor');
  rowIs('3', ['Effort', 'Payback takes longer than this', BRIEF.houseRules.maxPaybackWeeks + ' weeks'], 'house-rule table: payback limit');
  rowIs('4', ['Potential', 'Growth is below this, *or* nobody owns the freed time', BRIEF.houseRules.minGrowth + TIMES], 'house-rule table: growth minimum');
  // The cash-days paragraph: its example is the code's own figure and verdicts.
  var slotEg = { lens: 'product', tier: 'code', minutesPerRun: 15.4 * 60 / BRIEF.rates.workWeeks, runsPerWeek: 1, growth: 1, ownerNamed: true, touchesCashPath: true };
  var egNoDays = G.evaluate(Object.assign({}, slotEg, { daysOffCashCycle: 0 }), BRIEF);
  var egOneDay = G.evaluate(Object.assign({}, slotEg, { daysOffCashCycle: 1 }), BRIEF);
  ok(!egNoDays.gates['return'].pass && egOneDay.gates['return'].pass, 'the cash-days example: NO with no days off the cash cycle, PASS with one');
  says('frees ' + C.number(egNoDays.hoursFreedPerYear) + ' hours a year at ' + money(BRIEF.rates.loadedHourly) + ' an hour returns ' + money(egNoDays.returnPerYear) + ' a year',
    'the cash-days example shows the code\'s own hours, rate and return');
  says('The same ' + money(egOneDay.returnPerYear) + ' with one day off the cash cycle stays in', 'and the one-day case');
}


/* =============================================================================
 * Run
 * ========================================================================== */
async function main() {
  var missing = Object.keys(FILES).filter(function (k) { return !fs.existsSync(FILES[k]); });
  if (missing.length) {
    console.log('FAIL  required files exist\n        missing: ' + missing.map(function (k) { return path.relative(ROOT, FILES[k]); }).join(', ') +
      (missing.indexOf('data') !== -1 ? '\n        run: node tools/build-data.js' : ''));
    process.exit(1);
  }

  // A file that will not even load is nearly always a typing slip: a missing
  // comma or quote mark. Say which file and where, and stop.
  function loadOrExplain(file) {
    try {
      return require(file);
    } catch (err) {
      var where = String(err && err.stack || err).split('\n').slice(0, 5).join('\n        ');
      console.log('FAIL  ' + path.relative(ROOT, file) + ' can be read\n        ' + where);
      if (file === FILES.your) {
        console.log('        This is usually a missing comma or quote mark near the line shown above. Undo your last edit and try again.');
      }
      process.exit(1);
    }
  }

  var build = loadOrExplain(path.join(__dirname, 'build-data.js'));
  var BENCHLM = loadOrExplain(FILES.data);
  var YOUR = loadOrExplain(FILES.your);
  var C = loadOrExplain(FILES.cost);
  var G = loadOrExplain(FILES.gates);

  // The libraries must not change the data they are given.
  var dataBefore = JSON.stringify(BENCHLM);
  var yourBefore = JSON.stringify(YOUR);

  testCsvAndData(build, BENCHLM);
  testCostMath(C, BENCHLM);
  testGates(G, C);
  testYour(YOUR, G, C);
  testLoading(YOUR, BENCHLM);
  testTies(G);
  testCloseCalls(G);
  testUnusableInputs(G, C);
  testFormatters(G, C);
  testCompanyLabel(G, C, YOUR);
  testMathDoc(G, C);

  section('5. Nothing was changed along the way');
  ok(JSON.stringify(BENCHLM) === dataBefore, 'the libraries left BENCHLM untouched');
  ok(JSON.stringify(YOUR) === yourBefore, 'the libraries left YOUR untouched');

  await testBrowser(snapshot(BENCHLM, C, G, YOUR));

  console.log('\n' + (failed === 0 ? 'ALL PASS' : 'FAILED') + ': ' + passed + ' passed, ' + failed + ' failed' +
    (notes ? ', ' + notes + ' note' + (notes === 1 ? '' : 's') : ''));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function (err) {
  console.log('FAIL  the test run crashed\n        ' + (err && err.stack || err));
  process.exit(1);
});
