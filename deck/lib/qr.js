/*
 * deck/lib/qr.js  ->  window.QR
 * -----------------------------------------------------------------------------
 * A small, hand-written QR code encoder. No dependencies, no network.
 *
 * What it does, and nothing more:
 *   - byte mode (any text, stored as UTF-8), which is what a web address needs
 *   - error correction level M (about 15% of the code can be damaged)
 *   - versions 1 to 20 (21 x 21 up to 97 x 97 modules); the smallest version
 *     that holds the text is chosen. A 100-character address lands on
 *     version 6 (41 x 41). The limit is 666 bytes.
 *   - all eight masks are tried and the one with the lowest penalty is used
 *
 * API
 *   QR.encode(text)            -> { text, version, size, mask, ecLevel: 'M', modules }
 *                                 modules[row][col] is true for a dark module.
 *                                 Throws when the text is empty or too long.
 *   QR.matrix(text)            -> the modules only
 *   QR.svgPath(code, quiet)    -> the "d" of one SVG path covering every dark module
 *   QR.toSVG(textOrCode, opts) -> an <svg> string. opts: { quiet: 4, dark, light, title }
 *                                 It has a viewBox and no fixed size: size it with CSS.
 *   QR.svgElement(textOrCode, opts) -> the same, as a DOM node (browser only)
 *   QR.drawCanvas(canvas, textOrCode, opts) -> draws it. opts: { scale: 8, quiet: 4, dark, light }
 *   QR.capacity(version)       -> how many bytes of text that version holds at level M
 *   QR.MAX_BYTES               -> 666
 *
 * The quiet zone (the empty margin a scanner needs) is 4 modules by default.
 * Keep it, and keep the dark modules much darker than the ground.
 *
 * tools/test-screener.js checks this file the only way that counts: it renders
 * codes for addresses of several lengths and reads them back with a decoder.
 *
 * Loads as a classic <script> (window.QR) and under Node (module.exports).
 */
