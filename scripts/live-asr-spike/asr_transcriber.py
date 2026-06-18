"""
Streaming ASR (Automatic Speech Recognition) module.

Uses whisper-timestamped for word-level timing in Spanish.
"""

import whisper_timestamped as whisper
from typing import List, Dict, Optional, Tuple
import numpy as np


class StreamingASR:
    """
    Streaming ASR using whisper-timestamped for word-level precision.
    """

    def __init__(self, model_size: str = "base", language: str = "es"):
        """
        Initialize ASR model.

        Args:
            model_size: "tiny", "base", "small", "medium", "large"
            language: Language code ("es" for Spanish, etc.)
        """
        self.model_size = model_size
        self.language = language
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load the Whisper model."""
        print(f"Loading Whisper-{self.model_size} model for {self.language}...")
        self.model = whisper.load_model(
            self.model_size, device="cpu"  # Use "cuda" if available
        )
        print("Model loaded.")

    def transcribe_full(self, audio_path: str) -> Dict:
        """
        Transcribe entire audio file with word-level timestamps.

        Returns:
            {
                "text": full transcription,
                "segments": list of segments with timing,
                "word_sequence": [(word, start_time, end_time), ...],
            }
        """
        print(f"Transcribing {audio_path}...")
        result = whisper.transcribe_timestamped(
            self.model,
            audio_path,
            language=self.language,
            verbose=False,
        )

        # Extract word-level timing
        word_sequence = []
        for segment in result.get("segments", []):
            for word_info in segment.get("words", []):
                word = word_info["text"].strip()
                if word:
                    word_sequence.append(
                        {
                            "word": word.lower(),
                            "start": word_info["start"],
                            "end": word_info["end"],
                        }
                    )

        return {
            "text": result.get("text", ""),
            "segments": result.get("segments", []),
            "word_sequence": word_sequence,
            "language": self.language,
        }

    def get_words_by_time_window(
        self, word_sequence: List[Dict], start_time: float, end_time: float
    ) -> List[str]:
        """
        Get all words that fall within a time window.

        Args:
            word_sequence: List of {"word", "start", "end"} dicts
            start_time: Window start (seconds)
            end_time: Window end (seconds)

        Returns:
            List of words in that window
        """
        words = []
        for entry in word_sequence:
            # Word is in window if it overlaps
            if entry["start"] < end_time and entry["end"] > start_time:
                words.append(entry["word"])
        return words

    def simulate_streaming(
        self, audio_path: str, chunk_duration: float = 2.0
    ) -> List[Dict]:
        """
        Simulate real-time streaming by returning transcription in chunks.

        Args:
            audio_path: Path to audio file
            chunk_duration: Duration (seconds) of each simulated chunk

        Returns:
            List of chunks, each with words and cumulative timestamp
        """
        result = self.transcribe_full(audio_path)
        word_sequence = result["word_sequence"]

        if not word_sequence:
            return []

        # Group words into time-based chunks
        min_time = word_sequence[0]["start"]
        max_time = word_sequence[-1]["end"]

        chunks = []
        chunk_start = min_time

        while chunk_start < max_time:
            chunk_end = chunk_start + chunk_duration
            words_in_chunk = self.get_words_by_time_window(
                word_sequence, chunk_start, chunk_end
            )

            if words_in_chunk:
                chunks.append(
                    {
                        "words": words_in_chunk,
                        "timestamp": chunk_end,
                        "start_time": chunk_start,
                        "end_time": chunk_end,
                    }
                )

            chunk_start = chunk_end

        return chunks

    def get_ground_truth_by_line(
        self, word_sequence: List[Dict], lyrics: List[str]
    ) -> List[Dict]:
        """
        Determine which lines are sung at what times (ground truth).

        Simple heuristic: group words by lyric line based on order of appearance.

        Returns:
            [
                {
                    "line_idx": 0,
                    "line_text": "Me acuestan en la cama",
                    "words": ["me", "acuestan", "en", "la", "cama"],
                    "start_time": 0.5,
                    "end_time": 1.2,
                },
                ...
            ]
        """
        ground_truth = []

        # Normalize lyrics for matching
        normalized_lyrics = [
            line.lower().replace(",", "").replace(".", "") for line in lyrics
        ]

        # Simple sequencing: go through words in order and try to match to lines
        word_idx = 0
        for line_idx, normalized_line in enumerate(normalized_lyrics):
            line_words = normalized_line.split()
            if not line_words:
                continue

            # Collect consecutive words from word_sequence that match this line
            matched_words = []
            matched_indices = []
            start_time = None
            end_time = None

            for expected_word in line_words:
                # Find next matching word in sequence
                found = False
                for j in range(word_idx, len(word_sequence)):
                    heard_word = word_sequence[j]["word"]
                    # Simple exact match (could be fuzzy)
                    if heard_word == expected_word or heard_word.startswith(
                        expected_word
                    ):
                        matched_words.append(heard_word)
                        matched_indices.append(j)
                        if start_time is None:
                            start_time = word_sequence[j]["start"]
                        end_time = word_sequence[j]["end"]
                        word_idx = j + 1
                        found = True
                        break

                if not found:
                    # Word not found, might be skipped or misheard
                    pass

            if matched_words and start_time is not None:
                ground_truth.append(
                    {
                        "line_idx": line_idx,
                        "line_text": lyrics[line_idx],
                        "words": matched_words,
                        "start_time": start_time,
                        "end_time": end_time,
                        "word_count": len(line_words),
                    }
                )

        return ground_truth
