/*
 * tools/score/lib/sampler.js: recorded instruments through fluidsynth, offline.
 *
 *   const sampler = require('./sampler.js');
 *   const bass = sampler.render({
 *     font: 'fluidr3', bank: 0, program: 32,
 *     notes: [{ t: 0, dur: 0.45, midi: 36, vel: 0.7 }],
 *     seconds: 46
 *   });                                   // -> [Float32Array, Float32Array], exactly 46 * 48000 samples each
 *   const late = sampler.onset({ font: 'fluidr3', bank: 0, program: 32, midi: 36, vel: 0.7 });
 *                                         // seconds from note-on to the audible onset; start the note that much early
 *
 * How it renders (all of this was found by measurement; test-sampler.js keeps it true):
 *   - one fluidsynth process per call: fast file rendering (-F) at 48 kHz to a
 *     32-bit float WAV, reverb OFF, chorus OFF, 7th-order interpolation (the
 *     best fluidsynth offers), a fixed master gain, one CPU core;
 *   - "t means t": fluidsynth's file player reads its clock in whole
 *     milliseconds and works in blocks of 64 samples, so an event written at
 *     its nominal tick sounds 1.1 to 3.1 ms late. render() writes each event
 *     at the tick that makes it take effect on the 64-sample block nearest
 *     the requested time. What is left is at most +-32 samples (0.67 ms), and
 *     startOf(t) tells you exactly where a note starts;
 *   - 0.5 s of lead-in is rendered and cut off, so notes a little before 0
 *     are legal and nothing depends on fluidsynth's first instant;
 *   - the MIDI file runs past the end of the buffer, so release tails are
 *     rendered, and the buffer is cut to exactly seconds * 48000 samples;
 *   - a missing preset is an Error (fluidsynth alone would quietly play a
 *     different instrument).
 *
 * The output is float and is not clipped: values above 1.0 survive.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const midi = require('./midi.js');
const { SR, SECONDS } = require('./const.js');

const fonts = {
  fluidr3: '/usr/share/sounds/sf2/FluidR3_GM.sf2',
  musescore: '/usr/share/sounds/sf3/MuseScore_General.sf3'
};

const BLOCK = 64;                   // fluidsynth's internal block, samples
const PRE_BLOCKS = 375;             // 0.5 s of lead-in, rendered and thrown away
const PRE = PRE_BLOCKS * BLOCK / SR;
const END_MARGIN = 0.1;             // the MIDI file runs this far past the end of the buffer
const DEFAULT_GAIN = 0.5;           // fluidsynth master gain (fluidsynth's own default is 0.2)
const DRUM_DUR = 0.1;               // a drum hit without a dur
const INTERP = 7;                   // 0 none, 1 linear, 4 fourth order (fluidsynth's default), 7 seventh order
const ONSET_FILE = path.join(__dirname, 'audition', 'onsets.json');
const ONSET_WINDOW = 1.0;           // the peak is looked for in the first second of a held note
const ONSET_SIGNATURE = 'sampler-1 fluidsynth-offline 48000 interp' + INTERP + ' pre' + PRE_BLOCKS;

function fail(msg) { throw new Error('sampler: ' + msg); }
function isNum(x) { return typeof x === 'number' && isFinite(x); }

/* ---------------------------------------------------------------- timing
 * fluidsynth 2.3.4, file player, measured on 180 probe notes (0 mismatches):
 * at the start of block j the player's clock reads floor(64 j / 48) whole
 * milliseconds, it converts that to ticks with a 32-bit float tick length,
 * rounds, and sends every event up to that tick; the event is then heard from
 * the start of block j + 1. */
const TICK_MS = Math.fround(Math.fround(Math.fround(midi.TEMPO) / Math.fround(midi.PPQ)) / Math.fround(1000));
function ticksAtBlock(j) { return Math.floor(Math.floor(1000 * (BLOCK * j) / SR) / TICK_MS + 0.5); }
/* the tick to write so that an event takes effect at the start of block k (k >= 1) */
function tickForBlock(k) { return ticksAtBlock(k - 1); }
/* a time in the caller's buffer -> the rendered block nearest to it */
function blockOf(t) { return Math.round(t * SR / BLOCK) + PRE_BLOCKS; }

