# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Does

Pregonero (renamed from Live Lyric Translator, 2026-08-14) is a macOS Electron desktop app for live concert subtitle projection. A performer advances lyric lines in a **Control window**, while a synchronized **Projection window** displays translated lyrics to the audience. Songs are organized into setlists.

Lines can advance in two per-song **playback modes**: **Manual** (keyboard/foot pedal — always available and always wins on override) and **Video** (subtitles locked to a synchronized animation video via `video.currentTime`).

**The Projection window is a compositor, not a screen.** It paints into the shapes Muralista mapped onto the actual wall — see "The projection paints into quads" below. There is no full-frame renderer any more and no fallback path: **no gig folder open means there is nothing to project, and the wall is dark.**

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server + Electron (two parallel processes)
npm run build        # Build with Vite
npm run pack         # Create macOS distribution with electron-builder
npm run lint         # ESLint on src/
npm run test         # Run all tests once with Vitest
npm run test:watch   # Run Vitest in watch mode
```

To run a single test file:
```bash
npx vitest run src/songState.test.ts
```

## Architecture

### Two-Window + WebSocket Pattern

The app opens two Electron windows:
- **Control window** (`#/control`): performer UI — setlist/song selection, language config, navigation
- **Projection window** (`#/projection`): audience-facing, read-only, full-screen lyrics display

Both windows are served by the same Vite bundle. They synchronize state via a **WebSocket server on `ws://localhost:8765`**, managed by Electron's main process (`electron/main.cjs`). The Control window sends state and commands; the Projection window receives and applies them.

A **second cross-window channel** runs over `localStorage` storage events, used where each window owns a local resource rather than shared lyric state: the room the Projection window paints into (`visualsBroadcast.ts`), the one boolean saying whether the contact panel is lit (`gigContactState.ts`), and — in Video mode — the video **seek** and **transport** commands. Each window renders its **own `<video>` element**, so they can't share a media clock; instead the Control window broadcasts transport intent and the Projection window applies it to its element (see Playback modes). Commands carry a `nonce` so repeated same-value writes still fire.

### State Management (No Redux/Zustand)

State is split into pure-function modules with tests, each backed by `localStorage` or `sessionStorage`:

| Module | Storage | Responsibility |
|---|---|---|
| `setlistStore.ts` | localStorage + memory | **v8**: localStorage holds **references** (`{ id, path }`) plus setlists and the active setlist — no song data at all. The songs themselves are read from `songs/` at hydration into an in-memory cache (`LibraryEntry[]`), which may be dropped and rebuilt at any time. Snapshots older than v8 are **wiped, not migrated** (see "The library is a cache" below) |
| `songState.ts` | **localStorage** | Current song, lyric index, blank state, selected languages; defines `TimelineEntry` / `MediaFile` / `SongMedia`. localStorage, not sessionStorage — the Projection window is a separate browsing context with its own sessionStorage, so the lyric state has to be on the shared side to reach it at all |
| `performanceState.ts` | sessionStorage | Performance lifecycle (setup → ready → armed → performing) |
| `performanceControlStateMachine.ts` | — | Computes `SETUP / READY_TO_ARM / ARMED` from prereqs |
| `navigationState.ts` | — | Pure index/blank transition logic |
| `concertSessionState.ts` | sessionStorage | Concert timer (elapsed, pause/resume/reset) |
| `playedSongsState.ts` | sessionStorage | **The played log**: one entry per performance, in order, duplicates preserved, with times. What prefills the debrief and SABAM MyPlaylist |
| `debrief.ts` | — | Pure: the debrief's facts and the markdown it becomes |
| `debriefState.ts` | sessionStorage | The four answers, and whether the panel is showing |
| `videoCueLookup.ts` | — | Pure half-open `[start, end)` cue lookup by time (Video mode) |
| `beatScheduler.ts` | — | Pure `getBeatPhase(tempo, elapsed)` for the count-in/metronome |
| `displayProfile.ts` | localStorage | Gig-level projection profiles; pure `computeProjectionLayout(profile, w, h)` → band + text geometry. **The Projection window no longer reads these** — the quad is the framing now — but the Control window still offers the profiles |
| `gigFolderStore.ts` | localStorage | Which gig folder is open. Its own module so the Projection window can ask without pulling in the reader |
| `visualsBroadcast.ts` | localStorage | `visuals.json`, carried from the Control window to the Projection window. Re-parsed on read, so both refusals hold on both sides |
| `shapeTextLayout.ts` | — | Pure: the quad's stretch, the layout box, the auto-fit, the text fields Muralista writes |
| `videoTransport.ts` | localStorage | The play/pause/stop and seek channel. Nonce-carrying, because every consumer reacts to a transition |
| `mediaPathStore.ts` | localStorage | Maps a song's logical `media.src` → an absolute path the user links once; format/size validation warnings. `absolutePathToMediaUrl` converts a path to a `media://local/...` URL served by the Electron custom protocol (not `file://` — blocked by webSecurity on the http://localhost dev origin). The `local` host is a fixed sentinel: an empty-host `media:///` URL is canonicalized by Chromium into `media://firstsegment/...`, absorbing and lowercasing the first path segment as the hostname. The main-process handler decodes `pathname` and serves via `net.fetch(pathToFileURL(...))` with forwarded headers so Range/seek requests work. |
| `gigContactState.ts` | localStorage | **The contact panel's one condition**, and the boolean it travels as |
| `gigSession.ts` | localStorage | The open gig folder, remembered across launches, plus the last readiness delta and its subscribers. Re-read **on open**, never watched |
| `gigReadiness.ts` | — | **The one readiness function**: given a gig folder it returns the delta, per setup step and per song. Pure |
| `gigFile.ts` | — | `gig.json` — parse, serialise, create, and project the setlist into it. Pregonero is its only writer |
| `visualsFile.ts` | — | `visuals.json` — Muralista's file, read-only here. Version and gig-id refusals, and **the lookup** (type + song → a *set* of shapes) |
| `platform.ts` | — | **The one module that knows Electron exists** for gig work: the folder picker, reading and writing files in it, `bombista` |

