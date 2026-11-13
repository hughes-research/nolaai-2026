/*
 * tools/score/lib/index.js: one require for composers.
 *
 *   const kit = require('../lib');
 *   kit.timeline, kit.midi, kit.sampler      the sampler half
 *   kit.dsp, kit.mix, kit.synth, kit.wav,
 *   kit.checks, kit.analyze, kit.mux         the mix half
 *   kit.const                                SR, SECONDS, N, REPO, LAB
 *
 * Every module is loaded the first time it is used, so one half that is
 * missing or broken does not stop the other from working.
 */
'use strict';

const NAMES = ['const', 'timeline', 'midi', 'sampler', 'dsp', 'mix', 'synth', 'wav', 'checks', 'analyze', 'mux'];

const kit = {};
NAMES.forEach(function (name) {
  Object.defineProperty(kit, name, {
    enumerable: true,
    configurable: true,
    get: function () { return require('./' + name + '.js'); }
  });
});

module.exports = kit;
