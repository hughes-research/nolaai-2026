# The Most Valuable AI Skill Is Saying No

**Screening AI use cases for real return.** A 90-minute workshop by Dustin T Hughes at NOAI 2026 (New Orleans Arts & Ideas fest), Education Center, New Orleans Jazz Museum, Friday Nov 13, 2026, 2:30–4:00 PM.

This repository holds the presentation, the notes and the code behind it. Everything runs offline from a laptop, with no internet and nothing to install.

## Present it

1. Open **`dist/deck.html`** in Chrome (double-click it). It is the whole deck in one file. `deck/index.html` is the same deck as separate files, for editing.
2. Press **F** for fullscreen. Press **S** for the presenter view (your notes, the clock, and whether you are ahead or behind) and drag that window to your laptop screen.
3. Advance with **→**, **Space** or a clicker.

| Key | What it does |
|---|---|
| → ↓ Space PageDown | Next click or slide |
| ← ↑ PageUp | Back |
| S | Presenter view in a second window |
| N | Notes over the bottom of this window (for rehearsing) |
| O | Overview of every slide; click one to jump |
| digits, then Enter | Jump to that slide number |
| T / R | Start or pause / reset the exercise timer on the slide |
| B | Black screen |
| F | Fullscreen |

A mouse click on a slide does not advance it, because several slides have live controls you drag and press. If you reload the page you come back to the same slide.

## The day before

- [ ] Fill in your numbers (next section).
- [ ] Read `docs/REHEARSAL.md` (one page: the through-line, the lines to land word for word, a 20-minute run-through for tonight).
- [ ] Run through it once with the presenter view open and its window maximised (the last slide's notes hold five likely questions and need the room). `docs/SPEAKER-NOTES.md` has every note in order; `docs/RUN-OF-SHOW.md` has the clock time of every slide and a cut plan for running late.
- [ ] Nine slides have a `YOUR STORY` note: a place where only you know what to say. Decide each one before you walk on.
- [ ] Print **`handouts/worksheet.pdf`**, one sheet per person, two-sided, black and white. Bring pens.
- [ ] Copy `dist/` to a USB stick. `dist/deck.pdf` is the fallback if a browser misbehaves (41 pages: two slides print an extra click).
- [ ] Present from Chrome, with the laptop plugged in. If you jump straight to the warehouse slide (27) on a slow laptop, it shows the search counting up for a few seconds before the result lands; stepping through Act 4 normally avoids the wait.
- [ ] On the screener slide (23), what the room types survives a reload. Press RESET after rehearsing so you start clean.
- [ ] In the room: check the coral ink (Flare) on the projector, and check you can read the screener slide (slide 23, the densest) from the back row.

## Your numbers

Everything you may want to change is in one file: **`deck/content/your-numbers.js`**. It is written to be edited by hand and every value has a plain-language comment.

- **`slotting.biggerReturn`, `slotting.effort`, `slotting.potential`**: the scorecard for your own project (slide 32). **The dollar figures there now are made up to protect company data**, and `slotting.illustrative: true` puts an "ILLUSTRATIVE · CHANGED TO PROTECT COMPANY DATA" tag on the slide wherever they show. The percentages, hours and counts are real. Replace the figures with real ones and set the flag to `false`, or leave both as they are. If you empty them, the slide stops at the Return gate's NO ($462 on minutes alone) and the headline goes back to "The one we built".
- **`slotting.results`**: the real project figures. Check them against your records.
- **`story.howWeBuiltIt`**: a few lines in your own words. The slide is skipped while the list is empty.
- **`rates`, `company`, `houseRules`, `examples`, `candidates`**: the example hourly rate, the example company, the pass/fail thresholds, and the three example candidates. All are labeled "Example" on screen.
- **`links`**: a link to the screener and to this repository. A slide shows the link and a QR code once it is set.

After editing, rebuild the one-file deck and the paper so they agree:

```
node tools/bundle.js             # dist/deck.html
node tools/export-pdf.js         # dist/deck.pdf
node tools/build-handouts.js     # handouts/worksheet.pdf
node tools/build-run-of-show.js  # docs/RUN-OF-SHOW.md and docs/SPEAKER-NOTES.md
```

These need Node 22 and Playwright (`npm install -g playwright`, then `npx playwright install chromium`). Presenting needs neither.

## What is in the session

| Clock | Act | What happens |
|---|---|---|
| before | Walk-in | A looping title card. "Take a worksheet and a pen." |
| 2:30 | 1. The Bandwagon | The hook, Shannon's 1956 warning, who is talking, the promise. |
| 2:40 | 2. The Four Gates | Cost, Return, Effort, Potential. Minutes become money through the cash conversion cycle or through capacity. |
| 2:55 | 3. Your Turn | Three exercises on the worksheet: inventory two weeks, pick three, run them through the gates. |
| 3:30 | 4. The One We Built | A real warehouse slotting project: the problem, a live re-creation, the real numbers, seven attempts, what was refused, what it costs to run, and the scorecard. |
| 3:50 | 5. Who Owns the Minutes? | Freed time is a management decision. Share the gain. Close. |

## Where every number comes from

Nothing on screen is typed by hand except the real project results, which live in `deck/content/your-numbers.js`.

- **Model prices and scores** come from `data/benchlm-leaderboard.csv` (a BenchLM leaderboard export, November 2026). The file marks 17 of its 50 scores "estimated" and says its rank order is not statistically certain, so the deck talks in price tiers and flags estimates. `deck/lib/cost-math.js` does the arithmetic.
- **The four-gate math** is in `deck/lib/gates-core.js` and explained in plain language in `docs/MATH.md`. The thresholds are house rules: defaults to change.
- **The animated warehouse** is a re-creation on made-up data (`deck/lib/slotting-core.js`). It is labeled "Animated re-creation · synthetic data" and its numbers are never presented as the company's. Run the same model from the command line with `node demo/slotting/run.js`.
- **The Shannon lines** are quoted from "The Bandwagon" (IRE Transactions on Information Theory, 1956). Where a word is swapped, the slide marks it as our edit.

## Other pieces

- **`screener/index.html`**: the four-gate screener as a stand-alone page that works on a phone.
- **`video/title-sequence.mp4`**: a 46-second title film: three ideas run the four gates, two get NO, the boring one passes. Its score is an original cool-jazz trio played by recorded instruments (credits in `tools/score/SAMPLE-LICENSES.md`; `tools/score/README.md` has the alternates and how to rebuild). `title-square.mp4` is the square cut and `title-silent.mp4` has no audio, for rooms without sound.
- **`handouts/worksheet.pdf`**: the two-sided attendee worksheet.

## For anyone changing the deck

`docs/BRIEF.md` is the source of truth for the story, the copy, the math and the honesty rules. `docs/DIRECTION.md` is the visual rulebook, `docs/BUILDERS.md` the working rules, and `tools/README.md` describes the test, screenshot, bundle and PDF tools.

```
node tools/test-engine.js     # the presentation engine
node tools/test-libs.js       # the cost and gate math
node tools/test-slotting.js   # the warehouse model
node tools/shoot.js --contact # a screenshot of every slide
```

## License

GPL-3.0. See `LICENSE`. Fonts are Archivo and Fraunces, both under the SIL Open Font License.
