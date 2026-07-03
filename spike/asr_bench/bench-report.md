# S1 — Streaming ASR bench report

Spike: `spike/asr-following`. Audio: `spike/data/tragedia-master-16k.wav` (mono 16 kHz, 159.51 s, mixed voice + guitar, Spanish singing, extracted from the Big-Screen master).

Environment: Python 3.12.12 venv at `spike/asr_bench/.venv` (chosen over the system Python 3.14 for ML-package compatibility — faster-whisper/whisper-timestamped/torch wheels for 3.14 are not yet reliably available on Apple Silicon). Apple Silicon Mac, CPU-only inference throughout (`compute_type="int8"` for faster-whisper).

All runners simulate real time by feeding the file in sequential 0.5 s chunks (`spike/asr_bench/scripts/audio_chunks.py`); no live mic is used per the spike brief.

## Sanity-check flag (read before trusting the ground-truth offset)

All three independent engines (Vosk, faster-whisper `small`, faster-whisper `medium` full-file reference) agree the first recognizable words ("Me ac-/uerzan/uestan/usan- en la cama") land at **audio_time ≈ 0.0–2.0 s**, not ~8–9 s as the spike brief's sanity target states. Three independently-trained models converging on the same early placement makes a shared hallucination unlikely — this looks like a real early vocal onset (or a false start / lead-in) in the master audio that predates line 0 of the authored `timeline`. This conflicts with `timeline[0].start − 9.303 = 8.697 s` as ground truth for line 0. Recommend the coordinator listen to `spike/data/tragedia-master-16k.wav` at 0–10 s directly before trusting the `--gt-offset 9.303` value for S3 metrics — the offset may need revisiting, or line 0 may need to be treated as noisy ground truth (the brief already flags the timeline as a "provisional uniform 5.5 s grid").

## Candidates run

| Candidate | Model | Streaming mechanism | Status |
|---|---|---|---|
| Vosk | `vosk-model-small-es-0.42` (58 MB unpacked) | native (`AcceptWaveform`) | done |
| faster-whisper | `small` (int8, ~464 MB) | rolling re-transcription | done |
| faster-whisper | `medium` (int8, ~1.5 GB) | rolling re-transcription | **aborted after 33+ min CPU / ~35 min wall** (still not finished — see below) |
| whisper-timestamped | `tiny` (~72 MB, openai-whisper/PyTorch backend) | rolling re-transcription | done |
| forced-align reference | faster-whisper `medium`, full-file, non-streaming | n/a (QA artifact) | done |

whisperX was not attempted — whisper-timestamped installed with zero friction (`pip install whisper-timestamped` pulled torch 2.12.1 cleanly, no native deps, no compiler needed), so per the brief ("pick whichever installs cleanly... one is enough") it was used to cover candidate category 2 and whisperX was skipped to conserve spike time.

## Install friction

- **faster-whisper**: `pip install faster-whisper` — zero friction. Pulls `ctranslate2`, `onnxruntime`, `tokenizers`, `huggingface-hub`. Models download on first use from the `Systran/faster-whisper-*` HF repos (`small` ≈ 464 MB, `medium` ≈ 1.5 GB CT2 int8 weights).
- **Vosk**: `pip install vosk` — zero friction, no compiled extensions to build (ships prebuilt wheels). Spanish model `vosk-model-small-es-0.42` downloaded manually from `alphacephei.com/vosk/models/` (38 MB zip, 58 MB unpacked) — no download API, just a static zip to `spike/asr_bench/models/`.
- **whisper-timestamped**: `pip install whisper-timestamped` — zero friction, but pulls in the full `openai-whisper` + `torch` stack (torch 2.12.1, CPU wheel). Heavier install (~600 MB+ of cache) and, critically, **much slower per-inference-pass than faster-whisper/CTranslate2 at equivalent model size** — this is why the streaming run below uses `tiny` rather than `small`/`medium`: this backend's word-timestamp path (DTW cross-attention alignment on PyTorch) does not pipeline well against a 0.5 s chunk cadence.
- **whisperX**: not attempted (see above).

No candidate failed to install. The only real friction was environment-level: had to pin the venv to Homebrew's Python 3.12 instead of the machine's default 3.14, since PyTorch/faster-whisper wheels for 3.14 aren't broadly published yet on Apple Silicon.

