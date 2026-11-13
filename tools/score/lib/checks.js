/*
 * tools/score/lib/checks.js: the self-checks every build runs last.
 *
 *   const result = require('./checks.js').run({
 *     file: 'final.wav',                 // or stereo: [Float32Array, Float32Array]
 *     sync: [{ t: 8, name: 'NO 1' }, { t: 17, name: 'NO 2' }, { t: 37, name: 'the slab' }],
 *     breath: [20.3, 22],
 *     lufs: [-16.5, -15.5], ceilingDb: -2, lra: [5, 12]
 *   });                                  // prints a table; -> { ok, failures: [strings], numbers: {...}, rows: [...] }
 *
 * Everything but `file` (or `stereo`) has the default shown; without `sync` the three HARD times are read
 * from video/score.js. `quiet: true` prints nothing. A build ends with:
 *
 *   if (!result.ok) { process.exit(1); }
 *
 * WHAT IT CHECKS (targets from BRIEF.md section 4.3 and section 5)
 *   format      48 kHz, stereo, 24-bit PCM, exactly 2,208,000 samples a channel (for `stereo`: the length)
 *   loudness    integrated LUFS inside `lufs` (BS.1770-4, as ffmpeg's ebur128)
 *   true peak   at or under `ceilingDb` (4x oversampled)
 *   range       loudness range inside `lra`
 *   clipping    no sample at full scale
 *   DC          each channel's mean within 0.0001 of zero
 *   clicks      no isolated discontinuity (see clicks() below: a steep note attack is not a click)
 *   sync        each time is on a whole frame at 30 fps, and the sound's onset there is within 10 ms of it
 *   breath      the held breath is below -60 dBFS RMS but is not digital silence (room tone: above -80 dBFS)
 *   room tone   no 100 ms of the piece before the final fade is quieter than -80 dBFS
 *   tail        the last 100 ms (45.9 s to the end) are below -60 dBFS RMS
 *   loop seam   the first and the last sample are near zero, so the film loops without a tick
 */
'use strict';

const path = require('path');
const { SR, N, SECONDS, REPO } = require('./const.js');
const dsp = require('./dsp.js');
const mix = require('./mix.js');
const wav = require('./wav.js');

function isBuf(b) { return b instanceof Float32Array || b instanceof Float64Array; }
function fmt(v, digits) { return Number.isFinite(v) ? v.toFixed(digits === undefined ? 1 : digits) : (v === -Infinity ? '-inf' : String(v)); }

/* ================================================================== clicks */

const CLICK_DEFAULTS = {
  floor: 0.004,      // the smallest jump that counts, as a fraction of full scale (-48 dBFS)
  ratio: 8,          // how far it must stand above what surrounds it
  windowMs: 2,       // the surroundings: this long before and this long after
  guard: 4,          // samples either side that belong to the jump itself
  mergeMs: 1         // jumps this close together are one click
};

/*
 * Find isolated discontinuities: a sample (or a step) that its neighbours do not predict.
 *
 * How: every sample is compared with the value a smooth curve through its four neighbours would have
 * there (cubic interpolation; the difference is the fourth difference of the signal divided by 6). For
 * anything band-limited, however steep, that difference is small and, where it is not (a cymbal, a
 * brush, the first milliseconds of a hard note), it is not alone: the samples around it differ by as
 * much. A digital click is alone. So a click is a sample where the difference
 *   - is at least `floor` (0.004 of full scale: a single wrong sample of 0.004, or a step of 0.008), and
 *   - is at least `ratio` (8) times the 90th percentile of the same difference over the 2 ms before it
 *     AND over the 2 ms after it (the larger of the two is used, so the first sample of a noisy attack,
 *     quiet before but busy after, is not a click; nor is the cut-off of a noisy sound).
 *
 * It does not see: a click smaller than 0.004; a click buried in something as bright as itself (a
 * cymbal's first 2 ms); three or more clicks inside 2 ms (that is noise, not a click).
 *
 * -> { count, clicks: [{ t, sample, channel, size, ratio }], looked, largestAttack: { t, size, ratio } | null }
 *    `looked` is how many jumps over the floor it examined; largestAttack is the examined jump that came
 *    nearest to counting without being one (how much margin the verdict has).
 */
