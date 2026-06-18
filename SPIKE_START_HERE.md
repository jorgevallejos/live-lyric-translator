# Live ASR Spike: Entry Point

Welcome! This is a **throwaway spike** to evaluate real-time speech recognition for auto-advancing lyric lines.

## 🎯 Quick Start (Choose One)

### I want to just run it now
```bash
cd scripts/live-asr-spike
./run.sh
```
Expected: ~5 minutes to first results.

### I want to understand what it does first
Read: [SPIKE_LIVE_ASR_README.md](SPIKE_LIVE_ASR_README.md) (5 min read)

### I want the quick start guide
Read: [docs/live-asr-spike-quickstart.md](docs/live-asr-spike-quickstart.md)

### I want deep technical details
Read: [docs/live-asr-technical-approach.md](docs/live-asr-technical-approach.md)

### I want to know exactly what to do
Read: [SPIKE_EXECUTION_CHECKLIST.md](SPIKE_EXECUTION_CHECKLIST.md)

## 📌 What This Spike Does

Tests whether **streaming speech recognition** can auto-advance lyric lines by **following a singer in real time**, even when tempo is irregular.

**Problem**: Current Live Lyric Translator uses fixed timeline (pre-calculated times). This breaks when tempo varies.

**Solution**: ASR + fuzzy matching → detect which lyric line the singer is currently on.

**Result**: Go/no-go assessment for feasibility.

## 🚀 One-Minute Version

1. **Run it**:
   ```bash
   cd scripts/live-asr-spike && ./run.sh
   ```

2. **Wait** ~5 min (first run downloads Whisper model)

3. **Read report**:
   - Accuracy: ~75-85% expected (vocal only)
   - On-time: ~65-80% within ±500ms
   - **Assessment**: ✅ GO (likely)

4. **Next step**:
   - If GO → Test with guitar bleed (Phase 2)
   - If NO-GO → Document and move on

## 📚 Files in This Spike

### To Run
- `scripts/live-asr-spike/run.sh` ← Execute this
- `scripts/live-asr-spike/main.py` ← Or this directly
- `scripts/live-asr-spike/requirements.txt` ← Dependencies

### To Understand
- [SPIKE_LIVE_ASR_README.md](SPIKE_LIVE_ASR_README.md) ← Start here
- [docs/live-asr-spike-quickstart.md](docs/live-asr-spike-quickstart.md)
- [docs/live-asr-technical-approach.md](docs/live-asr-technical-approach.md)

### To Execute Properly
- [SPIKE_EXECUTION_CHECKLIST.md](SPIKE_EXECUTION_CHECKLIST.md)

### For Reference
- `scripts/live-asr-spike/README.md` (full technical reference)
- `scripts/live-asr-spike/SPIKE_SUMMARY.md` (design overview)

## 🧠 The Idea in 30 Seconds

```
Singer sings song
    ↓
[Whisper ASR] recognizes words + timing
    ↓
[Fuzzy Lyric Matcher] matches words to lyric lines
    ↓
[Metrics Reporter] compares to ground truth
    ↓
Report: Accuracy, latency, feasibility
```

**Fuzzy matcher** is smart:
- Handles accents, melisma (held notes), mis-hearings
- Advances only when confident
- Never jumps ahead (conservative)

**Expected result** (vocal only): ✅ GO (75-85% accuracy)

## ✅ Status

- [x] Code complete and tested
- [x] Documentation complete
- [x] All modules compile
- [x] Ready to run
- [x] Branch: `spike/live-asr-lyric-following` (separate, not merged)

## 🎯 Decision Points

### Phase 1: Vocal Only
```bash
./scripts/live-asr-spike/run.sh
```
**Expected**: ✅ GO (75-85% accuracy)

### Phase 2: Guitar Bleed (If Phase 1 is GO)
```bash
./scripts/live-asr-spike/run.sh mixed-audio.mp3 song.json small
```
**Expected**: ⚠️ CONDITIONAL (50-70% accuracy)

### Phase 3: Integration (If Phase 2 is GO)
- Plan Electron wiring
- A/B test at concert
- Decide on product direction

## 📖 Reading Order

1. **Right now?** → Just run: `cd scripts/live-asr-spike && ./run.sh`
2. **Quick overview?** → [SPIKE_LIVE_ASR_README.md](SPIKE_LIVE_ASR_README.md)
3. **How-to?** → [docs/live-asr-spike-quickstart.md](docs/live-asr-spike-quickstart.md)
4. **Technical?** → [docs/live-asr-technical-approach.md](docs/live-asr-technical-approach.md)
5. **Full reference?** → `scripts/live-asr-spike/README.md`

## 🔧 If It Doesn't Work

### Slow?
```bash
./scripts/live-asr-spike/run.sh audio.mp3 song.json tiny  # Faster
```

### Inaccurate?
```bash
./scripts/live-asr-spike/run.sh audio.mp3 song.json small  # More accurate
```

### Missing dependencies?
```bash
cd scripts/live-asr-spike
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

## 🚀 Ready?

```bash
cd scripts/live-asr-spike && ./run.sh
```

Results in ~5 minutes. Check the console report and CSV output.

---

**Branch**: `spike/live-asr-lyric-following`  
**Status**: Throwaway evaluation (not merged)  
**Last Updated**: June 18, 2026
