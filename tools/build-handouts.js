#!/usr/bin/env node
/*
 * tools/build-handouts.js: build the printed worksheet.
 *
 *   node tools/build-handouts.js              write handouts/worksheet.html and handouts/worksheet.pdf
 *   node tools/build-handouts.js --shots      also render each PDF page to PNG, in colour and in grey,
 *                                             into out/handouts/ (or --shots some/dir)
 *   node tools/build-handouts.js --check      write nothing; exit 1 if handouts/worksheet.html is not
 *                                             what the current numbers would produce (it is stale), or
 *                                             if worksheet.pdf is older than the HTML or a stylesheet
 *   node tools/build-handouts.js --out dir    write worksheet.html and worksheet.pdf into another folder
 *                                             (to try a change without touching the real handout)
 *
 * WHY A BUILD STEP
 *   The sheet is paper: it cannot recalculate. So every figure printed on it is
 *   worked out here, from the same code the deck and the screener use
 *   (deck/lib/cost-math.js, deck/lib/gates-core.js) and the same file the
 *   speaker edits (deck/content/your-numbers.js), and written into the HTML.
 *   Change a rate or a house rule, run this again, and the paper agrees with
 *   the deck. Nothing in handouts/worksheet.html is typed by hand: edit this
 *   file (the words and the layout) or handouts/handout.css (the look).
 *
 * WHAT IT CHECKS BEFORE IT WRITES ANYTHING
 *   1. The paper method is the deck's method. The sheet asks for sums a person
 *      can do with a pen (minutes a week x $25; a one-time cost against half of
 *      what is left over). paperWalk() below does exactly those sums, with only
 *      the constants printed on the sheet, and its verdicts are compared with
 *      Gates.evaluate for the three example candidates and for 3,000 seeded
 *      random ones. The example printed on the sheet ("Invoice follow-up
 *      reminders") must come out the same to the cent.
 *   2. The exercise copy matches the slides (a warning, not a failure: the
 *      slides belong to someone else).
 *
 * WHAT IT CHECKS ON THE PAGE AND THE PDF
 *   Both fonts loaded; nothing overflows either side or any cell; every box to
 *   write in is at least 8 mm tall; the title stack is flush to its measure;
 *   the PDF is exactly two US Letter pages. The page and the PDF are written
 *   under temporary names and only replace the real ones when all of this
 *   passes, so a failed build never leaves a clipped handout behind.
 *
 * The title stack is fitted here with the deck's own THEME.fitStack (in a
 * scratch page), and the fitted widths are baked into the HTML, so the printed
 * page never depends on a script.
 *
 * Needs Node 22 and a globally installed Playwright. pdftoppm (poppler) is used
 * for --shots when it is installed; without it the pages are captured from the
 * HTML instead.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let OUT_DIR = path.join(ROOT, 'handouts');
const CSS_FONTS = path.join(ROOT, 'deck', 'theme', 'fonts.css');
const CSS_TOKENS = path.join(ROOT, 'deck', 'theme', 'tokens.css');
const CSS_HANDOUT = path.join(ROOT, 'handouts', 'handout.css');
const THEME_JS = path.join(ROOT, 'deck', 'theme', 'theme.js');
const SLIDES_ACT3 = path.join(ROOT, 'deck', 'slides', 'a3-yourturn.js');

const CM = require(path.join(ROOT, 'deck', 'lib', 'cost-math.js'));
const Gates = require(path.join(ROOT, 'deck', 'lib', 'gates-core.js'));
const YOUR = require(path.join(ROOT, 'deck', 'content', 'your-numbers.js'));
const BENCH = require(path.join(ROOT, 'deck', 'lib', 'benchlm-data.js'));
const QR = require(path.join(ROOT, 'deck', 'lib', 'qr.js'));

const MM_PER_PX = 25.4 / 96;
const MIN_WRITE_MM = 8;             // a box you write in is never shorter than this
const TIMES = '×';
const MINUS = '−';
const ARROW = '→';
const DOT = ' · ';

/* Playwright is installed globally, not in this repository. */
function requirePlaywright() {
  try { return require('playwright'); } catch (e) { /* try the global folders next */ }
  const roots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()); } catch (e) { /* no npm */ }
  for (const root of roots) {
    try { return require(path.join(root, 'playwright')); } catch (e) { /* keep looking */ }
  }
  console.error('Playwright was not found. Install it once, globally:  npm install -g playwright');
  process.exit(2);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fail(message) {
  console.error('FAIL  ' + message);
  process.exit(1);
}


/* =============================================================================
 * 1. The words
 * -----------------------------------------------------------------------------
 * On-screen copy from docs/BRIEF.md (sections 4 and 8) and the labels the
 * screener uses, so the paper, the slides and the screen say the same thing.
 * No figure is typed here except the lengths of the exercises, which are part
 * of the brief's copy ("Exercise 1 · 10 minutes") and are checked against the
 * slides below.
 * ========================================================================== */

const COPY = {
  ex1: {
    kicker: 'Exercise 1 · 10 minutes',
    headline: 'Inventory two weeks of real work.',
    prompts: [
      'What did you do more than twice?',
      'What did you copy from one place to another?',
      'What did you wait on?',
      'What did you dread?'
    ],
    columns: ['Task', 'How often', 'Minutes each time', 'Who does it'],
    rows: 12
  },
  ex2: {
    kicker: 'Exercise 2 · 5 minutes',
    headline: 'Pick three.',
    how: 'Circle three in your list, then name them here.',
    picks: ['One you’d love to pitch', 'One that’s boring', 'One you’d be embarrassed to bring up']
  },
  ex3: {
    kicker: 'Exercise 3 · 10 minutes',
    headline: 'Run your three through the gates.',
    how: 'Start with the minutes, then take the gates in order. Stop at the first NO.'
  },
  minutesLine: 'Minutes are the raw material. Money is what they turn into.',
  /* Gate 2 on paper: the tick alone exempts nothing (Gates' RETURN rule); the days do. */
  cashDaysLine: 'A tick is not enough: only the days count.',
  cashPath: 'quote → order → pick → ship → invoice → collect',
  ladder: ['Don’t automate', 'Spreadsheet formula', 'Plain code', 'Small model', 'Frontier model', 'Agent'],
  ladderLine: 'Climb only as far as the task makes you.',
  standardLabel: 'The Waypoint standard',
  standard: 'A win only counts with the task, the prompt, the output, and the time saved.',
  /* A gloss tied to one task size: printed only while the sheet uses that size. */
  taskSize: { in: 2000, out: 500, text: 'about a page and a half read, a few paragraphs written' },
  /* The record-sleeve catalogue line (docs/DIRECTION.md, Part 1, section 7). The venue's
     coordinates could not be sourced, so the line names the city instead. */
  catalogue: (eventName) => 'WAYPOINT · ' + eventName + ' · NEW ORLEANS'
};

/* The price list, printed once, cheapest first, and the CostMath tier that prices each.
   ("Don't automate" is not a price: it stays on the ladder at the foot.) If the example
   runs on a tier that is not listed here, it is added so the example can be traced. */
const TOOLS = [
  { name: 'Spreadsheet or plain code', tier: 'code' },
  { name: 'Small model', tier: 'small' },
  { name: 'Frontier model', tier: 'frontier' }
];

const EXAMPLE_NAME = 'Invoice follow-up reminders';


/* =============================================================================
 * 2. The figures
 * ========================================================================== */

/* Dollars for a line a reader adds up: an exact zero is "$0", not "about $0". */
function dollars(x) {
  return x === 0 ? '$0' : CM.money(x);
}

