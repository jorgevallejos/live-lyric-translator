# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **⚠️ In-flight (2026-06-23) — read before touching media/schema.** The D-wire projector test triaged 6 changes now being implemented (TDD prompts in `docs/d-wire-triage-and-prompts.md`). Direction, decided with Jorge: **one video per song** — `media` collapses from `{ big?, small? }` to a single `MediaFile` (schema **v5→v6**); **"Big"/"Small" becomes a projection display-format toggle** mapping to the `big-screen`/`small-canvas` display profiles, not a per-format file. Local video is served via a **`media://` custom protocol** (registered in `main.cjs`), not `file://` — the `http://localhost` dev origin makes `webSecurity` block `file://`. Also: single-file camera picker (video glyph, green when linked), the always-on bottom DISPLAY row removed, non-video beat gains Start/Pause/Restart decoupled from Next, end-card button removed. Sections below describe pre-change state; update them as each prompt lands.

## What This App Does

Live Lyric Translator is a macOS Electron desktop app for live concert subtitle projection. A performer advances lyric lines in a **Control window**, while a synchronized **Projection window** displays translated lyrics to the audience. Songs are organized into setlists.

Lines can advance in two per-song **playback modes**: **Manual** (keyboard/foot pedal — always available and always wins on override) and **Video** (subtitles locked to a synchronized animation video via `video.currentTime`). The Projection window can render a clean animation full-frame and composite the subtitle band itself (display profiles), so a single clean video serves all languages and screens.

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

A **second cross-window channel** runs over `localStorage` storage events, used where each window owns a local resource rather than shared lyric state: the end-card toggle (`endCardState.ts`), and — in Video mode — the video **seek** and **transport** commands. Each window renders its **own `<video>` element**, so they can't share a media clock; instead the Control window broadcasts transport intent and the Projection window applies it to its element (see Playback modes). Commands carry a `nonce` so repeated same-value writes still fire.

### State Management (No Redux/Zustand)

State is split into pure-function modules with tests, each backed by `localStorage` or `sessionStorage`:

| Module | Storage | Responsibility |
|---|---|---|
| `setlistStore.ts` | localStorage | Song library, setlists, active setlist (**v5** schema: `title_translations`, `intro`, `tempo`, `media`, `timeline`; migrates v1→v2→v3→v4→v5 on load) |
| `songState.ts` | sessionStorage | Current song, lyric index, blank state, selected languages; defines `TimelineEntry` / `MediaFile` / `SongMedia` |
| `performanceState.ts` | sessionStorage | Performance lifecycle (setup → ready → armed → performing) |
| `performanceControlStateMachine.ts` | — | Computes `SETUP / READY_TO_ARM / ARMED` from prereqs |
| `navigationState.ts` | — | Pure index/blank transition logic |
| `concertSessionState.ts` | sessionStorage | Concert timer (elapsed, pause/resume/reset) |
| `playedSongsState.ts` | sessionStorage | Which songs have been played this session |
| `videoCueLookup.ts` | — | Pure half-open `[start, end)` cue lookup by time (Video mode) |
| `beatScheduler.ts` | — | Pure `getBeatPhase(tempo, elapsed)` for the count-in/metronome |
| `displayProfile.ts` | localStorage | Gig-level projection profiles; pure `computeProjectionLayout(profile, w, h)` → band + text geometry |
| `mediaPathStore.ts` | localStorage | Maps a song's logical `media.src` → an absolute path the user links once; format/size validation warnings. `absolutePathToMediaUrl` converts a path to a `media://local/...` URL served by the Electron custom protocol (not `file://` — blocked by webSecurity on the http://localhost dev origin). The `local` host is a fixed sentinel: an empty-host `media:///` URL is canonicalized by Chromium into `media://firstsegment/...`, absorbing and lowercasing the first path segment as the hostname. The main-process handler decodes `pathname` and serves via `net.fetch(pathToFileURL(...))` with forwarded headers so Range/seek requests work. |
| `endCardState.ts` | localStorage | End-of-concert card visibility, broadcast cross-window via storage events |

Pure logic is extracted into `*State.ts` / `*Lookup.ts` / `*Scheduler.ts` modules (no side effects, fully unit-tested). React hooks (`use*.ts`) wire them to components and own side effects: storage reads/writes, WebSocket broadcasts, Electron IPC. Timer-driven hooks include `useBeatClock` (count-in).

