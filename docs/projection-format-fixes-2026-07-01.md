# Projection-format fixes — dispatch spec (2026-07-01)

Surfaced from Jorge's projector test of PR #34 (Task 1 toggle refinement). Framed by Opus in Cowork, to be **dispatched from Claude Code on the Mac** as Sonnet worktree subagents. Follow `WAYS-OF-WORKING.md` and the repo `/release` flow.

**Status:** Task A (non-video audience layout) **merged**, but Jorge's follow-up test found 3 issues → **Task A2** below. Remaining order: **A2 (view-logic fixes) → B (video format) → C (toggle layout)**, then Wave 2 P14. All touch `src/App.tsx` / `VideoProjectionRegion.tsx`, so run **sequentially**, each branched from the freshly-merged `main`.

### Run mode — autonomous batch, no mid-run test gates (Jorge, 2026-07-01)

Jorge wants A2 + B + C run **without pausing for him to hand-test between tasks**, to save time (Wave 2 P14 still follows). So, coordinator:

- Run A2 → B → C **straight through**. **Do not stop to ask Jorge to test on the projector between tasks.** The gate between tasks is the **automated suite going green** (+ `tsc`/lint clean), not a human check.
- Only pause mid-run for a **genuine blocker** (suite can't be made green, an ambiguous design fork not covered by these specs, or a merge conflict needing judgment) — not for routine verification.
- For each task, **capture verification screenshots** (run the app in single-screen mode `npm run dev:single`, or a headless capture, for both the performer and projection windows across the relevant songs/modes) and attach them to the PR so Jorge reviews **asynchronously, all at the end**.
- **Merge policy for this batch (Jorge pre-authorised, 2026-07-01): auto-merge on green.** Open a PR per task via `/release` and **merge it once its automated suite is green + `tsc`/lint clean + screenshots captured** — no waiting for Jorge. Land A2 → B → C in order so each branches from the latest `main`. Jorge reviews the merged results + screenshots after the fact and can revert anything. This is a deliberate, batch-scoped relaxation of the normal human-gated-merge guardrail. Standard destructive protections (the `deny` list) still apply; do not force-push or rewrite `main` history.

The deterministic numbers in Task B and the concrete fixes in A2 are what make an unattended run safe here.

Prerequisite context for whoever builds these:
- Video linked in `songs/tragedia-de-cerdo-asado.json` is `tragedia-de-cerdo-asado.mp4`, native **1920×1280 = 3:2 (1.5:1)**, clean master (app composites its own subtitle).
- Reference stills: `~/Chango Pepper/animations/tragedia-de-cerdo-asado/reference/Audience projection - big screen.png` and `... - small screen 130x100.png`. Match these **proportionally**.
- Projection rendering lives in `src/App.tsx` `ProjectionView()` (~line 1158) + `src/VideoProjectionRegion.tsx` + `src/displayProfile.ts`. Layout math is `computeProjectionLayout()`.

---

## Task A — Fix the non-video layout regression ✅ MERGED (PR after #34)

> Done. Non-video audience layout re-centered. The three issues below (Task A2) are the follow-ups from testing it.

**Problem.** Songs **without** a video (title/intro screens and plain lyric phrases) now inherit the video song's split layout — content is pinned into a top "animation region" + bottom "subtitle band" instead of being centered. Title screens should be **centered in the full screen**; lyric phrases should be **centered, small format**. This regressed the good behavior of earlier versions.

**Root cause (found via git).** Commit **`e77a882` "feat(projectionView): split screen into animation region + subtitle band" (2026-06-19)** replaced the previously-centered non-video `ProjectionView` layout with the animation-region + subtitle-band split, and that split now applies to non-video songs too. In the parent commit `e77a882^`, the `projection-screen` used `alignItems: center; justifyContent: center` (everything centered full-screen), the intro screen was centered, and the lyric was centered — that is the target behavior to recover.

**Fix.** Gate the split layout to the **video composite path only**. For non-video songs, restore the centered full-screen layout: title/intro block centered on the whole screen, and lyric phrases centered (small format), matching `e77a882^`. Keep the video path (`showVideoProjection`) exactly as-is. Reference `git show e77a882^:src/App.tsx` for the pre-regression non-video render; port it back without disturbing the video branch, end-card branch, logo fade, or the arm/hasSeenArmed logic.

**Files.** `src/App.tsx` (`ProjectionView` non-video return, ~lines 1414–1512). Possibly `src/control.css` for the centered lyric/intro styling.

**Constraints.** TDD; update `ProjectionView.test.tsx`. Don't touch the video branch or `VideoProjectionRegion`. `tsc`/lint clean, full suite green.

**Done-criteria.** Non-video title screen renders centered on the full screen (see 4th screenshot target); non-video lyric phrases render centered and small (5th screenshot target); video songs unchanged; tests green; PR via `/release`.

**Gate for Jorge.** Projector/screen check that title + lyrics are centered again for a non-video song.

---

## Task A2 — Video/non-video view consistency (do first; correctness)

Three issues from Jorge's test of Task A. **Common root cause for #2 and #3:** the code branches on `isVideoMode` (does the song *have* a video) instead of on whether the video is *actually being shown* (`isVideoMode && effectiveDisplayMode !== 'none'`). #1 is a data gap, not code.

**A2.1 — Beat indicator missing in the performer view for non-video songs (CODE BUG).** Confirmed on **Luz y sal**, which *has* tempo (`{ bpm:140, numerator:3, denominator:4, countInBars:1 }`, no media) and still shows **no** performer beat indicator — so this is **not** the earlier "no tempo" theory. The performer `BeatCircle` (App.tsx ~784) renders when `songTempo && beatIndicatorOn && phase`, and `getBeatPhase` never returns null once the clock runs, so for an armed non-video song with tempo the circle *should* be visible and persist. It isn't. **Investigate + fix** — likely one of:
  - (a) `useBeatClock` isn't actually starting/ticking when `isActive = showArmedShell && !isVideoMode` (effect deps / cleanup resetting it, so `beatPhase` stays null);
  - (b) `beatIndicatorOn` is false at runtime (default is `true` at line 262 — check PR #34 didn't regress it);
  - (c) `currentLibrarySong?.tempo` is `undefined` at runtime in the performer (e.g. `getLibrarySongById` returning an object without `tempo`, or a stale/other song object), even though the JSON has it;
  - (d) it renders but is invisible/off-stage (CSS: `position:absolute; bottom/left:0.75rem` inside `control-performing-stage`, z-index, or black-on-black).
  Reproduce with **Luz y sal** (has tempo) in the running app + devtools; fix so an armed non-video song shows a working, visible beat indicator. **Likely-intended UX to align with (D-wire note):** non-video beat is meant to have **Start/Pause/Restart decoupled from Next** so the count-in can be (re)triggered — if that control is missing, add/repair it as part of this fix rather than free-running the clock silently from arm time. Add/repair tests so the regression can't recur.
  - *Secondary (data):* **Libertad** has no `tempo` block at all, so it will still show no beat until Jorge supplies one — that's expected and separate from this bug. Not blocking.

**A2.2 — Video song in `none` display mode shows the video performer UI.** For a song that *has* a video but is armed with display mode `none`, the performer view should be the **normal manual/non-video flow** (singing-language text, advance by Next/pedal), not `VideoPerformancePanel`. Currently the performer view branches on `isVideoMode` (App.tsx ~lines 545, 770, 781, 872), so a video song always gets the video panel regardless of mode. **Fix:** introduce `const showVideoPerformance = isVideoMode && effectiveDisplayMode !== 'none'` and use it in place of `isVideoMode` for: the beat-clock active condition (~545), the `VideoPerformancePanel` render (~770), the non-video performer panel (~781), and the trailing `!isVideoMode` block (~872). In `none` mode the song then behaves exactly like a non-video song for the performer. (The audience `ProjectionView` already handles `none` correctly via `showVideoProjection` — that's why arrow-right already advanced the audience view.)

**A2.3 — Intro/title screen lost in video mode.** The title/intro screen (screenshot: "Tragedia de cerdo asado / Fight your destiny…") should show **on arm in every mode**, and in video mode **disappear when Play is pressed**. Currently `ProjectionView` early-returns `<VideoProjectionRegion>` when `showVideoProjection` (App.tsx ~line 1360), *before* the intro-screen block (~1442), so the intro never shows in video mode. **Fix:** render the intro screen in the video path too, shown while the video hasn't started and hidden once it plays. `VideoProjectionRegion` already tracks `hasStarted` and paints a `!hasStarted` black cover (~lines 164–169) — render the intro content inside/over that cover (pass `showIntroScreen` + the song's title/translated-title/intro into `VideoProjectionRegion`, or lift the pre-play overlay up a level). Reuse the existing `projection-intro-*` markup/styles so it matches the non-video intro exactly. It should fade/hide on the first `play` transport command (when `hasStarted` flips true).

**Files.** `src/App.tsx` (`showVideoPerformance` derivation + performer branches; passing intro props into the video path), `src/VideoProjectionRegion.tsx` (pre-play intro overlay), `songs/libertad*.json` (A2.1 data, pending Jorge's tempo). Update `ControlView.test.tsx` / `ProjectionView.test.tsx` / `VideoProjectionRegion.test.tsx`.

**Constraints.** TDD. Don't disturb Task A's non-video layout, the video timing/transport channels, or the arm/`hasSeenArmedSinceMount` logic. `tsc`/lint clean, suite green.

**Done-criteria.** (A2.1) an armed non-video song **with tempo (test: Luz y sal)** shows a working, visible performer beat indicator; (A2.2) a video song in `none` mode gives the manual non-video performer UI + advances the audience by Next; (A2.3) the intro screen shows on arm in both non-video and video modes and disappears on Play in video mode. Tests green; screenshots attached to the PR for async review.

**Not blocking.** The A2.1 fix is verifiable with Luz y sal (already has tempo), so **the autonomous run does not wait on Jorge.** Libertad getting its own beat is a separate data add — Jorge can drop its tempo `{ bpm, numerator, denominator, countInBars }` in later (or say "leave it beat-less").

---

## Task B — Video big/small rendering to match the reference stills

**Problem.** In Video mode the composited output doesn't match the reference proportions. Current `VideoProjectionRegion` always uses `object-fit: contain` inside a fixed band split (big = 13% band, small = 28% band), so **Big** doesn't fill the screen and **Small** doesn't hold the reference's video-vs-lyric proportions.

**Reference frame (source of all numbers below).** Both formats are exported from one Premiere sequence, **4752×3168 = 3:2**, matching the clean master mp4 (1920×1280 = 3:2). Treat the projection area as this **3:2 frame** (`object-fit: contain` the video into the actual screen; letterbox only if the projector isn't 3:2). Because everything below is expressed as **percentages of the 3:2 frame**, it's resolution-independent — no projector AR needed. The app composites over the clean master, so it must **replicate the Premiere transforms in CSS** (the exported small-screen .mov bakes them in; the app can't use that file because it needs to composite its own translated subtitle).

**Target — Big format** (`big-screen` profile) — *simplified per Jorge*: the clean video fills the frame at its native **3:2** rate (`object-fit: contain` to the screen — fills a 3:2 projector edge-to-edge, letterboxes otherwise). **No crop, no band split, no upward nudge.** The subtitle is **superimposed over the video**, bottom-centered. Match `Audience projection - big screen.png` (screenshot "like a king of Rome.").
- Subtitle font: EB Garamond SemiBold, **118 / 3168 ≈ 3.73% of frame height**, white, centered, anchored near the bottom (small bottom margin ~4–5% of frame height — calibrate to the reference).

**Target — Small format** (`small-canvas` profile): replicate the Premiere Motion transform (screenshot 3) on the clean video:
- **Uniform scale 75.8%** of the frame (video keeps 3:2).
- **Horizontally centered** (Premiere position x = 2364 vs frame centre 2376 → treat as centered).
- **Shifted up:** video centre at y = 1213.4 / 3168 = **38.3% of frame height** (equivalently: top edge ≈ 0.4% from the top; bottom edge ≈ 76.2%), leaving the **bottom ~23.8%** black area for the lyric.
- Black background everywhere outside the video box.
- Subtitle **centered in the bottom black area**, EB Garamond SemiBold, **160 / 3168 ≈ 5.05% of frame height**, white.
- Match `Audience projection - small screen 130x100.png`.

Derived small-screen box (fractions of the 3:2 frame): width 75.8%, height 75.8%, left margin ≈ 11.85%, right ≈ 12.35%, top ≈ 0.4%, bottom edge ≈ 76.2%.

**Enforceability:** with Jorge's simplification both formats are now **fully deterministic** — no cropping, no projector-AR dependency. Font sizes and positions are fixed fractions of the 3:2 frame.

**Font family note.** Confirm the app's `projection-lyric` uses **EB Garamond** (SemiBold) to match Premiere; if not currently loaded, add/bundle it. Check `docs/subtitle-format.md` for the existing subtitle styling spec and reconcile.

**Files.** `src/VideoProjectionRegion.tsx` (compositing: big = contained full-frame video + overlaid subtitle; small = 75.8% scaled, centered, shifted-up video + subtitle in bottom band), `src/displayProfile.ts` (encode the per-profile numbers above — scale %, vertical offset %, font % of frame height — instead of the current bandPercent/textScale split). Update `VideoProjectionRegion.test.tsx` / `displayProfile.test.ts` with the new numbers.

**Constraints.** TDD. Keep the subtitle-timing logic (`videoCueLookup`, `timeupdate`, offset/trimStart) and the transport/seek channels untouched — this is a **layout/compositing** change only. `tsc`/lint clean, suite green.

**Done-criteria.** Big = 3:2 video filling the screen with the subtitle superimposed bottom-centre; Small = 75.8% centered, shifted-up video with the subtitle centered in the bottom band; fonts at 3.73% (big) / 5.05% (small) of frame height; both matching the reference stills; timing/transport unchanged; tests green; PR via `/release`.

**Gate for Jorge.** Projector check of both formats against the reference stills; fine-tune only the big-screen subtitle bottom margin if needed.

---

## Task C — Toggles in one row + smaller (Projection column)

**Problem.** After Task 1 the size toggle (3-way) and the beat/timer toggle still read too large and stack on two rows, competing with the primary column buttons.

**Change.** Put the 3-way display-size segmented control **and** the beat/timer toggle **on the same single row** (4 controls inline), above the `Open` button, and make them smaller — being in one compact row reinforces their secondary status. If horizontal room is tight, make the **Arm column slightly narrower** to give the Projection column more width. Keep green = active / gray = inactive and all behavior from PR #34.

**Files.** `src/App.tsx` (Projection-column button cluster, ~lines 681–742), `src/control.css` (segmented + icon button sizing; the 4-column setup grid widths for the Arm-column narrowing).

**Constraints.** TDD where behavior is asserted (the design-mode/beat toggles have tests — keep them green); this is mostly layout/CSS. `tsc`/lint clean, suite green.

**Done-criteria.** Size toggle + beat/timer toggle on one row, visibly smaller; Projection column not crowded (Arm column narrowed if needed); toggles still function and show green-when-active; tests green; PR via `/release`.

**Gate for Jorge.** Eyeball the row sizing/balance on screen.

---

## Queue note

Run order: **A2 → B → C** (autonomous, per the run-mode block up top), then **Wave 2 P14** (Manual/Auto Auto-drive, `docs/wave2-kickoff-2026-07-01.md`). Task A is already merged.
