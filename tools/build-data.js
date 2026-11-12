#!/usr/bin/env node
/*
 * tools/build-data.js
 * -----------------------------------------------------------------------------
 * Turns the BenchLM leaderboard export (a CSV file) into a plain script the deck
 * can load from disk:
 *
 *     data/benchlm-leaderboard.csv   -->   deck/lib/benchlm-data.js
 *
 * The deck runs from file:// with no network and no fetch(), so data has to
 * arrive as a .js file that assigns to window. This script is the only thing
 * that writes deck/lib/benchlm-data.js. Never edit that file by hand: change
 * the CSV and run
 *
 *     node tools/build-data.js
 *
 * The output is deterministic (no timestamps), so running it twice on the same
 * CSV changes nothing.
 *
 * No dependencies. The CSV parser below is hand-written and handles quoted
 * fields, doubled quotes ("") inside quotes, commas and line breaks inside
 * quotes, CRLF or LF line endings, and a missing final newline.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var CSV_PATH = path.join(ROOT, 'data', 'benchlm-leaderboard.csv');
var OUT_PATH = path.join(ROOT, 'deck', 'lib', 'benchlm-data.js');

/* What the deck prints in the source line. Update RETRIEVED when you re-export. */
var SOURCE = 'BenchLM leaderboard export';
var RETRIEVED = 'November 2026';

/* Category score columns, copied through under the same names. */
var CATEGORY_COLUMNS = [
  'coding', 'agentic', 'reasoning', 'knowledge', 'math',
  'multimodalGrounded', 'multilingual', 'instructionFollowing'
];

/* Every column this script reads. A missing one stops the build. */
var REQUIRED_COLUMNS = [
  'rank', 'model', 'creator', 'sourceType', 'overallScore', 'evidenceStatus',
  'interval90Lower', 'interval90Upper', 'inputPrice', 'outputPrice'
].concat(CATEGORY_COLUMNS);


/* -----------------------------------------------------------------------------
 * CSV parser
 * -----------------------------------------------------------------------------
 * Returns an array of rows; each row is an array of strings. Nothing is
 * trimmed or converted here: this function only understands the CSV grammar.
 * A small state machine, one character at a time.
 */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // drop a byte-order mark

  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;      // currently inside "..."
  var fieldWasQuoted = false; // the current field started with a quote
  var line = 1;              // for error messages
  var i = 0;
  var n = text.length;

  function endField() {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
  }
  function endRow() {
    endField();
    // A line with nothing on it (for example a trailing blank line) is not a row.
    var blank = row.length === 1 && row[0] === '';
    if (!blank) rows.push(row);
    row = [];
  }

  while (i < n) {
    var ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // "" is a literal quote
        inQuotes = false; // closing quote
        i += 1;
        var next = text[i];
        if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') {
          throw new Error('CSV line ' + line + ': unexpected character after a closing quote: ' + JSON.stringify(next));
        }
        continue;
      }
      if (ch === '\n') line += 1;
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      if (field !== '' || fieldWasQuoted) {
        throw new Error('CSV line ' + line + ': a quote appeared in the middle of an unquoted field');
      }
      inQuotes = true;
      fieldWasQuoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') { endField(); i += 1; continue; }
    if (ch === '\r') {            // CRLF or a bare CR both end the row
      endRow();
      line += 1;
      i += (text[i + 1] === '\n') ? 2 : 1;
      continue;
    }
    if (ch === '\n') { endRow(); line += 1; i += 1; continue; }

    field += ch;
    i += 1;
  }

  if (inQuotes) throw new Error('CSV: the file ends inside a quoted field (missing closing quote)');
  // The last row may have no trailing newline.
  if (field !== '' || fieldWasQuoted || row.length > 0) endRow();

  return rows;
}


/* -----------------------------------------------------------------------------
 * Rows -> model records
 * -------------------------------------------------------------------------- */

/* '' -> null, '12.5' -> 12.5. Anything else is a broken file, so stop loudly. */
function toNumber(raw, column, rowLabel) {
  var s = String(raw).trim();
  if (s === '') return null;
  var x = Number(s);
  if (!isFinite(x)) {
    throw new Error(rowLabel + ': column "' + column + '" is not a number: ' + JSON.stringify(raw));
  }
  return x;
}

