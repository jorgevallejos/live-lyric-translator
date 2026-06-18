#!/bin/bash
# Quick setup and run script for live ASR spike

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Live ASR Lyric-Following Spike"
echo "=============================="
echo ""

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install/update requirements
echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Run main spike
echo ""
echo "Starting spike..."
echo ""

# Default paths (adjust as needed)
SONGS_DIR="/Users/jorgevallejos/Chango Pepper/songs"
AUDIO_FILE="$SONGS_DIR/audio/Tragedia de Cerdo Asado - voice.mp3"
SONG_FILE="$SONGS_DIR/tragedia-de-cerdo-asado.json"

# Check if files exist
if [ ! -f "$AUDIO_FILE" ]; then
    echo "Error: Audio file not found: $AUDIO_FILE"
    echo ""
    echo "Usage: ./run.sh [audio_path] [song_path] [model]"
    echo ""
    echo "Example:"
    echo "  ./run.sh \"$AUDIO_FILE\" \"$SONG_FILE\" base"
    exit 1
fi

if [ ! -f "$SONG_FILE" ]; then
    echo "Error: Song file not found: $SONG_FILE"
    exit 1
fi

# Allow override via command-line args
if [ ! -z "$1" ]; then
    AUDIO_FILE="$1"
fi
if [ ! -z "$2" ]; then
    SONG_FILE="$2"
fi
if [ ! -z "$3" ]; then
    MODEL="$3"
else
    MODEL="base"
fi

echo "Running with:"
echo "  Audio:  $AUDIO_FILE"
echo "  Song:   $SONG_FILE"
echo "  Model:  $MODEL"
echo ""

python main.py \
    --audio "$AUDIO_FILE" \
    --song "$SONG_FILE" \
    --model "$MODEL"

echo ""
echo "Done! Check the .csv file for detailed results."
