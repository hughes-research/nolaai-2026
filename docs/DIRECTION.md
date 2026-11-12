# The visual direction: SLEEVE

Chosen by a three-judge panel over three other directions (scores: Sleeve 24.5, Ledger 18, Waypoint 17.5, Engine Room 13.5). Reference frames are in `docs/direction/` (f1 title, f2 statement, f3 gates, f4 data, f5 warehouse, motion-strip; plus the designer's `frames.html`, `motion.html` and `tokens.css`). Open the PNGs before you design anything.

**Read Part 1 first. It is binding and overrides the designer's original document in Part 2 wherever they disagree.** The reference frames predate Part 1, so some of what they show is superseded (the numbers in f5 are placeholders; f3's gate logic is wrong; several sizes are below the new floors).

## Part 1. Amendments from the judging (binding)

### 1. What Flare means
Flare is **the point of the slide: the one thing to look at.** It never means good or bad. A slide spends Flare once.
- Verdicts are carried by **shape and word, in the two base inks**: NO is a shutter dropped all the way through the floor line with the word NO on it; PASS is a shutter raised to the top of the bay with the word PASS on it and an open bay with a through-arrow below. Small verdict chips: PASS is a hollow frame with a raised lintel plus the word; NO is a solid block plus the word.
- A NO shutter takes Flare only when that NO is the point of the slide (the title, the said-no slide). A winner takes Flare only when it is the point (plain code at about $0; the optimized figure).
- Never put a slide whose Flare is a NO directly before one whose Flare is the winner without a quiet slide or a beat between them.
- Flare is never text on Card and never a thin line on Card. Nothing smaller than display type is ever set in Flare.

### 2. Card is the ground
The room will be lit. Card (`#F4EDDE`) is the ground for almost every slide. Large Lampblack fields are rationed: the title film, the cold open, and at most two hero moments. The punch word of a statement is never Flare on Lampblack: set it as Lampblack on a Flare block. The warehouse scene is drawn on Card by default (Lampblack and Flare dots, Lampblack racks); a dark variant may exist behind an option.

### 3. The quiet register
An anti-hype talk cannot shout on every slide. Roughly one slide in four is loud (a fitted stack, a slab, a bleed). The rest use the quiet archetypes, which the slide kit must provide and demonstrate:
- one line of Archivo at normal width, 96 to 120px, on Card with a lot of empty stock;
- a Fraunces-led aside (a single italic sentence, large);
- a three-line body slide at 40 to 44px with a small headline;
- a data slide where the chart leads and the headline is 96 to 120px, not 150.
Once per act the italic may go huge (one lowercase Fraunces word at 300px or more) as the deck's second voice.

### 4. Legibility floors (they replace the smaller sizes in Part 2)
- Running text 36px or more (40 is the norm).
- Any label that carries meaning (legends, axis labels, BEFORE/AFTER, gate names in the strip, kickers) 32px or more.
- Source lines 28px semibold or more. Nothing on stage is below 28px.
- Fraunces italic is never below 54px, at weight 600 or more, with the WONK and swash forms switched off (`font-variation-settings: "WONK" 0`), so "real" and "all" read cleanly.
- The speaker's name is 48px or more at normal width.
- Display leading opens from 0.708 to about 0.75 on stacks of three or more lines.
- Rules that carry meaning are 6px or more; rack outlines 3px in the ground's contrast ink; dots that carry meaning 8px or more.

### 5. Gate logic
After a gate says NO, every later gate is NOT YET (frame only), never PASS. Verdict microcopy sits under the bay: "carried forward" with the through-arrow under a PASS, and the reason under a NO. Before a NO lands, the empty bay is held visibly vacant; nothing moves for 0.8s before a NO and 0.9s after it. A small tell-tale mark stays where the NO hit.

### 6. Wayfinding
Replace the 13×40px spine tracker and the sideways running title. The spine carries the slide number, the **act name** (large enough to read), and a tick ruler with one tick per slide in the running order (the current one filled). When a slide belongs to a gate, a gate strip with the four words at 30px or more, with shape-coded state, sits in a fixed place the back row can see.

