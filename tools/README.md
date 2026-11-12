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

`out/` is scratch output and is ignored by git. `dist/` is not ignored: the
single-file build and the PDF are the fallbacks you take to the venue.

The night before the talk, run these four in order. If all four exit
without complaint, the deck opens, every slide renders, and you have a
single-file copy and a PDF as fallbacks:

```
node tools/test-engine.js
node tools/shoot.js --contact
node tools/bundle.js
node tools/export-pdf.js
```

On the day, open the deck in a new tab rather than reusing the tab you
rehearsed in. Exercise countdowns and the presenter view's elapsed timer are
remembered per tab (that is what lets them survive a reload), so a fresh tab
starts with all of them at zero.

## Opening the deck

Double-click `deck/index.html`. No server, no network.

| Key | Action |
|---|---|
| → ↓ Space PageDown Enter | next step or slide |
| ← ↑ PageUp Backspace Shift+Space | back |
| Home / End | first / last slide |
| digits, then Enter | jump to that slide number (any other key drops the number) |
| O or Escape | overview grid (arrows + Enter, or click; PageDown / PageUp close it) |
| S | presenter view in a second window |
| N | speaker notes over the bottom of this window |
| F | fullscreen |
| B or . | black screen, on top of everything, the overview included |
| P | show / hide the progress bar |
| T / R | start or pause / reset the timer on the current slide |

Three rules keep the keys safe on stage:

- **A black screen hides nothing that moves.** While the screen is black, B
  and `.` bring the picture back, and so does every key that would otherwise
  move or change it (next, back, Home, End, O, Escape). That key does nothing
  else: the next press acts as usual.
- **One press, one action.** A key held a moment too long is not repeated,
  so a held T cannot start and pause the timer, and a clicker button held
  down advances one step. Only the arrow keys repeat when held.
- **A mistyped digit cannot ambush you.** A number waits for Enter for four
  seconds, and is dropped at once by any key that is not a digit, Backspace
  or Enter. Enter after that is plain "next".

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
to the same place. The presenter window is opened with the same flags as the
deck window (all but `fast` and `print`), so both hold the same slides.

### Exercise countdowns

A countdown belongs to its slide, not to one visit. T starts and pauses it,
R resets it. If a stray clicker press takes you off the slide in the middle
of an exercise, come back: a running countdown has kept counting, a paused
one is still paused. The same holds for a reload of the page. If the time
ran out while you were away, the slide shows it as over.

A countdown that is paused or over is forgotten ten minutes after its slide
was last on screen, and R forgets it at once, so going back to an exercise
slide later gives a fresh countdown. (A slide can change the ten minutes
with `"keep": minutes` in the scene's `data-opts`; `"keep": 0` remembers
nothing.)

### Presenter view

Press S in the deck window. A second window opens with the notes (A− / A+
or the − / + keys change the size), the next slide, the wall clock, an
elapsed timer and pacing. Drag the deck window to the projector and keep
the presenter window on the laptop. Either window can drive: the same keys
work in both, and T / R / B pressed in the presenter window act on the deck.

- Open the presenter view first, then press F in the deck window. Opening a
  new window can drop a browser out of fullscreen.
- The window opens at 1280 × 820 and can be any size. The elapsed timer and
  the pacing lines always fit without scrolling; the two thumbnails take the
  room that is left and disappear on a small window. Below 860 px wide the
  timer and pacing become a strip above the notes.
- The elapsed timer starts on your first advance. Click the time to pause
  or resume. **Reset** sets it back to zero. **Set** lets you type the
  elapsed time (`43` or `43:30`), for when the timer was started late or
  lost.
- The timer survives accidents. Reload the presenter window and it carries
  on. Close the presenter window and press S again: the deck window kept a
  copy, and the new window carries on from it, counting the time in between.
  Only Reset, or closing the deck's tab, clears it.
- Pacing uses each slide's `minutes`: a slide's planned start is the sum of
  the minutes before it. "Ahead" means you reached the slide before its
  planned start. "Behind" means you are still on it after its planned end.
  "Arrived m:ss early / late" is recorded when you move to a slide. A
  presenter window that was reloaded or opened afterwards keeps the figure
  for the slide it was recorded on, and shows none when it was not there
  for the arrival.
- The bottom bar says when the audience is not looking at the slide:
  "Screen is black (B)" and "Overview is on the screen (O)". Moving on from
  the presenter window closes an overview left open in the deck window. O in
  the presenter window opens and closes the deck's overview; Escape there
  only ever closes it.
- If the two windows drift apart (for example after closing one), reload
  either window. They find each other again within two seconds.

## test-engine.js

```
node tools/test-engine.js                 run everything (38 checks, one to two minutes)
node tools/test-engine.js timer           only tests whose name contains "timer"
node tools/test-engine.js --list          list the test names
node tools/test-engine.js --entry dist/deck.html     test the single-file build
```

Prints one `PASS` or `FAIL` line per test and exits 1 if anything failed.
It drives the demo slides in `deck/slides/_demo.js` by id, through the
`file://` address with `?demo`, so it keeps working after the real slides
exist and after the demo slides are switched off (the presenter window is
opened with the same `?demo`). It needs the `<script src="slides/_demo.js">`
tag to stay in `deck/index.html`.

**The tests check what the engine does, not how the theme makes it look.**
With the theme loaded they only assert classes, attributes, visibility, text
and positions in the running order, so restyling a reveal or moving the
progress bar cannot break them, and the theme does not need to leave the
demo slides alone. The engine's own default looks (the rise offset, the thin
bar along the bottom, the outlined digits of a paused timer) are asserted
in the two tests named "engine defaults (theme off)", on a page whose theme
stylesheets were removed. If a theme change does make a test fail, the theme
has broken something that matters: a hidden step that shows, a P key that no
longer hides the bar, a timer that is no longer large.