function facts() {
  const a = Gates.defaultAssumptions();
  const rates = a.rates;
  const rules = a.houseRules;
  const tokens = CM.tokens();
  const event = YOUR.event || {};
  const speaker = YOUR.speaker || {};
  const meta = BENCH.meta || {};

  const minuteRule = Gates.minuteRule();
  const dearerHourly = CM.tidy(rates.loadedHourly * 2);
  const minuteRuleDearer = Gates.minuteRule(dearerHourly);
  const upkeepYearPerMonthlyHour = CM.tidy(12 * rates.builderHourly);

  const per1000 = {};
  CM.tierIds().forEach((id) => { per1000[id] = CM.tier(id, tokens).per1000; });

  // The rule sentences are the library's own (the screener shows the same ones).
  const neutral = Gates.evaluate({});
  const ruleText = {};
  Gates.ORDER.forEach((id) => { ruleText[id] = neutral.gates[id].rule; });

  const candidates = Array.isArray(YOUR.candidates) ? YOUR.candidates : [];
  const example = candidates.find((c) => c && c.name === EXAMPLE_NAME) ||
    candidates.find((c) => Gates.evaluate(c).verdict === 'YES') || candidates[candidates.length - 1];
  if (!example) { fail('window.YOUR.candidates is empty: the sheet has no example to print.'); }

  return {
    a, rates, rules, tokens, event, speaker, meta,
    minuteRule, dearerHourly, minuteRuleDearer, upkeepYearPerMonthlyHour, per1000, ruleText,
    gates: Gates.GATES,
    links: YOUR.links || {},
    example,
    exampleResult: Gates.evaluate(example),
    smallModel: CM.tier('small', tokens).modelName,
    frontierModel: CM.tier('frontier', tokens).modelName,
    source: 'Source: ' + (meta.source || 'BenchLM leaderboard export') + (meta.retrieved ? ', ' + meta.retrieved : '')
  };
}


/* =============================================================================
 * 3. The paper method, and the proof that it is the deck's method
 * -----------------------------------------------------------------------------
 * paperWalk() is the worksheet worked by hand: the same boxes, top to bottom,
 * using only the constants printed on the sheet. It deliberately does NOT call
 * Gates. checkPaper() then compares the two.
 * ========================================================================== */

const HAIR = 1e-9;
function same(x, y) {
  if (x === y) { return true; }
  if (!isFinite(x) || !isFinite(y)) { return false; }
  return Math.abs(x - y) <= HAIR * Math.max(Math.abs(x), Math.abs(y), 1e-12);
}
function over(x, y) { return !same(x, y) && x > y; }
function under(x, y) { return !same(x, y) && x < y; }

function paperWalk(c, f) {
  const service = c.lens === 'service';

  // START: THE MINUTES
  const minutesAWeek = c.minutesPerRun * c.runsPerWeek;
  let dollarsAYear = minutesAWeek * f.minuteRule;
  if (service) {
    const hoursAYear = minutesAWeek * f.rates.workWeeks / 60;
    const paidWork = hoursAYear * (c.capacityConversion || 0) * (c.billableMarginPerHour || 0);
    dollarsAYear = Math.max(dollarsAYear, paidWork);                  // the larger of the two, never both
  }

  // COST
  const thousandsOfRuns = c.runsPerWeek * f.rates.workWeeks / 1000;
  const toRun = thousandsOfRuns * f.per1000[c.tier];
  const tools = (c.toolsPerMonth || 0) * 12;
  const costAYear = toRun + tools;
  const costNo = over(costAYear, f.rules.costMaxShareOfReturn * dollarsAYear);

  // RETURN
  // Under the floor is a NO unless it takes days off the cash cycle. Being on the cash
  // path is not enough; a service candidate has no cash days (as in Gates).
  const cashSooner = !service && c.daysOffCashCycle > 0;
  const returnNo = under(dollarsAYear, f.rules.minReturnPerYear) && !cashSooner;

  // EFFORT
  const oneTime = ((c.buildHours || 0) + (c.rolloutHours || 0)) * f.rates.builderHourly;
  const upkeepAYear = (c.upkeepHoursPerMonth || 0) * f.upkeepYearPerMonthlyHour;
  const leftOver = dollarsAYear - costAYear - upkeepAYear;
  const never = !(leftOver > 0) || same(leftOver, 0);
  const paybackWeeks = never ? Infinity : (oneTime === 0 ? 0 : oneTime / (leftOver / 52));
  const effortNo = never || over(paybackWeeks, f.rules.maxPaybackWeeks);
  // the shortcut printed on the sheet: the one-time cost against a share of what is left over
  const shortcutNo = never || over(oneTime, leftOver * f.rules.maxPaybackWeeks / 52);

  // POTENTIAL
  const potentialNo = under(c.growth, f.rules.minGrowth) || !c.ownerNamed;

  // More than one left standing: the two-year value
  const twoYear = (dollarsAYear - costAYear) * (1 + c.growth) - oneTime - 2 * upkeepAYear;

  return {
    minutesAWeek, dollarsAYear, thousandsOfRuns, toRun, tools, costAYear, oneTime, upkeepAYear, leftOver, paybackWeeks, twoYear,
    pass: { cost: !costNo, 'return': !returnNo, effort: !effortNo, potential: !potentialNo },
    shortcutNo
  };
}

/* A small seeded generator, so the random candidates are the same on every run. */
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function checkPaper(f) {
  const problems = [];
  const near = (x, y) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));

  function compare(c, label, strict) {
    const r = Gates.evaluate(c);
    const p = paperWalk(r.candidate, f);
    Gates.ORDER.forEach((id) => {
      if (r.gates[id].pass !== p.pass[id]) {
        problems.push(label + ': paper says ' + (p.pass[id] ? 'PASS' : 'NO') + ' at ' + id + ', Gates says ' + (r.gates[id].pass ? 'PASS' : 'NO'));
      }
    });
    if (p.shortcutNo !== !r.gates.effort.pass) { problems.push(label + ': the payback shortcut disagrees with the Effort gate'); }
    if (!strict) { return; }
    const pairs = [
      ['dollars a year', p.dollarsAYear, r.returnPerYear], ['cost a year', p.costAYear, r.costPerYear],
      ['one-time cost', p.oneTime, r.effortOnce], ['upkeep a year', p.upkeepAYear, r.effortPerYear],
      ['left over a year', p.leftOver, r.yearlyNetBeforeBuild], ['two-year value', p.twoYear, r.twoYearValue]
    ];
    pairs.forEach(([what, paper, lib]) => {
      if (!near(paper, lib)) { problems.push(label + ': ' + what + ' is ' + paper + ' on paper and ' + lib + ' in Gates'); }
    });
    if (isFinite(r.paybackWeeks) !== isFinite(p.paybackWeeks) || (isFinite(r.paybackWeeks) && !near(p.paybackWeeks, r.paybackWeeks))) {
      problems.push(label + ': payback is ' + p.paybackWeeks + ' weeks on paper and ' + r.paybackWeeks + ' in Gates');
    }
  }

  // The speaker's example candidates, figure for figure. (A tier the sheet does not
  // print, 'mid' or 'premium', still has a price per 1,000 runs in f.per1000.)
  (YOUR.candidates || []).forEach((c) => compare(c, 'Example "' + c.name + '"', true));

  // 3,000 made-up candidates, verdict for verdict.
  const next = rng(20261113);
  const pick = (list) => list[Math.floor(next() * list.length)];
  for (let i = 0; i < 3000; i++) {
    const service = next() < 0.3;
    compare({
      id: 'r' + i, name: 'random ' + i,
      lens: service ? 'service' : 'product',
      minutesPerRun: pick([0, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 45, 60]),
      runsPerWeek: pick([0, 1, 2, 5, 10, 20, 40, 60, 100, 150, 250, 400, 1000, 5000]),
      tier: pick(['code', 'small', 'frontier']),
      toolsPerMonth: pick([0, 0, 20, 50, 100, 125, 240, 250, 500, 1200]),
      buildHours: pick([0, 2, 4, 8, 16, 24, 40, 80, 160, 400]),
      rolloutHours: pick([0, 0, 2, 6, 8, 20, 40]),
      upkeepHoursPerMonth: pick([0, 0.5, 1, 1.5, 2, 4, 8, 30]),
      growth: pick([0.5, 0.8, 1, 1, 1.2, 1.5, 2, 3]),
      touchesCashPath: next() < 0.4,
      daysOffCashCycle: pick([0, 0, 1, 2, 5]),
      ownerNamed: next() < 0.6,
      capacityConversion: service ? pick([0, 0.25, 0.5, 0.75, 1]) : undefined,
      billableMarginPerHour: service ? pick([0, 40, 95, 150]) : undefined
    }, 'Random candidate ' + i, true);
  }
  return problems;
}

