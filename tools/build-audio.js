#!/usr/bin/env node
/*
 * tools/build-audio.js: build the title film's soundtrack.
 *
 *   node tools/build-audio.js                  the chosen score  ->  out/video/title-audio.wav
 *   node tools/build-audio.js --score vibes    another of the scores in tools/score/
 *   node tools/build-audio.js --out file.wav   write the WAV somewhere else
 *   node tools/build-audio.js --mux            build, then put it on video/title-sequence.mp4 and
 *                                              video/title-square.mp4 (the picture is copied, never re-encoded)
 *   node tools/build-audio.js --list           the scores there are
 *
 * A score is a directory in tools/score/ with a build.js (the performance and
 * the mix) and usually a chart.js (the composition as data). The shared kit
 * is tools/score/lib/: a sampler (recorded instruments through fluidsynth),
 * the film's timeline, a mixer with a small room, a loudness-normalising
 * true-peak-limited master, self-checks, an analysis tool and a mux tool.
 * tools/score/README.md says which score is which and why one was chosen.
 *
 * Every build is deterministic and exits 0 only if its self-checks pass: the
 * three hard hits within 10 ms of their frames (8.000, 17.000, 37.000 s, read
 * from video/score.js), the held breath quiet but never digital silence,
 * loudness -16 LUFS and true peak under -2 dBTP, no clipping, no DC, no clicks.
 *
 * The recorded-instrument scores need fluidsynth and two free sound libraries
 * (both MIT licensed; credits in tools/score/README.md). The chosen score and
 * "vibes" also measure themselves with ffmpeg and draw their analysis pictures
 * with Python 3, numpy and Pillow:
 *
 *   apt-get install fluidsynth fluid-soundfont-gm musescore-general-soundfont-small
 *   apt-get install ffmpeg python3-numpy python3-pil
 *
 * SCORE_FAST=1 in front skips the chosen score's pictures (the sound is the
 * same bytes). What is missing is said before the build starts, with exit
 * code 2 (with --mux that includes ffprobe and the two films). A build that
 * fails or crashes ends with exit code 1 and copies nothing.
 * The fully synthesized score ("modelled") needs nothing but Node.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCORES = path.join(__dirname, 'score');
const CHOSEN = 'sampled-piano';          // the score the shipped films carry: see tools/score/README.md
const OUT_DEFAULT = path.join(ROOT, 'out', 'video', 'title-audio.wav');

function scores() {
  return fs.readdirSync(SCORES).filter(function (name) {
    return name !== 'lib' && fs.existsSync(path.join(SCORES, name, 'build.js'));
  }).sort();
}
function usesSampler(name) {
  return /require\(\s*['"]\.\.\/lib['"]\s*\)/.test(fs.readFileSync(path.join(SCORES, name, 'build.js'), 'utf8'));
}
function fail(message, code) { console.error('build-audio: ' + message); process.exit(code || 1); }
function works(command, args) { const r = spawnSync(command, args, { encoding: 'utf8' }); return !r.error && r.status === 0; }

const args = process.argv.slice(2);
let score = CHOSEN, out = OUT_DEFAULT, mux = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--score') { score = args[++i]; if (!score || score.startsWith('--')) { fail('--score needs a name (there are: ' + scores().join(', ') + ')', 2); } }
  else if (args[i] === '--out') { const file = args[++i]; if (!file || file.startsWith('--')) { fail('--out needs a file name, for example:  --out out/video/title-audio.wav', 2); } out = path.resolve(file); }
  else if (args[i] === '--mux') { mux = true; }
  else if (args[i] === '--list') {
    scores().forEach(function (name) { console.log((name === CHOSEN ? '* ' : '  ') + name + (usesSampler(name) ? '' : '   (synthesized: needs no sound library)')); });
    console.log('\n* is the score on the shipped films.');
    process.exit(0);
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node tools/build-audio.js [--score name] [--out file.wav] [--mux] [--list]');
    process.exit(0);
  } else { fail('unknown option: ' + args[i] + '\nUsage: node tools/build-audio.js [--score name] [--out file.wav] [--mux] [--list]', 2); }
}
if (scores().indexOf(score) < 0) { fail('no such score: ' + score + ' (there are: ' + scores().join(', ') + ')', 2); }
if (fs.existsSync(out) && fs.statSync(out).isDirectory()) { fail('--out needs a file name, and this is a folder: ' + out, 2); }

if (usesSampler(score)) {
  const fluid = spawnSync('fluidsynth', ['--version'], { encoding: 'utf8' });
  const fonts = require(path.join(SCORES, 'lib', 'sampler.js')).fonts;
  const missing = Object.keys(fonts).filter(function (k) { return !fs.existsSync(fonts[k]); }).map(function (k) { return fonts[k]; });
  if (fluid.error || fluid.status !== 0 || missing.length) {
    fail('the score "' + score + '" plays recorded instruments and needs fluidsynth and two sound libraries.\n' +
      (fluid.error || fluid.status !== 0 ? '  missing: fluidsynth\n' : '') + missing.map(function (f) { return '  missing: ' + f + '\n'; }).join('') +
      '  install:  apt-get install fluidsynth fluid-soundfont-gm musescore-general-soundfont-small\n' +
      '  or build the synthesized score instead:  node tools/build-audio.js --score modelled', 2);
  }
}

/* A build that ends with the kit's analysis measures the mix with ffmpeg and draws its
 * spectrograms with Python. Asked for here, so a missing piece is one line before the
 * build starts and not a crash after every check has passed. */
