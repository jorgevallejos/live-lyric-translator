# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Does

Live Lyric Translator is a macOS Electron desktop app for live concert subtitle projection. A performer manually advances lyric lines (keyboard or foot pedal) in a **Control window**, while a synchronized **Projection window** displays translated lyrics to the audience. Songs are organized into setlists.

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

### State Management (No Redux/Zustand)

State is split into pure-function modules with tests, each backed by `localStorage` or `sessionStorage`:

| Module | Storage | Responsibility |
|---|---|---|
| `setlistStore.ts` | localStorage | Song library, setlists, active setlist (v2 schema, migrates from v1) |
| `songState.ts` | sessionStorage | Current song, lyric index, blank state, selected languages |
| `performanceState.ts` | sessionStorage | Performance lifecycle (setup → ready → armed → performing) |
| `performanceControlStateMachine.ts` | — | Computes `SETUP / READY_TO_ARM / ARMED` from prereqs |
| `navigationState.ts` | — | Pure index/blank transition logic |
| `concertSessionState.ts` | sessionStorage | Concert timer (elapsed, pause/resume/reset) |
| `playedSongsState.ts` | sessionStorage | Which songs have been played this session |

React hooks (`use*.ts` files) wire these modules to components. They own side effects: storage reads/writes, WebSocket broadcasts, Electron IPC calls.

### Performance State Machine

Prerequisites for arming: song selected + singing language + translation language + projection window open.

States: `SETUP` → `READY_TO_ARM` → `ARMED` → (performing when index ≥ 0 and armed).

### Electron Layer

- `electron/main.cjs`: Creates and manages both windows, coordinates the WebSocket server
- `electron/preload.cjs`: Context bridge exposing IPC methods to the renderer (`window.electronAPI`)
- `electron/closeProjectionWindow.cjs`: Safe projection window closure logic (has its own tests)

### Routing

Hash-based: `#/control`, `#/projection`, `#/songs`, `#/languages`, `#/setlists`, etc. `App.tsx` is the root component and orchestrates hooks + routing.

### Song Data Format

Songs are stored as JSON with multilingual lyrics indexed by language code. Each lyric entry is an array of lines. The setlist store schema is versioned (v1→v2 migration runs on load).

## Development Protocol (TDD)

This project follows strict **Red → Green → Refactor** for every change:

1. **Restate** the expected behavior in testable form.
2. **Write failing tests** (don't touch production code until tests fail for the right reason).
3. **Make the smallest implementation change** to turn tests green.
4. **Only then refactor** — must not change behavior.
5. **Commit only when tests are green.**

Prefer behavior tests over implementation-detail tests. Extract pure functions when logic is too coupled to test. Do not mix feature work, bug fixing, and refactoring in the same step.

## Tech Stack

- **Electron 33** + **Vite 5** + **React 18** + **TypeScript 5** (strict mode)
- **Vitest 2** + **React Testing Library** for tests (jsdom environment)
- **@dnd-kit** for drag-and-drop in setlist management
- **ws** for the WebSocket server
