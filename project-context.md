# Project Context — Pregonero

Project-specific Cowork context. Read this **after** `context/personal-context.md` (and any relevant `context/disciplines/<topic>.md`), relative to the vault root. Acknowledge briefly ("Context loaded. Ready.") and wait for the user to describe what's on their plate. At the end of the session, propose updates if anything important changed.

The engineering counterpart for Claude Code lives in `CLAUDE.md` at the repo root (`~/Chango Pepper/projects/pregonero/CLAUDE.md`). That file and this one are the two persistent memories for this project.

---

## What this project is

- **Pregonero** (renamed from Live Lyric Translator, 2026-08-14) — macOS Electron app for live concert subtitle projection.
- Part of the live setup for the artist **Chango Pepper** (Latin American roots / Spanish lyrics, performed for international audiences).
- Solo build; used as a real testbed for AI-assisted PM techniques.

## How it works (at a glance)

- Two-window architecture: **Control** (performer) + **Projection** (audience), synchronized via WebSocket on `ws://localhost:8765`.
- **Two per-song playback modes**: **Manual** (keyboard arrows / Bluetooth pedal — always the fallback) and **Video** (subtitles locked to a synchronized animation video via `video.currentTime`). Manual override always wins. (Timed mode and record-by-tapping were removed in the video & tempo rework — timelines are now authored offline in the JSON.)
- Each song can link a **big-screen and a small-screen** video; the size is picked at arming time (Projection column) and broadcast to the Projection window. Projection can also play a clean full-frame animation and composite the subtitle band itself (**display profiles**). Plus a performer **count-in/beat indicator** (`BeatCircle`, driven by `getBeatPhase`, with compound-meter grouping), translatable **titles/intros**, and an **end-card** screen.
- Multilingual JSON songs (**v5 schema**: `title_translations`, `intro`, `tempo {bpm, numerator, denominator, countInBars}`, `media {big?, small?}`, `timeline`), setlists, and a performance state machine: `SETUP → READY_TO_ARM → ARMED → PERFORMING`.
- Live hardware: Mac mini + projector + iPad via Sidecar + Bluetooth pedal.

## Tech stack

- Electron 41, Vite 8, React 18, TypeScript 5.6 strict.
- Vitest 4 for tests, @dnd-kit for drag-and-drop, `ws` for the websocket bridge.
- Core architectural pattern: pure-function state modules + React hooks, with strict TDD (Red → Green → Refactor).

## Links

- Repo: https://github.com/jorgevallejos/pregonero
- Artist site: https://sites.google.com/view/changopepper/home

## Architecture & build history

Chronological. Read top to bottom for how the app got here; later entries supersede earlier ones where they touch the same behaviour.

### The video & tempo rework

The **video & tempo rework** (branch `feat/remove-timed-mode`) replaced the earlier video-sync / auto-advance feature set across 8 slices: tempo split into `numerator`/`denominator` with compound-meter beat grouping, per-song big/small `media` slots, Timed mode + record-by-tapping removed, a camera-icon link dialog in Manage Setlists, a Big/Small selector in the Projection column with WS broadcast, a shared `BeatCircle` indicator, and simplified video + non-video performance screens with a single-clock count-in→video handoff. This took the schema to **v5**.

A follow-up **video transport-sync fix** closed a gap the rework left: the Projection video used to auto-play at arm time and ignore the count-in. Now both windows hold their own `<video>` and the Projection obeys `play`/`pause`/`seek` broadcast from the performer panel over a `localStorage` transport channel, so the audience video starts on the count-in downbeat (architecture noted in `CLAUDE.md`).

