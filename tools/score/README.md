# The title film's score

The sound of `video/title-sequence.mp4` and `video/title-square.mp4`: an original cool-jazz trio, written for the picture and played by recorded instruments.

```
node tools/build-audio.js          # build the chosen score  ->  out/video/title-audio.wav
node tools/build-audio.js --mux    # and put it on both films (the picture is copied, never re-encoded)
node tools/build-audio.js --list   # the scores in this folder
```

## Why there are four scores here

The film's first soundtrack was fully synthesized. On listening it was found cheap or synthetic, repetitive, and harsh. The replacement was to be a cool jazz trio: upright bass, brushes, ride and a few piano chords, dry and understated (`BRIEF.md` has the full requirements).

Nobody who built the replacement could hear it. So four scores were made from the same brief by four composers working separately (the piano trio and the synthesized score grew from one D minor sketch and share its harmony and six bars of bass line; the other two are separate compositions), every one was measured against the brief's targets, and three judges then measured all four side by side, each through one lens. The scores out of 10:

| Score | What it is | Signal and mix | Realism | Music and picture |
|---|---|---:|---:|---:|
| **`sampled-piano`** (chosen) | D minor piano trio: recorded upright bass, brush kit and a dark grand. Each NO is a cadence that is refused; the last one resolves. The band cuts out while each door falls. | 7 | 6 | 7.5 |
| `modelled` | The same harmonic family with every instrument a physical model: no samples, needs only Node. | 6.5 | 4.5 | 6 |
| `minimal` | G minor. Bass and brushes carry the film; the piano plays 17 notes in all (13 when it was judged). The bass tells the joke. | 6 | 5 | 5.5 |
| `vibes` | A minor. Bass, brushes and vibraphone; one four-note chord is the four gates. | 4.5 | 3.5 | 7 |

`sampled-piano` ranked first with all three judges and is the score on the films. These are the judges' first, structured results; their later write-ups differ by up to one point in seven cells and leave the piano trio first on every lens. The music judge's first write-up called `vibes` the best composition (its later one gave that to the piano trio's chart), and the other two judges ranked its rendering last (the library's vibraphone is a short looped recording). Each score's `report.md` has its idea, its chart bar by bar, its mix, its measurements, a listening guide ("at N s you should hear ...") and its known weaknesses.

**After the judging**, a reviser who had written none of the scores worked through the judges' findings on two of them:

- `sampled-piano` (on the films): the brushes became a continuous texture in place of separate strokes; three clashing notes were fixed; the cymbals were darkened and the ride's ringing partials notched out; the first hit was brought up about 2 dB on small speakers (it still does not rise above the bar before it there); a build was added into the last hit; the last bass note no longer hangs in a loop. It still passes all 24 mix targets.
- `minimal`: a new opening motif (the first one matched the opening of a well-known rock riff), an arrival chord at the winner, a title line with a shape of its own, and continuous brushes. It passes 23 of the 24 mix targets: the piano is too sparse for the keys-against-bass window.

The scores in the table are for the versions as judged; the revisions were measured but not re-judged. Each revised score's `report.md` ends with a "Revision" section: what changed, the numbers before and after, what was left alone and why, and what remains weak.

To put a different score on the films: `node tools/build-audio.js --score minimal --mux`.

## What is checked, and what is not

Every build is deterministic (two builds give the same bytes) and exits 0 only if its self-checks pass:

- the three hard hits within 10 ms of their frames (8.000, 17.000 and 37.000 s, read from `video/score.js`, the one timeline the picture and the sound share);
- loudness -16 LUFS, true peak at or under -2 dBTP, loudness range 5 to 12 LU;
- the held breath (20.3 to 22.0 s) below -60 dBFS but never digital silence: a room tone at about -68 dBFS runs under everything, so devices that mute on silence do not swallow the next entrance;
- no clipping, no DC, no isolated clicks; the tail inaudible by 45.9 s.

The kit has its own tests. `node tools/score/lib/test-sampler.js` (12 checks: both libraries load, renders are deterministic, timing within 1 ms, pitch, the brush kit, reverb off) ships here. The mix half's test (141 checks: the loudness meter against ffmpeg, the limiter, the room, the click detector, the analysis and mux tools) ran where the scores were made and is not shipped, because it measures against the first soundtrack's file, which is not in the repository.

`lib/analyze.js` measures a file against every target of the brief (tonal tilt, harsh-band energy, balance between the stems, mono fold-down, small-speaker translation, the thuds) and draws spectrograms. `lib/mux.js` copies the picture's video stream untouched, checks its MD5 before and after, refuses a WAV that is not 48 kHz, stereo and 46.000 s long, and replaces the two films only when both new files pass.

**Not checked: how any of it sounds.** PASS in these tables means a number is inside the brief's range, nothing more. The choice between the scores should be confirmed by ear.

## What you need to rebuild

- Node 22 (no packages).
- For the three recorded-instrument scores: `fluidsynth` and two free sound libraries.
- For `sampled-piano` and `vibes`, which end by measuring their own mix: `ffmpeg`, and Python 3 with numpy and Pillow for the analysis pictures. `SCORE_FAST=1` in front skips the pictures for `sampled-piano`; the sound is the same bytes.
- To put a score on the films (`--mux`): `ffmpeg` and `ffprobe`.

```
apt-get install fluidsynth fluid-soundfont-gm musescore-general-soundfont-small
apt-get install ffmpeg python3-numpy python3-pil
```

`tools/build-audio.js` says what is missing before it starts (exit code 2). The `modelled` score needs only Node. Playing the finished films needs nothing at all.

The file checksums quoted in the reports were made with fluidsynth 2.3.4, fluid-soundfont-gm 3.1 and musescore-general-soundfont-small 0.2.1. Another version of fluidsynth or of a library can give different bytes; the self-checks then decide whether the build is good.

## Credits for the recorded instruments

The recorded-instrument scores are original compositions performed with samples from **FluidR3 GM** (© Frank Wen) and **MuseScore General** (© S. Christian Collins, built on Fluid (R3) Mono by Michael Cowgill), both under the MIT licence. Their full notices are in `SAMPLE-LICENSES.md`. The libraries themselves are not in this repository. The NO thuds and the room tone are synthesized by the kit.

## What is in this folder

| Path | What it is |
|---|---|
| `BRIEF.md` | The requirements: the film's timeline, what the music must do section by section, the sound targets, what every score delivers |
| `<score>/build.js`, `chart.js` | A score: the composition as data, and the performance and mix that build it |
| `<score>/check-chart.js` | The chart checked as data: chord tones, voice leading, no repeated bar, swing, the shape against the film |
| `<score>/report.md` | The composer's report, tidied since (working notes removed); the two revised scores end with the reviser's section |
| `lib/` | The shared kit: `sampler.js` (recorded instruments through fluidsynth), `midi.js`, `timeline.js`, `mix.js` (mixer, small room, loudness, true-peak limiter), `dsp.js`, `synth.js` (the thud, the room tone), `checks.js`, `analyze.js`, `spectro.py`, `mux.js`, `wav.js`; `README.md` there is the one-page guide |
| `lib/audition/audition.md` | 394 sounds of the two libraries measured (pitch, attack, loudness by velocity, loop points, velocity layers) and the shortlist the composers chose from |
| `ref/` | The picture's event table (`events.md`, `events.json`) and the libraries' preset lists |
| `SAMPLE-LICENSES.md` | The sample libraries' copyright and licence notices |

Builds write `final.wav`, `stems/` and `arrangement.json` into the score's own directory, and all but `minimal` an `analysis/` folder; those are not tracked.
