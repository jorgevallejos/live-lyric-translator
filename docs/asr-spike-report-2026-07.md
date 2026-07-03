# ASR Lyric-Following Spike — Report (2026-07-03)

**Verdict: NO-GO** on live ASR as the driver of the lyric pointer, per the decision rule. The question is closed; the timeline/Auto (beat-clock + authored timeline) architecture stands validated. Two valuable side findings: (1) the *tracking* problem is essentially solved — the failure is purely streaming-ASR latency on this hardware; (2) **offline** forced alignment works so well (near-verbatim, 46 s for the whole song) that it should become the tool that *authors* the timeline — and it exposed that the current shipped timeline for this song is misaligned scaffolding.

Branch: `spike/asr-following`, all code under `spike/`. Throwaway; no PR to `main`.

## The three numbers that drove the verdict

Best candidate (faster-whisper `small`, streaming simulation, mixed master):

| Decision-rule metric | Required (GO) | Measured |
|---|---|---|
| Lines advanced within ±1.0 s | ≥ 90% | **3.4%** |
| Median lag | ≤ 1.0 s (≤ 2 s for CONDITIONAL) | **5.36 s** |
| Wrong-direction / false jumps | 0 | **0** ✓ |

Median lag 5.36 s is far outside even the CONDITIONAL band (1–2 s), and no candidate passed on any axis that another failed, so the verdict is NO-GO without needing the clean-stem axis (which could not be run anyway — see Inputs).

## Setup

- **Audio:** extracted with ffmpeg from the song's linked animation video (`animations/tragedia-de-cerdo-asado/Tragedia de Cerdo Asado.mp4`, 159.5 s) → mono 16 kHz WAV. Mixed master (voice + guitar). **No vocal-only stem time-locked to this take exists** — the standalone `voice.mp3` is a different 194 s take, so the clean-vs-mixed axis was skipped per the brief.
- **Streaming simulation:** sequential 0.5 s chunks, simulated wall clock accumulating real measured per-pass processing latency (compounding when a pass overruns its budget). Vosk uses its native streaming API; Whisper-family candidates use rolling re-transcription with a trailing-margin stability rule (details in `spike/asr_bench/bench-report.md`).
- **Matcher (S2):** pure stdlib `LyricFollower` (`spike/matcher/`) — forward-only pointer, normalized fuzzy token matching against a window of each upcoming line's opening words, evidence sets so melisma can't double-count, stricter threshold for skip/catch-up, nearest candidate wins. 30 unit tests green, including an integration test on the real 29 Spanish lines with 20% word drops, corruptions, and noise injections.
- **Harness (S3):** `spike/harness/run_all.sh` replays each word stream through the matcher and scores advance events against ground truth (`spike/harness/metrics.py`). Song JSON path, audio path, and ground truth are parameterized — re-runnable as-is on the produced master.

## Ground truth had to be re-derived (important finding on its own)

The brief assumed the authored `timeline` aligns with the linked video's audio. **It does not:**

- The authored timeline is a uniform 5.5 s grid from 18.0 to 177.5 s — it **overruns the 159.5 s video by 18 s**, and a uniform grid cannot represent this song anyway (empirical line spacing ranges 2.5–8 s; it's the accelerando stress test). `animations/…/notes.md` already flags it as provisional scaffolding.
- Cross-correlation places the master's audio at 9.303 s inside the Big-Screen reference video; frame inspection confirms the Big-Screen burned-in subtitles are in sync with its audio (line 1 showing at ~11 s). The authored grid (line 1 at 18.0) matches **neither** file. Line 1 is actually sung at **t ≈ 1.0 s** of the master — all three ASR engines agree.
- **Consequence for the app, outside this spike:** in Video mode today, this song's subtitles would appear ~17 s late against its linked video (`media.offset` is 0). The timeline needs regenerating before this song is performed in Video mode.

**Ground truth used instead:** per-line onsets derived from a full-file forced-align reference (faster-whisper `medium`, non-streaming, near-verbatim quality), anchored by each line's opening tokens (`spike/harness/derive_ground_truth.py` → `spike/harness/ground-truth-derived.json`). Two hand anchors, documented: line 0 = 0.96 s (Vosk's independent onset; whisper clamps the first word to 0.0), line 13 = 58.5 s (whisper misheard "hacia el fuego ardiente" as "hace calor al diente"; the words are there at the right time). Cross-check: Vosk's independent word times agree within ~0.2–1.0 s on the lines it recognized. Caveats: ①  ground truth carries ~±0.5 s uncertainty, so the ±0.5 s metric is noisy (the ±1.0 s metric and median lag are meaningful); ② mild circularity scoring whisper candidates against whisper-derived truth — acceptable at this granularity, stated openly.

