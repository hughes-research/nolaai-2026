/* tools/score/minimal/diag.js: where the master squeezes. Total gain reduction (compressor and limiter together), bar by bar:
 * the stems' sum times the master's plain gain, against final.wav, in 5 ms frames. A tool for the mix passes; build.js does not use it. */
'use strict';
const path = require('path');
const kit = require('../lib');
const { dsp, mix, wav } = kit;
const SR = kit.const.SR;
const here = (...p) => path.join(__dirname, ...p);
const rd = (f) => { const w = wav.read(here(f)); return [w.channels[0], w.channels[1]]; };
const nums = require('./build-numbers.json');
const final = rd('final.wav');
const sum = dsp.stereo();
for (const k of ['bass', 'keys', 'drums', 'fx']) { mix.add(sum, rd('stems/' + k + '.wav')); }
dsp.butter(sum, 'hp', 30, 4);
dsp.eq(sum, [{ type: 'highshelf', f: 8000, q: 0.7071, db: -3 }]);
dsp.gain(sum, nums.master.gainDb);
const F = Math.round(0.005 * SR);
const rows = [];
for (let bar = 0; bar < 23; bar++) {
  let worst = 0, acc = 0, n = 0, over = 0, pk = 0;
  for (let s = bar * 2 * SR; s + F <= (bar + 1) * 2 * SR; s += F) {
    let a = 0, b = 0;
    for (let i = s; i < s + F; i++) {
      a += sum[0][i] * sum[0][i] + sum[1][i] * sum[1][i]; b += final[0][i] * final[0][i] + final[1][i] * final[1][i];
      const v = Math.max(Math.abs(sum[0][i]), Math.abs(sum[1][i])); if (v > pk) { pk = v; }
    }
    if (a < 1e-7) { continue; }
    const gr = 10 * Math.log10(a / Math.max(b, 1e-20));
    if (gr > worst) { worst = gr; }
    acc += gr; n++;
    if (gr > 1) { over++; }
  }
  rows.push('bar ' + String(bar + 1).padStart(2) + '  peak before the squeeze ' + dsp.db(pk).toFixed(1).padStart(6) + ' dBFS   reduction: mean ' + (n ? acc / n : 0).toFixed(1).padStart(4) + ' dB, most ' + worst.toFixed(1).padStart(4) + ' dB, over 1 dB for ' + (n ? 100 * over / n : 0).toFixed(0).padStart(3) + ' percent of the bar');
}
console.log(rows.join('\n'));
