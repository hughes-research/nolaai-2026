/*
 * tools/score/lib/wav.js: read and write WAV files. No dependencies.
 *
 *   const wav = require('./wav.js');
 *   const { sr, channels } = wav.read('final.wav');   // channels: [Float32Array, ...]
 *   const clipped = wav.write('final.wav', stereo);   // 24-bit PCM, TPDF dither
 *
 * read() understands PCM 8/16/24/32-bit, IEEE float 32/64-bit, the
 * WAVE_FORMAT_EXTENSIBLE wrapper around either, extra chunks (LIST and so on)
 * in any order, and a data chunk whose stated size is wrong because the file
 * was streamed (ffmpeg writes 0 or 0xFFFFFFFF then): it takes what is there.
 *
 * write() is the modelled build's writer (tools/score/modelled/build.js), with
 * the bit depth as an option. Full scale is 2^(bits-1), the same number read()
 * and ffmpeg divide by, so a file read and written with { dither: false }
 * comes back bit for bit.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { SR } = require('./const.js');

function rng(seed) {             // mulberry32, as dsp.rng (kept here so wav.js stands alone)
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The header only: { sr, channelCount, bits, float, frames, dataOffset, dataBytes, blockAlign }. */
function parse(buf, file) {
  const name = file || 'buffer';
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error('wav.read: ' + name + ' is not a RIFF/WAVE file');
  }
  let fmt = null, data = null;
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString('latin1', p, p + 4);
    let size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > buf.length) { throw new Error('wav.read: ' + name + ' has a broken fmt chunk'); }
      fmt = {
        tag: buf.readUInt16LE(body), channelCount: buf.readUInt16LE(body + 2), sr: buf.readUInt32LE(body + 4),
        blockAlign: buf.readUInt16LE(body + 12), bits: buf.readUInt16LE(body + 14)
      };
      if (fmt.tag === 0xFFFE) {            // WAVE_FORMAT_EXTENSIBLE: the real tag is the first two bytes of the sub-format GUID
        if (size < 40) { throw new Error('wav.read: ' + name + ' has a broken extensible fmt chunk'); }
        fmt.tag = buf.readUInt16LE(body + 24);
      }
    } else if (id === 'data') {
      if (size === 0 || size === 0xFFFFFFFF || body + size > buf.length) { size = buf.length - body; }   // streamed or cut short
      data = { offset: body, bytes: size };
      break;                               // the samples; nothing after them matters
    }
    p = body + size + (size & 1);          // chunks are padded to an even length
  }
  if (!fmt) { throw new Error('wav.read: ' + name + ' has no fmt chunk'); }
  if (!data) { throw new Error('wav.read: ' + name + ' has no data chunk'); }
  if (fmt.tag !== 1 && fmt.tag !== 3) { throw new Error('wav.read: ' + name + ' is not PCM or float (format tag ' + fmt.tag + ')'); }
  const isFloat = fmt.tag === 3;
  const okBits = isFloat ? [32, 64] : [8, 16, 24, 32];
  if (okBits.indexOf(fmt.bits) < 0) { throw new Error('wav.read: ' + name + ' has ' + fmt.bits + '-bit ' + (isFloat ? 'float' : 'PCM') + ' samples, which this reader does not handle'); }
  if (fmt.channelCount < 1) { throw new Error('wav.read: ' + name + ' has no channels'); }
  const bytesPer = fmt.bits / 8;
  const blockAlign = bytesPer * fmt.channelCount;
  return {
    sr: fmt.sr, channelCount: fmt.channelCount, bits: fmt.bits, float: isFloat,
    frames: Math.floor(data.bytes / blockAlign), dataOffset: data.offset, dataBytes: data.bytes, blockAlign
  };
}

/* The facts of a file without decoding the samples. */
function info(file) {
  const h = parse(fs.readFileSync(file), file);
  return { sr: h.sr, channelCount: h.channelCount, bits: h.bits, float: h.float, frames: h.frames, seconds: h.frames / h.sr };
}