Pure logic is extracted into `*State.ts` / `*Lookup.ts` / `*Scheduler.ts` modules (no side effects, fully unit-tested). React hooks (`use*.ts`) wire them to components and own side effects: storage reads/writes, WebSocket broadcasts, Electron IPC. Timer-driven hooks include `useBeatClock` (count-in).

### Playback modes

Per song, selected from the song's data: **Manual** (default; no `media`) and **Video** (`media` with a video slot + `timeline`; projection plays the muted clean animation, subtitles bound to `video.currentTime + media.offset`, band composited via the active display profile). A manual arrow/pedal press always re-seizes control in Video mode.

**Video mode is two video elements, transport-synced — not a shared clock.** The audience output is `ShapeVideo.tsx`, mounted inside the gig's `song-video` shape: **it is the clock**, reporting its own `currentTime` up so the lyric lands in the `song-lyrics` shape — two shapes, not one frame with an overlay. It mounts **paused at `trimStart`** and obeys `play` / `pause` / `seek` commands broadcast from the Control window's `VideoPerformancePanel.tsx` over the `localStorage` transport channel (`videoTransport.ts`). The performer panel runs the single-clock count-in and, at the count-in→video handoff (`beginFired`), broadcasts `play` so the audience video starts on the downbeat; Pause broadcasts `pause`; Restart broadcasts `seek(trimStart)` then `play` at the next handoff. The panel also keeps a local preview `<video>` for the performer. Because the two elements aren't continuously time-synced, drift is corrected by manual seek — not a periodic resync (a known trade-off). `screenSizeState.ts` + the WS `screenSize` message decide which slot (`big`/`small`) the Projection plays.

### Performance State Machine

Prerequisites for arming: song selected + singing language + translation language + projection window open.

States: `SETUP` → `READY_TO_ARM` → `ARMED` → (performing when index ≥ 0 and armed).

### Electron Layer

- `electron/main.cjs`: Creates and manages both windows, coordinates the WebSocket server
- `electron/preload.cjs`: Context bridge exposing IPC methods to the renderer (`window.electronAPI`)
- `electron/closeProjectionWindow.cjs`: Safe projection window closure logic (has its own tests)
- `electron/readSongFile.cjs`: Reads one song file for the renderer, returning `{ ok, text | error }` rather than throwing (has its own tests)
- `electron/gigFolder.cjs`: One read of the gig folder — `gig.json` plus the file its `visuals` pointer names — and the `gig.json` write. A pointer that would leave the gig folder is refused, not followed (has its own tests)
- `electron/gigFolder.cjs` also writes `debrief.md` — whole on save, never merged: Pregonero writes it and then Jorge edits it
- `electron/bombistaValidate.cjs`: Shells out to `bombista validate --for-performance`. A CLI invocation, never a live protocol, and it **never fails closed**: no binary on `PATH` is `skipped` (has its own tests)
- `electron/displays.cjs`: What displays this machine has, from Electron's `screen`. **Read-only, and a fingerprint to compare rather than a value to render from** — the setup confirmation uses it to notice the projector was unplugged (has its own tests)
- `electron/bombistaRun.cjs`: One Bombista subcommand, as a subprocess. A fixed allow-list of subcommands, and a missing binary is `skipped` (has its own tests)
- `electron/bombistaServe.cjs`: Starts `bombista serve` and reads the address it prints (has its own tests)
- `electron/localhostServer.cjs`: A loopback static server for Muralista's page. Mounts a folder per tool; a request that would leave its mount is refused, not followed (has its own tests)
- `electron/projectorDisplay.cjs`: Which display the projection window belongs on — the one that is not the laptop's own. **The one-display fallback is visible, never silent** (has its own tests)
- `dialog:openFolder` is the picker for any folder this machine remembers — the songs root and the media folder. The gig folder keeps its own handler because its picker offers to create one; this one never does.

### Where this machine keeps things: the songs folder and the media folder

**A `src` in a file is a name, never a path** (`docs/media-assets.md`), and a configured folder is
what turns that name into bytes. That is Muralista's model, adopted deliberately: it holds a
directory handle because a page cannot hold a path, Pregonero has Electron and holds the path, and
the rule either side of that difference is the same — **the files stay portable and the folder is a
fact about this machine.**

