# Projector test round — kickoff for Claude Code coordinator (2026-07-04)

**Setup under test:** Mac mini (control) + iPad via Sidecar (performer panel) + projector (audience). Live end-to-end. Jorge testing.

**Your job (coordinator):** triage each observation below into a root cause, spec TDD prompts, spawn Sonnet worktree subagents, PR on green per `/release`. These are Jorge's raw observations plus my (PM) hypotheses — verify before you build; don't trust my guesses over the code.

---

## Step 0 — Clear the decks first (do before any bug work)

The repo carries loose ends from the 2026-07-03 ASR spike + this session. Land these on `main` so the projector-test PRs start from a clean tree. The stale `.git/index.lock` has already been removed by Jorge.

1. **Commit the pending docs + gitignore to `main`** (one small docs commit, no code):
   - `docs/projector-test-2026-07-04-kickoff.md` (this file)
   - `docs/asr-following-spike-kickoff-2026-07-03.md`
   - `.gitignore` — now ignores `spike/` (the throwaway ASR-spike scratch dir).
2. **Preserve the ASR spike, then reclaim disk (part B of the 2026-07-03 extractor dispatch):**
   - Push the `spike/asr-following` branch to origin (preserve the report + reusable scripts; **no PR** — throwaway branch).
   - Confirm the report `docs/asr-spike-report-2026-07.md` and scripts are on that branch.
   - Then delete the local `spike/` working-tree folder (~1.1 GB: `asr_bench/.venv` + data). It's gitignored now, so this only frees disk — nothing tracked is lost.
   - Delete the stray `feat/timeline-import-button` branch if still present.

Once `main` is clean and green, proceed to the bug work below.

---

## A — Tragedia de cerdo asado, Video mode (screenshots 1 & 2)

**A1. Audience/Projection window shows the title card, not the video.**
On arm the projection window sat on the "Tragedia de cerdo asado / Tragedy of Roasted Pig" title+intro card and never showed the linked animation. Expected: the video plays full-frame in the audience window.
- Hypotheses to check: title/intro screen not advancing into the video after count-in; Projection `<video>` not receiving the `play`/`seek` transport broadcast (the localStorage transport channel from PR #20); or a `media://` resolve failure in the packaged/dev origin. Confirm which window actually holds the playing video.

**A2. Performer view shows "Cue 1 / 29" instead of the Spanish lyric line.**
The performer (control) window shows a cue counter where the current Spanish lyric should be. Expected: the active ES line, readable to the performer.
- Note: this is the same view we want restyled in A3/A4 — treat together.

## B — Performer view on iPad (screenshot 2)

**B1. Video is too big — crowds out the transport buttons.**
The full-frame video fills the iPad performer panel and leaves no room for Play/Pause/Restart/Unarm. Expected: video sized so the controls remain visible and reachable.

**B2. Lyrics on the performer view should be big and centered — same as non-video songs.**
Design decision from Jorge: for the performer panel, render the Spanish lyric using the **same big, centered format used for songs without video**. It's fine for it to **superimpose over the video** — overlap is acceptable, no separate band needed. This is the fix for A2 as well: performer sees a large centered ES line, over the (resized) video.

## C — Luz y sal, non-video song, Ready-to-Arm screen (screenshot 3)

**C1. Manual/Auto transitions toggle is missing.**
Jorge expected the toggle to advance lyrics by beat (Auto) vs manually (Manual). It isn't present on this screen. Per `project-context.md` the Projection column should carry a **Transitions (Manual/Auto)** control (with the Beat↔Auto dependency: beat OFF forces Manual). Confirm whether it's genuinely absent or just not on the Ready-to-Arm summary, and restore/expose it.

**C2. Projection label should read "Open" / "Closed" — not "Open, Big".**
For a song with no video, "Big"/"Small" is meaningless. The Projection summary shows "Open, Big"; for non-video songs it should collapse to just **Open** or **Closed**. Only show the display-format qualifier when the song actually has a linked video.

---

## Suggested build order
1. **A1** (video not reaching audience) — highest impact, blocks Video-mode performance. Likely unblocks the correct performer video too.
2. **B1 + B2 + A2** as one slice — performer-panel layout: resize video, big centered ES lyric superimposed, controls always visible.
3. **C2** — label logic (small, self-contained).
4. **C1** — confirm + restore the Manual/Auto toggle.

## Open design questions for Jorge (gate before building the layout slice)
- Performer panel: video shrunk to a small reference thumbnail with the lyric dominant, or video still large with the lyric overlaid on top? (B2 reads as "lyric dominant, video behind — overlap fine".)
- Any minimum video size the performer needs for the visual cue, or is the lyric the only thing that matters on that panel?

## Not in scope here (already known, don't re-triage)
- The shipped `tragedia-de-cerdo-asado.json` timeline is a misaligned ~17 s-late scaffold and must be regenerated via the extractor before Video-mode timing is trusted (per the 2026-07-03 ASR spike). A1 above is about the video not *appearing at all*, which is separate from timing.
