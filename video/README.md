# The title film: "Four gates"

A 46-second title film for "The Most Valuable AI Skill Is Saying No", in the
deck's own type and colours, **with sound**. It is the talk in miniature:
three ideas come to the four gates, and only the boring one gets through.

| File | What it is |
|---|---|
| `title-sequence.mp4` | The film with sound, 1920×1080, 30 fps |
| `title-square.mp4` | The same film re-laid for a square frame, 1080×1080, with sound, for social posts |
| `title-silent.mp4` | The wide film with no audio track at all, for a room with no sound |
| `play.html` | Shows the film with no player controls: open it in Chrome, F for full screen, then Space to start once Chrome's own notice about the Esc key has gone. It holds the title card at the end |
| `poster.png` | The last frame (the title card), 1920×1080: the cover image, or a still walk-in slide |
| `title.html` | The picture, live. Double-click it and it plays in the browser (silently: the sound is in the MP4s) |
| `title-sequence.js` | Everything the picture does: layout, words, moves |
| `score.js` | The timeline. The picture and the sound are both cut from this one file |
| `fonts.css` | A copy of `deck/theme/fonts.css` (Archivo and Fraunces, open-licensed), so the film does not depend on the deck |

All three MP4s are H.264 (High, yuv420p, BT.709) with the index at the front
of the file: the format QuickTime, Windows, browsers and social platforms
accept. The two with sound carry AAC stereo, 48 kHz, 256 kb/s. They were
decoded end to end with ffmpeg and played in Chrome; no other player was
tried. Play them from a laptop: the two wide films are marked H.264 level 5.0
(the square one 4.0), which a projector's or a television's built-in USB
player may refuse.

## What happens (120 beats a minute, a beat is half a second)

| Time | Picture | Sound |
|---|---|---|
| 0–4 s | A floor line. Four dock doors stand up on it, one to a beat: COST, RETURN, EFFORT, POTENTIAL. "THREE IDEAS · FOUR GATES". | Four notes on the upright bass, one as each door stands up (D, F, A, D): three alone, the brushes joining on the fourth. Then one soft piano chord. |
| 4–8 s | **Idea 1, the exciting one.** "A CHATBOT FOR EVERYTHING" set as big as the stage allows. Its crate is taller than the door. It stops at COST. The bay is held empty. | The trio at its busiest: walking bass, ride, brushes, piano chords pushed ahead of the beat. As the shutter lets go the band cuts off and holds its breath. |
| 8 s | The COST shutter drops through the floor: **NO** (Flare). | On the frame, out of that silence: a low thud, the bass and one short tense chord (the dominant). Then nothing but the tail. |
| 9–12 s | "TOO COSTLY TO RUN". The title is struck through. *Your best AI idea is probably wrong.* | From 10 s the bass alone: one long note, then two shorter ones, each higher (G, A, C sharp). |
| 12–17 s | A black block wipes the dock clean (a small tell-tale mark stays where the NO hit). **Idea 2, the easy one**: "MEETING NOTES FOR MANAGERS". COST checks it (the shutter comes down, then lifts: PASS, carried forward). It stops at RETURN. | Lighter and thinner: brushes and a little piano; two rising piano notes as COST lifts. The band cuts off as the next shutter lets go. |
| 17 s | RETURN: **NO**. "NOTHING COMES BACK". *Easy is not the same as worth it.* | The thud again, a tone lower, with a chord a half step above home. Then a long quiet. |
| 20–22 s | The dock is wiped again. **Idea 3, nobody pitched it**: "Invoice follow-up reminders", set quietly. Its plain crate walks up to COST. | **A held breath:** only a very quiet room tone. |
| 22–30 s | It goes through all four gates, one to a bar: each shutter comes down, lifts to PASS, and the crate walks through on the beat. | The bass alone, on the same D, F, A the film opened with. At each lift a rising piano figure, fuller and higher than the last; brushes, then ride, then hi-hat and bass drum join, one door at a time. |
| 30–32 s | Past the last door, the crate turns Flare: the point. *The boring one you didn't pitch is probably worth thousands.* | The boring idea's cadence arrives (the dominant falls home to D minor): a rolled piano chord left to ring while the bass walks under the line. |
| 32–37 s | The sleeve: a black block covers the stage and pulls back to the spine. The title card builds as the deck's title slide: THE MOST / VALUABLE / AI SKILL / IS SAYING, the subtitle, the name. The right half is held empty. | Short piano chords whose top note steps upward; a brush swell; the band cuts off as the slab lets go. |
| 37 s | The slab drops: **NO**. Two beats in negative. | The thud once more, but this time with the home chord and a cymbal left to ring: the one NO that resolves. |
| 38–46 s | The fine print cuts in: WAYPOINT · NOAI 2026 · NEW ORLEANS, when, time, room. The card holds to the end of the film. | Two slow chords and a single note, then the last chord, rolled, left to ring and let go at 45 s. |

Every NO lands on a beat and on a whole frame (8.0 s = frame 240, 17.0 s =
frame 510, 37.0 s = frame 1110), and the sound of each is checked to begin
within 10 ms of that frame, because the picture and the sound read the same
numbers from `score.js`.

Words: the two lines of the published abstract, the four gate names, and the
title card. The three idea names are generic on purpose. The only figures in
the film are the date and the session time. The name, role, date, time and
room are read from `deck/content/your-numbers.js` (with the same values built
in, in case that file is missing).

## The sound: an original score, played by recorded instruments

