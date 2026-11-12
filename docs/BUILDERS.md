# Builder rules

For everyone (human or agent) building a piece of this deck. Read `docs/BRIEF.md` first; it wins on facts, copy and the technical contract. Token names are in `docs/TOKENS.md`. The chosen visual direction is described in `docs/DIRECTION.md` with reference frames in `docs/direction/`.

## Working in a shared repository

- Several builders work here at once. **Touch only the files you were assigned.** Never overwrite a file you do not own, even to "fix" it: report it instead.
- **Do not run git commands that change state** (add, commit, checkout, stash, reset, clean). The lead commits.
- Do not `npm install` into the repository. Node 22 and Playwright are installed globally (`require('playwright')`, `chromium.launch()` with no options).
- Scratch output goes in `out/` (git-ignored).

## Hard technical rules (from the brief, repeated because they bite)

- Runs offline by double-clicking `deck/index.html`: **no ES modules, no fetch/XHR, no external URLs, no CDNs.** Classic scripts only. Data files assign to `window`.
- No frameworks or third-party libraries.
- Stage is 1920×1080. Body text 36px or more, labels 28px or more, source lines 24px or more. Text contrast 7:1 or better for anything that must be read.
- A scene stops every animation loop and timer in `destroy()`. All time comes from `Motion.now()`.
- Keys belong to the deck. An interactive scene handles pointer input freely, and puts `data-keys="own"` only on real form fields.
- Interactive controls are big enough to hit while talking: at least 64px tall on the stage.

## How a slide is written

One file per group in `deck/slides/`, each registering its slides in running order with `Deck.slide({...})` (API in the brief, section 9).

- Use the ids from section 8 of the brief exactly. On-screen copy there is final; do not paraphrase it, do not add claims.
- Use the layouts and components from `deck/theme/components.css` (see the kit slides) before inventing markup. If the kit lacks something you need, build it inside your own scene or a scoped `<style>` block keyed to your slide id, using tokens only.
- One idea per slide. If a slide needs a paragraph, it is two slides or it belongs in the notes.
- Builds: put `data-step="n"` on what appears at step n. Prefer three steps or fewer unless the slide is a live scene.
- Every slide has `minutes` (they must add up to the act's budget in section 7 of the brief) and `notes`.

### Speaker notes

Written for Dustin to glance at mid-sentence, in his voice: first person, plain, dry, short lines. Structure every note the same way:

```
SAY: two to five short lines, the actual point in his words.
DO: what to click or point at (only if there is something).
NEXT: the line that hands off to the next slide.
```

Never invent a story, a customer, a number or an outcome. Where a real story belongs, write `YOUR STORY: <what to tell>` and stop.

## Numbers

- Compute, never type. Benchmark figures come from `CostMath`, gate figures from `Gates`, the synthetic warehouse from `Slotting`, speaker-editable values from `window.YOUR`. If you find yourself typing a number that one of those can produce, call it instead.
- The only numbers typed by hand are the Laborde project results in section 2 of the brief, and they live in `window.YOUR.slotting.results`, not in slide markup.
- Every chart or figure built on assumptions shows the assumption and the source on the slide (`.source-line`), and carries the right label: "Example", "synthetic data", or "Laborde results, Oct 2026".
- Format money with `CostMath.money()` so `$0.00045` and `$15,000` are both rendered properly.

## Confidentiality (rule 7 of the brief)

From the Laborde project: results and counts only. No brand, vendor, system, library, server, people, building, door or aisle names. No real floor geometry. Nothing copied from that repository.

## The loop: build, shoot, look, fix

You are not done when the code runs. You are done when you have looked at it.

1. Build.
2. `node tools/shoot.js --only <your-slide-ids> --steps all --out out/shots/<your-name> --contact`. It exits non-zero on any console or page error; fix those first.
3. **Open the screenshots with the Read tool and look**, as an art director would from the back row: Is the hierarchy obvious in one second? Is anything clipped, overlapping, off-grid, too small, too faint? Does each step actually change something visible? Does it look like the reference frames in `docs/direction/`? Does it feel made on purpose?
4. Fix and repeat. At least three full passes. For animated scenes also capture mid-animation frames (freeze with `Motion.useManualClock()` / `Motion.setTime()` or screenshot at intervals) and look at those too: motion that only looks right at the end is not right.
5. Run `node tools/test-engine.js` once at the end to confirm you broke nothing.

Report honestly at the end: what works, what you verified by looking, what you could not verify, and anything in the brief you deviated from and why.
