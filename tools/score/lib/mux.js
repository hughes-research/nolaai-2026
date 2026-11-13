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
 * encoded to AAC at 256 kb/s, 48 kHz, stereo. A WAV that is not at 48 kHz, in
 * stereo and 46.000 s long (as the builds write it) is refused before a film
 * is written. Afterwards it checks that the video stream's MD5 is unchanged,
 * that the file is h264 + AAC stereo at 48 kHz, that the film is within
 * 0.06 s of 46 s and so are its picture and its sound (where the file gives
 * their own lengths, as an .mp4 does), and prints the decoded audio's
 * integrated loudness, loudness range and true peak (what a viewer's player
 * will actually get).
 *
 * It refuses to write into the repository's video/ folder: symbolic links in
 * the path are followed first, a link that leads to nothing is refused, and so
 * is a hard link to one of the files in video/. The one exception is an
 * install:
 *
 *   node mux.js final.wav --install
 *
 * replaces the sound of video/title-sequence.mp4 and video/title-square.mp4 in
 * place. While one install runs, a second is refused (video/.install.lock
 * marks the running one).
 * Each new film is written beside the old one (title-sequence.new.mp4,
 * title-square.new.mp4) and checked there: picture MD5, codecs, length,
 * decoded true peak. Only when both new films pass are they renamed over the
 * old ones; if either fails, or ffmpeg does, both new files are removed and
 * both films stay as they were. A run that is killed while a new film is
 * being written also leaves both films as they were, but it can leave a
 * .new.mp4 and the lock behind: the next install removes them.
 * One case is not both or neither: if the system will not let the second
 * film be replaced at that last step (a locked file, for example), the first
 * film already has the new sound. The run then stops, removes the new file
 * that is left and says which film has the new sound and which has not.
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
  const r = sh('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,channels,sample_rate,width,height,duration:format=duration', '-of', 'json', file]);
  return JSON.parse(r.stdout);
}

/* Where a path really leads, with symbolic links followed, also when its last parts are not there yet. */
function real(file) {
  const abs = path.resolve(file);
  if (fs.existsSync(abs)) { return fs.realpathSync.native(abs); }
  let link = false;
  try { link = fs.lstatSync(abs).isSymbolicLink(); } catch (e) { /* nothing is there yet */ }
  if (link) { throw new Error('this is a symbolic link that leads to nothing, and mux does not write through one: ' + abs); }
  const up = path.dirname(abs);
  return up === abs ? abs : path.join(real(up), path.basename(abs));
}

/* The name of the file in dir that is this very file on the disk (a hard link gives a file a second name), if there is one. */
function twinIn(dir, file) {
  try {
    const me = fs.statSync(file, { bigint: true });
    return fs.readdirSync(dir).find(function (name) {
      const s = fs.statSync(path.join(dir, name), { bigint: true, throwIfNoEntry: false });
      return Boolean(s) && s.dev === me.dev && s.ino === me.ino;
    });
  } catch (e) { return undefined; }                          // no such file yet, or no such folder: nothing is shared
}

/* The WAV must fit the film: 48 kHz, stereo, 46.000 s. Checked before a film is written. */
function checkWav(wavFile) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,duration', '-of', 'json', '-i', wavFile], { encoding: 'utf8' });
  if (r.error) { throw new Error('ffprobe could not run: ' + r.error.message); }
  if (r.status !== 0) { throw new Error('not a sound file that ffprobe can read: ' + wavFile); }
  const s = (JSON.parse(r.stdout).streams || [])[0];
  if (!s) { throw new Error('there is no sound in ' + wavFile); }
  const length = Number(s.duration);
  const wrong = [];
  if (Number(s.sample_rate) !== 48000) { wrong.push('it is at ' + s.sample_rate + ' Hz (the film needs 48000)'); }
  if (Number(s.channels) !== 2) { wrong.push('it has ' + s.channels + ' channel' + (Number(s.channels) === 1 ? '' : 's') + ' (the film needs 2)'); }
  if (!Number.isFinite(length)) { wrong.push('ffprobe gives no length for it (the film is ' + SECONDS.toFixed(3) + ' s)'); }
  else if (length.toFixed(3) !== SECONDS.toFixed(3)) { wrong.push('it is ' + length.toFixed(3) + ' s long (the film is ' + SECONDS.toFixed(3) + ' s)'); }
  if (wrong.length) { throw new Error('the WAV does not fit the film: ' + wrong.join('; ') + ': ' + wavFile); }
}

