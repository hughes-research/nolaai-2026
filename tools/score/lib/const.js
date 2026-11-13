/* tools/score/lib/const.js: the numbers every part of the kit shares. Do not change. */
'use strict';
const path = require('path');

const SR = 48000;                 // samples a second
const SECONDS = 46;               // the film
const N = SR * SECONDS;           // 2,208,000 samples a channel
const REPO = path.resolve(__dirname, '..', '..', '..');   // /home/user/nolaai-2026
const LAB = path.resolve(__dirname, '..');                // tools/score

module.exports = { SR, SECONDS, N, REPO, LAB };
