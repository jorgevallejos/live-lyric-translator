"""Unit + integration tests for the lyric-following matcher (spike S2).

Run from the repo root:
    python3 -m unittest discover spike/matcher -v
"""

import json
import random
import unittest
from pathlib import Path

try:  # discovered as a package member (python3 -m unittest discover spike/matcher)
    from .follower import LyricFollower, normalize_token, tokenize_line, levenshtein
except ImportError:  # discovered with spike/matcher as the start dir
    from follower import LyricFollower, normalize_token, tokenize_line, levenshtein

SONG_JSON = Path("/Users/jorgevallejos/Chango Pepper/songs/tragedia-de-cerdo-asado.json")


def load_es_lines():
    with SONG_JSON.open() as f:
        song = json.load(f)
    return [item["es"] for item in song["lyrics"]]


def feed_all(follower, words, start_time=0.0, step=0.5):
    """Feed a list of words at evenly spaced times; collect all events."""
    events = []
    t = start_time
    for w in words:
        events.extend(follower.feed(w, t))
        t += step
    return events


def indices(events):
    return [e["line_index"] for e in events]


class TestNormalization(unittest.TestCase):
    def test_lowercase_accents_punctuation(self):
        self.assertEqual(normalize_token("¡QUÉ"), "que")
        self.assertEqual(normalize_token("festín."), "festin")
        self.assertEqual(normalize_token("pa'"), "pa")
        self.assertEqual(normalize_token("años"), "anos")

    def test_pure_punctuation_becomes_empty(self):
        self.assertEqual(normalize_token("¡¿?!"), "")

    def test_tokenize_handles_embedded_newlines(self):
        toks = tokenize_line("El aire me envuelve,\ny yo canto.")
        self.assertEqual(toks, ["el", "aire", "me", "envuelve", "y", "yo", "canto"])

    def test_levenshtein_basics(self):
        self.assertEqual(levenshtein("gato", "gato"), 0)
        self.assertEqual(levenshtein("gato", "pato"), 1)
        self.assertEqual(levenshtein("", "abc"), 3)


class TestBasicAdvance(unittest.TestCase):
    LINES = [
        "Me acuestan en la cama",
        "de plata brillante",
        "Me ungen con hierbas",
    ]

    def test_first_advance_is_line_zero(self):
        f = LyricFollower(self.LINES)
        self.assertEqual(f.feed("me", 1.0), [])  # one token: below threshold
        events = f.feed("acuestan", 1.5)
        self.assertEqual(events, [{"line_index": 0, "audio_time": 1.5}])

    def test_no_advance_from_single_word(self):
        f = LyricFollower(self.LINES)
        self.assertEqual(f.feed("acuestan", 1.0), [])

    def test_event_carries_triggering_word_time(self):
        f = LyricFollower(self.LINES)
        f.feed("me", 1.0)
        events = f.feed("cama", 2.25)
        self.assertEqual(events[0]["audio_time"], 2.25)

    def test_sequential_lines_advance_in_order(self):
        f = LyricFollower(self.LINES)
        words = ["me", "acuestan", "cama", "plata", "brillante", "ungen", "hierbas"]
        self.assertEqual(indices(feed_all(f, words)), [0, 1, 2])

    def test_feed_after_last_line_is_noop(self):
        f = LyricFollower(["hola mundo"])
        f.feed("hola", 0.0)
        f.feed("mundo", 0.5)
        self.assertEqual(f.pointer, 0)
        self.assertEqual(f.feed("hola", 1.0), [])


class TestMisheardWords(unittest.TestCase):
    def test_accented_vs_plain_ascii(self):
        f = LyricFollower(["¡Qué honor divino! Menú infernal!", "otra línea aquí va"])
        events = feed_all(f, ["que", "menu"])
        self.assertEqual(indices(events), [0])

    def test_single_character_mishearing(self):
        # 'acuestan' misheard as 'aquestan', 'cama' as 'cana'
        f = LyricFollower(["Me acuestan en la cama", "de plata brillante"])
        events = feed_all(f, ["aquestan", "cana"])
        self.assertEqual(indices(events), [0])

    def test_prefix_recognition(self):
        # ASR truncates 'brillante' to 'brillan'
        f = LyricFollower(["de plata brillante", "otra cosa distinta aqui"])
        events = feed_all(f, ["plata", "brillan"])
        self.assertEqual(indices(events), [0])

    def test_short_words_require_exact_match(self):
        # 'de'/'la' must not fuzzy-match arbitrary short garbage
        f = LyricFollower(["de la sal ya", "otra cosa distinta aqui"])
        self.assertEqual(feed_all(f, ["do", "le", "sol", "yo"]), [])


