/*
 * tools/score/lib/test-sampler.js: the sampler half proves itself.
 *
 *   node tools/score/lib/test-sampler.js      exits 0 only if every check passes
 *
 * It checks, by rendering and measuring: both libraries load and play; the
 * length is exact; two renders of one request are bit-identical; a note asked
 * for at t sounds at t (within 1 ms, and exactly where startOf(t) says); A3 on
 * the pianos is 220 Hz and MIDI 40 on the acoustic bass is E2; the Brush kit
 * is not the Standard kit; reverb and chorus are off; velocity 0..1 maps
 * monotonically to loudness. Plus the timeline, the MIDI writer, the errors
 * and the onset cache.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SR, N } = require('./const.js');
const sampler = require('./sampler.js');
const midi = require('./midi.js');
const timeline = require('./timeline.js');
const M = require('./audition.js').measure;

const results = [];
function check(name, fn) {
  const t0 = Date.now();
  let ok = false, note = '';
  try { note = fn() || ''; ok = true; } catch (e) { note = e.message; }
  results.push({ name: name, ok: ok, note: note });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (note ? '\n        ' + String(note).replace(/\n/g, '\n        ') : '') + '   [' + ((Date.now() - t0) / 1000).toFixed(1) + ' s]');
}
function assert(cond, msg) { if (!cond) { throw new Error(msg); } }
function throws(fn, pattern, what) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert(err, what + ': expected an Error, got none');
  assert(pattern.test(err.message), what + ': the Error says "' + err.message + '"');
}
const FONTS = ['fluidr3', 'musescore'];
const ms = function (s) { return (s * 1000).toFixed(3) + ' ms'; };

/* ------------------------------------------------------------ timeline */
check('timeline: the times come from video/score.js and match the brief', function () {
  const tl = timeline.load();
  const eq = function (a, b, what) { assert(JSON.stringify(a) === JSON.stringify(b), what + ' is ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b)); };
  eq([tl.bpm, tl.beat, tl.bar, tl.fps, tl.duration, tl.bars], [120, 0.5, 2, 30, 46, 23], 'bpm, beat, bar, fps, duration, bars');
  eq(tl.hard, { no1: 8, no2: 17, slab: 37 }, 'hard');
  eq(tl.passes, [22.5, 24.5, 26.5, 28.5], 'passes');
  eq(tl.bays, [0.5, 1, 1.5, 2], 'bays');
  eq([tl.winner, tl.sleeve, tl.positive], [30, 32, 38], 'winner, sleeve, positive');
  eq(tl.text, [[9.5, 12], [18.5, 20], [30.5, 32]], 'text');
  assert(tl.events.length === 63 && tl.events[0].t === 0, 'events: expected the 63 rows of ref/events.json');
  eq(tl.at(1, 1), 0, 'at(1, 1)'); eq(tl.at(5, 1), 8, 'at(5, 1)'); eq(tl.at(9, 3), 17, 'at(9, 3)'); eq(tl.at(19, 3), 37, 'at(19, 3)');
  eq(tl.at(3, 2.5), 4.75, 'at(3, 2.5)');
  assert(Math.abs(tl.at(3, 2.5, { swing: 0.66 }) - 4.83) < 1e-9, 'at(3, 2.5, swing 0.66) should be 4.83');
  assert(Math.abs(tl.at(3, 2.25, { swing: 0.66 }) - 4.625) < 1e-9, 'a sixteenth is not swung');
  eq(tl.barOf(17), { bar: 9, beat: 3 }, 'barOf(17)'); eq(tl.barOf(4.75), { bar: 3, beat: 2.5 }, 'barOf(4.75)');
  throws(function () { tl.at(0, 1); }, /bar counts from 1/, 'at(0, 1)');
  throws(function () { tl.at(1, 0); }, /beat counts from 1/, 'at(1, 0)');
  throws(function () { tl.at(1, 1.5, { swing: 0.9 }); }, /swing/, 'swing 0.9');
  for (const t of [tl.hard.no1, tl.hard.no2, tl.hard.slab]) { assert(Math.abs(tl.frameOf(t).off) < 1e-9, 'a HARD time is not on a whole frame'); }
  return 'hard ' + JSON.stringify(tl.hard) + ', ' + tl.events.length + ' events';
});

/* ------------------------------------------------------------ midi */
check('midi: a format 1 file at 120 BPM and 960 ticks a beat; bad input is an Error', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-test-'));
  try {
    const file = path.join(dir, 't.mid');
    const info = midi.write(file, [
      { channel: 0, bank: 0, program: 32, notes: [{ t: 0, dur: 1, key: 40, vel: 90 }, { t: 0.5, dur: 1, key: 40, vel: 80 }, { t: 2, dur: 0.0001, key: 43, vel: 1 }], cc: [{ t: 0.25, cc: 64, value: 127 }] },
      { channel: 9, bank: 128, program: 40, notes: [{ t: 1, dur: 0.1, key: 38, vel: 127 }] }
    ], { endSeconds: 4 });
    const b = fs.readFileSync(file);
    assert(b.toString('latin1', 0, 4) === 'MThd' && b.readUInt32BE(4) === 6, 'no MThd header');
    assert(b.readUInt16BE(8) === 1, 'not format 1');
    assert(b.readUInt16BE(10) === 3, 'expected 3 tracks (tempo + 2), got ' + b.readUInt16BE(10));
    assert(b.readUInt16BE(12) === 960, 'division is not 960');
    assert(b.includes(Buffer.from([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20])), 'no 120 BPM tempo event');
    assert(b.includes(Buffer.from([0xc9, 40])), 'no program change 40 on channel 10');
    assert(!b.includes(Buffer.from([0xb9, 0])), 'a bank select was sent on the drum channel');
    assert(info.ticks === 7680 && info.shortened === 1, 'expected 7680 ticks and one shortened note, got ' + JSON.stringify(info));
    throws(function () { midi.write(file, [{ channel: 0, bank: 128, program: 0, notes: [] }]); }, /channel 9/, 'a drum kit off channel 9');
    throws(function () { midi.write(file, [{ channel: 9, bank: 0, program: 0, notes: [] }]); }, /only plays drum kits/, 'a piano on channel 9');
    throws(function () { midi.write(file, [{ channel: 0, notes: [{ t: 0, dur: 1, key: 60, vel: 0 }] }]); }, /vel is 1\.\.127/, 'velocity 0');
    throws(function () { midi.write(file, [{ channel: 0, notes: [{ t: 47.5, dur: 1, key: 60, vel: 64 }] }]); }, /after the end/, 'a note past the end');
    return info.events + ' events, ' + b.length + ' bytes';
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ------------------------------------------------------------ both libraries, exact length */
check('both libraries load and play; the length is exactly seconds * 48000', function () {
  const out = [];
  for (const font of FONTS) {
    assert(fs.existsSync(sampler.fonts[font]), 'missing ' + sampler.fonts[font]);
    for (const seconds of [0.25, 1.2345, 3]) {
      const st = sampler.render({ font: font, bank: 0, program: 0, notes: [{ t: 0.05, dur: 0.1, midi: 60, vel: 0.7 }], seconds: seconds });
      const want = Math.round(seconds * SR);
      assert(st.length === 2 && st[0] instanceof Float32Array && st[1] instanceof Float32Array, 'not a Stereo');
      assert(st[0].length === want && st[1].length === want, font + ' ' + seconds + ' s: got ' + st[0].length + ' samples, want ' + want);
      const peak = M.peak(st);
      assert(peak > 0.01 && peak < 1 && isFinite(peak), font + ': peak ' + peak);
      for (let i = 0; i < want; i += 97) { assert(Number.isFinite(st[0][i]) && Number.isFinite(st[1][i]), 'a sample is not a number'); }
      if (seconds === 3) { out.push(font + ' piano C4 peak ' + M.db(peak).toFixed(1) + ' dBFS'); }
    }
  }
  const film = sampler.render({ font: 'fluidr3', bank: 0, program: 32, notes: [{ t: 0, dur: 0.4, midi: 40, vel: 0.7 }, { t: 45.5, dur: 0.4, midi: 40, vel: 0.7 }] });
  assert(film[0].length === N && film[1].length === N, 'the default length should be the film: ' + N + ', got ' + film[0].length);
  assert(M.peak(M.slice(film, 45.5, 46)) > 0.01, 'the last note of the film is missing');
  const empty = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: [], seconds: 1 });
  assert(empty[0].length === SR && M.peak(empty) === 0, 'no notes should give silence of the right length');
  return out.join('; ') + '; default length ' + film[0].length;
});

/* ------------------------------------------------------------ determinism */
check('two renders of the same request are bit-identical', function () {
  const out = [];
  for (const font of FONTS) {
    const req = {
      font: font, bank: 0, program: 0, seconds: 4, gain: 0.4,
      notes: [{ t: 0.1, dur: 0.5, midi: 57, vel: 0.7 }, { t: 0.61, dur: 0.5, midi: 64, vel: 0.5 }, { t: 0.611, dur: 1.2, midi: 48, vel: 0.9 }, { t: 2.2, dur: 0.3, midi: 57, vel: 0.33 }],
      cc: [{ t: 0.05, cc: 64, value: 127 }, { t: 1.9, cc: 64, value: 0 }]
    };
    const a = sampler.render(req), b = sampler.render(req);
    assert(M.peak(a) > 0.01, font + ': silent');
    assert(M.identical(a, b), font + ': the two renders differ by ' + M.differenceDb(a, b).toFixed(1) + ' dB');
    const kit = { font: font, bank: 128, program: 40, seconds: 3, notes: [{ t: 0.2, midi: 38, vel: 0.5 }, { t: 0.7, midi: 39, vel: 0.6 }, { t: 1.0, dur: 1, midi: 40, vel: 0.6 }, { t: 1.5, midi: 51, vel: 0.4 }] };
    assert(M.identical(sampler.render(kit), sampler.render(kit)), font + ': the two kit renders differ');
    out.push(font + ' identical');
  }
  return out.join('; ');
});

/* ------------------------------------------------------------ timing */
check('timing: a note asked for at t sounds at t (within 1 ms; exactly at startOf(t))', function () {
  /* the woodblock speaks at once: its first non-zero sample is one sample after the voice starts */
  const times = [0, 0.3337, 1.000, 2.0005, 3.00101, 4.00033, 5.0007, 6.00123, 7.3331, 8.4999, 9.99, 10.98765];
  let worst = 0, at1 = null;
  const out = [];
  for (const font of FONTS) {
    const st = sampler.render({ font: font, bank: 0, program: 115, seconds: 12, notes: times.map(function (t) { return { t: t, dur: 0.05, midi: 72, vel: 0.8 }; }) });
    for (const t of times) {
      const want = Math.round(t * SR);
      const first = M.firstNonzero(st, Math.max(0, want - 300));
      const start = first - 1;                       // the voice's first sample is a zero (the envelope starts from 0)
      const err = start / SR - t;
      assert(first >= 0, font + ': nothing sounds at ' + t);
      assert(Math.abs(err) <= 0.001, font + ': the note at ' + t + ' s starts ' + ms(err) + ' off');
      assert(start === Math.round(sampler.startOf(t) * SR), font + ': the note at ' + t + ' s starts at sample ' + start + ', startOf says ' + Math.round(sampler.startOf(t) * SR));
      if (t === 1) { assert(start === SR, font + ': the note at exactly 1.000 s starts at sample ' + start + ', not 48000'); at1 = start; }
      worst = Math.max(worst, Math.abs(err));
    }
    out.push(font + ' ok');
  }
  /* late in the film: no drift */
  const late = [8, 17, 37, 45.4321];
  const st = sampler.render({ font: 'fluidr3', bank: 0, program: 115, notes: late.map(function (t) { return { t: t, dur: 0.05, midi: 72, vel: 0.8 }; }) });
  for (const t of late) {
    const first = M.firstNonzero(st, Math.round(t * SR) - 300);
    const err = (first - 1) / SR - t;
    assert(Math.abs(err) <= 0.001, 'the note at ' + t + ' s starts ' + ms(err) + ' off');
    assert(first - 1 === Math.round(sampler.startOf(t) * SR), 'the note at ' + t + ' s is not where startOf says');
    worst = Math.max(worst, Math.abs(err));
  }
  assert(worst <= sampler.MAX_TIMING_ERROR + 1e-9, 'the worst error ' + ms(worst) + ' is above the promised ' + ms(sampler.MAX_TIMING_ERROR));
  return 'the note at 1.000 s starts at sample ' + at1 + '; worst error over ' + (2 * times.length + late.length) + ' notes ' + ms(worst) + ' (limit 1 ms; the 64-sample grid allows ' + ms(sampler.MAX_TIMING_ERROR) + ')';
});

check('a note a little before 0 is legal, and the end of the MIDI file does not cut a tail', function () {
  const early = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: [{ t: -0.2, dur: 1, midi: 48, vel: 0.8 }], seconds: 1 });
  assert(Math.abs(early[0][0]) + Math.abs(early[0][1]) + Math.abs(early[0][2]) > 0, 'the note that began before 0 is not sounding at sample 0');
  throws(function () { sampler.render({ font: 'fluidr3', notes: [{ t: -2, dur: 1, midi: 48, vel: 0.8 }], seconds: 1 }); }, /before the start/, 'a note 2 s before the start');
  /* a note released near the end: its tail in a short buffer must equal its tail in a long one */
  const note = [{ t: 2.5, dur: 0.2, midi: 36, vel: 0.9 }];
  const short = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: note, seconds: 3 });
  const long = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: note, seconds: 8 });
  const cut = [long[0].subarray(0, 3 * SR), long[1].subarray(0, 3 * SR)];
  assert(M.identical(short, cut), 'the tail differs between a 3 s and an 8 s buffer by ' + M.differenceDb(short, cut).toFixed(1) + ' dB');
  const tail = M.db(M.rms(M.slice(short, 2.9, 3.0)));
  assert(tail > -80, 'expected the release tail to be sounding at the end of the buffer, got ' + tail.toFixed(1) + ' dBFS');
  const ringsFor = M.lastNonzero(long) / SR - 2.7;
  return 'release tail at 2.9-3.0 s: ' + tail.toFixed(1) + ' dBFS, identical in both buffers; it rings ' + ringsFor.toFixed(2) + ' s past the note-off';
});