/* The exercise kickers and prompts are the brief's copy. Check the slides say the same. */
function checkAgainstSlides() {
  const warnings = [];
  let text;
  try { text = fs.readFileSync(SLIDES_ACT3, 'utf8'); } catch (e) { return ['could not read ' + path.relative(ROOT, SLIDES_ACT3) + ' to compare the exercise copy']; }
  const wanted = [COPY.ex1.kicker, COPY.ex2.kicker, COPY.ex3.kicker, COPY.ex1.headline, COPY.ex2.headline, COPY.ex3.headline]
    .concat(COPY.ex1.prompts, COPY.ex2.picks);
  wanted.forEach((line) => {
    if (text.indexOf(line) < 0) { warnings.push('the slides in deck/slides/a3-yourturn.js do not contain "' + line + '"'); }
  });
  return warnings;
}


/* =============================================================================
 * 4. The markup
 * ========================================================================== */

/* An arrow, drawn: the embedded fonts have no arrow glyph, and a fallback font must never print. */
function arrows(text) {
  return esc(text).split(ARROW).map((part) => part.trim()).join(' <i class="arr"></i> ');
}

/* The last three words of a line kept together, so a prompt never ends on one word. */
function keepEnd(text) {
  const words = String(text).split(' ');
  if (words.length < 5) { return esc(text); }
  return esc(words.slice(0, -3).join(' ')) + ' <span class="nw">' + esc(words.slice(-3).join(' ')) + '</span>';
}

/* A hyphenated word is never broken at its hyphen. */
function noHyphenBreak(text) {
  return esc(text).replace(/(\S+-\S+)/g, '<span class="nw">$1</span>');
}

/* An operator inside the fine print, heavy enough to survive a photocopier. */
function o(sign) {
  return '<b class="o">' + esc(sign) + '</b>';
}

/* A default (a rate or a house rule): printed on a dashed line. */
function d(text) {
  return '<span class="dflt">' + esc(text) + '</span>';
}

/* The library's rule sentence, with its limit marked as a default. */
function ruleHtml(id, text) {
  const patterns = {
    cost: /\d[\d.,]*%/,
    'return': /\$\d[\d,]*(?:\.\d+)?/,
    effort: /\d[\d.,]* weeks?/,
    potential: /\d[\d.,]*×/
  };
  const m = patterns[id] ? patterns[id].exec(text) : null;
  if (!m) { return esc(text); }
  return esc(text.slice(0, m.index)) + d(m[0]) + esc(text.slice(m.index + m[0].length));
}

/* The printed hints inside a box: { l: '$' } at the left, { r: 'min' } small at the right. */
function hints(unit) {
  const u = unit || {};
  return (u.l ? '<i class="u">' + esc(u.l) + '</i>' : '') + (u.r ? '<i class="u is-r">' + esc(u.r) + '</i>' : '');
}

/* A box to write in. */
function box(unit) {
  return '<td class="w">' + hints(unit) + '</td>';
}

/* Two boxes in one cell, for a sum done in one line: a count, then what it comes to. */
function splitBox(left, right, cls) {
  return '<td class="w"><div class="split' + (cls ? ' ' + cls : '') + '"><span>' + hints(left) + '</span><span>' + hints(right) + '</span></div></td>';
}

function three(cell) {
  return cell + cell + cell;
}

/* One row of the scorecard: what to work out, the example, three boxes. */
function row(o) {
  const cls = [o.sum ? 'is-sum' : '', o.last ? 'is-last' : '', o.cls || ''].filter(Boolean).join(' ');
  return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' +
    '<td class="lab"><span class="t">' + (o.op ? '<span class="op">' + esc(o.op) + '</span>' : '') + o.t + '</span>' +
    (o.fine ? '<span class="fine' + (o.fineCls ? ' ' + o.fineCls : '') + '">' + o.fine + '</span>' : '') + '</td>' +
    '<td class="ex">' + o.ex + '</td>' +
    (o.cells || three(box(o.unit))) +
    '</tr>';
}

/* The head of a block: the minutes, then each gate. Its rule sits at the right. */
function blockHead(o) {
  return '<tr class="blk"><td colspan="5"><div class="blk-head">' +
    (o.gate ? '<i class="glyph"></i>' : '') +
    '<span class="label gate-n">' + esc(o.kicker) + '</span>' +
    '<span class="gate-name">' + esc(o.name) + '</span>' +
    '<span class="voice">' + esc(o.voice) + '</span>' +
    (o.note ? '<span class="note fine"><b class="tag">' + esc(o.tag || 'House rule') + '</b> ' + o.note + '</span>' : '') +
    '</div></td></tr>';
}

/* A stylesheet's address as seen from the folder the page is written to. */
function href(file) {
  return path.relative(OUT_DIR, file).split(path.sep).join('/');
}

