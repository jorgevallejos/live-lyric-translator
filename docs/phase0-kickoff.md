# Phase 0 Kickoff — Auto-advance research spike

**Status:** Ready to start
**Model:** Sonnet (build-and-iterate work)
**Prerequisite:** Read `docs/auto-advance-proposal.md` first — this document assumes you've read Section 9 of that proposal in particular.

---

## One-sentence goal

Validate that template-based DTW over MFCC features can reliably distinguish adjacent phrases of a known song (Pimiento) sung in Jorge's voice.

## Why this exists (30-second version)

The auto-advance feature's whole architecture rests on one assumption: that a small computer can reliably tell "which phrase am I singing right now?" when it has a rehearsal recording of the same song to compare against. Phase 0 is a cheap, throwaway experiment that checks that assumption before any integration work happens. Green light → proceed to Phase 1 (pure Listener module inside the app). Red light → regroup with Jorge before building anything.

## Inputs that already exist

- **Proposal:** `docs/auto-advance-proposal.md` — full PM-level argument. Phase 0 is defined in Section 9.
- **Audio files:** `~/Chango Pepper/audio-templates/pimiento/`
  - `reference-2026-04-22.m4a` — take #1. Will be segmented into phrase-aligned templates.
  - `test-2026-04-22.m4a` — take #2. The "live" signal scored against the templates.
- **Song structure:** Pimiento's JSON in the existing song library. The phrase sequence from that JSON is authoritative.

## Constraints and scope

- **Throwaway spike.** Code lives outside the app's runtime — something like `scripts/phase0-spike/` or its own sandbox folder. No imports from the app's Listener architecture. No UI. No integration.
- **Time-box: one focused session.** If it's dragging, stop and regroup.
- **Audio format: m4a (AAC).** Decode via `ffmpeg` or a library that handles it (Python `librosa`, Node `node-ffmpeg`, etc.). Jorge's iPhone didn't capture lossless — this is deliberate and acceptable for Phase 0 validation.
- **Signal content.** Both recordings are voice + guitar mixed (single iPhone mic). Production templates will eventually need voice-only captured through Jorge's live SM58 rig, but that's a Phase 2 problem. Do not attempt source separation in this spike.
- **Language.** TypeScript is the repo default, but Python is acceptable here if it makes the audio stack ergonomics massively easier (librosa, numpy, scipy). Pick whichever gets results faster — this code isn't shipping.

## What to build

A small harness that:

1. Loads `reference-2026-04-22.m4a` and segments it into phrase-aligned clips using Pimiento's known phrase sequence. First pass: silence detection between phrases. Expose the detected boundaries so Jorge can eyeball and nudge them if needed.
2. Converts each phrase clip into MFCC features.
3. Loads `test-2026-04-22.m4a` and streams it through the same MFCC pipeline.
4. For each point in the test stream, scores DTW distance against templates for phrase *i*, *i+1*, and *i+2*.
5. Produces a plot (or clear printout) of scores over time, labeled by phrase index, so it's visually obvious whether phrases "hand off" cleanly.

## Go / No-Go criteria

**Green light:** While Jorge sings phrase 1, phrase 1's template scores best. As he transitions into phrase 2, phrase 2's score takes over cleanly. The transitions look like hand-offs, not blurred overlaps. Scores for non-adjacent phrases stay low.

**Red light:** Scores are muddy, adjacent phrases are indistinguishable, or scoring is unstable within a single phrase.

A green light authorizes Phase 1 (pure Listener module inside the app, with full unit tests, following the TDD pattern of `navigationState.ts`). A red light means regrouping with Jorge before investing further — probably shifting to plan B (on-device ASR).

## Jorge's working style

- Non-developer: define what to build, validate results, doesn't write code.
- Concise prose over heavy formatting in explanations and debriefs.
- Wants the *why*, not just the *how* — trade-offs surfaced, decisions justified.
- TDD discipline is normal for this repo, but the bar is lower for a spike: don't over-engineer. We are learning, not shipping.

## First message to Claude Code

Something like:

> Read `docs/phase0-kickoff.md` and `docs/auto-advance-proposal.md`. Then propose a plan for the spike — file layout, dependencies, approach — before writing any code. I'll confirm before you start.