## Per-recognizer results (mixed master, empirical ground truth)

| Candidate | RTF | Advanced | Missed | ±1.0 s | Median lag (emit) | Median lag (audio-time) | False/early | Wrong-dir |
|---|---|---|---|---|---|---|---|---|
| **faster-whisper small** (stream) | **0.60× — falls behind** | **29/29** | 0 | 3.4% | **5.36 s** | **0.98 s** | 0 | 0 |
| Vosk small-es (native stream) | ~30× | 17/29 | **12** | 0% | 6.58 s | 1.2 s | 0 | 0 |
| whisper-timestamped tiny (stream) | 10.3× | 27/29 | 2 | 0% | 5.28 s | 1.22 s | 1 | 0 |
| faster-whisper medium (stream) | aborted ≥35 min, no output | — | — | — | — | — | — | — |
| forced-align reference (medium, batch) | 3.5× batch | n/a — QA artifact | | | | | | |

The pattern is consistent and damning in one specific way: **matcher decision lag is ~1 s in audio time across all candidates** (the follower advances about one sung word after each line begins, 29/29 in order for the best stream, zero false jumps over the accelerando) — but **emission latency adds 4–10+ s** before those words exist on the wall clock. The latency budget is entirely eaten by the recognizer side:

- faster-whisper `small` rolling re-transcription runs at 0.60× realtime on this Mac (CPU int8) and degrades sharply past ~140 s of audio (passes ballooning to 20–29 s, some returning zero words — flagged, unexplained). `medium` is worse and never finished.
- The two candidates that *do* hold realtime cadence (Vosk ~30×, whisper-timestamped `tiny` 10.3×) recognize too poorly on a mixed music master: 12 and 2 missed lines respectively.

So the spike's core trade surfaced cleanly: **on local CPU today, you can have real-time speed or sufficient recognition quality on sung Spanish over guitar — not both.**

## Per-line detail — best candidate (faster-whisper small)

Truth = derived onset (s); detected = simulated wall-clock emit of the advance; lag = detected − truth. Full machine-readable data: `spike/harness/out/summary.json`.

| line | truth | detected | lag | | line | truth | detected | lag |
|---|---|---|---|---|---|---|---|---|
| 0 | 0.96 | 5.02 | +4.06 | | 15 | 68.8 | 73.66 | +4.86 |
| 1 | 3.76 | 9.11 | +5.35 | | 16 | 72.92 | 77.74 | +4.82 |
| 2 | 8.0 | 13.21 | +5.21 | | 17 | 76.6 | 81.71 | +5.11 |
| 3 | 12.04 | 17.24 | +5.20 | | 18 | 83.84 | 89.5 | +5.66 |
| 4 | 15.9 | 21.26 | +5.36 | | 19 | 88.74 | 93.38 | +4.64 |
| 5 | 19.72 | 23.31 | +3.59 | | 20 | 91.48 | 97.6 | +6.12 |
| 6 | 23.24 | 29.45 | +6.21 | | 21 | 95.74 | 103.72 | +7.98 |
| 7 | 30.46 | 35.4 | +4.94 | | 22 | 102.6 | 108.01 | +5.41 |
| 8 | 38.24 | 43.22 | +4.98 | | 23 | 106.4 | 111.82 | +5.42 |
| 9 | 42.04 | 47.11 | +5.07 | | 24 | 112.22 | 117.77 | +5.55 |
| 10 | 45.62 | 51.38 | +5.76 | | 25 | 120.44 | 125.92 | +5.48 |
| 11 | 48.14 | 55.36 | +7.22 | | 26 | 127.96 | 128.0 | +0.04 |
| 12 | 55.2 | 59.35 | +4.15 | | 27 | 132.0 | 143.81 | +11.81 |
| 13 | 58.5 | 67.53 | +9.03 | | 28 | 136.16 | 143.81 | +7.66 |
| 14 | 62.16 | 67.53 | +5.37 | | | | | |