The music is an original composition for this picture: a cool-jazz trio in
D minor at the film's 120 beats a minute, with swung eighths. It is performed
with recorded instrument samples (an upright bass and a dark grand piano from
MuseScore General; a brush kit, ride, hi-hat and bass drum from FluidR3 GM;
both libraries are MIT licensed) played through `fluidsynth` with a written,
humanised performance. The three low thuds and the quiet room tone under
everything are synthesized. The mix is set to -16 LUFS with the true peak
under -2 dBTP.

It was written to quote no existing tune. One judge compared it from memory
with tunes it knows and found no melody of one (bars 3 and 4 run the
cycle-of-fifths chord sequence that many standards share); the notes changed
in the revision were not compared again, and none of this was checked by ear.

The film's first soundtrack was fully synthesized and was replaced: on
listening it was found cheap, repetitive and harsh. Four replacement scores
were made and measured side by side; `tools/score/README.md` tells that story,
lists the alternates (a vibraphone trio, a bass-and-brushes version, a fully
synthesized one) and says how to put a different one on the film. Credits and
licence notices for the samples are in `tools/score/SAMPLE-LICENSES.md`.

Nobody who built the score could hear it. It was chosen by measurement and
should be confirmed by ear.

## Showing it

- **With sound:** open `play.html` in Chrome, shortly before you want it.
  Press F for full screen, wait about five seconds until Chrome's own notice
  about the Esc key has gone from the top of the screen (the page asks you
  to, and Space does nothing until then), then tap Space once. It plays
  `title-sequence.mp4` once, with no player controls on screen, and holds the
  title card when the film ends (the last chord has faded by 46 s), so the
  card can stay up until you switch to the deck. Space pauses and resumes; a
  key held down counts once. A click does not start or stop the film: if F or
  Space seem to do nothing, click once on the page to give it the keyboard,
  then press the key again. Leave the trackpad alone while the film is up: a
  pointer that touches the top edge of the screen brings down a round close
  button of Chrome's own for a few seconds. Once the film has ended, Space
  does nothing, so a stray key cannot start it again; R plays it from the
  start.
- **Before you go full screen:** if Chrome shows a strip of its own under the
  address bar, close it. In a test a strip of that kind stayed on screen in
  full screen and pushed the picture down.
- **Do not open the MP4 itself for the room.** A browser's own player keeps
  its control bar across the bottom of the picture whenever the film is paused
  or has ended: in Chrome it covers the name and role line of the title card.
  While the film plays, Chrome hides the bar a few seconds after the pointer
  stops moving, unless the pointer rests on the bottom of the picture.
- **No sound in the room:** `play.html?film=title-silent.mp4`. The picture
  tells the whole story without the sound.
- **Square for social:** `title-square.mp4`.
- **A still:** `poster.png` is the title card.
- **The picture alone, live:** double-click `title.html` (no sound). Space
  pauses, R replays, the arrow keys step one beat.
  `title.html?size=1080x1080` is the square; `title.html?t=17` freezes on the
  frame at 17 s.

All of this was tried in Chrome and in no other browser or player.

## Changing it

- **Timing:** `score.js` moves the picture. The sound is composed bar by bar
  against the same times and does not move by itself: if a NO, one of idea 3's
  four PASSes, the winner, the sleeve or the title's return to positive moves,
  the score's build stops and says that `tools/score/ref/events.json`
  disagrees with `score.js`. Update that table, then the score's `chart.js`.
  If idea 2's PASS moves, the build stops as well, but the message comes from
  the chart and names the bar that no longer matches the picture. Keep every
  NO's `land` on a beat (a multiple of 0.5 s); the build fails if a hit is not
  within 10 ms of its frame.
- **Idea names, kickers, the voice lines:** `score.js` too.
- **Your name, the date, the room:** `deck/content/your-numbers.js`, not here.
- **Layout and moves:** `title-sequence.js`.
- **The music:** `tools/score/sampled-piano/chart.js` (the notes) and
  `build.js` beside it (the performance and the mix). Or pick another score:
  `node tools/build-audio.js --list`.

## Rebuilding it

From the repository root. The sound needs Node, ffmpeg and ffprobe, `fluidsynth`
with two free sound libraries (for the recorded-instrument scores), and
Python 3 with numpy and Pillow (the chosen score draws its analysis pictures
with them; `SCORE_FAST=1` in front of the command skips the pictures, and the
sound is the same bytes):

```
apt-get install fluidsynth fluid-soundfont-gm musescore-general-soundfont-small
apt-get install ffmpeg python3-numpy python3-pil
```

The build says what is missing before it starts.

**Only the sound** (under a minute; the picture is copied untouched, its MD5
is checked before and after, and the two films are replaced only when both
new files pass their checks):

```
node tools/build-audio.js --mux                 # builds the score, then replaces the sound of both films
node tools/build-audio.js --score minimal --mux # the same with another score
```

**The picture too** (needs Playwright as well, as in `tools/README.md`; each
film takes about two minutes):

```
node tools/build-audio.js                       # -> out/video/title-audio.wav (48 kHz stereo)
node tools/render-video.js video/title.html --audio out/video/title-audio.wav --out video/title-sequence.mp4 --poster video/poster.png
node tools/render-video.js video/title.html --size 1080x1080 --audio out/video/title-audio.wav --out video/title-square.mp4
node tools/render-video.js video/title.html --out video/title-silent.mp4
```

The score's build prints its self-checks (format, loudness, true peak, the
three hits' offsets from their frames, the held breath, clipping, DC, clicks)
and fails if any is off. `render-video.js` steps the page one frame at a
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
