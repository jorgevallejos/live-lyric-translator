# Claude Code kickoff — Pregonero timeline v2

**Created:** 2026-08-13 · **Spec:** `projects/bombista/docs/bombista-product-backlog.md` §2 and §4
**Paste everything below the line into a fresh Claude Code session opened at the vault root.**

> **This workstream is the critical path.** Bombista is about to emit v2 timelines for the rest of the catalogue. Until these items land, no v2 timeline can be loaded into the app safely. Do this before, or alongside, the Bombista work — not after.

---

You are the **coordinator** for this piece of work. Read and decide, then delegate each item to a Sonnet subagent, review what comes back, keep the suite green. Escalate to me (Jorge) at the gates below.

## Context — read before doing anything

1. `projects/pregonero/docs/timeline-v2-contract.md` — **the shared contract with Bombista, which is being built in a parallel session right now.** Read this first. It fixes the envelope, the rounding rule, and a golden fixture you must accept exactly. Do not invent your own shape; if something there is wrong or insufficient, stop and raise it with Jorge rather than diverging.
2. `projects/bombista/docs/bombista-product-backlog.md` — **§2 "Timing model — lead-in separated from line timings" is the whole reason this work exists.** Read it properly before touching code.
3. `projects/pregonero/CLAUDE.md` and `project-context.md`.
4. `CLAUDE.md` at the vault root — standing rules.

**Two rules while both streams are in flight:** test against the golden fixture in the contract, **not** against the real song files — `songs/*.json` are still v1 on disk and stay that way until Bombista's migration runs. And **do not bump the vault-root submodule pointer**; commit and push inside `projects/pregonero` only, or the two sessions will collide at the umbrella repo.

Repo: `projects/pregonero` (its own repo, a submodule). Electron 41 + React 18 + TypeScript strict + Vite, Vitest. **656 tests currently pass — they must all still pass.**

## What changed upstream, in one paragraph

A timeline used to be absolute against an audio file: Libertad's first line started at 7.26 s because the master recording has a 7.26 s instrumental intro. From v2, timelines are **relative to a start cue** — line 0 always starts at `0.000`, and the seconds before the first sung word are banked in a separate `leadIn` field. What provides the cue depends on the song: for a song with an animation, the video is the clock and `leadIn` is applied; for a song without one, **Jorge provides the cue with the pedal**, so he can play an intro of any length live and trigger the words when he actually sings.

New envelope:

```json
{ "timelineVersion": 2,
  "leadIn": { "durationSec": 7.26, "source": "measured", "confidence": "low", "apply": false },
  "timeline": [ { "start": 0.00, "end": 5.84 }, … ] }
```

## Work items, in this order

### P3 — version guard (do this first, it is the safety net)
- Both load paths must check `timelineVersion`: `src/songState.ts::validateTimeline` and `src/setlistStore.ts::parseTimelineFromJsonText`.
- Missing or `!== 2` → reject with a clear user-facing message ("this timeline was made by an older Bombista — re-run the extractor"). Do not silently coerce.
- *Acceptance:* loading today's raw `songs/libertad.json` (v1, no version key) is refused with that message, on both the file path and the A+ import button.

### P4 — lyrics arrays carry sung lines only
- Ruling from upstream: no section markers, no meta entries in `lyrics`. Bombista has removed its `{0,0}` exemption; the app must not grow one.
- Keep `validateTimeline`'s monotonic check strict. Reject any `lyrics` entry that is not a language-keyed object, with an error naming the index.
- *Acceptance:* a song file with a `[Estribillo]`-style entry fails to load with a message naming the index. No existing song is affected — verified 2026-08-13, none have markers.

### P2 — apply `leadIn` in Video mode
- When the song has `media.type == "video"` and `leadIn.apply` is true, offset the timeline by `leadIn.durationSec` from video start.
- *Acceptance — this is the important one:* after Bombista's migration (B13), **Tragedia must behave on screen exactly as it does today.** Same lines, same moments. The migration subtracted 0.96 s from every entry and banked it in `leadIn`; applying it back must reproduce current behaviour precisely. If Tragedia drifts, the round-trip is broken — stop and tell me.

### P1 — start-on-cue for Auto mode (the main event)
- For songs without an animation, the timeline clock must **not** start on play. It starts on the first pedal press / advance action: that press displays line 0 and starts the clock; from there lines advance automatically against the timeline.
- Relevant code: `beatScheduler.ts`, `performanceControlStateMachine.ts`, and wherever Auto mode currently drives its own clock. Read them before proposing a design — come back to me with the approach before implementing if the state machine needs restructuring.
- Manual + pedal must remain available as the fallback for every song; this adds a mode, it does not replace one.
- *Acceptance:* with Libertad's migrated v2 timeline in Auto mode — pressing play advances nothing; the first pedal press shows line 0 and starts the clock; line 1 appears 5.84 s later without further input.

## Known limitation — do not try to solve it here
This changes where the timeline *starts*, not tempo drift within the song. Auto mode still assumes Jorge performs at the recording's tempo. That limitation is already documented and out of scope.

## Gates for me
1. After P3 + P4: show me the rejection messages for a v1 file and for a marker-carrying file.
2. Before P1 implementation: if the state machine needs restructuring, show me the approach first.
3. After P2: I want to watch Tragedia end to end and confirm nothing moved.
4. After P1: I want to test Libertad with the pedal myself.

## Out of scope
Bombista items (`projects/bombista`) — separate kickoff.
Signed/notarized build, Windows support, chords toggle, native iPad — unrelated backlog.

## Finishing
Commit inside `projects/pregonero` and push. **Stop there** — do not touch the vault root. Jorge bumps the umbrella pointer himself once both parallel streams are merged.

No need to rebuild the `.dmg` for this round — I'll test from dev.
