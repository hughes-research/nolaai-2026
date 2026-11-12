/*
 * slides/a5-close.js: Act 5, "Who Owns the Minutes?" (minutes 80 to 90).
 *
 *   who-owns            0.5   one quiet line, then the question
 *   the-objection       1.5   the objection, then the answer landing on the slide
 *   share-the-gain      2     three beats and one line. HIS VIEW, not a finding
 *   waypoint-standard   1     the four Waypoint items return (rhymes with whos-talking)
 *   monday              1     three numbered actions
 *   close               1     Shannon, our edit, then the last sentence of the talk
 *   thanks              4     stays on screen through Q&A (the notes hold the hard questions)
 *                      --
 *                      11 minutes
 *
 * Copy is final (docs/BRIEF.md, section 8). The Shannon sentence is line 5 of
 * section 6, held once in SHANNON_5 below and never retyped: the slide markup
 * is cut out of that string, so the words on screen cannot drift from it. The
 * last sentence of the talk is held once in LAST and every place it appears
 * (the wall, the PDF page, the thanks slide, the notes) is built from that.
 *
 * Nothing here is a number from data. The name, role and company come from
 * window.YOUR.speaker, the end of the session from window.YOUR.event.time, the
 * repository link from window.YOUR.links.repoUrl. When that link is filled in,
 * the thanks slide shows it as text and as a QR code drawn by lib/qr.js (the
 * encoder is read back by a decoder in tools/test-screener.js). If a code
 * cannot be drawn, the link is shown as text alone.
 *
 * Every duration is a note value read from the theme's tokens (--beat, --swing,
 * --d-block-in, ...), never typed here: see NOTE below.
 *
 * Styles: the theme's layouts and components first (say, quote, kicker,
 * headline, beats, list, stack, punch, edit-mark, credit, qr). What the kit
 * does not have is below in one scoped block, every class prefixed "a5-",
 * tokens only. The block is added to <head> once, so the stage, the overview,
 * the presenter view and the PDF all get it.
 *
 * The one scene these slides use is 'a5-cue' (scenes/close.js): it marks a
 * build as being PLAYED (the speaker pressed next) as opposed to SHOWN, and
 * the big moves here (a block dropping, the last sentence arriving) hang on
 * that mark. Without it the slides still build correctly, as cuts.
 */