**D-wire test run (2026-06-23):** the first end-to-end projector test surfaced 10 observations (9 real code bugs, none tuning; #10 beat-viz deferred). Critical bug: the linked video didn't show in either window because the renderer ran on an `http://localhost` dev origin while `<video>` used a `file://` URL — Electron `webSecurity` blocks that with no custom protocol registered. Fixed with a `media://` protocol in `main.cjs`.

**Model decision (2026-06-23): one video per song; "Big"/"Small" is a projection display-format toggle mapping to the `big-screen`/`small-canvas` display profiles, NOT a per-format file.** This reversed the rework's per-song big/small *file* slots (schema v5→v6, `media` became a single `MediaFile`) but kept the display-profile machinery.

Remaining build docs from this round: `docs/media-assets.md`, `docs/subtitle-format.md`.

### Feature-complete for performing, and packaging (2026-07-02)

**What the app did at this point (performer/audience UX; some of this is superseded by Timeline v2 below):**
- **Projection-column setup** has fixed-px, labelled toggle controls (no more window-rescaling icons): **Display format** (Small / Big / None), **Transitions** (Manual / Auto), and a **Beat indicator** on/off (filled/empty circle). Green = active. Four equal setup columns.
- **Manual mode:** after arm, the bottom-bar button is **Start** (Next/Prev disabled) → Start runs the count-in so the performer catches the tempo → button becomes **Restart**, Next/Prev enabled → first **Next** reveals line 1. (No Start step when beat is off / song has no tempo.)
- **Auto mode (as built at this point — superseded 2026-08-14 by Timeline v2 P1 for v2-timeline songs, see below):** behaves like Video mode but driven by the beat clock — **Play / Pause / Restart** transport, Play runs the count-in with the audience black, and after `tempo.countInBars` the timeline drives cues into **both** performer and audience windows.
- **Beat↔Auto dependency:** beat OFF disables Auto and forces Manual (one-directional, with a hint).
- **Video big/small formats** now share one full-frame layout (single **3:2** frame; both Big and Small = full-frame `contain` + superimposed subtitle at the bottom; EB Garamond SemiBold). **The only per-format difference is subtitle font size** — Small keeps the larger font (`160/3168` of frame height). Non-video songs render centered. *(Simplified from the old Small = 75.8% scaled + bottom-band geometry, which matched a now-superseded Premiere reference. The Small font was carried over unvalidated for the overlay context; needed a live projector eyeball.)*

**Packaging:** `npm run pack` = `npm run build && electron-builder --mac`; mac targets `dmg` + `zip`; `build.files` = dist + electron + package.json; app icon from `assets/logo/`; unsigned (`identity: null`). Produces **`release/Pregonero-<version>.dmg`** (arm64), where `<version>` is `package.json`'s `version` field via `artifactName`. **Lesson: bump `package.json` when cutting a build you need to tell apart from the last one** — it sat on a stale placeholder for a while, which made every build's filename identical and indistinguishable, even as the git tags kept moving. Runs on Jorge's Macs via right-click → Open (Gatekeeper). Songs/animations stay on disk, resolved via the `media://` protocol.

**Prompt 15 — closed as obsolete.** Its two-row control layout was effectively built by the T1 toggle redesign; its "icons-only, no text labels" rule was **intentionally reversed** when Jorge asked for the tiny "Display format / Transitions / Beat indicator" labels.

**PR #48 review fixes:** re-testing behaviour after packaging surfaced two topics.
- **Stuck-logo-on-first-arm.** The audience Projection window stayed on the Chango Pepper logo on the *first* arm of a session (unarm/re-arm worked around it). Cause: `KEY_ARMED_BROADCAST` (localStorage, persists across launches) wrote the constant `'1'`, so a leftover `'1'` from a prior session made the first arm a same-value no-op — no cross-window `storage` event, logo never cleared. Fixed by writing a changing nonce on every arm; the consumer now treats any non-null value as "armed". Audit found the other broadcasts (screenSize, displayMode, endCard) not at risk (they read the current value at mount). Class of bug now documented as the **"storage-event / persisted-flag gotcha"** in repo `CLAUDE.md`.
- **Small format = full-frame + larger font.** See the Video big/small formats bullet above.

**Signed + notarized packaging** (distributable, no Gatekeeper warning) is gated on Jorge getting an **Apple Developer account** ($99/yr): Developer ID Application cert, code signing, hardened-runtime entitlements (allow the `media://` custom protocol, plus JIT if needed), notarization via `notarytool` (app-specific password or API key), and stapling. Write this as its own dispatch once the credentials exist — not a rebuild of Packaging P1 (the unsigned local `.dmg`, already done), a separate follow-on to it.

**Optional / deferred ideas from this round:** add a `tempo` block to `songs/libertad*.json` if Jorge wants a beat indicator on it (data only); chords on/off toggle; native iPad app beyond Sidecar. *(Offline forced alignment and live-ASR following are both resolved by the 2026-07-03 ASR spike below.)*

**How this was built (way of working):** Opus-in-Cowork coordinates/specs; Claude Code on the Mac runs the builds as autonomous batches in **bypass permission mode**, auto-merging PRs on green with screenshots attached for async review. Dispatch docs (2026-07-01, for history): `wave2-kickoff`, `projection-format-fixes`, `performer-polish`, `auto-polish-and-manual-start`, `toggle-and-auto-transition`, `t3-and-packaging`.

### ASR-following spike — closed NO-GO (2026-07-03)

Dispatched from Cowork, run in Claude Code (Fable coordinator + Sonnet slices). Branch `spike/asr-following` carries the full report. Throwaway — never merged.

- **Verdict: NO-GO on live ASR driving the lyric pointer.** The *tracking* problem is solved — best candidate (faster-whisper small) advanced all 29 Tragedia lines in order through the accelerando, zero false jumps — but streaming latency kills it: median wall-clock lag **5.36 s** vs the ≤1.0 s rule (3.4% of lines within ±1.0 s vs ≥90% required). Core trade found: on local CPU today, recognizers fast enough for realtime are too inaccurate on sung Spanish over guitar; the accurate one runs at 0.60× realtime. Question closed; the **timeline/Auto (beat-clock) architecture stands validated**.
- **Side finding 1 — offline forced alignment is the win:** faster-whisper `medium` batch-aligned the whole song near-verbatim in 46 s. Adopted 2026-07-03 as **Bombista's core mechanism** (pivot recorded in that project) — ASR authors timelines; it doesn't drive the show.
- **Side finding 2 — real bug found:** the shipped `tragedia-de-cerdo-asado.json` `timeline` is a misaligned uniform 5.5 s scaffold, **~17 s late vs its linked video** (`media.offset` 0) and overrunning it by 18 s. Must be **regenerated (via the extractor) before this song is performed in Video mode**. Lesson for repo `CLAUDE.md`: timeline values are only meaningful relative to the linked video's own clock — generate them from that video's audio.
- **Housekeeping (part B of the 2026-07-03 extractor dispatch):** push `spike/asr-following` to origin (preserve report + reusable scripts, no PR), commit the kickoff doc + the `CLAUDE.md` timeline-validity note to `main` via a docs PR, delete the stray `feat/timeline-import-button` branch.

### Projector-test fixes (2026-08-11 round)

The **2026-07-04 projector-test fixes**, all merged to `main`:
- **#52** — Projection resyncs display-mode broadcast to Control's effective value (A1 area).
- **#53** — non-video Projection label drops the stale size; Transitions toggle shown for tempo-only songs (C1/C2).
- **#54** — performer sees the big centered singing-language lyric superimposed over the video, transport bar kept reachable (A2/B1/B2).
- **#55** — toggle labels no longer clip in the non-video Projection column (D1).

### Timeline v2 — P1–P4 (2026-08-14)

Branch `feat/timeline-v2`. The shared contract with Bombista (the timeline extractor) is
`docs/timeline-v2-contract.md` — an identical copy lives in `projects/bombista/docs/`.
**That file is authoritative for the interchange shape; read it before touching timeline code.**

A timeline is no longer absolute against an audio file. It is **relative to a start cue**: line 0
always starts at `0.000`, and the seconds before the first sung word are banked in a separate
`leadIn` block. What provides the cue differs by mode — the video for an animation song, Jorge's
first pedal press for everything else — but the file is identical either way.

What this round built:

- **P3** — both load paths (`songState.ts::parseSongRecordFromUnknown`, `setlistStore.ts::parseTimelineFromJsonText`) reject any timeline without `timelineVersion: 2`, never coercing. A file declaring v2 but carrying no timeline is rejected as incomplete rather than loaded as a no-op. Unknown top-level keys are **deliberately ignored, never rejected** — a forward-compatibility guarantee pinned by regression tests so it does not get "tightened" later.
- **P4** — lyrics arrays carry sung lines only; section markers are rejected at the load boundary, naming the index.
- **P2** — `leadIn` applied in Video mode, as one tested pure function: `songTime = video.currentTime + offset − (leadIn.apply ? durationSec : 0)`. `media.trimStart` is deliberately excluded (already reflected in `currentTime`; including it would shift twice). Losslessness proven as a property against the golden fixture within 0.005.
- **P1** — start-on-cue for Auto mode. Armed + Auto + v2 timeline + no video means no Play button and no count-in; the first pedal press shows line 0 and starts the clock at `0.000`; lines then advance alone. Pause/Restart appear only once cued; manual Next/Prev stay live throughout; the audience keeps the title/intro card until the cue. **This replaces the Play/Pause/Restart Auto-mode transport described above, for songs carrying a v2 timeline.** Tested with the pedal on real hardware, Libertad, 2026-08-14.

Persisted schema went **v6 → v7** (`LibrarySong` gained `timelineVersion`/`leadIn`). The migration
keeps legacy timelines exactly as they were and never invents a version — a song becomes v2 only
by passing through the guarded load path.

**Known behaviour change outside P1's scope, deliberately kept:** the beat clock's tick effect used
to refuse to run without a BPM, so a song with a timeline but no tempo froze at 0 and never
advanced. Fixed — but that also means a *legacy* tempo-less Auto song now advances on Play where it
previously did nothing. A latent bug fixed, not a regression, but it is a real change. See P8 below.

**Follow-ups P5–P8, recorded 2026-08-14, not built.** Derived from what the P1–P4 round surfaced; none block the merge.

- **P5 — finish removing section markers.** P4 tightened only the file-load/import boundary. The `SectionMarker` type, `isSection`, the section rendering paths, and `tryParsePersistedSongItemsArray` (which still accepts sections) are all untouched. Tightening the *persisted* path was refused on purpose: a rejection there fails the whole snapshot load and would wipe the local library. Do this as a deliberate deletion with the store path handled last. **Deletes code.**
- **P6 — close the v1-timeline grandfathering gap.** Only the load paths are guarded. Timelines already sitting in localStorage from earlier imports keep their v1 (absolute) values and still drive playback, so a v1 timeline can currently *play* even though it can no longer be *loaded*. Least-destructive choice at the time, and it self-closes once both songs are re-imported post-B13 — but until then the gap is real. Options: ignore non-v2 stored timelines at playback with a visible "re-import needed" state, or drop them on migration.
- **P7 — resolve `ControlView.test.tsx` "2g. Lyrics display".** Known-red on purpose, with the reasoning in a comment above the test. It asserts the Lyrics-display value area renders nothing when no language is set, but `getEffectiveProjectionLanguage` has always defaulted to `'en'` when the song offers it, so the span correctly reads "EN". That default has its own passing unit test. **This is a product decision, not a test edit:** either the `'en'` default is right and 2g should assert "EN", or the test should use lines with no `en` key to genuinely exercise the no-language case.
- **P8 — decide what legacy tempo-less Auto should do.** Per the note above, such songs now advance on Play against their legacy absolute timings. Probably fine and probably wanted, but it was never an explicit decision. Resolving P6 may make it moot.

**Stale worktree/branch cleanup, 2026-08-14.** The four stale worktrees under the old
`live-lyric-translator-dev` path were pruned and their leftover directories removed, along with the
four branches they held.

**Three of those four branches were unmerged**, so deleting them dropped real commits from
3–4 July. Branch deletion is one-way and the SHAs otherwise survive only in a chat transcript,
so they are recorded here. All three are almost certainly superseded — `main` was 17+ commits
ahead when they went — but "almost certainly" is why the SHAs are written down. Recover with
`git checkout -b <name> <sha>` while the objects remain in the local repo.

| branch | tip | what it was |
|---|---|---|
| `fix/projection-column-c1-c2` | `6d51a0e` | Non-video Projection label dropping a stale size, plus the Transitions toggle shown for tempo-only songs (C1/C2). Touched `App.tsx` and `ControlView.test.tsx`. **Still on `origin`**, so this one is recoverable from GitHub regardless. |
| `integration-check` | `3d6f748` | An integration branch merging `fix/performer-panel-lyric-layout`: performer's singing-language lyric over video, transport bar kept reachable. Touched `App.tsx`, `VideoPerformancePanel.tsx`, `control.css` and their tests. Local only. |
| `worktree-agent-a972d5e0e5b143760` | `1cb72ce` | Projection resyncing the display-mode broadcast to Control's effective value — the A1 fix area. Touched `CLAUDE.md`, `App.tsx`, `ControlView.test.tsx`. Local only. |

The fourth, `claude/zen-hypatia-98259a` (`717daab`), was already merged into `main` — nothing lost.

### Pulse, manual override and performed tempo — P5/P6/P9 (2026-08-14)

Pulled forward from the general backlog because it was deadline-critical for the 21 Aug solo-ready date, not polish.

- **P5 — the pulse runs from Arm and never re-phases on the cue.** Jorge plays *to* the pulse while talking to the audience during arming; he counts himself in on guitar and cues the lyrics with the pedal whenever he's settled, not necessarily on a downbeat. The pulse (`BeatCircle`, driven by `getBeatPhase`) free-runs from the moment of Arm; the pedal cue only starts `songElapsedMs` and must never call `setPhase` to force a re-phase. **Two independent clocks** — the pulse (from Arm) and the song timeline (from the cue) — with a constant offset between them being correct and expected. (Same separation Bombista's project-context states as a design boundary on its side: "the pulse and the timeline are separate clocks.")
- **P6 — a manual Next/Previous during Auto playback drops the song into Manual for the remainder of that song**, one press, visibly, resetting only on the next song/arm. This is the concrete mechanism behind the README's "a single pedal press takes it back" line.
- **P9 — performed-tempo scaling, applied at playback, never by rewriting Bombista's output:**
  ```
  scale      = tempo.bpm (declared, from the recording) / performedBpm
  cueTime[i] = timeline[i].start × scale
  ```
  The pulse also runs at `performedBpm`, deriving from the same number so it cannot drift from the cues. Non-negotiables: **never overwrite `tempo.bpm`** (a fact about the recording the whole scale depends on) — a persisted performed tempo lives in its own key, `performedBpm`; **adjustable only while idle, frozen once armed** (changing it mid-song would jump the current line); **default `performedBpm == tempo.bpm`** (scale 1.0, byte-identical to today unless nudged); **a song with no `tempo` block gets no pulse and no scaling** — no invented fallback BPM.
