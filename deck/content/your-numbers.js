/*
 * deck/content/your-numbers.js  ->  window.YOUR
 * =============================================================================
 * THE ONE FILE YOU EDIT.
 *
 * Everything in the deck, the screener and the worksheet that is "yours" lives
 * here: who is speaking, the rates the math uses, the example company, the three
 * example candidates, the house rules, and your links.
 *
 * HOW TO EDIT (no programming needed)
 *   - Change only what is to the RIGHT of a colon.
 *   - Numbers are written plain, with no $ sign and no commas:   20000000
 *   - Words go inside 'single quotes':                           'Laborde Products'
 *   - Yes / no values are the words true or false, no quotes.
 *   - Leave the commas at the ends of the lines where they are.
 *   - Lines that start with // are notes to you. The deck ignores them.
 *   - Save the file, then reload the deck in the browser. That is all.
 *
 * WHAT "EXAMPLE" MEANS
 *   Any value marked EXAMPLE is made up for illustration. It is not a Laborde
 *   number. The deck labels everything computed from these values "Example".
 *   Replace them with your own whenever you like; the math follows.
 *
 * IF SOMETHING LOOKS BROKEN AFTER AN EDIT
 *   You most likely removed a comma or a quote mark. Undo the last change, or
 *   run   node tools/test-libs.js   and read the first line that says FAIL.
 * =============================================================================
 */