## Streaming simulation design

Full design rationale is documented in the driver scripts' module docstrings (`scripts/run_vosk.py`, `scripts/run_faster_whisper_streaming.py`, `scripts/run_whisper_timestamped_streaming.py`). Summary:

- **Vosk** (native streaming): each 0.5 s chunk goes through `AcceptWaveform`; finalized-result words (not partials) are emitted with Vosk's own word-level timestamps. `emit_time` = simulated wall clock after each chunk's processing latency, compounding if a chunk's processing takes longer than its allotted 0.5 s (it never does in practice — see latency table).
- **faster-whisper / whisper-timestamped** (rolling re-transcription — no native streaming API exists for Whisper-family models): maintain a rolling audio buffer (last `window_seconds`), re-transcribe the whole buffer with word timestamps every `retranscribe_every_n` chunks. **Stability/emission rule ("trailing-margin local agreement"):** a word is emitted once (a) its end time is more than `commit_lag` seconds before the buffer's trailing edge (so it's not at the volatile edge of context that a future pass could still revise), and (b) its start time is at/after the point up to which we've already emitted (dedupes across overlapping passes, matched by time position, not string — the same audio gets re-transcribed by design). `emit_time` = the wall-clock time the triggering pass completed (chunk-boundary trigger time, or later if a previous pass left the simulated clock behind, plus that pass's own measured processing latency). This is a simplified stand-in for the whisper_streaming "local agreement" trick (which compares two consecutive hypotheses word-by-word); ours exploits Whisper's typical timestamp stability away from the window edge instead. Documented failure mode: a confidently-wrong first-pass word can still get emitted early — there is no revision after emission.

Config used:

| Driver | Model | window | retranscribe cadence | commit_lag |
|---|---|---|---|---|
| faster-whisper | small | 12 s | every 4 chunks (2.0 s) | 1.5 s |
| faster-whisper | medium | 8 s | every 8 chunks (4.0 s) | 1.5 s |
| whisper-timestamped | tiny | 10 s | every 6 chunks (3.0 s) | 1.5 s |

The medium config uses a shorter window/coarser cadence than small because medium's per-pass cost is markedly higher (see below) — even so it fell further behind.

## Results

### Vosk (`vosk-model-small-es-0.42`)

