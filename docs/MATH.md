# The math behind the four gates

This page explains, in plain language, every number the talk computes: what goes in, what comes out, and where the benchmark figures come from. It is written for a business reader. No programming is needed to follow it.

The short version: **minutes saved are turned into dollars, the cost to run and the effort to build are subtracted, and four simple rules decide yes or no.** Nothing is estimated by feel. Everything on screen is either read from the benchmark file, or calculated from assumptions that are shown on screen and that you can change.

The code that does this lives in three small files:

| File | What it does |
|---|---|
| `deck/lib/cost-math.js` | What one AI task costs, from the benchmark price list |
| `deck/lib/gates-core.js` | The four gates: the formulas and the yes / no rules below |
| `deck/content/your-numbers.js` | Your rates, your example company, your three candidates, your house rules |

`node tools/test-libs.js` re-checks every figure on this page. If you change a number and want to know nothing else broke, run it.

---

## 1. What you tell it about a candidate

A "candidate" is one idea for using AI (or plain automation) on a real task.

| You enter | In plain words |
|---|---|
| Minutes per run | Minutes saved each time the task is done |
| Runs per week | How many times a week the task is done |
| Tier | What runs it: plain code or a spreadsheet, a small model, a mid model, a frontier model, or a premium "pro" model |
| Tools per month | Licences and subscriptions, in dollars a month |
| Build hours | Hours to build it, once |
| Rollout hours | Hours to train people and switch over, once |
| Upkeep hours per month | Hours a month to keep it working, for as long as it runs |
| Growth | How much bigger it gets over the next year. 1 means it stays the same size; 1.5 means half again |
| Touches the cash path | Yes if it sits on quote → order → pick → ship → invoice → collect, or receive → stock → reorder |
| Days off the cash cycle | How many days sooner the cash arrives |
| Lens | "Product" (cash comes in sooner) or "service" (freed hours become paid work) |
| Capacity conversion | Service lens only: the share of freed time that becomes paid work, from 0 to 1 |
| Billable margin per hour | Service lens only: dollars of margin on one extra billable hour |
| Owner named | Yes if a named person decides what the freed time becomes |

## 2. The shared assumptions

These apply to every candidate. They are shown on screen wherever they are used. All of them are example values, not Laborde figures.

| Assumption | Default | Meaning |
|---|---|---|
| Loaded hourly rate | $30 | What one hour of an employee's time costs the company |
| Builder hourly rate | $75 | What one hour of the person who builds and maintains the tool costs |
| Work weeks | 50 | Weeks a year the work actually happens |
| Annual revenue | $20,000,000 | An example distributor. Used only to turn "days off the cash cycle" into dollars |
| Task size | 2,000 tokens in, 500 out | About a page and a half read, and a few paragraphs written |

## 3. The formulas

**What comes back**

- **Labor value** = minutes per run × runs per week × work weeks × loaded hourly rate ÷ 60
- **Capacity value** (service lens only) = hours freed per year × capacity conversion × billable margin per hour
- **Return per year** = labor value. On the service lens it is the *larger* of labor value and capacity value, so the same hours are never counted twice.
- **Cash freed** (product lens only) = days off the cash cycle × annual revenue ÷ 365. This is a **one-time** release of working capital. It is shown on its own line and is **not** added to the yearly return or to the two-year value.

**What goes out**

- **Price per run** = (tokens in × input price + tokens out × output price) ÷ 1,000,000. Prices in the benchmark file are US dollars per million tokens. Plain code is $0 a run.
- **Cost per year** = runs per week × work weeks × price per run + tools per month × 12
- **Effort, one time** = (build hours + rollout hours) × builder hourly rate
- **Effort per year** = upkeep hours per month × 12 × builder hourly rate

**The bottom line**

- **Year 1 net** = return − cost − one-time effort − yearly effort
- **Payback, in weeks** = one-time effort ÷ ((return − cost − yearly effort) ÷ 52). If what is left over each year is zero or negative, the build is never paid back and the answer is "never".
- **Year 2 run rate** = (return − cost) × growth − yearly effort
- **Two-year value** = year 1 net + year 2 run rate. **This is the number "the math picks" by.**

