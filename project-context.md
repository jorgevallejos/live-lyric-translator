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
- Performer advances lyrics manually via keyboard arrows or a Bluetooth foot pedal.
- Multilingual JSON songs, setlists, and a performance state machine: `SETUP → READY_TO_ARM → ARMED → PERFORMING`.
- Live hardware: Mac mini + projector + iPad via Sidecar + Bluetooth pedal.

## Tech stack

- Electron 33, Vite 5, React 18, TypeScript strict.
- Vitest 2 for tests, @dnd-kit for drag-and-drop, `ws` for the websocket bridge.
- Core architectural pattern: pure-function state modules + React hooks, with strict TDD (Red → Green → Refactor).

## Links

- Repo: https://github.com/jorgevallejos/live-lyric-translator
- Artist site: https://sites.google.com/view/changopepper/home

## Project-specific model picks

General model rule lives in `personal-context.md`. Picks specific to this project's upcoming workstreams:

- Creating custom Claude agents for this app → **Sonnet** (iterative prompt-craft).
- Product-flow model of the app to map frictions and opportunities → **Opus** for the initial framing, then **Sonnet** to populate and maintain.
- Local-AI feature for auto-advancing lyrics without the pedal → **Opus** for architecture and trade-off design; **Sonnet** for implementation in Claude Code.
- AI-generated UX/UI + design-system exploration → **Sonnet** by default; **Opus** only when deriving a coherent design system from the existing app.
- Generative animation app reacting to live-performance events (audio, place, weather, unexpected pauses) → **Opus** for conceptual and architectural kickoff; **Sonnet** for build-out. (Likely becomes its own project under `~/Chango Pepper/projects/` when it starts.)

## Project-specific workflow notes

- The `/release` slash command for this repo lives at `.claude/commands/release.md` and codifies the full release flow (tests → lint → build → commit → push → PR via `gh`) with three human checkpoints: branch confirmation, commit message approval, push confirmation. Generic release principles are in `personal-context.md`.
- `.claude/settings.json` in this repo pre-approves the standard release commands for this project and denies destructive ones (matches the universal policy in `personal-context.md`).
- GitHub MCP is not currently available in Cowork's connector registry; may be addable in Claude Code later.

## Open follow-ups / parked items

- Consider promoting `/release` to a full Claude Code sub-agent when the command gets complex enough to warrant its own memory and tool boundaries.
- Update `CLAUDE.md` as engineering conventions crystallize from actual work (naming rules, folder conventions, "do/don't" patterns).
- When a good real case comes up, walk me through updating `CLAUDE.md` by example.
- Revisit GitHub MCP installation in Claude Code once the basics feel routine.
- Explore Cowork's `schedule` skill if any recurring PM task emerges (e.g. "weekly backlog review from recent commits").
