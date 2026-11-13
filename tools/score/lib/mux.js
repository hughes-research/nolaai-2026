#!/usr/bin/env node
/*
 * tools/score/lib/mux.js: put a WAV on the finished picture without touching the picture.
 *
 *   node tools/score/lib/mux.js final.wav out.mp4 [--square out-square.mp4]
 *
 *   require('./mux.js').run(wavFile, outMp4, { square })  ->  { wide: {...}, square: {...} }
 *
 * The video stream of video/title-sequence.mp4 (and, with --square, of
 * video/title-square.mp4) is stream-copied, never re-encoded; the WAV is
 * encoded to AAC at 256 kb/s, 48 kHz, stereo. Afterwards it checks that the
 * video stream's MD5 is unchanged, that the file is h264 + AAC stereo at
 * 48 kHz and 46.0 s long, and prints the decoded audio's integrated loudness,
 * loudness range and true peak (what a viewer's player will actually get).
 *
 * It refuses to write into the repository's video/ folder unless asked to
 * install:
 *
 *   node mux.js final.wav --install
 *
 * replaces the sound of video/title-sequence.mp4 and video/title-square.mp4 in
 * place. Each new film is written beside the old one (<film>.new.mp4) and
 * checked there: picture MD5, codecs, length, decoded true peak. Only when
 * both new films pass are they renamed over the old ones; if either fails, or
 * ffmpeg does, both new files are removed and both films stay as they were.
 * The picture is still only copied: its MD5 before and after must be the same.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO, SECONDS } = require('./const.js');

const PICTURES = {
  wide: { file: path.join(REPO, 'video', 'title-sequence.mp4'), md5: 'bdc6eb79a212aae9d39410748f72228b' },
  square: { file: path.join(REPO, 'video', 'title-square.mp4'), md5: '12c86948ceca07e36e8f163572ac586e' }
};

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 27 });
  if (r.error) { throw new Error(cmd + ' could not run: ' + r.error.message); }
  if (r.status !== 0) { throw new Error(cmd + ' failed (' + r.status + '): ' + String(r.stderr || '').trim().slice(-800)); }
  return r;
}

/* MD5 of the video stream's packets, exactly as stored (no decode). */
function videoMd5(file) {
  return sh('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-']).stdout.trim().replace(/^MD5=/, '');
}

/* Integrated loudness, loudness range and true peak of a file's audio, decoded (EBU R128 via ffmpeg). */
function loudness(file) {
  const r = sh('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const text = String(r.stderr);
  const tail = text.slice(text.lastIndexOf('Summary:'));
  const num = function (re) { const m = re.exec(tail); return m ? Number(m[1]) : NaN; };
  return {
    lufs: num(/\bI:\s*(-?[\d.]+)\s*LUFS/),
    lra: num(/\bLRA:\s*(-?[\d.]+)\s*LU/),
    truePeakDb: num(/\bPeak:\s*(-?[\d.]+)\s*dBFS/)
  };
}

function probe(file) {
  const r = sh('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,channels,sample_rate,width,height:format=duration', '-of', 'json', file]);
  return JSON.parse(r.stdout);
}

/* Write one film and check it where it was written. An in-place mux writes <film>.new.mp4 and
 * leaves the film alone: settle() then renames it over the film, or removes it. */
