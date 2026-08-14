# Pregonero

<p align="center">
<img src="docs/images/chango-pepper-banner-logo.png" width="600">
</p>

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

## Quick start

```bash
npm run dev
```

That starts the Vite dev server and Electron together, and opens the two windows — Control for you, Projection for the audience. In **Manage Setlists**, import your song JSONs and order them into a setlist (that screen is also where a song's video file and its Bombista timeline are linked). Then, on the control screen: pick your singing and projection languages, open the projection, and arm.

To build a distributable `.dmg`:

```bash
npm run pack
```

## Documentation

- **[docs/performance-runbook.md](docs/performance-runbook.md)** — running a show: the workflow and its states, setlists, the concert timer, keyboard and pedal controls, language selection, single-screen rehearsal, and the current live rig.
- **[docs/architecture.md](docs/architecture.md)** — how it is built: the two-window design, the three playback modes, the technology stack.
- **[docs/timeline-v2-contract.md](docs/timeline-v2-contract.md)** — the timeline format shared with Bombista.
- **[docs/media-assets.md](docs/media-assets.md)** — how a song's video file is linked per machine.

## Song format

Songs are imported as JSON files and stored in the app's persistence layer, then organized into setlists for live performance.

```json
{
  "title": "Pimiento",
  "notes": "Capo 3, Acordes de DO",
  "title_translations": { "en": "Pepper Tree", "fr": "Le pimentier", "nl": "Peperboom" },
  "intro": { "es": "...", "en": "..." },
  "tempo": { "bpm": 96, "numerator": 4, "denominator": 4, "countInBars": 1 },
  "media": { "type": "video", "src": "pimiento.mp4", "offset": 0, "trimStart": 0 },
  "timelineVersion": 2,
  "leadIn": { "durationSec": 7.26, "source": "measured", "confidence": "low", "apply": false },
  "timeline": [ { "start": 0.0, "end": 3.2 }, { "start": 3.2, "end": 7.5 } ],
  "lyrics": [
    {
      "es": "Viejo pimiento,\nhoy vuelvo a visitarte",
      "en": "Old pepper tree,\ntoday I come back to see you,",
      "fr": "Vieux pimentier,\naujourd'hui je reviens te voir,",
      "nl": "Oude peperboom,\nvandaag kom ik je weer bezoeken,"
    }
  ]
}
```

**Fields**

- `title` — song name.
- `title_translations` *(optional)* — translated titles for the intro/title screen, indexed by language code.
- `intro` *(optional)* — translatable spoken intro shown on the intro screen.
- `notes` *(optional)* — performer notes such as capo, key, or reminders.
- `tempo` *(optional)* — `{ bpm, numerator, denominator, countInBars }`. Drives the count-in and the beat pulse, and is the prerequisite for Auto mode. `bpm` is the felt pulse (in 6/8, the dotted-quarter rate); compound meters (6/8, 9/8, 12/8) are grouped into dotted-quarter beats.
- `media` *(optional)* — one video/audio file, `{ type: "video" | "audio", src, offset?, trimStart? }`, for Video mode. One clean export per song; Big/Small is a projection toggle, **not** a second file. `src` is a logical filename — the actual file is linked once per machine and remembered locally (see [docs/media-assets.md](docs/media-assets.md)). Feed the app web-playable MP4s (H.264, ≤1080p), not ProRes masters.
- `timeline` *(optional)* — per-item `{ start, end }` in seconds, parallel to the lyrics array, driving both Auto and Video advancement. Entry 0 starts at `0.00`: the timeline is relative to a start cue, not to the audio file.
- `timelineVersion` — **required whenever `timeline` is present, and its only valid value is `2`.** A timeline without it is rejected on import rather than loaded, because a pre-v2 file would fire every line early with no visible error.
- `leadIn` — required alongside `timelineVersion`: `{ durationSec, source, confidence, apply }`. The seconds of audio before the first sung word, banked separately instead of folded into every timestamp. `apply` is the consumer's switch — `true` for a video, where the lead-in is fixed, `false` when you cue the first line yourself.
- `lyrics` — ordered list of lyric lines.

Each lyric line holds translations indexed by language code (`es`, `en`, `fr`, `nl`, …). Missing translations are allowed — the line simply stays blank in projection. Songs without the optional blocks behave exactly as before, in Manual mode.

## About the artist

This project is part of the preparation for the live performances of **Chango Pepper**.

Chango Pepper blends Latin American roots, storytelling, and contemporary arrangements. The songs are primarily written in Spanish and performed for international audiences, hence the need for Pregonero.

More about the project and the music: [changopepper.com](https://changopepper.com)

## License

MIT — see [LICENSE](LICENSE).

---

*Pregonero is part of **Tramoya**, the stage machinery behind [Chango Pepper](https://changopepper.com). The repository was called `live-lyric-translator` until August 2026.*
