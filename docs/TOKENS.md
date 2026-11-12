# Design tokens: the canonical names

Every slide, scene, tool and handout styles itself through these CSS custom properties, defined once in `deck/theme/tokens.css`. Nothing else hard-codes a colour, a font family or a duration. Canvas scenes read them through `api.token('--c-accent')` (or `getComputedStyle(document.documentElement)`), so a theme change restyles everything.

The theme may define more tokens for its own components, but it must define all of these.

## Colour

| Token | Role |
|---|---|
| `--c-bg` | Stage background |
| `--c-bg-alt` | Secondary surface: panels, cards, chart plot area |
| `--c-ink` | Primary text and primary marks. At least 7:1 on `--c-bg` |
| `--c-ink-soft` | Secondary text and labels. At least 4.5:1 on `--c-bg`; used only at 28px and above |
| `--c-muted` | De-emphasised marks: the "before", the losers, inactive items. Not for text below 36px |
| `--c-line` | Rules, grid lines, axes, rack outlines |
| `--c-accent` | The one accent |
| `--c-accent-ink` | Text placed on `--c-accent` |
| `--c-no` | The NO colour (a gate says no, a cost blows up) |
| `--c-no-ink` | Text placed on `--c-no` |
| `--c-pass` | The PASS colour |
| `--c-pass-ink` | Text placed on `--c-pass` |
| `--c-warn` | Caution: ladder levels, "estimated" flags |
| `--c-before` / `--c-after` | The before/after pair. Must differ in lightness, not only hue |
| `--c-data-1` … `--c-data-5` | Categorical series, distinguishable in greyscale by lightness order |
| `--c-heat-0` … `--c-heat-5` | Sequential ramp, cold (rarely picked) to hot (picked constantly). Monotonic in lightness |

Never encode meaning by colour alone: pair NO/PASS with the word or the motif, and before/after with position or a label.

## Type

| Token | Role |
|---|---|
| `--f-display` | Headlines |
| `--f-body` | Body copy |
| `--f-mono` | Numerals, labels, source lines (tabular figures) |
| `--t-mega` | One-word or one-number slides (about 240px and up) |
| `--t-hero` | Statement slides (about 140px) |
| `--t-h1` | Slide headline (about 96px) |
| `--t-h2` | Sub-headline (about 64px) |
| `--t-body` | Body (about 40px; never below 36px) |
| `--t-label` | Chart labels, kickers (about 28px) |
| `--t-small` | Source lines only (24px minimum) |

## Space, line, shape

`--m-x`, `--m-y` (stage margins) · `--s-1` … `--s-8` (spacing scale) · `--w-hair`, `--w-rule`, `--w-bold` (line weights) · `--r-1`, `--r-2` (radii; may be 0).

## Motion

`--d-fast` (about 180ms) · `--d-base` (about 420ms) · `--d-slow` (about 900ms) · `--e-out`, `--e-in-out`, `--e-snap` (easing curves). JS scenes use the matching values the theme exposes on `window.THEME.motion` (`{ fast, base, slow }` in seconds, and easing names from `Motion`).
