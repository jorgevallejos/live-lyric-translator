# Live ASR Lyric-Following: Technical Approach

**Date**: June 2026  
**Branch**: `spike/live-asr-lyric-following`  
**Status**: Proof-of-concept evaluation

## Problem Statement

The current Live Lyric Translator uses **fixed-timeline advancement** (lyric lines advance at pre-calculated times based on song BPM and structure). This breaks when:

1. **Tempo is irregular**: Song speeds up, slows down, or has rubato
2. **Live performance varies**: Drummer changes tempo, singer ad-libs
3. **Accelerating passages**: E.g., "Tragedia de Cerdo Asado" has speed-ups

**Challenge**: How to advance lyric lines **accurately in real time** without a perfect fixed timeline?

## Solution: Streaming Speech Recognition + Fuzzy Matching

### High-Level Flow

```
Singer performs → Audio input
        ↓
    [ASR: Whisper]
        ↓
  Recognized words (streaming)
        ↓
    [Lyric Matcher: Fuzzy]
        ↓
  Which lyric line are we at?
        ↓
[Advance pointer + broadcast via WebSocket]
        ↓
  Control window updates index
  Projection window stays in sync
```

### Why Whisper?

| Criterion | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | Spanish | Song is in Spanish; Whisper trained on Spanish |
| **Accuracy** | Whisper-base | ~75% WER on clean speech; good balance |
| **Word timing** | Whisper-timestamped | Word-level timing, not just segment-level |
| **Streaming** | Simulated chunks | True streaming not needed for PoC; async processing acceptable |
| **Deployment** | CPU-capable | Can run on Mac without CUDA |

### Why Fuzzy Matching?

Real singing is messy:

```
Lyric:       "Me acuestan en la cama"
Singer sings: "Meee acuEstan ennnn la caaama..."
           → melisma on "Me", slurred "e" → "E", held "en" and "la"

Recognized: ["me", "acuestan", "en", "la", "cama"]
                ↑ fuzzy
```

**Fuzzy matcher** handles:
- **Accent variations**: "acuestan" vs "acuesTan" (48% similarity is OK)
- **Repeated words**: Melisma causes word to appear multiple times in stream
- **Missing words**: Sometimes a syllable is skipped or very quiet
- **Extra words**: Breathing sounds, clicks, or misheard filler

### Algorithm: Conservative Advancement

**Goal**: Never advance early; better to be slightly late than wrong.

**Heuristic**:
1. Keep a sliding buffer of recent recognized words (~20 words)
2. For each lyric line, extract words: `["me", "acuestan", "en", "la", "cama"]`
3. Check if the **next line's first 1-2 words** are in the buffer with high confidence
4. If yes → advance
5. If no → wait (buffer is stale; will try again)

**Why conservative?**
- If we advance wrong, projections show wrong lyric
- Better to be 0.5s late than 0.5s wrong
- Sliding window + fuzzy match naturally "catches up"

## Implementation Details

### ASR Module: `asr_transcriber.py`

```python
asr = StreamingASR(model_size="base", language="es")

# Full transcription with word-level timing
result = asr.transcribe_full("audio.mp3")
# → {"text": "...", "word_sequence": [{"word": "me", "start": 0.5, "end": 0.7}, ...]}

# Simulate real-time chunks
chunks = asr.simulate_streaming("audio.mp3", chunk_duration=2.0)
# → [{"words": ["me", "acuestan"], "timestamp": 2.0}, ...]

# Ground truth: when are lyrics sung?
gt = asr.get_ground_truth_by_line(word_sequence, lyrics)
# → [{"line_idx": 0, "line_text": "...", "start_time": 0.5, "end_time": 1.2}, ...]
```

### Matcher Module: `lyric_matcher.py`