function clicks(stereo, opts) {
  const chs = isBuf(stereo) ? [stereo] : stereo;
  if (!Array.isArray(chs) || !chs.length || !chs.every(isBuf)) { throw new Error('checks.clicks: expected a Stereo'); }
  const o = Object.assign({}, CLICK_DEFAULTS, opts || {});
  const W = Math.max(8, Math.round(o.windowMs * SR / 1000)), G = o.guard;
  const tmp = new Float32Array(W);
  const raw = [];
  let looked = 0, nearest = null;
  chs.forEach((x, c) => {
    const n = x.length;
    if (n < 5) { return; }
    const e = new Float32Array(n);
    for (let i = 2; i < n - 2; i++) { e[i] = Math.abs(x[i] - (4 * (x[i - 1] + x[i + 1]) - x[i - 2] - x[i + 2]) / 6); }
    function p90(from) {                   // the 90th percentile of the difference over [from, from + W)
      const a = Math.max(2, from), b = Math.min(n - 2, from + W);
      const len = b - a;
      if (len < 16) { return 0; }
      const t = len === W ? tmp : new Float32Array(len);
      for (let i = 0; i < len; i++) { t[i] = e[a + i]; }
      t.sort();
      return t[Math.min(len - 1, Math.floor(0.9 * len))];
    }
    for (let i = 2; i < n - 2; i++) {
      const a = e[i];
      if (a < o.floor) { continue; }
      if (a < e[i - 1] || a < e[i + 1] || a < e[i - 2] || a < e[i + 2]) { continue; }      // judge a jump at its largest sample
      looked++;
      const ref = Math.max(p90(i - G - W), p90(i + G + 1));
      const ratio = ref > 0 ? a / ref : Infinity;
      const item = { t: i / SR, sample: i, channel: c, size: a, ratio };
      if (ratio >= o.ratio) { raw.push(item); }
      else if (!nearest || ratio > nearest.ratio) { nearest = item; }
    }
  });
  raw.sort((a, b) => a.sample - b.sample);
  const merged = [];
  const gap = Math.round(o.mergeMs * SR / 1000);
  for (const k of raw) {
    const last = merged[merged.length - 1];
    if (last && k.sample - last.sample <= gap) { if (k.size > last.size) { merged[merged.length - 1] = k; } }
    else { merged.push(k); }
  }
  return { count: merged.length, clicks: merged, looked, largestAttack: nearest };
}

/* The largest sample-to-sample jump (what the modelled build counted as clicks; here it is only reported). */
function largestJump(stereo) {
  let best = 0, at = 0;
  for (const x of stereo) {
    for (let i = 1; i < x.length; i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > best) { best = d; at = i; } }
  }
  return { size: best, t: at / SR };
}

/* ================================================================== sync */

const ONSET_DEFAULTS = {
  searchMs: 60,      // look this far either side of the time
  windowMs: 2,       // the energy of this long ...
  beforeMs: 40,      // ... against the energy of this long just before it
  riseDb: 12,        // must be this much higher
  floorDb: -50,      // and at least this loud (dBFS RMS), so the room tone's own flutter cannot count
  toleranceMs: 10
};

/*
 * Find the onset near time t: the first sample, from 60 ms before t to 60 ms after it, where the energy
 * of the 2 ms that start there is more than 12 dB above the energy of the 40 ms before it.
 * -> { found, t: the onset in seconds, offsetMs: onset minus t, riseDb, levelDb: the 2 ms level in dBFS }
 */
