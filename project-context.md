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
- Vitest 4 for tests, `ws` for the websocket bridge. **No drag-and-drop library**: @dnd-kit
  went with the manage-setlists screen on 2026-09-03, and the running order is reordered with ↑ ↓.
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
  replaced both the old end-card screen and the logo fallback. (That round also ended the gig in a
  prefilled debrief; **the debrief was removed on 2026-09-03** — see the section below.)
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
| The Bombista binary override | `localStorage`, key `pregoneroBombistaPath` | A per-machine fact, like the folders beside it. Normally unset. |

**The gigs are no longer on that table at all** (2026-09-03): there is nothing stored to name. The
gig list is `<gigs>/setup/` read on arrival — see the section below — and readiness was never stored
and still is not. Each row's delta is computed on read, and **until that lands a row shows no
verdict at all rather than a stale one.**

**What a row is CALLED is read live from `gig.json`** (Jorge, 2026-09-03) — the date and the venue,
through `src/gigLabels.ts`, never stored. The folder underneath it is an opaque id that never
changes, so **the row and the folder are allowed to disagree**; the ruling is in
`tramoya-integration/project-context.md`.

**Open: losing the gig list now loses the gigs from the app**, and it did not before. `Locate…` and
the gig-folder picker both went on 2026-09-03, and nothing lists `<gigs>/setup/` — so a machine
whose browser storage is cleared has every gig still on disk and no row for any of them. The obvious
answer is to read that folder rather than to bring a picker back, and it is not built. Noted here
rather than fixed, because it belongs with *noticing that a folder is gone*, which is owed anyway.

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
  the list is built rather than during. `src/gigLabels.ts` makes the same promise for the smaller
  read a row's name needs.

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

### Three-for-three in a week: two ways the app lied about itself (2026-08-31 → 09-01)

**Named because a rule that caught the first two would have let the third through**, and because
all three came from code that was correct, tested and green.

| | What it said | What was true | Class |
|---|---|---|---|
| Setup step 1 | states a requirement, both buttons disabled, points at a terminal | the requirement was real, the action was elsewhere | **dead end** |
| `New song`, no songs folder | swaps Create for a paragraph naming the fix | the paragraph was correct | **dead end** |
| Setup home, songs folder set | **"No songs yet"** | thirteen song files in that folder | **false answer** |

**Class one — a requirement stated with no action offered.** Every message was accurate. Each still
read as a wall, because a screen with no control on it gives no evidence the capability exists at
all. **The rule is `GatedAction.tsx`**: an action with an unmet precondition renders **disabled with
the reason attached**, never absent, with a counted list of the sites it governs. The cure for the
underlying cause is first run, which stops settings being discovered at the moment they block you;
the rule stays useful afterwards, because *nearly unreachable* is not *unreachable*.

**Class two — a confident answer that is false, and it is the worse one.** Nothing was disabled and
nothing was missing. The app answered the question and the answer was wrong, because it was
reporting on a hand-assembled list of individually chosen files while appearing to report on the
folder it had just been pointed at. **A dead end is visible the moment you hit it** and sends you
looking for what is blocked. **A false answer is invisible** — indistinguishable from the truth, and
catchable only by someone who already knows better. Jorge caught it because he knew how many songs
were in that folder.

**The rule is about where an answer comes from, not how it is worded.** When a screen answers a
question about the world — what songs exist, what gigs there are, whether a file is present — **the
answer must be derived from the thing it is about, at the moment it is asked.** `songs/` is the
source of truth and the library is a cache of it; the gig list stores paths and computes readiness
on read; a shape's content is looked up when it is drawn. **An app-held list standing in for the
world is the shape of this failure**, and no amount of better copy fixes it: *"No songs yet"* was a
perfectly clear sentence.

**Two questions for any new list before it ships.** *Can it disagree with the disk?* And *if it did,
would anything say so?* Yes and no is this failure waiting to happen.

**The corollary, ruled 2026-09-01: a control that silently undoes itself must not remain.** Once the
library is seeded from the folder, removing a song from it came back on the next hydration — so the
trash can went, along with the three store functions behind it, rather than being left looking
functional. **A row vanishing while the file is still in the folder is the app disagreeing with the
disk**, which is class two in a smaller costume. **Retiring a song means moving the file out of
`songs/`.** Removing a song from a **setlist** is a different act and stays: gig-scoped, durable,
stored in the snapshot, contradicted by nothing on disk. The two sat one trash can apart on the same
screen.

### The debrief is removed — Moment 13 is outside the tools (2026-09-03)