/* Where a note asked for at time t really starts, in seconds (the nearest 64-sample block). */
function startOf(t) {
  if (!isNum(t)) { fail('startOf(t): t is a number of seconds'); }
  return Math.round(t * SR / BLOCK) * BLOCK / SR;
}

/* ---------------------------------------------------------------- WAV in
 * A small reader for what fluidsynth writes here: RIFF/WAVE, 32-bit float. */
function readFloatWav(file) {
  const b = fs.readFileSync(file);
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') { fail('fluidsynth did not write a WAV file'); }
  let p = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (p + 8 <= b.length) {
    const id = b.toString('latin1', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      let tag = b.readUInt16LE(p + 8);
      if (tag === 0xfffe && size >= 26) { tag = b.readUInt16LE(p + 8 + 24); }     // WAVE_FORMAT_EXTENSIBLE: the real tag
      fmt = { tag: tag, channels: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    } else if (id === 'data') {
      dataOff = p + 8;
      dataLen = Math.min(size, b.length - dataOff);
      break;
    }
    p += 8 + size + (size & 1);
  }
  if (!fmt || dataOff < 0) { fail('the WAV from fluidsynth has no fmt or data chunk'); }
  if (fmt.tag !== 3 || fmt.bits !== 32 || fmt.channels !== 2 || fmt.sr !== SR) {
    fail('expected a 48 kHz stereo 32-bit float WAV from fluidsynth, got ' + JSON.stringify(fmt));
  }
  const frames = Math.floor(dataLen / 8);
  const inter = new Float32Array(b.buffer.slice(b.byteOffset + dataOff, b.byteOffset + dataOff + frames * 8));   // aligned copy (little-endian host)
  return { frames: frames, inter: inter };
}

/* ---------------------------------------------------------------- render */
function fontPath(font) {
  if (typeof font !== 'string' || !font) { fail('font is "fluidr3", "musescore" or a path to a SoundFont, got ' + font); }
  const file = Object.prototype.hasOwnProperty.call(fonts, font) ? fonts[font] : font;
  if (!fs.existsSync(file)) { fail('cannot find the SoundFont ' + file); }
  return file;
}

function midiVelocity(vel, where) {
  if (!isNum(vel) || vel < 0 || vel > 1) { fail(where + ': vel is 0..1, got ' + vel); }
  return Math.max(1, Math.round(vel * 127));
}

function normalise(req) {
  if (!req || typeof req !== 'object') { fail('render(request): request is an object'); }
  const bank = req.bank === undefined ? 0 : req.bank;
  const program = req.program === undefined ? 0 : req.program;
  if (!Number.isInteger(bank) || bank < 0 || bank > 128) { fail('bank is 0..128 (128 is a drum kit), got ' + req.bank); }
  if (!Number.isInteger(program) || program < 0 || program > 127) { fail('program is 0..127, got ' + req.program); }
  const seconds = req.seconds === undefined ? SECONDS : req.seconds;
  if (!isNum(seconds) || seconds <= 0 || seconds > 1800) { fail('seconds is a length above 0 (and at most 1800), got ' + req.seconds); }
  const gain = req.gain === undefined ? DEFAULT_GAIN : req.gain;
  if (!isNum(gain) || gain <= 0 || gain >= 10) { fail('gain is above 0 and below 10, got ' + req.gain); }
  if (req.notes !== undefined && !Array.isArray(req.notes)) { fail('notes is an array'); }
  if (req.cc !== undefined && !Array.isArray(req.cc)) { fail('cc is an array'); }
  return { file: fontPath(req.font), bank: bank, program: program, drum: bank === 128, seconds: seconds, gain: gain, notes: req.notes || [], cc: req.cc || [] };
}

function runFluidsynth(r, tracks, endSeconds, test) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-sampler-'));
  try {
    const mid = path.join(dir, 'in.mid'), wav = path.join(dir, 'out.wav'), cfg = path.join(dir, 'setup.cfg');
    midi.write(mid, tracks, { endSeconds: endSeconds });
    /* shell commands run before the file plays; player.reset-synth=0 keeps them (a reset would put the interpolation back to 4) */
    fs.writeFileSync(cfg, 'interp ' + (test && test.interp !== undefined ? test.interp : INTERP) + '\n');
    const rv = test && test.reverb ? '1' : '0', ch = test && test.chorus ? '1' : '0';
    const args = [
      '-n', '-i', '-q',
      '-f', cfg,
      '-F', wav, '-T', 'wav', '-O', 'float',
      '-r', String(SR),
      '-g', String(r.gain),
      '-R', rv, '-C', ch,
      '-o', 'synth.reverb.active=' + rv,
      '-o', 'synth.chorus.active=' + ch,
      '-o', 'player.reset-synth=0',
      '-o', 'player.timing-source=sample',
      '-o', 'synth.cpu-cores=1',
      '-o', 'synth.polyphony=256',
      /* the whole SoundFont is loaded each time (0.2 s for the SF2; 1 s and about 3 CPU-seconds for the SF3,
       * whose samples are Ogg Vorbis). Loading on demand would save CPU but changes some FluidR3 drum
       * renders at the -100 dB level, so it stays off: fluidsynth's reference behaviour. */
      '-o', 'synth.dynamic-sample-loading=0',
      '-o', 'synth.midi-bank-select=gs',
      '-o', 'audio.period-size=64',
      r.file, mid
    ];
    const run = cp.spawnSync('fluidsynth', args, { encoding: 'utf8', maxBuffer: 1 << 24, timeout: 15 * 60 * 1000 });
    if (run.error) {
      fail(run.error.code === 'ENOENT' ? 'fluidsynth is not on the PATH' : 'fluidsynth could not run: ' + run.error.message);
    }
    const log = ((run.stdout || '') + (run.stderr || '')).trim();
    if (run.status !== 0) { fail('fluidsynth exited with status ' + run.status + (log ? ': ' + log : '')); }
    if (/Instrument not found|No preset found/i.test(log)) {
      fail('no preset ' + String(r.bank).padStart(3, '0') + '-' + String(r.program).padStart(3, '0') + ' in ' + r.file + ' (' + log.split('\n')[0] + ')');
    }
    if (/error|panic/i.test(log)) { fail('fluidsynth reported: ' + log); }
    if (log) { console.warn('sampler: fluidsynth said: ' + log); }
    if (!fs.existsSync(wav)) { fail('fluidsynth wrote no audio' + (log ? ': ' + log : '')); }
    return readFloatWav(wav);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* Render one preset. Synchronous. See the top of the file. */
function render(req) {
  const r = normalise(req);
  const n = Math.round(r.seconds * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  const lastBlock = blockOf(n / SR) + Math.round(END_MARGIN * SR / BLOCK);    // nothing is written after this block
  const endSeconds = (lastBlock + 2) * BLOCK / SR;

  const notes = [];
  const seen = new Map();
  r.notes.forEach(function (note, i) {
    const where = 'note ' + i;
    if (!note || typeof note !== 'object') { fail(where + ' is not an object'); }
    if (!isNum(note.t)) { fail(where + ': t is a time in seconds, got ' + note.t); }
    if (note.t < -PRE + 0.01) { fail(where + ': t=' + note.t + ' is before the start (the earliest is ' + (-PRE + 0.01) + ')'); }
    let dur = note.dur;
    if (dur === undefined && r.drum) { dur = DRUM_DUR; }
    if (!isNum(dur) || dur <= 0) { fail(where + ': dur is a length in seconds above 0, got ' + note.dur); }
    if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) { fail(where + ': midi is a whole number 0..127, got ' + note.midi); }
    const vel = midiVelocity(note.vel, where);
    if (note.vel === 0) { return; }             // a note of no velocity makes no sound
    if (note.t >= n / SR) { return; }           // it would start after the end of the buffer
    const on = blockOf(note.t);
    const off = Math.min(lastBlock, Math.max(on + 1, blockOf(note.t + dur)));
    const id = note.midi + '@' + on;
    if (seen.has(id)) { fail(where + ': key ' + note.midi + ' is struck twice within 1.4 ms (also note ' + seen.get(id) + ', t=' + note.t + ')'); }
    seen.set(id, i);
    const tOn = tickForBlock(on), tOff = tickForBlock(off);
    notes.push({ t: tOn / midi.TICKS_PER_SECOND, dur: (tOff - tOn) / midi.TICKS_PER_SECOND, key: note.midi, vel: vel });
  });
  if (notes.length === 0) { return out; }

  const cc = r.cc.map(function (c, i) {
    const where = 'cc ' + i;
    if (!c || !isNum(c.t)) { fail(where + ': t is a time in seconds'); }
    if (c.t < -PRE + 0.01) { fail(where + ': t=' + c.t + ' is before the start'); }
    if (!Number.isInteger(c.cc) || c.cc < 0 || c.cc > 127) { fail(where + ': cc is 0..127, got ' + c.cc); }
    if (!Number.isInteger(c.value) || c.value < 0 || c.value > 127) { fail(where + ': value is 0..127, got ' + c.value); }
    return { t: tickForBlock(Math.min(lastBlock, blockOf(c.t))) / midi.TICKS_PER_SECOND, cc: c.cc, value: c.value };
  });

  const track = { channel: r.drum ? midi.DRUM_CHANNEL : 0, bank: r.bank, program: r.program, notes: notes, cc: cc };
  const wav = runFluidsynth(r, [track], endSeconds, req._test);
  const first = PRE_BLOCKS * BLOCK;
  if (wav.frames < first + n) { fail('fluidsynth rendered ' + wav.frames + ' samples, fewer than the ' + (first + n) + ' needed'); }
  const L = out[0], R = out[1], x = wav.inter;
  for (let i = 0, j = 2 * first; i < n; i++, j += 2) { L[i] = x[j]; R[i] = x[j + 1]; }
  return out;
}

/* ---------------------------------------------------------------- onsets
 * A sample does not speak at the instant of its note-on. onset() renders the
 * one note (held, on a block boundary so the measurement is exact to the
 * sample) and finds when max(|L|, |R|) first reaches 10 percent and 50 percent
 * of its peak in the first second. Results are cached in audition/onsets.json. */
let onsetCache = null;
function loadOnsets() {
  if (onsetCache) { return onsetCache; }
  onsetCache = {};
  try {
    const j = JSON.parse(fs.readFileSync(ONSET_FILE, 'utf8'));
    if (j && j.signature === ONSET_SIGNATURE && j.onsets && typeof j.onsets === 'object') { onsetCache = j.onsets; }
  } catch (e) { /* no cache yet, or an unreadable one: measure again */ }
  return onsetCache;
}
function saveOnsets() {
  /* merge with what another process may have written meanwhile, then replace the file in one step */
  try {
    let disk = {};
    try {
      const j = JSON.parse(fs.readFileSync(ONSET_FILE, 'utf8'));
      if (j && j.signature === ONSET_SIGNATURE && j.onsets) { disk = j.onsets; }
    } catch (e) { /* nothing to merge */ }
    const all = Object.assign(disk, onsetCache);
    const sorted = {};
    Object.keys(all).sort().forEach(function (k) { sorted[k] = all[k]; });
    onsetCache = sorted;
    fs.mkdirSync(path.dirname(ONSET_FILE), { recursive: true });
    const tmp = ONSET_FILE + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      signature: ONSET_SIGNATURE,
      about: 'seconds from note-on to 10 percent (t10) and 50 percent (t50) of the peak of max(|L|,|R|) in the first second; tPeak is where that peak is; peak is its value at gain ' + DEFAULT_GAIN + '. Key: font|bank|program|midi|MIDI velocity. Written by sampler.onset().',
      onsets: sorted
    }, null, 1) + '\n');
    fs.renameSync(tmp, ONSET_FILE);
  } catch (e) {
    console.warn('sampler: could not save ' + ONSET_FILE + ' (' + e.message + '); the onset was measured and is returned anyway');
  }
}

