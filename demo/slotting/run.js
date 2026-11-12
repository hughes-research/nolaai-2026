#!/usr/bin/env node
/*
 * demo/slotting/run.js: the warehouse-slotting model, from the command line.
 *
 *     node demo/slotting/run.js
 *     node demo/slotting/run.js --seed 7
 *     node demo/slotting/run.js --parts 3000 --orders 4000
 *     node demo/slotting/run.js --iterations 1000000
 *     node demo/slotting/run.js --free-zones
 *     node demo/slotting/run.js --json
 *
 * It runs exactly the code the deck runs (deck/lib/slotting-core.js) and
 * prints the same numbers the slide shows for the same seed.
 *
 * EVERYTHING HERE IS SYNTHETIC. The building, the parts and the orders are
 * generated from a seed. Nothing comes from a real warehouse or a real
 * business, and these are not anyone's results.
 *
 * Options
 *   --seed N          a different made-up warehouse (default: the deck's seed)
 *   --parts N         how many parts (default about 1,500; the building grows to fit)
 *   --orders N        how many orders in the year (default 2,000)
 *   --iterations N    how many swaps the optimizer tries (default 240,000)
 *   --sample N        orders replayed to judge each swap (default: the whole year)
 *   --free-zones      let the optimizer trade the shelf rules for a shorter walk
 *   --json            print the results as JSON instead of a table
 *   --help
 */
'use strict';

var path = require('path');
var Slotting = require(path.join(__dirname, '..', '..', 'deck', 'lib', 'slotting-core.js'));

/* The deck reads its settings for the synthetic warehouse from the speaker's
 * file. Use the same ones here, so the two always agree. */
var sim = {};
try {
  var YOUR = require(path.join(__dirname, '..', '..', 'deck', 'content', 'your-numbers.js'));
  if (YOUR && YOUR.slotting && YOUR.slotting.sim && typeof YOUR.slotting.sim === 'object') { sim = YOUR.slotting.sim; }
} catch (e) { /* no speaker file: the built-in defaults are used */ }

function usage(code) {
  console.log([
    'Usage: node demo/slotting/run.js [--seed N] [--parts N] [--orders N] [--iterations N]',
    '                                 [--sample N] [--free-zones] [--json]',
    '',
    'Runs the synthetic warehouse-slotting model and prints before and after.'
  ].join('\n'));
  process.exit(code);
}

function parseArgs(argv) {
  var out = { json: false, params: {}, anneal: {} };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    var eq = a.indexOf('=');
    var key = eq > 0 ? a.slice(0, eq) : a;
    var inline = eq > 0 ? a.slice(eq + 1) : null;
    var number = function () {
      var raw = inline != null ? inline : argv[++i];
      var n = Number(raw);
      if (raw == null || raw === '' || !isFinite(n) || n < 0) {
        console.error(key + ' needs a number, for example ' + key + ' 7');
        process.exit(2);
      }
      return Math.floor(n);
    };
    if (key === '--seed') { out.params.seed = number(); }
    else if (key === '--parts') { out.params.parts = number(); }
    else if (key === '--orders') { out.params.orders = number(); }
    else if (key === '--iterations') { out.params.iterations = number(); }
    else if (key === '--sample') { out.params.sampleOrders = number(); }
    else if (key === '--free-zones') { out.params.keepZones = false; }
    else if (key === '--json') { out.json = true; }
    else if (key === '--help' || key === '-h') { usage(0); }
    else { console.error('Unknown option: ' + a); usage(2); }
  }
  return out;
}

/* ---- formatting ---- */

function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fixed(n, d) {
  var parts = n.toFixed(d).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}
function pct(share, d) { return (share * 100).toFixed(d == null ? 0 : d) + '%'; }
function padEnd(s, n) { s = String(s); while (s.length < n) { s += ' '; } return s; }
function padStart(s, n) { s = String(s); while (s.length < n) { s = ' ' + s; } return s; }
function less(before, after) {
  if (!(before > 0)) { return ''; }
  var change = (1 - after / before) * 100;
  return change >= 0 ? change.toFixed(1) + '% less' : (-change).toFixed(1) + '% more';
}