/* ------------------------------------------------------------ pitch */
check('pitch: A3 (MIDI 57) on the pianos is 220 Hz within 0.5 percent; MIDI 40 on the acoustic bass is E2 (82.41 Hz)', function () {
  const out = [];
  const pitchOf = function (font, bank, program, key) {
    const st = sampler.render({ font: font, bank: bank, program: program, notes: [{ t: 0.5, dur: 2, midi: key, vel: 0.7 }], seconds: 2.5 });
    const p = M.pitch(M.mono(M.slice(st, 0.65, 1.65)), { fmin: M.noteHz(key) / 2.6, fmax: M.noteHz(key) * 2.6 });
    assert(p, 'no pitch found');
    return p.hz;
  };
  for (const [font, bank, program, name] of [['fluidr3', 0, 0, 'Yamaha Grand'], ['musescore', 0, 0, 'Grand'], ['musescore', 8, 0, 'Mellow Grand']]) {
    const hz = pitchOf(font, bank, program, 57), err = 100 * (hz / 220 - 1);
    assert(Math.abs(err) <= 0.5, font + ' ' + name + ': A3 measures ' + hz.toFixed(2) + ' Hz (' + err.toFixed(2) + ' percent)');
    out.push(font + ' ' + name + ' A3 ' + hz.toFixed(2) + ' Hz (' + (err >= 0 ? '+' : '') + err.toFixed(2) + '%)');
  }
  for (const font of FONTS) {
    const hz = pitchOf(font, 0, 32, 40), err = 100 * (hz / M.noteHz(40) - 1);
    assert(Math.abs(err) <= 0.5, font + ' acoustic bass: MIDI 40 measures ' + hz.toFixed(2) + ' Hz, E2 is 82.41 (an octave off would be 41.2 or 164.8)');
    out.push(font + ' bass MIDI 40 ' + hz.toFixed(2) + ' Hz');
  }
  return out.join('\n');
});