`src/contentFolders.ts` holds both, one `localStorage` key each. `resolveMediaPath` in
`mediaPathStore.ts` is **the one answer to "where is the file called X"**: the per-source link
first, the media folder second, null when this machine has no answer. Every renderer that needs
bytes goes through it — `ShapeStatic`, `ShapeContact`'s QR, the video path in `App.tsx`, and the
readiness function's media check.

**This is what put the logo back on the wall.** A static shape's image, a static video and a
contact QR all resolve the same way song media does, and the only way into the link table was the
song library's *Locate video…* button, which only ever offers a song's own declared media. So a
`visuals.json` naming `chango-pepper-logo.png` resolved to nothing, and nothing anywhere said why.
`FoldersView` (`#/folders`) is both halves of the fix: the folder, and a list of every name the
files currently ask for with what it resolves to — `src/mediaSources.ts` gathers that list, and it
resolves nothing itself.

**A source that does not arrive paints nothing**, whether the name does not resolve at all or the
answer is a file that is not there (`ShapeStatic` drops the element on `onError`). A broken image on
a wall says less than an empty shape does, and the fix is in the folder.

**The songs folder is the same idea one level up.** A library reference added while it is set is
stored by name, so the library survives the folder moving; `resolveSongPath` turns either form into
a path. **Nothing migrates** — an absolute reference is returned untouched, and a bare name with no
songs folder set is handed back unchanged, which is exactly what the app did before the setting
existed.

### The gig, and the one readiness function

**A gig is a folder.** Pregonero remembers which one across launches; the folder holds `gig.json`
(Pregonero writes it, and is its only writer), `visuals.json` (Muralista writes it, Pregonero only
reads it) and later `debrief.md`. The authoritative description of both files lives in the vault at
`projects/tramoya-integration/docs/gig-file.md`; the field names Pregonero reads from
`visuals.json` are Muralista's own — `visualsVersion`, `gigId`, `shapes`, and a shape's type at
`shape.layer.type`.

**Given a gig folder, one function returns the delta: what is missing, per step and per song.**
Everything that sounds like it needs its own notion of validity is a *rendering* of
`computeGigReadiness`, and **nothing else in the app gets an opinion about what "ready" means.**
**All four views ship** — the hard gate at arm time (`songReadyForGig` in
`performanceControlStateMachine.ts`, plus the setlist screen), the report when a gig is opened, the
setup flow's per-step gating, and the setup confirmation going stale (the last three all in
`GigView.tsx`, over `setupFlow.ts`).

Three rules that are easy to break and expensive to break:

- **A per-step verdict, never a boolean.** `gig.json` exists from setup step 2 and is incomplete
  for most of its life; that is normal, not degraded. Absence of a later step's data means *not
  yet*, never *broken*. `broken` is only for the loud refusals — a file that will not parse, a
  `visualsVersion` this build does not know, a `gigId` that is not this gig's. Those are named on
  screen and never repaired automatically.
- **Derived from the files, never stored as progress.** "Step 3 is done" is *the visuals pointer
  resolves and carries the shapes the setlist needs*. Muralista is fully usable standalone, so
  stored progress diverges the moment work happens outside Pregonero — and diverges silently.
- **The running order is derived against the playable setlist**, which is
  `readiness.playableSongIds` and nothing else. A trailing song that cannot be played is never
  played, so a predicate reading the *authored* setlist would wait for it forever: the gig would
  never end. That is discovered at the end of a real night, not in CI.

**`gig.json`'s `setlist` is the running order the app performs.** Round E1 wrote it one way — the
app's setlist was dumped into the file on every read — so a running order edited by hand in the file
was silently overwritten. It is the source now. Pregonero is still its **only writer**; what changed
is which side of the read is authoritative:

- **Reading a gig adopts the file's order** (`adoptSetlistFromGig`). The gig gets a setlist of its
  own, id `gig-<gigId>`, so adopting never touches a setlist built by hand for something else, and
  references the file names are added or repointed — compared **resolved**, so a reference held
  relative to the songs folder and a `file` written relative to the gig folder are not mistaken for
  a move.
- **Writing happens when the running order is changed in Pregonero**, in `publishSetlistToGig`,
  called from the setlist screen's commit. Reading never writes a setlist that is already there.
- **A file with no `setlist` field at all** still gets the app's written in. That is the field
  accreting for the first time, not an overwrite — `docs/gig-file.md`, "The file exists before it is
  finished".
- **Either direction displacing an order is announced**, never done quietly: `readiness.adoption`
  carries what replaced what, and the gig screen says it. An id the file names that this machine
  cannot turn into a song is named too, rather than vanishing from the setlist.

`file` is **written** relative to the gig folder (`../../songs/libertad.json`) so the folder can be
handed over on a stick; an absolute one is still read without complaint. `src/paths.ts` is the posix
path arithmetic behind both.

**Completeness, not correctness.** Pregonero checks that the pointer resolves, the files parse,
every setlist song resolves to a shape for each type it needs, and the content those types require
exists. Whether a timeline is sane is Bombista's question, asked by shelling out and **reported as
a note, never as an arm block** — ten of the fourteen songs in `songs/` are performed from the
pedal with no timeline at all, and a machine with no `bombista` on `PATH` must still be able to
run a gig.

### The setup flow: six ordered steps, and where the forward button greys

`setupFlow.ts` is the guided path, and it is **pure rendering of the delta** — it decides nothing
about readiness. The order, from `projects/tramoya-integration/project-context.md`:

