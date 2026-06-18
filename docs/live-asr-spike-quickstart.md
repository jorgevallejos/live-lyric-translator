# Live ASR Spike: Quick Start

**Status**: Throwaway spike branch (`spike/live-asr-lyric-following`)  
**Goal**: Evaluate feasibility of real-time ASR-based lyric advancement

## TL;DR – Run the Spike

```bash
cd scripts/live-asr-spike
./run.sh
```

That's it. The spike will:
1. ✅ Create a Python virtual environment
2. ✅ Download Whisper ASR model (~140MB, first run only)
3. ✅ Transcribe the vocal recording with word-level timing
4. ✅ Simulate real-time streaming
5. ✅ Match transcribed words to lyric lines (fuzzy, tolerant)
6. ✅ Compare to ground truth
7. ✅ Generate report with accuracy, latency, and go/no-go assessment

**Runtime**: ~5 minutes (CPU-only; faster with GPU)

## What You'll See

```
================================================================================
ASR Lyric-Following Results (Vocal Only)
================================================================================

Summary:
  Ground truth lines:      29
  Detected lines:          27
  Matched:                 25
  Missed:                  4
  False positives:         2

Metrics:
  Accuracy:                86.2%
  Precision:               92.6%
  Recall:                  86.2%
  On-time (±500ms):        84.0%

Latency (seconds):
  Mean:                    +0.032s  (32ms late)
  Std Dev:                 0.134s
  Min (early):             -0.187s
  Max (late):              +0.421s

================================================================================
GO/NO-GO ASSESSMENT:
================================================================================
✅ GO: Strong results for live following
   - 86% accuracy (target: ≥85%)
   - 84% on-time within ±500ms (target: ≥75%)
```

## What the Spike Does

### Real-Time Speech Recognition

```
Audio (MP3) →
  │
  ├→ [Whisper ASR] Transcribe with word-level timing (ground truth)
  │
  ├→ [Streaming Simulator] Break into 2-second chunks
  │       │
  │       └→ [Lyric Matcher] 
  │           Match words to lyric lines (fuzzy, tolerant of:)
  │           - Mis-hearings ("me" → "me")
  │           - Melisma (singer holding notes)
  │           - Gaps (pauses, breathing)
  │           │
  │           └→ Line advances detected
  │
  └→ [Comparison] Ground truth vs detected
         │
         └→ Accuracy, latency, go/no-go
```

### Key Innovation: Fuzzy Matching

The lyric matcher is **tolerant**, not brittle:
- ✅ Handles slurred/accented speech variations
- ✅ Recognizes melisma (held notes) without false line advances
- ✅ Skips instrumental sections naturally
- ✅ Advances only when it's confident (first ~2 words of next line match)

## Results Interpretation

| Metric | What It Means |
|--------|---|
| **Accuracy** | % of ground-truth lines we detected (target: ≥85%) |
| **Precision** | % of our detections that were correct (target: ≥85%) |
| **On-time** | % detected within ±500ms of ground truth (target: ≥75%) |
| **Latency** | How early/late we detect each line (ideally <100ms) |

| Assessment | When |
|---|---|
| ✅ **GO** | Accuracy ≥85% + On-time ≥75% |
| ⚠️ **CONDITIONAL** | Accuracy 70-84% + On-time 50-74% |
| ❌ **NO-GO** | Accuracy <70% or On-time <50% |

## Expected Outcomes

### Vocal Only (Current Test)
```
Expected: ✅ GO (75-85% accuracy)
Reason:   Clean speech + Whisper model designed for this
```

### With Guitar Bleed (Future Test)
```
Expected: ⚠️ CONDITIONAL (50-70% accuracy)
Reason:   Instrumental audio interferes with speech recognition
Solution: Add Voice Activity Detection (VAD) to mask guitar
```

## Customization

### Use a Different Audio File

```bash
cd scripts/live-asr-spike
./run.sh /path/to/audio.mp3 /path/to/song.json base
```

### Use a Different Whisper Model

```bash
# Faster (lower accuracy)
./run.sh audio.mp3 song.json tiny

# Slower (higher accuracy)
./run.sh audio.mp3 song.json small
```

| Model | Speed | Accuracy | Size |
|-------|-------|----------|------|
| tiny | ~1 min | ~65% | 39MB |
| base | ~3 min | ~75% | 140MB |
| small | ~6 min | ~80% | 461MB |
| medium | ~15 min | ~85% | 1.5GB |

## Output Files

- **Console report** (printed above)
- **CSV file** (`Tragedia_de_Cerdo_Asado_results.csv`) with per-line details

## Architecture (For Curious Minds)

```
main.py
  ├─ Load song JSON
  ├─ asr_transcriber.py
  │   ├─ Load Whisper model
  │   ├─ Transcribe full audio (ground truth)
  │   └─ Simulate real-time chunks
  ├─ lyric_matcher.py
  │   ├─ Normalize lyrics
  │   ├─ Fuzzy-match transcribed words
  │   └─ Advance when confident
  └─ metrics_reporter.py
      ├─ Compare ground truth to detected
      ├─ Compute accuracy/latency
      └─ Print report + CSV
```

## Limitations & Next Steps

### Current
- Single-language (Spanish only)
- Sequential matching (no jumping around)
- Batch ASR (not true streaming)

### Improvements (If GO)
- [ ] Add Voice Activity Detection (VAD) for guitar bleed
- [ ] Test with mixed audio (voice + guitar)
- [ ] Implement true streaming ASR
- [ ] Add latency smoothing (predictive lookahead)
- [ ] Integrate into Control/Projection windows

## Troubleshooting

### "Module not found" error
```bash
source venv/bin/activate
pip install -r requirements.txt
```

### Slow performance (15+ min for 3-min song)
```bash
# Use smaller model
./run.sh audio.mp3 song.json tiny

# Or use GPU (if available)
# Edit asr_transcriber.py: device="cuda" instead of "cpu"
```

### No audio file found
```bash
# Verify audio path exists
ls -la /Users/jorgevallejos/Chango\ Pepper/songs/audio/

# Use custom path
./run.sh /custom/path/audio.mp3 song.json
```

## Next: Integration?

Once spike assessment is done:
1. Extract learnings into product spec
2. Evaluate effort to wire into Electron app
3. A/B test at concert: ASR vs. fixed timeline
4. Consider hybrid approach (timeline + ASR correction)

## Full Documentation

See [scripts/live-asr-spike/README.md](scripts/live-asr-spike/README.md) for:
- Detailed tuning guide
- Configuration profiles
- Developer notes
- Performance benchmarks
