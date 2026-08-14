# Project Context — Live Lyric Translator

Project-specific Cowork context. Read this **after** `~/Chango Pepper/personal-context.md` (and any relevant `~/Chango Pepper/disciplines/<topic>.md`). Acknowledge briefly ("Context loaded. Ready.") and wait for the user to describe what's on their plate. At the end of the session, propose updates if anything important changed.

The engineering counterpart for Claude Code lives in `CLAUDE.md` at the repo root (`~/Chango Pepper/projects/pregonero/CLAUDE.md`). That file and this one are the two persistent memories for this project.

---

## What this project is

- **Live Lyric Translator** — macOS Electron app for live concert subtitle projection.
- Part of the live setup for the artist **Chango Pepper** (Latin American roots / Spanish lyrics, performed for international audiences).
- Solo build; used as a real testbed for AI-assisted PM techniques.

## How it works (at a glance)

- Two-window architecture: **Control** (performer) + **Projection** (audience), synchronized via WebSocket on `ws://localhost:8765`.
- **Two per-song playback modes** (as of June 2026): **Manual** (keyboard arrows / Bluetooth pedal — always the fallback) and **Video** (subtitles locked to a synchronized animation video via `video.currentTime`). Manual override always wins. (Timed mode and record-by-tapping were removed in the June 2026 video & tempo rework — timelines are now authored offline in the JSON.)
- Each song can link a **big-screen and a small-screen** video; the size is picked at arming time (Projection column) and broadcast to the Projection window. Projection can also play a clean full-frame animation and composite the subtitle band itself (**display profiles**). Plus a performer **count-in/beat indicator** (`BeatCircle`, driven by `getBeatPhase`, with compound-meter grouping), translatable **titles/intros**, and an **end-card** screen.
- Multilingual JSON songs (**v5 schema**: `title_translations`, `intro`, `tempo {bpm, numerator, denominator, countInBars}`, `media {big?, small?}`, `timeline`), setlists, and a performance state machine: `SETUP → READY_TO_ARM → ARMED → PERFORMING`.
- Live hardware: Mac mini + projector + iPad via Sidecar + Bluetooth pedal.

## Tech stack

- Electron 41, Vite 8, React 18, TypeScript 5.6 strict.
- Vitest 4 for tests, @dnd-kit for drag-and-drop, `ws` for the websocket bridge.
- Core architectural pattern: pure-function state modules + React hooks, with strict TDD (Red → Green → Refactor).

## Links

- Repo: https://github.com/jorgevallejos/live-lyric-translator
- Artist site: https://sites.google.com/view/changopepper/home

## Project-specific model picks