(function () {
  'use strict';
  if (!window.Deck) { return; }

  var YOUR = window.YOUR || {};
  var THEME = window.THEME || null;
  var speaker = YOUR.speaker || {};
  var links = YOUR.links || {};
  var session = YOUR.event || {};

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------------------------------------------------------------
   * Time. The deck runs at 120 BPM and every duration is a note value kept in
   * theme/tokens.css. They are read here once, in milliseconds, so the start
   * times below, the keyframes and the figures in the speaker notes all move
   * with the tokens. The numbers after each name are only the fallback for a
   * page that has no theme.
   * ------------------------------------------------------------------- */
  function noteMs(token, fallback) {
    var raw = '';
    try {
      raw = THEME && THEME.color ? THEME.color(token) : window.getComputedStyle(document.documentElement).getPropertyValue(token);
    } catch (err) { raw = ''; }
    var n = parseFloat(raw);
    if (!(n > 0)) { return fallback; }
    return /ms\s*$/i.test(String(raw)) ? n : n * 1000;
  }
  var NOTE = {
    beat: noteMs('--beat', 500),
    swing: noteMs('--swing', 333),            // the swung off-beat
    blockIn: noteMs('--d-block-in', 125),     // block reveal: the bar runs across the line
    blockOut: noteMs('--d-block-out', 250),   // ...and its left edge retreats
    drop: noteMs('--d-drop', 375),            // a block coming down
    jolt: noteMs('--d-jolt', 375),            // the recoil after it
    hold: noteMs('--d-hold', 1000)            // stop-time: two beats in negative
  };
  function seconds(ms) { return Math.round(ms) / 1000; }

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
    var flag = (THEME && THEME.tags && THEME.tags.edit) || 'our edit';
    return '“' + esc(SHANNON_5.slice(0, at).trim()) + '<br>' +
      '<span class="edit-mark"><s>' + esc(STRUCK) + '</s><ins data-step="1" data-anim="stamp">' + esc(WRITTEN_IN) + '<small>' + esc(flag) + '</small></ins></span><br>' +
      esc(rest.slice(0, a)) + '<br>' + esc(rest.slice(a + 1, b)) + '<br>' + esc(rest.slice(b + 1)) + '”';
  }

  /* ---------------------------------------------------------------------
   * The last sentence of the talk (brief, section 8, close, step 3). Two
   * halves, each broken where the wall breaks it.
   * ------------------------------------------------------------------- */
  var LAST = [['Say no to', 'the exciting.'], ['Say yes to', 'the math.']];
  var LAST_HALVES = LAST.map(function (half) { return half.join(' '); });   // "Say no to the exciting." / "Say yes to the math."

  /* The wall: that sentence as one fitted stack that fills the stage. Its
   * geometry is worked out here, once, and handed to both the markup
   * (data-fit-size, data-fit-h) and the stylesheet (the Flare band), so the
   * band always sits where the last line is. */
  var CAP = (THEME && THEME.metrics && THEME.metrics.cap) || 0.688;   // Archivo's cap height, in em
  var WALL = {
    size: 316,        // px. The longest line ("the exciting.") is then the tightest, close to the narrow end of the width axis
    top: 56,          // cap-top of the first line
    baseline: 1030,   // baseline of the last line: 50px of Flare under it, then the edge of the stage
    before: 44,       // extra room above the last line, so the band has an edge to itself
    lines: 4
  };
  WALL.fitH = WALL.baseline - WALL.top - WALL.before;                       // first cap-top to last baseline, as fitStack counts it
  WALL.pitch = (WALL.fitH - CAP * WALL.size) / (WALL.lines - 1);
  WALL.bandTop = Math.round(WALL.top + (WALL.lines - 2) * WALL.pitch + CAP * WALL.size + WALL.before / 2);   // half the extra room under line 3, half over line 4

  /* Word spaces on the wall, in em, added to the font's own. At this size the
   * face's word space is too tight to read as a space, and it is not even:
   * where two Y's meet (SAY YES) their arms all but touch at cap height and
   * the line reads as one word. Each space is opened by eye until every gap
   * on the wall reads as the same gap. fitStack measures the line after these
   * are applied, so both edges stay flush. One entry per space, line by line. */
  var WALL_SPACES = [[0, 0], [0.045], [0.03, 0], [0]];
  // the PDF's smaller stack has the same SAY YES meeting, at the start of its second line
  var REPRISE_SPACES = [[], [0.05]];
  function wallLine(text, spaces) {
    spaces = spaces || [];
    return text.split(' ').map(esc).reduce(function (html, word, i) {
      var extra = spaces[i - 1] || 0;
      return html + (extra ? '<span style="word-spacing: ' + extra + 'em"> </span>' : ' ') + word;
    });
  }

  /* The wall's two clocks, in milliseconds after each click. One click per
   * half of the sentence, so the silence between the halves is the speaker's.
   *
   *   click one   an eighth of empty stage, SAY NO TO; THE EXCITING. on the
   *               swung off-beat; then stop-time: the field prints in negative
   *               for two beats and cuts back. It rests there, half built.
   *   click two   an eighth, SAY YES TO; THE MATH. and its Flare band one full
   *               beat later, on the beat.
   *
   * The markup, the keyframes, the cues and the speaker notes all read these. */
  var CLOCK = {
    no: { line1: NOTE.beat / 2, line2: NOTE.beat / 2 + NOTE.swing, holdFrom: 2 * NOTE.beat },
    yes: { line1: NOTE.beat / 2, line2: NOTE.beat / 2 + NOTE.beat }
  };
  CLOCK.no.holdTo = CLOCK.no.holdFrom + NOTE.hold;                          // the cut back to Card
  CLOCK.no.cue = seconds(CLOCK.no.holdTo + NOTE.beat);                       // seconds the "is-playing" cue stays up
  CLOCK.yes.end = CLOCK.yes.line2 + NOTE.blockIn + NOTE.blockOut;            // the last bar has gone
  CLOCK.yes.cue = seconds(CLOCK.yes.end + 2 * NOTE.beat);
  function pct(ms, of) { return (ms / of * 100).toFixed(3) + '%'; }

  /* The same sentence once more, smaller, for the PDF only: print mode lays a
   * slide out in its final state, which on the close would be the wall alone,
   * and a reader of the PDF would never see Shannon's sentence or that the
   * swap was ours. The PDF page shows both. Geometry as for the wall. */
  var REPRISE = {
    size: 176,        // px: "Say no to the exciting." then sits near the narrow end of the width axis
    baseline: 1030,
    before: 44
  };
  REPRISE.bandTop = Math.round(REPRISE.baseline - CAP * REPRISE.size - REPRISE.before / 2);
  REPRISE.top = Math.round(REPRISE.bandTop - REPRISE.before / 2 - CAP * REPRISE.size);     // cap-top of its first line
  REPRISE.fitH = REPRISE.baseline - REPRISE.top - REPRISE.before;

  /* ---------------------------------------------------------------------
   * The speaker and the link, from window.YOUR
   * ------------------------------------------------------------------- */
  var name = speaker.name || '';
  var roleLine = [speaker.role, speaker.company].filter(Boolean).join(', ');
  var repoUrl = String(links.repoUrl || '').trim();
  var repoShown = repoUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');    // what is printed: the address without the scheme
  // the end of the session, for the notes: the part of "2:30–4:00 PM" after the dash
  var endsAt = String(session.time || '').split(/[–—-]/).pop().replace(/\s*[AP]M\s*$/i, '').trim();

  /* The QR code for the link. lib/qr.js is checked the only way that counts,
   * by reading its codes back with a decoder (tools/test-screener.js). If the
   * library is missing or the address is too long for a code, the link is
   * shown as text alone. */
  function repoQr() {
    var QR = window.QR;
    if (!repoUrl || !QR || typeof QR.toSVG !== 'function') { return ''; }
    try {
      var opts = { title: 'QR code for ' + repoShown };
      // the code is always Lampblack on Card (the two printing inks), whatever the slide's ground
      if (THEME) { opts.dark = THEME.color('--lampblack'); opts.light = THEME.color('--card'); }
      return QR.toSVG(repoUrl, opts);
    } catch (err) {
      return '';
    }
  }
  var qrSvg = repoQr();

  /* The last sentence stays up through Q&A as the kicker of the thanks slide.
   * It is the brief's own copy (close, step 3), repeated; the brief does not
   * list it for the thanks slide. Set this to false to show the thanks slide
   * with the brief's copy and nothing else. */
  var KEEP_LAST_LINE_UP = true;

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

/* ---- shared: how this act quotes. The same geometry as the Shannon slide in
        Act 1 (slides/a1-bandwagon.js): the words start one mark's width in
        from the grid line (0.42em of that slide's 104px, so 172 on the
        stage), and the opening mark hangs to the left of them. ---- */
.slide .a5-quote {
  --a5-inset: calc(104px * 0.42);
  margin-left: 0;
  padding-left: var(--a5-inset);
  text-indent: -0.42em;
  max-width: none;
}

/* ---- shared: a Flare block that DROPS into a window. The window is static
        and does the clipping; the block inside moves on one property only
        (translate), so a slow frame can delay it but can never show it in the
        wrong place. Shown any other way than played, the block is simply
        there. ---- */
.slide .a5-window { overflow: hidden; }
.slide .a5-drop {
  position: absolute;
  inset: 0;
  background: var(--c-accent);
  color: var(--c-accent-ink);
}
@keyframes a5-drop {
  from { translate: 0 -100%; }
  to { translate: 0 0; }
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
.slide .a5-objection {
  margin-top: 40px;
  font-size: 124px;                      /* at this size the hanging mark's ink sits on the grid line, under the kicker */
  line-height: 1.08;
}
.slide .a5-answer {
  position: absolute;
  left: var(--spine-w);
  right: 0;
  top: 600px;
  bottom: 0;
}
.slide .a5-answer .stack {
  position: absolute;
  left: calc(var(--m-x) - var(--spine-w));
  top: 120px;
  width: var(--content-w);
}
/* played (not merely shown): the block comes down with gravity and everything
   above it recoils as it stops */
@keyframes a5-recoil {
  0% { translate: 0 14px; }
  100% { translate: 0 0; }
}
.slide.is-playing[data-playing="1"] .a5-answer > .a5-drop {
  animation: a5-drop var(--d-drop) var(--e-drop) 0s 1 normal backwards;
}
.slide.is-playing[data-playing="1"] .a5-recoil {
  animation: a5-recoil var(--d-jolt) var(--e-arrive) var(--d-drop) 1 normal none;
}

/* ---- share-the-gain: the kit's .beats (a path of numbered steps), set
        larger than its default because there are only three. The path runs
        off the right edge of the stage, and so does the Flare block under
        its third beat: the two right ends agree. ---- */
.slide .a5-beats {
  margin-top: var(--s-2);
  margin-right: calc(var(--m-right) * -1);
  padding-right: var(--m-right);
  column-gap: var(--s-5);
}
.slide .a5-beats > li {
  min-height: 388px;
  padding: 216px var(--s-3) var(--s-5);
  margin: 0 calc(var(--s-3) * -1);
  font-size: 60px;
  font-weight: 700;
  line-height: 1.08;
}
.slide .a5-beats > li::before { left: var(--s-3); top: var(--s-5); font-size: 180px; }
.slide .a5-beats > li:not(:last-child)::after {
  right: calc(var(--s-5) * -0.5 + var(--s-3) - 14px);
  z-index: 2;                            /* the arrowheads stay on top of the block, as on the path in Act 1 */
}
.slide .a5-beats > li > span { position: relative; display: block; }
/* the third beat is the point: a Flare block drops in behind it. Its window
   starts under the rule, so the rule is never covered. */
.slide .a5-beats .a5-flare {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: calc((var(--m-right) - var(--s-3)) * -1);      /* the one field that breaks the frame: off the right edge */
}
.slide .a5-beats > li.a5-point::before { z-index: 1; }
.slide.is-playing[data-playing="3"] .a5-flare > .a5-drop {
  animation: a5-drop var(--d-drop) var(--e-drop) 0s 1 normal backwards;
}
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
  margin-left: -0.07em;                  /* the stems of "If" and "it" sit on the boxes' left edge */
  max-width: none;
  font-size: 120px;
  line-height: 1.08;
}
.slide .a5-proof .punch {
  padding: 0 0.12em;
  margin-right: 0.07em;                  /* the comma clears the block */
}

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
/* The size and leading of the Shannon slide in Act 1 (.quote.is-l), on the
   same left edge, so the room knows this slide before it reads it. */
.slide .a5-shannon {
  margin-top: auto;
  font-size: 104px;
  line-height: 1.14;
  white-space: nowrap;
}
.slide .a5-shannon + .attribution {
  margin-top: var(--s-6);
  margin-bottom: auto;
  margin-left: calc(104px * 0.42);       /* the rule starts under the words, as in Act 1 */
}
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
   slide). Shown any other way, each half of the wall is simply there.

   Each line arrives by the deck's block reveal: a bar of ink runs across the
   measure in a sixteenth, then its left edge retreats in an eighth and leaves
   the line behind. --a5-at on a line is when it starts, after its own click.

     click one (step 2)                    click two (step 3)
       ${seconds(CLOCK.no.line1).toFixed(2)}  SAY NO TO                       ${seconds(CLOCK.yes.line1).toFixed(2)}  SAY YES TO
       ${seconds(CLOCK.no.line2).toFixed(2)}  THE EXCITING.                   ${seconds(CLOCK.yes.line2).toFixed(2)}  THE MATH. (and the band)
       ${seconds(CLOCK.no.holdFrom).toFixed(2)} to ${seconds(CLOCK.no.holdTo).toFixed(2)}  stop-time, in negative

   After the first sentence the field prints in negative for two beats (Card
   and Lampblack swap; the spine stays Lampblack, so the whole stage is one
   black field), then cuts back and waits, half built, for the second click.

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
  ${pct(CLOCK.no.holdFrom, CLOCK.no.holdTo)} { background-color: var(--lampblack); color: var(--card); }
  100% { background-color: var(--card); color: var(--lampblack); }
}
.slide.is-playing[data-playing="2"] .a5-wall { animation: a5-stop-time ${CLOCK.no.holdTo}ms step-end 0s 1 normal none; }
.slide.is-playing[data-playing="2"] .a5-wall .ln[data-step="2"],
.slide.is-playing[data-playing="3"] .a5-wall .ln[data-step="3"] {
  animation: a5-line-in var(--d-block-in) linear var(--a5-at, 0s) 1 normal backwards;
}
.slide.is-playing[data-playing="2"] .a5-wall .ln[data-step="2"]::after,
.slide.is-playing[data-playing="3"] .a5-wall .ln[data-step="3"]::after {
  animation: a5-bar-out var(--d-block-out) var(--e-arrive) calc(var(--a5-at, 0s) + var(--d-block-in)) 1 normal backwards;
}
.slide.is-playing[data-playing="3"] .a5-band { animation: a5-band-in var(--d-block-in) linear var(--a5-at, 0s) 1 normal backwards; }

