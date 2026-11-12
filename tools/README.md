# Deck tools

Everything here runs with Node 22 and a globally installed Playwright
(`npm install -g playwright`, then `npx playwright install chromium`).
Nothing is installed into this repository. Run the commands from the
repository root.

| Command | What it does | Writes |
|---|---|---|
| `node tools/test-engine.js` | Tests the deck engine in headless Chromium | nothing |
| `node tools/shoot.js` | Screenshots every slide | `out/shots/*.png` |
| `node tools/bundle.js` | Builds one self-contained HTML file and checks it | `dist/deck.html` |
| `node tools/export-pdf.js` | Exports the deck as a PDF, one slide per page | `dist/deck.pdf` |

`out/` and `dist/` are ignored by git.

The night before the talk, run these four in order. If all four exit
without complaint, the deck opens, every slide renders, and you have a
single-file copy and a PDF as fallbacks:

```
node tools/test-engine.js
node tools/shoot.js --contact
node tools/bundle.js
node tools/export-pdf.js
```

## Opening the deck

Double-click `deck/index.html`. No server, no network.

| Key | Action |
|---|---|
| → ↓ Space PageDown Enter | next step or slide |
| ← ↑ PageUp Backspace Shift+Space | back |
| Home / End | first / last slide |
| digits, then Enter | jump to that slide number |
| O or Escape | overview grid (arrows + Enter, or click) |
| S | presenter view in a second window |
| N | speaker notes over the bottom of this window |
| F | fullscreen |
| B or . | black screen (any next/back key brings the picture back) |
| P | show / hide the progress bar |
| T / R | start or pause / reset the timer on the current slide |

The deck asks the browser to keep the screen awake while it is open (Screen
Wake Lock, where the browser supports it). Still set the laptop not to sleep
before a 90 minute session.

A presentation clicker sends PageDown / PageUp and sometimes B or `.`, so
it works as is. A mouse click on a slide does not advance (scenes are
interactive). Move the mouse to get small back / next buttons in the bottom
corners. On a touch screen, tap the left or right edge or swipe.

Add these to the address after `index.html`:

| Flag | Effect |
|---|---|
| `?debug` | red badge on screen when a slide or scene hook throws |
| `?fast` | all motion 20× and CSS transitions instant (what the tools use) |
| `?print` | every slide at its final step, one per page |
| `?presenter` | the presenter view (normally opened with S) |
| `?demo` | force the engine demo slides on |

Flags combine with `&`, for example `index.html?fast&debug`. The current
slide and step are in the address (`#/gate-cost/1`), so a reload comes back
to the same place.

### Presenter view

Press S in the deck window. A second window opens with the notes (A− / A+
or the − / + keys change the size), the next slide, the wall clock, an
elapsed timer and pacing. Drag the deck window to the projector and keep
the presenter window on the laptop. Either window can drive: the same keys
work in both, and T / R / B pressed in the presenter window act on the deck.

- Open the presenter view first, then press F in the deck window. Opening a
  new window can drop a browser out of fullscreen.
- The elapsed timer starts on your first advance. Click the time to pause
  or resume. Reset sets it back to zero. It survives a reload of the
  presenter window, and starts from zero in a newly opened one.
- Pacing uses each slide's `minutes`: a slide's planned start is the sum of
  the minutes before it. "Ahead" means you reached the slide before its
  planned start. "Behind" means you are still on it after its planned end.
- If the two windows drift apart (for example after closing one), reload
  either window. They find each other again within two seconds.

## test-engine.js

```
node tools/test-engine.js                 run everything (about 35 seconds)
node tools/test-engine.js timer           only tests whose name contains "timer"
node tools/test-engine.js --list          list the test names
node tools/test-engine.js --entry dist/deck.html     test the single-file build
```

Prints one `PASS` or `FAIL` line per test and exits 1 if anything failed.
It drives the demo slides in `deck/slides/_demo.js` by id, through the
`file://` address with `?demo`, so it keeps working after the real slides
exist and after the demo slides are switched off. It needs the
`<script src="slides/_demo.js">` tag to stay in `deck/index.html`.

Covered: stage scaling, step visibility forward and back, every `data-anim`,
counters, hash and reload, all keys, digit jump, overview, blackout, `skip()`,
slides and scenes that throw, scene mount / step / destroy and leaked loops,
the timer, the presenter window in both directions, pacing, print mode and
PDF page count, fast mode, `settle()`, focus inside inputs, mouse, touch,
and `motion.js` under Node and in the browser.

## shoot.js

```
node tools/shoot.js [--only id,id] [--act n] [--steps final|all] [--out dir] [--contact] [--demo] [--entry file]
```

