# Master brief: "The Most Valuable AI Skill Is Saying No"

This is the single source of truth for everything built in this repo. If a later instruction conflicts with this file, this file wins unless the instruction says it overrides the brief.

## 1. The session

| | |
|---|---|
| Title | **The Most Valuable AI Skill Is Saying No** |
| Subtitle | Screening AI use cases for real return. |
| Speaker | Dustin T Hughes, VP of Technology, Laborde Products |
| Event | NOAI 2026 (New Orleans Arts & Ideas fest), Education Center, New Orleans Jazz Museum, 400 Esplanade Ave |
| When | Friday, Nov 13, 2026, 2:30–4:00 PM (90 minutes) |
| Format | Workshop. Audience: business owners, executives, managers. Not engineers. |
| Hands-on | Attendees work on a paper worksheet (and optionally the screener tool). The speaker does the one live build. |

Published abstract (the promise we must keep):

> Your best AI idea is probably wrong. The boring one you didn't pitch is probably worth thousands.
>
> This is a 90 minute sorting exercise for people done with demos. You'll inventory two weeks of your real work, push three candidates through a four-gate screen, and let the math pick, not the hype. Then you build the winner right there and watch the minutes come back.
>
> Most sessions promise what AI can do. This one shows you what yours should.

## 2. Facts we are allowed to state

Only the facts in this section may be stated about the speaker, his company and the project. Do not add to them.

### The speaker (from his published bio)
- Dustin Hughes is VP of Technology at Laborde Products, a marine diesel distributor.
- He leads a small technology team supporting 95 people across three locations.
- The company has both a product side (parts, inventory) and a service side (service techs).
- He leads **Waypoint**, Laborde's company-wide AI program. Its standard: *a win only counts with the task, the prompt, the output, and the time saved.*
- He has been building software for 25 years and working with AI since 2013.

### The winning project: warehouse slotting (from the project's own records, Oct 2026)
The speaker approved showing **results and counts only**. See the confidentiality rule in section 3.

- **The job:** Laborde is moving a small-parts pick operation into a new, larger building. Every part needs a new shelf address. The tool decides which part goes in which slot so pickers walk and climb less.
- **Scale:** 6,493 parts (SKUs). 7,110 usable shelf slots. 239,711 order lines of history going back to 2010. 1,983 orders in the last 12 months.
- **The comparison:** "as-is move" = carry every part across in its current order, with no re-slotting.
- **Results at the chosen pack station (runs of Oct 27–28, 2026):**

| Measure | As-is move | Optimized | Change |
|---|---|---|---|
| Walk per pick run | 133.6 ft | 91.1 ft | 31.8% less |
| Pick time per year | 32.8 hours | 17.4 hours | 47.0% less |
| Picks that need a ladder | 23% | 0.6% | |
| Fast movers at waist-to-shoulder height ("golden zone") | 39% | 100% | |
| Medium movers kept off the ladder | 75% | 100% | |

- **Versus the old building today** (its floor plan is estimated): 12.3% less walking and 22.7% less pick time, in a bigger building. Old building: 103.9 ft per run, 22.5 pick hours a year, 9% ladder picks.
- **Caveats the project itself states** (show them): pick times are placeholders until a floor time study is done; the old building's floor is estimated; results depend on where the pack station is.
- **The honest number:** saved pick time is 32.8 − 17.4 = **15.4 hours a year**. The project's own notes say total walking is "only on the order of tens of hours per year" at about 2,000 orders a year, and that "the move into the new building is the one free re-slot, since every SKU moves anyway".
- **Seven attempts** (improvement in walking versus the old building, March 2026 model; negative = worse than doing nothing):

| Attempt | Method, in plain words | Result |
|---|---|---|
| 1 | Genetic algorithm (evolve layouts) | −8.8% |
| 2 | Assignment math (match parts to slots one by one) | −27.2%, retired |
| 3 | Exact optimizer (mixed-integer programming) | −34.4%, retired |
| 4 | Add "parts ordered together" and annealing | +3.5% |
| 5 | Score layouts by replaying real orders | +7.9% |
| 6 | Mine frequent order patterns, weight recent orders | +11% |
| 7 | Ten different starting points, keep the best | +16.4% |

  The project's conclusion: the gains came from measuring against real orders and searching more widely, "not from switching solvers".