/* THE PDF. Print mode shows a slide in its final state; here that would be the
   wall alone. The page shows Shannon's sentence with our edit and its
   attribution, and the last sentence beneath it. */
.slide .a5-reprise { display: none; }
html.mode-print .slide .a5-wall { display: none; }
html.mode-print .slide .a5-shannon,
html.mode-print .slide .a5-shannon + .attribution { visibility: visible; }
html.mode-print .slide .a5-shannon {
  --a5-inset: calc(var(--t-quote) * 0.42);
  margin-top: 0;
  font-size: var(--t-quote);
}
html.mode-print .slide .a5-shannon + .attribution {
  margin-top: var(--s-5);
  margin-left: calc(var(--t-quote) * 0.42);
}
html.mode-print .slide .a5-reprise {
  display: block;
  position: absolute;
  left: var(--spine-w);
  right: 0;
  top: ${REPRISE.bandTop}px;
  bottom: 0;
  background: var(--c-accent);
}
html.mode-print .slide .a5-reprise > .stack {
  position: absolute;
  left: calc(var(--m-x) - var(--spine-w));
  top: ${REPRISE.top - REPRISE.bandTop}px;
  width: var(--content-w);
}
html.mode-print .slide .a5-reprise .ln.a5-math { margin-top: ${REPRISE.before}px; color: var(--c-accent-ink); }