/* '' -> null, 'true' -> true, 'false' -> false. */
function toBool(raw) {
  var s = String(raw).trim().toLowerCase();
  if (s === '') return null;
  return s === 'true';
}

/* '' -> null, otherwise the trimmed text. */
function toText(raw) {
  var s = String(raw).trim();
  return s === '' ? null : s;
}

/*
 * Price status. The brief treats three groups differently:
 *   'priced'      both prices present and not both zero: used in all price math
 *   'blank'       a price is missing in the file: we cannot compute a cost
 *   'zero-listed' listed at $0 in and out: open-weight models you would host
 *                 yourself, which is not free, so they are left out of price math
 */
function priceStatus(inputPrice, outputPrice) {
  if (inputPrice === null || outputPrice === null) return 'blank';
  if (inputPrice === 0 && outputPrice === 0) return 'zero-listed';
  return 'priced';
}

function buildModels(rows) {
  if (rows.length < 2) throw new Error('CSV has no data rows');

  var header = rows[0].map(function (h) { return h.trim(); });
  var col = {};
  header.forEach(function (name, idx) { col[name] = idx; });

  REQUIRED_COLUMNS.forEach(function (name) {
    if (!(name in col)) throw new Error('CSV is missing the column "' + name + '"');
  });

  var models = [];
  var seenNames = {};
  var seenRanks = {};

  for (var r = 1; r < rows.length; r++) {
    var cells = rows[r];
    var rowLabel = 'CSV data row ' + r;
    if (cells.length !== header.length) {
      throw new Error(rowLabel + ': expected ' + header.length + ' fields, found ' + cells.length);
    }
    /* eslint-disable no-loop-func */
    var get = function (name) { return name in col ? cells[col[name]] : ''; };
    var num = function (name) { return toNumber(get(name), name, rowLabel); };

    var name = toText(get('model'));
    if (!name) throw new Error(rowLabel + ': the model name is blank');
    if (seenNames[name]) throw new Error(rowLabel + ': duplicate model name "' + name + '"');
    seenNames[name] = true;

    var rank = num('rank');
    if (rank === null) throw new Error(rowLabel + ' (' + name + '): rank is blank');
    if (seenRanks[rank]) throw new Error(rowLabel + ' (' + name + '): duplicate rank ' + rank);
    seenRanks[rank] = true;

    var overallScore = num('overallScore');
    if (overallScore === null) throw new Error(rowLabel + ' (' + name + '): overallScore is blank');

    var evidenceStatus = toText(get('evidenceStatus'));
    var inputPrice = num('inputPrice');
    var outputPrice = num('outputPrice');
    if ((inputPrice !== null && inputPrice < 0) || (outputPrice !== null && outputPrice < 0)) {
      throw new Error(rowLabel + ' (' + name + '): a price is negative');
    }

    // Key order here is the key order in the generated file.
    var model = {
      rank: rank,
      name: name,
      creator: toText(get('creator')),
      sourceType: toText(get('sourceType')),
      overallScore: overallScore,
      evidenceStatus: evidenceStatus,
      estimated: evidenceStatus === 'estimated',
      interval90: [num('interval90Lower'), num('interval90Upper')],
      intervalScope: toText(get('intervalScope')),
      intervalCoverageValidated: toBool(get('intervalCoverageValidated'))
    };
    CATEGORY_COLUMNS.forEach(function (c) { model[c] = num(c); });
    model.inputPrice = inputPrice;
    model.outputPrice = outputPrice;
    model.priceStatus = priceStatus(inputPrice, outputPrice);
    model.orderingMeaning = toText(get('orderingMeaning'));

    models.push(model);
  }

  models.sort(function (a, b) { return a.rank - b.rank; });
  return models;
}

/*
 * The file repeats one caution on every row ("orderingMeaning"): rank order is
 * a point estimate, not a statistically certain ordering. When every row says
 * the same thing we lift it into meta.orderingNote once and drop the per-row
 * copy. If rows ever differ, the per-row field is kept and the note is null.
 */
function hoistOrderingNote(models) {
  var first = models.length ? models[0].orderingMeaning : null;
  var uniform = models.every(function (m) { return m.orderingMeaning === first; });
  if (uniform) models.forEach(function (m) { delete m.orderingMeaning; });
  return uniform ? first : null;
}

