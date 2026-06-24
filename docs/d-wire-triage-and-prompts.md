# D-wire test — triage & TDD Code prompts

_First end-to-end projector test of Video mode (2026-06-23), after merging the video & tempo rework (PR #18) and the transport-sync fix (PR #20). This file triages each observation as **code bug**, **timeline/offset tuning**, or **expected behavior**, then turns the real bugs into ready-to-paste Claude Code prompts (strict TDD: Red → Green → Refactor, atomic commits, `/release` per change)._

## Decision recorded — video/screen model

Issues 1, 3 and 6 contradicted each other on the video model. **Chosen model (2026-06-23): one video per song; "Big"/"Small" is a projection display-format toggle, not a per-format file.**

- One video file per song. The camera icon opens a single file picker.
- "Big" → `big-screen` display profile (cinema band/scale). "Small" → `small-canvas` profile.
- The Big/Small buttons live in the Projection column (above Open/Close) and appear only when the song has a video.
- The always-on bottom "DISPLAY" profile row is removed.
- Display profiles survive under the hood (they back the Big/Small toggle); they are no longer surfaced as their own button row.

This reverses the §2 per-song big/small **file** slots from the rework, but keeps the display-profile machinery.

## Triage table

| # | Observation | Verdict | Root cause / note |
|---|---|---|---|
| 1 | "Display size" buttons at bottom should be replaced by Big/Small above Open/Close, only if the song has video | **Code bug (UI)** | The bottom row is `DisplayProfileSetup` (always rendered, `App.tsx` line 724). Conditional Big/Small already exist in the Projection column but are gated on per-format file slots. → Prompt 4 |
| 2 | Prefer a video-camera icon over a photo-camera icon | **Code bug (cosmetic)** | `CameraIcon` in `ManageSetlistsView.tsx` draws a stills camera. → Prompt 3 |
| 3 | Only one video per song; camera should just open a file finder, no big/small section | **Code bug (design) — confirmed model** | Current `media: { big?, small? }` + two-slot `LinkVideoDialog`. Collapse to one video + single picker. → Prompts 2 & 3 |
| 4 | Camera icon should turn green when the song has a video | **Code bug (UI)** | No linked-state styling on the camera button. → Prompt 3 |
| 5 | Video doesn't show in performer **or** audience window | **Code bug (critical, architecture)** | Renderer loads over `http://localhost` (Vite dev); `<video>` src is a `file://` URL (`absolutePathToFileUrl`). Electron `webSecurity: true` blocks http→file://, and `main.cjs` registers no custom protocol. Both windows fail identically. The beat circle still renders because it is a sibling of `<video>`. → Prompt 1 |
| 6 | Big buttons "about video format" still shown for Luz y Sal | **Code bug (UI) — same as #1** | Same `DisplayProfileSetup` row, always rendered regardless of song. → Prompt 4 |
| 7 | No way to pause the beat indicator | **Code bug** — *non-video view only* | Video mode already has Pause (`VideoPerformancePanel`). The non-video performer view uses `useBeatClock` with no pause control. → Prompt 5 |
| 8 | "End card" button is useless | **Code bug (UI)** | Secondary bottom-bar button in `App.tsx` (lines 877-886). Remove the button (+ dead toggle). → Prompt 6 |
| 9 | Beat starts on arm; want a "Start" button (then "Restart"), decoupled from "Next" | **Code bug** — *non-video view only* | `useBeatClock` auto-starts on arm; `App.tsx` lines 549-557 auto-fire `handleNext` when count-in ends (couples beat-start to first-phrase reveal). Video mode already starts on Play. → Prompt 5 |
| 10 | The circle is not the best beat visualization | **Expected / deferred** | You're parking it. Design task, not a bug. No prompt. |
| 11 | Projection shows the video frame as soon as it's armed/open; should stay black until **Play** | **Code bug (UX)** — *surfaced after Prompt 1b* | `VideoProjectionRegion` mounts the `<video>` visible and seeks to `trimStart`, so the audience sees the first frame before performance starts. No "started" gate on the transport state. → Prompt 7 |
| 12 | Performer-view video is oversized and pushes the transport buttons off the bottom of the window | **Code bug (layout)** — *surfaced after Prompt 1b* | `.video-perf-video-wrap` / `.video-perf-preview` aren't height-constrained in the panel's flex column, so the video grows and `VideoPerfBottomBar` overflows out of view. → Prompt 8 |

**Nothing here is a timeline/offset tuning issue.** Tuning (`offset`, `trimStart`) only becomes testable once the video actually plays — i.e. after Prompt 1. Re-evaluate subtitle drift on the projector after the video renders; that's when offset tuning earns its place.

## Suggested execution order

1. **Prompt 1** (file:// → custom protocol) — unblocks the whole test; independent. **Shipped broken — must be followed by Prompt 1b** (fixes the empty-host canonicalization bug) before the video actually plays.
2. **Prompt 2** (single-video schema) → **Prompt 3** (single-file camera + icons) → **Prompt 4** (Projection Big/Small + remove DISPLAY row). 4 depends on 2's schema.
3. **Prompt 5** (non-video beat controls) and **Prompt 6** (remove end-card) — independent, any time.
4. **Prompt 7** (projection holds black until Play) and **Prompt 8** (fit performer video + restore button spacing) — video-display fixes surfaced once Prompt 1b made video render; independent, any time.
5. **Second projector test (2026-06-24)** — see the dedicated section below for the new round (Prompts 9–11, the timeline-authoring DATA task, and the #7/#8 follow-ups folded into Prompt 8).

---

## Prompt 1 — Serve local video via a custom protocol so it actually plays

> ⚠️ **Shipped with a bug (commit `4c090e4`).** This prompt's URL examples used an empty-host form (`media:///Users/...`). At runtime Chromium canonicalizes that to `media://users/...`, absorbing and lowercasing the first path segment (`Users`) as the hostname — so the handler decodes `/jorgevallejos/...` (missing `/Users`) and `net.fetch` fails with `net::ERR_UNEXPECTED`. The pure-helper unit test passed because it never exercised the renderer→handler round trip. **Use Prompt 1b below to fix it.**

**Branch:** `fix/media-protocol-video-playback`

The performer and projection windows both fail to display linked videos. The renderer runs on an `http://localhost` origin in dev (and `file://` from `loadFile` in prod), but `<video>` uses a `file://` URL built by `absolutePathToFileUrl`. Electron's default `webSecurity: true` blocks loading `file://` resources from an http page, and `electron/main.cjs` registers no custom scheme. Fix it with a privileged `media://` scheme that streams the chosen local file, used uniformly in dev and prod.

TDD, strict Red → Green → Refactor:

1. **Red** — In `src/mediaPathStore.test.ts`, add tests for a new pure helper `absolutePathToMediaUrl(absolutePath: string): string` that returns a `media://` URL with each path segment percent-encoded (preserving slashes). Cover: a plain path, a path with spaces, and a path with non-ASCII characters. Example: `/Users/jorge/My Videos/cerdo asado.mp4` → `media:///Users/jorge/My%20Videos/cerdo%20asado.mp4`. Run; confirm it fails.
2. **Green** — Implement `absolutePathToMediaUrl` in `src/mediaPathStore.ts` (mirror the encoding style of the existing `absolutePathToFileUrl`, but with the `media://` scheme and a leading `/` so the host is empty and the full absolute path is the URL path). In `electron/main.cjs`: before `app.whenReady`, call `protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }])`; after ready, register a handler with `protocol.handle('media', (request) => { ... })` that maps the request URL back to the absolute file path (decode the path, strip the scheme) and returns the file via `net.fetch('file://' + ...)` or a streamed `Response` from `fs`. Support HTTP range requests so seeking works. Switch the two consumers — `src/VideoProjectionRegion.tsx` and `src/VideoPerformancePanel.tsx` — from `absolutePathToFileUrl` to `absolutePathToMediaUrl`.
3. **Refactor** — Keep `absolutePathToFileUrl` only if something still uses it; otherwise remove it and its tests. Note in `CLAUDE.md` (architecture section) that local media is served via the `media://` scheme, not `file://`.

The protocol handler runs in the Electron main process and isn't covered by Vitest (jsdom) — that's expected; the unit test covers the URL helper. **Manual verification (required):** run the app, arm Tragedia de Cerdo Asado, hit Play, and confirm the video plays in both the performer and projection windows and that Restart/seek still work.

**Commit:** `fix(video): serve local media via media:// protocol so linked video plays`

---

## Prompt 1b — Fix the media:// host so the absolute path survives

**Branch:** `fix/media-protocol-host`

The `media://` protocol from Prompt 1 is broken at runtime: `absolutePathToMediaUrl` emits an empty-host URL (`media:///Users/...`), which Chromium canonicalizes to `media://users/...`, absorbing the first path segment as the host and lowercasing it. The main-process handler then reconstructs the wrong filesystem path and `net.fetch` fails with `ERR_UNEXPECTED`. Fix by using a fixed host segment so the absolute path is preserved, and harden the handler. Strict TDD, Red → Green → Refactor:

1. **Red** — Update `src/mediaPathStore.test.ts` for `absolutePathToMediaUrl` to expect a fixed `local` host before the absolute path, with each path segment percent-encoded and slashes preserved. Examples: `/Users/jorge/cerdo.mp4` → `media://local/Users/jorge/cerdo.mp4`; `/Users/jorge/My Videos/cerdo asado.mp4` → `media://local/Users/jorge/My%20Videos/cerdo%20asado.mp4`; cover a non-ASCII segment too. Run; confirm it fails against the current empty-host output.
2. **Green** — In `src/mediaPathStore.ts`, change `absolutePathToMediaUrl` to return `` `media://local${encodedPath}` `` where `encodedPath` is the absolute path with each segment after the leading slash run through `encodeURIComponent` (leading slash preserved). In `electron/main.cjs`, the handler must (a) read `decodeURIComponent(new URL(request.url).pathname)` to recover the absolute path — which now correctly retains `/Users/...` because the host is `local` — and (b) serve it via `net.fetch(require('node:url').pathToFileURL(absolutePath).toString(), { headers: request.headers })`, forwarding the request headers so `<video>` Range/seek requests work. Keep `registerSchemesAsPrivileged` as-is.
3. **Refactor** — No behavior change. Confirm `CLAUDE.md` (architecture, `mediaPathStore` row) already documents the fixed `local` host; reconcile if the wording drifts.

The handler runs in the Electron main process and isn't covered by Vitest — that gap is what let the original bug ship. **Manual verification (required):** after a FULL quit + relaunch (`npm run dev` reloads the renderer but NOT `main.cjs`), arm Tragedia, hit Play, and confirm video plays in both windows and that seek/Restart work. Also confirm in DevTools that `fetch("media://local/Users/jorgevallejos/Chango%20Pepper/animations/tragedia-de-cerdo-asado/Tragedia%20de%20Cerdo%20Asado.mp4")` returns status 200.

**Commit:** `fix(video): use fixed host in media:// urls so absolute path survives`

### Lesson — custom protocol handlers need a round-trip check

The Prompt 1 unit test asserted the helper's output string and passed, but the bug lived in the **renderer → Chromium canonicalization → main-process handler** round trip, which Vitest (jsdom) never runs. Any prompt that touches `protocol.handle`, a custom scheme, or `main.cjs` must include a manual verification step that hits the real handler — minimally, a DevTools `fetch("<scheme>://…")` that asserts **status 200** — because the pure-function test is structurally blind to it.

---

## Prompt 2 — Collapse to a single video per song (schema v6)

**Branch:** `feat/single-video-per-song`

Per the confirmed model, a song has at most **one** video. Replace the `SongMedia { big?, small? }` container with a single `MediaFile`. Migrate existing data; the Big/Small *display* choice is handled separately (Prompt 4) and no longer selects a file.

TDD, strict Red → Green → Refactor:

1. **Red** — Write tests first:
   - `src/songState.test.ts`: a song file with a flat `media: { type, src, offset?, trimStart? }` parses into a single `MediaFile` on `ParsedSongFile.media` (no `{ small }` wrapping). A `media` object with `big`/`small` keys is still accepted for backward compatibility and collapses to a single `MediaFile` (prefer `big`, else `small`). Reject `media: {}`.
   - `src/setlistStore.test.ts`: bump the persisted store to **v6**; a v5 snapshot whose songs carry `media: { big?, small? }` migrates to `media: MediaFile` (prefer `big`, else `small`, else omit). `getActiveMediaFile(song)` returns `song.media` directly.
2. **Green** — Update `MediaFile`/`SongMedia` types in `src/songState.ts` (make `media?: MediaFile`; keep a deprecated alias if helpful), rewrite `validateMedia` to return a `MediaFile`, bump `CURRENT_VERSION` and add the v5→v6 migration in `src/setlistStore.ts`, and simplify `getActiveMediaFile`, `patchSongMediaInSnapshot`, and the normalizers to the single-file shape. In `src/App.tsx` (both `ControlView` and `ProjectionView`) replace the `selectedScreenSize`-based `activeMedia` resolution with `currentLibrarySong?.media`.
3. **Refactor** — Remove now-dead big/small media plumbing. Keep the suite green (656+ tests).

**Commit:** `feat(media): use a single video per song (schema v6)`

---

## Prompt 3 — Single-file camera picker, video icon, green-when-linked

**Branch:** `feat/single-video-camera-picker`

Depends on Prompt 2's schema. The camera button in Manage Setlists should link one video directly, use a video-camera glyph, and signal when a song already has a video.

TDD, strict Red → Green → Refactor:

1. **Red** — In `src/ManageSetlistsView` tests (or a colocated test): clicking the camera button calls `window.electronAPI.openFileDialog()` directly (no intermediate big/small dialog) and stores the chosen file as the song's single `media`, plus `setMediaPath(basename, absolutePath)`. A song that already has `media` renders the camera button with a "linked" class (e.g. `manage-setlists-icon-btn--linked`); a song without media does not.
2. **Green** — Remove `LinkVideoDialog` and the `linkVideoSongId`/slot/warnings state. `onLinkVideo` becomes: open the file dialog, `validateVideoForImport`, `patchSongMediaInSnapshot(d, songId, { type: 'video', src: basename })`, `saveSetlistStore`, `setMediaPath`. Surface any validation warning via a non-blocking `window.alert` (or keep a tiny inline note). Replace the `CameraIcon` SVG with a video-camera glyph (a rounded rectangle body + a triangular lens spout — the common "movie camera" mark). Add the `--linked` class + a green color rule in `control.css` when `song.media` is set.
3. **Refactor** — Delete dead warning/slot types and styles.

**Commit:** `feat(setlists): link one video via a single file picker with linked-state camera`

---

## Prompt 4 — Big/Small as a projection display-format toggle; remove the DISPLAY row

**Branch:** `feat/projection-format-toggle`

Depends on Prompt 2. The bottom "DISPLAY" profile row (`DisplayProfileSetup`) is removed. Instead, the Projection column shows **Big** and **Small** buttons — but only when the current song has a video — and they pick the display profile (`big-screen` ↔ `small-canvas`).

TDD, strict Red → Green → Refactor:

1. **Red** — In `src/screenSizeState.test.ts` and a `ControlView` test: when the current song has `media`, both `Big` and `Small` are offered; when it has no media, neither is shown. Selecting Big activates the `big-screen` profile (`setActiveProfileId('big-screen')`) and broadcasts the size; Small activates `small-canvas`. With no song video, the setup panel renders **no** display/format button row at all (regression for issues 1 & 6, incl. Luz y Sal).
2. **Green** — Rework `getAvailableScreenSizes` to derive from "song has a video" (both sizes available when `media` exists, none otherwise). In `src/App.tsx`: keep the Big/Small buttons in the Projection column gated on `availableScreenSizes`, map each to its display profile via `displayProfileStore`, and **delete** the `<DisplayProfileSetup />` usage at line 724. Persist/broadcast the chosen size as today so the projection layout follows.
3. **Refactor** — Remove the `DisplayProfileSetup` component and the unused `Custom` profile UI (the band/scale presets remain as the data backing Big/Small). Keep `computeProjectionLayout` and the presets.

**Commit:** `feat(projection): replace DISPLAY row with song-gated Big/Small format toggle`

---

## Prompt 5 — Non-video beat: Start / Pause / Restart, decoupled from Next

**Branch:** `feat/non-video-beat-controls`

Bring the non-video performer view to parity with Video mode. Today `useBeatClock` auto-starts on arm, has no pause, and the count-in's end auto-fires "Next" (coupling beat-start to the first-phrase reveal). Wanted: an explicit **Start** that begins the count-in/beat (relabels to **Restart** once running), a **Pause**, and the first phrase stays a manual **Next**.

TDD, strict Red → Green → Refactor:

1. **Red** — In `src/useBeatClock.test.ts` and a `ControlView` test: after arming a non-video song, the beat clock is **idle** (not ticking) until Start is pressed. Start begins the count-in; once running the control reads **Restart** and restarts the clock. Pause halts the clock and freezes the phase; Pause→Start (resume) continues. Crucially: when the count-in's `begin` fires, the index does **not** auto-advance — the first lyric appears only when the performer presses Next.
2. **Green** — Add explicit start/pause/restart state to `useBeatClock` (idle → counting/playing → paused), driven by handlers rather than `isActive` auto-start. Add Start/Pause/Restart controls to the non-video armed footer in `src/App.tsx` (mirror `VideoPerfBottomBar`'s shape/labels for consistency). Remove the auto-`handleNext` on `beginFiredOnce` (lines 549-557).
3. **Refactor** — Factor shared transport-button markup if Video and non-video can share it; keep both suites green.

**Commit:** `feat(beat): add start/pause/restart to non-video view and decouple from next`

---

## Prompt 6 — Remove the unused End Card button

**Branch:** `chore/remove-end-card-button`

The End Card control adds clutter with no value. Remove the secondary bottom-bar button and the dead toggle path.

TDD, strict Red → Green → Refactor:

1. **Red** — Update the `ControlView`/end-card test to assert the `end-card-btn` is no longer rendered in the armed footer.
2. **Green** — Remove the `bottom-buttons-secondary` block in `src/App.tsx` (lines ~877-886) and stop calling `toggleEndCard`/`useEndCardState` in `ControlView`. Decide whether to keep the projection-side end-card screen dormant or remove it too — recommend removing `useEndCardState` usage in the control view and leaving `endCardState.ts` only if still referenced; otherwise delete it and its test.
3. **Refactor** — Delete now-dead end-card code and CSS (`ctrl-end-card*`) if nothing references them.

**Commit:** `chore(ui): remove unused end-card button`

---

## Prompt 7 — Projection stays black until Play (don't reveal the video on arm)

**Branch:** `fix/projection-video-hold-until-play`

Surfaced after Prompt 1b: now that video renders, the **projection** (audience) window shows the first frame the moment the song is armed / the projection opens, because `VideoProjectionRegion` mounts the `<video>` visible and seeks it to `trimStart`. The audience should see **black** until performance actually starts — i.e. until the first `play` transport command arrives — and return to black when the song is unarmed/stopped. The performer preview in `VideoPerformancePanel` is unaffected (the performer may see the cued frame).

TDD, strict Red → Green → Refactor:

1. **Red** — In a `VideoProjectionRegion` test: on mount (armed, projection open, no transport command yet) the video is **not visible** — the region shows a black cover and the `<video>` is hidden (e.g. `opacity: 0` / a `projection-animation--idle` class, *kept mounted* so it can preload and receive commands). After a simulated `play` transport storage event, the video becomes visible. After a subsequent `pause` it stays visible (frozen frame is fine); only an unarm/stop (or a fresh mount) returns it to black. Keep the existing seek-to-`trimStart` behavior.
2. **Green** — Add a `hasStarted` piece of state to `VideoProjectionRegion`, flipped true in the transport effect when `payload.action === 'play'`. Gate the video's visibility on it (black overlay or `opacity` on the `projection-animation-region`), leaving the `<video>` mounted underneath. Don't change the WebSocket/transport plumbing otherwise.
3. **Refactor** — If the visibility decision is more than a boolean, extract it as a pure helper (`isProjectionVideoVisible(...)`) with its own test. Keep both suites green.

**Manual verification:** open projection, arm Tragedia — screen stays black; hit Play — video appears on the downbeat in both windows; unarm — projection returns to black.

**Commit:** `fix(projection): hold black until play instead of revealing video on arm`

---

## Prompt 8 — Constrain performer-view video so transport controls stay visible

**Branch:** `fix/performer-video-fit`

Surfaced after Prompt 1b: in `VideoPerformancePanel`, `.video-perf-preview` renders at the video's natural size and pushes `VideoPerfBottomBar` (Play/Pause/Restart/Unarm) off the bottom of the window. The video must scale to the space left over **after** the controls, never overflow them.

This is primarily a CSS/layout fix in `control.css`:

1. Make `.video-perf-panel` a full-height flex column (`display: flex; flex-direction: column; min-height: 0; height: 100%`).
2. `.video-perf-video-wrap` takes the remaining space and is allowed to shrink: `flex: 1 1 auto; min-height: 0; overflow: hidden`.
3. `.video-perf-preview` fills that region with `width: 100%; height: 100%; object-fit: contain` (letterboxed, never cropped, never larger than its wrap).
4. `.video-perf-lyric-row` and `.video-perf-bottom-bar` are `flex: 0 0 auto` so they keep their height and stay visible.
5. **Restore button spacing (covers 2026-06-24 #8 — "no spacing between performer buttons").** `.video-perf-bottom-bar` currently has **no CSS rule at all** in `control.css`, so its four buttons (Play / Pause / Restart / Unarm) render flush against each other. Add a rule: `display: flex; gap: <match the previous spaced footer — use the same value as the other control footers, e.g. `0.75em`>; flex-wrap: wrap; justify-content: center` (or `space-between` if that matches the prior look). This restores the previous spaced layout rather than inventing a new one — match the spacing the non-video footer uses so both views look consistent.

Layout/CSS isn't meaningfully unit-testable, so guard against regression with a light structural assertion and verify visually:

1. **Red** — In a `VideoPerformancePanel` test, assert the panel renders the `video-perf-bottom-bar` and the `video-perf-video-wrap` together (the transport bar is always present alongside the video). If a snapshot/structure test is more natural, assert the bottom bar is a sibling after the video wrap. Also assert the bottom bar carries its `video-perf-bottom-bar` class so the spacing rule applies.
2. **Green** — Apply the flex rules above, including the new spacing rule for `.video-perf-bottom-bar`. Don't change component logic.
3. **Refactor** — Remove any fixed/`vh` height or unconstrained sizing on the preview that fought the flex layout.

**Manual verification (required):** arm Tragedia, confirm the video fits within the panel, Play/Pause/Restart/Unarm are fully visible at the bottom **and visibly spaced apart**; resize the window and confirm the controls never get pushed off.

> **Re-verify 2026-06-24 #7 (no beat indicator on the performer view) after this lands.** Tempo is set (Tragedia is 128 bpm), so the beat indicator is most likely just hidden behind the oversized video, not missing. Once Prompt 8 constrains the video, re-check the performer view: if the `BeatCircle`/count-in indicator now shows, no further work is needed — close #7. **Only add a new prompt if the indicator is still absent after the video is fitted.**

**Commit:** `fix(performer): fit preview video and restore transport button spacing`

---

## Second projector test (2026-06-24)

_Second end-to-end projector test, after the video-playback fix (Prompts 1/1b) and the camera/single-video/Big–Small prompts (2–4) landed — video now renders in both windows. Prompts 7 and 8 were still pending at test time, which is why #4 and #5 below map back to them. Jorge's feedback is numbered #1–#9 below; this numbering is **independent** of the first triage table (#1–12) above. Same conventions: real code bugs become paste-ready TDD prompts (Red → Green → Refactor, atomic commits, `/release` per change). The single-video v6 model is unchanged._

### Disposition table

| # | Observation | Disposition |
|---|---|---|
| #1 | Video link button should also appear in the **SONG LIBRARY** section of Manage Setlists (today it's only on setlist rows) | New code prompt → **Prompt 9** (combined with #2) |
| #2 | Empty state: video-camera icon + a "+" affordance, same button size; stays green when linked | New code prompt → **Prompt 9** (combined with #1) |
| #3 | Performance setup: make Big/Small a clear **toggle** (single segmented control), default to **"small"** | New code prompt → **Prompt 10** |
| #4 | Video shows on projection open (should hold black until Play) | **Already planned — Prompt 7.** No new prompt. |
| #5 | Oversized performer video | **Already planned — Prompt 8.** No new prompt. |
| #6 | No lyrics — `songs/tragedia-de-cerdo-asado.json` has no `timeline` | **DATA task** (not a code prompt) — see "Timeline-authoring path" below |
| #7 | No beat indicator on the performer view | **Re-verify after Prompt 8** (tempo is set at 128 bpm, so it's likely hidden behind the oversized video). Prompt only if still missing — note folded into Prompt 8. |
| #8 | No spacing between performer transport buttons | **Folded into Prompt 8** (restore the previous spaced layout). |
| #9 | Projection status text reads "Open, Small **screen**" — drop the word "screen" | New code prompt → **Prompt 11** |

### Decisions taken (2026-06-24)

1. **#1 + #2 → one prompt.** Both touch the same component and the same link-button design, so they're combined into a single **Prompt 9** (one branch) to avoid editing the same lines twice.
2. **#3 → a single segmented control.** Big/Small becomes one segmented toggle (not two separate buttons). Prompt 10 is written for this.
3. **#3 → default Small confirmed.** A song that has a video displays in the **Small** projection format by default; the segmented toggle sits on "Small" on arm until the performer switches it.

### Timeline-authoring path (DATA task for #6 — no code prompt)

`songs/tragedia-de-cerdo-asado.json` has a `media` block but **no `timeline`**, so Video mode shows no lyrics. Decided source and method (Cowork does this as a data task, not Code):

- **Source:** Jorge provides a video with the lyric phrases **burned in** at the correct times (he's producing the EN-subtitled video anyway, so this is free).
- **Method:** Cowork derives the timeline from that video — `ffmpeg` subtitle-region change detection to find the timestamps where the burned-in text changes; the lyric order is fixed, so assign the **29 lines** to the detected change points in order; OCR is used **only to verify** the assignment, not as the primary signal. Cowork then writes the resulting `timeline` into the song JSON.
- **Status:** This is the timeline-authoring path of record for the current test. **Prompt B (offline forced alignment)** remains the eventual *automated* path, but only once the produced master audio exists — it's deferred until then (consistent with the project context's "Deferred" note).

---

## Prompt 9 — Video-link button on library rows + empty-state "+" affordance (covers #1 and #2)

**Branch:** `feat/library-video-link-and-empty-state`

Depends on Prompt 3 (single-file camera picker, video glyph, green-when-linked) — already merged. Two coupled changes to the link button in `ManageSetlistsView.tsx`, done together:

- **#1 — also on library rows.** Today the camera/link button lives only on `SortableSongRow` (setlist rows); `LibrarySongRow` (the SONG LIBRARY column, ~line 253) renders only **Add (+)** and **Delete**. The video should be linkable from the library too, reusing the same button, glyph, handler, and linked-state styling.
- **#2 — empty-state affordance.** The link button should read clearly as "add a video" when empty and "linked" when set, at a consistent size in **both** row types: empty (no `media`) shows the `VideoCameraIcon` plus a small "+" affordance; linked (`media` set) drops the "+", keeps the camera glyph, and uses the green `--linked` styling. The "+" must not change the button's footprint.

TDD, strict Red → Green → Refactor:

1. **Red** — In `ManageSetlistsView` tests:
   - A `LibrarySongRow` renders a video-link button (`manage-setlists-icon-btn`, `VideoCameraIcon`); clicking it runs the same flow as setlist rows (`handleLinkVideo(song.id)` → file dialog → `patchSongMediaInSnapshot` → `setMediaPath`).
   - A song with no `media` renders the button with the "+" affordance (assert the added glyph/`--add` class) plus the camera icon; a song with `media` renders it **without** the "+" and **with** `manage-setlists-icon-btn--linked` — in **both** setlist and library rows.
   - Both states share the same base class so the footprint is identical (no size-changing modifier).
2. **Green** — Extract a shared `VideoLinkButton` component (camera glyph; conditional "+" when `!hasMedia`; `--linked` when `hasMedia`) and use it in both `SortableSongRow` and `LibrarySongRow`. Add `onLinkVideo` + `hasMedia` to `LibrarySongRowProps`, and wire `onLinkVideo={() => handleLinkVideo(song.id)}` and `hasMedia={!!song.media}` at the `LibrarySongRow` call site (~line 710), matching the setlist row (`hasMedia={!!song.media}`, ~line 238). Reuse `handleLinkVideo` — do **not** fork a second link path. Add CSS in `control.css` so empty and linked states are the same dimensions and the linked state is green (reuse the existing `--linked` color rule).
3. **Refactor** — Remove any now-duplicated row markup/styling; keep the suite green.

**Manual verification:** in Manage Setlists, an unlinked song (setlist *and* library row) shows camera + "+"; link a video from the library column; the "+" disappears, the button turns green, and it persists; button size is identical before/after and across both row types.

**Commit:** `feat(setlists): link video from library rows with empty-state "+" affordance`

---

## Prompt 10 — Big/Small as a single segmented toggle, default Small

**Branch:** `feat/projection-format-segmented-toggle`

Depends on Prompt 4 (Big/Small in the Projection column) — already merged. Replace the two separate Big/Small `ctrl-screen-size` buttons (`App.tsx` ~lines 661–671) with **one segmented control** (a single toggle with two segments), and **default it to Small** when a song with a video is armed.

TDD, strict Red → Green → Refactor:

1. **Red** — In `screenSizeState.test.ts` / a `ControlView` test:
   - When a song with `media` is armed and no size has been chosen yet, the resolved/selected screen size is **`small`** (activating `small-canvas`).
   - The control renders as a **single segmented toggle** with two segments (Small | Big), exactly one selected at a time (assert a `--selected`/`aria-pressed`/`role="radiogroup"`-style state on one segment and not the other). Selecting Big moves the selection to Big; selecting Small moves it back.
   - When the current song has no video, the segmented toggle is not shown (regression with Prompt 4's song-gating).
2. **Green** — In `screenSizeState.ts`, make the default screen size resolve to `'small'` (rather than `null`/unset) when a video is present. In `App.tsx`, replace the two-button block with one segmented-toggle component (two segments mapping to `setActiveProfileId('small-canvas'|'big-screen')` and the existing size broadcast), gated on `availableScreenSizes` as today. Style it in `control.css` as a proper segmented switch (connected segments, clear selected segment). Keep the WS broadcast + display-profile mapping from Prompt 4 unchanged.
3. **Refactor** — Remove the now-dead `ctrl-screen-size`/`--active` two-button styling; centralize "which segment is selected" if it lives in more than one place. Keep both suites green.

**Manual verification:** arm Tragedia — the toggle sits on **Small** and the projection opens in small-canvas; flip to Big — it switches cleanly; flip back to Small. Confirm the selected segment is obvious at a glance on the projector, and the toggle is absent for a song with no video.

**Commit:** `feat(projection): replace big/small buttons with a segmented toggle defaulting to small`

---

## Prompt 11 — Projection status text: drop "screen"

**Branch:** `fix/projection-status-text`

`getProjectionStatusText` (`screenSizeState.ts`) currently returns `` `Open, ${screenSize === 'small' ? 'Small' : 'Big'} screen` `` → e.g. "Open, Small screen". Drop the trailing word "screen" so it reads "Open, Small" / "Open, Big". The `null` case ("Open") and the closed case are unchanged.

TDD, strict Red → Green → Refactor:

1. **Red** — In `screenSizeState.test.ts`, update the `getProjectionStatusText` cases to expect `"Open, Small"` and `"Open, Big"` (no " screen"); keep the existing `"Open"` (null) and closed-state expectations. Run; confirm failure.
2. **Green** — Change the return to `` `Open, ${screenSize === 'small' ? 'Small' : 'Big'}` ``.
3. **Refactor** — None expected; confirm the two call sites in `App.tsx` (~lines 594, 653) still render correctly.

**Commit:** `fix(ui): drop "screen" from projection status text`

---

## After the prompts

Once Prompt 1 lands and video plays, re-run the projector test and check subtitle alignment. If lines lead or lag the animation, that's a **tuning** pass on the song JSON's `media.offset` (whole-song shift) and `trimStart` (skip blank lead-in) — not code. Capture good values directly in `songs/tragedia-de-cerdo-asado.json`.
