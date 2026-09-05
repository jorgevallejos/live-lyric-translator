# Tramoya

**A Spanish song performed for an audience that doesn't speak Spanish is a song they can hear but not be inside. Tramoya puts them inside it — the right line, in their language, on the screen behind you, at the moment you sing it.**

**The application is Tramoya** — the stage machinery: it owns the folders, the catalogue and the
gigs, and it holds the three tools. **Pregonero is the player inside it**, the town crier who makes
the words reach everyone: given a finished gig it arms, follows the pulse or the pedal or the
animation, and puts words on the wall. It was the name of the whole app until 2026-09-06.
**The repository is still called `pregonero`.**

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

Tramoya **displays** translations; it doesn't produce them. The translations are yours, written into the song JSON with whatever tools you like. Line *timings* can be authored by hand or generated offline by [Bombista](https://github.com/jorgevallejos/bombista), its sibling tool, whose output Tramoya reads directly.

**macOS only.** Packaging targets `--mac`, and the live setup below is a Mac one.

## Install

Tramoya builds and tests on **Node.js 20**, which is what CI runs.

```bash
git clone https://github.com/jorgevallejos/pregonero.git
cd pregonero
npm install
```

Verify:

```bash
npm test
```

## First run, and how to get back to it

The first time Tramoya opens it asks for two folders — **songs** and **gigs** — and shows nothing
else until both are chosen. Every launch after that goes straight to the control screen. They can
be changed later in Preferences.

**To see that screen again, quit Tramoya and delete its stored state:**

```bash
rm -rf "$HOME/Library/Application Support/tramoya/Local Storage"
```

**Quit the app first.** Chromium holds that database open while it runs and rewrites it on exit, so
deleting it under a running app does nothing.

Reinstalling does **not** do this. The state lives in the app's data directory, not in the bundle,
so a fresh copy of the app finds the same folders already set. This one command is the only way
back.

It wipes everything in browser storage, not only the two folders: the song library's references,
the gig list, the remembered gig, the media and Bombista settings, and where each file picker was
last open. Nothing on disk is touched — your catalogue, the gig folders and every file in them are
untouched, and the library rebuilds itself from `<songs>/song-performance/` as soon as you choose
the catalogue again.

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

Both of those serve the UI from Vite, so they always run the code you have. **Any other way of
running from this checkout reads `dist/`** — `electron .` on its own, and `npm run pack`. `dist/`
is a build artifact and is not in git, so it is only as fresh as your last:

```bash
npm run build
```

Run it after pulling and before running anything that isn't `npm run dev`. Without it the app
starts happily and silently runs an older build than the one in `package.json`.

### 2. Build the gig's setlist

**Nothing is imported.** The song list is `<songs>/song-performance/` read at every launch: put a
song JSON in that folder and it is on Backstage, take it out and it is gone from every list that
offers it. The library holds a **reference** to each file — its path — and nothing is copied in.

**The only setlist is the one inside the gig** (Jorge, 2026-09-03). **Backstage → Gigs → New**
opens the gig flow; its step 2 is where the songs are chosen and ordered, and the order is written
into that gig's `gig.json`. There is no separate place to keep setlists of your own, and the
screen that offered one was deleted.

Nothing is uploaded anywhere, and nothing is duplicated: the JSON files stay where they are on
disk and stay authoritative. Edit a song file and the change is there the next time the app
starts. Lyrics, tempo, timeline and media all live in the song file — the app reads them and
never writes them. A file that will not parse is named once in a popup and then left out of the
lists, so the fix is in the file rather than in the app.

### 3. Choose the two languages

**Languages** — the one you *sing* in on the left, the one the audience *reads* on the right.

They are separate on purpose: the performer view shows you the Spanish you are actually singing, while the projection shows the audience their English. You are never reading a translation of your own lyric to find your place.

### 4. Open the projection, then arm

<p align="center">
<img src="docs/images/control-setup.png" width="700">
</p>

One column per thing that has to be right, and arming is blocked until they all are: a **song** is selected, both **languages** are chosen, the **projection** window is open. Only then does **Arm** light up.

That gate exists because the failure it prevents is a public one — hitting the pedal on a dark night and discovering the projection window was never opened.

Songs carrying a timeline also show a **Transitions** toggle here (Manual / Auto).

### 5. Perform

<p align="center">
<img src="docs/images/control-performing.png" width="700">
</p>

Arrow keys or a foot pedal advance the line. The performer view shows you where you are; the audience sees only the current line, in their language:

<p align="center">
<img src="docs/images/projection-screen.png" width="700">
</p>

In **Auto**, the timeline advances the lines for you and the pulse runs from the moment you arm. **A single pedal press takes it back**, mid-song, mid-video, and drops that song to Manual for the rest of it. There is no mode to exit and no dialog to dismiss — the manual path is always underneath, and it always wins.

To build a distributable `.dmg` (this runs `npm run build` first, so the bundle it ships is
always the current source):

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

*Tramoya is the stage machinery behind [Chango Pepper](https://changopepper.com) — Latin American roots, storytelling and contemporary arrangements, written in Spanish and played to audiences that mostly aren't, which is the whole reason this tool exists. The repository was called `live-lyric-translator` until August 2026, and the application was called Pregonero until September 2026.*
