# Auto cue-sync fix + Manual Start button + icon — dispatch (2026-07-01, Round 5)

Paste into **Claude Code at the repo**, Opus coordinator. From Jorge's test of PR #43 (T1+T2 merged). Three items here, then **T3 (beat↔auto dependency) still pending** as its own release.

## Run mode
Bypass mode (`claude --dangerously-skip-permissions` / VS Code auto-run), no per-command prompts, `deny` list is the backstop. Run R1 → R2 → R3 straight through, **auto-merge each on green**, screenshot per PR. R1 is a correctness bug — do it first.

---

## R1 — Auto mode: audience stays black when the first lyric is due (BUG)

**Symptom.** In Auto, playback is fine until the lyrics start: the **performer** view shows the phrase, but the **audience** view stays black. (Manual mode shows the phrase on the audience correctly.)

**Diagnosis (from the code).** T2 added an `autoBlackout` flag (`src/autoBlackout.ts`, `setAutoBlackout`): on Play the audience blacks out for the count-in, and the Projection reads it as `performanceBlackout`, which suppresses the intro while `index === -1`. Two things to check — the second is the likely culprit:
- `performanceBlackout` only gates `showIntroScreen` (App.tsx ~1430); the lyric renders on `showContent = hasSeenArmedSinceMount && index >= 0 && !blank && !isSectionMarker` (~1431), which is independent of blackout. So a lyric *should* show once the Projection's `index >= 0`.
- **Therefore the Projection's `index` is likely never advancing to ≥0 in Auto.** The auto-drive effect (App.tsx ~603) does `applyCommand('setIndex', target)` (updates the **Control** window → performer sees it) **and** `sendCommandWithState('setIndex', target, …)` (should update the **Projection**). Manual `Next` uses the same pair and *works on the audience*, so **compare the two paths**: why does the auto effect's broadcast not land on the Projection while `handleNext`'s does? Suspects: the effect's ref-wrapped `sendCommandWithState` not actually sending, a different 3rd-arg/state shape the Projection ignores, or `autoBlackout` staying true and interacting with `blank`.

**Fix.** Make the auto-driven cue update the Projection exactly like manual `Next` does, so the audience flips from black to the lyric when the first cue is due. Ensure `autoBlackout` is scoped to **pre-first-cue only** (black during count-in and before cue 0; cleared/overridden the moment a real cue index ≥0 is shown), not left on for the whole song. Keep the count-in blackout behaviour Jorge liked.

**Repro/verify.** Cerdo in Auto, `none` display: Arm → Play → count-in (audience black) → at the first cue time the phrase must appear on **both** performer and audience. Watch the Projection window's `index` / `showContent` / `performanceBlackout` in devtools to confirm. Add a test that a simulated auto-advance to index 0 makes the Projection render the lyric (not black).

**Files.** `src/App.tsx` (auto-drive broadcast ~603; blackout scope), `src/autoBlackout.ts`, `ProjectionView.test.tsx`, `autoAdvanceState.test.ts`.

---

## R2 — Manual mode: a Start step so the count-in runs before the first lyric

**Need (important for performing).** Today the beat indicator starts on the first `Next`, which is the same press that reveals line 1 — so Jorge can't catch the tempo before singing. He wants a count-in **bar before** the first lyric.

**Target flow** (manual, non-video, song has tempo + beat indicator ON):
- **After arm:** bottom bar = `Previous` (disabled), `Next` (disabled), **`Start`** (this is the existing Restart button relabelled), `Unarm`.
- **Click `Start`** → the count-in / beat clock begins. The button becomes **`Restart`**; `Previous` and `Next` become **enabled**. No lyric yet.
- **Click `Next` (first time)** → the first lyric phrase appears (beat is already running, so the performer entered on tempo). Subsequent Next/Previous behave as now.
- **`Restart`** → resets to the pre-Start state (beat reset, index -1, Next/Previous disabled, button back to `Start`).

This **supersedes** the Round-3 "beat starts on first Next" for manual mode — beat now starts on the explicit `Start`. Mirrors Auto's Play→count-in mental model.

**Edge:** if the **beat indicator is OFF** or the song has **no tempo**, there's no count-in to pre-run — keep today's behaviour (no Start step; `Next` immediately reveals line 1, Next enabled from arm).

**Files.** `src/App.tsx` (manual performer bottom bar: relabel Restart→Start pre-start, enable/disable Next/Prev on start, wire Start to `startBeatClock`, Restart to reset), `src/control.css` if needed, `ControlView.test.tsx`.

---

## R3 — Clearer "Manual" transition icon

The Auto/Manual toggle is good, but the **Manual = "A + hand"** glyph reads unclearly (the hand). Replace it with a clearer manual metaphor while keeping the pair legible against **Auto = "A + filled circle"**. Options to try (pick the clearest at full iPad-Pro size, screenshot for Jorge): a clearer **tap/pointing-finger** glyph, a **hand-with-extended-finger**, or drop the "A" and use a simple **finger-tap vs. auto-circle** pair. Keep it monochrome/line style consistent with the other toggle icons.

**Files.** `src/App.tsx` (the manual toggle SVG ~782), tests unaffected.

---

## Still pending after R1–R3

- **T3 — Beat↔Auto dependency** (`docs/toggle-and-auto-transition-2026-07-01.md`): beat OFF disables Auto + forces Manual + small hint (one-directional, decided). Separate PR, starts with a screenshot proposal.

## Queue
R1 → R2 → R3 (autonomous, auto-merge on green), then T3.
