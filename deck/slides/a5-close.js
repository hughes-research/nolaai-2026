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
  var event = YOUR.event || {};

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

  /* The sentence is cut at the struck words and at two line breaks chosen so
   * the struck words open a line of their own: the correction then has a
   * clear line to sit on and nothing reflows when it is made. The pieces are
   * sliced from SHANNON_5, so the text on screen is that string and nothing else. */
  function shannonMarkup() {
    var at = SHANNON_5.indexOf(STRUCK);
    var before = SHANNON_5.slice(0, at).trim();                       // "A few first rate"
    var after = SHANNON_5.slice(at + STRUCK.length).trim();           // "are preferable ... half-finished."
    var cut = after.indexOf(' that are ') + ' that'.length;           // break after "... a large number that"
    var line3 = after.slice(0, cut);
    var line4 = after.slice(cut).trim();
    var flag = (window.THEME && window.THEME.tags && window.THEME.tags.edit) || 'our edit';
    return '“' + esc(before) + '<br>' +
      '<span class="edit-mark"><s>' + esc(STRUCK) + '</s><ins data-step="1">' + esc(WRITTEN_IN) + '</ins><small>' + esc(flag) + '</small></span><br>' +
      esc(line3) + '<br>' + esc(line4) + '”';
  }

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
  var endsAt = String(event.time || '').split(/[–—-]/).pop().replace(/\s*[AP]M\s*$/i, '').trim();

  /* A QR code only when lib/qr.js is on the page AND says it has been
   * verified against a decoder. Otherwise the link is shown as text alone. */
  function repoQr() {
    var QR = window.QR;
    if (!repoUrl || !QR || QR.verified !== true || typeof QR.toSVG !== 'function') { return ''; }
    try {
      var dark = (window.THEME && window.THEME.color('--lampblack')) || '#050505';
      var light = (window.THEME && window.THEME.color('--card')) || '#F4EDDE';
      return QR.toSVG(repoUrl, { dark: dark, light: light, title: repoShown });
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
  margin-top: 64px;
  margin-bottom: auto;
  font-size: 216px;
  font-variation-settings: "opsz" 144, "SOFT" 0, "WONK" 0;
  line-height: 1;
  letter-spacing: -0.015em;
  white-space: nowrap;
}

/* ---- the-objection: the objection in the human voice; the answer is a block
        with weight that lands on the slide and stops dead ---- */
.slide .a5-objection {
  margin-top: 40px;
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
  top: 112px;
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

/* ---- share-the-gain: three beats on a path, bigger than the kit's default
        because there are only three ---- */
.slide .a5-beats { margin-top: var(--s-2); column-gap: var(--s-5); }
.slide .a5-beats > li {
  min-height: 356px;
  padding: 176px var(--s-3) var(--s-4);
  margin: 0 calc(var(--s-3) * -1);
  font-size: 56px;
  font-weight: 700;
  line-height: 1.08;
}
.slide .a5-beats > li::before { left: var(--s-3); font-size: 150px; }
.slide .a5-beats > li:not(:last-child)::after { right: calc(var(--s-5) * -0.5 + var(--s-3) - 14px); }
.slide .a5-beats > li > span { position: relative; display: block; }
/* the third beat is the point: a Flare block drops in behind it */
.slide .a5-beats .a5-flare {
  position: absolute;
  inset: 0;
  background: var(--c-accent);
}
.slide .a5-beats > li.a5-point::before { z-index: 1; }
.slide .a5-hide {
  margin-top: var(--s-6);
  max-width: none;
  font-size: var(--t-voice-l);
  line-height: 1.16;
}

/* ---- waypoint-standard: four equal boxes in one row. They are equals, so
        they share one width and one size and are never fitted. ---- */
.slide .a5-four {
  counter-reset: four;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  column-gap: var(--gutter);
  margin-top: var(--s-2);
}
.slide .a5-four > li {
  counter-increment: four;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 400px;
  padding: 0 28px 34px;
  border: var(--w-bold) solid var(--c-line);
  font-family: var(--f-display);
  font-size: 112px;
  font-weight: var(--wght-display);
  font-stretch: var(--wdth-display);
  line-height: 0.8;
  text-transform: uppercase;
  white-space: nowrap;
}
.slide .a5-four > li::before {
  content: counter(four);
  position: absolute;
  left: 28px;
  top: 30px;
  font-size: 64px;
  line-height: var(--lh-cap);
  font-variant-numeric: tabular-nums;
}
.slide .a5-proof {
  margin-top: var(--s-6);
  max-width: none;
  font-size: 96px;
  line-height: 1.08;
}
.slide .a5-proof .punch { padding: 0 0.12em; }

/* ---- monday: the kit's numbered list, set large because it is the ask ---- */
.slide .a5-monday {
  max-width: none;
  margin-top: var(--s-3);
}
.slide .a5-monday > li {
  min-height: 216px;
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
  top: var(--m-y);
  width: var(--content-w);
}
/* played: after "Say no to the exciting." has landed the field prints in
   negative for two beats (Card and Lampblack swap), then cuts back. The spine
   stays Lampblack, so for those two beats the whole stage is one black field. */
@keyframes a5-stop-time {
  0% { background-color: var(--card); color: var(--lampblack); }
  25% { background-color: var(--lampblack); color: var(--card); }
  50% { background-color: var(--card); color: var(--lampblack); }
  100% { background-color: var(--card); color: var(--lampblack); }
}
.slide.is-playing[data-playing="2"] .a5-wall { animation: a5-stop-time 4000ms step-end 0s 1 normal none; }

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
      Now the question that is never in the business case.
      Who owns them?

      DO: Click once for the question. Then stop. Count to three before you say anything.

      NEXT: Somebody in this room is already thinking the objection. So I'll say it for them.
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
        <p class="stack" data-fit>
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
        <li class="a5-point"><i class="a5-flare" data-step="3" data-anim="stamp"></i><span data-step="3" style="--delay: 250ms">Share the upside</span></li>
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
  Deck.slide({
    id: 'waypoint-standard',
    act: 5,
    title: 'The Waypoint standard',
    minutes: 1,
    layout: 'statement',
    html: `
      <p class="kicker">The Waypoint standard</p>
      <ol class="a5-four">
        <li>The<br>task</li>
        <li>The<br>prompt</li>
        <li>The<br>output</li>
        <li>The time<br>saved</li>
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
      SAY: Three things. They fit on the worksheet in your hand.
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
   *            Played, it takes about four seconds: two lines, a stop-time
   *            hold in negative, then the last two lines.
   * =================================================================== */
  Deck.slide({
    id: 'close',
    act: 5,
    title: 'Say no to the exciting. Say yes to the math.',
    minutes: 1,
    layout: 'quote',
    steps: 2,
    html: `
      <blockquote class="quote a5-shannon" data-step-out="2">${shannonMarkup()}</blockquote>
      <p class="attribution" data-step-out="2">${esc(SHANNON_CREDIT)}</p>
      <div class="a5-wall" data-step="2">
        <p class="stack" data-fit data-fit-max="300">
          <span class="ln" data-step="2" data-anim="pop" style="--delay: 250ms">Say no to</span>
          <span class="ln" data-step="2" data-anim="pop" style="--delay: 583ms">the exciting.</span>
          <span class="ln" data-step="2" data-anim="pop" style="--delay: 2250ms">Say yes to</span>
          <span class="ln is-punch" data-step="2" data-anim="pop" style="--delay: 3250ms">the math.</span>
        </p>
      </div>
      <i hidden data-scene="a5-cue" data-opts='{"at": 2, "for": 4.5}'></i>
    `,
    notes: `
      SAY: Shannon again. Same page, 1956. This is his sentence, as he wrote it.
      (click) And this is the same swap we made at the start. Our edit, not his.
      “${SHANNON_5_EDITED}”
      (click) Say no to the exciting. Say yes to the math.

      DO: Read his sentence first. Click for the edit. Click for the last line, then say it with the screen: it takes about four seconds to land. Do not talk over the black hold in the middle.

      NEXT: Thank you.
    `
  });

  /* =====================================================================
   * thanks   (stays up through Q&A)
   * =================================================================== */
  var linkSize = repoShown.length <= 30 ? 48 : (repoShown.length <= 44 ? 40 : 36);
  var linkHtml = repoUrl
    ? '<p class="a5-link" data-select="text" style="font-size: ' + linkSize + 'px">' + esc(repoShown) + '</p>'
    : '';
  var qrHtml = qrSvg
    ? '<figure class="qr a5-qr"><div class="qr-code">' + qrSvg + '</div><figcaption>The deck and the code</figcaption></figure>'
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
      ${repoUrl ? 'The deck and the code are at the address on the screen.' : 'Find me afterwards if you want the worksheet or the screener.'}
      Questions.

      DO: Leave this slide up for all of Q&A. If the room is quiet, ask who killed their favorite today.

      NEXT: Q&A until ${endsAt}. Then stop on time.
    `
  });
}());