function muxOne(wavFile, picture, outFile, opts) {
  const out = path.resolve(outFile);
  const videoDir = path.join(REPO, 'video') + path.sep;
  if (out.startsWith(videoDir) && !(opts && opts.allowVideoDir)) { throw new Error('mux never writes into ' + videoDir + ' (got ' + out + ')'); }
  if (!fs.existsSync(wavFile)) { throw new Error('no such WAV: ' + wavFile); }
  if (!fs.existsSync(picture.file)) { throw new Error('the picture is missing: ' + picture.file); }
  const before = videoMd5(picture.file);
  if (before !== picture.md5) {
    // The lab muxes onto the picture as shipped. An install may meet a re-rendered picture: say so and carry on.
    if (!(opts && opts.allowVideoDir)) { throw new Error('the picture has changed: ' + picture.file + ' video MD5 is ' + before + ', expected ' + picture.md5); }
    console.warn('mux: note: ' + path.basename(picture.file) + ' is not the picture of 2026-11-12 (video MD5 ' + before + '); its picture is copied as it is.');
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const inPlace = path.resolve(picture.file) === out;
  const target = inPlace ? out.replace(/\.mp4$/, '') + '.new.mp4' : out;
  let after, info, loud;
  try {
    sh('ffmpeg', ['-v', 'error', '-y', '-i', picture.file, '-i', wavFile, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', target]);
    after = videoMd5(target);
    info = probe(target);
    loud = loudness(target);
  } catch (e) {
    if (fs.existsSync(target)) { fs.unlinkSync(target); }     // never leave half a film behind
    throw e;
  }
  const v = info.streams.find(function (s) { return s.codec_type === 'video'; });
  const a = info.streams.find(function (s) { return s.codec_type === 'audio'; });
  const duration = Number(info.format.duration);
  const bad = [];
  if (after !== before) { bad.push('video MD5 changed from ' + before + ' to ' + after); }
  if (!v || v.codec_name !== 'h264') { bad.push('video is not h264'); }
  if (!a || a.codec_name !== 'aac') { bad.push('audio is not AAC'); }
  if (a && Number(a.channels) !== 2) { bad.push('audio has ' + a.channels + ' channels'); }
  if (a && Number(a.sample_rate) !== 48000) { bad.push('audio sample rate is ' + a.sample_rate); }
  if (!(Math.abs(duration - SECONDS) < 0.06)) { bad.push('duration is ' + duration + ' s'); }
  if (!(loud.truePeakDb <= -1.0)) { bad.push('decoded true peak is ' + loud.truePeakDb + ' dBTP (must stay under -1.5; hard fail above -1.0)'); }
  return {
    out: out, written: target, inPlace: inPlace, videoMd5: after, pictureUnchanged: after === before,
    width: v && v.width, height: v && v.height, duration: duration,
    lufs: loud.lufs, lra: loud.lra, truePeakDb: loud.truePeakDb,
    bytes: fs.statSync(target).size, ok: bad.length === 0, problems: bad
  };
}

/* Finish in-place muxes together: every new film replaces its old one only if all of them passed.
 * Otherwise the new files are removed and the films stay as they were. */
function settle(results) {
  const allOk = results.every(function (r) { return r && r.ok; });
  results.forEach(function (r) {
    if (!r || !r.inPlace) { return; }
    r.installed = allOk;
    if (!fs.existsSync(r.written)) { return; }
    if (allOk) { fs.renameSync(r.written, r.out); } else { fs.unlinkSync(r.written); }
  });
  return allOk;
}

function describe(name, r) {
  return name + ': ' + path.relative(process.cwd(), r.out) + '  ' + r.width + 'x' + r.height + ', ' + r.duration.toFixed(3) + ' s, ' +
    (r.bytes / 1e6).toFixed(1) + ' MB, picture ' + (r.pictureUnchanged ? 'unchanged (MD5 ' + r.videoMd5.slice(0, 8) + ')' : 'CHANGED') +
    ', decoded audio ' + r.lufs.toFixed(1) + ' LUFS, LRA ' + r.lra.toFixed(1) + ' LU, true peak ' + r.truePeakDb.toFixed(1) + ' dBTP' +
    (r.ok ? '' : '\n  PROBLEMS: ' + r.problems.join('; ')) +
    (r.inPlace && r.installed === false ? '\n  NOT INSTALLED: ' + path.basename(r.out) + ' was left as it was' + (r.ok ? ' (the other film did not pass)' : '') : '');
}

function run(wavFile, outMp4, opts) {
  opts = opts || {};
  const result = {};
  const done = [];
  try {
    result.wide = muxOne(wavFile, PICTURES.wide, outMp4, opts); done.push(result.wide);
    if (opts.square) { result.square = muxOne(wavFile, PICTURES.square, opts.square, opts); done.push(result.square); }
  } catch (e) { done.push(null); settle(done); throw e; }
  result.ok = settle(done);
  if (!opts.quiet) {
    console.log(describe('wide', result.wide));
    if (result.square) { console.log(describe('square', result.square)); }
  }
  return result;
}

/* Replace the sound of the two shipped films, in place: both or neither. */
function install(wavFile, opts) {
  const o = Object.assign({}, opts || {}, { allowVideoDir: true, square: PICTURES.square.file });
  return run(wavFile, PICTURES.wide.file, o);
}

module.exports = { run: run, install: install, videoMd5: videoMd5, loudness: loudness, PICTURES: PICTURES };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--square') { opts.square = argv[++i]; }
    else if (argv[i] === '--install') { opts.install = true; }
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('Usage: node mux.js final.wav out.mp4 [--square out-square.mp4]\n       node mux.js final.wav --install'); process.exit(0); }
    else { pos.push(argv[i]); }
  }
  if (pos.length !== (opts.install ? 1 : 2)) { console.error('Usage: node mux.js final.wav out.mp4 [--square out-square.mp4]\n       node mux.js final.wav --install'); process.exit(2); }
  try {
    const r = opts.install ? install(pos[0], {}) : run(pos[0], pos[1], opts);
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error('mux: ' + e.message);
    process.exit(1);
  }
}
