# Dispatch — Live-ASR Following Spike (Prompt I, un-shelved)

_Paste this into Claude Code (Fable as coordinator) at the repo root of `live-lyric-translator`. 2026-07-03. Scoped in Cowork: current master audio, offline simulation only, go/no-go read. Fable window closes 7 July._

---

You are the **coordinator** for a bounded, throwaway spike. You frame, dispatch Sonnet subagents for the build slices, integrate their results, and end with a written report. You do not merge anything to `main`.

## Objective

Answer **go / conditional / no-go** on live ASR lyric-following: can a locally-run streaming speech recognizer, fed the performance audio in real-time-sized chunks, advance the lyric pointer accurately and fast enough to drive the audience subtitle for a song with irregular/accelerating tempo?

Test song: **Tragedia de cerdo asado** — the deliberate stress test (~124→130 BPM accelerando; a fixed clock can't follow it).

## Hard constraints

- **Throwaway spike.** One branch `spike/asr-following`, all code under a top-level `spike/` folder (Python is fine — this never ships in the Electron app). Nothing is wired into the app. No PR to `main`; the branch and the report are the deliverables.
- **Offline simulation only.** No live microphone. Simulate real time by feeding the audio file in sequential chunks (e.g. 0.5 s) and recording wall-clock processing latency per chunk on this Mac.
- **Local models only**, installed via network as needed (this is why the spike runs in Claude Code, not Cowork).
- Report back with **results + proposed memory edits**; Jorge reviews and decides.

## Inputs and ground truth

- Lyrics: `songs/tragedia-de-cerdo-asado.json` (v6 schema) — Spanish lyric lines in order, plus the authored `timeline`.
- **Audio: extract it from the song's linked animation video with ffmpeg.** The timeline was authored against that video, so its audio aligns with the timeline timestamps by construction — do not substitute another audio file (the standalone `voice.mp3` is a different take and will not align).
- Ground truth = the `timeline` entries, **excluding section markers** (`start == end == 0`). Each real entry's `start` is the ground-truth moment its line should appear.
- The mixed master (voice + guitar) is the primary and probably only input. If a vocal-only stem *time-locked to this same take* exists, run it as a second axis; otherwise skip clean-vs-mixed and note it in the report.
- **Parameterize the audio path and song JSON path.** The harness will be re-run as-is on the produced master being recorded this week.

## Slices (dispatch to Sonnet subagents; S1 and S2 are independent — run in parallel)

**S1 — ASR bench.** Install and run 2–3 candidate recognizers on the extracted audio in chunked streaming simulation: `faster-whisper` (small/medium, Spanish), `whisper-timestamped` or `whisperX`, and `Vosk` (Spanish model) as the low-latency baseline. Output per candidate: a stream of `(word, audio_time, emitted_at_wallclock)` records. Report install friction, model size, and per-chunk processing latency (realtime factor) on this machine.

**S2 — matching layer.** A pure function, unit-tested: `(recognized word stream, ordered lyric lines, current pointer) → advance events`. Must tolerate mis-heard words, held/repeated words (melisma), skipped words, and gaps; must handle repeated lines/choruses without jumping backwards or double-advancing; forward-only pointer with a confidence threshold before advancing. Keep it simple — normalized token matching against a window of the next line's opening words is a fine first design; note fancier ideas rather than building them.

**S3 — harness + metrics** (after S1/S2). Replay each ASR stream through the matcher. Per line: detected advance time vs ground truth `start`. Metrics per recognizer: % of lines advanced within ±0.5 s and ±1.0 s; median/mean lag (signed — late is expected, quantify how late); false advances (wrong line / wrong direction); missed lines; end-to-end latency budget = ASR emission lag + matcher decision lag.

## Decision rule (write the verdict against these)

- **GO** — best candidate advances ≥ 90% of lines within ±1.0 s on the mixed master, zero wrong-direction/false jumps, median lag ≤ 1.0 s.
- **CONDITIONAL** — passes only on a clean stem, or passes with median lag 1–2 s → viable as a *drift corrector* for the existing beat-clock Auto mode, not as the driver. Say which.
- **NO-GO** — anything worse. Record it plainly so the question stays closed; the timeline/Auto architecture stands validated.

## Deliverable

`docs/asr-spike-report-2026-07.md` on the spike branch: setup, per-recognizer results table, per-line detail for the best candidate, the verdict against the decision rule, what would change with the produced master / clean stem, and proposed edits to repo `CLAUDE.md` + `projects/live-lyric-translator-dev/project-context.md`. End your run by summarizing the verdict and the three numbers that drove it.
