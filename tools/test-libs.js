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
  near(G.evaluate(Object.assign({}, service, { capacityConversion: 7 }), BRIEF).capacityValue, 40000, 'capacityConversion above 1 is treated as 1');
  is(G.evaluate(Object.assign({}, service, { lens: 'product', capacityConversion: 1 }), BRIEF).capacityValue, 0, 'the product lens has no capacity value');

  section('3. Gate boundaries');
  // RETURN: under the floor is NO unless it touches the cash path.
  var small = baseCandidate({ minutesPerRun: 2, runsPerWeek: 10, touchesCashPath: false, buildHours: 1, rolloutHours: 0, upkeepHoursPerMonth: 0 });
  var smallOff = G.evaluate(small, BRIEF);
  is(smallOff.returnPerYear, 500, 'a $500-a-year task');
  ok(!smallOff.gates['return'].pass && smallOff.firstNo === 'return', 'is NO at Return when it is off the cash path');
  ok(G.evaluate(Object.assign({}, small, { touchesCashPath: true }), BRIEF).gates['return'].pass, 'and passes Return when it touches the cash path');
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
      if (inForce[group][key] !== YOUR[group][key]) mismatched.push(group + '.' + key);
    });
  });
  ok(mismatched.length === 0, 'Gates.defaultAssumptions() carries every rate, company value, token count and house rule from your-numbers.js', mismatched.join(', '));
  same(C.tokens(), YOUR.tokens, 'CostMath uses your task size by default');
  is(G.minuteRule(), YOUR.rates.workWeeks * YOUR.rates.loadedHourly / 60, 'minuteRule() with no arguments uses your rates');
  is(G.cashPerDay(), YOUR.company.annualRevenue / 365, 'cashPerDay() with no arguments uses your example revenue');
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
    formats: [0, 0.00045, 0.45, 45, 3600, 15000, -48270].map(CostMath.money)
      .concat([333.33, 1.5].map(CostMath.ratio)).concat([0.218, 0.00015].map(CostMath.percent))
      .concat([CostMath.aboutMoney(54794.52)]),
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
