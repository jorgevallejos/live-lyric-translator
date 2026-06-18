"""
Lyric line matching layer.

Matches transcribed words to lyric lines with tolerance for:
- Mis-hearings (fuzzy matching)
- Repeated/held words (melisma)
- Gaps (pauses, breathing)
"""

from difflib import SequenceMatcher
from typing import List, Tuple, Dict, Optional
import re


class LyricMatcher:
    """Matches continuous transcription stream to discrete lyric lines."""

    def __init__(self, lyrics: List[str], language: str = "es"):
        """
        Args:
            lyrics: List of lyric lines in Spanish (or specified language)
            language: Language code ("es", "en", etc.)
        """
        self.lyrics = [self._normalize(line) for line in lyrics]
        self.language = language
        self.current_line_idx = -1
        self.transcription_buffer = []
        self.word_sequence = []

    def _normalize(self, text: str) -> str:
        """Normalize text for matching: lowercase, remove punctuation, extra spaces."""
        text = text.lower().strip()
        # Remove punctuation but keep accents
        text = re.sub(r"[,.\!?;:\"\']", "", text)
        # Collapse multiple spaces
        text = re.sub(r"\s+", " ", text)
        return text

    def _extract_words(self, text: str) -> List[str]:
        """Extract words from normalized text."""
        return [w for w in self._normalize(text).split() if w]

    def _similarity(self, s1: str, s2: str) -> float:
        """Compute similarity ratio between two strings (0-1)."""
        return SequenceMatcher(None, s1, s2).ratio()

    def _fuzzy_match_word(self, heard: str, expected: str, threshold: float = 0.7) -> bool:
        """
        Fuzzy match a heard word to expected word.
        Handles mis-hearings, accent variations, minor typos.
        """
        if heard == expected:
            return True
        # Levenshtein-like: use sequence matcher
        return self._similarity(heard, expected) >= threshold

    def _can_advance(
        self, transcribed_words: List[str], current_idx: int
    ) -> Tuple[bool, int, Dict]:
        """
        Check if transcribed words can advance from current line to next.

        Returns:
            (can_advance, next_line_idx, details)
        """
        if current_idx < 0 or current_idx >= len(self.lyrics):
            return False, current_idx, {}

        current_line_words = self._extract_words(self.lyrics[current_idx])
        if not current_line_words:
            return False, current_idx, {}

        if current_idx + 1 >= len(self.lyrics):
            return False, current_idx, {}

        next_line_words = self._extract_words(self.lyrics[current_idx + 1])
        if not next_line_words:
            return False, current_idx, {}

        # Strategy: do we have enough words from the NEXT line?
        # We're lenient: if we hear the first 1-2 words of the next line clearly,
        # we can advance. This handles:
        # - Melisma on last word of current line (held/repeated)
        # - Quick advance without completing current line
        # - Singing through punctuation

        min_words_needed = min(2, len(next_line_words))

        # Try to match the start of next_line_words in transcribed_words
        # (allowing for some leftover current-line words at the beginning)

        # Count how many leading words from next_line match
        matched_count = 0
        for i, next_word in enumerate(next_line_words[:min_words_needed]):
            # Search in transcribed_words for a fuzzy match
            found = False
            for heard_word in transcribed_words:
                if self._fuzzy_match_word(heard_word, next_word, threshold=0.75):
                    matched_count += 1
                    found = True
                    break
            if not found:
                break

        if matched_count >= min_words_needed:
            return True, current_idx + 1, {
                "matched_words": matched_count,
                "next_line": self.lyrics[current_idx + 1],
            }

        return False, current_idx, {}

    def process_transcription(
        self, new_words: List[str], timestamp: float
    ) -> Dict:
        """
        Process new transcribed words and update line pointer.

        Args:
            new_words: List of newly transcribed words
            timestamp: Audio timestamp (seconds) of this transcription

        Returns:
            {
                "line_idx": current line index (-1 if not started)
                "advanced": bool, whether line advanced
                "old_idx": previous line index
                "new_idx": new line index
                "current_line": current lyric line text
                "timestamp": timestamp of advancement
                "details": dict with debug info
            }
        """
        self.transcription_buffer.extend(new_words)
        # Keep a sliding window of recent words (last ~20 words)
        if len(self.transcription_buffer) > 30:
            self.transcription_buffer = self.transcription_buffer[-30:]

        old_idx = self.current_line_idx
        advanced = False
        details = {}

        # Try to advance if we're in a valid state
        if self.current_line_idx >= -1 and self.current_line_idx < len(self.lyrics):
            can_advance, next_idx, adv_details = self._can_advance(
                self.transcription_buffer, self.current_line_idx
            )

            if can_advance:
                self.current_line_idx = next_idx
                advanced = True
                details = adv_details
                details["advanced_from"] = old_idx

        # If we haven't started, try to match the first few words
        if self.current_line_idx == -1 and len(self.transcription_buffer) >= 1:
            # Try to match start of first lyric line
            first_line_words = self._extract_words(self.lyrics[0])
            if first_line_words:
                matched = 0
                for expected in first_line_words[:2]:
                    for heard in self.transcription_buffer:
                        if self._fuzzy_match_word(heard, expected, threshold=0.75):
                            matched += 1
                            break

                if matched >= 1:
                    self.current_line_idx = 0
                    advanced = True
                    details = {"first_line_started": True}

        current_line = (
            self.lyrics[self.current_line_idx]
            if self.current_line_idx >= 0
            else "[not started]"
        )

        return {
            "line_idx": self.current_line_idx,
            "advanced": advanced,
            "old_idx": old_idx,
            "new_idx": self.current_line_idx,
            "current_line": current_line,
            "timestamp": timestamp,
            "buffer_size": len(self.transcription_buffer),
            "details": details,
        }

    def reset(self):
        """Reset matcher to initial state."""
        self.current_line_idx = -1
        self.transcription_buffer = []
        self.word_sequence = []