**Ruling: `journey-performance.md`, "Moment 13 is outside the tools".** Teardown and the debrief are
outside the tools, no software in this suite serves that moment, and Jorge never asked for the
feature. It was built because the played log made it cheap, which is the wrong reason to add a
screen to an app used in front of an audience.

**Gone**: `src/debrief.ts`, `src/debriefState.ts`, `src/DebriefPanel.tsx` and their tests; the panel,
the reopen button and the prefill in `src/App.tsx`; `writeDebriefFile` through `src/platform.ts`,
`src/electronApi.d.ts`, `electron/preload.cjs`, `electron/main.cjs` and `electron/gigFolder.cjs`
(with `DEBRIEF_FILE_NAME` and its tests); the `.debrief-*` rules in `src/control.css`. **The chain
ran further than the brief listed** — `gigFolder.cjs` and its temp-folder test were not on it — which
is why the round searched rather than working from a list. `<gig>/debrief.md` is no longer written by
anything; a file already on disk is the author's and is left alone.

**What stayed, and why.** `isSetlistComplete` and the whole of `playedSongsState.ts` stayed:
the debrief was one of four consumers, not the only one. See the section below.

### `playedSongsState.ts` stays — the played log has four readers (2026-09-03)

**The round was briefed to delete it on the premise that its only job was feeding a debrief. The
premise is false, so the deletion was stopped rather than fixed forward.** The two writers are the
ones the brief named — the concert transition and the end-of-song Unarm — and the storage key
`liveLyricPlayedSongIds` is touched by nothing outside this module. The **readers** are what
disproved it:

| Reader | What it does | Debrief? |
|---|---|---|
| `isSetlistComplete` → `setlistDone` → `isContactLit` | Lights the contact panel on the wall when the setlist is done | No |
| `isSetlistComplete` → `setlistDone` → `nextSongForTile` | Stops offering a next song once the setlist is done | No |
| `getPlayedSongs()` in `SongsView` | Draws the played marker on each song in the setlist screen | No |
| `hasPlayedSong(id)` in `SongsView` | Stops pre-selecting the song just played | No |

Deleting the store would have taken the contact panel's condition and the setlist screen's played
markers with it — a subtraction that only works by adding their state back somewhere else, which is
the trip-wire this round was told to stop on.

### The gigs list is the folder (2026-09-03)

**Ruling: `tramoya-integration/project-context.md`, "The gigs list is the folder, like the songs
list".** The bookmark list in `localStorage` (`pregoneroGigList`) is gone, along with
`gigListStore.ts`, `rememberGigInList` and `forgetGig`. `<gigs>/setup/` is read on arrival, exactly
as `<songs>/song-performance/` is: `electron/gigsFolder.cjs` lists the directories, and
`src/gigFolderList.ts` decides which of them are gigs.

**Why it had to go, in one line: the list could disagree with the disk.** Cleared storage left every
folder in place and an empty GIGS column, so the gigs looked deleted and were not — which is the
class-two failure this repo already named on 2026-08-31, an app-held list standing in for the world.

**Three answers about a folder, and they are three different things.**

| On disk | On screen |
|---|---|
| No `gig.json` | **Nothing.** No row, no popup. It was never claimed to be a gig |
| A `gig.json` that will not parse | Announced **once** through the existing popup queue, and **never a row** — a row is a thing you can open |
| A `gig.json` that parses | One row, labelled from the file |

**Two consequences worth naming.**

- **Deleting a gig is one step now.** The bin trashes the folder and stops; `forgetGig` was the
  second half and there is no list left to take it out of.
- **Nothing invents a date.** `refreshGigReadiness` used to write an identity-only `gig.json`,
  dated today, into any open folder that had none — which is how a folder nobody had called a gig
  became one with an invented night. That write is gone and `createGigFile` no longer takes a date:
  the case it existed for cannot arise, and it is **not replaced by another guess**. Such a folder
  now lands in the state readiness already had a name for, *No gig.json in this folder yet*.

**`songUsage.ts` reads the folder too**, so the delete-song dialog and the gigs column cannot answer
differently about which gigs exist.

### Step 3 opens: Muralista's flow, in Pregonero's frame (2026-09-03)

**Ruling: `tramoya-integration/project-context.md`, "Step 9.3 — Muralista's flow, designed
2026-09-03".** Muralista's half is its `v1.8.0`; this is Pregonero's.

**The step is the tool, not a door to it.** Muralista is served on arrival and drawn in an
`<iframe>`, the way Bombista's three pages are drawn in the song flow. That is what makes the
design's own sentence true — *it is already running inside Pregonero's frame, so there is no
launching into another tool* — and it is why pressing **keep the default** over there does not open
a second window. `MuralistaDoor` stays: it is still the unhosted answer, and still what `GigView`
uses at `#/gig/steps`.

