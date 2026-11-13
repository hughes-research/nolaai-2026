# The brief: a new score for the 46-second title film

The requirements every score in `tools/score/` was written and measured against.

## 1. Why this score exists

The 46-second title film opens the workshop "The Most Valuable AI Skill Is Saying No" (Fri Nov 13, 2026, New Orleans Jazz Museum) as its walk-in and social clip.

Its first soundtrack was fully synthesized. On listening, the speaker found it wanting in three ways:

1. **It sounded cheap or synthetic** (beeps and noise instead of instruments)
2. **It was boring or repetitive** (the same pattern looped)
3. **It was harsh or badly mixed** (too bright, slams too hard, parts fighting)

The direction chosen for its replacement: **a cool jazz trio: upright bass, brushes, ride and a few piano chords. Dry and understated, like the deck.**

**Nobody who built these scores could hear them.** Everything was measured and looked at in spectrograms, several independent candidates were made, and the choice between them belongs to the one pair of ears available: the speaker's. Nothing in this folder claims that something "sounds" a certain way.

## 2. The film (the picture is finished and must not change)

- 46.000 s at 30 fps. The music is at **120 BPM in 4/4: a beat is 0.5 s, a bar is 2 s, 23 bars**, and every beat falls on a whole frame.
- One timeline drives the picture and the sound: `video/score.js`. Read picture times from it in code (the kit's `timeline` module does this). Never copy times by hand.
- The full event table is in `tools/score/ref/events.md` (and `.json`). Read it.

The story: four dock gates stand up (COST, RETURN, EFFORT, POTENTIAL). Idea 1, the exciting one ("A chatbot for everything"), is pitched big: NO at COST. Idea 2, the easy one ("Meeting notes for managers"), passes COST: NO at RETURN. A held breath. Idea 3, the boring one nobody pitched ("Invoice follow-up reminders"), walks through all four gates, each door lifting, and becomes the point. The title assembles; a slab drops and completes it: "The Most Valuable AI Skill Is Saying NO". The card holds as the walk-in screen.

**HARD sync** (the sound must land within one frame, and audibly on the frame): `8.000 s` NO 1, `17.000 s` NO 2, `37.000 s` the slab.
**SOFT sync** (mark them musically): the four PASS lifts of idea 3 at `22.5, 24.5, 26.5, 28.5 s`; the winner at `30.0 s`; the sleeve at `32.0 s`; back to positive at `38.0 s`.
**Text on screen** (no voice-over; keep the music sparse so the line can be read): `9.5-12 s`, `18.5-20 s`, `30.5-32 s`.

## 3. What the music must do

**The shape (binding):**

| Time | Picture | Music |
|---|---|---|
| 0-4 s | the dock stands up | Sparse. Nothing important before 0.25 s (players can swallow the first instant). The four bays at 0.5, 1.0, 1.5, 2.0 s are a gift: four notes. |
| 4-8 s | idea 1, the exciting one | The band swaggers. The busiest the music gets before the end. It is hype: a little too pleased with itself. |
| 8.000 s | NO | The band hits with the shutter and **stops dead** (stop-time). A low, musical thud, not a crash. Then space: only tails until about 10 s. |
| 10-12 s | text on screen | Restart thin. |
| 12-17 s | idea 2, the easy one | Lighter and breezier than idea 1, and thinner. COST passes at 14.5 s: a small nod. |
| 17.000 s | NO | Hit, stop. |
| 18-20 s | text on screen | Tail, almost nothing. |
| 20-22 s | the held breath | Near silence (see the room-tone rule in section 4). |
| 22-30 s | idea 3, the boring one | Starts with the least (the bass alone, or nearly). **One layer joins at each PASS** (22.5, 24.5, 26.5, 28.5 s), and each PASS is marked by a rising figure so the four climb. Inevitable and unhurried, not triumphant. |
| 30 s | the winner | Arrival. The full trio at its warmest. Do not crowd the text at 30.5-32 s. |
| 32-37 s | the title assembles | The band builds toward the slab. |
| 37.000 s | the slab: "NO" | The final hit, and the punchline: this NO is the good one. Land it with the low thud **and the home chord**. Resolve; do not slam shut. |
| 38-46 s | the card holds | A short tag, then the last chord rings out naturally. Inaudible by about 45.9 s, with a 300 ms safety fade at the very end. It must loop acceptably as a walk-in screen: a ringing end into a sparse start. |

**The style:** cool jazz, a late-1950s small group: understated, dry, a little wry. 120 BPM, eighths swung at 62 to 66 percent. A minor key.

- **Walking bass** in four, composed bar by bar: chord tones on the strong beats, a chromatic or scale approach into the next bar's root, never the same bar twice, range E1 to G3.
- **Brushes** on the snare (a swirl, taps on 2 and 4), **ride** (spang-a-lang) used sparingly, a feathered bass drum at most.
- **Sparse comping**: rootless voicings, stabs that answer the picture. No solos, no busy fills.
- **Original.** Do not quote or imitate any existing tune or recording. No recognisable riff.
- **Humanised** like players: small timing and velocity variations from a seeded random generator, so every build is identical. The bass may sit a few milliseconds behind the beat. The three HARD hits must sound within ±10 ms of their times, so account for each sample's attack time (measure onsets; do not assume).

## 4. What the sound must be

**4.1 Not cheap or synthetic.** Sampled candidates use recorded instrument samples through `fluidsynth` and two free libraries, both MIT licensed and installed on this machine:

- `/usr/share/sounds/sf2/FluidR3_GM.sf2` (FluidR3 GM, © Frank Wen)
- `/usr/share/sounds/sf3/MuseScore_General.sf3` (MuseScore General, © S. Christian Collins and others; built on FluidR3 Mono)

Preset lists are in `tools/score/ref/presets-*.txt` (`bank-program name`; drum kits are bank 128: Standard, Jazz 128-032..036, Brush 128-040..042). Audition presets and choose by measurement, not by name. Turn fluidsynth's own reverb and chorus off and use the kit's room. Performance matters as much as the samples: vary velocities so different sample layers play, avoid machine-gun repeats, give notes the lengths a player would, let bass notes ring into each other and damp naturally.

**4.2 Not boring.** Section 3.

**4.3 Not harsh or badly mixed.** Targets, all measured on `final.wav`:

- **Loudness** -16.0 ± 0.5 LUFS integrated. **True peak** at or under -2.0 dBTP (so the AAC stays under -1.5). **Loudness range** 5 to 12 LU.
- **Warm tilt:** the long-term spectrum falls about 4.5 to 6.5 dB per octave from 200 Hz to 8 kHz. Energy above 8 kHz at least 30 dB below the total. The 2-5 kHz band at least 14 dB below the total.
- **Balance:** every instrument that is playing can be found in the mix. In full-trio passages, relative to the bass stem's RMS: keys within about -3 to -10 dB, drums within about -8 to -16 dB. Brushes are quiet but present.
- **Translation:** (a) mono: the L+R sum loses less than 1.5 dB and nothing cancels; keep the low end centred. (b) small speakers: after a 150 Hz high-pass the bass line is still there (the bass stem keeps at least a quarter of its energy above 150 Hz; add gentle harmonics if it does not). (c) nothing vital below 50 Hz.
- **Clean:** no clicks (isolated discontinuities; a steep note attack is not a click), no DC, no clipping.
- **Room tone, not digital silence:** a steady, very quiet room tone (soft pink noise at about -68 dBFS) runs under the whole piece, the held breath included, so devices that mute on digital silence do not swallow the next entrance. The held breath (20.3 to 22.0 s) must measure below -60 dBFS RMS.
- **Room:** a small club, 0.6 to 0.9 s decay, dark. The bass almost dry. Stage: bass centre, keys slightly left, drums slightly right.
- **The NO thuds:** a pitched low drum (45 to 60 Hz fundamental, fast pitch drop) with body around 100 to 200 Hz so small speakers still give it, and at most a short dark rattle (low-passed at 3 kHz or lower). Never a harsh crash.

## 5. The contract: what every candidate delivers, in `tools/score/<key>/`

- `build.js`: `node tools/score/<key>/build.js` rebuilds everything from scratch, deterministically, in under about two minutes, and exits 0 only if its self-checks pass.
- `final.wav`: 48 kHz, stereo, 24-bit PCM, exactly 2,208,000 samples per channel.
- `stems/bass.wav`, `stems/keys.wav`, `stems/drums.wav`, `stems/fx.wav` (thuds, room tone, any sound design): same length, each as it sits in the mix before the master bus. Their sum, through the master, is `final.wav`.
- `arrangement.json`: `{ key, bpm, swing, chords: [one string per bar], notes: [{ t, dur, inst, midi, vel }], hits: [{ t, inst, kind, vel }], sync: [{ t, what }] }`, the notes as actually played, after humanising. Times in seconds.
- `report.md` (saved from the composer's hand-back): the idea in five lines; each instrument (library, preset) and why; the chart bar by bar in one table; the mix chain; the measurements; what you looked at; the known weaknesses, plainly.
- `analysis/`: the kit's analysis output for `final.wav` and the stems.

## 6. How the candidates were made

- Each candidate was composed, rendered and mixed independently, in its own directory, by a different composer, from this brief alone.
- Node 22 with no dependencies; `ffmpeg`, `ffprobe` and (for the recorded-instrument scores) `fluidsynth` on the PATH; Python 3 with numpy and Pillow for the analysis pictures.
- Every build is deterministic (seeded) and checks itself.
- Reports say what was measured and what was seen, never what was heard.
