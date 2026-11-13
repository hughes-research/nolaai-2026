/*
 * tools/score/lib/midi.js: a Standard MIDI File writer.
 *
 *   require('./midi.js').write(file, tracks, { endSeconds: 48 });
 *   tracks: [{ channel: 0..15, bank, program,
 *              notes: [{ t, dur, key, vel: 1..127 }],
 *              cc:    [{ t, cc, value }] }]
 *
 * Format 1, 120 BPM, 960 ticks a beat: a tick is 1/1920 s (0.52 ms).
 * Track 0 holds the tempo; each entry of `tracks` becomes one more track.
 *
 * What it does for you:
 *   - bank and program are sent at tick 0, before anything else;
 *   - a drum kit is bank 128: it must sit on channel 9 (MIDI channel 10) and
 *     only the program change is sent (that is how General MIDI and
 *     fluidsynth's default "gs" bank mode select a kit);
 *   - at one tick the order is: controllers, note-offs, note-ons;
 *   - every note lasts at least one tick;
 *   - a key struck again while it is still held is released at that instant
 *     (MIDI cannot hold one key twice on one channel; without this the first
 *     note's note-off would cut the second note short);
 *   - the file runs to `endSeconds`: every track ends there, so a renderer
 *     that stops at the end of the file still renders the release tails.
 *
 * write() returns { ticks, events, shortened } for the curious.
 */
'use strict';
const fs = require('fs');

const PPQ = 960;                    // ticks a beat
const TEMPO = 500000;               // microseconds a beat: 120 BPM
const TICKS_PER_SECOND = PPQ * 1e6 / TEMPO;   // 1920
const DRUM_CHANNEL = 9;
const DRUM_BANK = 128;

function fail(msg) { throw new Error('midi: ' + msg); }
function isNum(x) { return typeof x === 'number' && isFinite(x); }
function tick(t) { return Math.round(t * TICKS_PER_SECOND); }

function varLen(n) {                // a MIDI variable-length quantity
  const out = [n & 0x7f];
  n = Math.floor(n / 128);
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  return out;
}
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n) { return [(n >>> 8) & 255, n & 255]; }
function chunk(id, body) {
  return Buffer.concat([Buffer.from(id, 'latin1'), Buffer.from(u32(body.length)), Buffer.from(body)]);
}

/* events: [{ tick, order, bytes }] -> the bytes of one track, ending at endTick */
function trackBytes(events, endTick) {
  events.sort(function (a, b) { return a.tick - b.tick || a.order - b.order || a.seq - b.seq; });
  const out = [];
  let now = 0;
  for (const e of events) {
    for (const b of varLen(e.tick - now)) { out.push(b); }
    for (const b of e.bytes) { out.push(b); }
    now = e.tick;
  }
  for (const b of varLen(Math.max(0, endTick - now))) { out.push(b); }
  out.push(0xff, 0x2f, 0x00);       // end of track
  return out;
}