Covered: stage scaling, step visibility forward and back, every `data-anim`,
counters, hash and reload, all keys, held keys, digit jump, overview,
blackout (also over the overview), `skip()`, slides and scenes that throw,
scene mount / step / destroy and leaked loops, the timer and its memory
across leaving the slide and reloading, the presenter window in both
directions, its layout at ten window sizes, its flags, pacing, the elapsed
timer across reload and close / reopen, print mode and PDF page count, fast
mode, `settle()`, focus inside inputs, mouse, touch, and `motion.js` under
Node and in the browser, including a switch to the manual clock in mid-flight.

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
  `data-count-prefix`, `data-count-suffix`, `data-count-duration` (seconds),
  `data-count-ease` (a `Motion.ease` name) and `data-count-steps` (the number
  ticks that many times instead of running smoothly). Deck-wide defaults:
  `Deck.config({ counters: { duration: 1.5, ease: 'outExpo', steps: 12 } })`.
- `Scenes.define(name, (host, opts, api) => ({ step(n, dir), resize(), destroy() }))`
  and `<div class="scene" data-scene="name" data-opts='{"json": 1}'></div>`.
  `destroy()` must stop every `Motion.raf` loop the scene started; the test
  suite counts leaked loops.
- Read time from `Motion.now()` only. Never `Date.now()` or
  `performance.now()` in a scene, or `?fast` and video capture break.
- `Motion.useManualClock(t)` may be called while scenes are running: tweens,
  timelines and `Motion.raf` loops are moved onto the new time base and carry
  on from where they are (`dt` is never negative and never jumps). If your
  scene keeps a `Motion.now()` value of its own across frames (a start time,
  say), register `Motion.onRebase(function (delta) { myStart += delta; })`
  and call the function it returns in `destroy()`. For a capture that must
  begin at the very start of an animation, switch clocks before the deck
  starts.
- A scene is built afresh on every visit to its slide. If it has to remember
  something between visits, keep that outside the instance
  (`deck/scenes/timer.js` shows how).
- `enter(ctx)` runs before step visibility is applied and before scenes
  mount, so it may add markup, including `data-step` and `data-scene`
  elements. Set `steps` yourself in that case. The overview and presenter
  thumbnails are built from `html` only and do not run `enter()`.
- Keyboard events inside `<input>`, `<textarea>`, `<select>`,
  `contenteditable` and anything under `data-keys="own"` are left alone.
  Escape leaves a text field. After a mouse click on a button or slider the
  keyboard goes back to the deck, so a clicker keeps working.
- Style `.slide`, not `.deck-stage .slide`: the same markup is reused in
  the overview and the presenter view.
- Math that must give the same numbers in Node and in the browser should
  use `Motion.rng(seed)` and stay away from `Math.log`, `Math.exp`,
  `Math.pow`, `Math.sin`, `Math.cos`: those differ in the last digit
  between Node 22 and Chromium. `Math.sqrt` is safe.

### For the theme

The engine reads the canonical tokens of `docs/TOKENS.md` (`--c-bg`,
`--c-ink`, `--c-accent`, `--c-accent-ink`, `--f-display`, `--f-body`,
`--f-mono`, `--t-small`, `--d-fast`, `--d-base`, `--e-out`, `--e-in-out`)
and falls back to plain values without them. `deck/engine/deck.css` loads
after the theme, so everything in it that is about looks is written with
zero specificity (`:where()`): any ordinary rule in the theme wins. The top
of that file is the reference. In short:

- **Knobs:** `--deck-slide-duration` (0s = hard cut), `--deck-reveal-*`,
  `--deck-hide-duration`, one group per `data-anim`, `--deck-progress-*`,
  `--timer-*`. The engine's defaults follow `--d-base`, `--d-fast`, `--e-out`.
- **Slide change:** the new slide is `.slide.is-current`, the old one
  `.slide.is-leaving` until the duration is over. Meanwhile `.deck-stage` has
  `.is-transitioning` and `data-dir="forward|back"`, and an empty
  `<div class="deck-transition">` sits above both slides. It is a new element
  every time, so a CSS animation on it restarts: that is where a cover or a
  wipe goes.
- **Where we are:** `.deck-stage` carries `data-current-slide`,
  `data-current-act`, `data-current-layout`, `data-current-step`.
- **Progress:** `.deck-progress` contains one `.deck-progress-act` per act
  with a `.deck-progress-fill`, one `.deck-progress-tick` per slide
  (`.is-done`, `.is-current`), the act number and name
  (`.deck-progress-actnum`, `.deck-progress-actname`), and
  `.deck-progress-current` / `.deck-progress-total`. By default only a thin
  bar and the number show; the ticks and the act label are switched off.
- **Reveals:** only the hidden state is styled
  (`[data-anim="rise"]:not(.is-visible)` and so on), with `opacity`,
  `translate`, `scale`, `rotate` and `clip-path`, so `transform` stays free.
- **Timer:** `.timer[data-state="idle|running|paused|finished"]` and
  `.timer[data-last-minute]`. The states differ by shape and ground, not only
  by colour: outlined digits when paused, an accent block in the last minute,
  an inverted block that flashes three times at zero.
- **Counters:** `Deck.config({ counters: { duration, ease, steps } })`.

The engine also runs with no theme at all (that is how its default looks
are tested): every token it reads has a plain fallback in `deck.css`.

### Demo slides

`deck/slides/_demo.js` holds six throwaway slides that exercise the engine.
They carry their own few lines of CSS, so they do not depend on the slide
kit. Switch them off for the real talk with `window.DECK_DEMO = false;`
anywhere before that file loads (the top of the first slides file is a good
place). `?demo` in the address forces them back on.