function countBy(models, test) {
  return models.filter(test).length;
}


/* -----------------------------------------------------------------------------
 * Render the .js file
 * -------------------------------------------------------------------------- */

/* JSON with every non-ASCII character escaped, so the file is safe whatever
 * character set the page that loads it declares. */
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, function (ch) {
    return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });
}

function render(models, meta) {
  var lines = [];
  lines.push('/*');
  lines.push(' * deck/lib/benchlm-data.js  ->  window.BENCHLM');
  lines.push(' *');
  lines.push(' * GENERATED FILE. Do not edit by hand.');
  lines.push(' * Source: data/benchlm-leaderboard.csv');
  lines.push(' * Rebuild: node tools/build-data.js');
  lines.push(' *');
  lines.push(' * Each model: rank, name, creator, sourceType, overallScore, evidenceStatus,');
  lines.push(' * estimated (true when the file marks the row "estimated"), interval90 [low, high],');
  lines.push(' * the category scores, inputPrice and outputPrice in US dollars per million tokens');
  lines.push(' * (null when the file leaves them blank), and priceStatus:');
  lines.push(' *   "priced"       usable in price math');
  lines.push(' *   "blank"        no price in the file');
  lines.push(' *   "zero-listed"  listed at $0: open-weight models you would host yourself');
  lines.push(' * Blank cells in the CSV are null here. Numbers are numbers.');
  lines.push(' */');
  lines.push('(function () {');
  lines.push('  var BENCHLM = {');
  lines.push('    meta: ' + asciiJson(meta) + ',');
  lines.push('    models: [');
  models.forEach(function (m, idx) {
    lines.push('      ' + asciiJson(m) + (idx < models.length - 1 ? ',' : ''));
  });
  lines.push('    ]');
  lines.push('  };');
  lines.push('');
  lines.push('  // Browser: attach to window. Node: export. No DOM access.');
  lines.push("  if (typeof window !== 'undefined') window.BENCHLM = BENCHLM;");
  lines.push("  if (typeof module === 'object' && module && module.exports) module.exports = BENCHLM;");
  lines.push('})();');
  lines.push('');
  return lines.join('\n');
}

/* CSV text in, { output, models, meta } out. No file access: easy to test. */
function build(csvText) {
  var models = buildModels(parseCsv(csvText));
  var orderingNote = hoistOrderingNote(models);
  var meta = {
    source: SOURCE,
    retrieved: RETRIEVED,
    rows: models.length,
    sourceFile: 'data/benchlm-leaderboard.csv',
    priceUnit: 'US dollars per million tokens',
    orderingNote: orderingNote
  };
  return { output: render(models, meta), models: models, meta: meta };
}


/* -----------------------------------------------------------------------------
 * Command line
 * -------------------------------------------------------------------------- */
function main() {
  var result;
  try {
    result = build(fs.readFileSync(CSV_PATH, 'utf8'));
  } catch (err) {
    console.error('build-data: ' + err.message);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, result.output, 'utf8');

  var m = result.models;
  var unknownStatus = m.filter(function (x) {
    return x.evidenceStatus !== 'estimated' && x.evidenceStatus !== 'supported';
  });

  console.log('Read   ' + path.relative(ROOT, CSV_PATH));
  console.log('Wrote  ' + path.relative(ROOT, OUT_PATH));
  console.log('  rows          ' + m.length);
  console.log('  priced        ' + countBy(m, function (x) { return x.priceStatus === 'priced'; }));
  console.log('  blank price   ' + countBy(m, function (x) { return x.priceStatus === 'blank'; }));
  console.log('  listed at $0  ' + countBy(m, function (x) { return x.priceStatus === 'zero-listed'; }));
  console.log('  estimated     ' + countBy(m, function (x) { return x.estimated; }));
  if (unknownStatus.length) {
    console.warn('  note: ' + unknownStatus.length + ' row(s) have an evidenceStatus that is neither "estimated" nor "supported"');
  }
}

if (require.main === module) main();

module.exports = {
  parseCsv: parseCsv,
  buildModels: buildModels,
  build: build,
  CSV_PATH: CSV_PATH,
  OUT_PATH: OUT_PATH
};