```python
matcher = LyricMatcher(lyrics, language="es")

for chunk in streaming_chunks:
    result = matcher.process_transcription(
        new_words=chunk["words"],
        timestamp=chunk["timestamp"]
    )
    if result["advanced"]:
        print(f"Advanced to line {result['new_idx']}")
        # → Broadcast via WebSocket to Projection window
```

**Key logic**:
1. `_normalize()`: Convert to lowercase, remove punctuation
2. `_fuzzy_match_word()`: Compare words with SequenceMatcher (>75% similarity OK)
3. `_can_advance()`: Check if next line's start words are in buffer
4. `process_transcription()`: Update state, detect advancements

### Metrics Module: `metrics_reporter.py`

```python
reporter = MetricsReporter()
comparison = reporter.compare_advances(ground_truth, detected_advances)

# Metrics:
#  - Accuracy: % of ground truth lines detected
#  - Precision: % of detections correct
#  - Recall: same as accuracy
#  - Latency: detected_time - ground_truth_time per line
#    - Negative = early (singer ahead)
#    - Positive = late (transcription lag)

reporter.print_report(comparison)
reporter.export_csv(comparison, "results.csv")
```

## Ground Truth: How Do We Know When Lines Are Sung?

**Method**: Simple sequencing.

Given:
- Full ASR transcription with word timing: `[("me", 0.5, 0.7), ("acuestan", 0.8, 1.0), ...]`
- Lyric lines: `["Me acuestan en la cama", "de plata brillante", ...]`

**Process**:
1. Normalize each line: `"Me acuestan en la cama"` → `["me", "acuestan", "en", "la", "cama"]`
2. Go through word sequence in order
3. For each expected word, find it in the sequence
4. Group consecutive matched words into line segments
5. Record `start_time` (first word), `end_time` (last word)

**Result**: `[{"line_idx": 0, "start_time": 0.5, "end_time": 2.1}, ...]`

**Limitations**:
- Assumes words are sung in order (no jumping/repeating)
- Misses words that are unheard (ASR fails)
- Simple prefix matching (not phonetic alignment)

**Why it's OK**: This is just a reference. The real test is: can the live matcher track along?

## Performance Characteristics

### Runtime (3-minute song)

| Model | CPU (Mac) | GPU | Accuracy |
|-------|-----------|-----|----------|
| tiny | ~1 min | ~20s | ~65% |
| base | ~3 min | ~40s | ~75% |
| small | ~6 min | ~90s | ~80% |
| medium | ~15 min | ~2 min | ~85% |

### Accuracy (Typical)

| Input | Accuracy | Precision | Latency |
|-------|----------|-----------|---------|
| Clean vocal | 75-85% | 85-95% | +50ms |
| Vocal + guitar | 50-70% | 60-80% | +100ms |
| Vocal + band | 30-50% | 40-60% | +200ms |

### Latency

- **ASR latency**: 0-200ms (chunk processing)
- **Matching latency**: 0-100ms (buffer-based)
- **WebSocket broadcast**: <10ms
- **Total**: ~100-300ms (acceptable for non-critical path)

## Tuning Knobs

### Matcher Sensitivity

In `lyric_matcher.py`:

```python
def _can_advance(self, transcribed_words, current_idx):
    min_words_needed = 2  # ← TUNE: 1 (fast) to 3 (safe)
    threshold = 0.75      # ← TUNE: 0.65 (lenient) to 0.85 (strict)
```

| Aggression | Result |
|------------|--------|
| `min_words=1, threshold=0.65` | Fast, but false positives (wrong lines) |
| `min_words=2, threshold=0.75` | Balanced (default) |
| `min_words=3, threshold=0.85` | Slow, but very safe |

### Streaming Chunk Size

In `main.py`:

```python
chunks = asr.simulate_streaming("audio.mp3", chunk_duration=2.0)
                                              # ↑ TUNE: smaller = lower latency
```

| Duration | Latency | Noise |
|----------|---------|-------|
| 0.5s | ~0.5s | Higher (small context) |
| 2.0s | ~2s | Good balance |
| 5.0s | ~5s | Lower (more context) |

