# Code execution plan — auto-advance & video-sync feature (consolidated)

_Rebuilt 2026-06-19 as a single self-contained runsheet. Contains the full A–H prompt blocks inline + run order + status, so it doesn't depend on any other file. Prompt I (live ASR) is **shelved** — see `project-context.md`._

> ⚠️ **This is THE single plan of action for live-lyric-translator.** It supersedes the two scratch briefs (`git-cleanup-brief.md`, `phase0-asr-session-brief.md`) — those were written before this plan resurfaced and have been removed to avoid parallel agendas. The housekeeping from the cleanup brief is folded into **Step 0** below; the ASR spike stays **shelved** (Prompt I), not resumed.

> ⚠️ **Commit this file** so it can't be lost again. The previous version was untracked and got wiped during a branch cleanup. After saving: `git add docs/code-execution-plan.md && git commit -m "docs: add consolidated Code execution plan"` (on a `docs/…` branch or directly, your call).

---

## Step 0 — Housekeeping (mostly done — 2026-06-19)

A first Code pass cleared the truly-dead branches and surfaced a **major correction**: `fix/intro-cues-and-startup-reset` is NOT dead — it holds the **v3/intro schema foundation** that main lacks and that the whole feature set depends on (see Step 0.5). Recovery order changed accordingly.

**Status of the cleanup:**

- ✅ `chore/improve-claude-release-command`, `fix/dev-port-5174` — deleted (were clean-merged; already gone from remote).
- 🟢 `feat/serif-and-intro-cues` — **approved for delete** (Code confirmed nothing unique in `src/`); local + origin.
- 🟢 `stash@{0}` ("wip: phase0 docs") — **approved to drop** (docs-only path tweak, irrelevant).
- 🔴 `fix/intro-cues-and-startup-reset` — **KEEP. Do not delete.** It's the v3 foundation → goes into main via Step 0.5.

**Correction to the old plan:** the "cherry-pick `c0d6b6a` for Prompt A" instruction was wrong. `c0d6b6a` is built *on top of* the v3 branch (so it needs that foundation first) and is a tangled mega-commit (timeline+media + a separate `scripts/phase0-spike/spike.py` + images + the original lost docs). It's kept only as a *reference*; Prompt A is rebuilt fresh on the v3 base instead.

**Keep, do not touch:** `main`, `spike/auto-advance-phase0`, `spike/live-asr-lyric-following`.

### Outstanding housekeeping (as of Prompt A run)

Three now-merged/dead local branches still linger, and `main` has an unpushed commit. Clear these next time you're in Code (none block Prompt A):

