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
    // task does not touch the cash path.
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
   *   growth               how much bigger it gets over the next year: 1 = same, 1.5 = half again
   *   touchesCashPath      true if it sits on quote > order > pick > ship > invoice > collect
   *   daysOffCashCycle     days sooner the cash arrives (0 if none)
   *   ownerNamed           true if a named person decides what the freed time becomes
   *
   * For a 'service' candidate you may add two more lines:
   *   capacityConversion     share of the freed time that becomes paid work, 0 to 1
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

    // C. The boring one. It passes all four gates and it sits on the cash path.
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
    repoUrl: ''
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
   * WAREHOUSE SLOTTING
   * NOT FILLED IN YET. This section is left for a later task: the slotting part
   * of the talk (the real results, your bigger return, and the settings of the
   * animated re-creation) is being built separately and will be written here.
   * Nothing in the gate math or the cost math reads this section.
   *
   * A value of null means "not filled in". The deck shows a visible
   * "YOUR NUMBER" slot for it and never makes a figure up.
   * ------------------------------------------------------------------------ */
  slotting: {
    // The real project results. Left for a later task.
    real: null,
    results: null,

    // "The bigger return": a list of { label, value, note } you fill in.
    biggerReturn: [],

    // What the project took to build and keep alive. Yours to fill in.
    effort: { buildHours: null, upkeepHoursPerMonth: null },

    // How far it grows from here. Yours to fill in.
    potential: { growth: null, note: null },

    // Settings of the animated re-creation (synthetic data). Left for a later task.
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