/* -> { sr, channels: [Float32Array, ...], bits, float, frames }. Samples are -1..1. */
function read(file) {
  if (typeof file !== 'string') { throw new Error('wav.read: give a file path'); }
  if (!fs.existsSync(file)) { throw new Error('wav.read: no such file: ' + file); }
  const buf = fs.readFileSync(file);
  const h = parse(buf, file);
  const nc = h.channelCount, frames = h.frames, bytesPer = h.bits / 8;
  const channels = [];
  for (let c = 0; c < nc; c++) { channels.push(new Float32Array(frames)); }
  let p = h.dataOffset;
  if (h.float) {
    for (let n = 0; n < frames; n++) {
      for (let c = 0; c < nc; c++) { channels[c][n] = bytesPer === 4 ? buf.readFloatLE(p) : buf.readDoubleLE(p); p += bytesPer; }
    }
  } else if (h.bits === 24) {
    for (let n = 0; n < frames; n++) {
      for (let c = 0; c < nc; c++) {
        channels[c][n] = (buf[p] | (buf[p + 1] << 8) | ((buf[p + 2] << 24) >> 8)) / 8388608;
        p += 3;
      }
    }
  } else if (h.bits === 16) {
    for (let n = 0; n < frames; n++) {
      for (let c = 0; c < nc; c++) { channels[c][n] = buf.readInt16LE(p) / 32768; p += 2; }
    }
  } else if (h.bits === 32) {
    for (let n = 0; n < frames; n++) {
      for (let c = 0; c < nc; c++) { channels[c][n] = buf.readInt32LE(p) / 2147483648; p += 4; }
    }
  } else {                                 // 8-bit PCM is unsigned
    for (let n = 0; n < frames; n++) {
      for (let c = 0; c < nc; c++) { channels[c][n] = (buf[p] - 128) / 128; p += 1; }
    }
  }
  return { sr: h.sr, channels, bits: h.bits, float: h.float, frames };
}

/*
 * Write channels (a Stereo, or any array of equal-length Float32Arrays; one
 * Float32Array is written as mono) to a WAV file. Returns the count of samples
 * that clipped.
 *   bits:   24 (default) or 16: PCM with TPDF dither of one LSB. 32: IEEE float, no
 *           dither; the count is then the samples beyond full scale.
 *   dither: false turns the dither off (bit-exact copies, tests).
 *   seed:   the dither's seed (default 13, as the modelled build), so a build is the same every run.
 *   sr:     sample rate (default 48000).
 */
function write(file, stereo, opts) {
  const o = opts || {};
  const bits = o.bits === undefined ? 24 : o.bits;
  if (bits !== 16 && bits !== 24 && bits !== 32) { throw new Error('wav.write: bits must be 16, 24 (PCM) or 32 (float), not ' + bits); }
  if (typeof file !== 'string' || !file) { throw new Error('wav.write: give a file path'); }
  const chans = (stereo instanceof Float32Array || stereo instanceof Float64Array) ? [stereo] : stereo;
  if (!Array.isArray(chans) || !chans.length || !chans.every((c) => c instanceof Float32Array || c instanceof Float64Array)) {
    throw new Error('wav.write: give a Stereo ([Float32Array, Float32Array])');
  }
  const frames = chans[0].length, nc = chans.length;
  if (!chans.every((c) => c.length === frames)) { throw new Error('wav.write: the channels are not the same length'); }
  const sr = o.sr || SR;
  const bytesPer = bits / 8;
  const data = Buffer.alloc(frames * nc * bytesPer);
  let clipped = 0, p = 0;
  if (bits === 32) {
    for (let n = 0; n < frames; n++) {
      for (let c = 0; c < nc; c++) {
        const v = chans[c][n];
        if (!(v >= -1 && v <= 1)) { if (Number.isNaN(v)) { throw new Error('wav.write: NaN at sample ' + n + ' of channel ' + c); } clipped++; }
        data.writeFloatLE(v, p); p += 4;
      }
    }
  } else {
    const FS = bits === 24 ? 8388608 : 32768;
    const d = rng(o.seed === undefined ? 13 : o.seed);
    const dither = o.dither !== false;
    for (let n = 0; n < frames; n++) {
      for (let c = 0; c < nc; c++) {
        const x = chans[c][n];
        if (Number.isNaN(x)) { throw new Error('wav.write: NaN at sample ' + n + ' of channel ' + c); }
        let v = Math.round(x * FS + (dither ? d() - d() : 0));     // TPDF dither, 1 LSB
        if (v > FS - 1) { v = FS - 1; clipped++; }
        if (v < -FS) { v = -FS; clipped++; }
        if (bits === 24) { data[p] = v & 255; data[p + 1] = (v >> 8) & 255; data[p + 2] = (v >> 16) & 255; p += 3; }
        else { data.writeInt16LE(v, p); p += 2; }
      }
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(bits === 32 ? 3 : 1, 20); h.writeUInt16LE(nc, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * nc * bytesPer, 28); h.writeUInt16LE(nc * bytesPer, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
  return clipped;
}

module.exports = { read, write, info };
