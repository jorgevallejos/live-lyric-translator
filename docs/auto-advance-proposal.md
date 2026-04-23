# Auto-advance proposal — live lyric tracking from mic audio

**Status:** Draft for PM review — not yet a build spec
**Author:** Jorge (with Claude Opus)
**Date:** 2026-04-22
**Related:** `navigation-extraction-phase1.md`, `CLAUDE.md`, `project-context.md`

---

## 1. Problem, in one line

The pedal works, but it costs attention. I want the app to follow my position in a known song and advance the translation on its own — with the pedal kept as the safety override, never removed.

Three things push me here: cognitive load during performance, timing mismatch risk, and the need to delegate the pedal to my daughter today (which doesn't scale and isn't how I want to perform long-term).

## 2. Goals and non-goals

**What this is:** position tracking inside a *known* song. The app already has the full phrase sequence and all translations loaded; it only needs to know "which phrase am I singing right now?"

**What this is not:**

- Not general speech recognition.
- Not singing-to-text transcription.
- Not tempo prediction or rhythm detection.
- Not a replacement for the pedal. The pedal is the safety override, always on, always authoritative.

Framing this narrowly is the whole reason the feature is realistic. A streaming ASR that can transcribe arbitrary sung Spanish in real time, on-device, is hard. A system that answers "does the next ~3 seconds of audio look more like phrase *i+1* than phrase *i*?" is tractable.

## 3. Proposed architecture

A new **Listener** subsystem that runs alongside the existing manual navigation and emits the same `next` command the pedal does. Conceptually it's a third input source on par with keyboard and pedal:

```
Keyboard ──┐
Pedal   ───┼──► applyCommand('next' | 'prev' | ...) ──► navigationState
Listener ──┘         (existing pure function)
```

Internally the Listener has four stages:

1. **Audio ingest** — live mic capture from the audio interface.
2. **Feature extraction** — reduce raw audio to a phonetic/acoustic representation cheap enough to match against in real time.
3. **Matching engine** — score the current stream against a *constrained set* of candidate phrases (current, next, maybe next+1). Only these, never the full song.
4. **Decision logic** — advance only when confidence is high *and* stable for a short window, and only forward.

The Listener never writes directly to `songState`. It calls the same public command surface the pedal uses. This keeps the existing state machine and WebSocket bridge untouched, and it means the Listener can fail silent without corrupting anything — the worst case is "it didn't advance," and the pedal picks up the slack.

## 4. The matching approach — template-based, not ASR-based

This is the load-bearing design decision. There are three plausible paths:

| Approach | How it works | Trade-offs |
|---|---|---|
| **(a) Template DTW** (recommended) | Capture a rehearsal recording per song. Segment it into phrases. At performance time, match live audio against the next 1–2 phrase templates using Dynamic Time Warping over phonetic features (MFCC or log-mel). | Robust to singing, accent, vibrato. Trained on *your* voice in *your* key. Needs a rehearsal capture step. Won't generalize to new songs without capture. |
| **(b) On-device ASR** (e.g. whisper.cpp small Spanish) with phrase matching | Transcribe streaming mic audio. Fuzzy-match the transcript against the expected next phrases. | More flexible — any new song just works. But singing is harder than speech for ASR, CPU cost is higher, latency is a concern, and accuracy on sustained vowels / vibrato is mediocre. |
| **(c) Keyword spotting** | Spot just a distinctive word or two per phrase (e.g. the first and last word). Simpler models. | Cheapest to run. Fragile if the keyword is mumbled or if two phrases share words. Feels like a workaround rather than a solution. |

**Recommendation: start with (a) template DTW.** Reasons:

- Singing breaks speech ASR assumptions (sustained vowels, vibrato, non-standard prosody). A model trained on *your actual voice singing the actual song* sidesteps all of that.
- The rehearsal capture requirement is an asset, not a cost — I rehearse anyway, and a capture per song is a one-time thing per song.
- It naturally handles the "constrained search" discipline: I'm matching against three specific audio templates, not the universe of Spanish words.
- It degrades gracefully: if the match isn't confident, it simply doesn't advance. No hallucination.

Path (b) can be a later evolution — once the overall architecture is in place, swapping in an ASR-based matcher is a contained change because the Listener already emits `next` commands regardless of how it decided.

## 5. Decision logic

The Listener keeps three pieces of state: `currentIndex`, `scoreHistory` (a short rolling window of match scores for each candidate), and `lastAdvanceTime`.

On each audio frame (~every 100 ms):

- Score the last ~2–3 s of audio against the templates for `currentIndex`, `currentIndex+1`, and optionally `currentIndex+2`.
- Update score histories.
- Advance *if and only if*:
  1. The score for `currentIndex+1` has exceeded a confidence threshold.
  2. It has stayed above threshold for a stability window (300–800 ms — tunable).
  3. It is clearly better than the score for `currentIndex` (margin, not absolute — prevents jitter at phrase boundaries).
  4. We haven't just advanced (cooldown of ~500 ms to avoid double-advance).
- Never advance by more than one phrase at a time. Never advance backward.
- If no candidate is confident, do nothing. Silence is the safe default.

The pedal is unaffected by any of this. A pedal press always advances and resets the Listener's `currentIndex` to whatever the new canonical state is.

## 6. UX and app integration

The Listener is a capability of the Control window only. The Projection window never sees or reacts to it.