### 7. Make it his
One catalogue line in a fixed slot on the title and walk-in slides, record-sleeve style: `WAYPOINT · NOAI 2026 · NEW ORLEANS` (Waypoint is the name of his AI program). Acts may be numbered like sides or tracks. No instruments, no nautical drawing: the nod is typographic only.

### 8. The deadpan line
One true, dry sentence per data slide in the Fraunces voice, in a consistent slot: "Drawn to scale.", "No bar to draw.", "the whole bar." (with an 8px arrow pointing at the $45 sliver). It is the deck's sense of humour. Never more than one per slide, and never a claim.

### 9. Charts
- The multiple is tied to what it compares: write the sum above it ("$15,000 ÷ $45 =") and bracket the two bars.
- A sliver must stay a visible object: thin or break the axis rule beside it and point at it.
- Bars grow at one constant speed in pixels per second, so $45 is done in a blink and $15,000 keeps the room waiting. Routes on the map are drawn the same way.
- A double rule under a final figure marks a total.
- The headline of a chart slide is 96 to 120px so the chart leads.
- Canvas text cannot use arbitrary font widths: use `ctx.fontStretch` keywords (extra-condensed for display, expanded for labels) through `THEME.font()`, and prefer DOM text laid over the canvas for anything important. Fitted stacks are always DOM.

### 10. The warehouse map
Draw both routes. Rings mark where fast movers used to live (6px strokes, or shown only in motion). Show the pack station large, the dock side and aisle labels so it reads as a warehouse in two seconds. Velocity is encoded by dot size first, ink second.

### 11. Slide count
The running order has about 40 slides, not 38. Compute counts from the deck; never print a fixed total.

---

## Part 2. The designer's original document


Direction for "The Most Valuable AI Skill Is Saying No", NOAI 2026, New Orleans Jazz Museum.

## Concept

The deck is printed like a mid-century record sleeve: two inks on card stock, one grotesque set huge and tight, hard-edged blocks, and a black spine down the left edge of every slide. Its one typographic trick is borrowed from wood-type gig posters and rebuilt on a variable font: every stack of lines is justified to the same measure by changing letter width, never size, so long lines condense and short ones expand. The second ink, Flare, is rationed to one idea per slide, and that idea is always the point: NO, about $0, 6.9 km.

Why it fits the talk: the thesis is rigor over hype, and a two-ink print job is rigor you can see. Nothing glows, nothing fades, nothing is tinted to look clever. Bars are drawn to scale. A gate is either up or down.

## Palette

| Name | Hex | Role | Contrast |
|---|---|---|---|
| Card | `#F4EDDE` | Default ground. Text on Lampblack. | 17.48 : 1 on Lampblack |
| Lampblack | `#050505` | Text, bars, PASS shutters, the spine, dark ground for statements and maps. | 17.48 : 1 on Card |
| Flare | `#FF6842` | The spot ink. NO, and the single number or word a slide exists for. Carries Lampblack text, or sits on Lampblack as text. | 7.10 : 1 with Lampblack (both directions) |
| Flare as a shape on Card | `#FF6842` | Blocks and bands only. Never text, never a thin line, on Card. | 2.46 : 1 on Card (shape only, by rule) |
| Rack | `#8A8275` | Structure on Lampblack only: rack outlines, warehouse wall. Never text, never meaning. | 5.37 : 1 on Lampblack |

Rules that keep every piece of text at 7 : 1 or better:

- Text is Lampblack on Card, Card on Lampblack, Lampblack on Flare, or Flare on Lampblack. There is no fifth combination.
- Flare was tuned to the reddest value that still gives 7 : 1 against Lampblack. Do not make it redder or darker.
- No tints, no opacity steps, no gradients. If two things must differ, they differ in shape, size, pattern or position first, and ink second.
- Marine footnote for the speaker: Flare is the colour of a signal flare. Lampblack is soot from a diesel lamp.

## Type

Two families, both OFL, both variable, both self-hosted in `fonts/`.

| File | Family | Axes used |
|---|---|---|
| `fonts/archivo-latin-standard-normal.woff2` | Archivo | wght 100 to 900, wdth 62 to 125 |
| `fonts/fraunces-latin-full-italic.woff2` | Fraunces Italic | wght, opsz 60, SOFT 0, WONK 1 |