- Delete: `feat/serif-and-intro-cues` (dead), `feat/v3-intro-schema` (merged PR #11), `fix/intro-cues-and-startup-reset` (merged PR #10) — local + origin.
- Drop `stash@{0}` if not already.
- `git push` main — it's ahead of origin by 1 (the plan-file commit `0c610ba`).

> **Cleanup prompt:** On live-lyric-translator, delete these merged/dead branches locally and on origin: `feat/serif-and-intro-cues`, `feat/v3-intro-schema`, `fix/intro-cues-and-startup-reset` (all use `git branch -d`; if any refuses, tell me before forcing). Drop `stash@{0}` if it still exists. Push `main` to origin. Do NOT touch the two `spike/*` branches. Print `git branch -vv` and stop.

---

## Step 0.5 — Land the v3/intro foundation into `main` (do before Prompt A)

`fix/intro-cues-and-startup-reset` (13 commits, tip `566ecc5`) migrates the schema **v2 → v3**: `title_translations`, `intro` replacing `intro_cues`, the full projection intro screen + control intro, plus session-reset fixes. ~850 tested lines across 10 source files. `main` is still v2/`intro_cues`. Everything downstream (Prompt A schema, the title screen in D/H, count-in in G) builds on this, so it lands first.

The branch **diverged** from main: main gained 3 commits since (the logo-on-startup PR #9 work), so this is a real reconcile, not a fast-forward — expect conflicts in `App.tsx`, `control.css`, and the projection intro screen (both lines touched it). Keep **both** main's logo-on-startup behaviour and the branch's v3 intro screen.

### Step 0.5 — ready-to-paste Code prompt

> In the live-lyric-translator repo, bring the v3/intro foundation on `fix/intro-cues-and-startup-reset` (tip `566ecc5`) into `main`. Cut a fresh branch off current `main` (`feat/v3-intro-schema`) and rebase the 13 commits unique to `fix/intro-cues-and-startup-reset` onto it (`git log main..fix/intro-cues-and-startup-reset` lists them). The branch diverged from main, which has since gained the logo-on-startup work (PR #9) — resolve conflicts in `App.tsx`, `control.css`, and the projection intro screen by keeping BOTH main's logo-on-startup-before-first-lyric behaviour AND the branch's v3 translatable intro screen. This is a schema migration v2→v3 (`SETLIST_STORE_VERSION = 3`, `title_translations`, `intro` replacing `intro_cues`) with v2 snapshots migrated on load — make sure the migration path and its tests are intact. Run the full suite, confirm green, then stop so I can `/release`. After it merges, delete `fix/intro-cues-and-startup-reset`.

---

## How to run each prompt

You drive Claude Code; I track status here. For **every** prompt, start clean from `main` so each lands on its own branch and PR:

1. Switch to `main` and pull: `git checkout main && git pull`.
2. Open a fresh Claude Code session (one session per prompt keeps context clean).
3. Paste the **standard wrapper** below, then the prompt body.
4. Let it work TDD (Red → Green → Refactor), then run `/release` — branch confirm → commit-message approval → push confirm → PR via `gh`.
5. Review the PR on GitHub, merge, delete the branch, `git checkout main && git pull`.
6. Tell me it's merged; I tick it off and confirm the next prompt is unblocked.

**Standard wrapper — prepend to every prompt:**

> Work in the `live-lyric-translator` repo on a new branch off `main` named per our convention (`feat/…`, max 40 chars). Follow strict TDD (Red → Green → Refactor), small atomic commits, no mixing feature work with refactoring. Don't touch unrelated files. When done, stop before pushing so I can run `/release`.

---

## Run order, dependencies, status

Sequenced by value-and-risk. Critical path to the big win (VIDEO mode) is **Step 0 → 0.5 → A → C → F → D**.

| # | Prompt | Delivers | Depends on | Status |
|---|--------|----------|------------|--------|
| 0 | **Housekeeping** | Delete dead branches + stash; clean `main`. | — | ◑ Mostly done; finish-prompt above (delete serif branch + drop stash) |
| 0.5 | **v3 foundation** | Migrate main v2→v3: `title_translations`, `intro`, intro screen. Base for everything. | Step 0 | ✅ Merged to main (PR #11, 399 green). main is now v3. |
| 1 | **A** — song schema | `timeline` + `media` fields, back-compatible. | 0.5 | 🟢 `feat/timeline-media-fields`, 419 green, 2 clean commits (Red/Green) — in `/release`. |
| 2 | **C** — record-by-tapping | Capture a `timeline` by performing once. Cue-capture MVP. | A | 🟢 Built (`timelineCapture.ts` 4 pure fns + 20 tests; `updateSongTimeline` in store; Record-Timeline UI w/ Save/Discard) — in `/release`. |
| 3 | **F** — display profiles + band | Big-cinema / Small-130×100 / Custom; app composites the black subtitle band. | A | 🟢 Built — `computeProjectionLayout` pure fn (17 tests) + store (7 tests), 6 commits, presets calibrated to reference stills. In `/release`. |
| 4 | **D** — VIDEO mode | Projection plays clean animation + overlaid translation, bound to `video.currentTime`. Replaces QuickTime + per-language + per-screen exports. | A, C, F | ✅ Merged to main. |
| 4b | **D-wire** — wire Tragedia | `media` block added to Tragedia JSON ✅; capture a rough `timeline` in-app to see VIDEO mode end-to-end. | D, C | ☐ In-app task, do whenever (optional/throwaway calibration) — see below. |
| 5 | **H** — end-card | Reusable acknowledgements/credits screen. | A | ✅ Merged to main. |
| 6 | **G** — count-in / metronome | Performer-view visual count-in; auto-rolls on the downbeat. Adds `tempo` field. | A | ◑ Next up / running (prompt below) |
| 7 | **E** — TIMED mode + nudge | Wall-clock timeline for fixed-tempo songs, ±0.25s nudge + manual override. | A | ☐ Not started |
| 8 | **B** — offline alignment | Auto-generate `timeline` from lyrics + vocal stem (WhisperX). **Defer** until late-June produced master exists. | A | ☐ Deferred |
| — | **I** — live ASR spike | **Shelved** 2026-06-18 (no-go on provisional take). Revisit after produced master. | — | ⏸ Shelved |

---

## The prompt blocks (full text, in run order)

### 1. Prompt A — extend the song schema (timeline + media), fresh on the v3 base

> Prerequisite: Step 0.5 (v3 foundation) is merged to `main`. In the live-lyric-translator repo, on a fresh branch off `main`, extend the song file format in `src/songState.ts` with two optional, back-compatible fields, TDD (Red→Green→Refactor):
> 1. `timeline`: an optional array parallel to `lyrics`, each entry `{ start: number, end: number }` in seconds. Validate that, when present, it has the same length as the lyric-line count and that times are non-negative and monotonic.
> 2. `media`: an optional object `{ type: "video" | "audio", src: string, offset?: number }`.
> Add both to `ParsedSongFile` and the parse/validate path, leaving songs without these fields behaving exactly as today. Add unit tests for: missing fields (current behaviour), valid timeline/media, mismatched timeline length, and non-monotonic times. Don't wire any UI yet.
>
> _Reference only: an earlier tangled version of this exists in commit `c0d6b6a` (also bundles a phase0-spike, images, and old docs — don't cherry-pick it; rebuild clean per above). You can `git show c0d6b6a -- src/songState.ts` if you want to crib the `MediaMetadata` shape._

### 2. Prompt C — record-by-tapping (capture a timeline by performing once)

> Add a "record timeline" mode to the control view. While armed in this mode, every lyric advance (arrow or pedal) timestamps the current line against a clock started on the first advance, building a `timeline` array. On stop, offer to save the captured timeline into the loaded song JSON. Reuse the existing navigation/state machine; don't change manual behaviour outside record mode. TDD the timestamp-capture logic as a pure function first, then wire the UI.

### 3. Prompt F — display profiles + dynamic black band

> Add gig-level **display profiles** that control how the projection frame is composited. Each profile defines the subtitle-band height (as a % of projection height) and a subtitle text scale. Ship two presets — "Big screen (cinema)" (~13% band, smaller text) and "Small canvas 130×100" (~28% band, larger text) — plus a "Custom" option (enter band % and text scale). The selected profile is app/gig state, not per song. The projection window uses it to size the black band and the subtitle; the clean animation scales with `object-fit: contain` into the region above the band. Calibrate the two presets against the reference stills in `animations/tragedia-de-cerdo-asado/reference/`. TDD the band/text geometry as a pure function (profile + viewport → band rect + font size) first.

### 4. Prompt D — VIDEO mode (Request 2)

> Add a VIDEO playback mode driven by a song's `media` (type `video`) + `timeline`. In the projection (audience) window, render the **clean, full-frame** animation (no baked-in black band) with the translated subtitle (current audience language) overlaid — the app replaces QuickTime, so the projector only ever shows this app. The app composites the projection frame itself: black background, `<video>` with `object-fit: contain` in the upper region, and a black subtitle band below whose height comes from the active **display profile** (`computeProjectionLayout` from F). Start playback at `media.trimStart` to skip any blank lead-in, and bind the subtitle + blank-before/after behaviour to `video.currentTime + media.offset` — not a separate timer. The video is **muted** on the projection (audience hears the live performance). Style the subtitle per `docs/subtitle-format.md`. In the control/performer view, show the same video smaller with the current Spanish (singing-language) line and the next line greyed below it, plus a position bar. Add a thumbnail-strip fallback view (periodic frames as markers + current/next line) behind a toggle. Manual arrows/pedal must still override and re-seek. Keep the WebSocket sync model. TDD the cue-lookup-by-time as a pure function first.
>
> **Media path strategy (per `docs/media-assets.md`):** the song JSON's `media.src` is a logical filename only (e.g. `"tragedia-de-cerdo-asado.mp4"`), never an absolute path. Resolve it via local app settings (same local-state layer as the display profile) holding a `src → absolute path` mapping. Add a file-picker (Electron open-file dialog) so the user links the video once; remember the path. If the file isn't found at the remembered path, show a "Locate video…" re-link prompt rather than failing. On link/import, validate the file and **warn** (not block) if it's not a web-playable delivery encode (target: MP4 H.264, ≤1080p, ~5–10 Mbps; reject/warn on ProRes/MOV or very large files). Tests must use a fixture path and not depend on the real video.

### 5. Prompt H — end-card / acknowledgements screen

> Add a reusable **end-card** screen the performer can trigger to show at the end of a concert (acknowledgements / credits / thanks), independent of any song, projected like the title screen. Content comes from a simple editable source (e.g. an `end-card.md`/config), so it's not baked into any video. TDD the show/hide state as part of the existing performance state machine.

### 6. Prompt G — performer-view tempo count-in / metronome

> Add a per-song optional `tempo { bpm, meter, countInBars }` to the song schema (back-compatible). In the **performer view only** (never the audience projection), render a visual beat indicator: on start, count in for `countInBars` bars showing the beat number large (e.g. 1·2·3·4 for 4/4) with the downbeat emphasised; on the first beat after the count-in, fire a "begin" event that auto-starts the song (rolls the video in VIDEO mode, starts the clock in TIMED mode). During the song, show a small persistent beat pulse that can be toggled off. Default count-in = 1 bar. TDD the beat-scheduling logic as a pure function (bpm + meter + elapsed → current beat, in-count-in?, begin-fired?) first, then wire the UI. Keep it visual only for now — no audio click.

### 7. Prompt E — TIMED mode + nudge (Request 1, track-based)

> Wire `useSubtitleTimer`/`subtitleState` to a real song `timeline` instead of `SAMPLE_LINES`. Add a TIMED mode: start/pause/stop the clock, drive the active line from the timeline, and add a "nudge ±0.25 s" control plus an instant manual-override (any arrow/pedal press re-seizes control and resyncs the clock to that line's start). Surface a small drift indicator. TDD the active-line-from-timeline and nudge logic as pure functions first.

### 8. Prompt B — offline cue-sheet generator (forced alignment) — DEFERRED

> Add a repo script `scripts/align-song.ts` (or `.py`) that takes a song JSON and an audio file (e.g. an isolated vocal stem) and produces a `timeline` array of per-line `{ start, end }` times, using forced alignment. Use WhisperX (Spanish model) for word-level timestamps and snap them to the song's lyric-line boundaries; fall back to aeneas if WhisperX isn't available. Write the result back into the song JSON under `timeline`. Document the install steps in the script header. Include a `--review` flag that prints each line with its start time so I can eyeball it. Test against `songs/tragedia-de-cerdo-asado.json` + `songs/audio/Tragedia de Cerdo Asado - voice.mp3` (vocal onset is ~18.7 s, last phrase ends ~176.4 s — use that as a sanity check).

### (shelved) Prompt I — live voice-recognition spike

> Build a throwaway spike (separate branch, not wired into the app) that tests whether live speech recognition can auto-advance lyric lines by following a singer. Input: `songs/tragedia-de-cerdo-asado.json` (Spanish lyric lines) + a recording of the song. Use a streaming ASR (WhisperX, whisper-timestamped, or Vosk Spanish) to transcribe the vocal in (simulated) real time, and a matching layer that advances a pointer when the recognised words cross into the next lyric line — tolerant of mis-hearings, repeated/held words (melisma), and gaps. Report, per line, the detected advance time vs a hand-marked ground truth, and the accuracy/latency. Run it first on the clean vocal, then on the mixed voice+guitar audio, to quantify how much guitar bleed hurts. Goal is a go/no-go read on live following, especially for songs with an irregular/accelerating tempo where a fixed timeline can't work.

**Shelved 2026-06-18.** Ran on the provisional vocal take and failed (detected 2 of 10 lines; placed line 1 at ~141.8s vs real onset ~18.7s). Test itself wasn't valid either (placeholder sample ground truth, 10 lines vs the song's 28). Revisit after the late-June produced master + time-locked vocal stem exist.

---

## D-wire — in-app workflow (not a Code prompt)

Goal: see VIDEO mode play end-to-end on the provisional Tragedia master. This is throwaway calibration — the accurate timeline comes later from Prompt B against the produced master, so don't perfect it.

1. **Data:** ✅ done — `media` block added to `songs/tragedia-de-cerdo-asado.json` (`src: "tragedia-de-cerdo-asado.mp4"`, offset 0, trimStart 0). Re-import the song so the store picks it up.
2. **Link the video:** in the app, use the new file-picker to point `tragedia-de-cerdo-asado.mp4` at the real file (`~/Chango Pepper/animations/tragedia-de-cerdo-asado/Tragedia de Cerdo Asado.mp4`, the 89 MB one — not the 22 GB `.mov`). The path is remembered locally.
3. **Capture a rough timeline:** play the video and use Record mode (from C) to tap through the lyrics in time with it. Save the captured timeline into the song. _Note: Record mode (C) uses its own clock, so taps land ~your reaction-lag late vs the video — that's fine, the next step corrects it._
4. **Test + nudge:** switch to VIDEO mode, watch the projection. Use `media.offset` to shift all subtitles earlier/later until they sit right, and the manual override (arrow/pedal) to re-sync any line live.

If the subtitles feel systematically late by a fixed amount, that's the reaction-lag — a single negative `offset` fixes the whole song at once.

> **Better-but-optional later:** make Record mode timestamp against `video.currentTime` (not its own clock) when a video is loaded, for lag-free capture. Skip it for now — Prompt B (forced alignment) supersedes manual capture entirely once the produced master exists.

## Notes

- **A unblocks everything** — merge it and pull before starting any other prompt.
- **Timeline indexing (from A):** the `timeline` array is parallel to the **full items array** (lyrics + section markers), not just lyric lines, and validates length against that total. C (capture) and D (cue-lookup) must index the same way — one timeline entry per item, markers included.
- **D is the payoff** but needs C and F merged first (cues + band geometry). Fastest path to the win: A → C → F → D.
- **D assets (verified 2026-06-19):** live at the Chango Pepper **root**, not in the repo — `animations/tragedia-de-cerdo-asado/` + `songs/`. Clean master = `Tragedia de Cerdo Asado.mp4` (89 MB, 159.5 s, no burned text); ignore the 22 GB `.mov` (too heavy) and the two "EN subtitles" exports (the old per-screen versions D replaces). `reference/` stills present. `docs/subtitle-format.md` restored 2026-06-19.
- **Asset path decision for D — DECIDED 2026-06-19 (`docs/media-assets.md`):** song JSON holds a logical `media.src` filename only; the absolute path lives in local app settings via a one-time file picker, with graceful "Locate video…" re-link. Delivery spec: MP4 H.264, ≤1080p, ~5–10 Mbps (audio kept but muted at play); warn on ProRes/large files. Big video masters stay out of git (outside the repo by design).
- **Tragedia JSON** is already v3-shaped (`title_translations` + `intro`) but has no `media`/`timeline` — that's step **D-wire**.
- **E and G survive the ASR shelving** — E covers fixed-tempo songs, G is the count-in; neither depends on voice-following.
- **B before the produced master = mechanism only.** Wire and sanity-check, but the real alignment pass runs against the produced master's time-locked vocal stem (late June), not the current `voice.mp3` (different take, didn't match).
- The full design rationale (the "why" behind each prompt) lived in `docs/auto-advance-and-video-sync.md`, also lost. I can rebuild that too from this chat if you want it back.