- 320 chunks processed, 166 words emitted.
- Per-chunk processing latency: mean 17 ms, median 12 ms, max 72 ms — trivial next to the 500 ms chunk budget.
- **Realtime factor: ~30x** (159.5 s audio fully processed & finalized using ~5.3 s of total compute).
- Chunk cadence: perfectly kept up — every single 0.5 s chunk processed well within budget; simulated wall clock tracked audio time almost exactly (`final_sim_clock` 159.52 s vs `audio_duration` 159.51 s).
- Emission lag: median 3.29 s, mean 4.29 s, max 11.75 s. (Lag here is dominated by Vosk's own recognizer latency — it waits for an utterance/silence boundary before finalizing a result — not by compute; the model is essentially free.)
- Recognition quality (`small` model is the compact one; no `medium`-equivalent Spanish Vosk model tried): noisy but usable — "me acuestan en la cama de plata brillante me humo que en con yerbas manteca ajo esta mi piel como cristal el jeff me mira..." vs ground truth "Me acuestan en la cama / de plata brillante. / Me ungen con hierbas, / manteca, ajo y sal. / Mi piel como cristal, / El chef me admira..." — gets the gist and most content words, drops/garbles some ("hierbas"→"yerbas" ok, but "ajo y sal"→"ajo esta", "chef"→"jeff").

### faster-whisper `small` (rolling re-transcription)

- 320 chunks, 81 re-transcription passes, 202 words emitted.
- Per-pass processing latency: mean 3.27 s, median 1.57 s, **max 28.94 s**.
- **Realtime factor: 0.60x — slower than real time.** `final_sim_clock` reached 301.5 s to process 159.5 s of audio — i.e. it took ~1.9x the song's own length to finish, confirming it genuinely falls behind mid-stream, not just at the tail.
- Chunk cadence: **not sustained**. Early passes (buffer 0–10 s) ran in ~1.0–1.2 s — comfortably inside the nominal 2.0 s pass budget. From roughly the 140 s mark on, pass latency balloons to 20–29 s per pass (see `out/faster-whisper-small.stats.json` → `pass_records`), and several of those late passes return **zero words** (`n_words_in_pass: 0`) despite the buffer covering audio spans that do contain sung lyrics (verses 23–28 in the song, 135–163 s) — the word-timestamp DTW alignment step appears to become both much slower and much less reliable later in the file, independent of a clear cause identified in this spike (worth flagging to the coordinator; possibly an artifact of `condition_on_previous_text=False` plus repeated re-decoding of overlapping windows).
- Emission lag: median 4.67 s, mean 11.83 s (dragged up by the tail), **max 128.91 s**.
- Recognition quality: closely tracks the full-file reference — "Me acusan en la cama de plata brillante Me ungen con hierbas manteca aju y sal. mi piel como cristal. el chef me admira como..." — very close to ground truth, best quality-per-model-size of the streaming candidates.

### faster-whisper `medium` (rolling re-transcription) — aborted, no output file

This run was **killed after 33+ minutes of CPU time (~35 minutes wall clock) without finishing** the 159.5 s file under an 8 s window / 4 s cadence — it had not reached the tail of the audio when stopped. No `out/faster-whisper-medium.jsonl` was produced (the driver only writes output at the end of the run, after the final flush pass); this is a genuine "did not complete in a practical bench time budget" result, not a data point with numbers to report. It is consistent with — and considerably worse than — the `small` model's observed late-file slowdown (bigger model = higher per-pass floor, so whatever is causing the tail blow-up in `small` compounds harder in `medium`). Combined with the `small` findings above, this corroborates: **rolling re-transcription with faster-whisper cannot sustain a 0.5 s-chunked real-time cadence on this machine past roughly the first 100–140 s of a track, at either model size tested**, and gets worse, not better, with a bigger model. Re-running this candidate with a shorter window, VAD gating, or a hard per-pass timeout would be needed to get a clean number — out of scope for this spike's time budget.

### whisper-timestamped `tiny` (rolling re-transcription, openai-whisper backend)

- 320 chunks, 54 passes, 422 words emitted (over-emits relative to faster-whisper — `tiny` tends to hallucinate more short/filler words, inflating word count without matching recall of real content).
- Per-pass latency: mean 285 ms, median 197 ms, max 1.17 s — very fast per pass because `tiny` is a small model, even on the slower PyTorch backend.
- **Realtime factor: 10.3x.** `final_sim_clock` 161.3 s vs 159.5 s audio duration — essentially kept pace with real time throughout, no runaway tail.
- Chunk cadence: sustained the whole file; no pass ever threatened the 3.0 s budget.
- Emission lag: median 2.45 s, mean 2.39 s, max 10.15 s — the best (lowest, most consistent) lag profile of the three streaming candidates.
- Recognition quality: markedly worse than faster-whisper `small`, as expected for the `tiny` model — "Me acusen la cama de plata brillante. Me un quien conyer was Vantica ajo sal Mi piel como cristal el chef me atmira como arretoe..." — gets isolated words right but garbles whole phrases ("ungen con hierbas manteca" → "un quien conyer was Vantica").

### Forced-align reference (`faster-whisper medium`, full-file, non-streaming)

- 196 words, `load 1.2 s` + `transcribe 46.1 s` for the full 159.5 s file (realtime factor ≈ 3.5x as a one-shot batch job — much faster than the same model run as 40 small rolling-window passes, because full-file transcription with `condition_on_previous_text=True` avoids re-decoding overlapping context repeatedly).
- `language_probability: 1.0`.
- Output: `out/forced-align-reference.jsonl`, `emit_time == audio_time` per the spike contract — this is the QA reference for the coordinator, not a real-time candidate.
- Sample vs ground truth (first 5 lines):

  | # | Ground truth (`es`) | Forced-align reference (words, ~matching span) |
  |---|---|---|
  | 0 | Me acuestan en la cama | Me acuerzan en la cama |
  | 1 | de plata brillante. | de plata brillante |
  | 2 | Me ungen con hierbas, | Me ungen con hierbas, |
  | 3 | manteca, ajo y sal. | manteca, ajo y sal |
  | 4 | Mi piel como cristal, | Mi piel como cristal |

  High fidelity — one substitution ("acuestan"→"acuerzan") in the first 20 words, otherwise a clean match including punctuation-adjacent words.

## Cross-candidate summary

| Candidate | Realtime factor | Median emission lag | Cadence sustained? | Recognition quality (subjective) |
|---|---|---|---|---|
| Vosk small-es | ~30x | 3.29 s | yes, trivially | fair — gets gist, drops/garbles some words |
| faster-whisper small (streaming) | 0.60x | 4.67 s (mean 11.8 s, tail-skewed) | **no** — falls behind badly after ~140 s | good — closest to ground truth of the streaming candidates |
| faster-whisper medium (streaming) | not measurable — aborted after 33+ min CPU without finishing | n/a (no output produced) | **no** — same failure mode as small, worse | not evaluated in streaming form (run aborted); full-file medium (reference) quality is excellent |
| whisper-timestamped tiny (streaming) | 10.3x | 2.45 s | yes | weaker — `tiny` model garbles multi-word phrases |
| forced-align reference (medium, full-file) | 3.5x (batch, non-streaming) | n/a (QA only) | n/a | excellent — near-verbatim |

**Headline finding for the coordinator:** the two streaming-capable-in-practice candidates on this machine are **Vosk** (fastest by far, weakest recognition) and **whisper-timestamped `tiny`** (fast enough, weaker recognition than larger Whisper models). **faster-whisper's rolling-retranscription approach gives the best word-level recognition quality of any streaming candidate but cannot sustain real-time chunk cadence past roughly the 140 s mark of this file at either `small` or `medium`**, so as implemented here it is not viable as the literal real-time driver — though it may still be useful input to S2/S3 as a "best-quality but laggy" reference to sanity-check the true-streaming candidates' word sequences against, or with further engineering (VAD-gated re-transcription, shorter/adaptive windows, larger commit_lag tuned empirically) it might be made to keep pace — out of scope for this spike.

## Outputs

- `spike/asr_bench/out/vosk-small-es.jsonl` (166 words)
- `spike/asr_bench/out/faster-whisper-small.jsonl` (202 words)
- `spike/asr_bench/out/faster-whisper-medium.jsonl` — **not produced**; the streaming run was aborted before completion (see above). Re-runnable via `scripts/run_faster_whisper_streaming.py --model-size medium` with more time budget or a coarser cadence.
- `spike/asr_bench/out/whisper-timestamped-tiny.jsonl` (422 words)
- `spike/asr_bench/out/forced-align-reference.jsonl` (196 words, `emit_time == audio_time`, QA reference — generated with faster-whisper `medium`, full-file, non-streaming, 46 s wall clock)
- Stats/trace JSON alongside each (`*.stats.json`) with full per-pass latency records.
- Vosk Spanish model at `spike/asr_bench/models/vosk-model-small-es-0.42/` (gitignore this — see note below).

## Scripts

- `scripts/audio_chunks.py` — shared 0.5 s chunk iterator.
- `scripts/run_vosk.py --audio <wav> --model-dir <dir> --out <jsonl> [--chunk-seconds 0.5] [--stats-out <json>]`
- `scripts/run_faster_whisper_streaming.py --audio <wav> --model-size {small,medium} --out <jsonl> [--window-seconds] [--retranscribe-every-n] [--commit-lag] [--stats-out]`
- `scripts/run_whisper_timestamped_streaming.py --audio <wav> --model-size {tiny,...} --out <jsonl> [--window-seconds] [--retranscribe-every-n] [--commit-lag] [--stats-out]`
- `scripts/run_forced_align_reference.py --audio <wav> --out <jsonl> [--model-size medium]`

## Note for the coordinator

`spike/asr_bench/models/` (Vosk model, ~58 MB) and `spike/asr_bench/.venv/` are not covered by an existing `.gitignore` inside `spike/asr_bench/` — recommend adding both plus `out/*.jsonl` if the raw word streams are considered regenerable/large before this branch is finalized. Left as-is since this agent was scoped to stay under `spike/asr_bench/` only and not touch shared `.gitignore` policy without coordinator sign-off.