function render(f, fit) {
  const ev = f.event;
  const sp = f.speaker;
  const ex = f.example;
  const r = f.exampleResult;
  const p = paperWalk(r.candidate, f);
  const money = CM.money;
  const num = CM.number;

  const rate = money(f.rates.loadedHourly);
  const builder = money(f.rates.builderHourly);
  const weeks = num(f.rates.workWeeks);
  const minute = money(f.minuteRule);
  const upkeepRate = money(f.upkeepYearPerMonthlyHour);
  const gateById = {};
  f.gates.forEach((g, i) => { gateById[g.id] = { n: i + 1, label: g.label, question: g.question }; });

  /* ---- a way back to the tool, when the speaker has given one. The first link set
     gets a QR code in the masthead, where the sheet has room for one; a second link
     is printed in words in the footnote on the back. Nothing prints while both are empty. ---- */
  const links = [
    { label: 'The screener', url: String(f.links.screenerUrl || '').trim() },
    { label: 'The deck and the code', url: String(f.links.repoUrl || '').trim() }
  ].filter((l) => l.url);
  /* the address as a person types it: no scheme, and it breaks only after a slash */
  const shortUrl = (url) => esc(url.replace(/^https?:\/\//, '').replace(/\/$/, '')).split('/').join('/<wbr>');
  const qrBlock = links.length
    ? '<div class="link"><div class="link-t"><span class="label is-tight">' + esc(links[0].label) + '</span><span class="url">' + shortUrl(links[0].url) + '</span></div>' +
      QR.toSVG(links[0].url, { quiet: 2, dark: '#000', light: '#fff', title: links[0].label }) + '</div>'
    : '';
  const linkWords = links.slice(1).map((l) => esc(l.label) + ': ' + esc(l.url) + '. ').join('');

  /* ---- the title stack and its slab ---- */
  const stackLines = fit.lines.map((ln) =>
    '<span class="ln" style="font-stretch:' + ln.stretch + ';letter-spacing:' + ln.tracking + ';margin:0 ' + ln.right + ' ' + ln.below + ' ' + ln.left + '">' + esc(ln.text) + '</span>'
  ).join('');

  const signOff = [ev.title, ev.name, ev.date].filter(Boolean).join(DOT);

  /* ======================================================================
   * Side 1
   * ==================================================================== */
  const side1 =
    '<section class="sheet side-1">' +
    '<header class="mast">' +
      '<p class="mast-top"><span class="label">A ' + esc(ev.minutes) + '-minute workshop' + esc(DOT) + 'Worksheet</span>' +
      '<span class="label">' + esc(COPY.catalogue(ev.name)) + '</span></p>' +
      '<div class="mast-main">' +
        '<h1 class="hd-stack" style="font-size:' + fit.size + '">' + stackLines + '</h1>' +
        '<div class="slab"><span class="slab-no" style="font-size:' + fit.noSize + '">No</span></div>' +
        '<div class="mast-side">' + qrBlock + '<p class="voice">' + esc(ev.subtitle).replace(' for ', '<br>for ') + '</p></div>' +
      '</div>' +
      '<p class="credit"><span><b>' + esc(sp.name) + '</b>' + esc(DOT + sp.role + ', ' + sp.company) + '</span>' +
      '<span>' + esc([ev.name, ev.date, ev.time, ev.venue].filter(Boolean).join(DOT)) + '</span></p>' +
    '</header>' +

    '<section class="ex ex-1">' +
      '<div class="ex-head"><div><span class="label">' + esc(COPY.ex1.kicker) + '</span>' +
      '<h2 class="headline">' + esc(COPY.ex1.headline) + '</h2></div></div>' +
      '<ol class="prompts">' + COPY.ex1.prompts.map((q, i) => '<li><span class="num">' + (i + 1) + '</span><span>' + keepEnd(q) + '</span></li>').join('') + '</ol>' +
      '<table class="ruled inv"><colgroup><col class="c-n"><col><col class="c-often"><col class="c-min"><col class="c-who"></colgroup>' +
      '<thead><tr><th class="n"></th>' + COPY.ex1.columns.map((c) => '<th><span class="label is-tight">' + esc(c) + '</span></th>').join('') + '</tr></thead>' +
      '<tbody>' + Array.from({ length: COPY.ex1.rows }, (_, i) =>
        '<tr><td class="n">' + String(i + 1).padStart(2, '0') + '</td><td data-write></td><td data-write></td><td data-write></td><td data-write></td></tr>').join('') +
      '</tbody></table>' +
    '</section>' +

    '<section class="ex ex-2">' +
      '<div class="ex-head"><div><span class="label">' + esc(COPY.ex2.kicker) + '</span>' +
      '<h2 class="headline">' + esc(COPY.ex2.headline) + '</h2></div>' +
      '<p class="body how">' + esc(COPY.ex2.how) + '</p></div>' +
      '<ol class="picks">' + COPY.ex2.picks.map((q, i) =>
        '<li data-write><b class="plate">' + 'ABC'.charAt(i) + '</b><span class="ask">' + esc(q) + '</span><span class="write"></span></li>').join('') + '</ol>' +
    '</section>' +

    '<footer class="foot"><span class="label turn">Turn over' + esc(DOT) + esc(COPY.ex3.kicker.split(DOT)[0]) + '</span>' +
    '<span class="label is-tight">' + esc(signOff) + '</span></footer>' +
    '</section>';

  /* ======================================================================
   * Side 2: the scorecard
   * ==================================================================== */

  /* ---- the example column, worked with the sums the sheet asks for ---- */
  const c = r.candidate;
  const exService = c.lens === 'service';
  const exPer1000 = f.per1000[c.tier];
  const small = (s) => '<small>' + s + '</small>';
  const x = ' ' + o(TIMES) + ' ';
  const xp = ' ' + TIMES + ' ';                 // the same sign, plain, for the example's handwriting
  const minus = ' ' + o(MINUS) + ' ';
  const div = ' ' + o('÷') + ' ';
  const dp = ' ÷ ';

  /* After the example's first NO it stops, as the sheet tells everyone to: the
     rows of the gates after that NO are left empty in the example column too. */
  const exOut = {};
  let seenNo = false;
  Gates.ORDER.forEach((id) => { exOut[id] = seenNo; if (!r.gates[id].pass) { seenNo = true; } });
  const exAt = (id, html) => (exOut[id] ? '' : html);

  /* ---- the example's verdict as small gates: after a NO, the rest are not yet ---- */
  const exGates = Gates.ORDER.map((id) => {
    if (exOut[id]) { return '<i class="gate-s"></i>'; }
    return r.gates[id].pass ? '<i class="gate-s is-pass"></i>' : '<i class="gate-s is-no"></i>';
  }).join('');
  const exVerdict = r.verdict === 'YES' ? 'passes all four' : 'NO at ' + r.gates[r.firstNo].label;

  /* ---- the minute rule, printed only as exactly as a pen can use it ---- */
  const wholeCents = Math.abs(f.minuteRule * 100 - Math.round(f.minuteRule * 100)) < 1e-9;
  const minutesRow = wholeCents
    ? {
      t: 'minutes a week' + x + d(minute) + ' = return',
      fine: 'At ' + d(rate) + ' an hour, ' + d(weeks) + ' weeks. At ' + esc(money(f.dearerHourly)) + ' an hour: ' + esc(money(f.minuteRuleDearer)) + '.',
      ex: esc(dollars(p.dollarsAYear)) + small(esc(num(p.minutesAWeek)) + xp + esc(minute))
    }
    : {
      t: 'minutes a week, in dollars = return',
      fine: 'Minutes a week' + x + d(weeks) + div + '60' + x + d(rate) + ' an hour.',
      ex: esc(dollars(p.dollarsAYear)) + small(esc(num(p.minutesAWeek)) + xp + esc(weeks) + dp + '60' + xp + esc(rate))
    };
  if (exService && p.dollarsAYear !== p.minutesAWeek * f.minuteRule) {
    minutesRow.ex = esc(dollars(p.minutesAWeek * f.minuteRule)) + small(esc(num(p.minutesAWeek)) + xp + esc(minute));
  }

  /* ---- hours a year from minutes a week: one division when it is a tidy one ---- */
  const perHour = 60 / f.rates.workWeeks;
  const tidyDivisor = Math.abs(perHour * 100 - Math.round(perHour * 100)) < 1e-9;
  const hoursRule = tidyDivisor
    ? 'Minutes a week' + div + esc(num(perHour)) + ' = hours a year'
    : 'Minutes a week' + x + d(weeks) + div + '60 = hours a year';
  const exHours = p.minutesAWeek * f.rates.workWeeks / 60;
  const serviceEx = exService
    ? esc(dollars(r.capacityValue)) + small(esc(num(exHours)) + ' h' + xp + esc(num(c.capacityConversion || 0)) + xp + esc(money(c.billableMarginPerHour || 0)))
    : '—';

  /* ---- the price list, printed once ---- */
  const tools = TOOLS.slice();
  if (!tools.some((t) => t.tier === c.tier)) {
    tools.push({ name: CM.tier(c.tier, f.tokens).label, tier: c.tier });
    tools.sort((m, n) => f.per1000[m.tier] - f.per1000[n.tier]);
  }
  const priceList = '<td class="prices" colspan="4"><ul class="price-list">' + tools.map((t) =>
    '<li><span>' + esc(t.name) + '</span> <b>' + esc(money(f.per1000[t.tier])) + '</b></li>').join('') + '</ul></td>';
  const runsAYear = c.runsPerWeek * f.rates.workWeeks;

  /* ---- the payback test, as a comparison a pen can make ---- */
  const half = f.rules.maxPaybackWeeks * 2 === 52;
  const shareLeft = p.leftOver * f.rules.maxPaybackWeeks / 52;
  const never = !(p.leftOver > 0) || same(p.leftOver, 0);
  const paybackEx = never
    ? '—' + small('none left: NO')
    : esc(dollars(shareLeft)) + small(esc(dollars(p.oneTime)) + (over(p.oneTime, shareLeft) ? ' is more: NO' : ' is less'));

  /* The dock, drawn in line: four bays that share their posts, on one floor line.
     Each door has its gate's number on the lintel and two panels: PASS rides high,
     NO sits on the floor. (The names do not fit a door at a size a pen-holder can
     read, so the label beside the docks says which number is which gate.) */
  const dock = '<td class="v"><div class="dock">' + f.gates.map((g, i) =>
    '<span class="bay"><i class="bay-n">' + (i + 1) + '</i><b class="say is-pass">Pass</b><b class="say is-no">No</b></span>').join('') + '</div></td>';

  const cashCell = '<td class="w"><div class="split">' +
    '<span><i class="tk"><i class="tick"></i> yes</i></span>' +
    '<span>' + hints({ r: 'days faster' }) + '</span></div></td>';

  const card =
    '<table class="ruled card"><colgroup><col class="c-label"><col class="c-ex"><col><col><col></colgroup><tbody>' +

    '<tr class="heads">' +
      '<td class="lead"><span class="label">One column each</span>' +
      '<span class="fine">A number on a dashed line is a default. Cross it out and write your own.</span></td>' +
      '<td><div class="col-head is-ex"><span class="label is-tight">Example</span><span class="fine">' + noHyphenBreak(ex.name) + '</span></div></td>' +
      COPY.ex2.picks.map((q, i) =>
        '<td data-write><div class="col-head"><div class="who"><b class="plate">' + 'ABC'.charAt(i) + '</b><span class="fine">' + esc(q) + '</span></div></div></td>').join('') +
    '</tr>' +

    /* ---- start: the minutes ---- */
    blockHead({ kicker: 'Start here', name: 'The minutes', voice: COPY.minutesLine }) +
    row({
      t: 'Minutes saved' + x + 'times a week',
      ex: esc(num(c.minutesPerRun)) + xp + esc(num(c.runsPerWeek)),
      cells: three(splitBox({ r: 'min' }, { r: 'times' }, 'is-even'))
    }) +
    row({
      op: '=', t: minutesRow.t, fine: minutesRow.fine, ex: minutesRow.ex,
      cells: three(splitBox({ r: 'min a week' }, { l: '$', r: 'a year' }, 'is-even'))
    }) +
    row({
      t: 'Service business: is this larger?', last: true,
      fine: hoursRule + '.<br>' + o(TIMES) + ' share that is paid work' + x + '$ margin an hour.',
      ex: serviceEx,
      cells: three(splitBox({ r: 'hours' }, { l: '$', r: 'if larger' }, 'is-even'))
    }) +

    /* ---- gate 1: cost ---- */
    blockHead({ gate: true, kicker: 'Gate ' + gateById.cost.n, name: gateById.cost.label, voice: gateById.cost.question, note: ruleHtml('cost', f.ruleText.cost) }) +
    '<tr class="is-prices"><td class="lab"><span class="t">What runs it? Price of 1,000 runs:*</span></td>' + priceList + '</tr>' +
    row({
      t: 'To run it for a year',
      fine: 'Times a week' + x + d(weeks) + div + '1,000' + x + 'the price.',
      ex: esc(dollars(p.toRun)) + small(esc(num(runsAYear)) + ' runs<br>' + esc(num(p.thousandsOfRuns)) + xp + esc(dollars(exPer1000))),
      cells: three(splitBox({ l: '$', r: 'price' }, { l: '$', r: 'a year' }, 'is-even'))
    }) +
    row({
      op: '+', t: 'tools = cost a year',
      fine: 'Tools, dollars a month' + x + '12, plus the line above.',
      ex: esc(dollars(p.costAYear)) + small(esc(dollars(p.toRun)) + ' + ' + esc(dollars(p.tools))),
      cells: three(splitBox({ l: '$', r: 'tools' }, { l: '$', r: 'cost' }, 'is-even'))
    }) +
    row({
      t: 'Cost test: ' + d(CM.percent(f.rules.costMaxShareOfReturn)) + ' of return', last: true,
      fine: 'Cost a year bigger than this? NO.',
      ex: esc(dollars(p.dollarsAYear * f.rules.costMaxShareOfReturn)) + small(esc(dollars(p.costAYear)) + (p.pass.cost ? ' is less' : ' is more: NO')),
      unit: { l: '$' }
    }) +

    /* ---- gate 2: return ---- */
    blockHead({ gate: true, kicker: 'Gate ' + gateById['return'].n, name: gateById['return'].label, voice: gateById['return'].question, note: ruleHtml('return', f.ruleText['return']) }) +
    row({
      t: 'On the cash path? Days faster?',
      fine: '<span class="nw">' + arrows(COPY.cashPath) + '.</span> ' + esc(COPY.cashDaysLine), fineCls: 'is-tight',
      ex: exAt('return', (c.touchesCashPath ? 'yes' : 'no') + (c.daysOffCashCycle > 0 ? small(esc(num(c.daysOffCashCycle)) + (c.daysOffCashCycle === 1 ? ' day' : ' days') + ' faster') : '')),
      cells: three(cashCell), last: true
    }) +

    /* ---- gate 3: effort ---- */
    blockHead({ gate: true, kicker: 'Gate ' + gateById.effort.n, name: gateById.effort.label, voice: gateById.effort.question, note: ruleHtml('effort', f.ruleText.effort) }) +
    row({
      t: 'Build and rollout hours' + x + d(builder), fine: 'The one-time cost.',
      ex: exAt('effort', esc(dollars(p.oneTime)) + small(esc(num((c.buildHours || 0) + (c.rolloutHours || 0))) + xp + esc(builder))),
      cells: three(splitBox({ r: 'hours' }, { l: '$' }))
    }) +
    row({
      t: 'Upkeep hours a month' + x + d(upkeepRate), fine: '12 months at ' + esc(builder) + ' an hour: upkeep for a year.',
      ex: exAt('effort', esc(dollars(p.upkeepAYear)) + small(esc(num(c.upkeepHoursPerMonth || 0)) + xp + esc(upkeepRate))),
      cells: three(splitBox({ r: 'hours' }, { l: '$' }))
    }) +
    row({
      op: '=', t: 'left over a year', fine: 'Return' + minus + 'cost' + minus + 'upkeep. None left: NO.',
      ex: exAt('effort', esc(dollars(p.leftOver))), unit: { l: '$' }
    }) +
    row({
      t: half ? 'Payback test: half of left over' : 'Payback test: left over' + x + d(num(f.rules.maxPaybackWeeks)) + div + '52', last: true,
      fine: 'One-time cost bigger than this? NO.<br>In weeks: one-time cost' + x + '52' + div + 'left over.',
      ex: exAt('effort', paybackEx), unit: { l: '$' }
    }) +

    /* ---- gate 4: potential ---- */
    blockHead({ gate: true, kicker: 'Gate ' + gateById.potential.n, name: gateById.potential.label, voice: gateById.potential.question, note: ruleHtml('potential', f.ruleText.potential) }) +
    row({ t: 'How many times bigger in a year?', fine: '1 = the same size' + esc(DOT) + '1.5 = half again' + esc(DOT) + '2 = double', ex: exAt('potential', esc(CM.ratio(c.growth))), unit: { r: 'times bigger' } }) +
    row({ t: 'Who owns the freed time?', fine: 'A named person who decides what it becomes.', ex: exAt('potential', c.ownerNamed ? 'named' : 'nobody'), unit: { r: 'a name' }, last: true }) +

    /* ---- the verdict ---- */
    '<tr class="is-verdict">' +
      '<td class="lab"><span class="gate-name">Verdict</span>' +
      '<span class="fine">' + f.gates.map((g, i) => '<b>' + (i + 1) + '</b> ' + esc(g.label)).join(esc(DOT)) + '. Circle PASS or NO at each gate. After a NO, stop.</span></td>' +
      '<td class="ex"><span class="dock-s">' + exGates + '</span>' + small(esc(exVerdict)) + '</td>' +
      three(dock) +
    '</tr>' +
    row({
      t: 'Two-year value',
      fine: 'If more than one passed: (return' + minus + 'cost)' + x + '<span class="nw">(1 ' + o('+') + ' times bigger)</span>' + minus + 'one-time' + minus + '2' + x + 'upkeep.',
      ex: r.verdict === 'YES' ? esc(dollars(r.twoYearValue)) : 'out' + small('a NO ends it'),
      unit: { l: '$', r: 'two years' }
    }) +
    '<tr class="is-pick"><td class="lab"><span class="gate-name">The math picks</span></td>' +
      '<td class="w" colspan="4" data-write><i class="u is-r">The highest two-year value: its letter and name</i></td></tr>' +
    '</tbody></table>' +
    '<p class="fine star">* List prices, for runs of ' + esc(num(f.tokens.in)) + ' tokens in and ' + esc(num(f.tokens.out)) + ' out each' +
      (f.tokens.in === COPY.taskSize.in && f.tokens.out === COPY.taskSize.out ? ' (' + esc(COPY.taskSize.text) + ')' : '') + '. ' +
      'Small model: ' + esc(f.smallModel) + '. Frontier model: ' + esc(f.frontierModel) + '. ' +
      tools.filter((t) => TOOLS.indexOf(t) < 0).map((t) => esc(t.name) + ': ' + esc(CM.tier(t.tier, f.tokens).modelName) + '. ').join('') +
      esc(f.source) + '. The example column is made up, to show the sums.' + (linkWords ? ' ' + linkWords.trim() : '') + '</p>';

  const side2 =
    '<section class="sheet side-2">' +
    '<section class="ex ex-3">' +
      '<div class="ex-head"><div class="what"><span class="label">' + esc(COPY.ex3.kicker) + '</span>' +
      '<h2 class="headline">' + esc(COPY.ex3.headline) + '</h2></div>' +
      '<p class="body how">' + esc(COPY.ex3.how) + '</p></div>' +
      card +
    '</section>' +
    '<footer class="foot-2">' +
      '<div class="foot-main">' +
        '<div class="rungs"><p class="rungs-head"><span class="label is-tight">The ladder of tools</span><span class="voice">' + esc(COPY.ladderLine) + '</span></p>' +
        '<ol class="ladder">' + COPY.ladder.map((rung, i) => '<li style="--i:' + i + '">' + esc(rung) + '</li>').join('') + '</ol></div>' +
        '<div class="standard"><span class="label is-tight">' + esc(COPY.standardLabel) + '</span>' +
        '<p class="voice">' + esc(COPY.standard) + '</p></div>' +
      '</div>' +
    '</footer>' +
    '</section>';

  return '<!doctype html>\n' +
    '<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<title>Worksheet' + esc(DOT + (ev.title || '')) + '</title>\n' +
    '<!--\n' +
    '  GENERATED by tools/build-handouts.js. Do not edit by hand: every figure on this\n' +
    '  sheet is computed from deck/lib and deck/content/your-numbers.js, and the fitted\n' +
    '  widths of the title are baked in. To change the words or the layout, edit the\n' +
    '  tool or handouts/handout.css, then run:  node tools/build-handouts.js\n' +
    '-->\n' +
    '<link rel="stylesheet" href="' + esc(href(CSS_FONTS)) + '">\n' +
    '<link rel="stylesheet" href="' + esc(href(CSS_TOKENS)) + '">\n' +
    '<link rel="stylesheet" href="' + esc(href(CSS_HANDOUT)) + '">\n' +
    '</head>\n<body>\n' +
    '<p class="screen-note">Print handouts/worksheet.pdf on US Letter, both sides (flip on the long edge), black and white, at actual size (100%, not "fit to page").</p>\n' +
    side1 + '\n' + side2 + '\n' +
    '</body>\n</html>\n';
}


/* =============================================================================
 * 5. Fitting the title stack (in a scratch page, with the deck's own code)
 * ========================================================================== */

const STACK_LINES = (title) => {
  // "The Most Valuable AI Skill Is Saying No" -> two lines, and the NO goes on the slab.
  const words = String(title || '').trim().split(/\s+/);
  const last = words[words.length - 1];
  const body = /^no$/i.test(last) ? words.slice(0, -1) : words;
  // split where the two lines are closest in length
  let best = 1, bestGap = Infinity;
  for (let i = 1; i < body.length; i++) {
    const gap = Math.abs(body.slice(0, i).join(' ').length - body.slice(i).join(' ').length);
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  return [body.slice(0, best).join(' '), body.slice(best).join(' ')];
};

async function fitStack(page, lines) {
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<h1 class="hd-stack" id="stack">' + lines.map((l) => '<span class="ln">' + esc(l) + '</span>').join('') + '</h1></body></html>');
  for (const css of [CSS_FONTS, CSS_TOKENS, CSS_HANDOUT]) { await page.addStyleTag({ path: css }); }
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('900 40px Archivo'), document.fonts.load('italic 600 20px Fraunces')]);
    await document.fonts.ready;
  });
  let withTheme = false;
  try {
    await page.addScriptTag({ path: THEME_JS });
    withTheme = await page.evaluate(() => !!(window.THEME && typeof window.THEME.fitStack === 'function'));
  } catch (e) { withTheme = false; }

  const LEADING = 0.8;      // two lines: a little air between them, as on the title slide
  const result = await page.evaluate(async ({ withTheme, LEADING }) => {
    const el = document.getElementById('stack');
    const lines = Array.from(el.querySelectorAll('.ln'));
    const measure = parseFloat(getComputedStyle(el).width);
    let size, pitch, how;
    if (withTheme) {
      if (window.THEME.ready && window.THEME.ready.then) { await window.THEME.ready; }
      const out = window.THEME.fitStack(el, { leading: LEADING });
      if (out) { size = out.size; pitch = out.pitch; how = 'THEME.fitStack'; }
    }
    if (!size) {
      // Fallback: the same idea without the optical margins. Largest size at which the
      // longest line fits at width 62, then every line walked up the width axis.
      how = 'built-in fit';
      el.style.fontSize = '100px';
      lines.forEach((l) => { l.style.fontStretch = '62%'; });
      const widest = Math.max.apply(null, lines.map((l) => l.getBoundingClientRect().width / 100));
      size = Math.floor(measure / widest * 10) / 10;
      el.style.fontSize = size + 'px';
      lines.forEach((l, j) => {
        let lo = 62, hi = 125;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) / 2;
          l.style.fontStretch = mid + '%';
          if (l.getBoundingClientRect().width > measure) { hi = mid; } else { lo = mid; }
        }
        l.style.fontStretch = (Math.round(lo * 10) / 10) + '%';
        l.style.marginBottom = j < lines.length - 1 ? ((LEADING - 0.708) * size).toFixed(2) + 'px' : '0';
      });
      pitch = LEADING * size;
    }
    const px = (v) => (v && v !== '0' ? v : '0');
    return {
      how, measure, sizePx: size, pitchPx: pitch,
      lines: lines.map((l) => ({
        text: l.textContent,
        stretch: l.style.fontStretch || '62%',
        tracking: px(l.style.letterSpacing),
        left: px(l.style.marginLeft),
        right: px(l.style.marginRight),
        below: px(l.style.marginBottom),
        width: l.getBoundingClientRect().width
      }))
    };
  }, { withTheme, LEADING });

  // The NO is exactly as tall as the stack: first cap-top to last baseline.
  const CAP = 0.688;
  const stackHeight = CAP * result.sizePx + (lines.length - 1) * result.pitchPx;
  result.size = result.sizePx + 'px';
  result.noSize = (Math.round(stackHeight / CAP * 100) / 100) + 'px';
  return result;
}


