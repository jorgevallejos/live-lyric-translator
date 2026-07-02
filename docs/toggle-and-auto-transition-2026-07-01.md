# Toggle redesign + Auto-transition overhaul — dispatch spec (2026-07-01, Round 4)

Paste into **Claude Code at the repo**, Opus as coordinator. From Jorge's test of PR #41 (P14 Manual/Auto merged). Three releases, in order: **T1 (toggle area redesign) → T2 (Auto-transition behaviour) → T3 (beat↔auto dependency, separate, last).**

## Run mode (unchanged from Round 3)
Run in **bypass mode** (`claude --dangerously-skip-permissions`, or the VS Code auto-run toggle) so there are no per-command prompts; `deny` list is the backstop. Go T1 → T2 straight through, **auto-merge each on green** (tests + `tsc`/lint), screenshot on each PR for async review. **T3 is a separate PR after Jorge has seen T1+T2.** Only stop for a genuine blocker.

Current code anchors: toggle area is in `App.tsx` setup panel (~lines 720–815) + `src/control.css` (`.control-setup-buttons`, `.ctrl-display-mode-*`, `.ctrl-advance-mode-*`, `.ctrl-beat-indicator-toggle`, grid at `.control-setup-sections` ~line 192). Auto drive is `App.tsx` ~603–614 + `src/autoAdvanceState.ts` + `useBeatClock`. Video transport pattern to mirror: `src/VideoPerformancePanel.tsx` + `src/VideoProjectionRegion.tsx`.

---

## T1 — Toggle area redesign (fixed sizes, two labelled rows)

**Root cause of the resizing (items 1–2).** The toggle buttons/icons are sized in `em` (`.ctrl-display-mode-seg { font-size:0.75em; min-height:1.6em; padding:0.15em… }`), and the column font is fluid, so everything rescales with the window. Jorge uses this **full-size on an iPad Pro**, so switch the toggle cluster to **fixed px sizing**: fixed icon px, fixed button height, only the container may reflow width. A little window-shrink tolerance is fine; full-window fidelity is what matters.

**Target layout** (Projection column, when a video song is in `none` mode — show the subset that applies otherwise, see Conditional rows):

```
 Display format            ← tiny label
 [ small | big | none ]    ← 3-seg display-format toggle
 Transitions   Beat        ← two tiny labels, each above its control
 [man|auto]    ( ● )       ← transitions toggle  +  beat-indicator button
```

Requirements:
1. **Fixed icon size** — icons are a constant px size regardless of window (items 1, 2). Buttons may resize a little; icons do not.
2. **All toggle buttons share ONE fixed height** — the height the display-format toggle uses today. The beat-indicator button is currently taller; make it match (item 3).
3. **Two rows, grouped** (items 3, 5): row A = display-format toggle; row B = transitions toggle (left) + beat-indicator button (right). (Note: item 3 said beat-first, item 5 said transitions-first with labels — going with **transitions-left, beat-right** per the fuller item-5 description; trivial to flip if Jorge meant the other order.)
4. **Tiny labels** above each control (item 5): "Display format" above the format row; "Transitions" above the transitions toggle; "Beat indicator" above the beat button. Small, muted, same label styling as the column headers but smaller.
5. **Manual/Auto icons** (item 4): Manual = a capital **A with a small hand** glyph in the bottom-right corner; Auto = a capital **A with a small filled circle** in the bottom-right corner. Replace the current arrow/clock glyphs.
6. **Beat-indicator icon reverts to filled circle (on) / empty circle (off)** (item 6) — now that a "Beat indicator" label is present, the timer glyph isn't needed.
7. **Equal column widths** (item 7): revert `.control-setup-sections` `grid-template-columns` from `1fr 1fr 1.15fr 0.85fr` back to **four equal columns** so Song/Language/Projection/Arm match again.

**Conditional rows** (keep current gating logic, just restyled): show "Display format" row only for songs that have a video; show "Transitions" row only when the video isn't showing (`!showVideoPerformance`) and the song has a timeline; always show "Beat indicator" for songs with tempo. When a row is absent, don't leave a gap/label.

**Files.** `src/App.tsx` (toggle markup: labels, row grouping, new manual/auto + circle icons), `src/control.css` (fixed px sizing, two-row layout, label styles, equal grid). Update `ControlView.test.tsx`.

**Done-criteria.** Icons fixed size across window resizes; all toggle buttons equal height (= display-format height); two labelled rows as above; manual/auto A-glyphs; beat on/off = filled/empty circle; four equal columns. Screenshot at full iPad-Pro size on the PR.