Archivo does everything by moving along its width axis: 62 shouts, 100 talks, 125 labels. Fraunces Italic is the human voice: subtitles, asides, the half of a sentence that is said quietly.

| Role | Setting | Sizes on the 1920 x 1080 stage |
|---|---|---|
| Display / headline | Archivo, wdth 62, wght 900, caps, line-height 0.708, tracking 0 | NO slab 905. Statement stack about 270 (fitted). Title stack about 198 (fitted). Slide headline 150. Headline floor 96. PASS 118, NO on a gate 340. |
| Numerals | Same face, tabular figures | Counters 300. Call-outs (333x, $0) 264. Bar values 96. Units lowercase at 110 beside a 300 counter. |
| Body | Archivo, wdth 100, wght 500 to 600, line-height 1.2 | 40. Floor 36. |
| Label | Archivo, wdth 125 (112 in tight spots), wght 700, caps, tracking 0.1em | 24 (the floor for any text on stage) and 30. |
| Credit line | Archivo, wdth 72, wght 600 with 900 for the name | 34. Title slide only. |
| Voice | Fraunces Italic, wght 560 | 64, 54, 44. |

Three mechanics a deck engine needs:

1. **Cap-height line boxes.** Archivo's cap height is 0.688 em (measured). At `line-height: 0.708` the cap top sits exactly on the box top and the baseline 0.688 em below it. Display type is therefore placed on the pixel grid by its `top`, with no fudge factors. On the title, the NO is exactly as tall as the four title lines: cap top 150, baseline 772.6, both columns.
2. **`fitStack()`** (in `frames.html` and `motion.html`, about 40 lines, no dependencies). Give it a measure; it finds the largest size at which the longest line fits at width 62, then walks every other line up the width axis until it fills the measure. Widths land between 62 and 119 in these frames. Line lengths should stay within about 2 : 1.
3. **Optical margins.** `fitStack()` measures the real side bearings of the first and last glyph of each line and justifies the ink, not the advance width. Without it a P sits 10 px inside an A at 270 px. With it both edges of every stack are flush to the pixel.

Parallel labels (the four gate names) are never justified by width. They share one width and one size, because they are equals.

## Motion

Tempo is 120 BPM and every duration is a note value. Nothing fades: there is no opacity tween anywhere in the system. Things cut, hide behind a block, lift, or drop.

| Token | Value | Use |
|---|---|---|
| `--beat` | 500 ms | A gate opening. The sleeve pull. |
| `--eighth` | 250 ms | The second half of a block reveal. Rule wipes. |
| `--sixteenth` | 125 ms | The first half of a block reveal. One counter tick. |
| `--swing` | 333 ms | The swung off-beat. Stagger is long-short, never even. |
| `--dur-drop` | 375 ms | A gate shutting: three sixteenths. The recoil after it takes the same. |
| `--dur-hold` | 1000 ms | Stop-time after a NO: two beats in negative. |
| `--bar` | 2000 ms | The longest NO may hold the stage. |
| `--ease-arrive` | `cubic-bezier(0.16, 1, 0.3, 1)` | Fast in, dead stop. Wipes, the sleeve pull. |
| `--ease-lift` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | A shutter going up. |
| `--ease-drop` | `cubic-bezier(0.55, 0, 1, 0.45)` | Gravity. No bounce, no overshoot. |
| `--ease-cut` | `steps(1, end)` | Labels and verdict words: on or off. |
| `--ease-tick` | `steps(12, end)` | Counters. |

Signature moves:

- **Block reveal (how display lines enter).** A Lampblack bar grows across the measure in a sixteenth, then its left edge retreats in an eighth and leaves the line behind. Successive lines start on the swung off-beat (0.333 s into each beat), so a stack arrives with a lilt instead of a drum roll.
- **Cut (how labels and verdicts enter).** One frame, on the grid. Small type never animates.
- **Voice wipe.** Fraunces lines wipe left to right in 333 ms.
- **Counters.** Twelve sixteenth-note ticks over 1.5 s in tabular figures, value interpolated along `--ease-arrive` so the last ticks are small, the final value cut in exactly on a downbeat, the unit arriving with it. Numbers tick; they never blur.
- **The sleeve pull (slide transition).** The spine widens to cover the stage, the slide number changes, the spine retreats to 88 px with `--ease-arrive`. `motion.html` opens with the retreat.
- **A gate opens.** The shutter lifts over one beat with `--ease-lift`. PASS cuts in one sixteenth before it stops. Three gates open on three consecutive beats: one, two, three.
- **A gate shuts.** The shutter falls for three sixteenths with `--ease-drop` and stops dead.
- **How NO lands.** NO is printed on the shutter and never animates on its own: the word arrives with the weight of the block. On impact the rest of the slide recoils 14 px and settles inside 375 ms, and the slide prints in negative (Card and Lampblack swap, Flare stays) for a stop-time hold. Everything else is frozen during the hold. Then it cuts back to positive and the fine print cuts in. In the title the hold is 1.19 s; in the deck it is two beats, and never longer than a bar.
- **Charts.** Bars grow from the axis in rank order on swung beats, each value cutting in when its bar stops. The Flare row waits one full beat of nothing, then arrives. On the warehouse map both routes are drawn at the same speed in px per second, so the audience watches the old route take 1.65 times as long.

`motion.html` is the 8 second study: sleeve pull, title stack, four gates rise shut, three open, the fourth tries and cannot, the slab drops, negative hold, fine print. It is a pure function of time: `window.__setTime(seconds)` renders any frame, the same frame every time (checked by re-rendering out of order and comparing bytes), and its last frame is pixel-identical to `f1.png`. Opened normally it plays in real time, scales to the window, and loops after a pause. Space or R replays.

## The gate motif

A gate is a loading-dock door seen from the front: two posts and a lintel (8 px Lampblack), a floor line, and a shutter that hangs 8 px inside the frame.

| State | Drawing | Word |
|---|---|---|
| **PASS** | Shutter raised to the top fifth of the bay. Lampblack. A pull tab on its bottom edge. The opening below is empty Card holding the gate number, name and question, with a through-arrow at floor level. | PASS, Card on Lampblack, 118 px, on the shutter. |
| **NO** | Shutter all the way down, and 72 px through the floor line to the edge of the stage. Flare. The gate's own text prints on the shutter. | NO, Lampblack on Flare, 340 px, at the bottom of the shutter. |
| **Not yet** | Frame only. | none |

- The word rides on the shutter, so PASS sits high and NO sits low. Four gates in a row read as a bar of music with one beat dropped. That is the syncopation the seed asked for, and it carries meaning.
- State is never colour alone. It is the position of the shutter, the word, and then the ink.
- **The tracker.** The same four gates sit at the foot of the spine on every slide at 13 x 40 px each: outline for not yet, a filled top for PASS, solid Flare for NO, solid for the gate being discussed. f3 prints the legend once.
- At title scale the slab that carries the NO is the fourth gate shutting. `motion.html` shows it happening.

## Charts and the warehouse map

**Bars (f4).** Horizontal, Lampblack on Card, linear, zero-based, drawn to scale and labelled as such. One 6 px axis line. No gridlines, no legend, no per-series colours: names sit at the left in body type, values sit at the end of the bar in 96 px display numerals. The largest bar may run off the edge of the stage. Small bars are never inflated: $45 against $15,000 is a 4 px sliver, and that sliver is the chart. The multiple (333x) is set as a counter in the empty corner the small bars leave. The row that matters gets a full-bleed Flare band, and when its value is zero there is no bar, and the slide says so.

**Dot plots.** One 6 px rail per row, 28 px Lampblack dots, values in display numerals at the right. The dot that matters is Flare with a 4 px Lampblack ring, because Flare alone on Card is not enough contrast.

**Scatter plots.** Two 6 px axes meeting at the origin, at most three ticks each, no grid. Points are 24 px. Categories are told apart by solid, hollow and ringed marks before any ink is spent. The boring winner is the one Flare point (ringed), labelled directly. Quadrant names in wide caps.

**Counters (f5).** 300 px tabular numerals, unit lowercase beside them, a wide caps label above, and a small chip showing the line style that the number refers to on the chart. Before and after are set at the same size: the comparison is in the numbers, not the typography.