var YOUR = {

  /* ---------------------------------------------------------------------------
   * WHO IS SPEAKING
   * These are facts from the published bio. They appear on the title and
   * thank-you slides.
   * ------------------------------------------------------------------------ */
  speaker: {
    // Your name as it should appear on screen.
    name: 'Dustin T Hughes',
    // Your job title.
    role: 'VP of Technology',
    // Your company.
    company: 'Laborde Products',
    // One line that describes the company. Shown small, under your name.
    companyLine: 'Marine diesel distributor · 95 people · 3 locations'
  },

  /* ---------------------------------------------------------------------------
   * THE EVENT
   * Shown on the walk-in card and the title slide.
   * ------------------------------------------------------------------------ */
  event: {
    // Short name of the event.
    name: 'NOAI 2026',
    // What the short name stands for.
    fullName: 'New Orleans Arts & Ideas fest',
    // The room and the building.
    venue: 'Education Center, New Orleans Jazz Museum',
    // Street address of the building.
    address: '400 Esplanade Ave',
    // The day of the session.
    date: 'Friday, Nov 13, 2026',
    // Start and end time, as printed in the programme.
    time: '2:30–4:00 PM',
    // The start time on its own. The walk-in card says "Starts 2:30".
    startsAt: '2:30',
    // Length of the session in minutes.
    minutes: 90,
    // The title of the session.
    title: 'The Most Valuable AI Skill Is Saying No',
    // The line under the title.
    subtitle: 'Screening AI use cases for real return.'
  },

  /* ---------------------------------------------------------------------------
   * RATES
   * The three numbers that turn minutes into dollars. They are shown on screen
   * wherever they are used, and the audience can change them in the screener.
   * ------------------------------------------------------------------------ */
  rates: {
    // What one hour of an employee's time costs the company, in dollars:
    // wages plus taxes and benefits. Used to value the minutes saved.
    // At 30, one minute saved per week is worth $25 a year.
    loadedHourly: 30,          // EXAMPLE: a round number, not a Laborde pay rate

    // What one hour of the person who BUILDS and maintains the tool costs,
    // in dollars. Used to price the build, the rollout and the upkeep.
    builderHourly: 75,         // EXAMPLE: a round number, not a Laborde pay rate

    // How many weeks a year the work actually happens (52 minus holidays
    // and time off).
    workWeeks: 50              // EXAMPLE
  },

  /* ---------------------------------------------------------------------------
   * THE EXAMPLE COMPANY
   * Used for one thing only: turning "days off the cash cycle" into dollars.
   * One day off the cycle frees about one day of sales (revenue divided by 365).
   * ------------------------------------------------------------------------ */
  company: {
    // Sales for one year, in dollars. This is NOT Laborde's revenue.
    annualRevenue: 20000000,   // EXAMPLE

    // How the deck names this company on screen. Keep the word "Example" in it
    // unless you have replaced the number above with a real one you may share.
    //
    // THE TWO LINES GO TOGETHER. The "$20M" in this label is the number above,
    // written short. If you change the number, change the "$20M" to match
    // (5000000 is "$5M", 750000 is "$750K"). If you forget, the deck still
    // shows the right figure, because it rewrites the dollar amount in the
    // label from the number above, and   node tools/test-libs.js   prints a
    // FAIL line telling you the two disagree.
    label: 'Example: a $20M distributor'   // EXAMPLE
  },

  /* ---------------------------------------------------------------------------
   * TASK SIZE
   * How big one AI task is assumed to be, in "tokens" (pieces of words). The
   * price of a run is worked out from this and the price list in the benchmark
   * file. Shown on screen as an assumption.
   * ------------------------------------------------------------------------ */
  tokens: {
    // What the model READS for one task. 2,000 is about a page and a half.
    in: 2000,                  // ASSUMPTION, shown on screen

    // What the model WRITES back. 500 is a few paragraphs.
    out: 500                   // ASSUMPTION, shown on screen
  },

  /* ---------------------------------------------------------------------------
   * HOUSE RULES
   * Where each of the four gates says NO. These are defaults, not laws: change
   * them and every verdict in the deck and the screener is recalculated.
   * ------------------------------------------------------------------------ */
  houseRules: {
    // COST says NO when a year of running costs is more than this share of a
    // year of return. 0.30 means 30%.
    costMaxShareOfReturn: 0.30,   // HOUSE RULE (default)

    // RETURN says NO when the yearly return is under this many dollars AND the
    // task takes no days off the cash cycle (daysOffCashCycle is 0 or blank).
    // Being on the cash path is not enough: the cash has to arrive sooner.
    minReturnPerYear: 5000,       // HOUSE RULE (default)

    // EFFORT says NO when it takes more than this many weeks for the savings to
    // pay back the cost of building it. 26 weeks is half a year.
    maxPaybackWeeks: 26,          // HOUSE RULE (default)

    // POTENTIAL says NO when projected growth is below this. 1 means "stays the
    // same size". (It also says NO when nobody owns the freed time.)
    minGrowth: 1                  // HOUSE RULE (default)
  },

  /* ---------------------------------------------------------------------------
   * THE THREE EXAMPLE CANDIDATES
   * The worked example in Act 3 runs these through the four gates. All three
   * are made up. Swap in your real three if you have them.
   *
   * None of the three is the warehouse-slotting project. That one is real, so
   * its results are never made up: they live in the WAREHOUSE SLOTTING section
   * at the bottom of this file and are shown in Act 4. (Its "bigger return",
   * effort and potential are the exception: made up on purpose to protect
   * company data, and tagged as illustrative on screen.)
   *
   * Type the numbers plain: 240, not '$240 a month'. If a value cannot be read
   * as a number, the deck does not guess: that candidate gets a NO with a
   * sentence saying which line to fix.
   *
   * What each line means:
   *   id                   a short nickname with no spaces (used internally)
   *   name                 what the idea is called on screen
   *   pitch                the two-word label: exciting, easy, boring
   *   lens                 'product' (cash comes in sooner) or 'service' (more paid work)
   *   minutesPerRun        minutes saved each time the task is done
   *   runsPerWeek          how many times a week the task is done
   *   tier                 what runs it: 'code', 'small', 'mid', 'frontier' or 'premium'
   *                        ('code' is a spreadsheet or plain code: no AI model, about $0 a run)
   *   toolsPerMonth        licences and subscriptions, in dollars a month
   *   buildHours           hours to build it, once
   *   rolloutHours         hours to train people and switch over, once
   *   upkeepHoursPerMonth  hours a month to keep it working, forever
   *   growth               how much bigger it gets over the next year, as a multiple:
   *                        1 = same size, 1.5 = half again, 2 = double (never a percentage)
   *   touchesCashPath      true if it sits on quote > order > pick > ship > invoice > collect
   *                        (the first question to ask; on its own it changes no verdict)
   *   daysOffCashCycle     days sooner the cash arrives (0 if none). Under the return
   *                        floor, only a number above 0 here keeps a task in.
   *   ownerNamed           true if a named person decides what the freed time becomes
   *
   * For a 'service' candidate you may add two more lines:
   *   capacityConversion     share of the freed time that becomes paid work, 0 to 1
   *                          (write 0.5 for 50%, never 50)
   *   billableMarginPerHour  dollars of margin on one extra billable hour
   * ------------------------------------------------------------------------ */
  candidates: [

    // A. The exciting one. Under the default house rules it clears Cost and
    //    Return, then gets NO at Effort: the upkeep costs more than it saves,
    //    so it never pays back.
    {
      id: 'chatbot',                                // EXAMPLE
      name: 'Customer chatbot for parts lookup',    // EXAMPLE
      pitch: 'The exciting one',                    // EXAMPLE
      lens: 'product',                              // EXAMPLE
      minutesPerRun: 4,                             // EXAMPLE
      runsPerWeek: 150,                             // EXAMPLE
      tier: 'frontier',                             // EXAMPLE
      toolsPerMonth: 250,                           // EXAMPLE
      buildHours: 400,                              // EXAMPLE
      rolloutHours: 40,                             // EXAMPLE
      upkeepHoursPerMonth: 30,                      // EXAMPLE
      growth: 1.5,                                  // EXAMPLE
      touchesCashPath: false,                       // EXAMPLE
      daysOffCashCycle: 0,                          // EXAMPLE
      ownerNamed: false                             // EXAMPLE
    },

    // B. The easy one. It gets NO at Cost: the licence eats more than 30% of
    //    what it returns.
    {
      id: 'notes',                                  // EXAMPLE
      name: 'Meeting-notes summaries for managers', // EXAMPLE
      pitch: 'The easy one',                        // EXAMPLE
      lens: 'product',                              // EXAMPLE
      minutesPerRun: 10,                            // EXAMPLE
      runsPerWeek: 20,                              // EXAMPLE
      tier: 'small',                                // EXAMPLE
      toolsPerMonth: 240,                           // EXAMPLE
      buildHours: 4,                                // EXAMPLE
      rolloutHours: 8,                              // EXAMPLE
      upkeepHoursPerMonth: 1,                       // EXAMPLE
      growth: 1,                                    // EXAMPLE
      touchesCashPath: false,                       // EXAMPLE
      daysOffCashCycle: 0,                          // EXAMPLE
      ownerNamed: false                             // EXAMPLE
    },

    // C. The boring one. A small AI model drafts each reminder (tier 'small').
    //    It passes all four gates, and it gets cash in 2 days sooner.
    {
      id: 'reminders',                              // EXAMPLE
      name: 'Invoice follow-up reminders',          // EXAMPLE
      pitch: 'The boring one',                      // EXAMPLE
      lens: 'product',                              // EXAMPLE
      minutesPerRun: 6,                             // EXAMPLE
      runsPerWeek: 60,                              // EXAMPLE
      tier: 'small',                                // EXAMPLE
      toolsPerMonth: 0,                             // EXAMPLE
      buildHours: 24,                               // EXAMPLE
      rolloutHours: 6,                              // EXAMPLE
      upkeepHoursPerMonth: 1.5,                     // EXAMPLE
      growth: 1.5,                                  // EXAMPLE
      touchesCashPath: true,                        // EXAMPLE
      daysOffCashCycle: 2,                          // EXAMPLE
      ownerNamed: true                              // EXAMPLE
    }
  ],

  /* ---------------------------------------------------------------------------
   * YOUR LINKS
   * Leave a link as '' (two quote marks, nothing between) and the deck simply
   * does not show it. Fill one in and its slide shows the link and a QR code.
   * ------------------------------------------------------------------------ */
  links: {
    // Where attendees can open the four-gate screener on their phone.
    screenerUrl: '',
    // Where the deck and the code can be found after the talk.
    repoUrl: 'https://github.com/hughes-research/nolaai-2026'
  },

  /* ---------------------------------------------------------------------------
   * YOUR STORY
   * "How we actually built it." A list of short lines, one per step, in your
   * own words. While the list is empty the slide is skipped, so nothing is
   * ever invented on your behalf.
   *
   * To fill it in, put each line in quotes with a comma after it, like this:
   *
   *   howWeBuiltIt: [
   *     'YOUR STORY: the first thing you tried',
   *     'YOUR STORY: what changed your mind',
   *     'YOUR STORY: what you would do differently'
   *   ]
   * ------------------------------------------------------------------------ */
  story: {
    howWeBuiltIt: []
  },

  /* ---------------------------------------------------------------------------
   * EXAMPLE INPUTS FOR TWO SLIDES
   * Made-up figures, shown on screen with the word "Example". Change them to
   * suit the room, or leave them.
   * ------------------------------------------------------------------------ */
  examples: {
    // The cash conversion cycle slide: days of inventory + days to collect
    // - days to pay. EXAMPLE figures for a small distributor.
    cashCycle: {
      daysInventory: 60,   // EXAMPLE: days a part sits on the shelf before it sells
      daysToCollect: 38,   // EXAMPLE: days from invoice to money in the bank
      daysToPay: 30        // EXAMPLE: days you take to pay your own suppliers
    },
    // The capacity slide (service side): freed hours turn into paid work.
    capacity: {
      hoursFreedPerWeek: 6,        // EXAMPLE: hours a week the automation gives back
      billableMarginPerHour: 95    // EXAMPLE: what one extra billed hour earns, in dollars
    }
  },

  /* ---------------------------------------------------------------------------
   * WAREHOUSE SLOTTING: THE REAL PROJECT
   *
   * `results` are the real figures from the project's own records. They are
   * the ONLY place these numbers are typed; every slide reads them from here.
   * Check them before the talk and correct any that have moved.
   *
   * A value of null means "not filled in". The deck shows nothing for it and
   * never makes a figure up. (The bigger return, effort and potential further
   * down are the one exception: they are made up on purpose, and say so.)
   * ------------------------------------------------------------------------ */
  slotting: {
    results: {
      asOf: 'Oct 27–28, 2026',     // the date of the runs these figures come from
      label: 'Laborde results, Oct 2026',

      // Scale of the job
      parts: 6493,                 // parts (SKUs) that needed a new shelf address
      slots: 7110,                 // usable shelf slots in the new building
      orderLines: 239711,          // order lines of history the tool learned from
      historySince: 2010,
      ordersLast12Months: 1983,

      // Optimized layout versus moving every part across in its current order
      walkFtAsIs: 133.6,           // feet walked per pick run, as-is move
      walkFtOptimized: 91.1,       // feet walked per pick run, optimized
      walkPctLess: 31.8,
      pickHoursAsIs: 32.8,         // pick hours per year, as-is move
      pickHoursOptimized: 17.4,    // pick hours per year, optimized
      pickTimePctLess: 47.0,
      ladderPctAsIs: 23,           // share of picks that need a ladder, as-is move
      ladderPctOptimized: 0.6,
      goldenPctAsIs: 39,           // share of fast movers at waist-to-shoulder height
      goldenPctOptimized: 100,
      offLadderPctAsIs: 75,        // share of medium movers kept off the ladder
      offLadderPctOptimized: 100,

      // Versus the old building as it runs today (its floor plan is estimated)
      oldBuilding: {
        walkFt: 103.9,
        pickHours: 22.5,
        ladderPct: 9,
        walkPctLess: 12.3,
        pickTimePctLess: 22.7
      },

      // The caveats the project itself states. They are shown on the slide.
      caveats: [
        'Versus moving every part in its current order',
        'Pick times are placeholders pending a floor time study',
        'The old building’s floor plan is estimated'
      ],

      // Seven attempts: change in walking versus the old building (March 2026
      // model). Negative means worse than the old building.
      attempts: [
        { n: 1, method: 'Evolve layouts',                         pct: -8.8,  retired: false },
        { n: 2, method: 'Match parts to slots one by one',        pct: -27.2, retired: true  },
        { n: 3, method: 'Exact optimizer',                        pct: -34.4, retired: true  },
        { n: 4, method: 'Add “ordered together” and annealing', pct: 3.5,   retired: false },
        { n: 5, method: 'Score by replaying real orders',         pct: 7.9,   retired: false },
        { n: 6, method: 'Mine order patterns, weight recent ones', pct: 11,   retired: false },
        { n: 7, method: 'Ten different starting points',          pct: 16.4,  retired: false }
      ],
      attemptsNote: 'Walking versus the old building, March 2026 model',

      // Rigor moments from the project's experiment log
      rigor: [
        'Marked our own number down, from 13.1% to 11.0%',
        'One ruler said 26%. We reported 15%.',
        'A bug said 220%. We called it nonsense and fixed it.'
      ],

      // What the project said no to
      saidNo: [
        { what: 'An AI model in the loop',              why: 'It didn’t fit the problem' },
        { what: 'A fancier solver',                     why: 'Tried two. Both lost.' },
        { what: 'Re-slotting every month',              why: 'The move is the one free re-slot' },
        { what: 'A $500,000-a-year savings claim',      why: 'No source. Excluded.' }
      ],

      // How it was built and what a run costs
      commits: { total: 47, aiCoAuthored: 33 },
      aiModelsAtRunTime: 0,
      run: { starts: 10, stepsPerStart: 1000000, minutes: 3.5, cores: 10 }
    },

    // =======================================================================
    // !!  THE FIGURES BELOW ARE MADE UP.  !!
    // biggerReturn, effort and potential are NOT Laborde numbers. They were
    // invented to protect company data, and built only from things the real
    // results above already show (every part was moving anyway; ladder picks
    // went from 23% to 0.6%). The dollars, the counts, the minutes, the build
    // hours, the upkeep and the growth are all examples.
    //
    // While `illustrative` is true, slide 32 shows the tag
    // "ILLUSTRATIVE · CHANGED TO PROTECT COMPANY DATA" next to them.
    // EITHER replace them with your real figures and set illustrative to
    // false, OR leave them and keep illustrative true. Never set it to false
    // while any made-up figure is left here.
    //
    // To empty the slide again (it then stops at the NO on minutes), set
    // biggerReturn to []  and the effort and potential values to null.
    // =======================================================================
    illustrative: true,            // true while ANY figure below is made up

    // "The bigger return": the value beyond the walking minutes. Each line can
    // be written two ways.
    //
    //   WORKED OUT BY THE DECK (what is used now): count x minutes each, at the
    //   loaded hourly rate in RATES above. count is a number, or the words
    //   'every part' for the real part count in results (6,493). per is 'once'
    //   or 'year'. Only 'year' lines count toward the yearly return the gates
    //   test; a 'once' line is shown, but the yearly rule never counts it.
    //
    //   TYPED AS WORDS: { label, value, note }, for example
    //     { label: 'Planning time not spent', value: '6 weeks', note: 'placing 6,493 parts by hand' }
    //   A typed line is shown as it is, but the gates cannot run on it.
    //
    // Do not count the same minutes twice: the 15.4 pick hours above already
    // include the ladder on a pick. The ladder line here is the climbs to put
    // stock away, which the pick hours do not count.
    biggerReturn: [
      {
        label: 'The one free re-slot',          // MADE UP (the mechanism is real)
        count: 'every part',                    // the real 6,493: every part was moving anyway
        minutesEach: 6,                         // MADE UP: minutes to re-slot one part later, as its own job
        per: 'once',
        note: 'every part was moving anyway; re-slotting later would be its own job'
      },
      {
        label: 'Ladder climbs avoided',         // MADE UP (ladder picks 23% to 0.6% is real)
        count: 2500,                            // MADE UP: ladder climbs to restock, avoided each year
        minutesEach: 6,                         // MADE UP: minutes per climb (fetch, climb, put away)
        per: 'year',
        note: 'restocking climbs a year; ladder picks went from 23% to 0.6%'
      }
    ],

    // What the project took to build and keep alive.
    effort: {
      buildHours: 40,              // MADE UP: total hours across everyone, start to now
      upkeepHoursPerMonth: 1       // MADE UP: hours a month to keep it running
    },

    // How far it grows from here.
    potential: {
      growth: 2,                   // MADE UP: a multiple, for example 3 for "three locations"
      note: 'every future re-slot, every building',   // MADE UP
      ownerNamed: true             // MADE UP: true if a named person owns the time it frees
    },

    // Settings of the animated re-creation (synthetic data). Leave empty to use
    // the built-in defaults; the builder of that scene documents the options.
    sim: {}
  }
};

/* =============================================================================
 * DO NOT EDIT BELOW THIS LINE.
 * This hands the values above to the deck (in the browser) and to the test and
 * command-line tools (in Node).
 * ========================================================================== */
if (typeof window !== 'undefined') window.YOUR = YOUR;
if (typeof module === 'object' && module && module.exports) module.exports = YOUR;
