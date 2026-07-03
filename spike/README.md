# Spike: Live-ASR Lyric Following (2026-07-03)

**Throwaway spike.** Branch `spike/asr-following`, everything under `spike/`. Nothing here ships in the Electron app; no PR to `main`. Deliverable = this branch + `docs/asr-spike-report-2026-07.md`.

## Question

Can a locally-run streaming speech recognizer, fed performance audio in real-time-sized chunks, advance the lyric pointer accurately and fast enough to drive the audience subtitle? Test song: **Tragedia de cerdo asado** (accelerando ~124→130 BPM — a fixed clock can't follow it).

## Inputs (established by coordinator)

- **Song JSON:** `/Users/jorgevallejos/Chango Pepper/songs/tragedia-de-cerdo-asado.json`
  - `lyrics`: 29 items, each `{es, en, fr, nl}`. **No section markers.** Spanish (`es`) is the sung language.
  - `timeline`: 29 entries, uniform 5.5 s grid from 18.0 to 177.5 s.
- **Audio:** extracted from the song's linked animation video
  `/Users/jorgevallejos/Chango Pepper/animations/tragedia-de-cerdo-asado/Tragedia de Cerdo Asado.mp4` (159.49 s, AAC 48 kHz stereo)
  → `spike/data/tragedia-master-16k.wav` (mono 16 kHz, not committed).
  Mixed master (voice + guitar). **No time-locked vocal-only stem exists for this take** — the standalone `songs/audio/…voice.mp3` is a different 194 s take; do not use it.

## Ground-truth alignment (important)

The authored `timeline` (18.0 → 177.5 s) **overruns the 159.5 s clean master** — it was authored against the Big-Screen reference video (180.12 s, count-in + title card up front), not the clean master. Cross-correlation of the master audio against the Big-Screen audio gives a decisive offset:

> **master_time = timeline_time − 9.303 s** (peak 15× above runner-up; Small-Screen candidate 9.528 s was ambiguous and is rejected)

So ground truth for line *i* = `timeline[i].start − 9.303` in master-audio time. The harness parameterizes this as `--gt-offset` (default 9.303). Caveat for the report: the timeline is a uniform 5.5 s grid (provisional scaffolding per `animations/…/notes.md`), so ground truth itself carries error for an accelerando song; cross-check against forced-aligned word onsets.

## Layout

- `spike/data/` — extracted audio (gitignored) + pointers.
- `spike/asr_bench/` — S1: streaming ASR bench (faster-whisper, whisper-timestamped/whisperX, Vosk). Owns its venv.
- `spike/matcher/` — S2: pure matching layer, stdlib-only, unit-tested.
- `spike/harness/` — S3: replay ASR streams through the matcher, metrics vs ground truth.

## Shared interface contract (S1 → S3 → S2)

**Word-stream JSONL** (one file per recognizer config, `spike/asr_bench/out/<name>.jsonl`), one object per recognized word, in emission order:

```json
{"word": "acuestan", "audio_time": 9.84, "emit_time": 10.51}
```

- `word` — recognized token as emitted (raw; matcher does its own normalization).
- `audio_time` — word start time in seconds, in master-audio time.
- `emit_time` — simulated wall-clock seconds from stream start at which the word became available = end-time of the chunk that finalized it **plus measured processing latency**. Emission lag = `emit_time − audio_time`.

**Matcher API** (`spike/matcher/`): forward-only pointer over the ordered `es` lines.

```python
follower = LyricFollower(lines: list[str])            # optional config kwargs with defaults
events = follower.feed(word: str, audio_time: float)  # -> list of AdvanceEvent
# AdvanceEvent: {"line_index": int, "audio_time": float}  (time of the word that triggered the advance)
```

Plus a replay CLI: `python3 -m spike.matcher.replay --words <stream.jsonl> --song <song.json> --lang es` → advance-events JSONL on stdout.

## Decision rule

- **GO** — best candidate: ≥ 90% of lines within ±1.0 s on the mixed master, zero wrong-direction/false jumps, median lag ≤ 1.0 s.
- **CONDITIONAL** — passes only on a clean stem, or median lag 1–2 s → drift corrector for beat-clock Auto mode, not the driver.
- **NO-GO** — anything worse; question closed, timeline/Auto architecture stands.

## Re-run on the produced master (coming weeks)

All paths + `--gt-offset` are parameters. With the produced master: re-extract audio, re-author/import timeline, set `--gt-offset 0` if the timeline is authored against that same file.