- **P10 (pulse audio) — considered and explicitly parked, 2026-08-14, Jorge's call.** The pulse is visual only (`BeatCircle`'s dot row; no `AudioContext`/oscillator/audio asset anywhere in `src/`) — P5's "click track" wording was loose, not a missing feature. An audible click is out of scope and not currently planned; kept as a record of the shape it would take if it ever is: a short WebAudio blip on `absoluteBeat` change, accented on `beatInBar === 1`, with an on/off control, and an open output-device question (laptop speaker is useless on stage; likely wants an in-ear/monitor path). It would inherit P5's phase behaviour for free.

### Tramoya integration — what changed inside this repo (2026-08-26–27)

The cross-tool contract and the setup-flow design belong to
`projects/tramoya-integration/project-context.md` ("Pregonero owns what and when, Muralista owns
how"; "One readiness function, four views"). Recorded here is what changed specifically inside
Pregonero that the integration file does not carry.

- **The gig became the unit of play.** `playedSongsState` changed from tracking one song to holding
  an ordered list of performances, each with `startedAt`/`endedAt`. A request after the setlist ends
  no longer restarts the running order.
- **The gig is a folder with `gig.json` in it.** Projection paints into Muralista's mapped quads
  instead of rendering one full frame, and typed shapes decide what appears where. `gig-contact`
  replaced both the old end-card screen and the logo fallback, and the gig now ends in a prefilled
  debrief rather than just stopping.
- **The manage screen's "Locate video…" button is gone.** It was a third door onto a song's media,
  made unnecessary once the setup flow's configured media folder resolves media by name instead.
  `tragedia` is the only catalogue song with linked media, so it is the one song that actually
  exercises this path.
- **The logo was briefly off the wall.** Removing the old end-card/logo fallback (the same round
  that introduced `gig-contact`) left nothing painting the logo for a stretch, until it was wired
  through the same media-folder mechanism. Worth keeping as a lesson, in the same family as the
  storage-event gotcha above: deleting a fallback path can silently delete the only thing painting
  something, if the replacement isn't wired to the same source before the old path goes.

### The first from-scratch walk, and what it found (2026-08-31)

**The E2E run was attempted at the studio and stopped deliberately at setup step 1.** Not a failure
of the attempt: the run answered its question, and continuing would have required feeding files in
from outside, which would have tested something other than what was being tested. The setup
redesign it produced lives in `projects/tramoya-integration/project-context.md`; recorded here is
what is specific to this repo.

**The control window had no responsive behaviour at all, and three defects came from it.** No media
query existed anywhere in `control.css` before this date.

1. **Mid-word wrapping in the GIG column** — `min-width: 0` on those buttons removed the flex floor
   that normally keeps a word intact, and `word-break: break-word` then split it. Only GIG had two
   buttons competing for width. Fixed with `min-width: min-content`, dropping the legacy
   `word-break` spelling, which is `overflow-wrap: anywhere` and would have cancelled the floor.
2. **The rig checklist collided with the section above it** — `grid-template-columns: 1fr 1fr 1fr 1fr`
   was hardcoded and its comment named only four sections, while `App.tsx` had grown to **six**, two
   of them conditional. Auto-placement wrapped Rig and Arm into a second row-block on top of GIG.
   Fixed with `grid-auto-flow: column`, so a seventh section widens the row instead of folding under
   the first, and a regression test now asserts no fixed column count is declared.
3. **The Arm button spilled onto a white strip** — `html, body, #root` declared no background while
   `.control-screen` is a fixed `100vh`, so anything overflowing landed on the unstyled page. Defect
   2 was its cause; the missing background was a latent bug regardless, and is now set.

**The lesson is the stale comment, not the stale number.** The grid's own comment named four sections
by name while six rendered. A comment that lists what something contains becomes a second source of
truth and rots the moment the thing grows. Same family as the Praktijk tab that no document named.

**PR #79 also carried a reflow, and it was dropped before merge.** Its 1310px breakpoint was found
by sweeping for where buttons begin to **clip**. Seen on the real iPad the same day, the panel is
illegible well before it clips — values break mid-word, the rig checklist becomes a ribbon — and the
reflow correctly does not fire, because nothing is clipped. **Wrong criterion, not a wrong number.**
Legibility is the test, and the number chosen by reading the panel will be higher.

**So the file has no media query again**, which is the state it was in before the collision was
fixed, and the reason is written into `control.css` where the fold was so the next person does not
re-derive it from clipping. **The expected outcome of merging #79 is a panel that is still
illegible at iPad width** — if it looks fixed, the wrong half was merged. The three fixes are about
a grid that collided with itself, not about narrow surfaces.

**One thing this cost, worth knowing before the next split:** the three fixes and the reflow were
written into a single commit, so there was no commit to drop. Two halves that will be judged
separately belong in two commits, whatever their size.

**`dist/` was two weeks stale and shipped `v0.22.0` while `package.json` said `v0.23.1`.** `npx
electron .` serves `dist/` without warning, so "run from source", which is what the whole rollback
strategy depends on, silently ran the wrong build. Half an hour of defects were diagnosed against it
before the header was noticed. **Anyone told to run from source must be told to build first**, and
the README now says so.

### Setup home, and where its state actually lives (R1, 2026-08-31)

**The control view keeps one button, and songs and gigs became peers one level below it.** Setup
home shows both lists in full, side by side; `Folders` came off the GIG column and is now
**Preferences**, one screen for where the tools and the content live on this machine — songs,
media, Muralista and the Bombista binary path. The design is
`projects/tramoya-integration/project-context.md`; recorded here is what this repo now stores.

**State outside git, named because the vault rule says to name it.**

| What | Where | Why it is allowed to be stored |
|---|---|---|
| **The gig list** — which gigs this machine knows about | `localStorage`, key `pregoneroGigList`, a JSON array of absolute folder paths, most recently opened first | It is a **bookmark list**, like recent files. Losing it costs one trip to a folder picker. |
| The Bombista binary override | `localStorage`, key `pregoneroBombistaPath` | A per-machine fact, like the folders beside it. Normally unset. |

**The gig list stores paths and never readiness**, and that is an instruction rather than an
observation. A stored verdict would go stale precisely when a gig folder is edited from outside
Pregonero, which the escape hatch guarantees will happen — every tool in the suite is usable on its
own by requirement. `libertad` is the standing argument: a flag written when it last passed would
still read Ready today, and it is not. Each row's delta is computed on read, and **until that lands
a row shows no verdict at all rather than a stale one.**

**A row whose folder is gone stays in the list**, named, to be located or forgotten. A folder on a
drive that is not plugged in is not a deleted gig, and a list that tidied itself would erase the
evidence that something moved. Noticing that it is gone is still owed: `electron/gigFolder.cjs`
does not check that the folder exists, so a moved folder and a fresh empty one are identical to it.

**Two findings from planning this round, both of which would have surfaced late.**

- **`bombista` was unreachable from a Finder-launched app.** The bridges called
  `execFile('bombista', ...)`; a Finder launch inherits `/usr/bin:/bin:/usr/sbin:/sbin` and pipx
  installs to `~/.local/bin`. The hosted song flow was dark in exactly the launch mode a performer
  uses, and the symptom was `skipped` — the same word a machine with no Python gets. This is also
  why the vault said "bombista is not on `PATH` on this machine" while `which bombista` answers:
  both were true, of different processes. `electron/bombistaBinary.cjs` resolves it now, and
  preferences says where it looked.
- **`refreshGigReadiness` writes.** It creates `gig.json` when the folder has none and injects the
  app's running order into a gig that has none. A gig list calling it per row would have created
  files in every folder it drew. `src/gigFolderRead.ts` is the read-only path, and it exists before
  the list is built rather than during.

**One thing R1 could not close, and it is Bombista's.** A song made from a lyrics `.txt` and a
recording cannot be finished from inside the app. `bombista align --emit songjson` writes a
complete song file into the **staging** directory; `bombista promote` takes
`click.Path(exists=True)` for its target and merges only the envelope keys, so it can neither
create `songs/<id>.json` nor carry the words into a skeleton — and `back_up_and_replace` copies the
original before replacing it, so it cannot write a file that does not exist. Pregonero must not
move the file itself: it never writes a song file. **So the from-a-text-file entry point needs a
Bombista change, and it is the one thing standing between this round and the walk it is judged
by.** `bombista new` works and its song appears in the list, which is the no-audio branch and the
honest state for a song not yet recorded.

## Discovery

### Chords in the app — design session 2026-08-20

Triggered by the first unsolicited external feature request Pregonero has had (a friend asked to see
chords alongside the lyrics). **Nothing was built and nothing is scheduled**; the session existed to
decide what the feature would be if it ever happens, while the question was live.

**Concluded**

- **Chords are a training surface, not a stage surface.** Names only, inline with the lyrics;
  clicking a name opens the fret diagram. For practising a song, explicitly not for performance
  time.
- **The name is the compact form of the diagram** — two states of one thing, not two features. This
  is what lets one set of named-chord data serve both a dense surface and a teaching surface.
- **No training mode needs inventing — Manual already is one.** Learning a song happens in
  **Manual**, where the performer advances each line and the song therefore waits. Performing happens
  in **Video** or **Auto**, where the clock does not wait. Same distinction, already built, tested
  and pedal-proven. This also reframes what Manual is *for*: it is documented as the fallback for
  when the clock or video fails, but it is equally the practice mode — and **P6** (a manual
  Next/Prev during Auto drops the song into Manual for the rest of it, one press, visibly) is the
  one-press bridge between the two.
- **The whole mechanic is one rule:** clicking a chord name opens a **small popup**, and **the popup
  closes when the phrase changes.** That is the entire spec — no mode flag, no setting, no timer, no
  mode-aware branch. It gives the right behaviour in all three modes because the modes differ in
  what advances the line, not in what the popup does: in Auto or Video the clock dismisses the popup
  within a phrase, so it can never accumulate or outstay its use; in Manual the line changes only
  when Jorge advances it, so it stays exactly as long as he wants. Self-limiting during performance,
  patient during practice, identical code path. It is also semantically right — a chord belongs to
  its line, so its diagram should not outlive the line. Tying popup lifetime to line lifetime is
  what makes the mode question *disappear* rather than get answered.
- **Two constraints for whoever builds it:** the popup must not cover the line currently being sung
  (that line owns the contrast budget), and it is **control-window only**, never broadcast to
  Projection. A practice aid on the audience screen would be a bug.
- **The diagram comes from `projects/guitar-harmony/`** — same renderer, same house style — rather
  than being built twice.

**Rejected**

- *A distinct training/performance mode.* Considered first and dropped: Manual and Auto already are
  that distinction, and inventing a third mode would have been a larger change than the feature that
  prompted it.
- *A "disable chords during performance" setting.* Configuration bolted onto a problem the
  popup-lifetime rule dissolves. Expect this to be re-proposed; the answer is no.
- *Serving the audience rather than the performer.* Chords on the projection screen are a different
  product, not this one.

**Blocked on**

The data does not exist. No song JSON carries chords, and Jorge plays much of his material by ear
without knowing the chord names. Everything above waits on `projects/guitar-harmony/` naming them
first. Design decided early on purpose — while the thinking was fresh — not because it is next.

**Refined 2026-08-23 (Tramoya integration session).** Chords change *within* a phrase, not once per
song, which sharpens "inline with the lyrics" without contradicting it. The rendering is a **chord
line above the lyric line**, each name drawn at the x-offset of its anchor syllable — positioned
typography, not spaces, so EB Garamond being proportional does not matter. This is the form every
guitarist already reads. **The popup-lifetime rule, the two constraints and control-window-only all
stand unchanged.** A chord anchors to a syllable and inherits that line's timing, so nothing here
needs a clock, a tempo or timeline data of its own. Notation is Latin (`Lam`, `Rem`), owned by
`projects/guitar-harmony/`; what this costs Bombista is in
`projects/tramoya-integration/project-context.md`.

## Open follow-ups / parked items

- **Show chords in the app — first unsolicited external feature request (captured 2026-08-20).** A
  friend who was shown Pregonero liked it and asked to see the chords alongside the lyrics. Not
  actioned, deliberately: it is captured here so it survives, not scheduled. Two things to weigh
  before it becomes work. First, **the data does not exist** — no song JSON carries chords today,
  and Jorge plays much of his material by ear without knowing the chord names, so this is blocked on
  naming them first (that is what `projects/guitar-harmony/` is for). Second, it was a **question
  about what Pregonero is** — answered in `## Discovery` above, which owns the design. Nothing about
  this is scheduled.
- **Timeline-import contract (Prompt 16 / A+ button) — JSON, locked 2026-06-24:** the standalone **Bombista** project produces the timeline this app imports. Interchange format is **JSON**: a `{ "timeline": [...] }` envelope deserializing straight into `TimelineEntry[]`, parallel-array contract preserved (one entry per song item, section markers as `start == end == 0`). **The A+ button parser must accept exactly this shape — not SRT.** SRT was rejected because it carries cue text (duplicating the song JSON's source-of-truth lyric order) and can't represent section markers. An optional `.srt` export may exist on the extractor side as a human-QA debug convenience only; it is never the canonical contract. Source of truth for the shape stays `src/songState.ts` (`TimelineEntry`, `videoCueLookup`); the extractor mirrored it in its own output-contract doc.
- ~~**D-wire**~~ — done (Tragedia linked, timeline authored, Video + count-in handoff validated on projector across the 2026-07-01 rounds).
- ~~**Packaging (local)**~~ — done as Packaging P1 (PR #48); see the 2026-07-02 entry above. Only signed + notarized packaging remains, gated on the Apple Developer account.
- **`getLibrarySongById` refactor (tech debt):** it returns a fresh object every render, which caused a render-loop in G (fixed at the hook level). Memoizing it would remove the whole class of bug. Lesson captured in repo `CLAUDE.md` ("Hook stability gotcha").
- The engineering-conventions lesson from G/E was folded into `CLAUDE.md` (new modules table + the unstable-reference gotcha) — an example of the "update CLAUDE.md as conventions crystallize" follow-up below.
- **Lesson: never carry forward a test-suite-size figure across sessions.** An old snapshot was once quoted as current in a later kickoff, which is how that session mistook pre-existing red for a regression it had just caused. Always re-measure before quoting a suite size.
- When working on the product modelling/management discipline, revisit the ideas list in "Project-specific model picks" and properly categorize them: app extensions vs. standalone projects vs. cross-project concerns.
- Consider promoting `/release` to a full Claude Code sub-agent when the command gets complex enough to warrant its own memory and tool boundaries.
- Update `CLAUDE.md` as engineering conventions crystallize from actual work (naming rules, folder conventions, "do/don't" patterns).
- When a good real case comes up, walk me through updating `CLAUDE.md` by example.
- Revisit GitHub MCP installation in Claude Code once the basics feel routine.
- Explore Cowork's `schedule` skill if any recurring PM task emerges (e.g. "weekly backlog review from recent commits").

## Project-specific model picks

General model rule lives in `personal-context.md`. Picks specific to this project's upcoming workstreams:

- Creating custom Claude agents for this app → **Sonnet** (iterative prompt-craft).
- Product-flow model of the app to map frictions and opportunities → **Opus** for the initial framing, then **Sonnet** to populate and maintain.
- ~~Local-AI feature for auto-advancing lyrics without the pedal~~ → **DONE** as Video mode (Timed mode was later removed; the live-ASR-following variant is shelved until the produced master; see the ASR spike above).
- AI-generated UX/UI + design-system exploration → **Sonnet** by default; **Opus** only when deriving a coherent design system from the existing app.
- Generative animation app reacting to live-performance events (audio, place, weather, unexpected pauses) → **Opus** for conceptual and architectural kickoff; **Sonnet** for build-out. (Likely becomes its own project under `~/Chango Pepper/projects/` when it starts.)
- Add chords to lyrics and a possibility to turn them of/on (still open).
- Explore making the app available on iPad as a native experience — not just using the iPad as a second screen via Sidecar (still open).

## Project-specific workflow notes

- The `/release` slash command for this repo lives at `.claude/commands/release.md` and codifies the full release flow (tests → lint → build → commit → push → PR via `gh`) with three human checkpoints: branch confirmation, commit message approval, push confirmation. Generic release principles are in `personal-context.md`.
- `.claude/settings.json` in this repo pre-approves the standard release commands for this project and denies destructive ones (matches the universal policy in `personal-context.md`).
- GitHub MCP is not currently available in Cowork's connector registry; may be addable in Claude Code later.

## Performing workstream (added April 2026)

A new performing discipline was opened alongside the app. Key structures created:

- `songs/` — private song library (JSON files, not in git). **Song intros live here as the single source of truth** — the `spoken-intro.md` in each concert folder is a generated performance copy, not independently maintained.
- `concerts/` — one folder per gig, with `_template/` for reuse. Each gig has `gig-info.md`, `checklist.md`, `setlist.md`, `spoken-intro.md`.
- `disciplines/performing.md` — growing knowledge base on performing and singing.
- `disciplines/communication.md` — new discipline for artist visibility and self-communication.

## First concert — BOMfestival 2026

- **Date:** Saturday 16 May 2026
- **Venue:** Kapsalon Rozie, Ghent (hair salon, intimate neighborhood festival)
- **Format:** 4 sets at 17:15 / 18:30 / 19:45 / 21:00 — fresh audience each time
- **Setlist:** 9 songs, ~25 min music / ~33 min with intros. Libertad → Soy una puerta → Duelo → Hasta calmar el alma → Luz y sal → No te voy a odiar → Paso → Pimiento → Tragedia de cerdo asado
- **Venue rehearsal:** Friday 9 May 2026
