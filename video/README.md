# The title film: "Four gates"

A 46-second title film for "The Most Valuable AI Skill Is Saying No", in the
deck's own type and colours, **with sound**. It is the talk in miniature:
three ideas come to the four gates, and only the boring one gets through.

| File | What it is |
|---|---|
| `title-sequence.mp4` | The film with sound, 1920×1080, 30 fps |
| `title-square.mp4` | The same film re-laid for a square frame, 1080×1080, with sound, for social posts |
| `title-silent.mp4` | The wide film with no audio track at all, for a room with no sound |
| `poster.png` | The last frame (the title card), 1920×1080: the cover image, or a still walk-in slide |
| `title.html` | The picture, live. Double-click it and it plays in the browser (silently: the sound is in the MP4s) |
| `title-sequence.js` | Everything the picture does: layout, words, moves |
| `score.js` | The timeline. The picture and the sound are both cut from this one file |
| `fonts.css` | A copy of `deck/theme/fonts.css` (Archivo and Fraunces, open-licensed), so the film does not depend on the deck |

All three MP4s are H.264 (High, yuv420p, BT.709) with the index at the front
of the file, so they play in QuickTime, Windows, every browser and every social
platform. The two with sound carry AAC stereo, 48 kHz, 192 kb/s.

## What happens (120 beats a minute, a beat is half a second)

| Time | Picture | Sound |
|---|---|---|
| 0–4 s | A floor line. Four dock doors stand up on it, one to a beat: COST, RETURN, EFFORT, POTENTIAL. "THREE IDEAS · FOUR GATES". | Ride cymbal and a walking upright bass count in; brushes join at 2 s. |
| 4–8 s | **Idea 1, the exciting one.** "A CHATBOT FOR EVERYTHING" set as big as the stage allows. Its crate is taller than the door. It stops at COST. The bay is held empty. | The band gets busy (extra brush ghost notes, piano comping). A heavy thud as the big crate lands. |
| 8 s | The COST shutter drops through the floor: **NO** (Flare). | **Slam** on the exact frame: a low hit, the shutter's slats rattling, a dark stop-time chord. The band stops dead for one second. |
| 9–12 s | "TOO COSTLY TO RUN". The title is struck through. *Your best AI idea is probably wrong.* | The band comes back in. |
| 12–17 s | A black block wipes the dock clean (a small tell-tale mark stays where the NO hit). **Idea 2, the easy one**: "MEETING NOTES FOR MANAGERS". COST checks it (the shutter comes down, then lifts: PASS, carried forward). It stops at RETURN. | A soft thud for the check; one vibraphone note as COST lifts. |
| 17 s | RETURN: **NO**. "NOTHING COMES BACK". *Easy is not the same as worth it.* | **Slam**, stop-time, then the band thins out to bass and ride. |
| 20–22 s | The dock is wiped again. **Idea 3, nobody pitched it**: "Invoice follow-up reminders", set quietly. Its plain crate walks up to COST. | **A held breath: two seconds of true silence.** |
| 22–30 s | It goes through all four gates, one to a bar: each shutter comes down, lifts to PASS, and the crate walks through on the beat. | The bass walks back in alone, then ride, then brushes. Each door lifts on a vibraphone note that climbs: G, A♭, C, D. |
| 30–32 s | Past the last door, the crate turns Flare: the point. *The boring one you didn't pitch is probably worth thousands.* | The climb resolves to C and E♭; full band. |
| 32–37 s | The sleeve: a black block covers the stage and pulls back to the spine. The title card builds as the deck's title slide: THE MOST / VALUABLE / AI SKILL / IS SAYING, the subtitle, the name. The right half is held empty. | Full band; a brush roll swells into the hit. |
| 37 s | The slab drops: **NO**. Two beats in negative. | The biggest **slam**, on the dominant chord, and stop-time. |
| 38–46 s | The fine print cuts in: WAYPOINT · NOAI 2026 · NEW ORLEANS, when, time, room. The card holds: it is the walk-in screen. | The title resolves: a rolled C-minor arpeggio over a held chord, a soft ride, fading out from 43.5 s. |