**`tool:serve` is `tool:open` without the window.** Same mounts, same relative `?gig=` parameter, no
`BrowserWindow`. **A frame is a smaller thing than a window, not a closer one**: no preload and no
Node reach it, nothing is read out of it, and Pregonero still learns the room afterwards by reading
`visuals.json`. The file is the only channel, which is the boundary the desk-tool cut drew.

**The step never asks for a folder**, and that is Pregonero's whole contribution. It made this gig's
`setup/` and knows where it is, so it serves that folder. **A question with one knowable answer is
not a question** — and this one's failure is silent: one level too high and `visuals.json` lands
where nothing looks.

**`BUILT` moved from 2 to 3**, so step 3 is a button that dims until the gig is on disk, the same
rule step 2 has and for the same reason: there is no folder to hand over until step 1 is committed.
Step 4 is still a later step and still not a control.

#### The write path widened from one file name to two

**The rule was *exactly one*, and it is now a closed list.** Muralista's `v1.8.0` saves a **stage
capture** — a photograph of the stage through the calibrated camera — beside the gig's two JSON
files, so `stage.png` is a second name.

**The rationale did not move, and that is the test of the change.** Every condition in
`localhostServer.cjs` is about *where* the bytes go and none is about what is in them, so a closed
list the host declared is the same guarantee at one entry or two. The bytes are still written
verbatim and unread, so rule 1 survives exactly as it did. **A wildcard would not be** — that is a
writable folder, a different thing with a different blast radius, and it is refused as firmly as it
was when the list had one name on it.

**The gig folder stops being text**, and it is named rather than hidden: `setup/<id>/` held two JSON
files and now holds an image beside them. Machine territory, so no boundary moves.

#### The vendored page gained a fifth file, and the whole-list assertion is what caught it

`mapper.js` imports `stageCapture.js` the way it imports `warp.js`, so **a page served without it
throws on load with the other four hashes all green**. `muralistaPage.test.ts` asserts the file list
*whole* rather than only hashing what is in it, which is what turns that into a red test instead of
a blank window at a projector. The assertion was written for a hypothetical fifth file; the fifth
file arrived.

### Muralista re-vendored at `v1.9.0` — the handed-in file wins (2026-09-03)

**A vendoring bump, and nothing on this side changed.** Muralista's `v1.9.0` makes a handed-in
`visuals.json` the winner: in a gig context its local store is never consulted, and editing inside a
gig writes to the gig folder only. **That is entirely Muralista's rule about Muralista's own
storage** — Pregonero neither knew about that store nor could have.

**What it does for this repo is close a hole in the round trip.** Pregonero serves a gig's folder
and takes the one `PUT` back; before `v1.9.0` nothing read that file again, so a gig mapped on one
machine opened blank on another. **The file is still the only channel and it is still read by
Pregonero the way it always was.**

**It refuses a `visuals.json` whose `gigId` is not the connected gig's** — the same refusal
`parseVisualsFile` already makes here, on the same field. The two tools now agree about a mapping of
a different room, rather than one of them catching it.

### The display-size chain is removed (2026-09-03)

**Ruling: Jorge, 2026-09-03, on Code's own sweep.** `ScreenSize` was dead **end to end**, and every
link was traced before anything was touched:

- `effectiveScreenSize` reached `getProjectionStatusText` at two call sites, both passing
  `isVideoMode ? effectiveScreenSize : null`. For a video song the `displayMode` branch was taken
  first; for a non-video song it was handed `null`. **It never affected the text.**
- Its only other consumer was `setActiveProfileId`, and **nothing read the profile back**:
  `getActiveProfile` and `computeProjectionLayout` had no callers outside their own tests, and
  `setCustomProfile` had none at all.
- `sendScreenSize` put a `screenSize` message on the WebSocket and `main.cjs` relayed it.
  **`useWebSocket`'s `onmessage` handles `state` and `command` and nothing else**, so every receiver
  dropped it.
- The Projection window subscribed to the broadcast as `const [, setProjectionScreenSize]` — **the
  value discarded in its own destructure.**

**Gone**: `displayProfile.ts`, `displayProfileStore.ts` and their tests; `ScreenSize`, its two
storage keys, its broadcast, its defaults and its reader out of `screenSizeState.ts`;
`sendScreenSize` and `ScreenSizeMessage`; the main-process relay branch; the discarded subscription;
and the state and effect in `App.tsx` that fed them.

**The Projection window stopped rendering from a profile when the quad became the framing.** This is
the machinery that was left standing behind that change. **A knob nobody has ever moved is a decision
pretending to be a question**, and this one could not be moved at all.

