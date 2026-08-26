# Pregonero

**A Spanish song performed for an audience that doesn't speak Spanish is a song they can hear but not be inside. Pregonero puts them inside it — the right line, in their language, on the screen behind you, at the moment you sing it.**

The name is the town crier: the one who makes the words reach everyone.

## Why it isn't just subtitles

A subtitle file assumes the performance will match the timing. Live, it won't — you hold a note, the audience laughs, you talk between verses, a string breaks.

So in Pregonero the **performer drives the screen**. Every line advances on a keyboard press or a foot pedal. Songs that carry a timeline can ride a clock instead — the beat, or a synchronized animation's own playhead — and even then, a single pedal press re-seizes manual control mid-song, mid-video, no exceptions.

That override is the whole design, not a feature bullet. A live show does not get a second take, so every automatic path has a manual one underneath it that always wins.

## Who it's for

- musicians performing in one language to audiences in another
- touring acts facing a different mix of languages each night
- storytelling, theatre and spoken-word sets that want surtitles they can drive
- anyone who needs a caption screen that follows a **person**, not a timecode

## Runs offline

No network, no accounts, no API keys. Songs are local JSON, the two windows talk to each other over `localhost`, and the projection keeps working in a venue with no wifi — which is most of them.

Pregonero **displays** translations; it doesn't produce them. The translations are yours, written into the song JSON with whatever tools you like. Line *timings* can be authored by hand or generated offline by [Bombista](https://github.com/jorgevallejos/bombista), its sibling tool, whose output Pregonero reads directly.

**macOS only.** Packaging targets `--mac`, and the live setup below is a Mac one.

## Install

Pregonero builds and tests on **Node.js 20**, which is what CI runs.

```bash
git clone https://github.com/jorgevallejos/pregonero.git
cd pregonero
npm install
```

Verify:

```bash
npm test
```

## A worked example

Getting one song onto the projection screen. The song below is *Pimiento* — nineteen lines, sung in Spanish, projected in English.

<!-- control-setup.png and control-performing.png are from April 2026 and still show the
     pre-rename window title. Replace on the next real session; projection-screen.png is fine. -->

### 1. Start the app

```bash
npm run dev
```

Vite and Electron come up together and two windows open: **Control**, which only you see, and **Projection**, for the audience. Rehearsing on one screen, without a projector attached?

```bash
npm run dev:single
```

### 2. Import the song and build a setlist

**Setlist → Manage setlists → New song**, and pick one or more song JSONs. The library takes a
**reference** to each file — its path — and reads the song from it at every launch; nothing is
copied in. **New setlist**, then add the songs you want and order them. This screen is also where
you point the app at the local copy of a video the song file names.

Nothing is uploaded anywhere, and nothing is duplicated: the JSON files stay where they are on
disk and stay authoritative. Edit a song file and the change is there the next time the app
starts. Lyrics, tempo, timeline and media all live in the song file — the app reads them and
never writes them. A file that has moved or will not parse shows as an unreadable row in the
library, naming the file, so the fix is in the file rather than in the app.

### 3. Choose the two languages

**Languages** — the one you *sing* in on the left, the one the audience *reads* on the right.

They are separate on purpose: the performer view shows you the Spanish you are actually singing, while the projection shows the audience their English. You are never reading a translation of your own lyric to find your place.

### 4. Open the projection, then arm

<p align="center">
<img src="docs/images/control-setup.png" width="700">
</p>

Four columns, and arming is blocked until all four are satisfied: a **song** is selected, both **languages** are chosen, the **projection** window is open. Only then does **Arm** light up.

That gate exists because the failure it prevents is a public one — hitting the pedal on a dark night and discovering the projection window was never opened.

Songs carrying a timeline also show a **Transitions** toggle here (Manual / Auto) and a **performed tempo** field, for when tonight's tempo isn't the recorded one.

### 5. Perform

<p align="center">
<img src="docs/images/control-performing.png" width="700">
</p>

Arrow keys or a foot pedal advance the line. The performer view shows you where you are; the audience sees only the current line, in their language:

<p align="center">
<img src="docs/images/projection-screen.png" width="700">
</p>

In **Auto**, the timeline advances the lines for you and the pulse runs from the moment you arm. **A single pedal press takes it back**, mid-song, mid-video, and drops that song to Manual for the rest of it. There is no mode to exit and no dialog to dismiss — the manual path is always underneath, and it always wins.

To build a distributable `.dmg`:

```bash
npm run pack
```

## Documentation

- **[docs/performance-runbook.md](docs/performance-runbook.md)** — running a show: the workflow and its states, setlists, the concert timer, keyboard and pedal controls, language selection, single-screen rehearsal, and the current live rig.
- **[docs/architecture.md](docs/architecture.md)** — how it is built: the two-window design, the three playback modes, the technology stack.
- **[docs/subtitle-format.md](docs/subtitle-format.md)** — the song JSON: tempo, media, and the song-level fields, plus how the audience subtitle is rendered.
- **[docs/timeline-v2-contract.md](docs/timeline-v2-contract.md)** — the timeline format shared with Bombista.
- **[docs/media-assets.md](docs/media-assets.md)** — how a song's video file is linked per machine.
- **[docs/visual-language.md](docs/visual-language.md)** — the control window's skin: palette, type and contrast rules, and why status colour means only one thing.

## License

MIT — see [LICENSE](LICENSE).

---

*Pregonero is part of **Tramoya**, the stage machinery behind [Chango Pepper](https://changopepper.com) — Latin American roots, storytelling and contemporary arrangements, written in Spanish and played to audiences that mostly aren't, which is the whole reason this tool exists. The repository was called `live-lyric-translator` until August 2026.*