Three things worth knowing about these formulas:

1. Growth multiplies the return and the running cost in year 2. It does not multiply the upkeep, and the build is paid for only once. That is why a boring tool that spreads to three sites beats an exciting one that stays put.
2. Payback is counted in calendar weeks (52), while the work is counted in working weeks (50 by default).
3. Minutes are valued at what the time costs the company. That value is only real if someone decides what the freed time becomes, which is exactly what the fourth gate checks.

### Two rules of thumb

- **One minute saved per week is worth $25 a year.** 1 minute × 50 weeks × $30 ÷ 60 = $25. At $60 an hour it is $50.
- **One day off the cash cycle frees about one day of sales.** Annual revenue ÷ 365. For the example $20M distributor that is $54,795, shown on the slide as "about $54,800". This is the standard working-capital approximation, which is why it always carries the word "about".

## 4. The four gates and the house rules

A candidate meets the gates in this order. Any NO and it is out.

| # | Gate | Says NO when | Default limit |
|---|---|---|---|
| 1 | **Cost** | A year of running costs is more than this share of a year of return | 30% |
| 2 | **Return** | The yearly return is under this amount *and* the task does not touch the cash path | $5,000 |
| 3 | **Effort** | Payback takes longer than this | 26 weeks |
| 4 | **Potential** | Growth is below this, *or* nobody owns the freed time | 1× |

Among the candidates that pass all four, the highest two-year value wins.

A value that lands exactly on a limit passes. Cost at exactly 30% passes; a return of exactly $5,000 passes; payback of exactly 26 weeks passes; growth of exactly 1× passes.

### How to change the house rules

They are called house rules because they are yours to set. They are judgement calls, not laws.

1. Open `deck/content/your-numbers.js` in any text editor.
2. Find the section headed **HOUSE RULES**.
3. Change the number to the right of the colon. For example, to allow up to a year for payback, change `maxPaybackWeeks: 26` to `maxPaybackWeeks: 52`. To make the cost gate stricter, change `costMaxShareOfReturn: 0.30` to `0.20` (that is, 20%).
4. Save the file and reload the deck. Every verdict, and the wording of every rule on screen, follows the new numbers.

The rates, the example revenue and the task size are changed the same way, in the sections above the house rules in the same file.

## 5. A fully worked example: invoice follow-up reminders

This is example candidate C, "the boring one". Every input is made up for illustration.

**The inputs:** it saves 6 minutes each time, 60 times a week. It runs on a small model, with no licences to buy. It takes 24 hours to build and 6 hours to roll out, then 1.5 hours a month to keep alive. It is expected to grow by half over the next year (1.5×). It sits on the cash path and is expected to bring cash in 2 days sooner. Someone owns the freed time.

**Step 1. Price per run.** The small tier is represented by Claude Haiku 5.5, listed at $0.10 per million tokens in and $0.50 per million tokens out.

> (2,000 × 0.10 + 500 × 0.50) ÷ 1,000,000 = (200 + 250) ÷ 1,000,000 = **$0.00045 a run**

**Step 2. Return.**

> 6 minutes × 60 a week × 50 weeks = 18,000 minutes a year = 300 hours
> 300 hours × $30 = **$9,000 a year**

**Step 3. Cost.**

> 60 a week × 50 weeks = 3,000 runs a year
> 3,000 × $0.00045 = $1.35, plus $0 of licences = **$1.35 a year**

**Step 4. Effort.**

> One time: (24 + 6) hours × $75 = **$2,250**
> Every year: 1.5 hours × 12 months × $75 = **$1,350 a year**

**Step 5. Year 1 net.**

> $9,000 − $1.35 − $2,250 − $1,350 = **$5,398.65**

**Step 6. Payback.**