**`DisplayMode` is a different thing and is NOT in scope.** It is also going — format and placement
are Muralista's, and whether the video runs tonight is the drive mode — but that waits on the
drive-mode design and on a walk. `getProjectionStatusText` lost its middle argument and keeps the
`DisplayMode` one.

**A key left over from before the removal reaches nothing**, and that is asserted rather than
assumed: `liveLyricScreenSize` is on real machines, so the C2 tests still seed it and still expect
`Open`.

### The gig column says which night (2026-09-03)

**Ruling: Jorge, 2026-09-03.** The one column that answers *which gig is this* rendered
`gigReadiness.gigId` — and since 03/09 that is an **opaque ten-character id**, so the stage read
`k3f9x2abcd`. **Backstage was fixed for exactly this the same day**, with `gigLabels.ts`, and the
control view was missed.

**One owner: `gigFile.gigLabelFrom`.** Both screens go through it, because a second rendering of
*what a gig is called* is how the row and the stage start disagreeing — which is the defect the
label rule was written for in the first place.

**`No gig` from nothing**, read off `gate === 'off'` rather than off an empty string: with no folder
open there is no date, no venue and no folder to fall back to.

### STOPPED: arming errors as popups (2026-09-03)

**Not built, and the reason is a question the vault does not answer.** The instruction is flat —
`control-arm-blocked` and `control-arm-warning` come out of the Arm column and become popups,
because *the surface changes because the reading distance changes*. **What raises the popup is
stated nowhere**, and the two candidates behave differently on a stage:

- **Press the dead Arm and it tells you why.** This is what the failure being fixed points at — you
  reach for Arm, nothing happens, and you need to know why. **But it makes Arm pressable while
  blocked**, and the same section says *Arm stays exactly as it is*.
- **The popup arrives when the blocked state does**, like Backstage's announcement queue. **This
  leaves Arm untouched** and has a precedent in this repo, but it is a modal appearing unbidden on
  the screen Jorge is looking at during a gig, and *once per what* is undefined — per song, per
  arrival, per launch.

**The removal and the trigger are one change and cannot be half-done.** Taking the inline band out
without a working trigger leaves a disabled Arm with its reason nowhere — which is the dead-end
class `GatedAction` exists to prevent, and strictly worse than today.

### The check's gate, and `gigReadiness` widened (2026-09-03)

**Ruling: `tramoya-integration/project-context.md`, under 9.4's leaving action.** `v0.47.0` shipped
this disagreement reported rather than reconciled; this is the reconciliation.

#### A song whose file will not read is a note at step 2 and a failure at step 4

**The principle, and it is the whole of it: a problem you can still route around while composing
becomes a blocker at the moment you assert readiness.**

At step 2 such a song **cannot be repaired from inside the flow** — Bombista cannot take a file it
will not parse — so blocking there would make a guided path nobody can finish, and `libertad` is the
standing example. At step 4 you are asserting the gig is ready, and a song changed outside the app is
not. **Same fact, two moments, two treatments.** Step 2's note is untouched.

**Read off `fileResolves`, never off a message.** Step 9's blocking trap was a predicate matching a
substring against rendered prose, so `libertad`'s own wording blocked while never being mentioned.

#### Every designed check is its own structured field

| Field | The check it answers |
|---|---|
| `songs[].fileResolves` | *Every song in the setlist resolves to a file* |
| `songs[].contentResolves` | *Every file those name resolves* |
| `visualsRefusal` | *The visuals belong to this gig*, told apart from a bad version and a bad parse |
| `canConfirm` | Whether setup may be confirmed right now |

**`contentMissingFor` returns both halves from one computation**, so `contentResolves` can never
disagree with the sentences beside it. Only the *file* failures set it false: a song with no lyric
lines and a song with no timeline name nothing that failed to resolve, and a song whose own file did
not read never got as far as naming anything.

**`parseVisualsFile` throws a typed `VisualsRefused`** carrying `unparseable`, `unknown-version` or
`other-gig`; a folder read that failed before the parse is `unreadable`, so callers have one
vocabulary. **Naming no gig is `other-gig`, not `unparseable`** — the shape of the file is fine and
the answer to *does this belong to this gig* is still no.

**`canConfirm` is a field rather than something the screen adds up.** `steps[4].status` cannot answer
it: `not-yet` there covers both *the checks fail* and *this has simply never been confirmed*, and the
second is the ordinary state in which you press the button. A screen summing steps 1 to 3 plus the
unreadable songs would be **a second opinion about what ready means**, which is the one thing
`gigReadiness` forbids.

