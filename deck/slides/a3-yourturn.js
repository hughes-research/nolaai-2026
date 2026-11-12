/*
 * slides/a3-yourturn.js: Act 3, "Your Turn" (minutes 25 to 60).
 *
 *   ex-inventory     Exercise 1, 10 minutes: inventory two weeks of real work
 *   ex-pick-three    Exercise 2, 5 minutes: pick three
 *   worked-example   three example candidates through the four gates (scene "screener", walkthrough)
 *   ex-screen        Exercise 3, 10 minutes: the four prompts, then the live screener (scene "screener", live)
 *   share-out        two questions for the room, 5 minutes
 *
 * On-screen copy is from docs/BRIEF.md, section 8. Nothing here types a number
 * that the libraries can produce: the worked example and the screener read
 * Gates, the QR code reads window.YOUR.links.screenerUrl, and the speaker
 * notes quote Gates' own sentences, so they stay true if the examples in
 * content/your-numbers.js are changed.
 *
 * The three exercise slides are the kit's exercise layout (kicker, headline,
 * a ruled list, the clock in its panel). They sit on screen for many minutes
 * while people write, so nothing on them moves except the clock.
 *
 * The few styles below are scoped under .yt-* and use tokens only.
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var G = window.Gates || null;
  var CM = window.CostMath || null;
  var S = window.Screener || null;

  var css = `
/* ---- the exercise slides: the list fills its column, down to the foot ---- */
.slide .yt-list { align-self: start; width: 100%; }
.slide .yt-list > li { min-height: 164px; text-wrap: balance; }
.slide .yt-list > li:last-child { border-bottom: var(--w-rule, 6px) solid var(--c-line); }

/* ex-pick-three: the third one is the one nobody brings up. It is printed in negative. */
.slide .yt-list > li.yt-quiet { margin-left: -40px; padding-left: 40px; width: calc(100% + 40px); border-top-color: var(--c-bg); border-bottom-color: var(--c-bg); background: var(--c-bg); color: var(--c-ink); }
.slide .yt-pick .yt-list > li { min-height: 190px; }

