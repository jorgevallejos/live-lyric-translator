# Project Context — Live Lyric Translator

Project-specific Cowork context. Read this **after** `~/Chango Pepper/personal-context.md` (and any relevant `~/Chango Pepper/disciplines/<topic>.md`). Acknowledge briefly ("Context loaded. Ready.") and wait for the user to describe what's on their plate. At the end of the session, propose updates if anything important changed.

The engineering counterpart for Claude Code lives in `CLAUDE.md` at the repo root (`~/Chango Pepper/projects/live-lyric-translator-dev/CLAUDE.md`). That file and this one are the two persistent memories for this project.

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

**Build state (June 2026):** the video-sync / auto-advance feature set was built and merged, then reworked. The **video & tempo rework** (spec: `docs/video-and-tempo-rework-prompt.md`, branch `feat/remove-timed-mode`) is complete across all 8 slices: tempo split into `numerator`/`denominator` with compound-meter beat grouping (§1), per-song big/small `media` slots (§2), Timed mode + record-by-tapping removed (§8), camera-icon link dialog in Manage Setlists (§3), Big/Small selector in the Projection column with WS broadcast (§4), shared `BeatCircle` indicator (§7), and simplified video + non-video performance screens with a single-clock count-in→video handoff (§5/§6). Schema is now **v5**. Full suite green (~600 tests). Remaining build docs: `docs/code-execution-plan.md`, `docs/media-assets.md`, `docs/subtitle-format.md`. **Next:** merge the PR, then D-wire (link Tragedia's big/small files via the camera dialog, author the timeline in JSON, validate Video mode + count-in handoff on the projector), then packaging (the installable-app goal). **Deferred:** offline forced alignment (Prompt B) until the produced master exists; the live-ASR following spike is shelved.

General model rule lives in `personal-context.md`. Picks specific to this project's upcoming workstreams:

- Creating custom Claude agents for this app → **Sonnet** (iterative prompt-craft).
- Product-flow model of the app to map frictions and opportunities → **Opus** for the initial framing, then **Sonnet** to populate and maintain.
- ~~Local-AI feature for auto-advancing lyrics without the pedal~~ → **DONE** as Video mode (Timed mode was later removed; the live-ASR-following variant is shelved until the produced master; see plan).
- AI-generated UX/UI + design-system exploration → **Sonnet** by default; **Opus** only when deriving a coherent design system from the existing app.
- Generative animation app reacting to live-performance events (audio, place, weather, unexpected pauses) → **Opus** for conceptual and architectural kickoff; **Sonnet** for build-out. (Likely becomes its own project under `~/Chango Pepper/projects/` when it starts.)
- Add chords to lyrics and a possibility to turn them of/on (still open)
- **Packaging** — downloadable, installable app (macOS first, Windows later). Currently a local dev project; `npm run pack` / electron-builder is wired but not yet exercised for distribution. **This is the planned next workstream after D-wire.**
- Explore making the app available on iPad as a native experience — not just using the iPad as a second screen via Sidecar (still open).

## Project-specific workflow notes

- The `/release` slash command for this repo lives at `.claude/commands/release.md` and codifies the full release flow (tests → lint → build → commit → push → PR via `gh`) with three human checkpoints: branch confirmation, commit message approval, push confirmation. Generic release principles are in `personal-context.md`.
- `.claude/settings.json` in this repo pre-approves the standard release commands for this project and denies destructive ones (matches the universal policy in `personal-context.md`).
- GitHub MCP is not currently available in Cowork's connector registry; may be addable in Claude Code later.

## Open follow-ups / parked items

- **D-wire (next, after PR merge):** link Tragedia's big/small files via the camera dialog in Manage Setlists, author the timeline in the song JSON (no more in-app Record mode), and validate Video mode + the count-in→video handoff on the projector. The `media` block is already in `songs/tragedia-de-cerdo-asado.json`. Steps in `docs/code-execution-plan.md` → "D-wire — in-app workflow".
- **Packaging (after D-wire):** exercise `npm run pack` to produce a real macOS `.dmg`/`.app`; the installable-app goal.
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
