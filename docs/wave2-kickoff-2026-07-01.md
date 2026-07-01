# Wave 2 kickoff — Live Lyric Translator (paste into Claude Code, 2026-07-01)

Open **Claude Code at this repo** (`~/Chango Pepper/projects/live-lyric-translator-dev`) and paste this whole file. It carries the operating model, the verified resume state, the permission fix, and two bounded task specs. It is a project-specific companion to the portfolio `DAILY-KICKOFF.md` — same roles, pre-loaded for this project so we skip straight to dispatch.

---

## Your role (strict — from `WAYS-OF-WORKING.md`)

You (**Opus**) are the **coordinator / PM**. You frame, decompose, write specs, interpret results, and update memory. You **do not hand-code or run the grunt execution yourself** — you **delegate each build task to a Sonnet subagent** via the Agent tool with `isolation: worktree`, so tasks run on isolated copies and end **unmerged**. I (Jorge) give design input up front, then **review, user-test, and approve merges to `main`**. Merges and any outward-facing sends are mine. Follow the PR-based `/release` flow; no direct pushes to `main`.

Before dispatching, orient yourself: read `CLAUDE.md`, `WAYS-OF-WORKING.md`, this repo's root `CLAUDE.md`, and `project-context.md` (its **"Wave 2 resume state (2026-07-01)"** section is the source of truth for where we are).

---

## First: stop the constant permission prompts

**A. Persisted allow-list — ALREADY APPLIED (2026-07-01).** `.claude/settings.json` was broadened during the Cowork session; you don't need to re-add these. Listed here for the record (appended to `permissions.allow`, `deny` list untouched):

```jsonc
"Bash(npm:*)",
"Bash(npx:*)",
"Bash(node:*)",
"Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(wc:*)",
"Bash(pwd)", "Bash(which:*)", "Bash(echo:*)",
"Bash(grep:*)", "Bash(rg:*)", "Bash(find:*)",
"Bash(sed:*)", "Bash(awk:*)", "Bash(sort:*)", "Bash(uniq:*)", "Bash(diff:*)", "Bash(tree:*)",
"Bash(mkdir:*)", "Bash(cp:*)", "Bash(mv:*)", "Bash(touch:*)",
"Bash(git worktree:*)",
"Bash(git stash list)", "Bash(git stash show:*)", "Bash(git stash push:*)",
"Bash(git stash apply:*)", "Bash(git stash pop:*)",
"Bash(git remote:*)", "Bash(git config --get:*)", "Bash(git config --list)",
"Bash(git rev-list:*)", "Bash(git reflog:*)", "Bash(git cherry:*)", "Bash(git apply:*)",
"Edit(//Users/jorgevallejos/Chango Pepper/projects/live-lyric-translator-dev/**)",
"Write(//Users/jorgevallejos/Chango Pepper/projects/live-lyric-translator-dev/**)"
```

The existing `deny` list still blocks the dangerous ones (`git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`, `git commit --amend`, `rm -rf`, `sudo`). Note that `git stash drop`/`clear` are intentionally **not** allow-listed, so nothing silently discards the `stash@{0}` P14 work before Task A consumes it.

**B. Optional, for a heads-down build session,** turn on **auto-accept edits** (`shift`+`tab` toggles it) or launch with `--permission-mode acceptEdits`. That stops per-file edit prompts for the session without loosening the persisted config. Use `/permissions` to inspect/adjust live.

---

## Verified resume state (2026-07-01)