/* ------------------------------------------------------------ kits */
check('a drum kit is selected by its program: Brush 128-040 is not Standard 128-000 (keys 38, 39, 40)', function () {
  const out = [];
  const keys = [38, 39, 40];
  for (const font of FONTS) {
    const kit = function (program) {
      return sampler.render({ font: font, bank: 128, program: program, seconds: 12, notes: keys.map(function (k, i) { return { t: 0.5 + 4 * i, dur: 0.2, midi: k, vel: 0.7 }; }) });
    };
    const std = kit(0), brush = kit(40);
    const parts = [];
    keys.forEach(function (k, i) {
      const a = M.slice(std, 4 * i, 4 * i + 4), b = M.slice(brush, 4 * i, 4 * i + 4);
      assert(M.peak(a) > 0.005 && M.peak(b) > 0.005, font + ' key ' + k + ' is silent in one of the kits');
      const d = M.differenceDb(a, b);
      const sd = M.spectralDifference(M.spectrum(M.mono(a)), M.spectrum(M.mono(b)));
      assert(!M.identical(a, b) && d > -10, font + ' key ' + k + ': Brush and Standard are the same sound (difference ' + d.toFixed(1) + ' dB)');
      assert(sd > 3, font + ' key ' + k + ': the spectra differ by only ' + sd.toFixed(1) + ' dB');
      parts.push(k + ': ' + sd.toFixed(1) + ' dB');
    });
    out.push(font + ' spectral difference, key ' + parts.join(', '));
  }
  return out.join('\n');
});