#### The check screen draws seven lines now, and each names a field

`The gig knows what night it is` · `There is a setlist, and every song in it is one this machine
knows` · `Every song in the setlist resolves to a file` · `Every file those songs name resolves on
this machine` · `The room is mapped` · `The mapping belongs to this gig` · `Every song in the setlist
can be performed`.

**A line about a mapping that is not there says *not yet*, never *pass*.** Claiming the absent room
belongs to this gig is the class of false answer this repo named on 2026-08-31.

**Some lines block and some report, and the sentence under the button says which.** A red line beside
a live control is a screen lying by omission. The gate is `canConfirm`; **a file a song names not
resolving does not block** — the ruling widened the gate for the unreadable file and named nothing
else, and that song still cannot be armed, which is a gate on the night rather than on the gig.

### Step 4 opens: the check, and the setup journey's last screen (2026-09-03)

**Ruling: `tramoya-integration/journey-setup.md` step 9 ("4. Check") and `project-context.md`
("9.4's leaving action is settled").**

**Not a form.** One line per thing that has to be true, each passing or failing, then one action
that leaves. Nothing on it is typed.

#### It reads `gigReadiness`, and the reading is structured

Every line is bound to a **structured** field — a `StepStatus`, or `songs[].ready`. **No line is
derived from a message.** That is not fastidiousness: step 9's blocking trap was a predicate
matching the substring `"could not be read"` against rendered prose, so `libertad`'s own wording —
*"20 timeline entries, 24 lyric lines"* — blocked while never being mentioned. The `missing` and
`notes` strings are **shown** on this screen and never **read**.

| Line | Reads |
|---|---|
| The gig knows what night it is | `steps[1].status` |
| There is a setlist, and every song in it is one this machine knows | `steps[2].status` |
| The room is mapped, and the mapping is this gig's | `steps[3].status` |
| Every song in the setlist can be performed | `songs.every(s => s.ready)` |

An empty setlist is **not** a passing song line: `[].every()` answers true about nothing, which
would print PASS over a gig with no songs.

#### Where these lines and the designed three differ — reported, not reconciled

The design names three checks: *every song in the setlist resolves to a file*, *every file those
name resolves*, *the visuals belong to this gig*. **`gigReadiness` computes all three and exposes
none of them separably.**

- **The first two collapse into one line.** `songs[].ready` is the union of *its file read*, *its
  media resolves* and *a shape carries it*; the reasons live only in `songs[].missing` prose.
  Splitting them means reading prose, which is the trap above.
- **The third is `steps[3].status`**, which also covers an unknown `visualsVersion` and a file that
  will not parse. The refusal's own sentence names which it was, and the screen shows it.

**And they disagree about what blocks, which is the finding worth keeping.** A setlist song whose
file will not read is a **note** on step 2, deliberately — a step that can never complete while a
known-broken song sits in the library is a guided path nobody can walk, and `libertad` is the
standing example. The design's first line says that **fails**. **The gate on this screen is
readiness's, unchanged**: steps 1 to 3 complete. The song line reports and does not block, and the
note is rendered as a note rather than mixed in with what is in the way. **Widening `gigReadiness`
to reconcile the two was not done and is Jorge's to rule.**

#### The leaving action

**`Confirm setup`, and it lands on Backstage** (Jorge, 2026-09-03). It used to read `Confirm setup
and go to the control view`, wrong twice over: it named the stage as the destination and it
performed the act that was separated from confirming. **Choosing tonight's gig belongs to the gig
row's play icon and the control view's first column.**

**It leaves only if the confirmation was actually recorded.** A failed write keeps you on the
screen, in front of the problem; navigating away would report success by arriving somewhere.

**`Save to the gigs list` was proposed and rejected on truth.** `gig.json` is written at the end of
step 1, the setlist writes as it changes, and since the gigs list became the folder the gig has been
in that list since step 1. The button would save nothing and add something already there.

**A gig can be edited afterwards.** Returning to change a setlist is the normal case; nothing here
closes anything, and coming back re-checks the files.

#### Two consequences, named

- **`BUILT` is 4, so the bar's later-step branch is unreachable today.** It is kept rather than
  deleted: it carries Jorge's 03/09 ruling about how a step that has not arrived is drawn — dimmed
  and inert, never struck through — and that ruling outlives the moment there happens to be nothing
  after step 4. Held, like the six unreachable functions, rather than tidied away.
- **`GigView` at `#/gig/steps` still has the old screen and the old button**, reading `Confirm setup
  and go to the control view`. Nothing in the flow leads there; it was left alone because it is not
  on the walk and removing it is its own decision.

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