1. **The songs** — first, because songs are **gig-independent** and are often done days ahead. This
   is the one step whose subject is the library rather than the gig, so it has a real verdict with no
   gig open at all.
2. **The gig**, with a setlist drawn from those songs. 3. **Gig visuals**, mapped at the wall.
4. **Song visuals** — optional, deviating songs only. 5. **Readiness at the venue.** 6. **Setup
   confirmed** — derived today; recording it is the next round's.

**The block is on the guided path and nowhere else.** Pregonero greys a forward button. It never
refuses to open, parse or display a half-built gig — the gig file exists from step 2 and being
incomplete is its normal state, so a block that prevented loading would make a half-built gig
impossible to finish. Every step stays readable, every song stays listed; only *moving on* is held.
**Step 4 never holds the flow**, because a gig where no song deviates is fully set up having done
nothing there.

**The escape hatch is said out loud on every step that is not done**, naming the tool that owns the
work — *or map the wall directly in Muralista and come back*. That is not a workaround being
tolerated, it is what makes strict blocking affordable: each tool is fully usable on its own by
requirement, so the blocked path is never the only path. **Pregonero owns the flow, not the
capability.** Work done outside comes back through the on-open re-check, which is why **the current
step is derived and never stored** — a "you got to step 4" flag would diverge the first time work
happened elsewhere, and diverge silently.

**Step 1's verdict is deliberately weak: the library holds a song that reads.** An unreadable
reference and a `bombista` finding are `GigStep.notes` — work, not blockers. A step that could never
complete while `libertad.json` sits in the library would be a guided path nobody could walk, and that
file is kept in the library by design.

**The rig is a checklist, not a data model** (`rigChecklist.ts`): four lines a person reads, shown at
step 5 and again on the control screen immediately before Arm. Nothing is stored and none of it
reaches `gig.json` — a hardware field rots the first time the gig is reused for another room.

### The setup confirmation: a milestone, not a lock

**The one thing this app deliberately stores.** It lives in `gig.json`'s `setup` block and it
**blocks nothing**: arming an unconfirmed or lapsed gig **warns** (`armWarnings`), it never refuses,
and the hard gate stays per-song completeness, which is a different thing.

**It records that the checks passed, and against what** — a fingerprint of each setlist song's file,
of `visuals.json`, and of the display configuration (`fingerprint.ts`, `electron/displays.cjs`).
Those exist for exactly one purpose: **noticing that one of them moved.** They are compared and never
read back.

**It must be able to go stale, and that is the part that earns its keep.** Fix a song at the venue,
re-map the room, unplug the projector, and the confirmation **visibly lapses and says which thing
moved**. A confirmation that could not lapse would hand out peace of mind that is no longer true,
which is the exact opposite of what it is for. A lapse is **not** a refusal: nothing lands in
`refusals`, no step goes `broken`, and every song stays armable.

**Save the recipe, not the cake.** No warp matrix, no layout and no pixel size is ever recorded —
there is a test asserting the written file contains none of those strings. Setting up at the venue
with the projector attached does not change this: the window can still move, the display can still
change, and `docs/warp-contract.md` is binding regardless of when setup happened. The display
fingerprint is a string to compare, never a size to render from.

**"Review setup" returns to step 2, not step 1** — song preparation is gig-independent — and
re-entering re-reads the folder. **Nothing is ever retyped**, because nothing is typed into the flow
at all: every step is derived from the files, so "prefilled" is simply what it always is.

**A damaged `setup` block reads as absent, not as a refusal.** The worst it can do is ask for the
confirmation again, which is cheap; refusing to open the gig over it would be a lock.

**The reload boundary is doors, and it is satisfied by re-reading on open.** There is **no file
watcher** and none is coming: on-open is trivially not mid-song, with no watcher to build and no
boundary to police.

### Two doors on a song, and only two

**Modify the song, and modify its visuals.** `SongDoors.tsx`, and a test counts the buttons, because
counting them is the only way this rule survives. There is **no separate button to attach a timeline,
link a video or set a tempo** — those are all *modify the song*, and they live in the tool that owns
the song file. The rule is written down because it is the one that erodes a convenience button at a
time: each looks harmless alone, and each moves the information architecture further from the
ownership rule it exists to teach. **If a third door seems necessary, say so rather than adding one.**

The manage-setlists screen's *Locate video…* camera button was one, and it is gone. Nothing was lost:
the media folder resolves a name with nobody clicking, and the per-source link lives on `#/folders`,
where every name the files ask for is listed rather than only a song's own declared media.

**Step 0 is named, not hidden.** Behind the song door is the whole subflow — `new`, **a named gap
where an LLM session writes the words, outside the suite**, align, review and tempo, `validate` —
and the input rule that a song needs **lyrics and audio**, said at the entry so the missing input is
visible before the work rather than after. Pregonero brackets that gap and explains it; **no tool in
the suite gets a language model.**

### Hosting Bombista and Muralista

**Packaging, not architecture.** Each tool stays fully usable without Pregonero — that is a
requirement, and it is also the escape hatch that makes the setup flow's strictness affordable.
**Nothing passes data between running processes; the file is the only channel.** A hosted page gets
no preload and no `electronAPI`: giving it one would be the slide from *Pregonero launches a tool* to
*they share state at runtime*, which is the shape the design rejected.