(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window : null;
  var inNode = (typeof module === 'object' && module !== null && typeof module.exports === 'object');

  var MIN_VERSION = 1;
  var MAX_VERSION = 20;

  /*
   * Error correction level M, one row per version (index 0 is unused):
   *   [ error-correction codewords per block,
   *     blocks in group 1, data codewords in each of them,
   *     blocks in group 2, data codewords in each of them ]
   * From the QR code standard (ISO/IEC 18004), table 9.
   */
  var BLOCKS_M = [
    null,
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
    [30, 1, 50, 4, 51],
    [22, 6, 36, 2, 37],
    [22, 8, 37, 1, 38],
    [24, 4, 40, 5, 41],
    [24, 5, 41, 5, 42],
    [28, 7, 45, 3, 46],
    [28, 10, 46, 1, 47],
    [26, 9, 43, 4, 44],
    [26, 3, 44, 11, 45],
    [26, 3, 41, 13, 42]
  ];

  /* Centres of the alignment patterns, per version (the same list is used for rows and columns). */
  var ALIGNMENT = [
    null, [],
    [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
    [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]
  ];

  var FORMAT_BITS_M = 0;          // the two-bit code for level M in the format information
  var FORMAT_GENERATOR = 0x537;   // BCH(15,5)
  var FORMAT_XOR = 0x5412;
  var VERSION_GENERATOR = 0x1F25; // BCH(18,6)


  /* ---------------------------------------------------------------------------
   * Arithmetic in GF(256), for the Reed-Solomon error correction
   * ------------------------------------------------------------------------ */

  var EXP = new Array(512);
  var LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;   // the field's polynomial: x^8 + x^4 + x^3 + x^2 + 1
    }
    for (var k = 255; k < 512; k++) EXP[k] = EXP[k - 255];
  }());

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /* The generator polynomial of the given degree: (x - a^0)(x - a^1)...(x - a^(degree-1)). */
  var generatorCache = {};
  function generator(degree) {
    if (generatorCache[degree]) return generatorCache[degree];
    var poly = [1];                                   // highest power first
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];                           // times x
        next[j + 1] ^= gfMul(poly[j], EXP[i]);        // times a^i
      }
      poly = next;
    }
    generatorCache[degree] = poly;
    return poly;
  }

  /* The error-correction codewords for one block of data: the remainder of data * x^n / generator. */
  function errorCorrection(data, count) {
    var gen = generator(count);
    var rem = new Array(count);
    for (var i = 0; i < count; i++) rem[i] = 0;
    for (var d = 0; d < data.length; d++) {
      var factor = data[d] ^ rem[0];
      rem.shift();
      rem.push(0);
      if (factor !== 0) {
        for (var k = 0; k < count; k++) rem[k] ^= gfMul(gen[k + 1], factor);
      }
    }
    return rem;
  }


  /* ---------------------------------------------------------------------------
   * Text to codewords
   * ------------------------------------------------------------------------ */

  /* Text as UTF-8 bytes. Plain ASCII (a web address) is one byte per character. */
  function utf8(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
        var low = text.charCodeAt(i + 1);
        if (low >= 0xDC00 && low <= 0xDFFF) {
          c = 0x10000 + ((c - 0xD800) << 10) + (low - 0xDC00);
          i++;
        }
      }
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c < 0x10000) {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      } else {
        out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  function dataCodewords(version) {
    var b = BLOCKS_M[version];
    return b[1] * b[2] + b[3] * b[4];
  }

  /* In byte mode the length is written in 8 bits up to version 9 and in 16 bits from version 10. */
  function lengthBits(version) {
    return version <= 9 ? 8 : 16;
  }

  /* How many bytes of text fit in a version, at level M, in byte mode. */
  function capacity(version) {
    if (!(version >= MIN_VERSION && version <= MAX_VERSION)) return 0;
    return Math.floor((dataCodewords(version) * 8 - 4 - lengthBits(version)) / 8);
  }

  function pickVersion(byteCount) {
    for (var v = MIN_VERSION; v <= MAX_VERSION; v++) {
      if (byteCount <= capacity(v)) return v;
    }
    return 0;
  }

  /* The data codewords: mode, length, the bytes, a terminator, then padding. */
  function buildData(bytes, version) {
    var total = dataCodewords(version);
    var bits = [];
    function push(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    push(4, 4);                                        // 0100 = byte mode
    push(bytes.length, lengthBits(version));
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    var room = total * 8;
    push(0, Math.min(4, room - bits.length));          // terminator, as much of it as fits
    while (bits.length % 8 !== 0) bits.push(0);

    var out = [];
    for (var k = 0; k < bits.length; k += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[k + j];
      out.push(byte);
    }
    var pad = 0xEC;                                    // the two pad bytes, alternating
    while (out.length < total) {
      out.push(pad);
      pad = (pad === 0xEC) ? 0x11 : 0xEC;
    }
    return out;
  }

  /* Split into blocks, add error correction to each, and interleave them. */
  function interleave(data, version) {
    var spec = BLOCKS_M[version];
    var ecCount = spec[0];
    var blocks = [];
    var at = 0;
    for (var group = 0; group < 2; group++) {
      var count = spec[1 + group * 2];
      var size = spec[2 + group * 2];
      for (var b = 0; b < count; b++) {
        var chunk = data.slice(at, at + size);
        at += size;
        blocks.push({ data: chunk, ec: errorCorrection(chunk, ecCount) });
      }
    }
    var out = [];
    var longest = 0;
    blocks.forEach(function (blk) { longest = Math.max(longest, blk.data.length); });
    for (var i = 0; i < longest; i++) {
      for (var n = 0; n < blocks.length; n++) {
        if (i < blocks[n].data.length) out.push(blocks[n].data[i]);
      }
    }
    for (var e = 0; e < ecCount; e++) {
      for (var m = 0; m < blocks.length; m++) out.push(blocks[m].ec[e]);
    }
    return out;
  }


  /* ---------------------------------------------------------------------------
   * The module grid
   * ------------------------------------------------------------------------ */

  function grid(size, value) {
    var rows = new Array(size);
    for (var r = 0; r < size; r++) {
      rows[r] = new Array(size);
      for (var c = 0; c < size; c++) rows[r][c] = value;
    }
    return rows;
  }

  /*
   * The fixed parts of a code: finders, separators, timing lines, alignment
   * patterns, the dark module, and the space reserved for format and version
   * information. Returns { modules, reserved } where reserved marks every
   * module that data must not use.
   */
  function functionPatterns(version) {
    var size = version * 4 + 17;
    var modules = grid(size, false);
    var reserved = grid(size, false);

    function set(row, col, dark) {
      if (row < 0 || col < 0 || row >= size || col >= size) return;
      modules[row][col] = !!dark;
      reserved[row][col] = true;
    }

    // Finder patterns (7 x 7 with a 3 x 3 centre) and their light separators.
    function finder(row, col) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          var ring = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
          var core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          set(row + dr, col + dc, ring || core);
        }
      }
    }
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // Timing lines: alternating, along row 6 and column 6.
    for (var i = 8; i < size - 8; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }

    // Alignment patterns (5 x 5), everywhere except on top of the three finders.
    var centres = ALIGNMENT[version];
    var last = centres.length - 1;
    for (var a = 0; a < centres.length; a++) {
      for (var b = 0; b < centres.length; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) continue;
        for (var y = -2; y <= 2; y++) {
          for (var x = -2; x <= 2; x++) {
            set(centres[a] + y, centres[b] + x, Math.max(Math.abs(x), Math.abs(y)) !== 1);
          }
        }
      }
    }

    // Reserve the format information (filled in once the mask is chosen)...
    for (var f = 0; f < 9; f++) {
      if (!reserved[8][f]) set(8, f, false);
      if (!reserved[f][8]) set(f, 8, false);
    }
    for (var g = 0; g < 8; g++) {
      set(8, size - 1 - g, false);
      set(size - 1 - g, 8, false);
    }
    // ...the one module that is always dark...
    set(size - 8, 8, true);
    // ...and, from version 7, the two blocks of version information.
    if (version >= 7) {
      for (var v = 0; v < 18; v++) {
        var p = size - 11 + (v % 3);
        var q = Math.floor(v / 3);
        set(q, p, false);
        set(p, q, false);
      }
    }
    return { size: size, modules: modules, reserved: reserved };
  }

  /* Lay the codewords into the free modules: two columns at a time, snaking up and down from the right. */
  function placeData(base, codewords) {
    var size = base.size;
    var bitCount = codewords.length * 8;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                      // column 6 is the timing line
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var col = right - j;
          var upward = ((right + 1) & 2) === 0;
          var row = upward ? size - 1 - vert : vert;
          if (base.reserved[row][col]) continue;
          var dark = false;
          if (i < bitCount) dark = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          base.modules[row][col] = dark;               // any bits left over stay light
          i++;
        }
      }
    }
    return i;                                          // how many modules were available
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];

  function applyMask(base, mask) {
    var size = base.size;
    var out = grid(size, false);
    var test = MASKS[mask];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        out[r][c] = base.reserved[r][c] ? base.modules[r][c] : (base.modules[r][c] !== test(r, c));
      }
    }
    return out;
  }

  /* Fifteen bits: the level and the mask, protected by a BCH code, written twice. */
  function drawFormat(modules, size, mask) {
    var data = (FORMAT_BITS_M << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * FORMAT_GENERATOR);
    var bits = ((data << 10) | rem) ^ FORMAT_XOR;
    function bit(n) { return ((bits >>> n) & 1) === 1; }

    // first copy: around the top-left finder
    for (var a = 0; a <= 5; a++) modules[a][8] = bit(a);
    modules[7][8] = bit(6);
    modules[8][8] = bit(7);
    modules[8][7] = bit(8);
    for (var b = 9; b < 15; b++) modules[8][14 - b] = bit(b);

    // second copy: under the top-right finder and beside the bottom-left one
    for (var c = 0; c < 8; c++) modules[8][size - 1 - c] = bit(c);
    for (var d = 8; d < 15; d++) modules[size - 15 + d][8] = bit(d);
    modules[size - 8][8] = true;
  }

  /* Eighteen bits, from version 7: the version number, protected by a BCH code, written twice. */
  function drawVersion(modules, size, version) {
    if (version < 7) return;
    var rem = version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * VERSION_GENERATOR);
    var bits = (version << 12) | rem;
    for (var k = 0; k < 18; k++) {
      var dark = ((bits >>> k) & 1) === 1;
      var p = size - 11 + (k % 3);
      var q = Math.floor(k / 3);
      modules[q][p] = dark;
      modules[p][q] = dark;
    }
  }

  /*
   * How hard a finished grid is to read, by the standard's four rules. Lower
   * is better. Any mask gives a valid code; this only picks the clearest one.
   */
  function penalty(m, size) {
    var score = 0;
    var r, c, run, colour;

    // 1. Five or more modules of one colour in a row (rows, then columns).
    for (r = 0; r < size; r++) {
      run = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { run++; }
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
    for (c = 0; c < size; c++) {
      run = 1;
      for (r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) { run++; }
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }

    // 2. Two-by-two blocks of one colour.
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        colour = m[r][c];
        if (colour === m[r][c + 1] && colour === m[r + 1][c] && colour === m[r + 1][c + 1]) score += 3;
      }
    }

    // 3. Anything that looks like a finder: dark-light-dark-dark-dark-light-dark with four light beside it.
    var A = [true, false, true, true, true, false, true, false, false, false, false];
    var B = [false, false, false, false, true, false, true, true, true, false, true];
    // `line` is a row or a column number; `along` says which.
    function matches(line, start, pattern, along) {
      for (var k = 0; k < 11; k++) {
        var value = along === 'row' ? m[line][start + k] : m[start + k][line];
        if (value !== pattern[k]) return false;
      }
      return true;
    }
    for (var line = 0; line < size; line++) {
      for (var start = 0; start + 11 <= size; start++) {
        if (matches(line, start, A, 'row') || matches(line, start, B, 'row')) score += 40;
        if (matches(line, start, A, 'col') || matches(line, start, B, 'col')) score += 40;
      }
    }

    // 4. How far the share of dark modules is from one half.
    var dark = 0;
    for (r = 0; r < size; r++) { for (c = 0; c < size; c++) { if (m[r][c]) dark++; } }
    var percent = dark * 100 / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }


  /* ---------------------------------------------------------------------------
   * encode
   * ------------------------------------------------------------------------ */

  function encode(text) {
    if (typeof text !== 'string' || text === '') throw new Error('QR.encode: there is no text to encode.');
    var bytes = utf8(text);
    var version = pickVersion(bytes.length);
    if (!version) {
      throw new Error('QR.encode: the text is ' + bytes.length + ' bytes long; the limit is ' + capacity(MAX_VERSION) + '.');
    }
    var codewords = interleave(buildData(bytes, version), version);
    var base = functionPatterns(version);
    var available = placeData(base, codewords);
    if (available < codewords.length * 8 || available - codewords.length * 8 > 7) {
      // Cannot happen with correct tables; a wrong table must never produce a code that looks fine.
      throw new Error('QR.encode: internal table error at version ' + version + '.');
    }

    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      var modules = applyMask(base, mask);
      drawFormat(modules, base.size, mask);
      drawVersion(modules, base.size, version);
      var score = penalty(modules, base.size);
      if (!best || score < best.score) best = { mask: mask, score: score, modules: modules };
    }
    return { text: text, version: version, size: base.size, mask: best.mask, ecLevel: 'M', modules: best.modules };
  }

  function asCode(textOrCode) {
    if (textOrCode && typeof textOrCode === 'object' && textOrCode.modules) return textOrCode;
    return encode(String(textOrCode == null ? '' : textOrCode));
  }

  function matrix(text) {
    return encode(text).modules;
  }


  /* ---------------------------------------------------------------------------
   * Drawing
   * ------------------------------------------------------------------------ */

  function quietOf(opts) {
    var q = opts && opts.quiet;
    return (typeof q === 'number' && q >= 0 && isFinite(q)) ? Math.round(q) : 4;
  }

  /* One path for every dark module: each run of dark modules in a row is one rectangle. */
  function svgPath(textOrCode, quiet) {
    var code = asCode(textOrCode);
    var q = (typeof quiet === 'number' && quiet >= 0) ? Math.round(quiet) : 4;
    var d = '';
    for (var r = 0; r < code.size; r++) {
      var c = 0;
      while (c < code.size) {
        if (!code.modules[r][c]) { c++; continue; }
        var start = c;
        while (c < code.size && code.modules[r][c]) c++;
        d += 'M' + (start + q) + ' ' + (r + q) + 'h' + (c - start) + 'v1h-' + (c - start) + 'z';
      }
    }
    return d;
  }

  function escapeXml(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /*
   * An <svg> string. No width or height: it scales to whatever box CSS gives
   * it. `dark` and `light` are any CSS colours ('currentColor' and CSS
   * variables work when the SVG is inline in a page).
   */
  function toSVG(textOrCode, opts) {
    opts = opts || {};
    var code = asCode(textOrCode);
    var q = quietOf(opts);
    var side = code.size + q * 2;
    var dark = opts.dark || '#000000';
    var light = opts.light === undefined ? '#ffffff' : opts.light;
    var title = opts.title ? '<title>' + escapeXml(opts.title) + '</title>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + side + ' ' + side + '" shape-rendering="crispEdges"' +
      ' role="img"' + (opts.title ? ' aria-label="' + escapeXml(opts.title) + '"' : '') + '>' + title +
      (light ? '<rect width="' + side + '" height="' + side + '" fill="' + escapeXml(light) + '"/>' : '') +
      '<path fill="' + escapeXml(dark) + '" d="' + svgPath(code, q) + '"/></svg>';
  }

  function svgElement(textOrCode, opts) {
    if (!root || !root.document) throw new Error('QR.svgElement needs a browser.');
    var holder = root.document.createElement('div');
    holder.innerHTML = toSVG(textOrCode, opts);
    return holder.firstChild;
  }

  /* Draw on a canvas at `scale` pixels per module. The canvas is resized to fit. */
  function drawCanvas(canvas, textOrCode, opts) {
    opts = opts || {};
    var code = asCode(textOrCode);
    var q = quietOf(opts);
    var scale = Math.max(1, Math.round(opts.scale || 8));
    var side = (code.size + q * 2) * scale;
    canvas.width = side;
    canvas.height = side;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, side, side);
    ctx.fillStyle = opts.dark || '#000000';
    for (var r = 0; r < code.size; r++) {
      for (var c = 0; c < code.size; c++) {
        if (code.modules[r][c]) ctx.fillRect((c + q) * scale, (r + q) * scale, scale, scale);
      }
    }
    return code;
  }


  /* ---------------------------------------------------------------------------
   * Export
   * ------------------------------------------------------------------------ */
  var QR = {
    encode: encode,
    matrix: matrix,
    svgPath: svgPath,
    toSVG: toSVG,
    svgElement: svgElement,
    drawCanvas: drawCanvas,
    capacity: capacity,
    MIN_VERSION: MIN_VERSION,
    MAX_VERSION: MAX_VERSION,
    MAX_BYTES: capacity(MAX_VERSION)
  };

  if (root) root.QR = QR;
  if (inNode) module.exports = QR;
})();
