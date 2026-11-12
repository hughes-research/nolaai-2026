# The title film

A 42 second title sequence for "The Most Valuable AI Skill Is Saying No",
in the deck's own type and colours. **The film is silent.** There is no
audio track in either file: nothing to mute, nothing to check at the desk.

| File | What it is |
|---|---|
| `title-sequence.mp4` | The film, 1920×1080, 30 frames a second |
| `title-square.mp4` | The same film re-laid for a square frame, 1080×1080, for social posts |
| `poster.png` | The last frame (the title card), 1920×1080: use it as the video's cover image |
| `title.html` | The film itself. Double-click it and it plays in the browser |
| `title-sequence.js` | Everything the film does: the copy, the timing, the drawing |

Both MP4s are H.264 (High profile, yuv420p, BT.709) with the index at the
front of the file, so they play in QuickTime, in Windows, in every browser
and on every social platform, and start playing before they finish
downloading.

## Showing it

- **From the file:** open `title-sequence.mp4` in any player, full screen.
  It ends on the title card and holds there. The title card is laid out the
  same way as the deck's title slide, so you can cut from the film to the
  slide.
- **From the browser:** double-click `title.html`. It plays once and holds
  on the title card. Space pauses, R replays, the left and right arrows step
  one beat. Move the mouse for the replay button. No network needed.
- `title.html?size=1080x1080` shows the square version.
  `title.html?t=12.5` freezes on the frame at 12.5 seconds.

## What is in it

Six short scenes, cut on the beat at 120 beats a minute:

1. Black. "1956." Shannon's sentence sets itself, and "Information theory"
   is struck through with "AI" written above it, flagged OUR EDIT.
2. Pitches you have heard in a meeting. Each one meets a gate, and each gate
   says NO: one, then two, four, eight, faster each time.
3. One dull line: "Where the parts live." The shutter comes down on it
   too. Then it lifts. PASS.
4. "Your best AI idea is probably wrong." / "The boring one you didn't
   pitch is probably worth thousands."
5. The four gates shut, one to a beat: COST, RETURN, EFFORT, POTENTIAL.
6. The title card. Three gates open. The fourth tries three times and
   cannot. A second of nothing, and the slab drops: NO.

Every word except the generic pitch phrases in scene 2 comes from
`docs/BRIEF.md`. The Shannon sentence is quoted exactly, attributed, and
our swap is drawn as an edit on top of his words (they stay on screen,
struck through). The pitch phrases in scene 2 are
generic on purpose: no brands, no products, no numbers. The only figures in
the film are dates and the session time. The name, role, date, time and room
on the title card are read from `deck/content/your-numbers.js`.

## Changing it

Edit `title-sequence.js`, reload `title.html` to see it, then render again.

- **The words** are at the top, under "Copy". Do not edit the `SHANNON`
  line: it was checked against the original page.
- **The timing** is "the score", just above the copy: one block per scene,
  in seconds.
- **Your name, the date, the room:** change them in
  `deck/content/your-numbers.js`, not here. The film and the deck both
  read that file.

## Rendering it again

From the repository root (needs Node, Playwright and ffmpeg, as in
`tools/README.md`). Each command takes about two minutes.

```
node tools/render-video.js video/title.html --out video/title-sequence.mp4 --poster video/poster.png
node tools/render-video.js video/title.html --size 1080x1080 --out video/title-square.mp4
```

The renderer opens `title.html` in a headless browser, steps the clock one
frame at a time (the film is a pure function of time: the same second
always draws the same frame), screenshots each frame and pipes them to
ffmpeg. Then it checks the file it wrote (codec, size, frame count,
duration, faststart, and that redrawn frames match) and saves a contact
sheet of 12 frames to `out/video/` for you to look at. It exits with an
error if any check fails.

To look at the film without rendering it:

```
node tools/render-video.js video/title.html --stills marks        one frame per scene beat
node tools/render-video.js video/title.html --stills 9.4,38.4     these seconds
node tools/render-video.js video/title.html --strip 38:40.5:18    18 frames across a fast passage
```

Add `--size 1080x1080` to any of them for the square version. The pictures
go to `out/video/`.

Other options: `--fps 30`, `--crf 14` (quality: lower is better and
bigger), `--from 10 --to 20` (render a stretch), `--poster-at 41`, and
`--audio silent`, which adds a track of silence for the rare upload form
that refuses a video with no audio track. The film is still silent.