**Muralista** is served from `electron/localhostServer.cjs` and opened in a `BrowserWindow`, over
`http://127.0.0.1` and **never `file://`** — its File System Access API needs a secure context, and
`file://` also hits the `webSecurity` block on media this repo already solved once with `media://`.
Where Muralista lives is a per-machine setting like the folders, because Pregonero cannot guess it
and **must not carry a copy**: a copy is a fork, and the room is Muralista's.

**Bombista** is a subprocess (`bombistaRun.cjs`), on an allow-list of five subcommands, and **it is
handed a song file path — never a gig.** It does not know Pregonero exists and does not know gigs
exist; hosting its UI changes packaging, not knowledge. **If anything ever wants to hand it gig
context, that is the boundary breaking**, and there is a test asserting no argument Pregonero passes
mentions a gig, a setlist or visuals.

**Its review page is served by Bombista, not by Pregonero** (`bombistaServe.cjs` → `bombista serve`,
then a window on the address it prints). The reason is concrete: the static `--emit html` page names
its audio with a path *relative to the staging directory*, so serving it from a mount rooted there
gives a review page **with no audio** — and hearing the doubtful lines is the whole of what it is
for. `bombista serve` has `/api/audio` precisely so the page needs no relative src, and it is where
tempo editing lives.

**Nothing here manages candidate files, temp files or swaps.** `bombista promote` merges a candidate
home and `bombista/songfile.py`'s `back_up_and_replace` is *THE one song-write path*. Pregonero calls
`promote` and shows what it printed; it names one working directory for `align` to write into and
never reaches inside. **A file-replacement step in this repo would drift from the one that exists.**

**"Pass control back" is courtesy, not architecture.** *Done* closes the window and re-checks — the
reload would have happened anyway because the file changed. **If the bridge is absent the button is
absent**, and the screen names the terminal or Chrome instead.

### The projection paints into quads

**Today's Projection window is a compositor.** Each shape in `visuals.json` is a named region with
four normalised corners; Pregonero draws its content into a fixed `UNIT_SIZE` square and warps that
square onto the corners. `ShapeRegion.tsx` is the whole of the contact with the warp, and
`src/vendor/warp.js` is **Muralista's code, vendored byte for byte** — never edited here, and
demoted from a fork to a cache by the hash test in `src/vendorWarp.test.ts` plus Muralista's own
contract test, run unchanged by `npm run test:warp`. The interface, and the four caller obligations
no test in either repo can catch, are `projects/tramoya-integration/docs/warp-contract.md` in the
vault. Read it before touching any of this.

**Pregonero owns *what* and *when*. Muralista owns *how*.** What goes inside the unit square is
entirely Pregonero's — live lyrics on a clock, the intro card, the video. Where the square lands is
Muralista's, and it arrives as a function plus four corners, never as a frozen answer.

Four rules that are cheap to break and expensive to have broken:

- **The output size is a parameter, passed on every render** (`useOutputSize`). The corners are
  normalised; the matrix is in real stage pixels, and the projector at a venue is not the display
  the room was mapped on. **Never cache a matrix across a resize or a display change.** The symptom
  is that everything renders and is just subtly off, with no error anywhere.
- **Everything inside the box is a fraction of the box, never a screen pixel.** A font size in
  pixels breaks every tuned layout the moment a quad is redrawn in another room.
- **A `null` matrix skips the render.** Degenerate corners paint nothing rather than a guess.
- **A fix to the warp goes into Muralista and is re-vendored.** The tag in
  `src/vendor/warp.source.json` is what moves.

**The room reaches the Projection window as a broadcast, not as a second read.** That window is
created with no preload, so it has no `electronAPI`; the Control window reads the gig folder and
writes what it read to `visualsBroadcast`. A value left from a previous launch is checked against
the folder actually remembered, so it cannot paint last night's room.

**Absence is the empty state.** A shape is a place that can hold content, not a thing that is on:
it is lit only when the playing song points something at it, and a shape whose song is not playing
is simply not rendered — not blacked out, not declared empty. The gap between songs falls out for
free with no blackout state. **A hidden shape does not resolve either** — filtered in
`resolveShapesForType`, the one lookup, so the arm gate and the wall cannot disagree about it.

**The lookup, and it is the whole of it.** The playing song is X; for each song-aware type, take
the shapes reassigned to X if there are any, otherwise the gig-level shapes of that type. **It
resolves to a set and every shape in it is lit.** Nothing caps it at one — two shapes showing the
same lyric is how a corner or a pillar gets spanned, and how an original sits beside its
translation. Muralista's authoring UI offers one shape per type today, so real files contain sets
of size one naturally; **no code may depend on that.**

| Type | Content | Component |
|---|---|---|
| `song-lyrics` | The playing song's timed lyric lines | `ShapeText` with the layer's own formatting |
| `song-video` | The playing song's `media`, and **the clock the lyrics read against** | `ShapeVideo`, `object-fit: fill` — the quad *is* the framing |
| `song-intro` | Title, translated title, tagline, from the song file | `ShapeIntro` — a **locked template**, no formatting controls |
| `gig-contact` | One line of text plus an optional QR code | `ShapeContact` — a locked template, defined once at gig visual setup |