Every line advanced, in order — a 4–6 s-late but otherwise perfect performance, worsening toward the tail as processing falls behind (lines 27–28 ride the latency pile-up).

## What would change with the produced master / a clean stem

- **Recognition quality** would improve (produced vocal clarity; a clean stem even more so) — this mostly rescues the *fast* candidates (Vosk, tiny), which fail on recognition. Plausible but unproven that a clean stem lifts Vosk-class recognition enough; that was the CONDITIONAL path and it can be re-tested in minutes: re-extract audio, re-run `spike/asr_bench/scripts/run_*.py --audio …` and `spike/harness/run_all.sh <song.json>` (drop in a new `ground-truth-derived.json`, or `--gt-offset 0` once the timeline is authored against that same file).
- **Latency would not change** — it's a hardware/implementation property, not an audio property. A clean stem does not fix a 0.60× realtime factor. The known engineering paths (whisper.cpp with Metal GPU, VAD-gated re-transcription, whisper-streaming local agreement, adaptive windows) might reach the 1–2 s band, but that's a project, not a spike, and nothing measured here demonstrates it.
- **The genuinely promising ASR use is offline:** forced alignment produced a near-verbatim, correctly-timed word map of the whole song in 46 s. That is exactly the machinery the **timeline-extractor** project / timeline-import button needs to replace the misaligned scaffolding grid — authoring the timeline, not driving the show.

## Proposed edits (Jorge reviews and decides — nothing applied)

**`project-context.md` (repo root)** — add under current state:

> **Live-ASR following: closed NO-GO (spike 2026-07-03, branch `spike/asr-following`).** Best local streaming candidate (faster-whisper small) tracked 29/29 lines in order with zero false jumps but median wall-clock lag 5.36 s (rule required ≤1.0 s; ≥90% within ±1.0 s, measured 3.4%) — recognition quality and real-time speed are mutually exclusive on local CPU today. Timeline/Auto architecture stands. Side findings: offline forced alignment (faster-whisper medium, 46 s/song, near-verbatim) is the right tool for *authoring* timelines (→ timeline-extractor); the shipped `tragedia-de-cerdo-asado.json` timeline is misaligned scaffolding (~17 s late vs its linked video, uniform grid) and must be regenerated before Video-mode use.

**`CLAUDE.md` (repo)** — one line in the Song Data Format section:

> Note: `timeline` values are only meaningful relative to the linked video's own clock — validate against the video (`media.offset` compensates); the 2026-07 ASR spike found a shipped timeline ~17 s off. Forced alignment on the video's audio is the sanctioned way to generate timelines.

**Cowork memory (`projects/live-lyric-translator-dev/project-context.md` in Chango Pepper)** — record the NO-GO + the forced-alignment-for-timeline-authoring insight in the D-wire/auto-advance thread, and note the timeline-extractor project just gained a validated core mechanism (46 s forced alignment beats ffmpeg-OCR change detection for songs that have audio).

## Artifacts

- `spike/README.md` — scoped brief, interface contract, ground-truth analysis.
- `spike/asr_bench/` — S1 runners + `bench-report.md` (install friction, latency traces, stability rule) + `out/*.jsonl` word streams (committed; models/venv gitignored).
- `spike/matcher/` — S2 follower + replay CLI + 30 tests + `NOTES.md` (deferred fancier ideas).
- `spike/harness/` — S3 scorer, ground-truth deriver, `ground-truth-derived.json`, `out/` results incl. `summary.json`.