const buildText = fs.readFileSync(path.join(SCORES, score, 'build.js'), 'utf8');
const again = ['node', 'tools/build-audio.js'].concat(args).map(function (word) { return /\s/.test(word) ? '"' + word + '"' : word; }).join(' ');
if (/analyze\.run\(/.test(buildText)) {
  if (!works('ffmpeg', ['-version'])) {
    fail('the score "' + score + '" measures its mix with ffmpeg, which was not found.\n  install:  apt-get install ffmpeg', 2);
  }
  const canSkip = /SCORE_FAST/.test(buildText);
  if (!(canSkip && process.env.SCORE_FAST) && !works('python3', ['-c', 'import numpy, PIL'])) {
    fail('the score "' + score + '" draws its analysis pictures with Python 3, numpy and Pillow, and this did not run:  python3 -c "import numpy, PIL"\n' +
      '  install:  apt-get install python3-numpy python3-pil   (or: pip install numpy pillow)' +
      (canSkip ? '\n  or skip the pictures (the sound is the same bytes):  SCORE_FAST=1 ' + again : ''), 2);
  }
}
if (mux) {
  const lacking = ['ffmpeg', 'ffprobe'].filter(function (command) { return !works(command, ['-version']); });
  if (lacking.length) { fail('--mux puts the sound on the films with ffmpeg and ffprobe. Not found: ' + lacking.join(', ') + '.\n  install:  apt-get install ffmpeg', 2); }
  const pictures = require(path.join(SCORES, 'lib', 'mux.js')).PICTURES;
  const gone = [pictures.wide.file, pictures.square.file].filter(function (film) { return !fs.existsSync(film); });
  if (gone.length) { fail('--mux puts the sound on the two films. Not found: ' + gone.map(function (film) { return path.relative(ROOT, film); }).join(', ') + '.', 2); }
}

const dir = path.join(SCORES, score);
console.log('Building the score "' + score + '" (' + path.relative(ROOT, dir) + '/build.js) ...\n');
const env = Object.assign({}, process.env);
delete env.SCORE_OUT;                    // one score's trial-build switch: here the WAV has to land beside its build.js
const wav = path.join(dir, 'final.wav');
const before = fs.existsSync(wav) ? fs.statSync(wav).mtimeMs : -1;
const run = spawnSync(process.execPath, [path.join(dir, 'build.js')], { stdio: 'inherit', cwd: dir, env: env });
if (run.error) { fail('could not run the build: ' + run.error.message); }
if (run.status !== 0) { fail('the build of "' + score + '" did not finish (' + (run.signal ? 'stopped by ' + run.signal : 'exit ' + run.status + ': a failed self-check or a crash, see above') + '); nothing was copied.', 1); }

if (!fs.existsSync(wav) || fs.statSync(wav).mtimeMs === before) { fail('the build wrote no new ' + path.relative(ROOT, wav) + '; nothing was copied.'); }
try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.copyFileSync(wav, out); }
catch (e) { fail('could not write ' + out + ': ' + e.message); }
console.log('\n' + path.relative(ROOT, out) + '  (48 kHz, stereo, 24-bit, 46.000 s) from the score "' + score + '"');

if (mux) {
  console.log('\nPutting it on the films (the picture is stream-copied; its MD5 is checked before and after):');
  let result;
  try { result = require(path.join(SCORES, 'lib', 'mux.js')).install(out, {}); }
  catch (e) { fail('the install stopped: ' + e.message + '\n  No film is replaced until both new files have passed their checks.'); }
  if (!result.ok) { fail('the mux reported a problem (see above); both films were left as they were.'); }
} else {
  console.log('To put it on the films without re-rendering the picture:  node tools/build-audio.js' + (score === CHOSEN ? '' : ' --score ' + score) + ' --mux');
}