Every NO lands on a beat and on a whole frame (8.0 s = frame 240, 17.0 s =
frame 510, 37.0 s = frame 1110), and the slam starts on that exact sample,
because the picture and the sound read the same numbers from `score.js`.

Words: the two lines of the published abstract, the four gate names, and the
title card. The three idea names are generic on purpose. The only figures in
the film are the date and the session time. The name, role, date, time and
room are read from `deck/content/your-numbers.js` (with the same values built
in, in case that file is missing).

## The sound is synthesized and original

There are no samples, recordings, loops or licensed music in it.
`tools/build-audio.js` makes every sound from scratch in plain Node: a plucked
string model (Karplus-Strong) for the upright bass, low-passed noise for the
brushes, a few fast-dying inharmonic partials for the ride cymbal, two-operator
FM for the electric piano, a sine-and-tremolo vibraphone, and the shutters
built from a falling low sine, filtered noise and a run of small metallic
clicks. It is a small jazz combo imagined for the room, not an imitation of
any record. The mix is kept soft at the top (every noise and cymbal is low-passed,
and the whole mix rolls off above 11 kHz), integrated loudness about -16 LUFS, sample peak
-2.5 dBFS before the AAC encode.

## Showing it

- **With sound:** `title-sequence.mp4`, full screen. It ends on the title card
  and holds it (the sound fades out by 46 s), so leave it paused on the last
  frame as the walk-in screen, or show `poster.png`.
- **No sound in the room:** `title-silent.mp4`. The picture tells the whole
  story without the sound.
- **Square for social:** `title-square.mp4`.
- **In a browser:** double-click `title.html` (picture only). Space pauses,
  R replays, the arrow keys step one beat. `title.html?size=1080x1080` is the
  square; `title.html?t=17` freezes on the frame at 17 s.

## Changing it

- **Timing** (for picture and sound together): `score.js`. Keep every NO's
  `land` on a beat (a multiple of 0.5 s). `build-audio.js` refuses to write a
  file whose slams are not on a beat and a whole frame.
- **Idea names, kickers, the voice lines:** `score.js` too.
- **Your name, the date, the room:** `deck/content/your-numbers.js`, not here.
- **Layout and moves:** `title-sequence.js`.
- **The sound:** `tools/build-audio.js` (instruments, mix, the climbing notes).

## Rebuilding it

From the repository root (needs Node, Playwright and ffmpeg, as in
`tools/README.md`). The sound takes a few seconds; each film about two minutes.

```
node tools/build-audio.js                       # -> out/video/title-audio.wav (48 kHz stereo)
node tools/render-video.js video/title.html --audio out/video/title-audio.wav --out video/title-sequence.mp4 --poster video/poster.png
node tools/render-video.js video/title.html --size 1080x1080 --audio out/video/title-audio.wav --out video/title-square.mp4
node tools/render-video.js video/title.html --out video/title-silent.mp4
```

`build-audio.js` prints a cue sheet of the slams (time, beat, frame, sample,
and the energy jump at that sample) and fails if any is off the grid or the
held breath is not silent. `render-video.js` steps the page one frame at a
time (the film is a pure function of time), pipes the frames to ffmpeg, muxes
the WAV as AAC, then checks the file (codecs, size, frame count, duration,
audio channels, rate and length, faststart, and that redrawn frames match) and
saves a 12-frame contact sheet to `out/video/`.

To look without rendering:

```
node tools/render-video.js video/title.html --stills marks        one frame per story beat
node tools/render-video.js video/title.html --stills 8,17,37      these seconds
node tools/render-video.js video/title.html --strip 7.5:8.2:12    12 frames across a fast passage
```

Add `--size 1080x1080` for the square. Other options: `--fps`, `--crf`,
`--from 10 --to 20` (a stretch, with its sound), `--poster-at 41`, and
`--audio silent` (a silent AAC track, for an upload form that refuses a file
with no audio).