/* ex-screen, step 0: one prompt per gate. The gate's name, and under it the gate's question. */
.slide .yt-gates > li { min-height: 150px; }
.slide .yt-gates .yt-pair { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.slide .yt-gates .yt-gate { font-family: var(--f-display); font-size: 76px; font-weight: 900; font-stretch: 62%; line-height: 0.708; text-transform: uppercase; white-space: nowrap; }
.slide .yt-gates .yt-ask { font-size: 40px; font-weight: 500; line-height: 46px; text-wrap: balance; }

/* the clock's panel can also hold the QR code to the screener */
.slide .yt-side { display: flex; flex-direction: column; min-height: 0; border-left: var(--w-rule, 6px) solid var(--c-line); border-top: var(--w-rule, 6px) solid var(--c-line); }
.slide .yt-side > .timer-host { flex: 1 1 0; border: 0; }
.slide .yt-qr { display: flex; align-items: flex-end; gap: 28px; padding: 24px 56px 40px 28px; border-top: var(--w-rule, 6px) solid var(--c-line); }
.slide .yt-qr[hidden] { display: none; }
.slide .yt-qr .qr { width: 340px; }
.slide .yt-qr-words { min-width: 0; padding-bottom: 6px; }
.slide .yt-qr-title { font-size: 40px; line-height: 44px; font-weight: 700; }
.slide .yt-qr-url { margin-top: 12px; font-size: 32px; line-height: 36px; font-weight: 600; font-stretch: 87.5%; overflow-wrap: anywhere; }
.slide .yt-side.has-qr > .timer-host { --timer-size: 230px; }
.slide .yt-side.has-qr .timer-hint { display: none; }
.slide .yt-side.has-qr .timer-bar { margin-top: 24px; }

/* ex-screen, step 1: the screener takes the stage; the headline and the clock move to the top bar */
.slide.yt-step :is([data-step], [data-step-out]) { transition: none; }
.slide > .yt-live { position: absolute; left: 128px; top: 120px; width: 1736px; height: 920px; flex: none; }
.slide[data-current-step="1"] > .yt-kicker { visibility: hidden; }
.slide[data-current-step="1"] > .yt-head { position: absolute; left: 128px; top: 34px; margin: 0; font-size: 96px; line-height: 0.708; white-space: nowrap; }
.slide[data-current-step="1"] .yt-side { position: absolute; right: 56px; top: 28px; width: 300px; height: 84px; border: 0; }
/* in the top bar the last minute is an ink block, so the winner below keeps the slide's one Flare */
.slide[data-current-step="1"] .yt-side > .timer-host { --timer-size: 96px; --timer-warn-bg: var(--c-ink); --timer-warn-color: var(--c-bg); }
.slide[data-current-step="1"] .yt-side .timer-bar,
.slide[data-current-step="1"] .yt-side .timer-hint,
.slide[data-current-step="1"] .yt-side .timer-label { display: none; }
.slide[data-current-step="1"] .yt-side .timer-digits { margin: 0; }

/* worked-example: the scene owns the slide; the headline and the tag sit over it */
.slide > .yt-stage { position: absolute; inset: 0; flex: none; }
.slide > .yt-over { position: relative; z-index: 2; }
.slide > .yt-tag { position: absolute; right: var(--m-right, 56px); top: 52px; z-index: 2; }

/* share-out: two lines, a lot of empty stock, a small clock in the corner */
.slide > .yt-ask2 { font-size: 104px; line-height: 1.1; max-width: none; white-space: nowrap; }
.slide > .yt-corner-clock { position: absolute; right: 0; bottom: 0; width: 440px; height: 252px; flex: none; --timer-size: 132px; }
.slide > .yt-corner-clock .timer-bar { width: 70%; height: 16px; margin-top: 18px; --timer-bar-height: 16px; }
.slide > .yt-corner-clock .timer-hint { margin-top: 12px; }
`;
  var style = document.createElement('style');
  style.setAttribute('data-from', 'slides/a3-yourturn.js');
  style.textContent = css;
  document.head.appendChild(style);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* a ruled, numbered list at the kit's large size */
  function listHtml(items, extra) {
    return '<ol class="list is-l yt-list' + (extra ? ' ' + extra : '') + '">' + items.map(function (item) {
      if (typeof item === 'string') { return '<li>' + esc(item) + '</li>'; }
      return '<li' + (item.cls ? ' class="' + item.cls + '"' : '') + '>' + (item.html || esc(item.text)) + '</li>';
    }).join('') + '</ol>';
  }

  function clockHtml(minutes, cls) {
    return '<div class="scene timer-host' + (cls ? ' ' + cls : '') + '" data-scene="timer" data-opts=\'{"minutes": ' + minutes + '}\'></div>';
  }

  /* ---- facts the notes quote, worked out once from the libraries ---- */
  var gateList = G ? G.GATES : [];
  var minuteRule = (G && CM) ? CM.money(G.minuteRule()) : '';
  var hourly = (G && CM) ? CM.money(G.defaultAssumptions().rates.loadedHourly) : '';
  var walkSteps = S ? S.walkthroughSteps() : 0;
  var exampleLines = '';
  var exampleOutcome = '';
  var survivorLine = '';
  var riggedLine = '';
  var shareFallback = 'If no hand goes up, ask: who kept all three? Then: which gate would you check first?';
  if (G && S) {
    try {
      var names = [];      // "the exciting one", or "A" when a candidate has no pitch
      var verdicts = S.exampleCandidates().map(function (c, i) {
        var r = G.evaluate(c);
        var letter = ['A', 'B', 'C'][i];
        names.push(c.pitch ? String(c.pitch).charAt(0).toLowerCase() + String(c.pitch).slice(1) : letter);
        // The reason itself is printed under the gates and read from there, so the note only says where each one stops.
        exampleLines += (i ? '\n' : '') + letter + ', ' + names[i] + ': ' + r.name + '. ' +
          (r.verdict === 'YES' ? 'Passes all four.' : 'NO at ' + r.gates[r.firstNo].label + '.');
        return r.verdict;
      });
      var say = function (list) {
        var text = list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0];
        return text.charAt(0).toUpperCase() + text.slice(1);
      };
      var out = names.filter(function (n, i) { return verdicts[i] !== 'YES'; });
      var left = names.filter(function (n, i) { return verdicts[i] === 'YES'; });
      /* The skeptic's question about the survivor ("a model, ten minutes after the tool ladder?") and the
         admission that the three were chosen to show the gates working. Both read Gates, so they stay true. */
      var results = S.exampleCandidates().map(function (c) { return G.evaluate(c); });
      var survivor = null, killed = [], firstOut = null;
      results.forEach(function (r, i) {
        if (r.verdict === 'YES') { if (!survivor || r.twoYearValue > survivor.twoYearValue) { survivor = r; } }
        else {
          var label = r.gates[r.firstNo].label;
          if (killed.indexOf(label) === -1) { killed.push(label); }
          if (!firstOut) { firstOut = { name: names[i], gate: label }; }
        }
      });
      if (survivor && CM) {
        var tierId = survivor.candidate.tier;
        var usesModel = tierId && tierId !== 'code' && tierId !== 'none';
        var tierInfo = usesModel ? CM.tier(tierId) : null;
        var what = tierInfo ? String(tierInfo.label).replace(/\s*"pro"/i, '').toLowerCase() : '';
        survivorLine = usesModel
          ? 'Yes, the winner uses a model, right after the tool ladder: ' +
            (survivor.candidate.id === 'reminders' ? 'a ' + what + ' drafts each reminder' : 'it runs on a ' + what) +
            ', and it costs ' + CM.money(survivor.costPerYear) + ' a year.'
          : '';
        riggedLine = killed.length
          ? 'And yes, I chose these three so you would see ' + say(killed) + (killed.length > 1 ? ' each' : '') + ' say no.'
          : 'And yes, I chose these three.';
      }
      if (firstOut) { shareFallback = 'If no hand goes up, use the worked example: ' + firstOut.name + ' died at ' + firstOut.gate + '. Ask: whose died at the same gate?'; }
      exampleOutcome = !left.length ? 'All three are out.'
        : !out.length ? 'All three pass. Then the math picks the one worth most over two years.'
        : say(out) + (out.length === 1 ? ' is' : ' are') + ' out. ' + say(left) + (left.length === 1 ? ' is' : ' are') + ' what is left.';
    } catch (e) { exampleLines = ''; exampleOutcome = ''; survivorLine = ''; riggedLine = ''; }
  }
  /* Where the screener lives, if the speaker has filled the link in. Read when asked, so a late edit counts. */
  function screenerLink() {
    var y = window.YOUR || {};
    return (y.links && typeof y.links.screenerUrl === 'string') ? y.links.screenerUrl.trim() : '';
  }
  var screenerUrl = screenerLink();
  var exampleTag = 'Example candidates';


  /* =========================================================================
   * ex-inventory
   * ======================================================================= */
  Deck.slide({
    id: 'ex-inventory',
    act: 3,
    title: 'Exercise 1: Inventory two weeks',
    minutes: 10,
    layout: 'exercise',
    html:
      '<p class="kicker">Exercise 1 · 10 minutes</p>' +
      '<h2 class="headline">Inventory two weeks of real work.</h2>' +
      '<div class="exercise">' +
        listHtml([
          'What did you do more than twice?',
          'What did you copy from one place to another?',
          'What did you wait on?',
          'What did you dread?'
        ]) +
        clockHtml(10) +
      '</div>',
    notes: `
SAY: Exercise one. Worksheet and pen.
Write down what you actually did in the last two weeks. Not your job description. What you did.
Four questions to jog it. They stay up the whole time. Boring is good.

DO: Press T to start the ten minutes. Leave the laptop and walk the room. Read over shoulders.
AT 5:00 LEFT, say: "Five minutes. If you have fewer than six things, look at question two: what did you copy from one place to another?"
AT 1:00 LEFT (the clock turns orange), say: "One minute. Finish the line you're on."
STUCK: a list that is all strategy and no chores. Point at question two.
EARLY: if most pens are down before the orange, say "Thirty seconds" and move on.

NEXT: Pens down. However long your list is, it's about to get short.
`
  });


  /* =========================================================================
   * ex-pick-three
   * ======================================================================= */
  Deck.slide({
    id: 'ex-pick-three',
    act: 3,
    title: 'Exercise 2: Pick three',
    minutes: 5,
    layout: 'exercise',
    html:
      '<p class="kicker">Exercise 2 · 5 minutes</p>' +
      '<h2 class="headline is-hero">Pick three.</h2>' +
      '<div class="exercise yt-pick">' +
        listHtml([
          'One you’d love to pitch',
          'One that’s boring',
          { text: 'One you’d be embarrassed to bring up', cls: 'yt-quiet on-ink' }
        ]) +
        clockHtml(5) +
      '</div>',
    notes: `
SAY: Exercise two. From your list, pick three.
One you'd love to pitch. One that's boring. One you'd be embarrassed to bring up.
The embarrassing one is often the winner.

DO: Press T for the five minutes. Keep walking.
AT 2:30 LEFT, say: "Halfway. If all three of yours are exciting, swap one for a boring one."
AT 1:00 LEFT (orange), say: "One minute. Circle your three."
STUCK on the third: ask what they do every week that they would never put in a status report.
EARLY: when most people have circled three, move on. Don't wait for the clock.

NEXT: Hold on to your three. First, watch the gates work on someone else's.
`
  });


  /* =========================================================================
   * worked-example
   * ======================================================================= */
  Deck.slide({
    id: 'worked-example',
    act: 3,
    title: 'Worked example: three candidates, four gates',
    minutes: 5,
    steps: walkSteps,
    html:
      '<h2 class="headline is-s yt-over">Three candidates, four gates.</h2>' +
      '<span class="tag is-example yt-tag">' + exampleTag + '</span>' +
      '<div class="yt-stage scene" data-scene="screener" data-opts=\'{"mode": "walkthrough"}\'></div>',
    notes: `
SAY: Three candidates. They are made up. None of them is a Laborde project.
Each one goes through the gates in order and stops at its first no.
${exampleLines}
${exampleOutcome}
${survivorLine} ${riggedLine}

DO: ${walkSteps} clicks. The first click on each candidate puts its numbers in the gates. Each click after that is one gate.
Read the sentence under the gates out loud: that is the gate's reason.
When a NO lands the screen goes black for a second. Let it. Do not talk over it.
The last click shows what the survivor is worth.

YOUR STORY: swap in your real three if you have them. Change the three candidates in content/your-numbers.js and this slide follows. It will still say "Example candidates", so say out loud that yours are real.

NEXT: Those numbers were mine to pick. Now use yours.
`
  });


  /* =========================================================================
   * ex-screen
   * ======================================================================= */
  Deck.slide({
    id: 'ex-screen',
    act: 3,
    title: 'Exercise 3: Run your three through the gates',
    minutes: 10,
    layout: 'exercise yt-step',
    steps: 1,
    html:
      '<p class="kicker yt-kicker">Exercise 3 · 10 minutes</p>' +
      '<h2 class="headline yt-head">Run your three through the gates.</h2>' +
      '<div class="exercise">' +
        '<div data-step-out="1">' +
          listHtml(gateList.map(function (g) {
            return { html: '<span class="yt-pair"><b class="yt-gate">' + esc(g.label) + '</b><span class="yt-ask">' + esc(g.question) + '</span></span>' };
          }), 'yt-gates') +
        '</div>' +
        '<div class="yt-side">' +
          clockHtml(10) +
          '<div class="yt-qr" data-step-out="1" hidden>' +
            '<figure class="qr"><div class="qr-code"></div></figure>' +
            '<div class="yt-qr-words"><p class="yt-qr-title">The screener, on your phone</p><p class="yt-qr-url"></p></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="yt-live scene" data-step="1" data-scene="screener" data-opts=\'{"mode": "live"}\'></div>',
    enter: function (ctx) {
      // The QR code only exists when the speaker has filled in the link.
      var link = screenerLink();
      if (!link || !window.QR) { return; }
      var box = ctx.el.querySelector('.yt-qr');
      // Lampblack on Card, with the quiet zone, whatever the slide's inks are doing.
      var T = window.THEME;
      box.querySelector('.qr-code').innerHTML = window.QR.toSVG(link, {
        dark: T ? T.color('--lampblack') || '#050505' : '#050505',
        light: T ? T.color('--card') || '#F4EDDE' : '#F4EDDE',
        title: 'QR code for the four-gate screener'
      });
      box.querySelector('.yt-qr-url').textContent = link.replace(/^https?:\/\//i, '');
      box.hidden = false;
      ctx.el.querySelector('.yt-side').classList.add('has-qr');
    },
    notes: `
SAY: Exercise three. Run your three through the gates, in order. Stop at the first no.
The four questions are on the screen. On your worksheet: a minute a week is ${minuteRule} a year, at ${hourly} an hour.
Most of you will kill two of your three. That is the exercise working.

DO: Press T for the ten minutes. Leave the four questions up and walk the room.${screenerUrl ? ' The QR code opens the same screener on a phone.' : ''}
AT 5:00 LEFT, say: "Halfway. Still on your first one? Skip to Return: what comes back?"
Then ask: "Who has a favorite they suspect is going to die?" Take the first hand near an aisle. One candidate, their favorite. Not all three.
Press the right arrow: the screener comes up, the clock keeps running at the top. Click A, then A's name box. Type their candidate, press Enter.
Ask for each number out loud and set it in column A (minus and plus, or click and type, Enter to leave the box): minutes saved, times a week, what runs it, tools a month (0 if nothing to pay), build and rollout hours, upkeep hours a month, growth, owner yes or no, cash path yes or no. Leave the rest.
Read A down from Cost and stop at its first NO. RULES opens the thresholds if the room argues with one.
IF NOBODY VOLUNTEERS: screen the example yourself. Press the right arrow, click C and ask: "How many minutes would one reminder really save?" Type what the room calls out and read where it stops. Then try 1.
AT 1:00 LEFT, press the left arrow to bring the four questions back, and say: "One minute. Circle the one still standing."

NEXT: Pens down. Count what's still standing on your sheet.
`
  });


  /* =========================================================================
   * share-out
   * ======================================================================= */
  Deck.slide({
    id: 'share-out',
    act: 3,
    title: 'Share-out',
    minutes: 5,
    layout: 'statement',
    steps: 1,
    html:
      '<p class="kicker">Share-out · 5 minutes</p>' +
      '<p class="say">Who killed their favorite?</p>' +
      '<p class="sub yt-ask2" data-step="1" data-anim="wipe">Who’s keeping the boring one?</p>' +
      clockHtml(5, 'yt-corner-clock'),
    notes: `
SAY: Who killed their favorite? Hands up. Keep them up.
Pick one hand. Which gate killed it? Repeat the answer into the microphone.
Then: who's keeping the boring one? Three hands, one sentence each.

DO: The right arrow brings up the second question. T starts the five minutes if you want the clock.
${shareFallback}
At 1:00 left, take one last answer and move on.

NEXT: You've screened made-up ones and your own. Now one that's real.
`
  });
}());