---

## T2 — Auto transition should behave like a video (without the video)

**The core problem (screenshots 6–9):** In Auto mode the performer still gets the **manual Next/Previous** view while a background effect (`App.tsx` ~603) also drives the index off the beat clock — the two fight, so: wrong buttons on arm (SS6), pressing Next reveals line 1 immediately instead of waiting for the count-in (SS7), the views snap back to the armed/intro state after the count-in (SS8, the drive returns -1 before the first cue), and when a cue is finally due the performer shows it but the **audience stays black** (SS9, the projection isn't being driven).

**Target model:** **Auto mode = video mode with the beat clock as the clock instead of `<video>.currentTime`.** Mirror the `VideoPerformancePanel` / `VideoProjectionRegion` transport, driving cues from `songElapsedMs` via the existing `computeAutoAdvanceIndex`. Specifically, for a non-video song (or video song in `none`) with `effectiveAdvanceMode === 'auto'`:

1. **Arm** → performer view uses **Play / Pause / Restart** transport controls (like video), **not** Next/Previous (SS6 fix). Audience shows the **intro/title** screen (as it does on arm today).
2. **Press Play** → start the beat clock's **count-in**; the **audience view goes black** (SS-spec). The beat indicator shows the count-in.
3. **After the count-in bars** (use the song's `tempo.countInBars` — Jorge's "2 compases") the song "begins": `songElapsedMs` starts ticking from the `begin` handoff.
4. **When a cue's timeline time is reached**, display that phrase in **both** performer and audience (broadcast `setIndex` to the Projection window so it renders the lyric, not black — SS9 fix). Before the first cue, both stay black (not the armed/intro snap-back — SS8 fix).
5. **Pause** pauses the clock (and beat); **Restart** returns to the pre-Play state (intro on audience, clock reset). Keyboard/pedal manual override may remain as a silent safety (manual always wins), but there are **no on-screen Next/Previous** in Auto (Jorge: "you don't reason in terms of next or previous").

Implementation notes: reuse the count-in→begin handoff and the transport/broadcast plumbing already proven in Video mode; the difference is the clock source (`useBeatClock` elapsed vs `video.currentTime`) and that there's no `<video>` element — the audience is just black during count-in and between/around cues. Ensure the Projection window receives and renders the auto-driven `setIndex` (the SS9 audience-black bug is the projection not being updated in this path). Keep manual mode exactly as it is today.

**Files.** `src/App.tsx` (performer branch for auto: transport instead of Next/Prev; Play starts count-in; wire the auto-drive to broadcast to projection; audience black-until-first-cue), possibly a small shared transport hook/component extracted from `VideoPerformancePanel`, `src/autoAdvanceState.ts` if the pre-first-cue/-1 handling needs adjusting, `src/VideoProjectionRegion.tsx`/`ProjectionView` for the auto projection path. Tests: `ControlView.test.tsx`, `ProjectionView.test.tsx`, `autoAdvanceState.test.ts`.

**Constraints.** TDD. Don't regress Manual mode or real Video mode. `tsc`/lint clean, suite green.

**Done-criteria.** Auto arm shows Play/Pause/Restart + intro on audience; Play → count-in + audience black; after count-in bars the song runs; cues appear in both performer and audience at their times; no Next/Previous in Auto; Manual and Video modes unchanged. Screenshots of the arm → play → count-in → first-cue sequence on the PR.

**Assumptions flagged (proceed unless Jorge objects):** transitions-left/beat-right layout in T1; keyboard/pedal manual override stays available in Auto as a hidden safety.

---

## T3 — Beat ↔ Auto dependency (SEPARATE release, after T1+T2)

Item 8: **if the beat indicator is off, Auto transition can't work** (Auto is beat-clock-driven). Release this on its own after Jorge has reviewed T1+T2.

**Direction — decided by Jorge (2026-07-01): one-directional, "beat off disables Auto."** When **Beat indicator is OFF**, **disable the Auto option** in the Transitions toggle (greyed, not selectable) and force **Manual**; show a small hint (tooltip or a tiny link glyph between the two controls): "Auto needs the beat indicator on." Turning Beat back ON re-enables Auto (restores the song's default advance mode). **Selecting Auto does NOT change the beat** — no reverse coupling. Start with a quick screenshot proposal of the disabled/hint styling for Jorge's OK, then build.

---

## Queue
T1 → T2 (autonomous, auto-merge on green), then **T3** as a separate PR once Jorge has eyes on T1+T2.