function main() {
  var args = parseArgs(process.argv.slice(2));
  var input = {};
  var key;
  for (key in sim) { if (Object.prototype.hasOwnProperty.call(sim, key)) { input[key] = sim[key]; } }
  for (key in args.params) { input[key] = args.params[key]; }

  var r = Slotting.run(input);
  var w = r.world, b = r.before, a = r.after, s = r.seeded, L = w.layout;

  if (args.json) {
    console.log(JSON.stringify({
      synthetic: true,
      note: 'Synthetic data. A made-up warehouse, generated from a seed. Not results from any real building.',
      seed: w.seed,
      building: { blocks: L.blocks, aislesPerBlock: L.aisles, baysPerFace: L.baysPerFace, levels: L.levels, slots: w.totals.slots, widthFt: L.width, lengthFt: L.length },
      parts: { total: w.totals.parts, A: w.classes.A, B: w.classes.B, C: w.classes.C },
      orders: { total: w.totals.orders, picks: w.totals.picks },
      asIs: b,
      ruleOfThumb: s,
      optimized: a,
      optimizer: {
        swapsTried: r.anneal.tried, swapsKept: r.anneal.accepted, keptShelfRules: r.anneal.keepZones,
        ordersReplayed: r.anneal.sampleOrders, ms: Math.round(r.anneal.ms)
      },
      fingerprint: Slotting.digest(r).hash
    }, null, 2));
    return;
  }

  var problems = Slotting.validate(w, r.asIs).concat(Slotting.validate(w, r.optimized));
  var W = 36, C1 = 12, C2 = 12;
  function row(label, before, after, change) {
    return '  ' + padEnd(label, W) + padStart(before, C1) + padStart(after, C2) + (change ? '    ' + change : '');
  }

  var out = [];
  out.push('');
  out.push('WAREHOUSE SLOTTING: a re-creation on SYNTHETIC DATA');
  out.push('A made-up building, made-up parts and a made-up year of orders, generated');
  out.push('from seed ' + w.seed + '. These are not results from any real warehouse.');
  out.push('');
  out.push('  Building   ' + L.blocks + ' blocks of racks x ' + L.aisles + ' aisles, ' + commas(w.totals.bays) + ' bays, ' +
    L.levels + ' shelf levels: ' + commas(w.totals.slots) + ' slots');
  out.push('             ' + L.width + ' ft x ' + L.length + ' ft, pack station at the foot of aisle ' + L.pack.aisle);
  out.push('  Parts      ' + commas(w.totals.parts) + '  (' + commas(w.classes.A) + ' fast movers, ' + commas(w.classes.B) + ' medium, ' + commas(w.classes.C) + ' slow)');
  out.push('  Orders     ' + commas(w.totals.orders) + ' in a year, ' + commas(w.totals.picks) + ' picks');
  out.push('');
  out.push(row('', 'As-is move', 'Optimized', ''));
  out.push('  ' + new Array(W + C1 + C2 + 1).join('-'));
  out.push(row('Walk per pick run', fixed(b.ftPerRun, 1) + ' ft', fixed(a.ftPerRun, 1) + ' ft', less(b.ftPerRun, a.ftPerRun)));
  out.push(row('Pick time per year', fixed(b.pickHoursPerYear, 1) + ' h', fixed(a.pickHoursPerYear, 1) + ' h', less(b.pickHoursPerYear, a.pickHoursPerYear)));
  out.push(row('Picks that need a ladder', pct(b.ladderPickShare, 1), pct(a.ladderPickShare, 1)));
  out.push(row('Fast movers in the golden zone', pct(b.aGoldenShare), pct(a.aGoldenShare)));
  out.push(row('Medium movers kept off the ladder', pct(b.bOffLadderShare), pct(a.bOffLadderShare)));
  out.push(row('Ladder set-ups per year', commas(b.ladderSetupsPerYear), commas(a.ladderSetupsPerYear)));
  out.push('');
  out.push('  As-is move   every part goes across in part-number order and fills every level.');
  out.push('  Optimized    start from a rule of thumb (fast movers nearest the pack station,');
  out.push('               on golden shelves), then simulated annealing: swap two parts,');
  out.push('               replay the orders, keep the swap if pick time drops.');
  out.push('               The rule of thumb alone: ' + fixed(s.ftPerRun, 1) + ' ft per run, ' + fixed(s.pickHoursPerYear, 1) + ' h a year.');
  if (r.anneal.keepZones) {
    out.push('               Shelf rules kept while it searches: fast movers stay in the golden');
    out.push('               zone, medium movers stay off the ladder (--free-zones lifts them).');
  } else {
    out.push('               Shelf rules OFF: fast movers may leave the golden zone for a shorter walk.');
  }
  out.push('');
  out.push('  ' + commas(r.anneal.tried) + ' swaps tried, ' + commas(r.anneal.accepted) + ' kept, in ' + commas(r.anneal.ms) + ' ms' +
    (r.anneal.sampleOrders < w.totals.orders ? ' (judged on a sample of ' + commas(r.anneal.sampleOrders) + ' orders).' : '.'));
  out.push('  No AI model in the loop. Whole run: ' + commas(r.timings.totalMs) + ' ms.');
  out.push('');
  out.push('  Pick-time model (placeholders, as in any model before a floor time study):');
  out.push('  walking ' + w.params.walkFtPerSec + ' ft/s, +' + w.params.floorSec + ' s for a floor shelf, +' + w.params.reachSec +
    ' s for a reach shelf, ' + w.params.ladderSetupSec + ' s per ladder set-up.');
  out.push('  Same seed, same numbers, here and in the deck. Fingerprint ' + Slotting.digest(r).hash + '.');
  out.push('');
  console.log(out.join('\n'));

  if (problems.length) {
    console.error('The placement is not sound:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
}

main();
