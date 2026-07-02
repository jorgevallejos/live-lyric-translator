# Performer-view polish — dispatch spec (2026-07-01, Round 3)

Paste into **Claude Code at the repo**, Opus as coordinator. Follows the autonomous batch pattern already used for A2→B→C. Two small tasks from Jorge's test of the merged batch (PRs #35–#38). Then Wave 2 P14.

---

## Run it with the fewest possible prompts (read first)

Jorge does **not** want to approve commands one-by-one. Set this session up so it runs unattended:

- **Launch in bypass mode.** Start Claude Code with **`claude --dangerously-skip-permissions`** (or, in the VS Code extension, keep the **auto-run / YOLO toggle ON** for this workspace — the mode Jorge already enabled). This is the only thing that reliably removes *all* prompts, because an allow-list will always miss some command. Reasonable here: it's Jorge's own repo, every change lands as a reviewable PR/commit, and git history is the undo. The `deny` list in `.claude/settings.json` (force-push, `reset --hard`, `clean -f`, `branch -D`, `commit --amend`, `rm -rf`, `sudo`) is the backstop — **do not run those.**
- **Also (belt and braces):** as step 0, append any command families you expect to use but that aren't yet in `permissions.allow` (e.g. `screencapture`, `sips`, `ffmpeg`, `chmod`, `open`, `defaults read`) to `.claude/settings.json`, commit as `chore(claude): broaden dev permissions`. This helps even if bypass mode is off later.
- **No mid-run check-ins.** Run Task 1 → Task 2 straight through. Gate = automated suite green + `tsc`/lint clean. Auto-merge each PR on green (Jorge pre-authorised). Only stop for a genuine blocker (can't get green, real design fork not covered here). Attach a performer-view screenshot to each PR for async review.

---

## Task 1 — Beat indicator: drive it from existing controls, remove the extra buttons

**Problem.** The A2.1 fix (PR #36) added a standalone **Start / Pause / Restart** trio (`control-beat-clock-controls`, App.tsx ~793–818) over the performer stage for non-video songs. Jorge doesn't want separate beat controls — they overlay the phrases (see screenshots for Luz y sal and Cerdo-in-`none`-mode). The beat indicator should be driven by the controls that already exist.

**Target behavior.**
- **Remove** the `control-beat-clock-controls` Start/Pause/Restart trio (and its wrapper styling) from the non-video performer view. **Keep the `BeatCircle` visual.**
- **Start trigger:**
  - Non-video song → the beat clock starts on the **first `Next`** press (the same press that reveals the first line). Subsequent `Next` presses just advance.
  - Video song → starts on **Start/Play** (video transport) — already handled in `VideoPerformancePanel`; leave as-is.
- **Pause:** only for **video** songs (tied to the video Pause) — no pause control in the non-video view.
- **Restart:** the existing bottom-bar **`Restart`** button also **restarts the beat clock** (wire `restartBeatClock()` into `handleRestart`).

**Implementation notes.** `useBeatClock` already exposes `start` / `pause` / `restart` / `playState` (App.tsx ~549–558) and no longer auto-starts on arm — so keep the hook, just call `startBeatClock()` from the first-Next path in `handleNext` (when `notStarted` / index goes -1 → 0) and `restartBeatClock()` from `handleRestart`, and delete the button trio + now-unused `beatPlayState`-driven disabled logic if nothing else uses it. Non-video no longer needs `pause`.

**Files.** `src/App.tsx` (remove trio ~793–818; wire start-on-first-Next + restart), `src/control.css` (drop the `control-beat-clock-*` styles), tests in `ControlView.test.tsx` (update: assert no standalone beat buttons; beat starts on first Next; Restart restarts the beat).

**Constraints.** TDD. Don't touch video-mode beat/transport. `tsc`/lint clean, suite green.

**Done-criteria.** No Start/Pause/Restart trio over the performer phrases; non-video beat indicator starts on first Next and restarts with the Restart button; video beat unchanged (starts on Play, pauses on Pause). Screenshot on the PR.

---

## Task 2 — Make the Projection toggle buttons ~2/3 size

**Problem.** After PR #38 the toggle row is compact, but the **buttons themselves** (not just the icons) are still large enough to compete with the primary column buttons (Setlist / Languages / Open / Arm) — see screenshot 1.

**Change.** Shrink the whole toggle buttons — both the 3-way display-size segmented control and the beat/timer icon button — to roughly **2/3 of their current size** (reduce button height/padding and the control's footprint, scaling the icons proportionally so they stay centered and legible). Keep them on the one row above `Open`, keep green = active / gray = inactive. The point is that the toggles clearly read as secondary to the four main column buttons.

**Files.** `src/control.css` (`ctrl-display-mode-seg`, `ctrl-display-mode-toggle`, `ctrl-icon-btn` / beat-toggle sizing), possibly minor `src/App.tsx` if inline sizing exists.

**Constraints.** Mostly CSS; keep toggle tests green. `tsc`/lint clean.

**Done-criteria.** Toggle buttons ~2/3 current size, still one row, still functional with green-active state; visibly subordinate to the main buttons. Screenshot on the PR.

---

## Queue

Task 1 → Task 2 (autonomous, auto-merge on green), then **Wave 2 P14** (`docs/wave2-kickoff-2026-07-01.md`).
