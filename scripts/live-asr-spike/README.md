# Live ASR Lyric-Following Spike

Proof-of-concept for testing whether streaming speech recognition can auto-advance lyric lines by following a singer in real time.

**Goal**: Evaluate feasibility of live ASR-based lyric advancement for songs with irregular/accelerating tempo, where fixed timelines fail.

## What It Does

1. **Transcribes audio** in real time using Whisper-timestamped (Spanish ASR)
2. **Matches transcribed words** to lyric lines with tolerance for:
   - Mis-hearings and accent variations (fuzzy matching)
   - Melisma (repeated/held words)
   - Gaps (pauses, breathing, instrumental)
3. **Advances lyric pointer** when recognized words cross into the next line
4. **Compares to ground truth** derived from the full transcription
5. **Reports accuracy, precision, recall, and latency** metrics

## Architecture

### Modules

- **`asr_transcriber.py`**: Whisper-timestamped speech recognition with word-level timing
- **`lyric_matcher.py`**: Fuzzy-matching logic to track line advancement tolerant of speech variations
- **`metrics_reporter.py`**: Ground truth comparison and reporting (accuracy, latency, precision/recall)
- **`main.py`**: Orchestration and CLI

### Flow

```
Audio File (MP3)
        ↓
  [ASR Transcriber]
  ↓              ↓
Full Text    Word Timings (Ground Truth)
        ↓
   [Streaming Simulator]
        ↓
  Chunks of Words
        ↓
 [Lyric Matcher]
        ↓
Line Advancements (Detected)
        ↓
[Metrics Comparison]
        ↓
Report: Accuracy, Latency, Go/No-Go
```

## Setup

### Prerequisites

- Python 3.9+
- macOS (tested; works on Linux/Windows too)
- ~2GB free disk space (for Whisper models)

### Installation

```bash
cd scripts/live-asr-spike

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# First run will download Whisper-base model (~140MB)
```

> **Note**: PyTorch will download CUDA drivers or CPU binaries (~2GB). On first run, expect 5-10 min for model download + compilation.

## Usage

### Quick Start (Vocal Only)

```bash
python main.py \
  --audio /Users/jorgevallejos/Chango\ Pepper/songs/audio/Tragedia\ de\ Cerdo\ Asado\ -\ voice.mp3 \
  --song /Users/jorgevallejos/Chango\ Pepper/songs/tragedia-de-cerdo-asado.json \
  --model base
```

### With Different Models

```bash
# Faster (lower accuracy)
python main.py --audio <audio> --song <song> --model tiny

# Higher accuracy (slower)
python main.py --audio <audio> --song <song> --model small

# Best accuracy (slow, ~5min on CPU)
python main.py --audio <audio> --song <song> --model medium
```

### With Mixed Audio (Voice + Guitar)

For testing robustness to instrumental bleed, create or find a mixed version:

```bash
# If you have a full mix:
python main.py \
  --audio /path/to/tragedia-full-mix.mp3 \
  --song /Users/jorgevallejos/Chango\ Pepper/songs/tragedia-de-cerdo-asado.json
```

## Output

### Console Report

```
================================================================================
ASR Lyric-Following Results (Vocal Only)
================================================================================

Summary:
  Ground truth lines:  36
  Detected lines:      34
  Matched:             31
  Missed:              5
  False positives:     3

Metrics:
  Accuracy:            86.1%
  Precision:           91.2%
  Recall:              86.1%
  On-time (±500ms):    80.6% (25/31)

Latency (seconds):
  Mean:                +0.045s  (45ms late on average)
  Std Dev:             0.223s
  Min (early):         -0.512s
  Max (late):          +0.687s

[Detailed matched lines table]
[Missed lines]
[False positives]

================================================================================
GO/NO-GO ASSESSMENT:
================================================================================
✅ GO: Strong results for live following
   - 86% accuracy (target: ≥85%)
   - 81% on-time within ±500ms (target: ≥75%)
```

### CSV Export

`Tragedia_de_Cerdo_Asado_-_voice_results.csv` with per-line details:
- Ground truth time vs detected time
- Latency for each line
- Status (on-time, late, missed)

## Interpretation

### Metrics

- **Accuracy**: % of ground-truth lines we detected (recall)
- **Precision**: % of detections that were actually correct
- **Recall**: Same as accuracy (% of ground truth found)
- **Latency**: How early/late we detected each line
  - Negative = early (singer ahead of transcription)
  - Positive = late (transcription lag)
  - On-time = within ±500ms

### Go/No-Go Thresholds

| Condition | Assessment |
|-----------|-----------|
| Accuracy ≥85% + On-time ≥75% | ✅ GO: Live following feasible |
| Accuracy 70-84% + On-time 50-74% | ⚠️ CONDITIONAL: Needs tuning |
| Accuracy <70% or On-time <50% | ❌ NO-GO: Insufficient for live use |

## Tuning Knobs

### In `lyric_matcher.py`

- **`min_words_needed`**: How many leading words of next line must match to advance (default: 2)
  - Lower = faster advancement but more false positives
  - Higher = fewer false positives but might miss quick singers
- **`fuzzy_match_threshold`**: Similarity score to accept a match (default: 0.75)
  - Lower = more lenient to mis-hearings but more false positives
  - Higher = stricter matching but might miss accented/slurred words

### In `main.py`

- **`chunk_duration`**: Streaming chunk size (default: 2.0s)
  - Smaller chunks = lower latency but more noise
  - Larger chunks = more context but higher latency
- **Streaming simulation**: Modify `asr.simulate_streaming()` to replay at different speeds or with added noise

## Limitations & Future Work

### Current Limitations

1. **No voice activity detection (VAD)**: Guitar or other instruments can trigger false detections
2. **Sequential matching**: Assumes lyrics are sung in order (no jumping around)
3. **Single-language**: Spanish only (easily extensible to other languages)
4. **Blocking ASR**: Full file transcription before streaming simulation (vs. true streaming)

### Next Steps

1. **Add VAD**: Skip instrumental sections using Silero VAD or similar
2. **Implement true streaming**: Use streaming Whisper API (via Ollama or similar)
3. **Guitar bleed test**: Create or source a full mix; measure degradation
4. **Latency smoothing**: Add predictive lookahead or post-processing to reduce jitter
5. **Integration**: Wire lyric matching into Electron Control → Projection window via WebSocket
6. **A/B testing**: Compare to fixed-timeline approach at concert time

## Development Notes

### Testing

```bash
# Add unit tests as needed
python -m pytest lyric_matcher_test.py
```

### Debugging

Set `verbose=True` in asr_transcriber.py or add print statements in lyric_matcher.py to trace matching:

```python
# In main.py, after each chunk:
print(f"Buffer: {matcher.transcription_buffer}")
print(f"Current line: {matcher.current_line_idx}")
```

### Performance

- **tiny model** (~39MB): ~1 min for 3-min song (fast but ~65% accuracy)
- **base model** (~140MB): ~3 min for 3-min song (good balance)
- **small model** (~461MB): ~6 min for 3-min song (higher accuracy)
- **medium model** (~1.5GB): ~15 min for 3-min song (highest accuracy, CPU only)

Use GPU (`device="cuda"`) if available to speed up 5-10x.

## References

- **Whisper-timestamped**: https://github.com/linto-ai/whisper-timestamped
- **OpenAI Whisper**: https://github.com/openai/whisper
- **Silero VAD**: https://github.com/snakers4/silero-vad (for future work)