/* ------------------------------------------------------------ effects off */
check('reverb is off and chorus is off (a staccato note ends in digital silence; switching either on changes the sound)', function () {
  const out = [];
  /* reverb: a woodblock, 50 ms long */
  for (const font of FONTS) {
    const req = { font: font, bank: 0, program: 115, notes: [{ t: 0.5, dur: 0.05, midi: 72, vel: 0.9 }], seconds: 4 };
    const dry = sampler.render(req);
    const wet = sampler.render(Object.assign({ _test: { reverb: true } }, req));
    const end = M.lastNonzero(dry);
    assert(end > 0.5 * SR && end < 1.0 * SR, font + ': the staccato woodblock should end within 0.5 s, it ends at ' + (end / SR).toFixed(3) + ' s');
    const after = function (st) { return M.db(M.rms([st[0].subarray(end + 1), st[1].subarray(end + 1)])); };
    assert(after(dry) === -Infinity, font + ': there is sound after the voice has ended (' + after(dry).toFixed(1) + ' dBFS): an effect is running');
    assert(after(wet) > -100, font + ': the control render with reverb on shows no tail (' + after(wet) + ' dBFS), so this test proves nothing');
    assert(M.differenceDb(dry, wet) > -40, font + ': reverb on makes no difference');
    out.push(font + ' woodblock: voice ends ' + ((end / SR - 0.5) * 1000).toFixed(0) + ' ms after the note-on, then digital silence (with reverb on: ' + after(wet).toFixed(1) + ' dBFS)');
  }
  /* chorus: the electric pianos are the presets that send to it */
  for (const font of FONTS) {
    const req = { font: font, bank: 0, program: 4, notes: [{ t: 0.5, dur: 0.05, midi: 60, vel: 0.9 }], seconds: 3 };
    const dry = sampler.render(req);
    const wet = sampler.render(Object.assign({ _test: { chorus: true } }, req));
    const d = M.differenceDb(dry, wet);
    assert(d > -20, font + ': the control render with chorus on is the same as the dry one (' + d.toFixed(1) + ' dB), so this test proves nothing');
    const end = M.lastNonzero(dry);
    assert(M.lastNonzero(wet) > end, font + ': chorus on should outlast the dry voice');
    out.push(font + ' electric piano 000-004: chorus on would change it by ' + d.toFixed(1) + ' dB; it is off');
  }
  /* and the interpolation setting is really applied */
  const req = { font: 'fluidr3', bank: 0, program: 0, notes: [{ t: 0.1, dur: 0.5, midi: 57, vel: 0.7 }], seconds: 1 };
  const best = sampler.render(req), four = sampler.render(Object.assign({ _test: { interp: 4 } }, req)), seven = sampler.render(Object.assign({ _test: { interp: 7 } }, req));
  assert(M.identical(best, seven), 'the default render is not the 7th-order one');
  assert(!M.identical(best, four), 'the interpolation setting has no effect');
  out.push('interpolation: 7th order is in use (4th order differs by ' + M.differenceDb(best, four).toFixed(1) + ' dB)');
  return out.join('\n');
});