**Warehouse map (f5).** Drawn as a halftone on a Lampblack field. Twelve aisles, 480 bins, every bin a dot. Dot size is pick velocity (5.6, 13 and 23 px), and only the fastest tier takes Flare, so the encoding survives a washed-out projector and colour-blind eyes. Hollow Flare rings mark where fast movers used to live. Racks and the wall are 2 to 3 px Rack outlines. Routes run on aisle centre lines with mitred corners: before is Card, dashed, 4 px; after is Flare, solid, 8 px. The two routes are drawn to scale: 3116 px against 1884 px is 1.654, and 11.4 km against 6.9 km is 1.652. The map is inline SVG generated by `buildWarehouse()` from a seeded generator, so it is identical on every run, and the same geometry ports straight to canvas for the animated version. The slide is tagged "Illustrative model" in a Card label on the map itself.

## Layout system

- Stage 1920 x 1080. Spine 0 to 88: slide number, running title, tracker. The spine is Lampblack on Card slides and Card on Lampblack slides.
- Content starts at x 128. Right margin 56. Headline cap top at y 60. Kicker labels at y 64.
- Fields meet on hard verticals and horizontals. One field per slide may bleed off the stage: the slab on f1, the NO gate on f3, the $15,000 bar and the band on f4.
- Five archetypes cover the 38 slides: title (stack plus slab), statement (stack on Lampblack plus a Card note), gates (the dock), chart (headline, chart, Flare band), and scene (Lampblack field plus a counter column).
- Radii are zero. Shadows are none. The only circles are halftone dots.

## Do

- Set display type tight, flush on both edges, and as large as the measure allows.
- Spend Flare once per slide, on the point.
- Draw to scale and say so on the slide.
- Let one block break the frame.
- Leave card stock empty. The rest between notes is part of the tune.
- Put the unit, the source and the word "illustrative" on the slide, at 24 px or larger.

## Don't

- No gradients, glows, blurs, glass, drop shadows, rounded cards or icons.
- No Flare text on Card, and no Flare hairlines on Card.
- No tints or opacity to rank things. No third ink.
- No fades or eases that overshoot. No motion on small type.
- No justified stack with a line more than twice the length of another. Rewrite the line.
- No stretching or squashing type. Width comes from the font's own axis.
- No log scales and no inflated minimum bars.
- No photography, logos, robots, brains or sparkles. The only pictures are type, blocks, dots and lines.

## Risks

- **Flare sits exactly on the 7 : 1 line (7.10).** It cannot be made redder without failing the brief, so NO is a hot coral-vermilion rather than a fire-engine red. Cheap projectors also push this hue toward pink or orange. Check it in the room; the hue can drift without hurting legibility because the type on it is always Lampblack.
- **Flare on Card is 2.46 : 1.** The rule "shape only on Card" has to be enforced in the slide kit, not left to taste.
- **Large Lampblack fields with the lights on.** A projector's black lifts to grey. Card on Lampblack keeps plenty of contrast, but f2 and f5 will look softer in the room than in the PNG. Card is the default ground for that reason.
- **Orange and black two weeks after Halloween.** The cream stock, the coral lean of Flare and the italic voice pull it toward print, but the association is there.
- **The stacks depend on a script and on the fonts loading.** `fitStack()` is small and deterministic, but if Archivo fails to load the fallback will not justify well. Bake the fitted widths into the title video.
- **Stacks constrain the copy.** Lines must be of similar length. Most headlines in a 38-slide deck will be single lines at 150 px, with stacks kept for the five or six statements that deserve them.
- **Gate names top out at 96 px** because POTENTIAL has nine letters and a bay is 456 px wide. PASS and NO are louder than the names by design, but it is a ceiling.
- **The negative hold is a full-field inversion.** Use it for a real NO, a few times in 90 minutes, and never shorter than two beats, so it reads as a held chord and not a flash.
- **Three colours limit busy charts.** More than two series means pattern and shape, or splitting the chart. For this talk that is a feature; for a dense appendix it is work.
- **It is loud.** Five heavy frames in a row are a lot of black type. The full deck needs quiet slides between them: one line on card stock.
- **The credit lines on the title are 34 px condensed,** below the 36 px body floor. They are treated as labels. Everything else on stage is 36 px or larger for running text and 24 px or larger for labels.
