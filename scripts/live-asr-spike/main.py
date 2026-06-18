#!/usr/bin/env python3
"""
Live ASR Lyric-Following Spike

Tests whether streaming speech recognition can auto-advance lyric lines
by following a singer in real-time, with tolerance for mis-hearings,
melisma, and gaps.

Usage:
    python main.py --audio <audio_path> --song <song_json_path> [--model base|small|medium]
    
Example:
    python main.py \\
        --audio /path/to/tragedia-voice.mp3 \\
        --song /path/to/tragedia-de-cerdo-asado.json \\
        --model base
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict

from asr_transcriber import StreamingASR
from lyric_matcher import LyricMatcher
from metrics_reporter import MetricsReporter


def load_song(song_path: str) -> Dict:
    """Load song JSON file."""
    with open(song_path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_spanish_lyrics(song_data: Dict) -> List[str]:
    """Extract Spanish lyrics from song JSON."""
    lyrics = []
    for lyric_entry in song_data.get("lyrics", []):
        if "es" in lyric_entry:
            lyrics.append(lyric_entry["es"])
    return lyrics


def run_spike(audio_path: str, song_path: str, model_size: str = "base"):
    """Run the ASR lyric-following spike."""

    print(f"\n{'='*80}")
    print("LIVE ASR LYRIC-FOLLOWING SPIKE")
    print(f"{'='*80}")

    # Load song
    print(f"\n1. Loading song from {song_path}...")
    song_data = load_song(song_path)
    lyrics = extract_spanish_lyrics(song_data)
    print(f"   Loaded {len(lyrics)} Spanish lyric lines")
    print(f"   Title: {song_data.get('title', 'Unknown')}")
    print(f"   Tempo: {song_data.get('tempo', {}).get('bpm', '?')} BPM")

    # Initialize ASR
    print(f"\n2. Initializing ASR (Whisper-{model_size}, Spanish)...")
    asr = StreamingASR(model_size=model_size, language="es")

    # Get ground truth (word-level timings)
    print(f"\n3. Transcribing audio to get ground truth...")
    result = asr.transcribe_full(audio_path)
    print(f"   Full transcription: {result['text'][:100]}...")
    print(f"   Found {len(result['word_sequence'])} words with timing")

    ground_truth = asr.get_ground_truth_by_line(result["word_sequence"], lyrics)
    print(f"   Mapped to {len(ground_truth)} ground truth line timings")

    # Simulate real-time streaming
    print(f"\n4. Simulating real-time streaming (chunk duration: 2.0s)...")
    streaming_chunks = asr.simulate_streaming(audio_path, chunk_duration=2.0)
    print(f"   Generated {len(streaming_chunks)} streaming chunks")

    # Process streaming chunks with lyric matcher
    print(f"\n5. Processing streaming chunks with lyric matcher...")
    matcher = LyricMatcher(lyrics, language="es")
    detected_advances = []

    for i, chunk in enumerate(streaming_chunks):
        words = chunk["words"]
        timestamp = chunk["timestamp"]

        result = matcher.process_transcription(words, timestamp)

        if result["advanced"]:
            print(
                f"   [Chunk {i:2d}, t={timestamp:6.2f}s] Advanced to line {result['new_idx']:2d}: {result['current_line'][:50]}"
            )
            detected_advances.append(
                {
                    "line_idx": result["new_idx"],
                    "timestamp": timestamp,
                }
            )

    print(f"\n   Total advancements detected: {len(detected_advances)}")

    # Compare to ground truth
    print(f"\n6. Computing metrics...")
    reporter = MetricsReporter()
    comparison = reporter.compare_advances(ground_truth, detected_advances)

    # Print report
    reporter.print_report(comparison, title="ASR Lyric-Following Results (Vocal Only)")

    # Export CSV
    output_csv = Path(audio_path).stem + "_results.csv"
    reporter.export_csv(comparison, output_csv)

    print(f"\n{'='*80}")
    print("GO/NO-GO ASSESSMENT:")
    print(f"{'='*80}")

    accuracy = comparison["metrics"]["accuracy"]
    recall = comparison["metrics"]["recall"]
    on_time_pct = comparison["metrics"]["on_time_pct"]

    if accuracy >= 0.85 and on_time_pct >= 75:
        print(f"✅ GO: Strong results for live following")
        print(
            f"   - {accuracy:.0%} accuracy (target: ≥85%)"
        )
        print(f"   - {on_time_pct:.0f}% on-time within ±500ms (target: ≥75%)")
    elif accuracy >= 0.70 and on_time_pct >= 50:
        print(f"⚠️  CONDITIONAL GO: Acceptable with tuning")
        print(
            f"   - {accuracy:.0%} accuracy (target: ≥85%)"
        )
        print(f"   - {on_time_pct:.0f}% on-time within ±500ms (target: ≥75%)")
        print(f"   Recommendations:")
        print(f"   - Tune fuzzy match threshold in LyricMatcher")
        print(f"   - Increase streaming chunk size for better context")
        print(f"   - Smooth latency with prediction/lookahead")
    else:
        print(f"❌ NO-GO: Results insufficient for reliable live following")
        print(
            f"   - {accuracy:.0%} accuracy (target: ≥85%)"
        )
        print(f"   - {on_time_pct:.0f}% on-time within ±500ms (target: ≥75%)")
        print(f"   Recommendations:")
        print(f"   - Guitar bleed may be interfering (test with isolated vocal)")
        print(
            f"   - Consider larger ASR model (medium/large) for better accuracy"
        )
        print(f"   - Implement voice activity detection (VAD) to skip instrumental")

    print(f"\n{'='*80}\n")

    return comparison


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Live ASR Lyric-Following Spike",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--audio",
        required=True,
        help="Path to audio file (MP3, WAV, etc.)",
    )
    parser.add_argument(
        "--song",
        required=True,
        help="Path to song JSON file",
    )
    parser.add_argument(
        "--model",
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (default: base)",
    )

    args = parser.parse_args()

    run_spike(args.audio, args.song, args.model)