**Build state (June 2026):** the video-sync / auto-advance feature set was built and merged, then reworked. The **video & tempo rework** (spec: `docs/video-and-tempo-rework-prompt.md`, branch `feat/remove-timed-mode`) is complete across all 8 slices: tempo split into `numerator`/`denominator` with compound-meter beat grouping (§1), per-song big/small `media` slots (§2), Timed mode + record-by-tapping removed (§8), camera-icon link dialog in Manage Setlists (§3), Big/Small selector in the Projection column with WS broadcast (§4), shared `BeatCircle` indicator (§7), and simplified video + non-video performance screens with a single-clock count-in→video handoff (§5/§6). Schema is now **v5**. All merged to `main` (rework PR #18; squash). A follow-up **video transport-sync fix** (PR #20, merged) closed a gap the rework left: the Projection video used to auto-play at arm time and ignore the count-in. Now both windows hold their own `<video>` and the Projection obeys `play`/`pause`/`seek` broadcast from the performer panel over a `localStorage` transport channel, so the audience video starts on the count-in downbeat (architecture noted in `CLAUDE.md`). Full suite green (656 tests *as of June 2026* — see the current baseline above, do not quote this figure as current). Remaining build docs: `docs/code-execution-plan.md`, `docs/media-assets.md`, `docs/subtitle-format.md`. **D-wire test run (2026-06-23):** first end-to-end projector test surfaced 10 observations; triaged in `docs/d-wire-triage-and-prompts.md` (9 real code bugs, none tuning; #10 beat-viz deferred). Critical bug: linked video doesn't show in either window because the renderer runs on an `http://localhost` dev origin while `<video>` uses a `file://` URL — Electron `webSecurity` blocks it and no custom protocol is registered. Fix = a `media://` protocol in `main.cjs`. The doc holds 6 paste-ready TDD prompts (Prompt 1 unblocks the rest). **Model decision (2026-06-23): one video per song; "Big"/"Small" is a projection display-format toggle mapping to the `big-screen`/`small-canvas` display profiles, NOT a per-format file.** This reverses the §2 per-song big/small *file* slots (schema goes v5→v6, `media` becomes a single `MediaFile`) but keeps the display-profile machinery. Camera icon → single file picker, video-camera glyph, green when linked; the always-on bottom DISPLAY row is removed; the non-video beat view gains Start/Pause/Restart decoupled from Next; the end-card button is removed. Code is executing the prompts. **Then:** re-test on projector, tune `offset`/`trimStart` in the song JSON, then packaging (the installable-app goal). **Known tech debt:** ~7 `tsc` errors remain in test-file mock typings (non-blocking — vitest doesn't type-check). **Deferred:** offline forced alignment (Prompt B) until the produced master exists; the live-ASR following spike is shelved.

General model rule lives in `personal-context.md`. Picks specific to this project's upcoming workstreams:

- Creating custom Claude agents for this app → **Sonnet** (iterative prompt-craft).
- Product-flow model of the app to map frictions and opportunities → **Opus** for the initial framing, then **Sonnet** to populate and maintain.
- ~~Local-AI feature for auto-advancing lyrics without the pedal~~ → **DONE** as Video mode (Timed mode was later removed; the live-ASR-following variant is shelved until the produced master; see plan).
- AI-generated UX/UI + design-system exploration → **Sonnet** by default; **Opus** only when deriving a coherent design system from the existing app.
- Generative animation app reacting to live-performance events (audio, place, weather, unexpected pauses) → **Opus** for conceptual and architectural kickoff; **Sonnet** for build-out. (Likely becomes its own project under `~/Chango Pepper/projects/` when it starts.)
- Add chords to lyrics and a possibility to turn them of/on (still open)
- **Packaging** — local macOS `.dmg` **done (P1, PR #48)**; distributable signed+notarized build (**P2**) and Windows remain future. See "Current build state (2026-07-02)".
- Explore making the app available on iPad as a native experience — not just using the iPad as a second screen via Sidecar (still open).

## Project-specific workflow notes

- The `/release` slash command for this repo lives at `.claude/commands/release.md` and codifies the full release flow (tests → lint → build → commit → push → PR via `gh`) with three human checkpoints: branch confirmation, commit message approval, push confirmation. Generic release principles are in `personal-context.md`.
- `.claude/settings.json` in this repo pre-approves the standard release commands for this project and denies destructive ones (matches the universal policy in `personal-context.md`).
- GitHub MCP is not currently available in Cowork's connector registry; may be addable in Claude Code later.

## Timeline v2 — P1–P4 landed (2026-08-14)

Branch `feat/timeline-v2`. The shared contract with Bombista (the timeline extractor) is
`docs/timeline-v2-contract.md` — an identical copy lives in `projects/bombista/docs/`.
**That file is authoritative for the interchange shape; read it before touching timeline code.**

A timeline is no longer absolute against an audio file. It is **relative to a start cue**: line 0
always starts at `0.000`, and the seconds before the first sung word are banked in a separate
`leadIn` block. What provides the cue differs by mode — the video for an animation song, Jorge's
first pedal press for everything else — but the file is identical either way.

What shipped:

- **P3** — both load paths (`songState.ts::parseSongRecordFromUnknown`, `setlistStore.ts::parseTimelineFromJsonText`) reject any timeline without `timelineVersion: 2`, never coercing. A file declaring v2 but carrying no timeline is rejected as incomplete rather than loaded as a no-op. Unknown top-level keys are **deliberately ignored, never rejected** — a forward-compatibility guarantee pinned by regression tests so it does not get "tightened" later.
- **P4** — lyrics arrays carry sung lines only; section markers are rejected at the load boundary, naming the index.
- **P2** — `leadIn` applied in Video mode, as one tested pure function: `songTime = video.currentTime + offset − (leadIn.apply ? durationSec : 0)`. `media.trimStart` is deliberately excluded (already reflected in `currentTime`; including it would shift twice). Losslessness proven as a property against the golden fixture within 0.005.
- **P1** — start-on-cue for Auto mode. Armed + Auto + v2 timeline + no video means no Play button and no count-in; the first pedal press shows line 0 and starts the clock at `0.000`; lines then advance alone. Pause/Restart appear only once cued; manual Next/Prev stay live throughout; the audience keeps the title/intro card until the cue. **Gate 4 passed — Jorge tested Libertad with the pedal on 2026-08-14.**

Persisted schema went **v6 → v7** (`LibrarySong` gained `timelineVersion`/`leadIn`). The migration
keeps legacy timelines exactly as they were and never invents a version — a song becomes v2 only
by passing through the guarded load path.

**Known behaviour change outside P1's scope, deliberately kept:** the beat clock's tick effect used
to refuse to run without a BPM, so a song with a timeline but no tempo froze at 0 and never
advanced. Fixed — but that also means a *legacy* tempo-less Auto song now advances on Play where it
previously did nothing. A latent bug fixed, not a regression, but it is a real change. See P8.

### Follow-ups P5–P8 — recorded 2026-08-14, NOT implemented

Derived from what the P1–P4 round surfaced. None are started; none block the merge.

- **P5 — finish removing section markers.** P4 tightened only the file-load/import boundary. The `SectionMarker` type, `isSection`, the section rendering paths, and `tryParsePersistedSongItemsArray` (which still accepts sections) are all untouched. Tightening the *persisted* path was refused on purpose: a rejection there fails the whole snapshot load and would wipe the local library. Do this as a deliberate deletion with the store path handled last. **Deletes code.**
- **P6 — close the v1-timeline grandfathering gap.** Only the load paths are guarded. Timelines already sitting in localStorage from earlier imports keep their v1 (absolute) values and still drive playback, so a v1 timeline can currently *play* even though it can no longer be *loaded*. Least-destructive choice at the time, and it self-closes once both songs are re-imported post-B13 — but until then the gap is real. Options: ignore non-v2 stored timelines at playback with a visible "re-import needed" state, or drop them on migration.
- **P7 — resolve `ControlView.test.tsx` "2g. Lyrics display".** Known-red on purpose, with the reasoning in a comment above the test. It asserts the Lyrics-display value area renders nothing when no language is set, but `getEffectiveProjectionLanguage` has always defaulted to `'en'` when the song offers it, so the span correctly reads "EN". That default has its own passing unit test. **This is a product decision, not a test edit:** either the `'en'` default is right and 2g should assert "EN", or the test should use lines with no `en` key to genuinely exercise the no-language case.
- **P8 — decide what legacy tempo-less Auto should do.** Per the note above, such songs now advance on Play against their legacy absolute timings. Probably fine and probably wanted, but it was never an explicit decision. Resolving P6 may make it moot.

Done 2026-08-14: the four stale worktrees under the old `live-lyric-translator-dev` path were
pruned and their leftover directories removed, along with the four branches they held.

## Current build state (2026-08-11)

The **2026-07-04 projector-test fixes are all merged to `main`** (round complete):
- **#52** — Projection resyncs display-mode broadcast to Control's effective value (A1 area).
- **#53** — non-video Projection label drops the stale size; Transitions toggle shown for tempo-only songs (C1/C2).
- **#54** — performer sees the big centered singing-language lyric superimposed over the video, transport bar kept reachable (A2/B1/B2).
- **#55** — toggle labels no longer clip in the non-video Projection column (D1).

**Test baseline (verified 2026-08-13): 829 tests, of which 3 fail.** The often-quoted "656 tests green" figure below is a June 2026 snapshot and has been stale for months — it was carried forward into the timeline-v2 kickoff as if current, which is how a session can mistake pre-existing red for a regression it just caused. When quoting a suite size, re-measure it. The 3 known failures are `ControlView.test.tsx` "2g. Lyrics display…" and two `ProjectionView.test.tsx` "A2.3 — intro screen…" tests; they are being addressed in the timeline-v2 round because they sit in that work's blast radius.

**Untested live** — these need a projector re-test (Mac mini + iPad Sidecar + projector), focused on **Auto/tempo solo mode**. **Data gap for solo:** Auto mode needs a `tempo` block per song; as of 2026-08-11 only `luz-y-sal.json` (140, 3/4) and `tragedia-de-cerdo-asado.json` (128, 4/4) have one — the other 11 songs are Manual-only until authored. Tragedia's timeline still needs regen via the extractor before Video mode (known ~17 s late). See the older state below for full history.

## Current build state (2026-07-02)

The app is **feature-complete for performing** and now packages into a local installable. Everything through **PR #50** is merged to `main`. This section supersedes the older "Build state (June 2026)" narrative above; the round-by-round history lives in the dispatch docs listed at the end.

**What the app does now (performer/audience UX):**
- **Projection-column setup** has fixed-px, labelled toggle controls (no more window-rescaling icons): **Display format** (Small / Big / None), **Transitions** (Manual / Auto), and a **Beat indicator** on/off (filled/empty circle). Green = active. Four equal setup columns.
- **Manual mode:** after arm, the bottom-bar button is **Start** (Next/Prev disabled) → Start runs the count-in so the performer catches the tempo → button becomes **Restart**, Next/Prev enabled → first **Next** reveals line 1. (No Start step when beat is off / song has no tempo.)
- **Auto mode:** behaves like Video mode but driven by the beat clock — **Play / Pause / Restart** transport, Play runs the count-in with the audience black, and after `tempo.countInBars` the timeline drives cues into **both** performer and audience windows.
- **Beat↔Auto dependency:** beat OFF disables Auto and forces Manual (one-directional, with a hint).
- **Video big/small formats** now share one full-frame layout (single **3:2** frame; both Big and Small = full-frame `contain` + superimposed subtitle at the bottom; EB Garamond SemiBold). **The only per-format difference is subtitle font size** — Small keeps the larger font (`160/3168` of frame height). Non-video songs render centered. *(PR #50, 2026-07-02 — simplified from the old Small = 75.8% scaled + bottom-band geometry, which matched a now-superseded Premiere reference still. The Small font was carried over unvalidated for the overlay context; **needs a live projector eyeball** and may be re-tuned.)*

**Packaging — P1 DONE (PR #48):** `npm run pack` = `npm run build && electron-builder --mac`; mac targets `dmg` + `zip`; `build.files` = dist + electron + package.json; app icon from `assets/logo/`; unsigned (`identity: null`). Produces **`release/Live-Lyric-Translator-<version>.dmg`** (arm64), where `<version>` is `package.json`'s `version` field via `artifactName` — **0.9.0** as of 2026-08-14. (It sat at `0.1.0` from PR #48 until then, which made every build's filename identical and indistinguishable; the git tags had meanwhile reached `v0.8.4`. Bump `package.json` when cutting a build you need to tell apart from the last one.) Runs on Jorge's Macs via right-click → Open (Gatekeeper). Songs/animations stay on disk, resolved via the `media://` protocol (confirmed working packaged).

**Prompt 15 — CLOSED as obsolete.** Its two-row control layout was effectively built by the T1 toggle redesign; its "icons-only, no text labels" rule was **intentionally reversed** when Jorge asked for the tiny "Display format / Transitions / Beat indicator" labels. Nothing to do.

**PR #48 review fixes (2026-07-02):** re-testing behaviour after packaging P1 surfaced two topics, both fixed and merged.
- **Stuck-logo-on-first-arm (PR #49).** The audience Projection window stayed on the Chango Pepper logo on the *first* arm of a session (unarm/re-arm worked around it). Cause: `KEY_ARMED_BROADCAST` (localStorage, persists across launches) wrote the constant `'1'`, so a leftover `'1'` from a prior session made the first arm a same-value no-op — no cross-window `storage` event, logo never cleared. Fixed by writing a changing nonce on every arm; the consumer now treats any non-null value as "armed". Audit found the other broadcasts (screenSize, displayMode, endCard) not at risk (they read the current value at mount). Class of bug now documented as the **"storage-event / persisted-flag gotcha"** in repo `CLAUDE.md`.
- **Small format = full-frame + larger font (PR #50).** See the Video big/small formats bullet above.

**Only remaining item: Packaging P2 — sign + notarize** (distributable, no Gatekeeper warning). Gated on Jorge getting an **Apple Developer account** ($99/yr): Developer ID cert, hardened-runtime entitlements (allow `media://`), notarization via `notarytool`. Stub in `docs/t3-and-packaging-2026-07-01.md`; write a full dispatch when creds exist.

**Optional / deferred:** add a `tempo` block to `songs/libertad*.json` if Jorge wants a beat indicator on it (data only); chords on/off toggle (open idea); native iPad app beyond Sidecar (open idea). *(Offline forced alignment (Prompt B) and live-ASR following are both resolved by the 2026-07-03 spike — see next section.)*

**How this was built (way of working):** Opus-in-Cowork coordinates/specs; Claude Code on the Mac runs the builds as autonomous batches in **bypass permission mode**, auto-merging PRs on green with screenshots attached for async review. Dispatch docs (2026-07-01, for history): `wave2-kickoff`, `projection-format-fixes`, `performer-polish`, `auto-polish-and-manual-start`, `toggle-and-auto-transition`, `t3-and-packaging`.

## ASR-following spike — CLOSED NO-GO (2026-07-03)

Dispatched from Cowork (`docs/asr-following-spike-kickoff-2026-07-03.md`), run in Claude Code (Fable coordinator + Sonnet slices). Branch `spike/asr-following`, report `docs/asr-spike-report-2026-07.md` on that branch. Throwaway — never merged.

- **Verdict: NO-GO on live ASR driving the lyric pointer.** The *tracking* problem is solved — best candidate (faster-whisper small) advanced all 29 Tragedia lines in order through the accelerando, zero false jumps — but streaming latency kills it: median wall-clock lag **5.36 s** vs the ≤1.0 s rule (3.4% of lines within ±1.0 s vs ≥90% required). Core trade found: on local CPU today, recognizers fast enough for realtime are too inaccurate on sung Spanish over guitar; the accurate one runs at 0.60× realtime. Question closed; the **timeline/Auto (beat-clock) architecture stands validated**.
- **Side finding 1 — offline forced alignment is the win:** faster-whisper `medium` batch-aligned the whole song near-verbatim in 46 s. Adopted 2026-07-03 as **Bombista's core mechanism** (pivot recorded in that project) — ASR authors timelines; it doesn't drive the show.
- **Side finding 2 — real bug found:** the shipped `tragedia-de-cerdo-asado.json` `timeline` is a misaligned uniform 5.5 s scaffold, **~17 s late vs its linked video** (`media.offset` 0) and overrunning it by 18 s. Must be **regenerated (via the extractor) before this song is performed in Video mode**. Lesson for repo `CLAUDE.md`: timeline values are only meaningful relative to the linked video's own clock — generate them from that video's audio.
- **Housekeeping (pending, part B of the 2026-07-03 extractor dispatch):** push `spike/asr-following` to origin (preserve report + reusable scripts, no PR), commit the kickoff doc + the `CLAUDE.md` timeline-validity note to `main` via a docs PR, delete the stray `feat/timeline-import-button` branch.

## Open follow-ups / parked items

- **Timeline-import contract (Prompt 16 / A+ button) — JSON, locked 2026-06-24:** the standalone **Bombista** project produces the timeline this app imports. Interchange format is **JSON**: a `{ "timeline": [...] }` envelope deserializing straight into `TimelineEntry[]`, parallel-array contract preserved (one entry per song item, section markers as `start == end == 0`). **The A+ button parser must accept exactly this shape — not SRT.** SRT was rejected because it carries cue text (duplicating the song JSON's source-of-truth lyric order) and can't represent section markers. An optional `.srt` export may exist on the extractor side as a human-QA debug convenience only; it is never the canonical contract. Source of truth for the shape stays `src/songState.ts` (`TimelineEntry`, `videoCueLookup`); the extractor mirrors it in its `docs/output-contract.md`.
- ~~**D-wire**~~ — ✅ done (Tragedia linked, timeline authored, Video + count-in handoff validated on projector across the 2026-07-01 rounds).
- ~~**Packaging (local)**~~ — ✅ done as Packaging P1 (PR #48); see "Current build state (2026-07-02)". Only **P2 (sign + notarize)** remains.
- **`getLibrarySongById` refactor (tech debt):** it returns a fresh object every render, which caused a render-loop in G (fixed at the hook level). Memoizing it would remove the whole class of bug. Lesson captured in repo `CLAUDE.md` ("Hook stability gotcha").
- The engineering-conventions lesson from G/E was folded into `CLAUDE.md` (new modules table + the unstable-reference gotcha) — an example of the "update CLAUDE.md as conventions crystallize" follow-up below.

- When working on the product modelling/management discipline, revisit the ideas list in "Project-specific model picks" and properly categorize them: app extensions vs. standalone projects vs. cross-project concerns.


- Consider promoting `/release` to a full Claude Code sub-agent when the command gets complex enough to warrant its own memory and tool boundaries.
- Update `CLAUDE.md` as engineering conventions crystallize from actual work (naming rules, folder conventions, "do/don't" patterns).
- When a good real case comes up, walk me through updating `CLAUDE.md` by example.
- Revisit GitHub MCP installation in Claude Code once the basics feel routine.
- Explore Cowork's `schedule` skill if any recurring PM task emerges (e.g. "weekly backlog review from recent commits").

## Performing workstream (added April 2026)

A new performing discipline was opened alongside the app. Key structures created:

- `songs/` — private song library (JSON files, not in git). 11 songs as of April 2026. **Song intros live here as the single source of truth** — the `spoken-intro.md` in each concert folder is a generated performance copy, not independently maintained.
- `concerts/` — one folder per gig, with `_template/` for reuse. Each gig has `gig-info.md`, `checklist.md`, `setlist.md`, `spoken-intro.md`.
- `disciplines/performing.md` — growing knowledge base on performing and singing.
- `disciplines/communication.md` — new discipline for artist visibility and self-communication.

**Next performing session:** go through the BOM festival checklist (`concerts/2026-05-16-bom-festival/checklist.md`).

## First concert — BOMfestival 2026

- **Date:** Saturday 16 May 2026
- **Venue:** Kapsalon Rozie, Ghent (hair salon, intimate neighborhood festival)
- **Format:** 4 sets at 17:15 / 18:30 / 19:45 / 21:00 — fresh audience each time
- **Setlist:** 9 songs, ~25 min music / ~33 min with intros. Libertad → Soy una puerta → Duelo → Hasta calmar el alma → Luz y sal → No te voy a odiar → Paso → Pimiento → Tragedia de cerdo asado
- **Venue rehearsal:** Friday 9 May 2026
- **Open topic:** use this gig as a visibility/communication moment → see `disciplines/communication.md`