**Pregonero fills content; it never styles it.** `ShapeIntro`'s proportions are Muralista's, matched
value for value against `mapper.css`: the title is a fraction of the shape with auto-fit below it,
and every other measure is a multiple of the title, so the card shrinks as one thing. There are no
controls, so **those proportions are the entire design** — the only handles are the shape's position
and size, which move all three parts together.

### Shapes Pregonero does not coordinate

A logo, a picture, a line of text — authored wholly in `visuals.json` and **up from power-up to
teardown**. Pregonero does not start them, stop them, or decide when they appear; there is no state
behind them. **A `logo` case in Pregonero would be the mistake**: the test for being coordinated is
not "is it on the wall" but "does Pregonero decide when it appears".

They are painted (`ShapeStatic`) because Pregonero is the only thing running on stage — if it
painted nothing for them, nothing would, and the wall would be fully black between songs, which the
design explicitly says it is not. Painting them unconditionally is the absence of a rule, not a
rule. `fill` shapes are the wall's black and are painted flat in output pixels with no unit box and
no matrix (`ShapeFill`) — a mask, not content.

### When the contact panel is lit

> **Lit when not armed, or when the setlist is done and no song is presenting.** Dark otherwise.

One condition, and it is written as a condition rather than as a list of events because it covers
all four moments with no special case: lit at power-up (not armed); dark through the setlist
including the gaps (a gap is inside the setlist); dark while a repeat plays; **lit again the moment
that repeat ends**, because the wall's attention belongs to the song, but the instant it finishes
the room is being asked to leave with his details. **If an implementation needs a special case for
any of those four, the condition is wrong** — go back to it rather than adding the branch.

"Presenting" means a loaded song that has not yet reached its end.

**It is evaluated in the Control window and travels as one boolean.** Every input is that window's:
the armed flag, the played log, and the playable setlist from the readiness snapshot. The Projection
window is handed the answer rather than copies of the inputs, so there is one implementation of the
condition. The value is read at mount and on every `storage` event, and **an absent key reads as
lit** — the power-up answer.

`gig-contact` is a **gig-level fact**: it is looked up with no song at all, and a per-song
reassignment of it is dropped rather than honoured. That is why it is not called `song-contact`.

**What it replaced, and both are gone:** the **end card** (`endCardState.ts`, its content file and
its CSS) and the **logo-when-nothing-is-armed** fallback in Projection. Both existed to put
something on the wall when no song was presenting, which a `gig-contact` shape does properly — tuned
to the room instead of read from a text file. With the logo gone, the Projection window no longer
waits for an arm transition before showing anything: reopened mid-song it shows the line that is
playing, where it used to show the logo until the next arm.

**The arm-broadcast nonce in `performanceState.ts` did not go with them.** It looks like logo
plumbing and is not — it is the storage-event fix documented below, and other broadcasts depend on
the same pattern.

**`pattern` is deliberately not painted.** It is Muralista's test pattern — the default type for a
new shape and the fallback for a layer this build does not recognise — so it is an authoring aid.
One on a wall at a gig would be a bug that looks like a feature.

A static `image` or `video` resolves its source through `resolveMediaPath`, the same per-machine
answer song media gets: the link table first, the configured media folder second. **A source that
does not arrive paints nothing**, deliberately — a broken image on a wall says less than an empty
shape does, and the fix is in the folder. `#/folders` is where both the folder and the per-source
link are set, and where a name with nothing behind it is visible instead of silent.

**Paint order is the shape list's order** — later is on top. That is Muralista's rule and the only
place the z-order is authored; grouping by type when rendering would silently reorder the wall.

### Muralista sets the boundary; Pregonero renders inside it

**Jorge, 2026-08-27, and it replaced a proposed extraction round.** `shapeTextLayout.ts` looked like
a second implementation of Muralista's text layout. **It is not debt, because the relationship is not
replication:**

> **Muralista tunes against the worst case and emits a boundary. Pregonero renders the real lyrics
> inside that boundary.**

Muralista never reads song content. It previews with a deliberately nasty dummy line and writes down
a `maxSize` that is safe; Pregonero executes within those guidelines. Two jobs sharing a boundary,
not one computation done twice.

**What must agree is narrow: the meaning of a size fraction, and the quad-stretch correction.** Those
two are asserted against Muralista's own numbers over a set of known quads in
`muralistaTextContract.test.ts` — **a test, deliberately, and not an extracted module.** A failure
there means the two have drifted, and the fix goes into whichever one moved away from the written
rule.

**When a real line beats the boundary anyway, it shrinks — it never spills.** Muralista's v1 scope is
that text cannot overflow, so a smaller line is the only answer available. `fitInBox` returns the
maximum untouched for every line that fits, so **the size is uniform across lines** and only the
offending one moves: text jumping size line to line on a wall is worse than text being smaller.

**The dummy line is therefore load-bearing as the worst case**, and `worstCase.ts` is where that is
checkable. **The real catalogue beats it**: 36 of 1088 lyric strings are harder than the stand-in,
almost all on the longest-unbreakable-run axis — `ontdekkingsreiziger` is nineteen characters against
the stand-in's eleven. **That is a Muralista finding**, not something to fix here; the answer is a
nastier stand-in over there.

