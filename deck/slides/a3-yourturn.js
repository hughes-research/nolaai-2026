/*
 * slides/a3-yourturn.js: Act 3, "Your Turn" (minutes 25 to 60).
 *
 *   ex-inventory     Exercise 1, 10 minutes: inventory two weeks of real work
 *   ex-pick-three    Exercise 2, 5 minutes: pick three
 *   worked-example   three example candidates through the four gates (scene "screener", walkthrough)
 *   ex-screen        Exercise 3, 10 minutes: the prompts, then the live screener (scene "screener", live)
 *   share-out        two questions for the room, 5 minutes
 *
 * On-screen copy is from docs/BRIEF.md, section 8. Nothing here types a number
 * that the libraries can produce: the worked example and the screener read
 * Gates, the QR code reads window.YOUR.links.screenerUrl, and the speaker
 * notes quote Gates' own sentences, so they stay true if the examples in
 * content/your-numbers.js are changed.
 *
 * The three exercise slides share one layout on purpose: a kicker, a
 * headline, a ruled list on the left and the clock on the right. They sit on
 * screen for many minutes while people write.
 *
 * Styles are scoped under .yt and use tokens only.
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var Y = window.YOUR || {};
  var G = window.Gates || null;
  var CM = window.CostMath || null;
  var S = window.Screener || null;

  var css = `
.slide .yt { position: absolute; inset: 0; color: var(--c-ink, #050505); font-family: var(--f-body, "Archivo", Helvetica, Arial, sans-serif); font-weight: 500; font-synthesis: none; text-align: left; }
.slide .yt, .slide .yt *, .slide .yt *::before, .slide .yt *::after { box-sizing: border-box; }
.slide .yt :is(h1, p, ol, li) { margin: 0; padding: 0; }

.slide .yt .yt-kicker { position: absolute; left: 128px; top: 64px; font-size: 32px; line-height: 32px; font-weight: 700; font-stretch: 125%; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
.slide .yt .yt-h1 { position: absolute; left: 128px; top: 122px; font-family: var(--f-display, "Archivo", sans-serif); font-weight: 900; font-stretch: 62%; font-size: 108px; line-height: 0.708; letter-spacing: 0; text-transform: uppercase; white-space: nowrap; }

/* ---- the exercise layout: a ruled list, and the clock ---- */
.slide .yt .yt-list { position: absolute; left: 128px; top: 262px; width: 1100px; list-style: none; border-bottom: 6px solid var(--c-ink, #050505); }
.slide .yt .yt-list li { position: relative; display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; height: 176px; border-top: 6px solid var(--c-ink, #050505); }
.slide .yt .yt-num { font-family: var(--f-display, "Archivo", sans-serif); font-weight: 900; font-stretch: 62%; font-size: 112px; line-height: 0.708; font-variant-numeric: tabular-nums; }
.slide .yt .yt-item { font-size: 56px; line-height: 64px; font-weight: 600; text-wrap: balance; }

.slide .yt .yt-clock { position: absolute; left: 1300px; top: 262px; width: 564px; height: 710px; border-top: 6px solid var(--c-ink, #050505); border-bottom: 6px solid var(--c-ink, #050505); }
.slide .yt .yt-clock .timer { font-stretch: 62%; --timer-weight: 900; --timer-size: 264px; }
.slide .yt .yt-clock .timer-digits { letter-spacing: 0; line-height: 0.82; }
.slide .yt .yt-clock .timer-bar { width: calc(100% - 48px); height: 28px; margin-top: 40px; border-width: 6px; }
.slide .yt .yt-clock .timer-hint { margin-top: 24px; font-stretch: 100%; letter-spacing: 0; }
.slide .yt .yt-clock .timer[data-state="idle"] .timer-bar-fill { transform: scaleX(1); }

/* ---- ex-pick-three: the loud one ---- */
.slide .yt-pick .yt-h1 { font-size: 216px; }
.slide .yt-pick .yt-list { top: 330px; }
.slide .yt-pick .yt-list li { height: 200px; }
.slide .yt-pick .yt-item { font-size: 64px; line-height: 72px; }
.slide .yt-pick .yt-clock { top: 330px; height: 606px; }
/* the third one is the one nobody brings up: it is printed in negative */
.slide .yt-pick .yt-list li.yt-quiet { background: var(--c-ink, #050505); color: var(--c-bg, #F4EDDE); }
.slide .yt-pick .yt-list li.yt-quiet .yt-num { padding-left: 24px; }

/* ---- worked-example: the scene owns the slide below the headline ---- */
.slide .yt-worked .yt-h1 { top: 60px; z-index: 2; }
.slide .yt-worked .yt-tag { position: absolute; right: 56px; top: 58px; z-index: 2; height: 56px; padding: 0 22px; background: var(--c-ink, #050505); color: var(--c-bg, #F4EDDE); font-size: 32px; line-height: 56px; font-weight: 700; font-stretch: 112%; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
.slide .yt-worked .yt-stage { position: absolute; inset: 0; }

/* ---- ex-screen, step 0: the four prompts ---- */
.slide .yt-screen :is([data-step], [data-step-out]) { transition: none; translate: none; }
.slide .yt-screen .yt-list { width: 1100px; }
.slide .yt-screen .yt-list li { grid-template-columns: 96px 330px minmax(0, 1fr); height: 170px; }
.slide .yt-screen .yt-num { font-size: 96px; }
.slide .yt-screen .yt-gate { font-family: var(--f-display, "Archivo", sans-serif); font-weight: 900; font-stretch: 62%; font-size: 84px; line-height: 0.708; text-transform: uppercase; white-space: nowrap; }
.slide .yt-screen .yt-item { font-size: 44px; line-height: 52px; font-weight: 500; }
.slide .yt-screen .yt-clock { height: 686px; }
.slide .yt-screen .yt-qr { position: absolute; left: 1300px; top: 262px; width: 564px; }
.slide .yt-screen .yt-qr[hidden] { display: none; }
.slide .yt-screen .yt-qr-code { width: 360px; height: 360px; margin-left: 204px; color: var(--c-ink, #050505); background: var(--c-bg, #F4EDDE); }
.slide .yt-screen .yt-qr-code svg { display: block; width: 100%; height: 100%; }
.slide .yt-screen .yt-qr-title { margin-top: 10px; font-size: 36px; line-height: 42px; font-weight: 700; text-align: right; }
.slide .yt-screen .yt-qr-url { font-size: 32px; line-height: 38px; font-weight: 600; font-stretch: 87.5%; text-align: right; overflow-wrap: anywhere; }
.slide .yt-screen.has-qr .yt-clock { top: 760px; height: 188px; border-top: 0; }
.slide .yt-screen.has-qr .yt-clock .timer { --timer-size: 150px; }
.slide .yt-screen.has-qr .yt-clock .timer-bar { height: 20px; margin-top: 16px; width: 100%; }
.slide .yt-screen.has-qr .yt-clock .timer-hint { display: none; }

/* ---- ex-screen, step 1: the screener takes the stage, the clock moves to the corner ---- */
.slide .yt-screen .yt-live { position: absolute; left: 128px; top: 120px; width: 1736px; height: 920px; }
.slide[data-current-step="1"] .yt-screen .yt-kicker { display: none; }
.slide[data-current-step="1"] .yt-screen .yt-h1 { top: 50px; font-size: 64px; }
.slide[data-current-step="1"] .yt-screen .yt-clock { left: 1066px; top: 40px; width: 168px; height: 64px; border: 0; }
.slide[data-current-step="1"] .yt-screen .yt-clock .timer { --timer-size: 72px; }
.slide[data-current-step="1"] .yt-screen .yt-clock .timer-bar,
.slide[data-current-step="1"] .yt-screen .yt-clock .timer-hint { display: none; }

/* ---- share-out: two lines and a lot of empty stock ---- */
.slide .yt-share .yt-ask { position: absolute; left: 128px; top: 262px; font-size: 116px; line-height: 1; font-weight: 800; white-space: nowrap; letter-spacing: -0.01em; }
.slide .yt-share .yt-ask2 { position: absolute; left: 128px; top: 470px; font-family: var(--f-voice, "Fraunces", Georgia, serif); font-style: italic; font-weight: 600; font-variation-settings: var(--voice-settings, "opsz" 72, "SOFT" 0, "WONK" 0); font-size: 116px; line-height: 1.1; white-space: nowrap; --deck-wipe-duration: var(--d-voice, 333ms); }
.slide .yt-share .yt-clock { left: 1484px; top: 800px; width: 380px; height: 218px; border-bottom: 0; }
.slide .yt-share .yt-clock .timer { --timer-size: 132px; }
.slide .yt-share .yt-clock .timer-bar { height: 16px; margin-top: 14px; width: 100%; border-width: 4px; }
.slide .yt-share .yt-clock .timer-hint { margin-top: 10px; }
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

  function listHtml(items) {
    return '<ol class="yt-list">' + items.map(function (item, i) {
      return '<li' + (item.cls ? ' class="' + item.cls + '"' : '') + '><span class="yt-num">' + (i + 1) + '</span>' +
        (item.gate ? '<span class="yt-gate">' + esc(item.gate) + '</span>' : '') +
        '<span class="yt-item">' + esc(item.text) + '</span></li>';
    }).join('') + '</ol>';
  }

  function clockHtml(minutes) {
    return '<div class="yt-clock scene" data-scene="timer" data-opts=\'{"minutes": ' + minutes + '}\'></div>';
  }

  /* ---- facts the notes quote, worked out once from the libraries ---- */
  var gateList = G ? G.GATES : [];
  var minuteRule = (G && CM) ? CM.money(G.minuteRule()) : '';
  var hourly = (G && CM) ? CM.money(G.defaultAssumptions().rates.loadedHourly) : '';
  var walkSteps = S ? S.walkthroughSteps() : 0;
  var exampleLines = '';
  if (G && S) {
    try {
      exampleLines = S.exampleCandidates().map(function (c, i) {
        var r = G.evaluate(c);
        var letter = ['A', 'B', 'C'][i];
        return letter + ', ' + String(c.pitch || 'candidate ' + letter).toLowerCase() + ': ' + r.name + '. ' + r.summary;
      }).join('\n');
    } catch (e) { exampleLines = ''; }
  }
  var screenerUrl = (Y.links && typeof Y.links.screenerUrl === 'string') ? Y.links.screenerUrl.trim() : '';


  /* =========================================================================
   * ex-inventory
   * ======================================================================= */
  Deck.slide({
    id: 'ex-inventory',
    act: 3,
    title: 'Exercise 1: Inventory two weeks',
    minutes: 10,
    html:
      '<div class="yt yt-ex yt-inventory">' +
        '<p class="yt-kicker">Exercise 1 · 10 minutes</p>' +
        '<h1 class="yt-h1">Inventory two weeks of real work.</h1>' +
        listHtml([
          { text: 'What did you do more than twice?' },
          { text: 'What did you copy from one place to another?' },
          { text: 'What did you wait on?' },
          { text: 'What did you dread?' }
        ]) +
        clockHtml(10) +
      '</div>',
    notes: `
SAY: Exercise one. Worksheet and pen.
Write down what you actually did in the last two weeks. Not your job description. What you did.
Four questions to jog it. They are on the screen the whole time.
Boring is good. Boring is where the minutes are.

DO: Press T to start the ten minutes. R resets it.
Then leave the laptop and walk the room. Read over shoulders.
If a list is all strategy and no chores, point at question two: what did you copy from one place to another?
Call "two minutes" when the clock turns. If the room is done early, move on.

NEXT: Pens down. You have a list. Now cut it to three.
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
    html:
      '<div class="yt yt-ex yt-pick">' +
        '<p class="yt-kicker">Exercise 2 · 5 minutes</p>' +
        '<h1 class="yt-h1">Pick three.</h1>' +
        listHtml([
          { text: 'One you’d love to pitch' },
          { text: 'One that’s boring' },
          { text: 'One you’d be embarrassed to bring up', cls: 'yt-quiet' }
        ]) +
        clockHtml(5) +
      '</div>',
    notes: `
SAY: Exercise two. From your list, pick three.
One you'd love to pitch. One that's boring. One you'd be embarrassed to bring up.
The embarrassing one is often the winner.
Circle the three on your worksheet.

DO: Press T for the five minutes.
Keep walking. If someone has three exciting ones, send them back: one has to be boring, one has to be embarrassing.
If someone is stuck on the third, ask what they do every week that they would never put in a status report.

NEXT: Before you screen yours, watch three made-up ones go through.
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
      '<div class="yt yt-worked">' +
        '<h1 class="yt-h1">Three candidates, four gates.</h1>' +
        '<p class="yt-tag">Example candidates</p>' +
        '<div class="yt-stage scene" data-scene="screener" data-opts=\'{"mode": "walkthrough"}\'></div>' +
      '</div>',
    notes: `
SAY: Three candidates. They are made up. None of them is a Laborde project.
Each one goes through the gates in order and stops at its first no.
${exampleLines}
The exciting one and the easy one are out. The boring one is what is left.

DO: ${walkSteps} clicks. The first click on each candidate puts its numbers in the gates. Each click after that is one gate.
Read the sentence under the gates out loud: that is the gate's reason.
When a NO lands the screen goes black for a second. Let it. Do not talk over it.
The last click shows what the survivor is worth.

YOUR STORY: swap in your real three if you have them. Change the three candidates in content/your-numbers.js and this slide follows.

NEXT: Your turn. Same four gates, your three.
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
    steps: 1,
    html:
      '<div class="yt yt-ex yt-screen">' +
        '<p class="yt-kicker">Exercise 3 · 10 minutes</p>' +
        '<h1 class="yt-h1">Run your three through the gates.</h1>' +
        '<div data-step-out="1">' +
          listHtml(gateList.map(function (g) { return { gate: g.label, text: g.question }; })) +
        '</div>' +
        '<div class="yt-qr" data-step-out="1" hidden><div class="yt-qr-code"></div>' +
          '<p class="yt-qr-title">The screener, on your phone</p><p class="yt-qr-url"></p></div>' +
        clockHtml(10) +
        '<div class="yt-live scene" data-step="1" data-scene="screener" data-opts=\'{"mode": "live"}\'></div>' +
      '</div>',
    enter: function (ctx) {
      // The QR code only exists when the speaker has filled in the link.
      if (!screenerUrl || !window.QR) { return; }
      var box = ctx.el.querySelector('.yt-qr');
      box.querySelector('.yt-qr-code').innerHTML = window.QR.toSVG(screenerUrl, {
        dark: 'currentColor', light: null, title: 'QR code for the four-gate screener'
      });
      box.querySelector('.yt-qr-url').textContent = screenerUrl.replace(/^https?:\/\//i, '');
      box.hidden = false;
      ctx.el.querySelector('.yt-screen').classList.add('has-qr');
    },
    notes: `
SAY: Exercise three. Run your three through the gates, in order. Stop at the first no.
Cost, return, effort, potential. The four questions are on the screen.
The rule of thumb is on your worksheet: a minute a week is ${minuteRule} a year, at ${hourly} an hour.
Most of you will kill two of your three. That is the exercise working.

DO: Press T for the ten minutes. Give the room three or four minutes alone.${screenerUrl ? '\nThe QR code opens the same screener on a phone.' : ''}
Then ask for a volunteer with three candidates and press the right arrow once. The screener comes up. The clock keeps running at the top.
Click A, B or C to choose a column. Type its name in the box at the top of the column.
Set the numbers with the minus and plus buttons, or click a number and type. Escape leaves a box, and the arrow keys drive the deck again.
Ask the volunteer for each number out loud. HOUSE RULES opens the thresholds if the room argues with one. RESET puts the examples back.
Read the bottom row out loud: "the math picks".

NEXT: Time. Hands up.
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
    steps: 1,
    html:
      '<div class="yt yt-share">' +
        '<p class="yt-kicker">Share-out · 5 minutes</p>' +
        '<p class="yt-ask">Who killed their favorite?</p>' +
        '<p class="yt-ask2" data-step="1" data-anim="wipe">Who’s keeping the boring one?</p>' +
        clockHtml(5) +
      '</div>',
    notes: `
SAY: Who killed their favorite? Hands up. Keep them up.
Pick one hand. Which gate killed it? Repeat the answer so the room hears it.
Then the second question: who's keeping the boring one?
Three hands, one sentence each.

DO: The right arrow brings up the second question. T starts the five minutes if you want the clock.
Repeat every answer into the microphone. If nobody volunteers, go back to the volunteer from the screener.

NEXT: You have screened three. Now the one we actually built.
`
  });
}());
