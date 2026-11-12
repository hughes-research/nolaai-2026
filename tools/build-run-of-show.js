#!/usr/bin/env node
/*
 * build-run-of-show.js
 *
 * Reads the real deck (deck/index.html, opened from disk in headless Chromium)
 * and writes two documents from it, so the paper always agrees with the slides:
 *
 *   docs/RUN-OF-SHOW.md     one line per slide with its planned clock time
 *   docs/SPEAKER-NOTES.md   every slide's speaker notes, in running order
 *
 * It also checks the timing: each act's minutes are added up and compared with
 * the budget in the brief (section 7). A mismatch is printed and the tool exits
 * with code 1, but the documents are still written.
 *
 * Usage:  node tools/build-run-of-show.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DECK = 'file://' + path.join(ROOT, 'deck', 'index.html') + '?fast';

// Session start and the minutes each act is allowed (docs/BRIEF.md, section 7).
const START = { h: 14, m: 30 };
const ACTS = [
  { name: 'Walk-in', budget: 0 },
  { name: 'The Bandwagon', budget: 10 },
  { name: 'The Four Gates', budget: 15 },
  { name: 'Your Turn', budget: 35 },
  { name: 'Build the Winner', budget: 20 },
  { name: 'Who Owns the Minutes?', budget: 10 },
];

function clock(minutesFromStart) {
  const total = START.h * 60 + START.m + minutesFromStart;
  const whole = Math.floor(total);
  const secs = Math.round((total - whole) * 60);
  let h = Math.floor(whole / 60) % 24;
  const m = whole % 60;
  const h12 = ((h + 11) % 12) + 1;
  return h12 + ':' + String(m).padStart(2, '0') + (secs ? ':' + String(secs).padStart(2, '0') : '');
}

function mins(x) {
  if (!x) return '';
  if (x < 1) return Math.round(x * 60) + ' sec';
  return (Number.isInteger(x) ? x : x.toFixed(1).replace(/\.0$/, '')) + ' min';
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(DECK);
  await page.waitForFunction(() => window.__deck && window.__deck.count() > 0, null, { timeout: 20000 });
  const slides = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < window.__deck.count(); i++) out.push(window.__deck.info(i));
    return out;
  });
  const yours = await page.evaluate(() => {
    const Y = window.YOUR || {};
    const s = Y.slotting || {};
    return {
      title: Y.event && Y.event.title, speaker: Y.speaker && Y.speaker.name,
      unfilled: [
        (!s.biggerReturn || !s.biggerReturn.length) ? 'slotting.biggerReturn (the return beyond the walking minutes)' : null,
        (!s.effort || s.effort.buildHours == null) ? 'slotting.effort.buildHours' : null,
        (!s.effort || s.effort.upkeepHoursPerMonth == null) ? 'slotting.effort.upkeepHoursPerMonth' : null,
        (!s.potential || s.potential.growth == null) ? 'slotting.potential.growth' : null,
        (!Y.story || !Y.story.howWeBuiltIt || !Y.story.howWeBuiltIt.length) ? 'story.howWeBuiltIt (optional; the slide is skipped while empty)' : null,
        (!Y.links || !Y.links.screenerUrl) ? 'links.screenerUrl (optional)' : null,
        (!Y.links || !Y.links.repoUrl) ? 'links.repoUrl (optional)' : null,
      ].filter(Boolean),
    };
  });
  await browser.close();

  // ---- timing ----
  const perAct = ACTS.map(() => 0);
  let t = 0;
  const rows = slides.map((s, i) => {
    const start = t;
    const m = Number(s.minutes) || 0;
    if (s.act >= 0 && s.act < perAct.length) perAct[s.act] += m;
    t += m;
    return Object.assign({ n: i + 1, start }, s);
  });
  const problems = [];
  ACTS.forEach((a, i) => {
    // Half a minute of slack: the optional "how we built it" slide is skipped while its list is empty.
    if (Math.abs(perAct[i] - a.budget) > 0.5) problems.push(`Act ${i} (${a.name}): slides add up to ${perAct[i]} min, budget is ${a.budget} min`);
  });
  const total = perAct.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 90) > 0.5) problems.push(`Whole session: ${total} min, should be 90`);

  // ---- RUN-OF-SHOW.md ----
  let md = `# Run of show\n\n`;
  md += `**${yours.title || 'The Most Valuable AI Skill Is Saying No'}** · Friday, Nov 13, 2026 · 2:30–4:00 PM · Education Center\n\n`;
  md += `Generated from the deck by \`node tools/build-run-of-show.js\`. Do not edit by hand: change the slide's \`minutes\` and run it again.\n\n`;
  md += `| Act | Planned | Slides add up to |\n|---|---|---|\n`;
  ACTS.forEach((a, i) => { md += `| ${i}. ${a.name} | ${a.budget} min | ${perAct[i]} min |\n`; });
  md += `| **Total** | **90 min** | **${total} min** |\n\n`;
  if (problems.length) md += `> **Timing does not add up:**\n${problems.map(p => `> - ${p}`).join('\n')}\n\n`;
  let act = -1;
  rows.forEach(r => {
    if (r.act !== act) {
      act = r.act;
      md += `\n## Act ${act}: ${ACTS[act] ? ACTS[act].name : ''}${ACTS[act] && ACTS[act].budget ? ` (${ACTS[act].budget} min, starts ${clock(r.start)})` : ''}\n\n`;
      md += `| # | Clock | Slide | Time | Clicks |\n|---|---|---|---|---|\n`;
    }
    md += `| ${r.n} | ${r.act === 0 ? 'before' : clock(r.start)} | ${r.title || r.id} | ${mins(Number(r.minutes) || 0)} | ${r.steps || 0} |\n`;
  });
  md += `\nSession ends at ${clock(total)}.\n`;
  if (yours.unfilled.length) {
    md += `\n## Still to fill in (\`deck/content/your-numbers.js\`)\n\n${yours.unfilled.map(u => `- \`${u}\``).join('\n')}\n`;
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'RUN-OF-SHOW.md'), md);

  // ---- SPEAKER-NOTES.md ----
  let notes = `# Speaker notes\n\nGenerated from the deck by \`node tools/build-run-of-show.js\`. The same notes appear in the presenter view (press S in the deck).\n\n`;
  notes += `Each note has the same three parts: **SAY** (the point, in your words), **DO** (what to click or point at), **NEXT** (the hand-off line). \`YOUR STORY\` marks a place where only you know what to say.\n`;
  act = -1;
  rows.forEach(r => {
    if (r.act !== act) { act = r.act; notes += `\n---\n\n# Act ${act}: ${ACTS[act] ? ACTS[act].name : ''}\n`; }
    notes += `\n## ${r.n}. ${r.title || r.id}\n\n`;
    notes += `*${r.act === 0 ? 'before the start' : clock(r.start)} · ${mins(Number(r.minutes) || 0) || 'no fixed time'} · ${r.steps || 0} click${r.steps === 1 ? '' : 's'} · id \`${r.id}\`*\n\n`;
    const body = String(r.notes || '').trim();
    notes += body ? body.split('\n').map(l => l.replace(/^(SAY|DO|NEXT|YOUR STORY):/, '**$1:**')).join('  \n') + '\n' : '_No notes._\n';
  });
  fs.writeFileSync(path.join(ROOT, 'docs', 'SPEAKER-NOTES.md'), notes);

  // ---- report ----
  const missing = rows.filter(r => !String(r.notes || '').trim()).map(r => r.id);
  const stories = rows.filter(r => /YOUR STORY/.test(String(r.notes || ''))).map(r => r.id);
  console.log(`${rows.length} slides, ${total} minutes. Wrote docs/RUN-OF-SHOW.md and docs/SPEAKER-NOTES.md`);
  ACTS.forEach((a, i) => console.log(`  act ${i} ${a.name}: ${perAct[i]} of ${a.budget} min`));
  if (missing.length) console.log('Slides without notes: ' + missing.join(', '));
  if (stories.length) console.log('Slides with a YOUR STORY slot: ' + stories.join(', '));
  if (yours.unfilled.length) console.log('Unfilled speaker values: ' + yours.unfilled.join('; '));
  if (problems.length) { console.log('TIMING PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