### The debrief

Offered when the setlist ends, which is round D's predicate against the **playable** setlist.
Written to `<gig>/debrief.md`, an existing convention.

**Not modal, and that is a requirement rather than a preference.** A repeat happens *after* the
setlist ends, so a blocking debrief would land exactly on the moment the app has to honour a
request. It sits inline in the control window, above the controls and never over them; it is
dismissable and reopenable. **Control window only — it never reaches the projection.**

**Everything factual is prefilled and none of it is typed:** date, venue, start and end time, total
duration; the setlist as performed, in order, with times, including repeats and anything skipped;
and what the app noticed going wrong — which is the readiness delta rendered, a further view of the
one function rather than a second opinion.

**Four taps and one line, and there is no fifth field.** The room (empty / thin / decent / full),
best song, worst song, and one sentence about this room. Every one earns its place by existing
nowhere else; a field a future self would have to be disciplined to fill is a field that stays
empty. Adding one is how this stops being fillable while packing up.

"Never offered" and "dismissed" are different states — without that distinction the panel either
never opens on its own or reopens after he has said Later.

### The projection window goes on the projector

`createProjectionWindow` is born on the projector's bounds and *then* goes fullscreen — a window made
fullscreen on one display and moved afterwards is a display change the renderer has to survive, and
there is no reason to create one. The projector is the display that is **not** the laptop's own.

**The fallback is visible.** With one display the window opens exactly as it did before, and the
control screen says so with the reason and *drag it across yourself*. A projection window that
quietly stayed on the laptop is discovered by looking at a blank wall, at a venue, with people
arriving.

**Nothing is remembered.** The display is read at the moment the window opens and never stored: the
output size is a parameter passed on every render (`docs/warp-contract.md`, caller obligation 1), and
a remembered display would be the frozen-matrix bug with extra steps. `projection:placement` returns
a sentence for a screen, and nothing renders from it.

### Routing

Hash-based: `#/control`, `#/projection`, `#/songs`, `#/gig`, `#/folders`, `#/languages`, `#/setlists`, etc. `App.tsx` is the root component and orchestrates hooks + routing.

### The library is a cache, `songs/` is the source of truth

**Pregonero holds a reference to each song, never a copy, and never writes song data.** A library
entry is `{ id, path }`; the song is read from `path` on every launch. Lyrics, translations, intro,
notes, `timeline`, `leadIn`, `media` and `tempo` are all fields of the song file, authored in
Bombista or by hand, and the app reads all of them and writes none. There is deliberately no
timeline-import button and no way to attach media to a song from inside the app: both used to write
into the copy, which is exactly the drift this removes. The camera button on the manage screen is
the one survivor and it is not song data — it records where *this machine* keeps the video the song
file already names, in `mediaPathStore`.

**The id comes from the file name** (`songIdFromPath`: basename minus `.json`), so deleting a song
from the library and adding the same file again restores the same song rather than a stranger. A
reference's `path` is absolute, or a name relative to the configured songs folder when there is one
— see "Where this machine keeps things" above.

**A reference whose file will not read stays in the library** as a visibly broken row naming the
path. It is not a song the app can perform — `getLibrarySongs`, `getOrderedSongsForActiveSetlist`
and `getLibrarySongById` all skip it — but hiding it would hide the problem, and the fix is in
`songs/`. `libertad.json` is the live example: its timeline has 20 entries against 24 lyric lines,
so `parseSongFile` rejects it today.

**Anything older than v8 is discarded on load, setlists included** — one code path, no migration
branch (Jorge, 2026-08-24). Those snapshots held copies whose only authority was themselves, so
there is nothing in them worth reconciling against the files.

**Reading a file is Electron-only**, and goes through `platform.ts` like every other file this app
touches: `readSongFileText` over the `fs:readSongFile` IPC handler. `ensureSongLibraryHydrated({ readSongFile })` takes the reader as an
argument, which is the seam tests use (`src/testSupport/library.ts` installs references and a
resolved cache together, exactly as hydration would).

### Song Data Format

Songs are stored as JSON with multilingual lyrics indexed by language code. Each lyric entry is an array of lines. The stored snapshot is versioned (**v8**; anything older is wiped on load). Optional fields: `title_translations`, `intro`, `tempo { bpm, numerator, denominator, countInBars }`, `media` (a single `MediaFile`, not the older `{ big?, small? }` per-format container), and `timeline` (per-item `{ start, end }` seconds; a `timelineVersion: 2` timeline is cue-relative with a separate `leadIn` block and carries sung lines only — see `docs/timeline-v2-contract.md`). Songs without these behave exactly as before. `media.src` is a logical filename only — the absolute path is resolved per-machine via `mediaPathStore` (see `docs/media-assets.md`).

### Hook stability gotcha (important)

**This got better in v8, and the rule stays.** `getLibrarySongById` used to rebuild a song object
from localStorage on **every call**, so `currentLibrarySong` and everything derived from it were new
references each render. Any `useEffect`/`useMemo` depending on one *by object identity* re-ran every
render, which caused an infinite render loop in `useBeatClock` (effect → `setState` → re-render →
new object → effect again, exploding memory).