class TestMelisma(unittest.TestCase):
    def test_held_word_repeated_does_not_reach_threshold(self):
        f = LyricFollower(["cama blanca fria", "otra cosa distinta"])
        events = feed_all(f, ["cama", "cama", "cama", "cama", "cama"])
        self.assertEqual(events, [])

    def test_held_word_after_advance_does_not_double_advance(self):
        f = LyricFollower(["luna clara brilla", "sombra oscura cae", "el final llega ya"])
        events = feed_all(f, ["luna", "clara", "clara", "clara", "luna", "luna"])
        self.assertEqual(indices(events), [0])


class TestSkippedWords(unittest.TestCase):
    def test_two_of_five_opening_words_suffice(self):
        f = LyricFollower(["uno dos tres cuatro cinco", "seis siete ocho nueve diez"])
        events = feed_all(f, ["uno", "cinco"])
        self.assertEqual(indices(events), [0])

    def test_whole_line_not_required_across_lines(self):
        f = LyricFollower(
            ["me alzan en brazos", "como al rey de Roma", "una manzana en mi boca"]
        )
        # Only ~half of each line's words arrive
        events = feed_all(f, ["alzan", "brazos", "rey", "roma", "manzana", "boca"])
        self.assertEqual(indices(events), [0, 1, 2])


class TestNoise(unittest.TestCase):
    def test_garbage_words_never_advance(self):
        f = LyricFollower(["me acuestan en la cama", "de plata brillante"])
        garbage = ["pshh", "brmm", "tktk", "wooo", "zzz", "grr", "fff", "ss"]
        self.assertEqual(feed_all(f, garbage), [])

    def test_garbage_between_real_words_is_ignored(self):
        f = LyricFollower(["me acuestan en la cama", "de plata brillante"])
        events = feed_all(f, ["pshh", "acuestan", "brmm", "tktk", "cama"])
        self.assertEqual(indices(events), [0])


class TestForwardOnly(unittest.TestCase):
    def test_earlier_line_words_never_regress_pointer(self):
        f = LyricFollower(
            ["me acuestan en la cama", "de plata brillante", "me ungen con hierbas"]
        )
        events = feed_all(f, ["acuestan", "cama", "plata", "brillante"])
        self.assertEqual(indices(events), [0, 1])
        # Re-hear line 0's words (echo / repeated phrase): no regression
        more = feed_all(f, ["acuestan", "cama", "acuestan", "cama"], start_time=10.0)
        self.assertEqual(more, [])
        self.assertEqual(f.pointer, 1)

    def test_emitted_indices_are_strictly_increasing(self):
        f = LyricFollower(
            ["sol y mar abierto", "viento norte frio", "sol y mar abierto"]
        )
        words = ["sol", "mar", "viento", "norte", "sol", "mar", "abierto"]
        idx = indices(feed_all(f, words))
        self.assertEqual(idx, sorted(set(idx)))
        self.assertEqual(idx, [0, 1, 2])


class TestRepeatedLines(unittest.TestCase):
    def test_identical_adjacent_lines_advance_once_per_singing(self):
        lines = ["canta el gallo rojo", "canta el gallo rojo", "amanece el dia ya"]
        f = LyricFollower(lines)
        first = feed_all(f, ["canta", "gallo"])
        self.assertEqual(indices(first), [0])
        second = feed_all(f, ["canta", "gallo"], start_time=5.0)
        self.assertEqual(indices(second), [1])
        third = feed_all(f, ["amanece", "dia"], start_time=10.0)
        self.assertEqual(indices(third), [2])

    def test_distant_chorus_duplicate_does_not_cause_jump(self):
        # Real chorus: lines 16 and 27 of the test song are identical.
        lines = load_es_lines()
        f = LyricFollower(lines)
        # Drive the pointer to line 16 by singing lines 0..16's opening words.
        for i in range(17):
            feed_all(f, lines[i].split()[:3], start_time=float(i * 5))
        self.assertEqual(f.pointer, 16)
        # Hearing line 16/27's text again (echo, held chorus) while at 16
        # must not jump to 27, nor advance to unrelated 17.
        events = feed_all(f, ["que", "honor", "divino", "menu", "infernal"],
                          start_time=100.0)
        self.assertEqual(events, [])
        self.assertEqual(f.pointer, 16)


