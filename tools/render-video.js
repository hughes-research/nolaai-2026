#!/usr/bin/env node
/*
 * tools/render-video.js: render a time-driven page to an MP4, frame by frame.
 *
 *   node tools/render-video.js <page.html> [options]
 *
 *   --fps 30              frames per second (default 30)
 *   --size 1920x1080      frame size (default 1920x1080). The page is opened with ?size=WxH,
 *                         so a page that has more than one layout can answer with the right one.
 *   --out file.mp4        where to write (default: next to the page, <page>.mp4)
 *   --poster file.png     also save one frame as a PNG (default frame: the page's own choice, or the last)
 *   --poster-at 41.5      which second the poster is taken from
 *   --crf 14              x264 quality; lower is better and bigger (default 14)
 *   --preset slow         x264 preset (default slow)
 *   --audio silent        add a silent stereo AAC track (default: no audio track at all).
 *                         Only for an upload form that refuses a file with no audio.
 *   --workers 4           browser pages rendering in parallel (default: up to 4)
 *   --from 10 --to 20     render only this stretch of the film, in seconds
 *
 *   Looking instead of rendering (no MP4 is written unless --out is also given):
 *   --stills 1.5,7.2,40   save these seconds as PNGs      -> out/video/<page>-<size>/t-0001.500.png ...
 *   --stills marks        ... one per beat the page lists in window.__marks
 *   --strip 15.0:16.5:12  a contact sheet of 12 frames spread over that stretch (for fast passages)
 *
 * THE PAGE'S SIDE OF THE CONTRACT
 *   window.__setTime(seconds)   draws exactly that frame, the same frame every time
 *   window.__duration           length in seconds
 *   window.__ready              (optional) true when fonts and layout are done
 *   window.__marks              (optional) [{ t, name }], used by --stills marks and to label sheets
 *   window.__film               (optional) { width, height, fontsOk, poster }
 *
 * HOW IT WORKS
 *   Headless Chromium (Playwright) opens the page at exactly the frame size.
 *   For each frame it calls __setTime(frame / fps), takes a lossless PNG
 *   screenshot and pipes it to ffmpeg, which encodes H.264 (libx264, High
 *   profile, yuv420p, BT.709, +faststart): it plays in QuickTime, in Windows
 *   and in every browser. Several pages render in parallel, which is safe
 *   because every frame is a pure function of its time; the frames are put
 *   back in order before they reach ffmpeg.
 *
 *   Then it checks its own work:
 *     - ffprobe: codec, pixel format, size, frame count and duration must match
 *     - the moov atom must come before mdat (faststart: plays while downloading)
 *     - three frames are drawn again, out of order, and must match byte for byte
 *     - a contact sheet of 12 evenly spaced frames goes to out/video/ for a human to look at
 *
 * Needs ffmpeg and ffprobe on the PATH, and Playwright installed globally
 * (see tools/README.md). Nothing is installed into this repository.
 * Exit code 0 only if every check passed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

/* Playwright is installed globally, not in this repository. */
function requirePlaywright() {
  try { return require('playwright'); } catch (e) { /* try the global folders next */ }
  const roots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  try { roots.push(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch (e) { /* no npm */ }
  for (const root of roots) {
    try { return require(path.join(root, 'playwright')); } catch (e) { /* keep looking */ }
  }
  console.error('Playwright was not found. Install it once, globally:  npm install -g playwright');
  process.exit(2);
}

function usage(code) {
  console.log('Usage: node tools/render-video.js <page.html> [--fps 30] [--size 1920x1080] [--out file.mp4]\n' +
    '       [--poster file.png] [--poster-at s] [--crf 14] [--preset slow] [--audio silent] [--workers n]\n' +
    '       [--from s] [--to s] [--stills s,s,...|marks] [--strip from:to:count]');
  process.exit(code);
}

function fail(message) {
  console.error(message);
  usage(2);
}

function parseArgs(argv) {
  const o = {
    page: null, fps: 30, width: 1920, height: 1080, out: null, poster: null, posterAt: null,
    crf: 14, preset: 'slow', audio: 'none', workers: Math.max(1, Math.min(4, os.cpus().length)),
    from: null, to: null, stills: null, strip: null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) { fail('Missing value after ' + a); }
      return argv[++i];
    };
    if (a === '--fps') { o.fps = Number(value()); }
    else if (a === '--size') {
      const m = /^(\d+)x(\d+)$/i.exec(value());
      if (!m) { fail('--size looks like 1920x1080'); }
      o.width = Number(m[1]); o.height = Number(m[2]);
    }
    else if (a === '--out') { o.out = path.resolve(value()); }
    else if (a === '--poster') { o.poster = path.resolve(value()); }
    else if (a === '--poster-at') { o.posterAt = Number(value()); }
    else if (a === '--crf') { o.crf = Number(value()); }
    else if (a === '--preset') { o.preset = value(); }
    else if (a === '--audio') { o.audio = value(); }
    else if (a === '--workers') { o.workers = Math.max(1, Math.floor(Number(value())) || 1); }
    else if (a === '--from') { o.from = Number(value()); }
    else if (a === '--to') { o.to = Number(value()); }
    else if (a === '--stills') { o.stills = value(); }
    else if (a === '--strip') {
      const m = /^([\d.]+):([\d.]+):(\d+)$/.exec(value());
      if (!m) { fail('--strip looks like 15.0:16.5:12  (from:to:count)'); }
      o.strip = { from: Number(m[1]), to: Number(m[2]), count: Math.max(2, Number(m[3])) };
    }
    else if (a === '--help' || a === '-h') { usage(0); }
    else if (a.startsWith('--')) { fail('Unknown option: ' + a); }
    else if (!o.page) { o.page = path.resolve(a); }
    else { fail('Only one page at a time: ' + a); }
  }
  if (!o.page) { fail('Which page? For example: node tools/render-video.js video/title.html'); }
  if (!fs.existsSync(o.page)) { console.error('Not found: ' + o.page); process.exit(2); }
  if (!(o.fps > 0 && o.fps <= 120)) { fail('--fps must be between 1 and 120'); }
  if (o.width % 2 || o.height % 2) { fail('--size must be even in both directions (H.264 with yuv420p needs it)'); }
  if (!(o.crf >= 0 && o.crf <= 51)) { fail('--crf must be between 0 and 51'); }
  if (o.audio !== 'none' && o.audio !== 'silent') { fail('--audio is "silent" or left out'); }
  return o;
}