/* ---- thanks: the quiet slide. It follows the wall and stays up through the
        questions, so it spends no Flare: the last Flare the room saw was THE
        MATH. The name sits under a rule at the foot, where the title slide
        printed its details. The right-hand column is a quiet backdrop for
        four minutes of questions: the catalogue line in its slot (left 970,
        top 64, as on the walk-in and title slides), the QR code when there is
        a link, and Monday's three lines set small at the foot of the column,
        just above the rule. Everything in it is Lampblack on Card. ---- */
.slide .a5-last { margin-bottom: 44px; line-height: 1.25; }
.slide .a5-cat { position: absolute; left: 970px; top: 64px; margin: 0; }
.slide .a5-mon {
  position: absolute;
  left: 970px;
  right: var(--m-right);
  bottom: 272px;                         /* 60px clear of the rule over the name */
  margin: 0;
}
.slide .a5-mon > .kicker { margin-bottom: 20px; }
.slide .a5-mon ol {
  counter-reset: mon;
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: var(--w-hair) solid var(--c-line);
}
.slide .a5-mon li {
  counter-increment: mon;
  display: flex;
  align-items: baseline;
  gap: 28px;
  padding: 14px 0 12px;
  border-bottom: var(--w-hair) solid var(--c-line);
  font-size: 44px;
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
}
.slide .a5-mon li::before {
  content: counter(mon);
  width: 36px;
  flex: none;
  font-family: var(--f-display);
  font-weight: var(--wght-display);
  font-stretch: var(--wdth-display);
  font-size: 56px;
  line-height: var(--lh-cap);
  font-variant-numeric: tabular-nums;
}
.slide .a5-ty {
  margin-top: 0;
  margin-bottom: 0;
  max-width: none;
  white-space: nowrap;
}
.slide .a5-questions {
  align-self: flex-start;
  margin-top: 36px;
  margin-left: -0.05em;                  /* the italic Q's bowl overhangs: bring it onto the grid line */
  font-size: 160px;
  line-height: 1;
  letter-spacing: -0.012em;
  white-space: nowrap;
}
.slide .a5-sign {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-7);
  margin-top: auto;
  padding-top: 36px;
  border-top: var(--w-rule) solid var(--c-line);
}
.slide .a5-credit b { font-size: 64px; margin-bottom: 18px; }
.slide .a5-credit span { font-size: 44px; font-stretch: var(--wdth-text); }
.slide .a5-link {
  flex: 0 1 auto;
  max-width: 900px;
  padding-top: 6px;
  font-family: var(--f-mono);
  font-weight: var(--wght-label);
  font-stretch: var(--wdth-text);
  line-height: 1.2;
  letter-spacing: 0.01em;
  text-align: right;
  overflow-wrap: anywhere;
}
.slide .a5-link > span { display: inline-block; max-width: 100%; }
.slide .a5-qr { position: absolute; left: 970px; top: 144px; width: auto; flex-direction: row; align-items: flex-end; gap: 28px; }
.slide .a5-qr > .qr-code { width: 300px; flex: none; }   /* the screener's code on ex-screen is 340: this one stays up for four minutes */
.slide .a5-qr > figcaption { padding: 0 0 6px; font-size: var(--t-label); }

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
      SAY: Say your boring one works. Six hours a week come back.
      (click) Who owns them?

      DO: Click once for the question. Then stop. Count to three before you say anything.

      NEXT: Some of you are already thinking the objection. I'll say it for you.
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
      <blockquote class="quote a5-quote a5-objection a5-recoil">“My people will just<br>waste the time.”</blockquote>
      <div class="a5-answer a5-window" data-step="1">
        <div class="a5-drop">
          <p class="stack" data-fit data-fit-gap="30">
            <span class="ln">That’s a management answer.</span>
            <span class="ln">It isn’t an AI problem.</span>
          </p>
        </div>
      </div>
      <i hidden data-scene="a5-cue" data-opts='{"at": 1, "for": ${seconds(NOTE.drop + NOTE.jolt + NOTE.beat)}}'></i>
    `,
    notes: `
      SAY: “My people will just waste the time.” Fair worry. Wrong place to look.
      (click) The tool did its job. It handed back minutes.
      What those minutes turn into is a management decision.
      If the freed time gets wasted, in my eyes that's a lack of proper management. Not an AI problem. Not a people problem.
      Nobody decided what the time was for. That's on us.

      DO: Read the objection out loud. Click. Let the answer land, then speak.

      NEXT: So what does managing it look like? Three things.
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
        <li class="a5-point"><i class="a5-flare a5-window" data-step="3"><i class="a5-drop"></i></i><span data-step="3" style="--delay: var(--d-drop)">Share the upside</span></li>
      </ol>
      <p class="sub a5-hide" data-step="4" data-anim="wipe">People hide time savings that threaten them.<br>They report the ones they share in.</p>
      <i hidden data-scene="a5-cue" data-opts='{"at": 3, "for": ${seconds(NOTE.drop + NOTE.beat)}}'></i>
    `,
    notes: `
      SAY: Share the gain. My view, not a study.
      (click) Name the goal for the freed hours. That's a leader's call, not the tool's.
      (click) Measure it.
      (click) Share the upside: income, a bonus or an ownership stake, tied to growth.
      (click) People hide time savings that threaten them. They report the ones they share in.
      Some leaders are happy with the status quo. Those are not the leaders you want.
      Build around people who want a piece. Make sure there's one to want.

      DO: A click per beat, one for the line. Read the line off the screen.

      YOUR STORY: how the gain is shared at your place, if it is; if not, say what you would do.

      NEXT: And a shared gain needs proof.
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
      SAY: You saw these four at the start: the Waypoint standard.
      The task. The prompt. The output. The time saved.
      That's what keeps it honest.
      (click) If you can't show all four, it didn't happen. Proof, not vibes.

      DO: Point at the boxes, left to right. Click for the line.

      NEXT: So here's what I'm asking you to do on Monday.
    `
  });

  /* =====================================================================
   * monday
   * =================================================================== */
  // The three things to do on Monday, held once: the monday slide sets them
  // large, and the thanks slide keeps them up small through the questions.
  var MONDAY = ['Inventory two weeks.', 'Run three through the gates.', 'Say no twice.'];
  // on the monday slide the word "no" is the punch
  function mondayLine(text) { return esc(text).replace(/\bno\b/, '<b class="punch">no</b>'); }

  Deck.slide({
    id: 'monday',
    act: 5,
    title: 'Monday morning',
    minutes: 1,
    layout: 'list',
    html: `
      <h2 class="headline">Monday morning.</h2>
      <ol class="list is-l a5-monday">
        ${MONDAY.map(function (line, i) { return '<li><span data-step="' + (i + 1) + '">' + mondayLine(line) + '</span></li>'; }).join('\n        ')}
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
   *   step 2   the wall, first half: "Say no to the exciting." Played, it is
   *            followed by a stop-time hold in negative, then it waits.
   *   step 3   the wall, second half: "Say yes to the math." on the Flare band.
   *
   * The brief lists the last sentence as one step. It is two clicks here, one
   * per half, so the pause between them belongs to the speaker and a stray
   * second press cannot skip the ending.
   * =================================================================== */
  var wallLines = [];
  LAST.forEach(function (half, h) {
    var clock = h === 0 ? CLOCK.no : CLOCK.yes;
    half.forEach(function (text, i) {
      var isLast = h === LAST.length - 1 && i === half.length - 1;
      wallLines.push('<span class="ln' + (isLast ? ' a5-math' : '') + '" data-step="' + (2 + h) + '" style="--a5-at: ' + (i === 0 ? clock.line1 : clock.line2) + 'ms">' +
        wallLine(text, WALL_SPACES[wallLines.length]) + '</span>');
    });
  });

  Deck.slide({
    id: 'close',
    act: 5,
    title: 'Close: say yes to the math',
    minutes: 1,
    layout: 'quote',
    steps: 3,
    html: `
      <blockquote class="quote a5-quote a5-shannon" data-step-out="2">${shannonMarkup()}</blockquote>
      <p class="attribution" data-step-out="2">${esc(SHANNON_CREDIT)}</p>
      <div class="a5-wall" data-step="2">
        <i class="a5-band" data-step="3" style="--a5-at: ${CLOCK.yes.line2}ms"></i>
        <p class="stack" data-fit data-fit-size="${WALL.size}" data-fit-h="${WALL.fitH}">
          ${wallLines.join('\n          ')}
        </p>
      </div>
      <div class="a5-reprise">
        <p class="stack" data-fit data-fit-size="${REPRISE.size}" data-fit-h="${REPRISE.fitH}">
          <span class="ln">${wallLine(LAST_HALVES[0], REPRISE_SPACES[0])}</span>
          <span class="ln a5-math">${wallLine(LAST_HALVES[1], REPRISE_SPACES[1])}</span>
        </p>
      </div>
      <i hidden data-scene="a5-cue" data-opts='{"at": [2, 3], "for": [${CLOCK.no.cue}, ${CLOCK.yes.cue}]}'></i>
    `,
    notes: `
      SAY: Shannon again. His sentence, as he wrote it.
      (click) The swap from the start. Our edit, not his.
      He said it in 1956. Find the few.
      (click) ${LAST_HALVES[0]}
      (click) ${LAST_HALVES[1]}

      DO: After line one the stage goes black for ${NOTE.hold === 1000 ? 'one second' : seconds(NOTE.hold) + ' seconds'}: say nothing. Hands off the clicker until THE MATH lands.

      NEXT: Let it sit for two beats. That's the talk.
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
  // on two lines, so the catalogue line can have its slot at the head of the right-hand column
  var lastLineHtml = KEEP_LAST_LINE_UP
    ? '<p class="kicker a5-last">' + LAST_HALVES.map(esc).join('<br>') + '</p>'
    : '';
  // the catalogue line, built as the walk-in and title slides build it (scenes/title.js)
  var catalogue = ['Waypoint', session.name || 'NOAI 2026', session.city || 'New Orleans'].join(' · ');
  var mondayHtml = '<div class="a5-mon"><p class="kicker">Monday morning</p><ol>' +
    MONDAY.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ol></div>';

  /* The six hardest questions the room is likely to ask, with the honest
   * answer the brief supports (from the skeptical-executive review). Two
   * lines of answer each, so he can glance at them mid-question. Every figure
   * is read from window.YOUR, window.PROJECT, CostMath or the BenchLM file; a
   * question whose figures are missing is left out rather than guessed. */
  function hardQuestions() {
    var P = window.PROJECT;
    var CM = window.CostMath;
    var R = (YOUR.slotting && YOUR.slotting.results) || {};
    var old = R.oldBuilding || {};
    var ok = function (x) { return typeof x === 'number' && isFinite(x); };
    var pct = function (x) { return (P ? P.num(x) : String(x)) + '%'; };
    var out = [];
    var ma = null;
    try { ma = P && P.minutesAlone ? P.minutesAlone() : null; } catch (err) { ma = null; }
    if (ma && ma.ok && ok(R.ladderPctAsIs) && ok(R.ladderPctOptimized)) {
      out.push('Q1 “All that for ' + P.num(ma.hours) + ' hours a year?” On minutes, no: ' + P.money(ma.value) + '. I said so.',
        'Every part moved anyway: guess or calculate. Ladder picks went ' + pct(R.ladderPctAsIs) + ' to ' + pct(R.ladderPctOptimized) + '.',
        'The move was free. The build was not.');
    }
    if (ok(R.pickTimePctLess) && ok(old.walkPctLess) && ok(old.pickTimePctLess)) {
      out.push('Q2 “' + pct(R.pickTimePctLess) + ' is against a baseline nobody picks.” True: the as-is move.',
        'Old building: ' + pct(old.walkPctLess) + ' less walking, ' + pct(old.pickTimePctLess) + ' less pick time. Both rest on estimates.');
    }
    out.push('Q3 “It’s on your cash path. Doesn’t it pass?” Only if cash comes sooner.',
      'Walking less doesn’t do that. The rule wants cash days, not a tick.');
    var c = null, pricedRows = null;
    try {
      c = CM && CM.counts ? CM.counts() : null;
      pricedRows = CM && CM.priced ? CM.priced() : null;
    } catch (err) { c = null; pricedRows = null; }
    var meta = (window.BENCHLM && window.BENCHLM.meta) || {};
    if (c && c.rows && pricedRows && pricedRows.length && meta.retrieved) {
      // both counts: the whole file, and the priced models the cost slide plotted
      var pricedEst = pricedRows.filter(function (m) { return m.estimated; }).length;
      out.push('Q4 “Prices change every quarter. Stale?” One export, ' + meta.retrieved + '.',
        c.estimated + ' of the file’s ' + c.rows + ' scores are estimated; ' + pricedEst + ' of the ' + pricedRows.length + ' that have a price. Tiers, not ranks. The lessons hold.');
    }
    out.push('Q5 “How do I keep my numbers honest?” Set house rules before you score.',
      'Then hold every win to all four Waypoint boxes.');
    out.push('Q6 “So what was the bigger return on the warehouse project?”',
      'YOUR STORY: the bigger return, in one sentence you can defend. If you have not put a number on it yet, say so: ' +
      '"I haven\'t put a number on it that I can show you all four Waypoint boxes for. The move had to happen; the question was guess or calculate."');
    return out.join('\n      ');
  }

  Deck.slide({
    id: 'thanks',
    act: 5,
    title: 'Thank you. Questions.',
    minutes: 4,
    layout: 'statement',
    html: `
      ${lastLineHtml}
      <p class="say is-l a5-ty">Thank you.</p>
      <p class="voice a5-questions">Questions.</p>
      <p class="catalogue a5-cat">${esc(catalogue)}</p>
      ${qrHtml}
      ${mondayHtml}
      <div class="a5-sign">
        <p class="credit a5-credit"><b>${esc(name)}</b><span>${esc(roleLine)}</span></p>
        ${linkHtml}
      </div>
    `,
    notes: `
      SAY: Thank you. I'm ${name}. ${repoUrl ? 'The deck and the code are at that address. ' : ''}Questions.

      DO: Leave this up through Q&A. Quiet room? Ask who killed their favorite.
      Asked which AI assistant: “an AI coding assistant”. Never name it.

      ${hardQuestions()}

      NEXT: Q&A until ${endsAt}. Then stop on time.
    `
  });
}());