> Left over each year before the build: $9,000 − $1.35 − $1,350 = $7,648.65
> Per week: $7,648.65 ÷ 52 = $147.09
> $2,250 ÷ $147.09 = **15.3 weeks**

**Step 7. Year 2 run rate.**

> ($9,000 − $1.35) × 1.5 − $1,350 = $13,497.98 − $1,350 = **$12,147.98**

**Step 8. Two-year value.**

> $5,398.65 + $12,147.98 = **$17,546.63**, or about $17,500

**On its own line: cash freed.**

> 2 days × $20,000,000 ÷ 365 = **$109,589**, or about $109,600, once

**The gates.**

| Gate | The number | The rule | Verdict |
|---|---|---|---|
| Cost | $1.35 a year, well under 1% of the $9,000 return | NO above 30% | PASS |
| Return | $9,000 a year | NO under $5,000 (unless on the cash path) | PASS |
| Effort | Paid back in about 15 weeks | NO beyond 26 weeks | PASS |
| Potential | 1.5× growth, owner named | NO below 1× or with no owner | PASS |

**Verdict: YES.** Two-year value about $17,500, plus about $109,600 of cash freed once.

### The other two example candidates, for comparison

| | A. Customer chatbot ("the exciting one") | B. Meeting-notes summaries ("the easy one") | C. Invoice reminders ("the boring one") |
|---|---|---|---|
| Tier and price per run | Frontier, $0.036 | Small, $0.00045 | Small, $0.00045 |
| Return per year | $15,000 | $5,000 | $9,000 |
| Cost per year | $3,270 (22% of return) | $2,880.45 (58% of return) | $1.35 (under 1%) |
| Effort, one time | $33,000 | $900 | $2,250 |
| Effort per year | $27,000 | $900 | $1,350 |
| Payback | Never | About 38 weeks | About 15 weeks |
| Year 1 net | −$48,270 | $319.55 | $5,398.65 |
| Year 2 run rate | −$9,405 | $1,219.55 | $12,147.98 |
| Two-year value | −$57,675 | $1,539.10 | $17,546.63 |
| Cost gate | PASS | **NO** | PASS |
| Return gate | PASS | PASS (exactly at the $5,000 floor) | PASS |
| Effort gate | **NO** | NO | PASS |
| Potential gate | NO (no owner) | NO (no owner) | PASS |
| **Verdict** | **NO at Effort** | **NO at Cost** | **YES** |

Reading the table: the chatbot's cost to run is fine. What kills it is the upkeep. At $27,000 a year it costs more to keep alive than the $11,730 it nets after running costs, so it loses $15,270 every year and the build is never paid back. The meeting-notes tool is cheap to build, but the $240-a-month licence eats 58% of the $5,000 it returns. A candidate is reported as stopped at the *first* gate that says NO, in the order cost, return, effort, potential.

One caution about candidate B: its return is exactly $5,000, right on the Return floor, and a value on the limit passes. Lower the hourly rate by a dollar and B would also fail Return. Its first NO would still be Cost.

## 6. Where every benchmark number comes from

Every model price and score comes from one file: `data/benchlm-leaderboard.csv`, the BenchLM leaderboard export retrieved in November 2026. The command `node tools/build-data.js` converts that file into `deck/lib/benchlm-data.js`, which the deck reads. No price or score is typed in anywhere else. If the CSV is replaced and that command is run again, every figure below is recalculated.

The file itself carries two warnings, and the deck repeats them:

- It marks 17 of its 50 rows **"estimated"**. Wherever a model's score is shown, its estimated flag is shown with it.
- It states that rank order is a point estimate and that its ranges "do not establish rank confidence". So the talk speaks in price tiers, not in exact ranks.