/* ------------------------------------------------------------ velocity */
check('velocity 0..1 maps monotonically to loudness', function () {
  const vels = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const out = [];
  const cases = [[0, 0, 60, 'piano C4', 3], [0, 32, 40, 'bass E2', 3], [128, 40, 38, 'brush kit key 38', 2], [128, 0, 51, 'ride', 6]];
  for (const font of FONTS) {
    for (const [bank, program, key, name, slot] of cases) {
      const st = sampler.render({ font: font, bank: bank, program: program, seconds: slot * vels.length,
        notes: vels.map(function (v, i) { return { t: 0.25 + slot * i, dur: 0.4, midi: key, vel: v }; }) });
      const lufs = vels.map(function (v, i) { return M.lufs(M.slice(st, slot * i, slot * (i + 1))); });
      for (let i = 1; i < lufs.length; i++) {
        assert(lufs[i] > lufs[i - 1], font + ' ' + name + ': vel ' + vels[i] + ' (' + lufs[i].toFixed(1) + ' LUFS) is not louder than vel ' + vels[i - 1] + ' (' + lufs[i - 1].toFixed(1) + ')');
      }
      out.push(font + ' ' + name + ': ' + lufs[0].toFixed(1) + ' LUFS at 0.1 .. ' + lufs[4].toFixed(1) + ' at 0.5 .. ' + lufs[9].toFixed(1) + ' at 1.0');
    }
  }
  const zero = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: [{ t: 0.1, dur: 0.3, midi: 60, vel: 0 }], seconds: 1 });
  assert(M.peak(zero) === 0, 'vel 0 should be silent');
  return out.join('\n');
});