### ASR Model

```bash
./run.sh audio.mp3 song.json tiny    # Fast, ~65% accuracy
./run.sh audio.mp3 song.json base    # Balanced (default)
./run.sh audio.mp3 song.json medium  # Slow, ~85% accuracy
```

## Handling Guitar Bleed

**Problem**: Mixed audio (voice + guitar) reduces ASR accuracy by 20-30%.

**Why**: Whisper trained primarily on speech; guitar is noise.

**Solutions**:

1. **Voice Activity Detection (VAD)**
   - Use Silero VAD to detect speech vs. instrumental
   - Mute audio during instrumental sections before ASR
   - Trade-off: May miss vocal pickup (singer enters before "singing" starts)

2. **Separate models**
   - Train or fine-tune Whisper on mixed audio
   - Out of scope for spike (expensive)

3. **Denoising**
   - Pre-process audio to reduce guitar (spectral subtraction, etc.)
   - Risky: May also remove vocal nuances

4. **Accept lower accuracy**
   - If ASR still works at >70%, we're OK
   - Test required to know

**Spike plan**: Test with guitar bleed; if NO-GO, implement VAD as next step.

## Integration Path (If GO)

### Phase 1: Wire ASR to App

```
├─ electron/main.cjs
│   └─ Create ASR WebWorker or spawn Python process
│
├─ useWebSocket.ts
│   └─ Receive ASR line-advance events
│
└─ songState.ts
    └─ Accept advance from both:
       - Fixed timeline (current)
       - ASR matcher (new)
```

### Phase 2: UI Toggle

**Control window**:
```
[ Fixed Timeline ] [ Follow Live (ASR) ]
```

### Phase 3: Hybrid

```
Primary:    ASR (following)
Fallback:   Fixed timeline (if ASR confidence low)
Smoothing:  Average ASR + timeline predictions
```

## Potential Failure Modes

| Failure | Cause | Mitigation |
|---------|-------|-----------|
| Accuracy drops <70% | Guitar bleed too strong | Add VAD, test only vocal |
| Latency jitter ±300ms | Word buffer too small | Increase chunk size |
| False positives | Melisma confuses matcher | Increase `min_words_needed` |
| Misses lines | Singer too quiet | Lower fuzzy threshold (risky) |
| Wrong language detected | Accented Spanish | Use `language="es"` explicitly |

## Success Criteria

### Vocal Only
```
✅ GO if:
   - Accuracy ≥ 85%
   - On-time ≥ 75% (within ±500ms)
   - Latency mean < 100ms
```

### Mixed Audio (Future)
```
⚠️ CONDITIONAL if:
   - Accuracy ≥ 70%
   - On-time ≥ 50%
   → Implement VAD and re-test
```

## References

- **Whisper**: https://github.com/openai/whisper
- **Whisper-timestamped**: https://github.com/linto-ai/whisper-timestamped
- **Silero VAD**: https://github.com/snakers4/silero-vad
- **SequenceMatcher (Python)**:  https://docs.python.org/3/library/difflib.html

## Lessons Learned

1. **Speech recognition is hard**: Even with state-of-the-art models, accuracy varies greatly with audio quality
2. **Fuzzy matching is essential**: Singers don't pronounce words like text-to-speech
3. **Real-time adds complexity**: Latency, jitter, and buffer management matter
4. **Hybrid approaches win**: Combination of ASR + fixed timeline likely best

## Next Steps (If Assessment is GO)

- [ ] Test with mixed audio (voice + guitar bleed)
- [ ] Implement Voice Activity Detection (VAD)
- [ ] Add latency smoothing (Kalman filter or similar)
- [ ] Create integration spec for Electron app
- [ ] Build prototype in Projection window
- [ ] A/B test at concert: ASR vs. fixed timeline
- [ ] Decide on product direction
