/*
 * slides/a5-close.js: Act 5, "Who Owns the Minutes?" (minutes 80 to 90).
 *
 *   who-owns            0.5   one quiet line, then the question
 *   the-objection       1.5   the objection, then the answer landing on the slide
 *   share-the-gain      2     three beats and one line. HIS VIEW, not a finding
 *   waypoint-standard   1     the four Waypoint items return (rhymes with whos-talking)
 *   monday              1     three numbered actions
 *   close               1     Shannon, our edit, then the last sentence of the talk
 *   thanks              3     stays on screen through Q&A
 *                      --
 *                      10 minutes
 *
 * Copy is final (docs/BRIEF.md, section 8). The Shannon sentence is line 5 of
 * section 6, held once in SHANNON_5 below and never retyped: the slide markup
 * is cut out of that string, so the words on screen cannot drift from it.
 *
 * Nothing here is a number from data. The name, role and company come from
 * window.YOUR.speaker, the end of the session from window.YOUR.event.time, the
 * repository link from window.YOUR.links.repoUrl. The QR code is drawn only when
 * lib/qr.js says it has been verified (window.QR.verified === true); until then
 * the link is shown as text.
 *
 * Styles: the theme's layouts and components first (say, quote, kicker,
 * headline, beats, list, stack, punch, edit-mark, credit, qr). What the kit
 * does not have is below in one scoped block, every class prefixed "a5-",
 * tokens only. The block is added to <head> once, so the stage, the overview,
 * the presenter view and the PDF all get it.
 *
 * The one scene these slides use is 'a5-cue' (scenes/close.js): it marks a
 * build as being played, for two CSS flourishes. Without it the slides still
 * build correctly.
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var YOUR = window.YOUR || {};
  var speaker = YOUR.speaker || {};
  var links = YOUR.links || {};
  var session = YOUR.event || {};

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------------------------------------------------------------
   * Shannon, The Bandwagon, 1956: line 5 of the brief's section 6, exactly.
   * Checked there word for word against a scan of the page. Do not retype.
   * ------------------------------------------------------------------- */
  var SHANNON_5 = 'A few first rate research papers are preferable to a large number that are poorly conceived or half-finished.';
  var SHANNON_CREDIT = 'Claude Shannon, The Bandwagon, 1956';
  var STRUCK = 'research papers';        // his words, struck through at step 1
  var WRITTEN_IN = 'AI projects';        // ours, written in, flagged "our edit"

  /* The sentence is set in five lines, broken by sense. The struck words open
   * a line of their own, so the correction has a clear line to sit on and
   * nothing reflows when it is made. Every piece is sliced out of SHANNON_5:
   * the words on screen are that string and nothing else. */
  function shannonMarkup() {
    var at = SHANNON_5.indexOf(STRUCK);
    var rest = at < 0 ? '' : SHANNON_5.slice(at + STRUCK.length).trim();   // "are preferable ... half-finished."
    var a = rest.indexOf(' that are ');                                  // break before "that are poorly conceived"
    var b = rest.indexOf(' or half-finished');                            // break before "or half-finished."
    if (at < 0 || a < 0 || b < a) { return '“' + esc(SHANNON_5) + '”'; }   // never guess: show it whole
    var flag = (window.THEME && window.THEME.tags && window.THEME.tags.edit) || 'our edit';
    return '“' + esc(SHANNON_5.slice(0, at).trim()) + '<br>' +
      '<span class="edit-mark"><s>' + esc(STRUCK) + '</s><ins data-step="1" data-anim="stamp">' + esc(WRITTEN_IN) + '<small>' + esc(flag) + '</small></ins></span><br>' +
      esc(rest.slice(0, a)) + '<br>' + esc(rest.slice(a + 1, b)) + '<br>' + esc(rest.slice(b + 1)) + '”';
  }

  /* ---------------------------------------------------------------------
   * The wall: the last sentence of the talk as one fitted stack that fills
   * the stage. Its geometry is worked out here, once, and handed to both the
   * markup (data-fit-size, data-fit-h) and the stylesheet (the Flare band),
   * so the band always sits where the last line is.
   * ------------------------------------------------------------------- */
  var CAP = (window.THEME && window.THEME.metrics && window.THEME.metrics.cap) || 0.688;   // Archivo's cap height, in em
  var WALL = {
    size: 316,        // px. The longest line ("the exciting.") is then the tightest: width 65 of 62 to 125
    top: 56,          // cap-top of the first line
    baseline: 1030,   // baseline of the last line: 50px of Flare under it, then the edge of the stage
    before: 44,       // extra room above the last line, so the band has an edge to itself
    lines: 4
  };
  WALL.fitH = WALL.baseline - WALL.top - WALL.before;                       // first cap-top to last baseline, as fitStack counts it
  WALL.pitch = (WALL.fitH - CAP * WALL.size) / (WALL.lines - 1);
  WALL.bandTop = Math.round(WALL.top + (WALL.lines - 2) * WALL.pitch + CAP * WALL.size + 22);   // 22px under the baseline of line 3

  /* The wall's clock, in milliseconds after the click, at 120 BPM (a beat is
   * 500, the swung off-beat 333, a block reveal 125 in and 250 out). The
   * markup, the keyframes, the cue and the speaker notes all read these. */
  var BEAT = 500, SWING = 333, BLOCK_IN = 125, BLOCK_OUT = 250;
  var CLOCK = {
    line1: BEAT / 2,                  // an eighth of empty stage, then SAY NO TO
    line2: BEAT / 2 + SWING,          // THE EXCITING. on the swung off-beat
    holdFrom: 2 * BEAT,               // stop-time: the field prints in negative...
    holdTo: 4 * BEAT,                 // ...for two beats, then cuts back
    line3: 4 * BEAT + BEAT / 2,       // SAY YES TO
    line4: 6 * BEAT + BEAT / 2,       // one full beat of nothing after line 3 has landed, then THE MATH.
    length: 8 * BEAT                  // the bar the stop-time keyframes are written against
  };
  CLOCK.end = CLOCK.line4 + BLOCK_IN + BLOCK_OUT;                 // the last bar has gone
  CLOCK.cue = (CLOCK.end + 2 * BEAT) / 1000;                      // seconds the "is-playing" cue stays up
  function pct(ms) { return (ms / CLOCK.length * 100).toFixed(3) + '%'; }

  /* The sentence as it reads after our edit: for the speaker notes only. */
  var SHANNON_5_EDITED = SHANNON_5.replace(STRUCK, WRITTEN_IN);

  /* ---------------------------------------------------------------------
   * The speaker and the link, from window.YOUR
   * ------------------------------------------------------------------- */
  var name = speaker.name || '';
  var roleLine = [speaker.role, speaker.company].filter(Boolean).join(', ');
  var repoUrl = String(links.repoUrl || '').trim();
  var repoShown = repoUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');    // what is printed: the address without the scheme
  // the end of the session, for the notes: the part of "2:30–4:00 PM" after the dash
  var endsAt = String(session.time || '').split(/[–—-]/).pop().replace(/\s*[AP]M\s*$/i, '').trim();

  /* A QR code only when lib/qr.js is on the page AND says it has been
   * verified against a decoder. Otherwise the link is shown as text alone. */
  function repoQr() {
    var QR = window.QR;
    if (!repoUrl || !QR || QR.verified !== true || typeof QR.toSVG !== 'function') { return ''; }
    try {
      var opts = { title: repoShown };
      // the code is always Lampblack on Card (the two printing inks), whatever the slide's ground
      if (window.THEME) { opts.dark = window.THEME.color('--lampblack'); opts.light = window.THEME.color('--card'); }
      return QR.toSVG(repoUrl, opts);
    } catch (err) {
      return '';                          // an address too long for a code: text only
    }
  }
  var qrSvg = repoQr();

  /* ---------------------------------------------------------------------
   * Styles the kit does not have. Tokens only. Floors: running text 36px or
   * more, labels 32px or more, Fraunces 54px or more at weight 600, wonk off.
   * ------------------------------------------------------------------- */
  var css = `
/* ---- shared: a numeral that is printed hollow until its line has been said.
        Shape, not tint: hollow is "not yet", solid is "said". ---- */
.slide .a5-beats > li:has(> [data-step]:not(.is-visible))::before,
.slide ol.a5-monday > li:has(> [data-step]:not(.is-visible))::before {
  color: var(--c-bg);
  -webkit-text-stroke: 10px var(--c-ink);
  paint-order: stroke fill;
}

/* ---- who-owns: one line on Card, a rest, then the question in the second voice ---- */
.slide .a5-back {
  margin-top: auto;
  margin-bottom: 0;
  max-width: none;
  font-size: 104px;
  white-space: nowrap;
}
.slide .a5-ask {
  align-self: flex-start;                /* as wide as its words, so the voice wipe runs across the words */
  margin-top: 64px;
  margin-bottom: auto;
  margin-left: -0.1em;                   /* the italic W leans away from the margin: pull it back onto the grid line */
  font-size: 216px;                      /* the theme's sturdy cut (opsz 72): its thin strokes survive a lit room */
  line-height: 1;
  letter-spacing: -0.012em;
  white-space: nowrap;
}

/* ---- the-objection: the objection in the human voice; the answer is a block
        with weight that lands on the slide and stops dead ---- */
/* At this size the opening mark cannot hang in the 40px gutter without
   touching the spine, so the mark sits on the grid line and both lines of
   words align to the right of it. */
.slide .a5-objection {
  margin-top: 40px;
  margin-left: -0.1em;
  max-width: none;
  font-size: 140px;
  line-height: 1.06;
}
.slide .a5-answer {
  position: absolute;
  left: var(--spine-w);
  right: 0;
  top: 600px;
  bottom: 0;
  background: var(--c-accent);
  color: var(--c-accent-ink);
}
.slide .a5-answer > .stack {
  position: absolute;
  left: calc(var(--m-x) - var(--spine-w));
  top: 120px;
  width: var(--content-w);
}
/* played (not merely shown): everything above the block recoils as it stops */
@keyframes a5-recoil {
  0% { translate: 0 14px; }
  100% { translate: 0 0; }
}
.slide.is-playing[data-playing="1"] .a5-recoil {
  animation: a5-recoil var(--d-jolt) var(--e-arrive) var(--d-drop) 1 normal none;
}

/* ---- share-the-gain: the kit's .beats (a path of numbered steps), set
        larger than its default because there are only three ---- */
.slide .a5-beats { margin-top: var(--s-2); column-gap: var(--s-5); }
.slide .a5-beats > li {
  min-height: 388px;
  padding: 216px var(--s-3) var(--s-5);
  margin: 0 calc(var(--s-3) * -1);
  font-size: 60px;
  font-weight: 700;
  line-height: 1.08;
}
.slide .a5-beats > li::before { left: var(--s-3); top: var(--s-5); font-size: 180px; }
.slide .a5-beats > li:not(:last-child)::after { right: calc(var(--s-5) * -0.5 + var(--s-3) - 14px); }
.slide .a5-beats > li > span { position: relative; display: block; }
/* the third beat is the point: a Flare block drops in behind it */
.slide .a5-beats .a5-flare {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: calc((var(--m-right) - var(--s-3)) * -1);      /* the one field that breaks the frame: off the right edge */
  background: var(--c-accent);
}
.slide .a5-beats > li.a5-point::before { z-index: 1; }
.slide .a5-hide {
  align-self: flex-start;
  margin-top: 64px;
  max-width: none;
  font-size: 76px;
  line-height: 1.14;
}

/* ---- waypoint-standard: THE WAYPOINT FOUR return. The same pattern as on
        whos-talking in Act 1 (slides/a1-bandwagon.js, ".four-boxes"), restated
        here so this file stands on its own, and set larger because here the
        boxes are the slide: an <ol> of four equal framed boxes in one row,
        each numbered by a CSS counter, the words in display caps on two lines.
        Same frame (--w-bold), same padding, same numeral, same type size as
        in Act 1; only the height differs. They are equals, so they share one
        width and one size and are never fitted. ---- */
.slide .a5-four {
  counter-reset: four;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: var(--gutter);
  margin-top: var(--s-1);
}
.slide .a5-four > li {
  counter-increment: four;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 400px;
  padding: 0 24px 26px;
  border: var(--w-bold) solid var(--c-line);
  font-family: var(--f-display);
  font-size: 98px;
  font-weight: var(--wght-display);
  font-stretch: var(--wdth-display);
  line-height: 0.8;
  text-transform: uppercase;
  white-space: nowrap;
}
.slide .a5-four > li::before {
  content: counter(four);
  position: absolute;
  left: 24px;
  top: 24px;
  font-size: 64px;
  line-height: var(--lh-cap);
  font-variant-numeric: tabular-nums;
}
.slide .a5-proof {
  align-self: flex-start;
  margin-top: auto;
  margin-bottom: auto;
  max-width: none;
  font-size: 120px;
  line-height: 1.08;
}
.slide .a5-proof .punch { padding: 0 0.12em; }

/* ---- monday: the kit's numbered list, set large because it is the ask ---- */
.slide .a5-monday {
  max-width: none;
  margin-top: var(--s-3);
}
.slide .a5-monday > li {
  min-height: 228px;
  gap: 60px;
  font-size: 88px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.slide ol.a5-monday > li::before { width: 104px; font-size: 180px; }
.slide .a5-monday .punch {
  padding: 0.04em 0.14em 0;
  font-family: var(--f-display);
  font-weight: var(--wght-display);
  font-stretch: var(--wdth-display);
  letter-spacing: 0;
  text-transform: uppercase;
}

/* ---- close: his sentence, our edit, then the wall ---- */
.slide .a5-shannon {
  margin-top: auto;
  max-width: none;
  font-size: 96px;
  line-height: 1.22;
  white-space: nowrap;
}
.slide .a5-shannon + .attribution { margin-top: var(--s-6); margin-bottom: auto; }
/* The struck words have a line to themselves, so the room for the correction
   is kept from the start (nothing reflows) and the block can drop into it. */
.slide .a5-shannon .edit-mark > ins[data-step]:not(.is-visible) { display: inline-flex; }
.slide .a5-wall {
  position: absolute;
  left: var(--spine-w);
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  background: var(--c-bg);
  color: var(--c-ink);
}
.slide .a5-wall > .stack {
  position: absolute;
  left: calc(var(--m-x) - var(--spine-w));
  top: ${WALL.top}px;
  width: var(--content-w);
}
/* the last line is the point of the slide: Lampblack on the Flare band */
.slide .a5-wall .ln.a5-math {
  margin-top: ${WALL.before}px;
  color: var(--c-accent-ink);
}
/* the band: the one field that bleeds, off the right edge and off the foot */
.slide .a5-band {
  position: absolute;
  left: 0;
  right: 0;
  top: ${WALL.bandTop}px;
  bottom: 0;
  background: var(--c-accent);
}

/* PLAYED (the speaker pressed next; scenes/close.js puts "is-playing" on the
   slide). Shown any other way, the wall is simply there, complete.

   Each line arrives by the deck's block reveal: a bar of ink runs across the
   measure in a sixteenth, then its left edge retreats in an eighth and leaves
   the line behind. --a5-at on a line is when it starts. Between the two
   sentences the field prints in negative for two beats (Card and Lampblack
   swap; the spine stays Lampblack, so the whole stage is one black field),
   then cuts back, and the last line arrives with its Flare band after a full
   beat of nothing.

       ${(CLOCK.line1 / 1000).toFixed(2)}  SAY NO TO          ${(CLOCK.line3 / 1000).toFixed(2)}  SAY YES TO
       ${(CLOCK.line2 / 1000).toFixed(2)}  THE EXCITING.      ${(CLOCK.line4 / 1000).toFixed(2)}  THE MATH. (and the band)
       ${(CLOCK.holdFrom / 1000).toFixed(2)} to ${(CLOCK.holdTo / 1000).toFixed(2)}  stop-time, in negative

   These are keyframe animations, not the theme's data-anim="pop" transitions,
   for two reasons found by looking at frames: the theme refits every [data-fit]
   stack on each step change with transitions switched off, which cancels a
   transition on a stack line that is revealed by that same step; and --delay
   does not reach the ::after bar of a pop. Same note values, same curves. */
.slide .a5-wall .ln { position: relative; }
.slide .a5-wall .ln::after {
  content: "";
  position: absolute;
  inset: -8px -0.08em;                     /* less than half the gap between lines: a bar never touches its neighbour */
  background: currentColor;
  clip-path: inset(0 0 0 100%);            /* at rest the bar has gone */
  pointer-events: none;
}
@keyframes a5-line-in {
  from { clip-path: inset(-0.12em 100% -0.12em 0); }       /* nothing shows: not even the bar's overhang */
  to { clip-path: inset(-0.12em -0.12em -0.12em -0.12em); }
}
@keyframes a5-bar-out {
  from { clip-path: inset(0 0 0 0); }
  to { clip-path: inset(0 0 0 100%); }
}
@keyframes a5-band-in {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0 0 0 0); }
}
@keyframes a5-stop-time {
  0% { background-color: var(--card); color: var(--lampblack); }
  ${pct(CLOCK.holdFrom)} { background-color: var(--lampblack); color: var(--card); }
  ${pct(CLOCK.holdTo)} { background-color: var(--card); color: var(--lampblack); }
  100% { background-color: var(--card); color: var(--lampblack); }
}
.slide.is-playing[data-playing="2"] .a5-wall { animation: a5-stop-time ${CLOCK.length}ms step-end 0s 1 normal none; }
.slide.is-playing[data-playing="2"] .a5-wall .ln { animation: a5-line-in var(--d-block-in) linear var(--a5-at, 0s) 1 normal backwards; }
.slide.is-playing[data-playing="2"] .a5-wall .ln::after { animation: a5-bar-out var(--d-block-out) var(--e-arrive) calc(var(--a5-at, 0s) + var(--d-block-in)) 1 normal backwards; }
.slide.is-playing[data-playing="2"] .a5-band { animation: a5-band-in var(--d-block-in) linear var(--a5-at, 0s) 1 normal backwards; }

/* ---- thanks: quiet above, one Flare band below, the italic gone huge ---- */
.slide .a5-ty {
  margin-top: 84px;
  margin-bottom: 0;
}
.slide .a5-credit { margin-top: 64px; }
.slide .a5-credit b { font-size: 64px; margin-bottom: 18px; }
.slide .a5-credit span { font-size: 44px; font-stretch: var(--wdth-text); }
.slide .a5-link {
  margin-top: 40px;
  font-family: var(--f-mono);
  font-weight: var(--wght-label);
  font-stretch: var(--wdth-text);
  line-height: 1.15;
  letter-spacing: 0.01em;
  overflow-wrap: anywhere;
  max-width: 1160px;
}
.slide .a5-link > span { display: inline-block; max-width: 100%; }
.slide .a5-qr { position: absolute; right: var(--m-right); top: var(--m-y); width: 400px; }
.slide .a5-questions {
  position: absolute;
  left: var(--spine-w);
  right: 0;
  bottom: 0;
  height: 452px;
  background: var(--c-accent);
  color: var(--c-accent-ink);
}
.slide .a5-questions > .voice {
  position: absolute;
  left: calc(var(--m-x) - var(--spine-w) - 10px);
  bottom: 96px;
  font-size: 340px;
  line-height: 0.8;
  white-space: nowrap;
}

/* the cue is a stage-hand: it never shows, on stage or in a thumbnail */
.slide [data-scene="a5-cue"] { display: none; }
`;
  var style = document.createElement('style');
  style.setAttribute('data-from', 'slides/a5-close.js');
  style.textContent = css;
  document.head.appendChild(style);

  /* =====================================================================
   * who-owns
   * =================================================================== */
  Deck.slide({
    id: 'who-owns',
    act: 5,
    title: 'Who owns the minutes?',
    minutes: 0.5,
    layout: 'statement',
    html: `
      <p class="say a5-back">We just got the minutes back.</p>
      <p class="voice a5-ask" data-step="1" data-anim="wipe">Who owns them?</p>
    `,
    notes: `
      SAY: That was the build. The minutes came back.
      Now the part a business case usually skips.
      Who owns them?

      DO: Click once for the question. Then stop. Count to three before you say anything.

      NEXT: If you're already thinking the objection, I'll say it for you.
    `
  });

  /* =====================================================================
   * the-objection
   * =================================================================== */
  Deck.slide({
    id: 'the-objection',
    act: 5,
    title: 'The objection',
    minutes: 1.5,
    layout: 'quote',
    html: `
      <p class="kicker a5-recoil">The objection</p>
      <blockquote class="quote a5-objection a5-recoil">“My people will just<br>waste the time.”</blockquote>
      <div class="a5-answer" data-step="1" data-anim="stamp">
        <p class="stack" data-fit data-fit-gap="30">
          <span class="ln">That’s a management answer.</span>
          <span class="ln">It isn’t an AI problem.</span>
        </p>
      </div>
      <i hidden data-scene="a5-cue" data-opts='{"at": 1, "for": 1.5}'></i>
    `,
    notes: `
      SAY: “My people will just waste the time.” It's a fair worry. I'm not making fun of it.
      But listen to what the sentence is about. It isn't about the tool.
      The tool did its job. It handed back minutes.
      What those minutes turn into is a decision, and the decision is ours. Freed time is a management decision.
      If nobody decides, the time leaks away. That isn't the AI failing. That's us not managing.

      DO: Read the objection out loud first. Click. Let the answer land before you speak again.

      NEXT: So what does managing it look like? Three things. And this next slide is my view, not a study.
    `
  });

  /* =====================================================================
   * share-the-gain   (his view, stated as his view: no statistics)
   * =================================================================== */
  Deck.slide({
    id: 'share-the-gain',
    act: 5,
    title: 'Share the gain',
    minutes: 2,
    layout: 'list',
    html: `
      <p class="kicker">My view</p>
      <h2 class="headline is-hero">Share the gain.</h2>
      <ol class="beats a5-beats">
        <li><span data-step="1">Name the goal for the freed time</span></li>
        <li><span data-step="2">Measure it</span></li>
        <li class="a5-point"><i class="a5-flare" data-step="3" data-anim="stamp"></i><span data-step="3" style="--delay: 375ms">Share the upside</span></li>
      </ol>
      <p class="sub a5-hide" data-step="4" data-anim="wipe">People hide time savings that threaten them.<br>They report the ones they share in.</p>
    `,
    notes: `
      SAY: This one is my opinion. I'm not quoting research. It's where I stand.
      One. Name the goal for the freed time before the tool ships. Decide what the hours are for.
      Two. Measure it. The same way we measured the minutes.
      Three. Share the upside. Income, a bonus, or an ownership stake, tied to the growth the time makes possible.
      Here's why. People hide time savings that threaten them. They report the ones they share in.
      And the people who are content with the status quo are not who you build around.

      DO: One click per beat, then one more for the last line. Say “this is my view” out loud.

      YOUR STORY: how the gain gets shared where you work, if you want to tell it. If not, skip it and move on.

      NEXT: If you're going to share the gain, you have to be able to prove the gain. Back to Waypoint.
    `
  });

  /* =====================================================================
   * waypoint-standard   (rhymes with whos-talking in Act 1: the same four boxes)
   * =================================================================== */
  // the four things a Waypoint win has to show (brief, section 2), each on two lines
  var FOUR = [['The', 'task'], ['The', 'prompt'], ['The', 'output'], ['The time', 'saved']];

  Deck.slide({
    id: 'waypoint-standard',
    act: 5,
    title: 'The Waypoint standard',
    minutes: 1,
    layout: 'statement',
    html: `
      <p class="kicker">The Waypoint standard</p>
      <ol class="a5-four">
        ${FOUR.map(function (w) { return '<li>' + esc(w[0]) + '<br>' + esc(w[1]) + '</li>'; }).join('')}
      </ol>
      <p class="say a5-proof" data-step="1" data-anim="pop">If you can’t show <span class="punch">all four</span>,<br>it didn’t happen.</p>
    `,
    notes: `
      SAY: You saw these four at the start. It's the Waypoint standard.
      The task. The prompt. The output. The time saved.
      A win only counts with all four.
      That's what keeps a shared gain honest. If you can't show all four, it didn't happen.
      Proof, not vibes.

      DO: Point at the four boxes, left to right. Click for the line.

      NEXT: So here is what I'm asking you to do on Monday.
    `
  });

  /* =====================================================================
   * monday
   * =================================================================== */
  Deck.slide({
    id: 'monday',
    act: 5,
    title: 'Monday morning',
    minutes: 1,
    layout: 'list',
    html: `
      <h2 class="headline">Monday morning.</h2>
      <ol class="list is-l a5-monday">
        <li><span data-step="1">Inventory two weeks.</span></li>
        <li><span data-step="2">Run three through the gates.</span></li>
        <li><span data-step="3">Say <b class="punch">no</b> twice.</span></li>
      </ol>
    `,
    notes: `
      SAY: Three things. You already hold the worksheet for the first two.
      One. Inventory two weeks of real work. You started today. Finish it.
      Two. Run three candidates through the four gates.
      Three. Say no twice. Out loud, to the two that lose.
      That leaves one. Build that one.

      DO: One click per line. Hold up the worksheet.

      NEXT: One more line from 1956.
    `
  });

  /* =====================================================================
   * close
   *   step 0   Shannon's sentence as written, attributed
   *   step 1   "research papers" struck through, "AI projects" written in: our edit
   *   step 2   the wall: "Say no to the exciting. Say yes to the math."
   *            Played, it takes under four seconds (CLOCK, above): two lines,
   *            a stop-time hold in negative, then the last two lines.
   * =================================================================== */
  Deck.slide({
    id: 'close',
    act: 5,
    title: 'Close: say yes to the math',
    minutes: 1,
    layout: 'quote',
    steps: 2,
    html: `
      <blockquote class="quote a5-shannon" data-step-out="2">${shannonMarkup()}</blockquote>
      <p class="attribution" data-step-out="2">${esc(SHANNON_CREDIT)}</p>
      <div class="a5-wall" data-step="2">
        <i class="a5-band" style="--a5-at: ${CLOCK.line4}ms"></i>
        <p class="stack" data-fit data-fit-size="${WALL.size}" data-fit-h="${WALL.fitH}">
          <span class="ln" style="--a5-at: ${CLOCK.line1}ms">Say no to</span>
          <span class="ln" style="--a5-at: ${CLOCK.line2}ms">the exciting.</span>
          <span class="ln" style="--a5-at: ${CLOCK.line3}ms">Say yes to</span>
          <span class="ln a5-math" style="--a5-at: ${CLOCK.line4}ms">the math.</span>
        </p>
      </div>
      <i hidden data-scene="a5-cue" data-opts='{"at": 2, "for": ${CLOCK.cue}}'></i>
    `,
    notes: `
      SAY: Shannon again. Same page, 1956. This is his sentence, as he wrote it.
      (click) And this is the same swap we made at the start. Our edit, not his.
      “${SHANNON_5_EDITED}”
      (click) Say no to the exciting. Say yes to the math.

      DO: Read his sentence first. Click for the edit. Click once more and say the last line with the screen. “Say no to the exciting.” The screen goes black for ${(CLOCK.holdTo - CLOCK.holdFrom) / 1000 === 1 ? 'one second' : (CLOCK.holdTo - CLOCK.holdFrom) / 1000 + ' seconds'}: say nothing. Then “Say yes to the math.” The whole build takes about ${Math.round(CLOCK.end / 1000)} seconds. Do not click again until it has landed.

      NEXT: Thank you.
    `
  });

  /* =====================================================================
   * thanks   (stays up through Q&A)
   * =================================================================== */
  // A short address is set large; a long one steps down, never under 36px, and
  // breaks after a slash before it breaks inside a name.
  var linkSize = repoShown.length <= 30 ? 48 : (repoShown.length <= 44 ? 40 : 36);
  var linkParts = repoShown.split('/').map(function (part, i, all) {
    return '<span>' + esc(part) + (i < all.length - 1 ? '/' : '') + '</span>';
  }).join('');
  var linkHtml = repoUrl
    ? '<p class="a5-link" data-select="text" style="font-size: ' + linkSize + 'px">' + linkParts + '</p>'
    : '';
  var qrHtml = qrSvg
    ? '<figure class="qr a5-qr"><div class="qr-code">' + qrSvg + '</div><figcaption>Deck and code</figcaption></figure>'
    : '';

  Deck.slide({
    id: 'thanks',
    act: 5,
    title: 'Thank you. Questions.',
    minutes: 3,
    layout: 'statement',
    html: `
      <p class="say is-l a5-ty">Thank you.</p>
      <p class="credit a5-credit"><b>${esc(name)}</b><span>${esc(roleLine)}</span></p>
      ${linkHtml}
      ${qrHtml}
      <div class="a5-questions"><p class="voice">Questions.</p></div>
    `,
    notes: `
      SAY: Thank you.
      I'm ${name}, ${roleLine}.
      ${repoUrl ? 'The deck and the code are at the address on the screen.\n      ' : ''}Questions.

      DO: Leave this slide up for all of Q&A. If the room is quiet, ask who killed their favorite today.

      NEXT: Q&A until ${endsAt}. Then stop on time.
    `
  });
}());
