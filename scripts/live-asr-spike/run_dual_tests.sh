#!/bin/bash
# Run both vocal-only tests (auto-derived + hand-marked ground truth if available)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Live ASR Spike: Dual Ground Truth Test"
echo "======================================"
echo ""

# Activate venv
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Install deps
pip install -q --upgrade pip 2>/dev/null || true
pip install -q -r requirements.txt 2>/dev/null || true

# Default paths
SONGS_DIR="/Users/jorgevallejos/Chango Pepper/songs"
AUDIO_VOCAL="$SONGS_DIR/audio/Tragedia de Cerdo Asado - voice.mp3"
SONG_FILE="$SONGS_DIR/tragedia-de-cerdo-asado.json"
GROUND_TRUTH_FILE="$SCRIPT_DIR/ground-truth.json"

# Check files exist
if [ ! -f "$AUDIO_VOCAL" ]; then
    echo "Error: Vocal audio not found: $AUDIO_VOCAL"
    exit 1
fi

if [ ! -f "$SONG_FILE" ]; then
    echo "Error: Song file not found: $SONG_FILE"
    exit 1
fi

echo "Test Configuration:"
echo "  Audio (vocal): $AUDIO_VOCAL"
echo "  Song file:     $SONG_FILE"
echo "  Ground truth:  $GROUND_TRUTH_FILE (optional)"
echo ""

# ============================================================================
# TEST 1: Vocal only with AUTO-DERIVED ground truth
# ============================================================================
echo ""
echo "=================================="
echo "TEST 1: Vocal Only (Auto-Derived GT)"
echo "=================================="
python main.py \
    --audio "$AUDIO_VOCAL" \
    --song "$SONG_FILE" \
    --model base \
    --label "Vocal_Auto"

# ============================================================================
# TEST 2: Vocal only with HAND-MARKED ground truth (if available)
# ============================================================================
if [ -f "$GROUND_TRUTH_FILE" ]; then
    echo ""
    echo "=================================="
    echo "TEST 2: Vocal Only (Hand-Marked GT)"
    echo "=================================="
    python main.py \
        --audio "$AUDIO_VOCAL" \
        --song "$SONG_FILE" \
        --model base \
        --ground-truth "$GROUND_TRUTH_FILE" \
        --label "Vocal_Manual"
else
    echo ""
    echo "=================================="
    echo "TEST 2: Hand-Marked Ground Truth"
    echo "=================================="
    echo "To run with hand-marked ground truth:"
    echo ""
    echo "  1. Copy ground-truth-template.json → ground-truth.json"
    echo "  2. Edit ground-truth.json: Fill in start_time for each line"
    echo "     (Use the vocal recording to mark when each line starts)"
    echo ""
    echo "  3. Run again:"
    echo "     ./run_dual_tests.sh"
    echo ""
fi

echo ""
echo "=========================================="
echo "Tests complete! Check results above."
echo "=========================================="
