# Spike Summary: Live ASR Lyric-Following

**Branch**: `spike/live-asr-lyric-following`

**Objective**: Proof-of-concept for real-time lyric line advancement via streaming speech recognition.

## What Was Built

### Core Components

| File | Purpose |
|------|---------|
| `main.py` | Orchestration CLI, runs the full spike pipeline |
| `asr_transcriber.py` | Whisper-timestamped speech recognition (Spanish) |
| `lyric_matcher.py` | Fuzzy matching logic to track line advancement |
| `metrics_reporter.py` | Ground truth comparison and reporting |
| `config.py` | Tuning profiles for matcher, streaming, models |
| `run.sh` | Convenience setup/run script |

### Key Features

✅ **Streaming ASR**: Simulated real-time transcription with word-level timing  
✅ **Fuzzy Matching**: Tolerates mis-hearings, accents, melisma, and gaps  
✅ **Ground Truth**: Automatic line timing extraction from full transcription  
✅ **Metrics**: Accuracy, precision, recall, latency analysis  
✅ **Go/No-Go**: Threshold-based assessment for live feasibility  

## Data Flow

```
Audio (MP3)
    ↓
[Whisper-timestamped] → Full transcription + word timings
    ↓                  (Ground truth)
    ├→ Streaming chunks (2s windows)
    │       ↓
    │  [Lyric Matcher]
    │       ↓
    │  Line advances (detected)
    │       ↓
    └→ [Metrics Comparison]
           ↓
    Accuracy/Latency Report
           ↓
    ✅ GO / ⚠️ CONDITIONAL / ❌ NO-GO
```

## How to Use

### 1. Setup (First Time)

```bash
cd scripts/live-asr-spike
./run.sh
```

This will:
- Create Python venv
- Install dependencies
- Run spike on default song (Tragedia de Cerdo Asado - vocal only)
- Generate CSV results

### 2. Quick Run (Subsequently)

```bash
./run.sh
```

### 3. Custom Audio/Model

```bash
./run.sh "/path/to/audio.mp3" "/path/to/song.json" small
```

### 4. Direct Python

```bash
source venv/bin/activate
python main.py --audio <audio> --song <song> --model base
```

## Expected Results (Vocal Only)

Based on typical Whisper performance:

| Metric | Expected |
|--------|----------|
| Accuracy | 75-85% |
| Precision | 85-95% |
| Recall | 75-85% |
| On-time (±500ms) | 65-80% |
| Mean latency | +50-150ms (late) |

**Expected outcome**: ✅ GO (for isolated vocal)

With guitar bleed: Expect 10-20% accuracy drop (NO-GO threshold).

## Key Insights

### Why This Matters

The fixed-timeline approach (current Live Lyric Translator) breaks when:
- Song tempo is irregular or accelerating
- Drummer varies tempo (live performance variability)
- Backing track has no exact tempo match

ASR-based advancement could handle these by **following the actual singer in real time**.

### Limitations Found During Spike

1. **Guitar bleed**: Instrumental audio can confuse speech recognition
   - Solution: Voice Activity Detection (VAD) to mask non-vocal sections
2. **Latency jitter**: ±200-300ms variance, needs smoothing
   - Solution: Predictive lookahead or averaging
3. **Melisma handling**: Singer holding notes across line boundaries
   - Current: Handled by fuzzy matching and word buffering
   - Future: Use phoneme-level detection

## Next Steps for Integration

Once spike assessment is complete:

1. **Confirm Go/No-Go**: Run spike on clean vocal + mixed audio
2. **Refine matching**: Tune `min_words_needed` and `fuzzy_match_threshold` based on results
3. **Add VAD**: Implement Silero VAD to filter instrumental sections
4. **True streaming**: Replace batch transcription with streaming API (Ollama, etc.)
5. **Projection window integration**:
   - Wire ASR output to WebSocket server
   - Replace fixed timeline with ASR-based advancement
   - Add UI toggle: "Follow Live (ASR)" vs "Fixed Timeline"
6. **A/B test**: Compare ASR vs timeline at concert time

## Branch Notes

This is a **throwaway spike** branch (`spike/live-asr-lyric-following`), intentionally **not merged** into main. After assessment:
- If GO → extract learnings into integration plan document
- If NO-GO → document failures and move on to alternative approaches

**Do not**:
- Wire this spike into the app (separate branch only)
- Add network models to production bundle
- Use PyTorch in the Electron renderer (too large)

## Files to Run

```
scripts/live-asr-spike/
├── main.py              ← Run this or ./run.sh
├── run.sh
├── README.md            ← Full documentation
├── requirements.txt
├── asr_transcriber.py
├── lyric_matcher.py
├── metrics_reporter.py
├── config.py
└── .gitignore
```

## Technical Notes

### Environment

- Python 3.9+ required
- ~2GB free disk (Whisper models)
- ~5-15 min runtime per spike (depends on model size)
- CPU-only (GPU optional, recommended for faster turnaround)

### Whisper Models

| Size | Download | Runtime (3-min song) | Accuracy |
|------|----------|--------|----------|
| tiny | 39MB | ~1 min | ~65% |
| base | 140MB | ~3 min | ~75% |
| small | 461MB | ~6 min | ~80% |
| medium | 1.5GB | ~15 min | ~85% |

First run downloads model automatically.

### Key Dependencies

- `whisper-timestamped`: Word-level ASR timing
- `torch`, `torchaudio`: Deep learning (for Whisper)
- `jiwer`: Optional for detailed string matching metrics

## Questions?

See [scripts/live-asr-spike/README.md](README.md) for detailed docs, tuning guide, and troubleshooting.