/* ------------------------------------------------------------ gain, float, errors */
check('gain is linear and nothing clips (float); bad requests are Errors', function () {
  const chord = [36, 43, 48, 52, 55, 60, 64, 67].map(function (k) { return { t: 0.1, dur: 0.8, midi: k, vel: 1 }; });
  const half = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: chord, seconds: 1, gain: 0.5 });
  const quarter = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: chord, seconds: 1, gain: 0.25 });
  let worst = 0;
  for (let i = 0; i < half[0].length; i++) { worst = Math.max(worst, Math.abs(half[0][i] - 2 * quarter[0][i])); }
  assert(worst < 1e-6, 'gain 0.5 is not twice gain 0.25 (largest difference ' + worst + ')');
  const loud = sampler.render({ font: 'fluidr3', bank: 0, program: 0, notes: chord, seconds: 1, gain: 5 });
  assert(M.peak(loud) > 1.5, 'expected a peak above 1.0 at gain 5 (float is not clipped), got ' + M.peak(loud).toFixed(2));
  assert(Math.abs(M.peak(loud) / M.peak(half) - 10) < 0.01, 'gain 5 is not ten times gain 0.5');
  throws(function () { sampler.render({ font: 'nope', notes: [] }); }, /cannot find the SoundFont/, 'an unknown font');
  throws(function () { sampler.render({ font: 'fluidr3', bank: 5, program: 3, notes: [{ t: 0, dur: 0.1, midi: 60, vel: 0.5 }], seconds: 0.5 }); }, /no preset 005-003/, 'a missing preset');
  throws(function () { sampler.render({ font: 'musescore', bank: 128, program: 99, notes: [{ t: 0, midi: 38, vel: 0.5 }], seconds: 0.5 }); }, /no preset 128-099/, 'a missing kit');
  throws(function () { sampler.render({ font: 'fluidr3', notes: [{ t: 0, dur: 0.1, midi: 60, vel: 1.2 }], seconds: 0.5 }); }, /vel is 0\.\.1/, 'vel 1.2');
  throws(function () { sampler.render({ font: 'fluidr3', notes: [{ t: 0, dur: 0.1, midi: 60.5, vel: 0.5 }], seconds: 0.5 }); }, /midi is a whole number/, 'midi 60.5');
  throws(function () { sampler.render({ font: 'fluidr3', notes: [{ t: 0, midi: 60, vel: 0.5 }], seconds: 0.5 }); }, /dur is a length/, 'a piano note without dur');
  throws(function () { sampler.render({ font: 'fluidr3', bank: 128, notes: [{ t: 0.1, midi: 38, vel: 0.5 }, { t: 0.1001, midi: 38, vel: 0.5 }], seconds: 0.5 }); }, /struck twice/, 'one key twice in an instant');
  return 'one 8-note fortissimo piano chord peaks at ' + M.db(M.peak(half)).toFixed(1) + ' dBFS at the default gain ' + sampler.DEFAULT_GAIN;
});