function onset(stereo, t, opts) {
  const chs = isBuf(stereo) ? [stereo] : stereo;
  const o = Object.assign({}, ONSET_DEFAULTS, opts || {});
  if (!Number.isFinite(t)) { throw new Error('checks.onset: the time must be a number of seconds'); }
  const n = chs[0].length;
  const s = Math.round(t * SR), search = Math.round(o.searchMs * SR / 1000);
  const w = Math.max(1, Math.round(o.windowMs * SR / 1000)), b = Math.max(1, Math.round(o.beforeMs * SR / 1000));
  const lo = Math.max(0, s - search - b), hi = Math.min(n, s + search + w + 1);
  if (hi - lo < w + 2) { return { found: false, t: NaN, offsetMs: NaN, riseDb: NaN, levelDb: NaN }; }
  const cum = new Float64Array(hi - lo + 1);            // running energy, all channels
  for (let i = lo; i < hi; i++) {
    let p = 0;
    for (const x of chs) { p += x[i] * x[i]; }
    cum[i - lo + 1] = cum[i - lo] + p / chs.length;
  }
  const mean = (a, z) => { const A = Math.max(lo, a), Z = Math.min(hi, z); return Z > A ? (cum[Z - lo] - cum[A - lo]) / (Z - A) : 0; };
  const need = Math.pow(10, o.riseDb / 10), floor = Math.pow(10, o.floorDb / 10);
  for (let i = Math.max(0, s - search); i <= s + search && i + w <= n; i++) {
    const now = mean(i, i + w), before = mean(i - b, i);
    if (now > floor && now > need * before) {
      return { found: true, t: i / SR, offsetMs: (i - s) * 1000 / SR, riseDb: before > 0 ? 10 * Math.log10(now / before) : Infinity, levelDb: 10 * Math.log10(now) };
    }
  }
  return { found: false, t: NaN, offsetMs: NaN, riseDb: NaN, levelDb: NaN };
}

/* The three HARD sync times, read from the picture's own timeline (never copied by hand). */
function hardSync() {
  let score;
  try { score = require(path.join(REPO, 'video', 'score.js')); }
  catch (e) { throw new Error('checks.run: no `sync` was given and video/score.js could not be read (' + e.message + ')'); }
  return [
    { t: score.ideas[0].gates[0].land, name: 'NO 1' },
    { t: score.ideas[1].gates[1].land, name: 'NO 2' },
    { t: score.title.land, name: 'the slab' }
  ];
}

/* ================================================================== run */