| Option | Meaning |
|---|---|
| `--only id,id` | only these slide ids |
| `--act n` | only slides of act n |
| `--steps final` | one shot per slide at its last step (default) |
| `--steps all` | one shot per step, from step 0 |
| `--out dir` | output folder (default `out/shots`) |
| `--contact` | also write contact sheets |
| `--demo` | include the engine demo slides even if they are switched off |
| `--entry file` | shoot another build, for example `dist/deck.html` |

Files are 1920×1080 PNGs named `NN-id-sK.png`: slide number, slide id,
step. One line is printed per file. A full run (no `--only`, no `--act`)
first removes the earlier shots in the folder.

`--contact` adds `contact-01.png`, `contact-02.png`, …: 2400 px wide grids
of 12 labelled thumbnails, so a whole deck can be reviewed in a few images.

Exit code 1 if any slide logged a console error, threw an uncaught error,
or had a slide or scene hook fail. The engine catches hook failures quietly
so the talk survives them; this tool asks the engine for the list and
prints each problem under its slide id.

## bundle.js

```
node tools/bundle.js                          deck/index.html     -> dist/deck.html
node tools/bundle.js screener/index.html      screener/index.html -> dist/screener.html
node tools/bundle.js some/page.html --out x.html
node tools/bundle.js --no-verify
```

Inlines every local script, stylesheet, font and image into one HTML file:
`<script src>`, `<link rel="stylesheet">`, `@import` and `url(...)` in CSS,
`<img>` / `<video>` / `<audio>` sources, and `src="..."` / `url(...)`
references inside the scripts (slide markup is written in JavaScript) when
the file exists. An `http(s)` reference is an error.

Then it opens the result through `file://` and fails if there is a console
error, an uncaught error, or a request for any other file. If the page is a
deck it also visits every slide.

The output name comes from the entry: `folder/index.html` becomes
`dist/folder.html`, anything else keeps its own name.

## export-pdf.js

```
node tools/export-pdf.js [--out file.pdf] [--entry file.html] [--demo]
```

Opens `deck/index.html?print`, waits for animations to finish, and writes
`dist/deck.pdf` with one 1920×1080 page per slide (skipped slides are left
out; each slide is at its final step with its scenes mounted). Exits 1 if
the page count does not match the slide count or the page logged an error.

A scene that animates forever is captured at whatever frame it is on.

## For slide and scene authors

The full contract is at the top of `deck/engine/deck.js`. The short version:

- `Deck.slide({ id, act, title, minutes, layout, html, steps, notes, skip, enter, step, exit })`.
- `data-step="n"` reveals from step n; `data-step-only="n"` only at n;
  `data-step-out="n"` hides from n. `data-anim="rise|fade|wipe|stamp|pop"`
  picks the entrance; `style="--delay: 150ms"` staggers it.
- `data-count-to="3600" data-count-format="$,d"` counts up when it becomes
  visible. Formats: `$,d` → $3,600 · `$,.2f` → $3,600.00 · `,d` → 3,600 ·
  `.1f` → 4.3 · `%d` → 3600 · `d%` → 36%. Also `data-count-from`,
  `data-count-prefix`, `data-count-suffix`, `data-count-duration` (seconds).
- `Scenes.define(name, (host, opts, api) => ({ step(n, dir), resize(), destroy() }))`
  and `<div class="scene" data-scene="name" data-opts='{"json": 1}'></div>`.
  `destroy()` must stop every `Motion.raf` loop the scene started; the test
  suite counts leaked loops.
- Read time from `Motion.now()` only. Never `Date.now()` or
  `performance.now()` in a scene, or `?fast` and video capture break.
- `enter(ctx)` runs before step visibility is applied and before scenes
  mount, so it may add markup, including `data-step` and `data-scene`
  elements. Set `steps` yourself in that case. The overview and presenter
  thumbnails are built from `html` only and do not run `enter()`.
- Keyboard events inside `<input>`, `<textarea>`, `<select>`,
  `contenteditable` and anything under `data-keys="own"` are left alone.
  Escape leaves a text field. After a mouse click on a button or slider the
  keyboard goes back to the deck, so a clicker keeps working.
- Style `.slide`, not `.deck-stage .slide`: the same markup is reused in
  the overview and the presenter view. Engine knobs are the `--deck-*` and
  `--timer-*` variables listed at the top of `deck/engine/deck.css`.
- Math that must give the same numbers in Node and in the browser should
  use `Motion.rng(seed)` and stay away from `Math.log`, `Math.exp`,
  `Math.pow`, `Math.sin`, `Math.cos`: those differ in the last digit
  between Node 22 and Chromium. `Math.sqrt` is safe.

### Demo slides

`deck/slides/_demo.js` holds six throwaway slides that exercise the engine.
Switch them off for the real talk with `window.DECK_DEMO = false;` anywhere
before that file loads (the top of `deck/slides/act0.js` is a good place).
`?demo` in the address forces them back on.
