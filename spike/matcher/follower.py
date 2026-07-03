"""Pure lyric-following matcher (S2 of the ASR-following spike).

Stdlib only. Forward-only pointer over ordered lyric lines:

    follower = LyricFollower(lines)
    events = follower.feed(word, audio_time)
    # events: list of {"line_index": int, "audio_time": float}

Design (deliberately simple — see NOTES.md for rejected fancier ideas):

- Each line is tokenized into normalized tokens (lowercase, accents and
  punctuation stripped). The matcher only ever looks at a small window of
  the *opening* tokens of the few lines just ahead of the pointer.
- The pointer starts at -1 (before line 0). Candidates are lines
  pointer+1 .. pointer+1+max_skip (bounded lookahead).
- Every incoming word is fuzzy-matched against each candidate's opening
  window. Evidence per candidate is a set of matched window tokens, so a
  held/repeated word (melisma) can only ever contribute once.
- The next line advances once it has >= min_evidence distinct matched
  window tokens. A farther candidate (skip / catch-up) needs the stricter
  skip_evidence. When both qualify on the same word, the *nearest* wins
  (conservative: false jumps are the worst failure mode).
- On any advance, all evidence is cleared and the candidate window slides
  forward — this is what keeps identical adjacent/chorus lines from
  double-advancing off one batch of words.
- Advancing to a skip target emits the intermediate line events too, in
  order, all stamped with the triggering word's audio_time.
"""

from __future__ import annotations

import unicodedata

__all__ = ["LyricFollower", "normalize_token", "tokenize_line", "levenshtein"]


def normalize_token(word: str) -> str:
    """Lowercase, strip accents/diacritics, keep only alphanumerics.

    '¡QUÉ' -> 'que', "pa'" -> 'pa', 'años' -> 'anos'.
    """
    decomposed = unicodedata.normalize("NFKD", word.lower())
    return "".join(
        ch for ch in decomposed
        if not unicodedata.combining(ch) and ch.isalnum()
    )


def tokenize_line(line: str) -> list[str]:
    """Whitespace-split (newlines included) and normalize; drop empties."""
    tokens = []
    for raw in line.split():
        tok = normalize_token(raw)
        if tok:
            tokens.append(tok)
    return tokens


def levenshtein(a: str, b: str) -> int:
    """Plain DP edit distance. Words are short; O(len*len) is fine."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def fuzzy_match(word: str, target: str) -> bool:
    """Is normalized `word` a plausible recognition of normalized `target`?

    - Exact match always counts.
    - Short targets (<= 3 chars: de, la, y, sal...) must match exactly —
      fuzzy matching stopword-sized tokens produces rampant false hits.
    - Prefix match (either direction, both sides >= 4 chars) absorbs
      truncated/extended ASR emissions ('brillan' vs 'brillante').
    - Edit distance 1 for targets >= 4 chars, 2 for targets >= 7 chars,
      absorbs single-phoneme mishearings ('asado' -> 'asadho').
    """
    if word == target:
        return True
    if len(target) <= 3 or len(word) <= 3:
        return False
    if len(word) >= 4 and len(target) >= 4 and (
        word.startswith(target) or target.startswith(word)
    ):
        return True
    max_dist = 2 if len(target) >= 7 else 1
    return levenshtein(word, target) <= max_dist


class LyricFollower:
    """Forward-only lyric pointer driven by a recognized word stream."""

    def __init__(
        self,
        lines: list[str],
        *,
        window_size: int = 5,
        min_evidence: int = 2,
        skip_evidence: int = 3,
        max_skip: int = 2,
    ) -> None:
        """
        lines         -- ordered lyric lines (raw text; normalized here).
        window_size   -- how many opening tokens of a line form its window.
        min_evidence  -- distinct matched window tokens required to advance
                         to the immediate next line (capped at the window's
                         distinct-token count, so short lines can advance).
        skip_evidence -- stricter threshold for advancing past skipped
                         lines (catch-up).
        max_skip      -- how many lines beyond the next one may be
                         considered as catch-up targets.
        """
        if window_size < 1:
            raise ValueError("window_size must be >= 1")
        if min_evidence < 1:
            raise ValueError("min_evidence must be >= 1")
        if skip_evidence < min_evidence:
            raise ValueError("skip_evidence must be >= min_evidence")
        if max_skip < 0:
            raise ValueError("max_skip must be >= 0")

        self._windows: list[list[str]] = [
            tokenize_line(line)[:window_size] for line in lines
        ]
        self._min_evidence = min_evidence
        self._skip_evidence = skip_evidence
        self._max_skip = max_skip
        self._pointer = -1  # last emitted line index; -1 = before line 0
        # evidence: candidate line index -> set of matched window tokens
        self._evidence: dict[int, set[str]] = {}

    @property
    def pointer(self) -> int:
        return self._pointer

    def _threshold(self, line_index: int) -> int:
        """Evidence needed for `line_index`, capped by its window size."""
        base = (
            self._min_evidence
            if line_index == self._pointer + 1
            else self._skip_evidence
        )
        distinct = len(set(self._windows[line_index]))
        return max(1, min(base, distinct))

    def _candidates(self) -> range:
        first = self._pointer + 1
        last = min(first + self._max_skip, len(self._windows) - 1)
        return range(first, last + 1)

    def feed(self, word: str, audio_time: float) -> list[dict]:
        """Process one recognized word; return 0+ advance events in order."""
        token = normalize_token(word)
        if not token or self._pointer >= len(self._windows) - 1:
            return []

        # Accumulate evidence on every candidate this word plausibly hits.
        for idx in self._candidates():
            matched = self._evidence.setdefault(idx, set())
            for wtok in self._windows[idx]:
                if wtok not in matched and fuzzy_match(token, wtok):
                    matched.add(wtok)
                    break  # one word claims at most one window token

        # Nearest candidate meeting its threshold wins (conservative).
        target = None
        for idx in self._candidates():
            if len(self._evidence.get(idx, ())) >= self._threshold(idx):
                target = idx
                break
        if target is None:
            return []

        events = [
            {"line_index": i, "audio_time": audio_time}
            for i in range(self._pointer + 1, target + 1)
        ]
        self._pointer = target
        self._evidence = {}  # fresh evidence after every advance
        return events
