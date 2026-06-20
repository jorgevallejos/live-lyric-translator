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
- **Three per-song playback modes** (as of June 2026): **Manual** (keyboard arrows / Bluetooth pedal — always the fallback), **Video** (subtitles locked to a synchronized animation video), **Timed** (auto-advance from a recorded timeline). Manual override always wins.
- Projection can play a clean full-frame animation and composite the subtitle band itself (**display profiles**), replacing per-language and per-screen video exports. Plus a performer **count-in/beat indicator**, **record-by-tapping** timeline capture, translatable **titles/intros**, and an **end-card** screen.
- Multilingual JSON songs (**v3 schema**: adds `title_translations`, `intro`, `tempo`, `media`, `timeline`), setlists, and a performance state machine: `SETUP → READY_TO_ARM → ARMED → PERFORMING`.
- Live hardware: Mac mini + projector + iPad via Sidecar + Bluetooth pedal.

## Tech stack

- Electron 33, Vite 5, React 18, TypeScript strict.
- Vitest 2 for tests, @dnd-kit for drag-and-drop, `ws` for the websocket bridge.
- Core architectural pattern: pure-function state modules + React hooks, with strict TDD (Red → Green → Refactor).

## Links

- Repo: https://github.com/jorgevallejos/live-lyric-translator
- Artist site: https://sites.google.com/view/changopepper/home

## Project-specific model picks

**Build state (June 2026):** the video-sync / auto-advance feature set is **built and merged** — schema v3 (timeline/media/tempo/intro/title_translations), record-by-tapping, display profiles, Video mode, end-card, count-in/metronome, and Timed mode. Full design rationale + per-prompt runsheet: `docs/code-execution-plan.md` (+ `docs/auto-advance-and-video-sync.md`, `docs/media-assets.md`, `docs/subtitle-format.md`). **Next:** D-wire (link Tragedia's mp4 + capture a timeline in-app to validate Video mode on the projector), then packaging (the installable-app goal). **Deferred:** offline forced alignment (Prompt B) until the produced master exists (late June); the live-ASR following spike is shelved.

General model rule lives in `personal-context.md`. Picks specific to this project's upcoming workstreams:

- Creating custom Claude agents for this app → **Sonnet** (iterative prompt-craft).
- Product-flow model of the app to map frictions and opportunities → **Opus** for the initial framing, then **Sonnet** to populate and maintain.
- ~~Local-AI feature for auto-advancing lyrics without the pedal~~ → **DONE** as Video + Timed modes (the live-ASR-following variant is shelved until the produced master; see plan).
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

- **D-wire (next):** link Tragedia's `media.mp4` in-app, capture a timeline via Record mode, validate Video mode on the projector. The `media` block is already in `songs/tragedia-de-cerdo-asado.json`. Steps in `docs/code-execution-plan.md` → "D-wire — in-app workflow".
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