/* While one install runs, a second is refused. Two at once write the same <film>.new.mp4, and the first to finish can
 * rename a file the second is still writing: that leaves a film without its index. */
function lockInstall() {
  const lock = path.join(REPO, 'video', '.install.lock');
  try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); } catch (e) {
    if (e.code !== 'EEXIST') { throw new Error('cannot write into ' + path.dirname(lock) + ': ' + e.message); }
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    const young = Date.now() - fs.statSync(lock).mtimeMs < 5000;
    let alive = false;
    try { if (pid > 0) { process.kill(pid, 0); alive = true; } } catch (e2) { alive = e2.code === 'EPERM'; }
    if (alive) { throw new Error('another install is running (process ' + pid + '). Let it finish, then run this again. If none is running, delete ' + lock); }
    if (!(pid > 0) && young) { throw new Error('an install seems to be starting: ' + lock + ' is a few seconds old and holds no process number yet. Run this again in ten seconds.'); }
    try { fs.writeFileSync(lock, String(process.pid)); }  // left by a run that was killed
    catch (e3) { throw new Error('cannot write into ' + path.dirname(lock) + ': ' + e3.message); }
  }
  return function () { try { fs.unlinkSync(lock); } catch (e) { /* gone already */ } };
}

/* Write one film and check it where it was written. An in-place mux writes <film>.new.mp4 and
 * leaves the film alone: settle() then renames it over the film, or removes it. */