Since the library became an in-memory cache, `getLibrarySongById` returns **the same object** for
the same id, so that particular loop can no longer start. But the cache is replaced wholesale
whenever the library is rehydrated, so song identity is stable only *within* a hydration.

Rule, unchanged: timer/effect hooks key on **primitive values** (e.g. `tempo.bpm`, `currentSongId`),
not the song object. Store the object in a `ref` updated each render if you need it inside a
callback. `useBeatClock` follows this pattern.

### Storage-event / persisted-flag gotcha (important)

Browsers only fire a cross-window `storage` event when a `localStorage` key's value **actually changes** — writing the same value twice is a no-op with no event. This matters because several keys pair a `sessionStorage`-backed flag (fresh every launch) with a `localStorage`-backed broadcast companion (persists across launches): `setArmedInStorage` in `performanceState.ts` is the canonical example (`KEY_ARMED` in sessionStorage, `KEY_ARMED_BROADCAST` in localStorage). If a previous session left the broadcast key already holding its "true" value and the write uses a **constant**, the *first* write of a new session is a same-value no-op — no event fires, and any consumer that only reacts to that event (rather than reading current state at mount) gets stuck. This bit the Projection window's logo-reveal on 2026-07-02 (audience view stuck on the logo on the first arm of a session; unarm/re-arm worked around it). **That logo is gone and the nonce is not**: it is the fix for the whole family, and other broadcasts depend on the pattern.

Rule: any broadcast write whose consumer needs to detect a **transition** (not just "what's the current value") — arm, video seek/transport, auto-blackout — must write a changing nonce (e.g. `` `${Date.now()}-${counter}` `` or `{ ..., nonce: Date.now() }`), never a constant, so the event is guaranteed to fire regardless of prior state. The consumer should treat *any* value as the signal, not match a literal. Broadcasts whose consumer reads the current value directly at mount (`useState(getBroadcastX)`) — screenSize, displayMode, the room, the contact condition — don't need this *for the transition problem*, since a suppressed no-op event is harmless when the mount-time read is already correct.

**But "the mount-time read is already correct" has its own failure mode (A1, 2026-07-04 projector test — confirmed root cause).** When the sessionStorage side of the pair is a **selection with a computed default** (`selected ?? getDefault(...)`, fresh/empty every launch) rather than a flag that's simply present or absent, the *broadcast* can go stale relative to *this session's* freshly computed default — even though no transition was missed. Concretely: `KEY_DISPLAY_MODE_BROADCAST` was only ever written by the toggle's click handler (`handleSelectDisplayMode` in `App.tsx`). On a fresh launch with no click yet, Control's `effectiveDisplayMode` computes to `'small'` (default for a video song) while the broadcast in localStorage still held `'none'` from a previous session/song. The Projection window reads the broadcast at mount (`useState(getBroadcastDisplayMode)`) and got the stale `'none'`, so `showVideoProjection` was false and the video region never mounted — audience stuck on the title/intro card until the performer manually touched the toggle.

Rule: whenever a broadcast pairs with a sessionStorage selection that has a **computed default** (not just `getStoredX() ?? null`), the owning window must **write-through the broadcast to match its own effective value on every render where that value changes** — not only inside the click handler. A `useEffect(() => { localStorage.setItem(BROADCAST_KEY, effectiveValue) }, [effectiveValue])` keyed on the primitive effective value (session start, song change, and toggle clicks all flow through it) is sufficient; see the display-mode fix in `ControlView` (`App.tsx`) for the pattern. This is a different mechanism from the nonce rule above (that one is about a missed *event*; this one is about the *value itself* not matching the current session's default) but the fix location is the same family of code, so audit both when touching a paired broadcast.

## Development Protocol (TDD)

This project follows strict **Red → Green → Refactor** for every change:

1. **Restate** the expected behavior in testable form.
2. **Write failing tests** (don't touch production code until tests fail for the right reason).
3. **Make the smallest implementation change** to turn tests green.
4. **Only then refactor** — must not change behavior.
5. **Commit only when tests are green.**

Prefer behavior tests over implementation-detail tests. Extract pure functions when logic is too coupled to test. Do not mix feature work, bug fixing, and refactoring in the same step.

### Main-process / protocol code isn't covered by Vitest

Anything in `electron/main.cjs` — custom `protocol.handle` schemes, IPC handlers, window logic — runs in the Electron main process and is invisible to Vitest (jsdom). A pure-helper unit test can be green while the real **renderer → Chromium → main-process** round trip is broken. This bit us on the `media://` protocol: the helper test asserted the URL string and passed, but the shipped empty-host form (`media:///Users/...`) was canonicalized by Chromium to `media://users/...`, dropping `/Users` from the handler's path (fixed by the `local` sentinel host — see the `mediaPathStore` row above). Rule: any change touching a custom scheme or `main.cjs` must carry a manual verification step that exercises the actual handler — minimally a DevTools `fetch("<scheme>://…")` asserting **status 200** — not just a pure-function test.

## Tech Stack

- **Electron 41** + **Vite 8** + **React 18** + **TypeScript 5.6** (strict mode)
- **Vitest 4** + **React Testing Library** for tests (jsdom 28)
- **@dnd-kit** for drag-and-drop in setlist management
- **ws** for the WebSocket server
- Packaging via **electron-builder** (`npm run pack`, `--mac`) — not yet exercised for distribution