function fontName(font) {
  if (Object.prototype.hasOwnProperty.call(fonts, font)) { return font; }
  for (const k of Object.keys(fonts)) { if (fonts[k] === font) { return k; } }
  return font;
}

/* The measurement itself, on audio that is already rendered: a note whose
 * voice starts exactly at t0 (a multiple of 64 samples) and is held for at
 * least `window` seconds. -> { t10, t50, tPeak, peak } or { silent: true }. */
function onsetIn(st, t0, window) {
  const L = st[0], R = st[1];
  const i0 = Math.round(t0 * SR), i1 = Math.min(L.length, Math.round((t0 + (window || ONSET_WINDOW)) * SR));
  let peak = 0, at = i0;
  for (let i = i0; i < i1; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) { peak = a; at = i; } }
  if (peak === 0) { return { silent: true }; }
  let i10 = -1, i50 = -1;
  for (let i = i0; i <= at; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (i10 < 0 && a >= 0.1 * peak) { i10 = i; }
    if (a >= 0.5 * peak) { i50 = i; break; }
  }
  const round = function (x) { return Math.round(x * 1e6) / 1e6; };
  return { t10: round((i10 - i0) / SR), t50: round((i50 - i0) / SR), tPeak: round((at - i0) / SR), peak: Math.round(peak * 1e5) / 1e5 };
}