### Playback modes

Per song, selected from the song's data: **Manual** (default; no `media`) and **Video** (`media` with a video slot + `timeline`; projection plays the muted clean animation, subtitles bound to `video.currentTime + media.offset`, band composited via the active display profile). A manual arrow/pedal press always re-seizes control in Video mode.

**Video mode is two video elements, transport-synced — not a shared clock.** The audience output is `VideoProjectionRegion.tsx` in the Projection window: it derives subtitles from *its own* `video.currentTime` and renders the band. It mounts **paused at `trimStart`** and obeys `play` / `pause` / `seek` commands broadcast from the Control window's `VideoPerformancePanel.tsx` over the `localStorage` transport channel (`setVideoTransportCommand`). The performer panel runs the single-clock count-in and, at the count-in→video handoff (`beginFired`), broadcasts `play` so the audience video starts on the downbeat; Pause broadcasts `pause`; Restart broadcasts `seek(trimStart)` then `play` at the next handoff. The panel also keeps a local preview `<video>` for the performer. Because the two elements aren't continuously time-synced, drift is corrected by manual seek — not a periodic resync (a known trade-off). `screenSizeState.ts` + the WS `screenSize` message decide which slot (`big`/`small`) the Projection plays.

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

Songs are stored as JSON with multilingual lyrics indexed by language code. Each lyric entry is an array of lines. The setlist store schema is versioned (**v5**; v1→v2→v3→v4→v5 migration chain runs on load). Optional fields: `title_translations`, `intro`, `tempo { bpm, numerator, denominator, countInBars }`, `media { big?: MediaFile, small?: MediaFile }`, and `timeline` (per-item `{ start, end }` seconds, parallel to the full items array including section markers). Songs without these behave exactly as before. `media.*.src` is a logical filename only — the absolute path is resolved per-machine via `mediaPathStore` (see `docs/media-assets.md`).

### Hook stability gotcha (important)

`getLibrarySongById` returns a **fresh object on every call/render** (it's not memoized). So `currentLibrarySong` and anything derived from it (`tempo`, `media`, `timeline`) are **new references each render**. Any `useEffect`/`useMemo` that depends on one of these *by object identity* will re-run every render — which already caused an infinite render loop in `useBeatClock` (effect → `setState` → re-render → new object → effect again, exploding memory). 

Rule: timer/effect hooks must key on **primitive values** (e.g. `tempo.bpm`, `currentSongId`), not the song object. Store the object itself in a `ref` updated each render if you need it inside a callback. `useBeatClock` follows this pattern. A future refactor could memoize `getLibrarySongById`, but until then, never depend on `currentLibrarySong` identity.

### Storage-event / persisted-flag gotcha (important)

Browsers only fire a cross-window `storage` event when a `localStorage` key's value **actually changes** — writing the same value twice is a no-op with no event. This matters because several keys pair a `sessionStorage`-backed flag (fresh every launch) with a `localStorage`-backed broadcast companion (persists across launches): `setArmedInStorage` in `performanceState.ts` is the canonical example (`KEY_ARMED` in sessionStorage, `KEY_ARMED_BROADCAST` in localStorage). If a previous session left the broadcast key already holding its "true" value and the write uses a **constant**, the *first* write of a new session is a same-value no-op — no event fires, and any consumer that only reacts to that event (rather than reading current state at mount) gets stuck. This bit the Projection window's logo-reveal on 2026-07-02 (audience view stuck on the logo on the first arm of a session; unarm/re-arm worked around it).

Rule: any broadcast write whose consumer needs to detect a **transition** (not just "what's the current value") — arm, video seek/transport, auto-blackout — must write a changing nonce (e.g. `` `${Date.now()}-${counter}` `` or `{ ..., nonce: Date.now() }`), never a constant, so the event is guaranteed to fire regardless of prior state. The consumer should treat *any* value as the signal, not match a literal. Broadcasts whose consumer reads the current value directly at mount (`useState(getBroadcastX)`) — screenSize, displayMode, endCard — don't need this, since a suppressed no-op event is harmless (the mount-time read is already correct).

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