function buildTrack(tr, index, endTick) {
  const where = 'track ' + index;
  if (!tr || typeof tr !== 'object') { fail(where + ' is not an object'); }
  const ch = tr.channel === undefined ? 0 : tr.channel;
  if (!Number.isInteger(ch) || ch < 0 || ch > 15) { fail(where + ': channel is 0..15, got ' + tr.channel); }
  const bank = tr.bank === undefined ? (ch === DRUM_CHANNEL ? DRUM_BANK : 0) : tr.bank;
  const program = tr.program === undefined ? 0 : tr.program;
  if (!Number.isInteger(bank) || bank < 0 || bank > DRUM_BANK) { fail(where + ': bank is 0..128, got ' + tr.bank); }
  if (!Number.isInteger(program) || program < 0 || program > 127) { fail(where + ': program is 0..127, got ' + tr.program); }
  if (bank === DRUM_BANK && ch !== DRUM_CHANNEL) { fail(where + ': a drum kit (bank 128) must be on channel 9 (MIDI channel 10), got channel ' + ch); }
  if (bank !== DRUM_BANK && ch === DRUM_CHANNEL) { fail(where + ': channel 9 (MIDI channel 10) only plays drum kits (bank 128), got bank ' + bank); }

  const ev = [];
  let seq = 0;
  const push = function (t, order, bytes) { ev.push({ tick: t, order: order, seq: seq++, bytes: bytes }); };

  /* order 0: the preset, at tick 0 */
  if (bank !== DRUM_BANK) {
    push(0, 0, [0xb0 | ch, 0, bank & 0x7f]);     // bank select MSB (fluidsynth "gs" mode: this is the bank)
    push(0, 0, [0xb0 | ch, 32, 0]);              // bank select LSB
  }
  push(0, 0, [0xc0 | ch, program]);

  /* order 1: controllers */
  for (const [i, c] of (tr.cc || []).entries()) {
    const w = where + ' cc ' + i;
    if (!c || !isNum(c.t) || c.t < 0) { fail(w + ': t is a time in seconds, 0 or later'); }
    if (!Number.isInteger(c.cc) || c.cc < 0 || c.cc > 127) { fail(w + ': cc is 0..127, got ' + c.cc); }
    if (!Number.isInteger(c.value) || c.value < 0 || c.value > 127) { fail(w + ': value is 0..127, got ' + c.value); }
    if (tick(c.t) > endTick) { fail(w + ': t=' + c.t + ' is after the end of the file'); }
    push(tick(c.t), 1, [0xb0 | ch, c.cc, c.value]);
  }

  /* notes: validate, then resolve a key struck twice */
  const notes = [];
  for (const [i, n] of (tr.notes || []).entries()) {
    const w = where + ' note ' + i;
    if (!n || !isNum(n.t) || n.t < 0) { fail(w + ': t is a time in seconds, 0 or later, got ' + (n && n.t)); }
    if (!isNum(n.dur) || n.dur <= 0) { fail(w + ': dur is a length in seconds above 0, got ' + n.dur); }
    if (!Number.isInteger(n.key) || n.key < 0 || n.key > 127) { fail(w + ': key is 0..127, got ' + n.key); }
    if (!Number.isInteger(n.vel) || n.vel < 1 || n.vel > 127) { fail(w + ': vel is 1..127, got ' + n.vel); }
    const on = tick(n.t);
    const off = Math.max(on + 1, tick(n.t + n.dur));
    if (off > endTick) { fail(w + ': it ends at ' + (n.t + n.dur).toFixed(3) + ' s, after the end of the file (' + (endTick / TICKS_PER_SECOND) + ' s)'); }
    notes.push({ on: on, off: off, key: n.key, vel: n.vel, i: i });
  }
  notes.sort(function (a, b) { return a.on - b.on || a.i - b.i; });
  const held = new Map();           // key -> the note still sounding
  let shortened = 0;
  for (const n of notes) {
    const prev = held.get(n.key);
    if (prev && prev.off > n.on) {
      if (prev.on === n.on) { fail(where + ': key ' + n.key + ' is struck twice at the same instant (notes ' + prev.i + ' and ' + n.i + ')'); }
      prev.off = n.on; shortened++;
    }
    held.set(n.key, n);
  }
  for (const n of notes) {
    push(n.off, 2, [0x80 | ch, n.key, 64]);
    push(n.on, 3, [0x90 | ch, n.key, n.vel]);
  }
  return { bytes: trackBytes(ev, endTick), events: ev.length, shortened: shortened };
}

function write(file, tracks, opts) {
  if (typeof file !== 'string' || !file) { fail('write(file, tracks, opts): file is a path'); }
  if (!Array.isArray(tracks) || tracks.length === 0) { fail('write(file, tracks, opts): tracks is a non-empty array'); }
  const endSeconds = opts && opts.endSeconds !== undefined ? opts.endSeconds : 48;
  if (!isNum(endSeconds) || endSeconds <= 0) { fail('endSeconds is a time in seconds above 0, got ' + endSeconds); }
  const endTick = Math.ceil(endSeconds * TICKS_PER_SECOND - 1e-9);

  const tempoTrack = trackBytes([
    { tick: 0, order: 0, seq: 0, bytes: [0xff, 0x51, 0x03, (TEMPO >> 16) & 255, (TEMPO >> 8) & 255, TEMPO & 255] },
    { tick: 0, order: 0, seq: 1, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] }      // 4/4
  ], endTick);

  const built = tracks.map(function (tr, i) { return buildTrack(tr, i, endTick); });
  const header = chunk('MThd', u16(1).concat(u16(tracks.length + 1), u16(PPQ)));
  const parts = [header, chunk('MTrk', tempoTrack)];
  for (const b of built) { parts.push(chunk('MTrk', b.bytes)); }
  fs.writeFileSync(file, Buffer.concat(parts));
  return {
    ticks: endTick,
    events: built.reduce(function (s, b) { return s + b.events; }, 0),
    shortened: built.reduce(function (s, b) { return s + b.shortened; }, 0)
  };
}

module.exports = {
  write: write,
  PPQ: PPQ, TEMPO: TEMPO, TICKS_PER_SECOND: TICKS_PER_SECOND, DRUM_CHANNEL: DRUM_CHANNEL, DRUM_BANK: DRUM_BANK
};