function run(opts) {
  const o = opts || {};
  let st, info = null, label;
  if (o.stereo !== undefined) {
    st = o.stereo;
    if (!Array.isArray(st) || st.length !== 2 || !isBuf(st[0]) || !isBuf(st[1]) || st[0].length !== st[1].length) { throw new Error('checks.run: `stereo` must be [Float32Array, Float32Array] of equal length'); }
    label = o.name || 'the mix (in memory)';
  } else if (typeof o.file === 'string') {
    const w = wav.read(o.file);
    info = { sr: w.sr, channelCount: w.channels.length, bits: w.bits, float: w.float, frames: w.frames };
    if (w.channels.length < 2) { throw new Error('checks.run: ' + o.file + ' is mono; the film needs stereo'); }
    st = [w.channels[0], w.channels[1]];
    label = path.relative(process.cwd(), o.file) || o.file;
  } else { throw new Error('checks.run: give { file: "final.wav" } or { stereo: [left, right] }'); }

  const range = (v, def, what) => {
    const r = v === undefined ? def : v;
    if (!Array.isArray(r) || r.length !== 2 || !r.every(Number.isFinite) || r[0] > r[1]) { throw new Error('checks.run: ' + what + ' must be [low, high]'); }
    return r;
  };
  const lufsRange = range(o.lufs, [-16.5, -15.5], 'lufs');
  const lraRange = range(o.lra, [5, 12], 'lra');
  const breath = o.breath === false ? null : range(o.breath, [20.3, 22], 'breath');
  const ceilingDb = o.ceilingDb === undefined ? -2 : o.ceilingDb;
  if (!Number.isFinite(ceilingDb)) { throw new Error('checks.run: ceilingDb must be a number'); }
  const fps = o.fps || 30;
  const sync = o.sync === undefined ? hardSync() : o.sync;
  if (!Array.isArray(sync) || !sync.every((s) => s && Number.isFinite(s.t))) { throw new Error('checks.run: sync must be [{ t, name }]'); }
  const length = o.length === undefined ? N : o.length;

  const rows = [], failures = [], numbers = {};
  function row(name, measured, target, ok, why) {
    rows.push({ name, measured, target, ok });
    if (!ok) { failures.push(name + ': ' + (why || (measured + ' (target ' + target + ')'))); }
  }
  const n = st[0].length;

  // format and length
  if (info) {
    const good = info.sr === SR && info.channelCount === 2 && info.bits === 24 && !info.float && info.frames === length;
    row('format', (info.sr / 1000) + ' kHz, ' + info.channelCount + ' ch, ' + info.bits + '-bit ' + (info.float ? 'float' : 'PCM') + ', ' + info.frames + ' samples',
      '48 kHz, 2 ch, 24-bit PCM, ' + length + ' samples', good);
    numbers.format = info;
  } else {
    row('length', n + ' samples', length + ' samples', n === length);
  }
  numbers.samples = n; numbers.seconds = n / SR;

  // loudness, range, true peak
  const loud = mix.loudness(st);
  const tp = mix.truePeakDb(st);
  numbers.lufs = loud.lufs; numbers.lra = loud.lra; numbers.truePeakDb = tp;
  numbers.momentaryMax = loud.momentaryMax; numbers.shortTermMax = loud.shortTermMax;
  row('loudness', fmt(loud.lufs, 2) + ' LUFS', lufsRange[0] + ' to ' + lufsRange[1], loud.lufs >= lufsRange[0] && loud.lufs <= lufsRange[1]);
  row('true peak', fmt(tp, 2) + ' dBTP', 'at most ' + ceilingDb, tp <= ceilingDb + 0.005);
  row('loudness range', fmt(loud.lra, 1) + ' LU', lraRange[0] + ' to ' + lraRange[1], loud.lra >= lraRange[0] && loud.lra <= lraRange[1]);

  // clipping, DC
  let clipped = 0, peak = 0;
  const dc = [0, 0];
  for (let c = 0; c < 2; c++) {
    const x = st[c];
    let sum = 0;
    for (let i = 0; i < n; i++) { const v = x[i], a = v < 0 ? -v : v; sum += v; if (a > peak) { peak = a; } if (a >= 0.9999) { clipped++; } }
    dc[c] = n ? sum / n : 0;
  }
  numbers.samplePeakDb = dsp.db(peak); numbers.clipped = clipped; numbers.dc = dc;
  row('clipping', clipped + ' samples at full scale (sample peak ' + fmt(dsp.db(peak), 2) + ' dBFS)', '0', clipped === 0);
  row('DC', 'L ' + dc[0].toExponential(1) + ', R ' + dc[1].toExponential(1), 'within 1e-4', Math.abs(dc[0]) <= 1e-4 && Math.abs(dc[1]) <= 1e-4);

  // clicks
  const ck = clicks(st, o.clicks);
  const jump = largestJump(st);
  numbers.clicks = ck.clicks.map((k) => ({ t: k.t, channel: k.channel, size: k.size, ratio: k.ratio }));
  numbers.clickCount = ck.count; numbers.jumpsExamined = ck.looked;
  numbers.largestAttack = ck.largestAttack ? { t: ck.largestAttack.t, size: ck.largestAttack.size, ratio: ck.largestAttack.ratio } : null;
  numbers.largestJump = jump;
  let clickText = ck.count + ' isolated';
  if (ck.count) { clickText += ' (at ' + ck.clicks.slice(0, 6).map((k) => k.t.toFixed(4) + ' s').join(', ') + (ck.count > 6 ? ', ...' : '') + ')'; }
  else { clickText += '; steepest jump ' + jump.size.toFixed(3) + ' at ' + jump.t.toFixed(3) + ' s is an attack'; }
  row('clicks', clickText, '0', ck.count === 0,
    ck.count + ' isolated discontinuities, the first at ' + (ck.count ? ck.clicks[0].t.toFixed(4) + ' s (size ' + ck.clicks[0].size.toFixed(4) + ', ' + fmt(ck.clicks[0].ratio, 0) + ' times its surroundings)' : ''));

  // sync
  numbers.sync = [];
  for (const s of sync) {
    const name = s.name || ('sync ' + s.t + ' s');
    const frame = s.t * fps, onFrame = Math.abs(frame - Math.round(frame)) < 1e-6;
    const on = onset(st, s.t, o.onset);
    const tol = (o.onset && o.onset.toleranceMs) || ONSET_DEFAULTS.toleranceMs;
    numbers.sync.push({ name, t: s.t, frame, onFrame, found: on.found, onset: on.t, offsetMs: on.offsetMs, riseDb: on.riseDb, levelDb: on.levelDb });
    const good = onFrame && on.found && Math.abs(on.offsetMs) <= tol;
    const measured = on.found
      ? 'onset ' + on.t.toFixed(4) + ' s, ' + (on.offsetMs >= 0 ? '+' : '') + on.offsetMs.toFixed(1) + ' ms (frame ' + (onFrame ? Math.round(frame) : frame.toFixed(2)) + ')'
      : 'no onset within 60 ms (frame ' + (onFrame ? Math.round(frame) : frame.toFixed(2)) + ')';
    let why;
    if (!onFrame) { why = s.t + ' s is not on a whole frame at ' + fps + ' fps (frame ' + frame.toFixed(3) + ')'; }
    else if (!on.found) { why = 'nothing starts within 60 ms of ' + s.t + ' s (no 2 ms that is 12 dB above the 40 ms before it)'; }
    else { why = 'the sound starts ' + on.offsetMs.toFixed(1) + ' ms from ' + s.t + ' s (allowed: ' + tol + ' ms)'; }
    row('sync: ' + name + ' @ ' + s.t + ' s', measured, 'within ' + tol + ' ms, on a frame', good, why);
  }

  // the held breath, and room tone under everything
  if (breath) {
    const b = dsp.rmsDb(st, breath[0], breath[1]);
    numbers.breathDb = b;
    row('held breath ' + breath[0] + '-' + breath[1] + ' s', fmt(b, 1) + ' dBFS RMS', 'below -60, above -80 (not digital silence)', b < -60 && b > -80,
      b >= -60 ? fmt(b, 1) + ' dBFS RMS is not below -60' : fmt(b, 1) + ' dBFS RMS: no room tone (digital silence makes some devices mute and swallow the next entrance)');
  }
  const fadeStart = Math.min(n / SR, SECONDS) - 0.3;
  let quietest = Infinity, quietAt = 0;
  const win = Math.round(0.1 * SR);
  for (let s0 = 0; s0 + win <= Math.round(fadeStart * SR); s0 += win / 2) {
    let a = 0;
    for (let i = s0; i < s0 + win; i++) { a += st[0][i] * st[0][i] + st[1][i] * st[1][i]; }
    const v = a > 0 ? 10 * Math.log10(a / (2 * win)) : -Infinity;
    if (v < quietest) { quietest = v; quietAt = s0 / SR; }
  }
  numbers.quietestDb = quietest; numbers.quietestAt = quietAt;
  row('room tone under everything', 'quietest 100 ms: ' + fmt(quietest, 1) + ' dBFS at ' + quietAt.toFixed(2) + ' s', 'above -80', quietest > -80);

  // the tail and the loop seam
  const tail = dsp.rmsDb(st, n / SR - 0.1, n / SR);
  numbers.tailDb = tail;
  row('tail ' + (n / SR - 0.1).toFixed(1) + ' s to the end', fmt(tail, 1) + ' dBFS RMS', 'below -60', tail < -60);
  const seam = Math.max(Math.abs(st[0][0]), Math.abs(st[1][0]), Math.abs(st[0][n - 1]), Math.abs(st[1][n - 1]));
  numbers.seam = seam;
  row('loop seam', 'first and last samples within ' + seam.toExponential(1), 'under 0.003', seam < 0.003);

  const ok = failures.length === 0;
  if (!o.quiet) {
    const w0 = Math.max(...rows.map((r) => r.name.length)), w1 = Math.max(...rows.map((r) => r.measured.length));
    console.log('checks: ' + label);
    for (const r of rows) { console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(w0) + '  ' + r.measured.padEnd(w1) + '  (' + r.target + ')'); }
    console.log(ok ? '  all ' + rows.length + ' checks passed' : '  ' + failures.length + ' of ' + rows.length + ' checks FAILED');
  }
  return { ok, failures, numbers, rows };
}

module.exports = { run, clicks, onset, largestJump, hardSync, CLICK_DEFAULTS, ONSET_DEFAULTS };

/* node tools/score/lib/checks.js final.wav : the same checks from a shell; exit 0 only if every one passes. */
if (require.main === module) {
  const args = process.argv.slice(2);
  const help = args[0] === '--help' || args[0] === '-h';
  if (args.length !== 1 || help) { console.log('Usage: node tools/score/lib/checks.js final.wav'); process.exit(help ? 0 : 2); }
  let result;
  try { result = run({ file: path.resolve(args[0]) }); }
  catch (e) { console.error('checks: ' + e.message); process.exit(2); }
  process.exit(result.ok ? 0 : 1);
}