function muxOne(wavFile, picture, outFile, opts) {
  const out = real(outFile);
  const videoDir = real(path.join(REPO, 'video')) + path.sep;
  if (!(opts && opts.allowVideoDir)) {
    if ((out + path.sep).startsWith(videoDir)) { throw new Error('mux never writes into ' + videoDir + ' (got ' + out + ')'); }
    const twin = twinIn(videoDir, out);
    if (twin) { throw new Error('mux never writes into ' + videoDir + ' (' + out + ' is a hard link to ' + twin + ' there)'); }
  }
  if (!fs.existsSync(wavFile)) { throw new Error('no such WAV: ' + wavFile); }
  if (real(wavFile) === out) { throw new Error('the output is the WAV itself: ' + out); }
  if (fs.existsSync(out) && fs.statSync(out).isDirectory()) { throw new Error('the output is a folder, not a file: ' + out); }
  checkWav(wavFile);
  if (!fs.existsSync(picture.file)) { throw new Error('the picture is missing: ' + picture.file); }
  const before = videoMd5(picture.file);
  if (before !== picture.md5) {
    // The lab muxes onto the picture as shipped. An install may meet a re-rendered picture: say so and carry on.
    if (!(opts && opts.allowVideoDir)) { throw new Error('the picture has changed: ' + picture.file + ' video MD5 is ' + before + ', expected ' + picture.md5); }
    console.warn('mux: note: ' + path.basename(picture.file) + ' is not the picture of 2026-11-12 (video MD5 ' + before + '); its picture is copied as it is.');
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const inPlace = real(picture.file) === out;
  const target = inPlace ? out.replace(/\.mp4$/, '') + '.new.mp4' : out;
  const had = fs.existsSync(target) ? fs.statSync(target) : null;
  let after, info, loud;
  try {
    sh('ffmpeg', ['-v', 'error', '-y', '-i', picture.file, '-i', wavFile, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', target]);
    after = videoMd5(target);
    info = probe(target);
    loud = loudness(target);
  } catch (e) {
    try {                                                      // never leave half a film behind, never remove a file this run did not write
      const now = fs.existsSync(target) ? fs.statSync(target) : null;
      if (now && !(had && now.mtimeMs === had.mtimeMs && now.size === had.size)) { fs.unlinkSync(target); }
    } catch (e2) { /* the first error is the one to report */ }
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
  if (a && a.duration !== undefined && !(Math.abs(Number(a.duration) - SECONDS) < 0.06)) { bad.push('the sound is ' + a.duration + ' s long, the film ' + SECONDS + ' s'); }
  if (v && v.duration !== undefined && !(Math.abs(Number(v.duration) - SECONDS) < 0.06)) { bad.push('the picture is ' + v.duration + ' s long, the film should be ' + SECONDS + ' s'); }
  if (Number.isNaN(loud.truePeakDb)) { bad.push('the decoded sound has no peak that ffmpeg could give as a number (digital silence?)'); }
  else if (!(loud.truePeakDb <= -1.0)) { bad.push('decoded true peak is ' + loud.truePeakDb + ' dBTP (must stay under -1.5; hard fail above -1.0)'); }
  return {
    out: out, written: target, inPlace: inPlace, videoMd5: after, pictureUnchanged: after === before,
    width: v && v.width, height: v && v.height, duration: duration,
    lufs: loud.lufs, lra: loud.lra, truePeakDb: loud.truePeakDb,
    bytes: fs.statSync(target).size, ok: bad.length === 0, problems: bad
  };
}

/* Finish in-place muxes together: every new film replaces its old one only if all of them passed.
 * Otherwise the new files are removed and the films stay as they were. If the system will not let a
 * film be replaced at this last step, the new files that are left are removed and the error says
 * which film has the new sound and which has not. */
function settle(results) {
  const allOk = results.every(function (r) { return r && r.ok; });
  const replaced = [];
  results.forEach(function (r) {
    if (!r || !r.inPlace) { return; }
    r.installed = allOk;
    if (!fs.existsSync(r.written)) { return; }
    if (!allOk) { fs.unlinkSync(r.written); return; }
    try { fs.renameSync(r.written, r.out); replaced.push(path.basename(r.out)); } catch (e) {
      const film = path.basename(r.out);
      const err = new Error('could not replace ' + film + ': ' + e.message + '\n  ' +
        (replaced.length ? 'CAREFUL: ' + replaced.join(' and ') + ' already has the new sound and ' + film + ' still has the old one.' : 'No film was replaced.') +
        '\n  Find what holds ' + film + ' (a locked file, for example), free it, and run the install again.');
      err.replaced = replaced.length > 0;
      results.forEach(function (x) { if (x && x.inPlace) { try { fs.unlinkSync(x.written); } catch (e2) { /* renamed already, or the first error is the one to report */ } } });
      throw err;
    }
  });
  return allOk;
}

function describe(name, r) {
  return name + ': ' + path.relative(process.cwd(), r.out) + '  ' + r.width + 'x' + r.height + ', ' + r.duration.toFixed(3) + ' s, ' +
    (r.bytes / 1e6).toFixed(1) + ' MB, picture ' + (r.pictureUnchanged ? 'unchanged (MD5 ' + r.videoMd5.slice(0, 8) + ')' : 'CHANGED') +
    ', decoded audio ' + r.lufs.toFixed(1) + ' LUFS, LRA ' + r.lra.toFixed(1) + ' LU, true peak ' + (Number.isNaN(r.truePeakDb) ? 'not a number' : r.truePeakDb.toFixed(1) + ' dBTP') +
    (r.ok ? '' : '\n  PROBLEMS: ' + r.problems.join('; ')) +
    (r.ok && r.truePeakDb > -1.5 ? '\n  NOTE: the decoded true peak is over the brief\'s -1.5 dBTP' : '') +
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

/* Replace the sound of the two shipped films, in place: both or neither, unless the system refuses the second rename (settle() then says which film has which sound). */
function install(wavFile, opts) {
  const o = Object.assign({}, opts || {}, { allowVideoDir: true, square: PICTURES.square.file });
  const unlock = lockInstall();
  try {
    [PICTURES.wide.file, PICTURES.square.file].forEach(function (film) {      // what a killed run left behind
      const stale = film.replace(/\.mp4$/, '') + '.new.mp4';
      if (fs.existsSync(stale)) { try { fs.unlinkSync(stale); } catch (e) { throw new Error('cannot write into ' + path.dirname(stale) + ': ' + e.message); } }
    });
    return run(wavFile, PICTURES.wide.file, o);
  } finally { unlock(); }
}

module.exports = { run: run, install: install, videoMd5: videoMd5, loudness: loudness, PICTURES: PICTURES };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--square') { opts.square = argv[++i]; if (!opts.square) { console.error('mux: --square needs a file name'); process.exit(2); } }
    else if (argv[i] === '--install') { opts.install = true; }
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('Usage: node mux.js final.wav out.mp4 [--square out-square.mp4]\n       node mux.js final.wav --install'); process.exit(0); }
    else if (argv[i].startsWith('--')) { console.error('mux: unknown option: ' + argv[i] + '\nUsage: node mux.js final.wav out.mp4 [--square out-square.mp4]\n       node mux.js final.wav --install'); process.exit(2); }
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