- Wave 1 merged: P12 (PR #31), P16 (PR #32).
- **P13 (3-way display toggle) is LANDED** — PR #33, tip of `main`.
- **P14 (Manual/Auto advance) is the open Wave 2 task.** No branch/PR. Scaffolding sits in **`stash@{0}` (`cowork-leaked-p13-p14-worktree-20260629`)**; the Auto **drive** is unbuilt.
- Repo is clean (lock cleared; leaked edits stashed). `main` has one uncommitted file, `.claude/settings.json` — it now includes both the 06-29 additions **and** the broadened Wave 2 permissions applied above. Commit it on its own (e.g. `chore(claude): broaden dev permissions`) before starting the tasks.

---

## Wave 2 — the two tasks

Dispatch as **two Sonnet worktree subagents**. They touch the **same region** of `src/App.tsx` (the Projection-column button cluster, ~lines 681–742) and `src/control.css`, so **do not run them in parallel** — sequence **Task 1 → Task 2** to avoid a merge conflict, and let Task 2's builder branch from `main` *after* Task 1 merges so the new Manual/Auto toggle inherits the restyled classes.

> Recommended order rationale: Task 1 is small, visual, and self-contained; landing it first establishes the shared "green = active" + smaller-button classes that Task 2's new toggle can reuse. If you'd rather cut one PR instead of two, they can be combined into a single worktree — your call as coordinator, but two clean PRs is the default.

### Task 1 — Projection-column toggle design refinement (do first)

**Objective.** Refine the Projection-column controls on the Setup screen so green is the single, consistent "active" signal and the toggles stop competing with the primary column buttons.

**Files/areas.** `src/App.tsx` (~lines 681–742: `ctrl-display-mode-toggle` segmented control + `ctrl-beat-indicator-toggle`), `src/control.css` (the `ctrl-display-mode-seg`, `ctrl-icon-btn`, `ctrl-beat-indicator-toggle` rules).

**Changes.**
1. **Reorder** the display-mode segmented toggle from `none → small → big` to **`small → big → none`**. Keep each button's behavior, `aria-label`, `aria-pressed`, and icon; only the DOM order changes. Defaults unchanged (default effective mode stays `small` for video songs).
2. **Consistent selection styling:** selected/active = **green**, unselected = **gray**, applied to **both** the segmented toggle and the beat-indicator toggle. Replace the current white-border "selected" style. Reuse the app's existing "active/linked" green token (the same green used for the linked-camera state / Arm affordance) rather than a new hex.
3. **Beat-indicator toggle icon → timer/metronome-style glyph.** Swap the circle SVG for a simple timer glyph in the existing hand-drawn SVG style. On/enabled = green; off/disabled = gray **with a strike-through** (mirror the current on/off SVG pattern). Behavior and `aria-label` ("Beat indicator") stay — this is not a new countdown feature, just a clearer icon.
4. **Slightly smaller toggles + tighter spacing** so they read as secondary to Setlist / Languages / Open / Arm. Calibrate the exact dimensions visually.

**Constraints.** TDD per repo convention (Red→Green→Refactor); update any snapshot/interaction tests for the reordered DOM and new classes. Keep `tsc`/lint clean. No schema or behavior changes. Full suite green.

**Done-criteria.** Segmented order is small/big/none; both toggles show green-when-active / gray-when-inactive; beat-indicator button shows the timer glyph (green on, gray+struck off); buttons visibly smaller/tighter; tests green; PR opened via `/release`, left for Jorge to review + merge.

**Gate for Jorge.** Exact green shade and final button size are for me to eyeball on screen/projector — surface a screenshot or a quick run so I can approve before merge.

### Task 2 — Prompt 14: finish Manual/Auto advance (do after Task 1 merges)

**Objective.** Land the Manual/Auto lyric-advance toggle **and** the Auto drive that actually advances cues off the beat clock — the substantive open Wave 2 feature.

**Starting point.** Inspect `stash@{0}` first (`git stash show -p stash@{0}`). It holds usable UI scaffolding: a `selectedAdvanceMode: 'manual' | 'auto'` state, the effective-mode logic (`default = auto when song has a non-empty timeline, else manual`), and a segmented control. **Cherry-pick what's good, but treat the Auto drive as unbuilt** — the stash explicitly defers it. Decide as builder whether to `git stash apply` and refactor onto the post-Task-1 code, or rebuild the toggle fresh TDD; either way the toggle must match Task 1's new green/size styling.

**Files/areas.** `src/App.tsx` (advance-mode state + wiring), `src/useBeatClock.ts` (the elapsed→cue-index drive), `src/VideoControlPanel.tsx` / `src/VideoPerformancePanel.tsx` as needed, plus a `*.test.ts(x)` per module.

**Behavior.**
- A **Manual / Auto** segmented toggle in the performer view, styled per Task 1. Default = **auto** when the song has a non-empty timeline, **manual** otherwise. Auto is only available when a timeline exists.
- **Manual mode:** unchanged — arrows / Bluetooth pedal advance; first lyric appears only on explicit Next; manual override always wins.
- **Auto mode:** drive the cue index from `useBeatClock`'s elapsed time mapped against the song `timeline` (cue-index lookup), advancing lines automatically. Manual Next/Prev still overrides. Respect the existing count-in → first-line (`begin`) handoff and the hook-stability gotcha (primitive deps; don't retear the interval — see repo `CLAUDE.md`).

**Constraints.** Strict TDD. Keep `tsc`/lint clean. Don't regress the video-mode clock (Video mode manages its own clock in `VideoPerformancePanel`). Full suite green.

**Done-criteria.** Toggle present and styled; Auto advances cues correctly against the timeline; Manual unchanged and always overrides; defaults correct; tests green; PR opened via `/release` for Jorge to review + merge.

**Gate for Jorge.** This needs a **projector / real-run test** before merge — after the PR is up, tell me exactly what to run to verify Auto tracks the timeline and Manual still overrides.

---

## After Wave 2

Per `project-context.md`: projector-test the toggles + Auto mode → Prompt 15 (layout) → **packaging** (`npm run pack` → `.dmg`; `media://` confirmed working packaged; `.dmg` blockers — icon, Apple cert, entitlements, notarization — already scoped). Deferred: offline forced alignment (Prompt B); ASR spike shelved.

When both PRs are merged and tested, update `project-context.md` (Wave 2 resume state → done) and the portfolio `current-priorities.md`.