/* ------------------------------------------------------------ onset */
check('onset(): measured, sensible, cached', function () {
  const out = [];
  for (const [font, bank, program, key, name] of [['fluidr3', 0, 0, 60, 'piano C4'], ['musescore', 0, 32, 40, 'bass E2'], ['fluidr3', 128, 40, 38, 'brush kit key 38']]) {
    const req = { font: font, bank: bank, program: program, midi: key, vel: 0.7 };
    const d = sampler.onsetDetail(req);
    assert(d.t10 >= 0 && d.t10 <= d.t50 && d.t50 <= d.tPeak && d.tPeak < 1, name + ': not ordered: ' + JSON.stringify(d));
    assert(d.t10 < 0.05, name + ': the 10 percent point is ' + ms(d.t10) + ' after the note-on, which is not believable');
    const t0 = Date.now();
    const again = sampler.onset(req);
    assert(again === d.t10, name + ': onset() should return t10');
    assert(Date.now() - t0 < 100, name + ': the second call was not served from the cache');
    out.push(font + ' ' + name + ': 10% at ' + ms(d.t10) + ', 50% at ' + ms(d.t50) + ', peak at ' + ms(d.tPeak));
  }
  assert(fs.existsSync(sampler.ONSET_FILE), 'no ' + sampler.ONSET_FILE);
  const disk = JSON.parse(fs.readFileSync(sampler.ONSET_FILE, 'utf8'));
  assert(disk.onsets && disk.onsets['fluidr3|0|0|60|89'], 'the cache file does not hold fluidr3|0|0|60|89');
  /* using it: start the note early by its onset and the 10 percent point lands on the time asked for */
  const T = 1.0, req = { font: 'fluidr3', bank: 128, program: 40, midi: 38, vel: 0.7 };
  const st = sampler.render({ font: req.font, bank: req.bank, program: req.program, seconds: 2, notes: [{ t: T - sampler.onset(req), midi: 38, vel: 0.7 }] });
  const got = sampler.onsetIn(st, 0, 2);
  assert(Math.abs(got.t10 - T) <= 0.001, 'a hit placed with onset() lands ' + ms(got.t10 - T) + ' from its time');
  out.push('a brush hit started onset() early lands ' + ms(got.t10 - T) + ' from its time');
  throws(function () { sampler.onset({ font: 'fluidr3', bank: 0, program: 0, midi: 60, vel: 2 }); }, /vel is 0\.\.1/, 'onset with vel 2');
  return out.join('\n');
});

/* ------------------------------------------------------------ verdict */
const failed = results.filter(function (r) { return !r.ok; });
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' checks passed (fluidsynth ' + sampler.version() + ').');
if (failed.length) {
  console.error('FAILED:\n  - ' + failed.map(function (r) { return r.name + ': ' + r.note; }).join('\n  - '));
  process.exit(1);
}