function has(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

function stamp(t) { return t.toFixed(3).padStart(8, '0'); }

function relative(file) {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith('..') ? rel : file;
}

/* ------------------------------------------------------------------ pages */

async function openPage(browser, o, problems) {
  const page = await browser.newPage({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: 1 });
  page.on('console', (msg) => { if (msg.type() === 'error') { problems.push('console.error: ' + msg.text()); } });
  page.on('pageerror', (err) => { problems.push('uncaught: ' + err.message); });
  const url = pathToFileURL(o.page).href + '?size=' + o.width + 'x' + o.height;
  await page.goto(url);
  try {
    await page.waitForFunction(() => typeof window.__setTime === 'function' && typeof window.__duration === 'number' &&
      (window.__ready === undefined || window.__ready === true), null, { timeout: 30000 });
  } catch (e) {
    const why = await page.evaluate(() => window.__error || '').catch(() => '');
    throw new Error('The page never became ready (it must define window.__setTime and window.__duration).' + (why ? ' It said: ' + why : ''));
  }
  // freeze the clock before the first real frame: from here on, time only moves when we say so
  await page.evaluate(() => window.__setTime(0));
  return page;
}

/* Draw the frame at t and return it as a PNG. */
async function shoot(page, t) {
  const ok = await page.evaluate((s) => {
    const drawn = window.__setTime(s);
    return new Promise((resolve) => requestAnimationFrame(() => resolve(drawn !== false)));
  }, t);
  if (!ok) { throw new Error('__setTime(' + t + ') said the page was not ready'); }
  return page.screenshot({ type: 'png' });
}

/* ------------------------------------------------------------ contact sheet */

async function writeSheet(browser, shots, file, columns) {
  const cols = columns || 4;
  const page = await browser.newPage({ viewport: { width: 2400, height: 200 }, deviceScaleFactor: 1 });
  const cells = shots.map((s) =>
    '<figure><img src="data:image/png;base64,' + s.png.toString('base64') + '"><figcaption>' + s.label + '</figcaption></figure>').join('');
  const html = '<!doctype html><meta charset="utf-8"><style>' +
    'body{margin:0;padding:16px;background:#2a2d33;font:600 22px/1.2 ui-monospace,Menlo,Consolas,monospace;color:#fff}' +
    '.grid{display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:16px}' +
    'figure{margin:0}img{display:block;width:100%;outline:1px solid #555}' +
    'figcaption{padding:8px 2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '</style><div class="grid">' + cells + '</div>';
  await page.setContent(html, { waitUntil: 'load' });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

function labelFor(t, marks) {
  let best = null;
  for (const m of marks || []) {
    if (Math.abs(m.t - t) <= 0.75 && (!best || Math.abs(m.t - t) < Math.abs(best.t - t))) { best = m; }
  }
  return t.toFixed(2) + ' s' + (best ? '  ' + best.name : '');
}

/* ------------------------------------------------------------------ checks */

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames,color_space,color_range:format=duration,size',
    '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) { throw new Error('ffprobe failed: ' + (r.stderr || '').trim()); }
  const j = JSON.parse(r.stdout);
  const audio = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return { video: j.streams[0], format: j.format, audio: (audio.stdout || '').trim() };
}

/* faststart: the index (moov) sits before the picture data (mdat), so a browser can start playing at once */
function moovFirst(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= size) {
      fs.readSync(fd, head, 0, 16, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (type === 'moov') { return true; }
      if (type === 'mdat') { return false; }
      if (len === 1) { len = Number(head.readBigUInt64BE(8)); }
      if (len < 8) { return false; }
      pos += len;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

/* -------------------------------------------------------------------- main */

(async () => {
  const o = parseArgs(process.argv.slice(2));
  const lookOnly = (o.stills || o.strip) && !o.out;
  if (!lookOnly && (!has('ffmpeg') || !has('ffprobe'))) {
    console.error('ffmpeg and ffprobe must be on the PATH.');
    process.exit(2);
  }
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch();
  const problems = [];
  const base = path.basename(o.page).replace(/\.html?$/i, '');
  const lookDir = path.join(ROOT, 'out', 'video');
  const tag = base + '-' + o.width + 'x' + o.height;
  let exit = 0;

  try {
    const first = await openPage(browser, o, problems);
    const info = await first.evaluate(() => ({
      duration: window.__duration,
      marks: window.__marks || [],
      film: window.__film || null,
      inner: [window.innerWidth, window.innerHeight]
    }));
    if (!(info.duration > 0)) { throw new Error('window.__duration must be a positive number of seconds'); }
    if (info.film && info.film.fontsOk === false) { throw new Error('The page says its fonts did not load. Not rendering a film in a fallback face.'); }
    if (info.film && info.film.width && (info.film.width !== o.width || info.film.height !== o.height)) {
      console.log('note: the page is designed at ' + info.film.width + 'x' + info.film.height + ' and is being scaled to ' + o.width + 'x' + o.height);
    }
    const clampT = (t) => Math.max(0, Math.min(info.duration, t));

    /* ---- looking: stills and strips ---- */
    if (o.stills) {
      const times = o.stills === 'marks'
        ? info.marks.map((m) => m.t)
        : o.stills.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
      if (!times.length) { throw new Error(o.stills === 'marks' ? 'The page lists no window.__marks' : '--stills needs seconds, e.g. --stills 1.5,7.2'); }
      const dir = path.join(lookDir, tag);
      fs.mkdirSync(dir, { recursive: true });
      const shots = [];
      for (const t of times) {
        const png = await shoot(first, clampT(t));
        const file = path.join(dir, 't-' + stamp(clampT(t)) + '.png');
        fs.writeFileSync(file, png);
        shots.push({ png, label: labelFor(clampT(t), info.marks) });
        console.log(relative(file));
      }
      for (let n = 0; n * 12 < shots.length; n++) {
        const sheet = path.join(lookDir, tag + '-stills-' + String(n + 1).padStart(2, '0') + '.png');
        await writeSheet(browser, shots.slice(n * 12, n * 12 + 12), sheet, 4);
        console.log(relative(sheet));
      }
    }
    if (o.strip) {
      const shots = [];
      for (let k = 0; k < o.strip.count; k++) {
        const t = clampT(o.strip.from + (o.strip.to - o.strip.from) * k / (o.strip.count - 1));
        shots.push({ png: await shoot(first, t), label: labelFor(t, info.marks) });
      }
      const sheet = path.join(lookDir, tag + '-strip-' + o.strip.from + '-' + o.strip.to + '.png');
      await writeSheet(browser, shots, sheet, o.strip.count <= 8 ? 4 : (o.strip.count <= 18 ? 6 : 8));
      console.log(relative(sheet));
    }

    /* ---- rendering ---- */
    if (!lookOnly) {
      const from = o.from == null ? 0 : clampT(o.from);
      const to = o.to == null ? info.duration : clampT(o.to);
      const frames = Math.round((to - from) * o.fps);
      if (!(frames > 0)) { throw new Error('Nothing to render between ' + from + ' s and ' + to + ' s'); }
      const timeOf = (i) => from + i / o.fps;
      const out = o.out || path.join(path.dirname(o.page), base + '.mp4');
      fs.mkdirSync(path.dirname(out), { recursive: true });

      const pages = [first];
      const workers = Math.min(o.workers, frames);
      while (pages.length < workers) { pages.push(await openPage(browser, o, problems)); }

      const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', 'png', '-i', '-'];
      if (o.audio === 'silent') { args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'); }
      args.push(
        // sRGB screenshots to BT.709 video, limited range, so every player shows the same Flare
        '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p',
        '-c:v', 'libx264', '-preset', o.preset, '-crf', String(o.crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-r', String(o.fps), '-movflags', '+faststart');
      if (o.audio === 'silent') { args.push('-c:a', 'aac', '-b:a', '96k', '-shortest'); } else { args.push('-an'); }
      args.push(out);

      const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'pipe'] });
      let ffErr = '';
      ff.stderr.on('data', (d) => { ffErr += d; });
      const ffDone = new Promise((resolve) => ff.on('close', resolve));
      ff.stdin.on('error', () => { /* reported through the exit code */ });

      // which frames to keep for looking at afterwards
      const sheetAt = new Set();
      for (let k = 0; k < 12; k++) { sheetAt.add(Math.round(k * (frames - 1) / 11)); }
      const posterT = o.posterAt != null ? clampT(o.posterAt) : (info.film && typeof info.film.poster === 'number' ? clampT(info.film.poster) : info.duration);
      const checkAt = [Math.floor(frames * 0.31), Math.floor(frames * 0.62), Math.floor(frames * 0.93)].filter((i, k, a) => a.indexOf(i) === k);
      const kept = new Map();       // frame -> png (contact sheet)
      const hashes = new Map();     // frame -> sha1 (determinism)

      // frames are drawn out of order by several pages and written in order
      const done = new Map();
      let nextToTake = 0;
      let nextToWrite = 0;
      let failed = null;
      const started = Date.now();
      const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

      async function flush() {
        while (done.has(nextToWrite)) {
          const png = done.get(nextToWrite);
          done.delete(nextToWrite);
          if (!ff.stdin.write(png)) { await new Promise((resolve) => ff.stdin.once('drain', resolve)); }
          nextToWrite++;
          if (nextToWrite % o.fps === 0 || nextToWrite === frames) {
            const rate = nextToWrite / ((Date.now() - started) / 1000);
            process.stdout.write('\r' + nextToWrite + ' / ' + frames + ' frames  (' + rate.toFixed(1) + ' per second)   ');
          }
        }
      }
      let flushing = Promise.resolve();

      async function work(page) {
        while (!failed) {
          const i = nextToTake++;
          if (i >= frames) { return; }
          // do not run far ahead of the writer: frames are big
          while (!failed && i - nextToWrite > workers * 6) { await new Promise((resolve) => setTimeout(resolve, 5)); }
          let png;
          try { png = await shoot(page, timeOf(i)); } catch (e) { failed = e; return; }
          if (sheetAt.has(i)) { kept.set(i, png); }
          if (checkAt.includes(i)) { hashes.set(i, sha1(png)); }
          done.set(i, png);
          flushing = flushing.then(flush);
          await flushing;
        }
      }

      console.log('Rendering ' + relative(o.page) + '  ' + o.width + 'x' + o.height + ' at ' + o.fps + ' fps, ' +
        (to - from).toFixed(2) + ' s, ' + frames + ' frames, ' + workers + ' page' + (workers > 1 ? 's' : '') + ' ...');
      await Promise.all(pages.map(work));
      await flushing;
      ff.stdin.end();
      const code = await ffDone;
      process.stdout.write('\n');
      if (failed) { throw failed; }
      if (code !== 0) { throw new Error('ffmpeg failed (' + code + '): ' + ffErr.trim()); }

      /* ---- check the result ---- */
      const p = probe(out);
      const v = p.video;
      const bad = [];
      const duration = Number(p.format.duration);
      if (v.codec_name !== 'h264') { bad.push('codec is ' + v.codec_name + ', not h264'); }
      if (v.pix_fmt !== 'yuv420p') { bad.push('pixel format is ' + v.pix_fmt + ', not yuv420p'); }
      if (v.width !== o.width || v.height !== o.height) { bad.push('size is ' + v.width + 'x' + v.height + ', not ' + o.width + 'x' + o.height); }
      if (Number(v.nb_read_frames) !== frames) { bad.push('frame count is ' + v.nb_read_frames + ', not ' + frames); }
      if (Math.abs(duration - frames / o.fps) > 1.5 / o.fps) { bad.push('duration is ' + duration.toFixed(3) + ' s, not ' + (frames / o.fps).toFixed(3) + ' s'); }
      if (!moovFirst(out)) { bad.push('the moov atom is not at the front (no faststart)'); }
      if (o.audio === 'none' && p.audio) { bad.push('there is an audio track (' + p.audio + ') and there should be none'); }
      if (o.audio === 'silent' && !p.audio) { bad.push('the silent audio track is missing'); }

      // the same frame, drawn again in another order, must be the same bytes
      let repeatable = true;
      for (const i of checkAt.slice().reverse()) {
        const again = sha1(await shoot(first, timeOf(i)));
        if (again !== hashes.get(i)) { repeatable = false; bad.push('frame ' + i + ' (' + timeOf(i).toFixed(3) + ' s) was different when drawn a second time'); }
      }

      const sheet = path.join(lookDir, tag + '-contact.png');
      const order = Array.from(kept.keys()).sort((a, b) => a - b);
      await writeSheet(browser, order.map((i) => ({ png: kept.get(i), label: labelFor(timeOf(i), info.marks) })), sheet, 4);

      if (o.poster) {
        fs.mkdirSync(path.dirname(o.poster), { recursive: true });
        fs.writeFileSync(o.poster, await shoot(first, posterT));
      }

      const mb = (Number(p.format.size) / 1048576).toFixed(2);
      console.log(relative(out));
      console.log('  ' + v.codec_name + ' ' + v.profile + ', ' + v.pix_fmt + ', ' + v.width + 'x' + v.height + ', ' + v.r_frame_rate + ' fps, ' +
        v.nb_read_frames + ' frames, ' + duration.toFixed(3) + ' s, ' + mb + ' MB, ' + (p.audio ? 'audio: ' + p.audio + ' (silence)' : 'no audio track (silent)') +
        ', faststart ' + (moovFirst(out) ? 'yes' : 'NO') + ', repeatable ' + (repeatable ? 'yes' : 'NO'));
      console.log(relative(sheet) + '   (12 frames: look at it)');
      if (o.poster) { console.log(relative(o.poster) + '   (poster, from ' + posterT.toFixed(2) + ' s)'); }
      if (bad.length) {
        exit = 1;
        console.error('\nThe file was written, but it failed its checks:');
        bad.forEach((b) => console.error('  - ' + b));
      }
    }
  } catch (err) {
    exit = 1;
    process.stdout.write('\n');
    console.error(err && err.message ? err.message : err);
  }

  if (problems.length) {
    exit = 1;
    console.error('\nThe page reported problems while it was being rendered:');
    Array.from(new Set(problems)).forEach((p) => console.error('  - ' + p));
  }
  await browser.close();
  process.exit(exit);
})();