/* =============================================================================
 * 6. Checks on the real page
 * ========================================================================== */

async function checkPage(page) {
  return page.evaluate(({ MM_PER_PX, MIN_WRITE_MM }) => {
    const problems = [];
    const notes = [];
    const mm = (px) => Math.round(px * MM_PER_PX * 100) / 100;
    const name = (el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '');

    if (!document.fonts.check('900 20px Archivo')) { problems.push('Archivo did not load'); }
    if (!document.fonts.check('italic 600 20px Fraunces')) { problems.push('Fraunces did not load'); }

    // every character is in the font it is set in (a fallback font would print differently on every machine)
    const probe = document.createElement('canvas').getContext('2d');
    const inFont = (family, style, ch) => {
      const w = ['monospace', 'serif', 'cursive'].map((generic) => {
        probe.font = style + ' 40px "' + family + '", ' + generic;
        return probe.measureText(ch).width;
      });
      return w[0] === w[1] && w[1] === w[2];
    };
    const missing = {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const cs = getComputedStyle(node.parentElement);
      if (cs.display === 'none') { continue; }
      const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const style = (cs.fontStyle === 'italic' ? 'italic ' : '') + '600';
      Array.from(new Set(node.textContent)).forEach((ch) => {
        if (ch.charCodeAt(0) <= 126 || ch.trim() === '') { return; }
        if (!inFont(family, style, ch)) { missing[ch + ' in ' + family] = true; }
      });
    }
    Object.keys(missing).forEach((m) => problems.push('no glyph for ' + m + ': it would print in a fallback font'));

    const sheets = Array.from(document.querySelectorAll('.sheet'));
    if (sheets.length !== 2) { problems.push('expected 2 sides, found ' + sheets.length); }

    sheets.forEach((sheet, si) => {
      const side = 'side ' + (si + 1);
      const box = sheet.getBoundingClientRect();
      // nothing runs past the edge of the side (the sheet clips, so this would be lost ink)
      sheet.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) { return; }
        if (r.left < box.left - 1.3 || r.right > box.right + 1.3 || r.top < box.top - 1.3 || r.bottom > box.bottom + 1.3) {
          problems.push(side + ': ' + name(el) + ' runs outside the printable area by ' +
            mm(Math.max(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom)) + ' mm');
        }
      });
      // the foot is pinned to the bottom edge: the air above it is what is left over
      const foot = sheet.querySelector(':scope > footer');
      const before = foot && foot.previousElementSibling;
      if (foot && before) {
        const slack = foot.getBoundingClientRect().top - before.getBoundingClientRect().bottom;
        notes.push(side + ': ' + mm(slack) + ' mm of air above the foot');
        if (slack * MM_PER_PX < 2) { problems.push(side + ' is full: ' + mm(slack) + ' mm between the content and the foot'); }
      } else {
        problems.push(side + ' has no foot');
      }

      // nothing is squeezed out of its own box
      sheet.querySelectorAll('td, th, .blk-head, .col-head, .prompts > li, .picks > li, .mast-side, .credit, .mast-top, .foot, .foot-main, .bay, .bay-n, .say, .price-list, .how, .ladder, .rungs-head, .standard, .links, .split > span').forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 1.5 || el.scrollHeight > el.clientHeight + 1.5) {
          problems.push(side + ': the content of ' + name(el) + ' does not fit (' + el.scrollWidth + 'x' + el.scrollHeight + ' in ' + el.clientWidth + 'x' + el.clientHeight + ') "' + (el.textContent || '').trim().slice(0, 40) + '"');
        }
      });

      // every box to write in is tall enough for handwriting
      let shortest = Infinity;
      sheet.querySelectorAll('td.w, [data-write]').forEach((el) => {
        const h = el.clientHeight * MM_PER_PX;
        shortest = Math.min(shortest, h);
        if (h < MIN_WRITE_MM) { problems.push(side + ': a writing box is ' + mm(el.clientHeight) + ' mm tall (' + name(el) + '), under ' + MIN_WRITE_MM + ' mm'); }
      });
      notes.push(side + ': shortest writing box ' + (Math.round(shortest * 100) / 100) + ' mm');
    });

    // the title stack is flush to its measure
    const stack = document.querySelector('.hd-stack');
    if (stack) {
      const measure = parseFloat(getComputedStyle(stack).width);
      stack.querySelectorAll('.ln').forEach((l) => {
        const w = l.getBoundingClientRect().width;
        if (Math.abs(w - measure) > 3) { problems.push('title line "' + l.textContent + '" is ' + mm(w) + ' mm wide on a ' + mm(measure) + ' mm measure'); }
      });
      const no = document.querySelector('.slab-no');
      const first = stack.querySelector('.ln').getBoundingClientRect();
      const lines = stack.querySelectorAll('.ln');
      const last = lines[lines.length - 1].getBoundingClientRect();
      const stackInk = (last.top - first.top) + parseFloat(getComputedStyle(stack).fontSize) * 0.688;
      const noInk = parseFloat(getComputedStyle(no).fontSize) * 0.688;
      if (Math.abs(stackInk - noInk) > 0.75) { problems.push('the NO (' + mm(noInk) + ' mm) is not as tall as the title stack (' + mm(stackInk) + ' mm)'); }
      if (Math.abs(no.getBoundingClientRect().top - first.top) > 0.75) { problems.push('the NO does not start on the cap line of the title'); }
    } else {
      problems.push('the title stack is missing');
    }
    return { problems, notes };
  }, { MM_PER_PX, MIN_WRITE_MM });
}