- **Rigor moments** (all from the project's experiment log): the team corrected its own headline from +13.1% to +11.0% after finding physically impossible placements; it tightened the comparison from 5,458 partly-matched orders to 373 fully-matched ones; one measuring method showed +26.1% and another +15% for the same layout, and it reported the conservative one; a bug once produced a "220.7% improvement", which it called nonsense and fixed.
- **What the project said no to:** a hosted AI model for the core problem (it "does not fit"; plain rules do the job with no data leaving the building); two fancier solvers (attempts 2 and 3, both worse); re-slotting on a schedule ("periodic full re-slots are hard to justify"); a "$500,000/year" savings figure found online with no primary source ("excluded as unverified").
- **How AI was used:** 47 commits between March 25 and November 4, 2026; 33 of them carry an AI coding assistant as co-author. About 22,000 lines of Python, 2,150 lines of UI code and 88 automated tests. **No AI model runs when the tool runs:** it is plain math (a genetic algorithm, assignment math and simulated annealing).
- **What a run costs:** one optimization is 10 starts × 1,000,000 annealing steps = 10 million candidate swaps, in about 3.5 minutes on a 10-core machine.
- **What it produces besides the layout:** a move list for every part, a floor map, rack-end signs, printable bin labels with barcodes, and a location file ready to import into the business system.

We do **not** know the project's dollar return, build hours or business case beyond the above. The speaker says there is a bigger return than the walking minutes and will supply it; until then those values are marked slots in `deck/content/your-numbers.js` (`YOUR.slotting.biggerReturn`, `YOUR.slotting.effort`) and render as visibly unfilled. Never invent them. Where the real story belongs the speaker notes say `YOUR STORY:`.

## 3. Honesty rules (non-negotiable)

1. Every number on screen is one of: (a) taken from `data/benchlm-leaderboard.csv`, (b) computed by code in this repo from assumptions shown on screen, or (c) a fact from section 2.
2. Anything computed from made-up inputs carries a visible **"Example"** or **"synthetic data"** label.
3. No statistics, studies, survey results or quotes from memory. The only quotations allowed are the Shannon lines in section 6.
4. No logos or brand marks. Model names appear only as data, with the source line.
5. No claims about what Laborde did, saved or earned beyond section 2.
6. The benchmark file itself warns that rank order is not statistically certain and marks 17 of its 50 rows "estimated". Talk in price tiers, not exact ranks. Show the "estimated" flag where a model's score is shown.
7. **Confidentiality.** From the Laborde project show results and counts only. Never show or commit: brand or vendor names, names of business systems, databases or software libraries, server or host names, people's names other than the speaker, building or location names, door or aisle names, real floor drawings or dimensions, part numbers, or any company data. Say "the old building", "the new building", "the chosen pack station", "the business system", "an AI coding assistant". Do not copy text, code or data from the project repository into this one.
8. The animated warehouse is a **re-creation on synthetic data**. It is always labeled "Animated re-creation · synthetic data". Its numbers are never presented as Laborde's; the real results are shown separately and labeled "Laborde results, Oct 2026".

## 4. The framework

**Inventory** two weeks of real work → **pick 3 candidates** → **screen through 4 gates** → **let the math pick** → **build the winner** → **decide who owns the minutes**.

Minutes saved is the raw material. It becomes money two ways:

- **Product / distribution lens → cash conversion cycle.** CCC = days of inventory + days to collect − days to pay (DIO + DSO − DPO). Minutes saved on the cash path (quote → order → pick → ship → invoice → collect; receive → stock → reorder) pull cash in sooner.
- **Service lens → capacity.** Time is money. Freed hours become more jobs and more billable hours with the same people.

Either way, minutes also count as plain labor ROI.

### The four gates

| # | Gate | The question | Measured as |
|---|---|---|---|
| 1 | **COST** | What does it cost to run? | Price per run × volume (BenchLM prices) + tools and licences |
| 2 | **RETURN** | What comes back: cash sooner, or more work done? | Minutes saved → labor value, plus cash-cycle days or capacity |
| 3 | **EFFORT** | What does it take to build it and keep it alive? | Build hours + upkeep hours + rollout |
| 4 | **POTENTIAL** | If it works, how far does it grow? | Projected growth: more volume, more teams, more sites. Needs an owner for the freed time |

### The math (implemented in `deck/lib/gates-core.js`; all defaults editable)

Inputs per candidate: `minutesPerRun`, `runsPerWeek`, `tier` (which tool runs it), `toolsPerMonth`, `buildHours`, `upkeepHoursPerMonth`, `rolloutHours`, `growth` (×, projected growth over the next year), `touchesCashPath` (bool), `daysOffCashCycle`, `lens` (`product` | `service`), `capacityConversion` (0–1, share of freed time that becomes paid work), `billableMarginPerHour`, `ownerNamed` (bool).

Shared assumptions (in `window.YOUR.rates`): `loadedHourly` = 30, `builderHourly` = 75, `workWeeks` = 50.

```
laborValue      = minutesPerRun × runsPerWeek × workWeeks × loadedHourly / 60
capacityValue   = (lens = service) ? hoursFreedPerYear × capacityConversion × billableMarginPerHour : 0
cashFreed       = (lens = product) ? daysOffCashCycle × annualRevenue / 365 : 0      (one-time working capital, shown separately, NOT added to yearly return)
RETURN / year   = (lens = service) ? max(laborValue, capacityValue) : laborValue
COST / year     = runsPerWeek × workWeeks × pricePerRun(tier) + toolsPerMonth × 12
EFFORT one-time = (buildHours + rolloutHours) × builderHourly
EFFORT / year   = upkeepHoursPerMonth × 12 × builderHourly
year1Net        = RETURN − COST − EFFORTone − EFFORTyear
paybackWeeks    = EFFORTone ÷ ((RETURN − COST − EFFORTyear) / 52)     (∞ if the denominator ≤ 0)
year2RunRate    = (RETURN − COST) × growth − EFFORTyear
twoYearValue    = year1Net + year2RunRate          ← "the math picks" ranks by this
```

Service lens: return is the larger of labor value and capacity value so the same hours are never counted twice.

Rule of thumb for the worksheet (derived, exact at the default rate): **one minute saved per week is worth $25 a year** (1 min × 50 weeks × $30/60). At $60/hour it is $50.

Cash rule of thumb: **one day off the cash cycle frees about one day of sales** (annual revenue ÷ 365). This is the standard working-capital approximation; label it "≈".

Gate verdicts use **house rules** (defaults; the speaker and attendees can change them, and the UI must say so):

- COST says **NO** when yearly cost is more than 30% of yearly return.
- RETURN says **NO** when yearly return is under $5,000 and the task takes no days off the cash cycle. Touching the cash path is not enough: the exemption needs cash to arrive sooner (`daysOffCashCycle` above zero).
- EFFORT says **NO** when payback is longer than 26 weeks.
- POTENTIAL says **NO** when growth is below 1× or nobody owns the freed time.

A candidate with any NO is out. Among the survivors, highest `twoYearValue` wins.

### Tiers (price per run), computed from the BenchLM file

Assumed task size is shown on screen and editable: default 2,000 tokens in, 500 tokens out ("about a page and a half read, a few paragraphs written").

`pricePerRun = (tokensIn × inputPrice + tokensOut × outputPrice) / 1,000,000` (prices are USD per million tokens).

| Tier | Representative model in the file | Per run | Per 1,000 | Per 100,000 |
|---|---|---|---|---|
| Plain code / spreadsheet | (no model) | ≈ $0 | ≈ $0 | ≈ $0 |
| Small model | Claude Haiku 5.5 (0.10 / 0.50) | $0.00045 | $0.45 | $45 |
| Mid model | Gemini 4 Carbon (2 / 10) | $0.009 | $9 | $900 |
| Frontier model | Claude Fable 5.2 (8 / 40) | $0.036 | $36 | $3,600 |
| Premium "pro" model | GPT-5.5 Pro (30 / 180) | $0.15 | $150 | $15,000 |

Verified findings from the file (recompute in code; do not hard-code):

- 50 models; 41 have usable prices; 5 are blank; 4 are listed at $0 (open-weight models you would host yourself, which is not free). Exclude both groups from price math and say so.
- Cheapest to dearest per run: $0.00045 to $0.15, a **333×** spread.
- **36 of the 41** priced models are outscored by something that costs the same or less (31 by something strictly cheaper, 5 by something at the same price). Only 5 are on the efficient frontier: Claude Haiku 5.5, Gemini 3.8 Flash, GPT-6.1 Terra, Gemini 4 Carbon, Claude Fable 5.2.
- Haiku 5.5 → Gemini 4 Carbon: 20× the price buys about 22 points of overall score. Carbon → Fable 5.2: another 4× buys 3.5 points.
- At $30/hour, the dearest model pays for one run if it saves **18 seconds**. Fable 5.2: 4.3 seconds. Haiku 5.5: 0.05 seconds.

The two lessons of the cost gate:

1. **People-scale volume:** cost rarely says no. Effort and return decide.
2. **Record-scale volume:** tool choice is the whole game, and plain code wins. "Use the expensive model once, to write the tool. Then the tool runs for free."

The ladder of tools (climb only as far as the task makes you): **Don't automate → Spreadsheet formula → Plain code → Small model → Frontier model → Agent**.

## 5. The winner: warehouse slotting

Slotting = deciding which shelf slot each part lives in. Fast movers stored far away or up a ladder cost time on every pick. Nobody pitches it.

Act 4 tells the real project's story (facts in section 2) and shows the method working in an animated re-creation.

### What the real project teaches (the spine of Act 4)
1. **The tool is plain math.** AI helped write it. No model runs when it runs. Run cost is effectively zero.
2. **On minutes alone it fails the gate.** 15.4 pick hours a year is $462 at $30 an hour (computed from the live rate). The speaker runs his own favourite through his own screen and says so out loud.
3. **The bigger return is elsewhere** (the speaker supplies it; marked slots). The move is the one free re-slot: every part moves anyway, so the choice was never "automate or not", it was "guess or calculate".
4. **Saying no happened four times inside the project** (a model in the loop, fancier solvers, scheduled re-slots, an unsourced savings claim).
5. **Rigor is unglamorous:** seven attempts, two went backwards, and the team marked its own number down.

### The re-creation (`deck/lib/slotting-core.js`, scene `warehouse`)
A seeded, deterministic miniature of the same method on synthetic data. It runs in the browser and from the command line (`node demo/slotting/run.js`) with identical numbers. It must not reproduce the real building: use its own generic dimensions and names.

Default synthetic warehouse (in `window.YOUR.slotting.sim`, all editable):
- Two blocks of racks (front and back) with a centre cross-aisle between them; 12 aisles per block; a pack station at one side door. Each rack face has bays, each bay has 6 shelf levels: level 1 is the floor (bend), levels 2–3 are the golden zone, level 4 is a reach, levels 5–6 need a ladder.
- About 1,500 synthetic parts. Pick velocity follows a long tail (a few parts picked constantly, most rarely). Parts are classed A (fast), B, C by cumulative share of picks.
- A year of synthetic orders (about 2,000 orders, 1–8 lines each, sampled by velocity, with some parts tending to be ordered together).
- Pick-time model: walking at 3 ft per second, extra seconds for floor and reach levels, and one ladder setup per ladder bay per order.
- **As-is move:** parts are placed in an order unrelated to velocity and fill every level, ladder levels included.
- **Optimizer:** start from "fast movers nearest the pack station on golden shelves", then improve by **simulated annealing**: propose a swap of two parts, replay a sample of real orders, keep the swap if pick time drops (and sometimes when it does not, less often as it cools). The annealing runs live in the browser in a few seconds with a visible falling cost curve.
- Route per order: start at the pack station, visit picks by nearest neighbour, return.

Outputs, before and after: feet walked per pick run, pick hours per year, share of picks needing a ladder, share of fast movers in the golden zone, number of swaps tried, and run time in milliseconds.

No fudging: the result is whatever the model computes. The scene labels it "Animated re-creation · synthetic data".

## 6. Shannon's *The Bandwagon*

The fest organizer assigned Claude Shannon's one-page editorial "The Bandwagon" (IRE Transactions on Information Theory, 1956, page 3) as required reading, with the prompt: replace "information theory" with "AI". Use it as the opening hook and the closing callback.

Every line below was checked word for word against a scan of the original page. Use them exactly, keep each quotation to one sentence, and always attribute: "Claude Shannon, The Bandwagon, 1956".

1. "Information theory has, in the last few years, become something of a scientific bandwagon."
2. "As a consequence, it has perhaps been ballooned to an importance beyond its actual accomplishments."
3. "Seldom do more than a few of nature's secrets give way at one time."
4. "The subject of information theory has certainly been sold, if not oversold."
5. "A few first rate research papers are preferable to a large number that are poorly conceived or half-finished."

Do not quote anything else from the essay, and do not reproduce it at length.

The word-swap must be visibly presented as our edit of his sentence, not as something Shannon wrote: the original words are struck through on screen and the replacement is written in a different hand or colour, with a small "our edit" mark. Planned swaps: line 1, "Information theory" → "AI" (opening). Line 5, "research papers" → "AI projects" (closing).

## 7. Run of show

| Clock | Min | Act | What happens |
|---|---|---|---|
| before | | 0 Walk-in | Looping title card. "Take a worksheet and a pen." |
| 2:30 | 0–10 | 1 The Bandwagon | Hook. Shannon. Who's talking. The promise. |
| 2:40 | 10–25 | 2 The Four Gates | Minutes → money. Cost (BenchLM). Return (cash cycle, capacity). Effort. Potential. How the math picks. |
| 2:55 | 25–45 | 3 Your Turn (part 1) | Exercise 1: inventory two weeks (10 min). Exercise 2: pick three (5 min). Worked example (5 min). |
| 3:15 | 45–60 | 3 Your Turn (part 2) | Exercise 3: screen your three (10 min). Share-out (5 min). |
| 3:30 | 60–79 | 4 Build the Winner | The real slotting project: the problem, the live re-creation, the real numbers, seven attempts, what we said no to, what it costs, the scorecard. |
| 3:49 | 79–90 | 5 Who Owns the Minutes? | Freed time is a management decision. Share the gain. Close. Four minutes of Q&A. |

## 8. Slides

Voice: plain, dry, practitioner. Short sentences. No hype words. One idea per slide. Big type. On-screen copy below is final unless marked (visual). Slide authors write full speaker notes in Dustin's first-person voice from the "Notes" gist: what to say, the transition line, and the planned time. Notes never invent stories; where a real story belongs write `YOUR STORY: <what to tell>`.

Slide ids are stable. Order is as listed.

### Act 0: Walk-in
- **walk-in** — Looping ambient title card: title, subtitle, "Take a worksheet and a pen", "Starts 2:30". Seamless loop, runs until advanced. Notes: nothing to say.

### Act 1: The Bandwagon (0–10)
- **cold-open** — Step 1: "Your best AI idea is probably wrong." Step 2: "The boring one you didn't pitch is probably worth thousands." Notes: let line one sit; then line two.
- **title** — Title, subtitle, "Dustin T Hughes · VP of Technology, Laborde Products", "NOAI 2026". Notes: 20 seconds, name and what the room is here to do.
- **bandwagon** — Step 1: the Shannon sentence, attributed. Step 2: "Information theory" is struck through and "AI" is written in (clearly our edit). Step 3: "Seldom do more than a few of nature's secrets give way at one time." Kicker: "1956." Notes: the organizer's assigned reading; Shannon founded the field and still warned it was oversold; the swap; the lesson is pick the few that give way.
- **whos-talking** — "I say no for a living." Facts as big figures: 95 people · 3 locations · 25 years building software · AI since 2013. Then the Waypoint standard as four stamps/boxes: THE TASK · THE PROMPT · THE OUTPUT · THE TIME SAVED. Line: "A win only counts with all four." Notes: both a product business and a service business under one roof; `YOUR STORY: one Waypoint win and one thing you turned down`.
- **exciting-vs-valuable** — (visual) scatter with axes "How exciting it sounds" × "What it returns". Pitched ideas cluster at exciting/low-return; one dull dot sits high on return. Label: "Illustration, not data". Line: "Excitement is not a business case." Notes: why the best-sounding idea usually loses.
- **the-promise** — "In the next 90 minutes" then five beats as a path: Inventory two weeks of real work → Pick three → Four gates → The math picks → Watch one get built. (The room does not build anything itself, so the deck does not say it will.) Footer: "You leave with one use case worth doing, and two you can stop thinking about." Notes: set expectations; worksheet in hand.

### Act 2: The Four Gates (10–25)
- **four-gates** — The gate motif assembles: COST · RETURN · EFFORT · POTENTIAL, each with its question. Notes: any NO ends it; that is the skill.
- **minutes-to-money** — (visual) "Minutes saved" flows into two channels: "ROI" and "Cash conversion cycle / Capacity". Line: "Minutes are the raw material. Money is what they turn into." Notes: Waypoint counts minutes; execs count cash.
- **gate-cost** — Kicker "Gate 1 · Cost". Headline: "What does it cost to run?" (visual, data) price ladder: every priced model as a dot on a log scale of cost per task, with the 333× spread called out. Assumption line and source line. Notes: where the prices come from; you look this up before you start, not after.
- **cost-people-scale** — Headline: "For one person, cost almost never says no." Big number: "18 seconds" with "what the dearest model has to save to pay for itself, at $30 an hour" (live-editable rate). Notes: at people scale, effort and return decide.
- **cost-record-scale** — Headline: "100,000 records. Same task." (scene `cost-showdown`) bars for the five tiers, volume control from 1 to 1,000,000, "Plain code ≈ $0" as the punchline. Step: score-vs-price scatter with the 5-model frontier and "36 of 41 are beaten by something that costs the same or less". Notes: this is where an LLM alone stops being the cheapest answer.
- **tool-ladder** — "Climb only as far as the task makes you." Ladder: Don't automate → Spreadsheet formula → Plain code → Small model → Frontier model → Agent. Line: "Use the expensive model once, to write the tool. Then the tool runs for free." Notes: the cheapest right tool.
- **gate-return-cash** — Kicker "Gate 2 · Return · product side". Headline: "Does cash come in sooner?" (visual) the cash conversion cycle as a timeline: days of inventory + days to collect − days to pay; one bar shrinks. Line: "One day off the cycle frees about one day of sales." Example figure computed from `YOUR.company.annualRevenue` with the label "Example: a $20M distributor ≈ $54,800 per day". Notes: the CFO's language; inventory, invoicing, collections.
- **gate-return-capacity** — Kicker "Gate 2 · Return · service side". Headline: "Time is money. Literally." (visual) freed hours turn into extra jobs with the same crew; a control "How much of the freed time becomes paid work?" from 0% to 100% drives the dollar figure; at 0% the figure is $0. Notes: more time + more work done = more money; plant the question that returns in Act 5.
- **cash-path** — Headline: "Does it touch the cash path?" Two columns, same 20 minutes saved: "Invoicing" (counts twice: labor and cash sooner) vs "Internal memos" (counts once, maybe). Line: "The boring idea on the cash path beats the exciting one off it." Notes: the one question to ask.
- **gate-effort** — Kicker "Gate 3 · Effort". Headline: "The demo is the cheap part." (visual) build / roll out / keep alive, with "keep alive" as the part that never ends. No percentages. Notes: maintenance, training, the person who leaves.
- **gate-potential** — Kicker "Gate 4 · Potential". Headline: "If it works, how far does it grow?" (visual) one site → three sites, one team → every team; growth multiplies return but not build effort. Check line: "Who owns the freed time?" Notes: projected growth; no owner, no growth.
- **the-math** — Headline: "Let the math pick." The scorecard formula in plain words: Return − Cost − Effort, then grown by Potential. The $25 rule: "A minute a week is $25 a year." (at $30/hour, shown). "House rules" listed as editable. Notes: the worksheet does this for you.

### Act 3: Your Turn (25–60)
- **ex-inventory** — "Exercise 1 · 10 minutes". "Inventory two weeks of real work." Prompts: What did you do more than twice? What did you copy from one place to another? What did you wait on? What did you dread? (scene `timer`, 10:00). Notes: walk the room; boring is good.
- **ex-pick-three** — "Exercise 2 · 5 minutes". "Pick three." One you'd love to pitch · One that's boring · One you'd be embarrassed to bring up. (timer 5:00). Notes: the embarrassing one is often the winner.
- **worked-example** — "Three candidates, four gates." (scene `screener` in read-only "walkthrough" mode, or an equivalent animated table) Example candidates from `YOUR.candidates` go through the gates one at a time: the exciting customer chatbot hits NO at Effort (it never pays back), the meeting-notes tool hits NO at Cost (the licence eats more than 30% of the return), and the boring one, invoice follow-up reminders, passes all four (payback about 15 weeks, about $17,500 over two years, about $109,600 of cash freed at the example revenue). Label "Example candidates". All figures come from `Gates.evaluate`. Notes: narrate each NO; `YOUR STORY: swap in your real three if you have them`.
- **ex-screen** — "Exercise 3 · 10 minutes". "Run your three through the gates." Four prompts, one per gate (timer 10:00). If `YOUR.links.screenerUrl` is set, show a QR code to the screener. Notes: take a volunteer's three and do them on screen with the screener.
- **share-out** — "Who killed their favorite?" Second line: "Who's keeping the boring one?" Notes: three hands, 5 minutes.

### Act 4: Build the Winner (60–80)
- **the-winner** — Headline "The winner: where the parts live." when the speaker has supplied `YOUR.slotting.biggerReturn`; while it is empty the headline is "The one we built: where the parts live." (on minutes alone it does not win, so the deck does not call it the winner). Sub: "Warehouse slotting. Nobody pitches this." Then: "6,493 parts were moving to a new building. Every one needed an address." Notes: `YOUR STORY: how slotting came up`.
- **slotting-problem** — Headline: "6,493 parts. 7,110 slots." (visual) a rack seen from the side with its shelf levels: floor, golden zone, reach, ladder. Step: "Move them across in their current order and 23% of picks need a ladder." Source line: "Laborde results, Oct 2026". Notes: what an as-is move is; why taller racks make it worse.
- **slotting-live** — (scene `warehouse`, the centerpiece, multi-step; label "Animated re-creation · synthetic data") 1 the warehouse draws itself: two blocks of racks, cross-aisle, pack station, plus a side view of the shelf levels; 2 a year of orders rains in and slots heat up by pick velocity (hot parts are scattered and up high); 3 the as-is move: pickers walk a day of orders, trails accumulate, ladder climbs flash, counters run; 4 the optimizer runs live: swaps flicker across the racks, a cost curve falls, hot parts migrate to golden shelves near the pack station, a counter shows swaps tried; 5 the same orders are walked again; 6 before/after counters land for the synthetic model (feet per run, pick hours per year, ladder picks, fast movers in the golden zone); 7 "N swaps tried in N ms. No AI model in the loop." Notes: narrate each step; say plainly this is a re-creation and the real numbers are next.
- **slotting-results** — Headline: "The real numbers." (visual, data) four before/after pairs that animate from as-is to optimized: Walk per pick run 133.6 → 91.1 ft (31.8% less); Pick time per year 32.8 → 17.4 hours (47.0% less); Picks that need a ladder 23% → 0.6%; Fast movers in the golden zone 39% → 100%. Step: "Versus the old building: 12.3% less walking, 22.7% less pick time. In a bigger building." Source line: "Laborde results, Oct 27–28, 2026 · versus moving every part in its current order · pick times are placeholders pending a floor time study". Notes: read the caveats aloud.
- **seven-attempts** — Headline: "Seven attempts. The first three lost to the old building." (visual, data) seven bars rising from a zero line in order: −8.8%, −27.2%, −34.4%, +3.5%, +7.9%, +11%, +16.4%, with plain-word method labels from section 2 and "retired" on attempts 2 and 3. Line: "The gains came from measuring real orders, not from fancier solvers." Step: the rigor moments as three short ticker lines (marked our own number down from 13.1% to 11.0%; one ruler said 26%, we reported 15%; a bug said 220%, we called it nonsense). Source line: "Walking versus the old building, March 2026 model". Notes: this is what the work actually looks like.
- **said-no** — Headline: "What we said no to." Four items, each landing with the NO motif: "An AI model in the loop" (it didn't fit the problem) · "A fancier solver" (tried two; both lost) · "Re-slotting every month" (the move is the one free re-slot) · "A $500,000-a-year savings claim" (no source; excluded). Notes: the title of the talk, inside one project.
- **slotting-cost** — Headline: "What it costs to run: nothing." Three facts as big figures: "33 of 47 commits co-written with an AI coding assistant" · "0 AI models running when it runs" · "10 million swaps tried in about 3.5 minutes". Step (computed with CostMath, assumption shown): "If each of those 10 million tries were a model call:" small-model tier, frontier tier and premium tier totals per run, against "plain code: the electricity". Line: "The model's job was to help write the tool. Not to be the tool." Notes: the cost gate on a real project; nobody would really call a model per swap, which is the point: wrong tool.
- **slotting-scorecard** — Headline: "My own project, through my own gates." The four gates in a row, run in order like any other candidate. COST: PASS, "$0 to run". RETURN on minutes alone: 15.4 hours a year = $462 (computed from `YOUR.rates.loadedHourly`) and no days off the cash cycle, so the gate says **NO**, as a real dropped shutter, not a footnote. By the deck's own rule EFFORT and POTENTIAL then read NOT YET. Under the NO: "The move was the one free re-slot." Next click, "The bigger return":
  - **While `YOUR.slotting.biggerReturn` is empty** nothing on stage shows a placeholder. The slide holds on the NO and that one line, and the notes give the speaker his words: on minutes alone my own project fails my own screen; every part was moving anyway, so the choice was never automate or not, it was guess or calculate; calculating took ladder picks from 23% to 0.6%. The notes also open with a plain "NOT FILLED IN" line so he knows before he walks on.
  - **Once it is filled** the bigger return lands in the RETURN bay beside the minutes NO, EFFORT and POTENTIAL show `YOUR.slotting.effort` and `.potential` (each simply absent if still unfilled), and the line "The minutes said no. The move said yes." appears.
  No figure is ever invented, and the deck never raises a PASS it cannot compute. Notes: `YOUR STORY: the bigger return`.
- **how-we-built-it** — "How we actually built it." Renders `YOUR.story.howWeBuiltIt` (a list the speaker edits). If the list is empty the slide is skipped. Notes: `YOUR STORY`.

### Act 5: Who Owns the Minutes? (80–90)
- **who-owns** — "We just got the minutes back." Step: "Who owns them?" Notes: pause.
- **the-objection** — Quote-style: "My people will just waste the time." Step: "That's a management answer. It isn't an AI problem." Notes: freed time is a management decision; the tool hands back minutes, leaders decide what they become.
- **share-the-gain** — "Share the gain." Three beats: Name the goal for the freed time · Measure it · Share the upside. Line: "People hide time savings that threaten them. They report the ones they share in." Notes: income, bonus or ownership stake tied to growth; people content with the status quo are not who you build around. This is the speaker's stance, stated as his view.
- **waypoint-standard** — The four Waypoint items return: THE TASK · THE PROMPT · THE OUTPUT · THE TIME SAVED. Line: "If you can't show all four, it didn't happen." Notes: proof, not vibes.
- **monday** — "Monday morning." 1 Inventory two weeks. 2 Run three through the gates. 3 Say no twice. Notes: the ask.
- **close** — Step 1: Shannon line 5 as written, attributed. Step 2: "research papers" is struck through and "AI projects" written in (our edit). Step 3: "Say no to the exciting. Say yes to the math." Notes: he said it in 1956; find the few.
- **thanks** — "Thank you." Name, role. If `YOUR.links.repoUrl` is set, show it (and a QR). "Questions." Notes: Q&A until 4:00.

## 9. Technical contract

### Hard rules
- Everything runs offline by double-clicking `deck/index.html` (file:// in Chrome, also Edge and Safari). **No ES modules, no `fetch`/XHR, no external URLs, no CDNs, no web fonts from the network.** Classic `<script src>` tags and relative CSS only. Data lives in `.js` files that assign to `window`.
- No frameworks. Hand-written HTML, CSS, SVG, canvas, JS. Target current Chrome; avoid features Safari lacks.
- Stage is 1920×1080, scaled to fit the window. Minimum sizes on that stage: running text 36px, labels that carry meaning 32px, source lines 28px. Text contrast at least 7:1.
- Never let one slide break the deck: the engine wraps slide and scene hooks in try/catch.
- Scenes stop their animation loops when their slide is not active.
- Do not use git. Do not touch files you do not own.

### Layout
```
deck/index.html              the deck; lists every script in order
deck/engine/deck.js|.css     engine: stage scaling, steps, keys, overview, presenter view, timer, print mode
deck/theme/tokens.css        design tokens + embedded fonts
deck/theme/components.css    slide kit (layouts, type, gate motif, badges, counters)
deck/lib/motion.js           clock, easings, tweens, timeline, counters, text splitting, seeded RNG
deck/lib/benchlm-data.js     window.BENCHLM (generated from the CSV by tools/build-data.js)
deck/lib/cost-math.js        window.CostMath
deck/lib/gates-core.js       window.Gates
deck/lib/slotting-core.js    window.Slotting (also loadable in Node)
deck/content/your-numbers.js window.YOUR: everything the speaker may edit
deck/scenes/*.js             hero scenes (warehouse, cost-showdown, screener, title, timer, ...)
deck/slides/act0.js … act5.js  slide definitions
screener/index.html          standalone four-gate screener (phone-friendly)
demo/slotting/run.js         command-line run of the slotting model
video/                       title scene page and rendered videos
handouts/                    worksheet (HTML + PDF)
docs/                        this brief, run-of-show, speaker notes
tools/                       build-data, shoot (screenshots), render-video, bundle, tests
dist/                        single-file builds
```

### Engine API (`deck/engine/deck.js`)
```js
Deck.slide({
  id: 'gate-cost',        // unique, from section 8
  act: 2,                 // 0–5
  title: 'Gate 1: Cost',  // overview + presenter view
  minutes: 2,             // planned duration, for pacing
  layout: 'chart',        // adds class "layout-chart" to the slide root
  html: `…`,              // markup; elements with data-step="n" appear from step n onward
  steps: 2,               // number of builds after the initial state (default: highest data-step)
  notes: `…`,             // speaker notes, plain text with blank-line paragraphs
  skip() { return false },// optional; true hides the slide
  enter(ctx) {},          // ctx = { el, step, deck }
  step(ctx, n, dir) {},   // n = current step, dir = +1 | -1
  exit(ctx) {},
});

Scenes.define('warehouse', function (host, opts, api) {
  // host: sized element; opts: parsed data-opts JSON; api: { token(name), motion, deck }
  return { step(n, dir) {}, destroy() {}, resize() {} };
});
// used in slide html as: <div class="scene" data-scene="warehouse" data-opts='{"…":1}'></div>
// the engine mounts scenes on enter, forwards step(), and destroys on exit.
```
Keys: → / Space / PageDown next; ← / PageUp back; Home / End; digits + Enter jump; O overview; S presenter view; F fullscreen; B blackout; T start/pause the on-slide timer. The current slide and step live in the URL hash, so a reload returns to the same place.

Test hooks: `window.__deck = { count(), ids(), stepsOf(i), goto(iOrId, step), current(), settle() }` where `settle()` resolves when entrance animations have finished. `?fast` runs all motion at 20× so screenshots settle quickly. `?print` lays out every slide in its final state for PDF export.

### Motion (`deck/lib/motion.js`)
All JS-driven animation reads time from `Motion.now()` so it can be frozen for frame-accurate video capture (`Motion.useManualClock()`, `Motion.setTime(seconds)`). CSS handles simple element builds.

### `window.YOUR` (`deck/content/your-numbers.js`)
The one file the speaker edits: `speaker`, `event`, `rates`, `company` (example revenue), `tokens`, `slotting` (`results`: the real figures from section 2; `biggerReturn`: a list of `{ label, value, note }` the speaker fills in; `effort`: `{ buildHours, upkeepHoursPerMonth }`; `potential`: `{ growth, note }`; `sim`: parameters of the synthetic re-creation), `candidates` (three example candidates), `houseRules`, `links` (`screenerUrl`, `repoUrl`), `story.howWeBuiltIt`. Unfilled speaker values are `null` and render as visible "YOUR NUMBER" slots. Heavily commented in plain language. Every example value is marked `EXAMPLE`.