class TestCatchUp(unittest.TestCase):
    def test_skip_one_line_with_strong_evidence(self):
        lines = [
            "uno dos tres cuatro",
            "cinco seis siete ocho",
            "nueve diez once doce",
        ]
        f = LyricFollower(lines)
        feed_all(f, ["uno", "dos"])
        # Singer skips line 1 entirely; line 2 needs skip_evidence (3) words.
        self.assertEqual(f.feed("nueve", 10.0), [])
        self.assertEqual(f.feed("diez", 10.5), [])
        events = f.feed("once", 11.0)
        self.assertEqual(
            events,
            [
                {"line_index": 1, "audio_time": 11.0},
                {"line_index": 2, "audio_time": 11.0},
            ],
        )
        self.assertEqual(f.pointer, 2)

    def test_weak_evidence_does_not_skip(self):
        lines = [
            "uno dos tres cuatro",
            "cinco seis siete ocho",
            "nueve diez once doce",
        ]
        f = LyricFollower(lines)
        feed_all(f, ["uno", "dos"])
        # Only two words from line 2: below skip threshold, no jump.
        events = feed_all(f, ["nueve", "diez"], start_time=10.0)
        self.assertEqual(events, [])
        self.assertEqual(f.pointer, 0)


class TestConfig(unittest.TestCase):
    def test_min_evidence_configurable(self):
        f = LyricFollower(
            ["uno dos tres cuatro", "cinco seis siete ocho"], min_evidence=3
        )
        self.assertEqual(feed_all(f, ["uno", "dos"]), [])
        events = f.feed("tres", 2.0)
        self.assertEqual(indices(events), [0])

    def test_threshold_capped_for_short_lines(self):
        # A one-word line must still be able to advance.
        f = LyricFollower(["fuego", "agua clara pura"], min_evidence=2)
        events = f.feed("fuego", 0.0)
        self.assertEqual(indices(events), [0])

    def test_max_skip_zero_disables_catch_up(self):
        lines = ["uno dos tres", "cuatro cinco seis", "siete ocho nueve"]
        f = LyricFollower(lines, max_skip=0)
        feed_all(f, ["uno", "dos"])
        events = feed_all(f, ["siete", "ocho", "nueve"], start_time=10.0)
        self.assertEqual(events, [])
        self.assertEqual(f.pointer, 0)


class TestIntegrationRealSong(unittest.TestCase):
    """Feed a degraded synthetic word stream built from the real 29 es lines."""

    NOISE = ["pshh", "brmm", "tktk", "wooo", "grr", "dzz", "hmm"]

    def make_stream(self, lines, rng):
        """Per line: drop 20% of words, corrupt ~10%, sprinkle noise words."""
        stream = []
        for i, line in enumerate(lines):
            tokens = line.split()
            kept = [t for t in tokens if rng.random() >= 0.20]
            if len(kept) < 2:  # a sung line always yields a couple of words
                kept = tokens[:2]
            out = []
            for tok in kept:
                if len(tok) > 4 and rng.random() < 0.10:
                    mid = len(tok) // 2  # corrupt one middle character
                    tok = tok[:mid] + "x" + tok[mid + 1:]
                out.append(tok)
            # Occasional guitar-noise misrecognitions between lines.
            if rng.random() < 0.35:
                out.append(rng.choice(self.NOISE))
            start = 18.0 + 5.5 * i  # authored timeline grid
            for k, tok in enumerate(out):
                stream.append((tok, start + k * (5.0 / max(len(out), 1))))
        return stream

    def test_all_29_lines_advance_in_order_no_false_jumps(self):
        lines = load_es_lines()
        self.assertEqual(len(lines), 29)
        for seed in (7, 42, 2026):
            with self.subTest(seed=seed):
                rng = random.Random(seed)
                f = LyricFollower(lines)
                events = []
                for word, t in self.make_stream(lines, rng):
                    events.extend(f.feed(word, t))
                idx = indices(events)
                # Every line, exactly once, strictly in order: no misses,
                # no regressions, no double-advances, no false jumps.
                self.assertEqual(idx, list(range(29)))
                times = [e["audio_time"] for e in events]
                self.assertEqual(times, sorted(times))

    def test_clean_stream_advances_close_to_line_starts(self):
        lines = load_es_lines()
        f = LyricFollower(lines)
        events = []
        for i, line in enumerate(lines):
            start = 18.0 + 5.5 * i
            tokens = line.split()
            for k, tok in enumerate(tokens):
                events.extend(f.feed(tok, start + k * (5.0 / len(tokens))))
        idx = indices(events)
        self.assertEqual(idx, list(range(29)))
        # With a clean stream each advance should land within the first
        # few words of its line (< 3 s into the 5.5 s slot).
        for e in events:
            line_start = 18.0 + 5.5 * e["line_index"]
            self.assertLess(e["audio_time"] - line_start, 3.0,
                            msg=f"late advance for line {e['line_index']}")


if __name__ == "__main__":
    unittest.main()