New pieces of UI:

- **Auto-advance toggle** on the Control screen, visible in Performing view. Off by default. Turning it on requires: templates exist for the current song *and* a mic is detected.
- **Confidence indicator** — a small, non-distracting visual (e.g. a bar or dot that brightens when the Listener is locked on). Useful for rehearsal; can be hidden during real performance if it turns out to be distracting.
- **Rehearsal capture flow** in the Songs screen: for a given song, "Record reference take" → sing through → app auto-segments by existing phrase boundaries using silence detection and lets me adjust. Templates are stored alongside the song JSON (but large enough that they probably want their own storage file, not `localStorage`).
- **Pedal behavior unchanged.** The pedal always advances. If it gets pressed while auto-advance is on and the Listener is about to advance, the pedal wins — effectively, the human is always the tiebreaker.

A later refinement could expose per-song confidence thresholds (some songs may be more distinctive than others), but v1 should use one global threshold tuned in rehearsal.

## 7. Implementation phases

Six phases, each a single branch / PR, following the TDD discipline already in the repo.

**Phase 0 — Research spike.** A small standalone Node/TypeScript harness outside the app. Feeds WAV files in, runs MFCC + DTW, prints scores. Goal: validate that template DTW can reliably distinguish phrase *i* from phrase *i+1* on a real rehearsal recording of one song. Non-goal: integration. If this spike doesn't produce clean separation, we stop and reconsider (probably move to path b). Time-box: one session.

**Phase 1 — Pure Listener module (no mic yet).** `src/listener/` with pure functions: `scoreFrame(templates, audioFrame)`, `decideAdvance(scoreHistory, thresholds)`. Full unit tests against synthetic and recorded inputs. Mirrors the pattern of `navigationState.ts` — pure logic, no side effects, no UI.

**Phase 2 — Rehearsal capture.** UI in Songs screen to record a reference take, auto-segment into phrase templates, let me adjust boundaries, and persist. Templates stored as a new file alongside song JSON. No live listening yet — this is just about producing good templates.

**Phase 3 — Live mic ingest.** Wire Web Audio API (AudioWorklet) in the Control renderer to feed raw audio into the Listener. Keep everything in the renderer; no native addons if avoidable. Confidence indicator renders on Control.

**Phase 4 — Commit the advance.** Hook the Listener's decisions into the existing `applyCommand('next')` path. The Listener now actually advances lyrics. Auto-advance toggle ships.

**Phase 5 — Rehearsal-mode dogfooding.** Use it at home over several rehearsals across multiple songs. Tune thresholds. Log every decision (advance, near-miss, held-back) for offline review. This phase is explicitly about iteration, not features.

**Phase 6 — Low-stakes live trial.** Try it at a single song during a small gig, with my daughter still on the pedal as backup. Only if Phase 5 is solid.

BOMfestival (16 May 2026) is too close and too important to be the trial venue. Auto-advance is not on the critical path for that gig. Something smaller afterward is the right target.

## 8. Risks and open questions

**Singing varies more than speech.** The same phrase sung twice is not acoustically identical. The template has to tolerate reasonable variation. This is exactly what DTW is good at, but the distance metric and normalization will need tuning. This is the biggest uncertainty and is what Phase 0 is designed to de-risk.

**Instrumental sections and silences.** Many songs have intros, outros, and mid-song instrumental breaks with no vocals. The Listener needs to know not to try matching during these. Simplest handling: phrases marked as "no vocal / wait for pedal" in the song data, and the Listener just doesn't run during those. This is a song-data question, not a tech question.

**Audio interface latency and total end-to-end delay.** Current pedal path: pedal → main process → WS → Projection. New path adds: mic → audio buffer → feature extract → scoring → decision. End-to-end budget should stay under ~200 ms from the moment the next phrase is sung to when the translation appears. This needs measurement, not assumption.

**Improvisation and deviation.** If I improvise a line, the match will fail — which is *correct* behavior: no confidence → no advance → I just press the pedal. The risk is the system advancing *anyway* because of a false positive. The confidence threshold and margin requirement are the defense.

**Storage size.** Phrase templates as raw audio features (not audio) for an 11-song library is probably a few tens of MB. Manageable, but worth confirming before committing to a storage scheme.

**Packaging implications.** This probably pulls in a native or WASM DSP dependency. Needs to fit cleanly into `electron-builder` output and not break the macOS + eventual Windows packaging goal noted in `project-context.md`.

## 9. What I'd do next

Two concrete actions:

1. **Record a clean rehearsal take of one song** (suggestion: *Pimiento* — already well-known to me, moderate complexity, clear phrase structure). No app involvement — just a good-quality recording with my normal mic and guitar.
2. **Run Phase 0 as a throwaway spike.** A short TypeScript script that loads the recording, segments it by the known phrase structure, and scores live mic audio (or a second take of the same recording) against the templates. If Phase 0 shows clear separation between adjacent phrases, the rest of the plan is well-founded. If it doesn't, we reconsider before investing in UI and integration.

Everything downstream of Phase 0 is committing real effort; Phase 0 itself is a half-day of cheap learning. That's the right first step.

---

## One-line summary

A local-first Listener subsystem that matches live mic audio against rehearsal-recorded phrase templates for the current song, advances the lyric index when the next phrase is clearly and stably detected, and leaves the pedal as an always-authoritative override.