| Figure in the talk | How it is worked out | Result |
|---|---|---|
| Models in the file | Count the rows | 50 |
| Marked "estimated" | Rows whose evidence status is "estimated" | 17 |
| Usable prices | Rows with an input and an output price that are not both zero | 41 |
| Blank prices | Rows with a price missing: Muse Wonder Full, Muse Spark 1.1, Ling 3.1 Flash, Qwen3.8 Max, Qwen3.7 Max | 5 |
| Listed at $0 | Open-weight models you would host yourself, which is not free: dots3-note Preview, Sage-A1.5, Ornith-1.5-397B, GLM-5.3 | 4 |
| Cheapest price per run | The lowest price per run among the 41. Claude Haiku 5.5 and GPT-6 Luna tie, both listed at $0.10 in / $0.50 out | $0.00045 |
| Dearest price per run | The highest among the 41. GPT-5.5 Pro and GPT-5.4 Pro tie, both listed at $30 in / $180 out | $0.15 |
| The spread | Dearest ÷ cheapest = $0.15 ÷ $0.00045 = 333.3 | 333× |
| Models on the efficient frontier | Priced models that no model at the same or a lower price outscores | 5 |
| Models that are outscored | The other priced models: 41 − 5 | 36 of 41 |
| Haiku 5.5 → Gemini 4 Carbon | Price: $0.009 ÷ $0.00045. Score: 87.91 − 66.17 = 21.74 | 20× the price for about 22 points |
| Gemini 4 Carbon → Fable 5.2 | Price: $0.036 ÷ $0.009. Score: 91.41 − 87.91 | 4× the price for 3.5 points |
| Seconds a run must save to pay for itself | Price per run ÷ (hourly rate ÷ 3,600), at $30 an hour | 18 seconds for the dearest model; 4.3 for Claude Fable 5.2; 0.05 for Claude Haiku 5.5 |

The 9 models with a blank price or a $0 listing are left out of **all** price math: the spread, the frontier and the tiers.

### The five models on the efficient frontier

| Model | Price per run | Overall score | Marked estimated? |
|---|---|---|---|
| Claude Haiku 5.5 | $0.00045 | 66.17 | no |
| Gemini 3.8 Flash | $0.003375 | 66.61 | no |
| GPT-6.1 Terra | $0.0045 | 80.13 | **yes** |
| Gemini 4 Carbon | $0.009 | 87.91 | no |
| Claude Fable 5.2 | $0.036 | 91.41 | **yes** |

### The five price tiers

One model stands for each tier. The model names are chosen by hand (in `deck/lib/cost-math.js`, at the top); every price is looked up from the file and worked out for the task size in use.

| Tier | Stands for it | Listed price (in / out, per million tokens) | Per run | Per 1,000 runs | Per 100,000 runs |
|---|---|---|---|---|---|
| Plain code / spreadsheet | no model | none | about $0 | about $0 | about $0 |
| Small model | Claude Haiku 5.5 | $0.10 / $0.50 | $0.00045 | $0.45 | $45 |
| Mid model | Gemini 4 Carbon | $2 / $10 | $0.009 | $9 | $900 |
| Frontier model | Claude Fable 5.2 (score estimated) | $8 / $40 | $0.036 | $36 | $3,600 |
| Premium "pro" model | GPT-5.5 Pro (score estimated) | $30 / $180 | $0.15 | $150 | $15,000 |

### What these numbers depend on

- **The task size.** All of the above assume 2,000 tokens in and 500 out. Doubling both doubles every price and leaves every ratio (333×, 20×, 4×) unchanged. Changing the *mix* of reading and writing can shift individual prices and, in principle, which models sit on the frontier. The code recalculates rather than assumes.
- **The hourly rate.** The break-even seconds use $30 an hour. At $60 an hour they halve.
- **List prices on the day of the export.** Prices change. Re-export the file and rebuild before quoting these on another date.

## 7. Safeguards in the code

- It never shows "NaN". Blank, negative or nonsensical inputs are treated as zero (growth, if left blank, is treated as 1×), and every division is guarded.
- Two values can honestly be infinite and say so: payback ("never") and cost as a share of return when nothing comes back.
- A candidate with an unknown tier is priced at $0 a run and the result carries a plain-language warning saying so.
- The same code runs in the browser and from the command line, and the test compares the two results character for character.
