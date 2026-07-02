# Claude Code kickoff — PR #48 review findings (2026-07-02)

**Paste this whole file into Claude Code, opened at the lyric-translator repo, as the session kickoff.**

---

You are the **coordinator PM** for this session, following our established Ways of Working (`~/Chango Pepper/WAYS-OF-WORKING.md`): you frame and spec the work, spawn **Sonnet worktree subagents** to build under strict TDD (Red → Green → Refactor), interpret what they return, and bring me — Jorge — **design decisions and things to test**, not raw agent chatter. You do not hand-code the fixes yourself; you delegate to subagents in `isolation: worktree`, keep them unmerged, and follow the PR-based `/release` flow (`.claude/commands/release.md`) with the human checkpoints. Merges to `main` are mine to approve.

First, orient: read the repo `CLAUDE.md`, `~/Chango Pepper/projects/live-lyric-translator-dev/project-context.md` (esp. "Current build state (2026-07-02)"), and `~/Chango Pepper/WAYS-OF-WORKING.md`.

## Context

I'm reviewing **PR #48** (packaging P1, already merged to `main`). I'm **not** testing the packaging yet — I'm re-testing behaviour, and found two topics. Handle them as two independent worktree tasks.

---

## Topic 1 — Audience view stuck on the logo on first arm (BUG, most concerning)

**Symptom.** Almost always **the first time I launch the app and arm** a song (repro'd with "Tragedia de cerdo asado"), the **Projection (audience) window stays stuck on the Chango Pepper logo screen**. It should transition to the song's title/intro screen at arm, then show phrases on Play — but it keeps showing the logo. **If I unarm and arm again, the problem is gone.** Performer window is fine throughout; only the audience view is stuck.

**Strong hypothesis (confirm with a failing test before fixing — don't just patch to the theory).** The arm→projection signal is a **persisted localStorage flag that can't re-fire a storage event on an unchanged value**:

- `src/performanceState.ts` writes `KEY_ARMED_BROADCAST = 'liveLyricArmedBroadcast'` to `localStorage` as the constant `'1'` on arm, and removes it on unarm.
- `src/App.tsx` (Projection view, ~lines 1483–1521) sets `hasSeenArmedSinceMount` **only** from a `storage` event where `newValue === '1'`, and `showLogo = !hasSeenArmedSinceMount`.
- `localStorage` **persists across app launches**, and the `storage` event only fires when the value **actually changes**. So if `liveLyricArmedBroadcast` was left at `'1'` from a previous session, the first arm does `setItem('1')` over an existing `'1'` → **no storage event** → Projection never leaves the logo. Unarm removes the key; the next arm writes `'1'` over `null` → real change → event fires → works. This matches the "first time, then fine after re-arm" report exactly.

**Task for the subagent.**
1. **Red:** write a test that reproduces the stuck-logo case — i.e. `KEY_ARMED_BROADCAST` already `'1'` in localStorage at mount, then an arm occurs, and assert the Projection reveals the intro/title (leaves the logo). It should fail against current code.
2. **Green:** make arm reliably signal the Projection regardless of prior localStorage state. Prefer a robust signal over a constant flag — e.g. write a **changing value** (monotonic counter or timestamp/nonce) on every arm so the storage event always fires, and/or **clear the broadcast key on app startup** so launch state is clean. Consider whether the same class of stale-persisted-flag bug affects the end-card / display-mode / screen-size broadcasts and note it (don't scope-creep the fix unless trivial and covered by tests).
3. **Refactor + full suite green.** Attach before/after screenshots of the two-window arm on the cerdo song if the harness allows.

Flag to me any design choice in the signalling approach (counter vs. timestamp vs. startup-clear) — I want to understand the fix, not just receive it.

---

## Topic 2 — Simplify Big vs Small format to a font-size difference (DESIGN CHECK — verify feasibility first, then propose)

**What I realised.** The difference between **Small** and **Big** screen formats doesn't need to be a different *layout* — it can just be **font size**. In both formats the **video spans the whole screen** (full-frame `contain` with the subtitle superimposed, exactly the way **Big** already works today). **Small** would then be *the same full-frame layout* but with a **bigger subtitle font** — the larger size Small uses now. This drops the separate small-canvas geometry (75.8% scaled, centered, shifted-up video with the subtitle in a bottom black band).

**I'm asking you to check this before building.** Have a subagent investigate and report back:

- Current geometry lives in `src/displayProfile.ts`: `BIG_SCREEN_PRESET` (`videoScalePercent: 100`, `subtitlePosition: 'overlay-bottom'`) vs `SMALL_CANVAS_PRESET` (`videoScalePercent: 75.8`, `videoCenterYPercent ≈ 38.3`, `subtitlePosition: 'below-video'`, larger `subtitleFontPercent`). `computeProjectionLayout` + `VideoProjectionRegion.tsx` consume these; the toggle is `DisplayMode` in `src/screenSizeState.ts` / the Projection column in `App.tsx`.
- Confirm my model: **Small = Big's full-frame overlay layout + Small's current (larger) font**. So the only per-format difference becomes `subtitleFontPercent`; `videoScalePercent`, `videoCenterYPercent`, and `subtitlePosition` become identical (`100 / 50 / 'overlay-bottom'`).
- Assess: is this genuinely a simplification (less geometry, fewer branches), and does it break anything — non-video songs, the `'none'` mode, the Premiere reference proportions, or existing tests?

**Then propose, and gate to me.** Come back with a short recommendation: the exact `SMALL_CANVAS_PRESET` change, what code/tests get deleted or simplified, and any risk. **If it's clean and I approve**, have the subagent implement it under TDD (update `displayProfile.test.ts` and the projection-region tests, keep the suite green, screenshots of Small vs Big on the cerdo song). Don't merge without my sign-off on both the design and the diff.

---

## How to run it

Two independent worktree subagents (Topic 1 is a bug fix, Topic 2 starts as an investigation). Each ends with a **written report + proposed memory edits** (`project-context.md` "Current build state", repo `CLAUDE.md` if a convention crystallizes, e.g. a "storage-event / persisted-flag gotcha"). Surface back to me: the Topic 1 fix approach to understand, and the Topic 2 recommendation to approve — plus both things to user-test on the projector. No pushes to `main`; PRs via `/release`, I approve the merges.