function pdfPageCount(file) {
  const bytes = fs.readFileSync(file).toString('latin1');
  const m = bytes.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return m ? m.length : 0;
}

function have(cmd) {
  try { execFileSync(cmd, ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return e.code !== 'ENOENT'; }
}


/* =============================================================================
 * Main
 * ========================================================================== */

(async () => {
  const args = process.argv.slice(2);
  let checkOnly = false;
  let shots = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--check') { checkOnly = true; }
    else if (a === '--shots') { shots = (args[i + 1] && args[i + 1].indexOf('--') !== 0) ? path.resolve(args[++i]) : path.join(ROOT, 'out', 'handouts'); }
    else if (a === '--out') { OUT_DIR = path.resolve(args[++i] || ''); }
    else if (a === '--help' || a === '-h') { console.log('Usage: node tools/build-handouts.js [--check] [--shots [dir]] [--out dir]'); return; }
    else { console.error('Unknown option: ' + a); process.exit(2); }
  }

  const OUT_HTML = path.join(OUT_DIR, 'worksheet.html');
  const OUT_PDF = path.join(OUT_DIR, 'worksheet.pdf');

  /* ---- the figures, and the proof that the paper method is the deck's ---- */
  const f = facts();
  const paperProblems = checkPaper(f);
  if (paperProblems.length) {
    paperProblems.slice(0, 12).forEach((line) => console.error('FAIL  ' + line));
    fail('the worksheet worked by hand does not agree with Gates.evaluate (' + paperProblems.length + ' differences). Nothing was written.');
  }
  console.log('ok    worked by hand, the sheet agrees with Gates.evaluate: ' + (YOUR.candidates || []).length + ' example candidates to the cent, 3,000 random ones verdict for verdict');
  const r = f.exampleResult;
  console.log('ok    example on the sheet: "' + f.example.name + '" -> ' + r.summary);
  checkAgainstSlides().forEach((w) => console.warn('WARN  ' + w));

  const { chromium } = requirePlaywright();
  const browser = await chromium.launch();
  let exitCode = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') { pageErrors.push('console.error: ' + msg.text()); } });
    page.on('pageerror', (err) => { pageErrors.push('uncaught: ' + err.message); });

    /* ---- fit the title, then write the page ---- */
    const fit = await fitStack(page, STACK_LINES(f.event.title));
    pageErrors.length = 0;                        // the scratch page is not the product
    console.log('ok    title stack fitted with ' + fit.how + ': ' + fit.lines.map((l) => '"' + l.text + '" at width ' + l.stretch).join(', ') +
      ', ' + (Math.round(fit.sizePx * 0.75 * 10) / 10) + ' pt');
    const html = render(f, fit);

    if (checkOnly) {
      const onDisk = fs.existsSync(OUT_HTML) ? fs.readFileSync(OUT_HTML, 'utf8') : null;
      if (onDisk === html) { console.log('ok    ' + path.relative(ROOT, OUT_HTML) + ' is up to date'); }
      else { console.error('FAIL  ' + path.relative(ROOT, OUT_HTML) + ' is ' + (onDisk === null ? 'missing' : 'stale') + '. Run: node tools/build-handouts.js'); exitCode = 1; }
      // The PDF is printed from the HTML and the stylesheets: it must be newer than all of them.
      if (!fs.existsSync(OUT_PDF)) {
        console.error('FAIL  ' + path.relative(ROOT, OUT_PDF) + ' is missing. Run: node tools/build-handouts.js'); exitCode = 1;
      } else {
        const pdfTime = fs.statSync(OUT_PDF).mtimeMs;
        const newer = [OUT_HTML, CSS_HANDOUT, CSS_TOKENS, CSS_FONTS].filter((file) => fs.existsSync(file) && fs.statSync(file).mtimeMs > pdfTime + 1);
        if (newer.length) {
          console.error('FAIL  ' + path.relative(ROOT, OUT_PDF) + ' is older than ' + newer.map((file) => path.relative(ROOT, file)).join(', ') + '. Run: node tools/build-handouts.js');
          exitCode = 1;
        } else if (onDisk === html) {
          console.log('ok    ' + path.relative(ROOT, OUT_PDF) + ' is newer than the page and its stylesheets');
        }
      }
      return;
    }

    /* Everything is written under temporary names next to the real files (so the
       stylesheet links resolve the same way) and renamed only when every check
       passes. A build that fails leaves the last good handout untouched. */
    const TMP_HTML = path.join(OUT_DIR, 'worksheet.tmp.html');
    const TMP_PDF = path.join(OUT_DIR, 'worksheet.tmp.pdf');
    const cleanUp = () => [TMP_HTML, TMP_PDF].forEach((file) => { try { fs.unlinkSync(file); } catch (e) { /* not there */ } });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(TMP_HTML, html);

    /* ---- look at the real page the way the printer will ---- */
    await page.goto(pathToFileURL(TMP_HTML).href);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      await Promise.all([document.fonts.load('900 40px Archivo'), document.fonts.load('italic 600 20px Fraunces')]);
      await document.fonts.ready;
    });
    const checked = await checkPage(page);
    checked.notes.forEach((n) => console.log('      ' + n));
    const problems = checked.problems.concat(pageErrors);

    /* ---- the PDF ---- */
    await page.pdf({
      path: TMP_PDF,
      width: '8.5in',
      height: '11in',
      margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
      printBackground: true,
      preferCSSPageSize: true
    });
    const pages = pdfPageCount(TMP_PDF);
    if (pages !== 2) { problems.push('the PDF has ' + pages + ' pages; it must have exactly 2'); }

    /* ---- pictures of the pages, to look at (also of a failed build, to see why) ---- */
    const takeShots = async (pdfFile) => {
      if (!shots) { return; }
      fs.mkdirSync(shots, { recursive: true });
      if (have('pdftoppm')) {
        execFileSync('pdftoppm', ['-r', '110', '-png', pdfFile, path.join(shots, 'page')]);
        execFileSync('pdftoppm', ['-r', '110', '-gray', '-png', pdfFile, path.join(shots, 'page-grey')]);
        console.log('wrote ' + path.relative(ROOT, shots) + path.sep + 'page-N.png and page-grey-N.png (from the PDF, 110 dpi)');
      } else {
        const sides = await page.$$('.sheet');
        for (let i = 0; i < sides.length; i++) {
          await sides[i].screenshot({ path: path.join(shots, 'page-' + (i + 1) + '.png') });
        }
        await page.addStyleTag({ content: 'html { filter: grayscale(1); }' });
        for (let i = 0; i < sides.length; i++) {
          await sides[i].screenshot({ path: path.join(shots, 'page-grey-' + (i + 1) + '.png') });
        }
        console.log('wrote ' + path.relative(ROOT, shots) + path.sep + 'page-N.png and page-grey-N.png (from the HTML: pdftoppm is not installed)');
      }
    };

    if (problems.length) {
      problems.forEach((line) => console.error('FAIL  ' + line));
      console.error('FAIL  nothing was written: ' + path.relative(ROOT, OUT_HTML) + ' and ' + path.relative(ROOT, OUT_PDF) + ' are the last good build');
      await takeShots(TMP_PDF);
      cleanUp();
      exitCode = 1;
      return;
    }
    fs.renameSync(TMP_HTML, OUT_HTML);
    fs.renameSync(TMP_PDF, OUT_PDF);
    console.log('wrote ' + path.relative(ROOT, OUT_HTML) + ' (' + html.length + ' bytes)');
    console.log('wrote ' + path.relative(ROOT, OUT_PDF) + ' (' + pages + ' pages, ' + fs.statSync(OUT_PDF).size + ' bytes)');

    await takeShots(OUT_PDF);

    console.log('ok    two pages, nothing clipped, every writing box at least ' + MIN_WRITE_MM + ' mm tall');
  } finally {
    await browser.close();
  }
  process.exit(exitCode);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