function measureOnset(req, vel127) {
  const T0 = 0.5;                         // a block boundary: the voice starts exactly there
  const st = render({ font: req.font, bank: req.bank, program: req.program, gain: DEFAULT_GAIN, seconds: T0 + ONSET_WINDOW + 0.25,
    notes: [{ t: T0, dur: ONSET_WINDOW, midi: req.midi, vel: vel127 / 127 }] });
  return onsetIn(st, T0, ONSET_WINDOW);
}

function onsetKey(font, bank, program, midiNote, vel127) { return [fontName(font), bank, program, midiNote, vel127].join('|'); }

/* For audition.js, which measures hundreds of notes in a few long renders:
 * put records made with onsetIn() into the cache in one go.
 * list: [{ font, bank, program, midi, vel (0..1), record }] */
function storeOnsets(list) {
  const cache = loadOnsets();
  for (const e of list) { cache[onsetKey(e.font, e.bank, e.program, e.midi, midiVelocity(e.vel, 'storeOnsets'))] = e.record; }
  saveOnsets();
}

/* The whole record: { t10, t50, tPeak, peak }. */
function onsetDetail(req) {
  if (!req || typeof req !== 'object') { fail('onset(request): request is an object { font, bank, program, midi, vel }'); }
  const bank = req.bank === undefined ? 0 : req.bank, program = req.program === undefined ? 0 : req.program;
  if (!Number.isInteger(req.midi) || req.midi < 0 || req.midi > 127) { fail('onset(): midi is a whole number 0..127, got ' + req.midi); }
  const vel = req.vel === undefined ? 0.7 : req.vel;
  const vel127 = midiVelocity(vel, 'onset()');
  if (vel === 0) { fail('onset(): vel 0 makes no sound'); }
  fontPath(req.font);
  const key = onsetKey(req.font, bank, program, req.midi, vel127);
  const cache = loadOnsets();
  if (!cache[key]) {
    cache[key] = measureOnset({ font: req.font, bank: bank, program: program, midi: req.midi }, vel127);
    saveOnsets();
  }
  const rec = onsetCache[key];
  if (rec.silent) { fail('onset(): ' + key + ' makes no sound (a key this preset does not have?)'); }
  return Object.assign({}, rec);
}

/* Seconds from note-on to the audible onset (the 10 percent point). To land a
 * hit at time T, start the note at T - onset(...). */
function onset(req) { return onsetDetail(req).t10; }

function version() {
  const run = cp.spawnSync('fluidsynth', ['--version'], { encoding: 'utf8' });
  if (run.error) { fail('fluidsynth is not on the PATH'); }
  const m = /runtime version ([0-9.]+)/.exec((run.stdout || '') + (run.stderr || ''));
  return m ? m[1] : 'unknown';
}

module.exports = {
  fonts: fonts,
  render: render,
  onset: onset,
  onsetDetail: onsetDetail,
  onsetIn: onsetIn,
  storeOnsets: storeOnsets,
  startOf: startOf,
  version: version,
  DEFAULT_GAIN: DEFAULT_GAIN,
  BLOCK: BLOCK,
  MAX_TIMING_ERROR: BLOCK / 2 / SR,   // seconds: 0.00067
  PRE: PRE,
  ONSET_FILE: ONSET_FILE
};
