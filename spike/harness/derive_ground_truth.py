"""Derive empirical per-line ground-truth onsets from a word-timestamp stream.

The authored song timeline turned out to be misaligned scaffolding (see report),
so ground truth = the audio_time of each line's first sung word, located in a
high-quality word stream (forced-align reference; cross-check with Vosk).

Usage:
    python3 spike/harness/derive_ground_truth.py \
        --words spike/asr_bench/out/forced-align-reference.jsonl \
        --song "/path/to/song.json" [--lang es]

Prints JSON: [{"line": i, "start": t or null}, ...]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from spike.matcher.follower import fuzzy_match, normalize_token, tokenize_line  # noqa: E402


def derive(words: list[dict], lines: list[str]) -> list[float | None]:
    """Sequentially anchor each line's opening tokens in the word stream.

    A line's onset = time of the earliest word (from the previous anchor
    onward) that matches the line's token[0] and is corroborated by a match
    of another of its first 4 tokens within the following 8 words. Falls
    back to a corroborated match of token[1] (first word mis-heard), else None.
    """
    toks = [(normalize_token(w["word"]), w["audio_time"]) for w in words]
    toks = [(t, at) for t, at in toks if t]
    onsets: list[float | None] = []
    pos = 0
    for line in lines:
        window = tokenize_line(line)[:4]
        found = None
        for lead in range(min(2, len(window))):  # try token[0], then token[1]
            for i in range(pos, len(toks)):
                if fuzzy_match(toks[i][0], window[lead]):
                    rest = [w for w in window if w != window[lead]]
                    corroborated = any(
                        fuzzy_match(toks[j][0], r)
                        for j in range(i + 1, min(i + 9, len(toks)))
                        for r in rest
                    )
                    if corroborated or not rest:
                        found = i
                        break
            if found is not None:
                break
        if found is None:
            onsets.append(None)
        else:
            onsets.append(toks[found][1])
            pos = found + 1
    return onsets


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--words", required=True)
    ap.add_argument("--song", required=True)
    ap.add_argument("--lang", default="es")
    args = ap.parse_args()

    words = [json.loads(l) for l in Path(args.words).read_text().splitlines() if l.strip()]
    song = json.loads(Path(args.song).read_text())
    lines = [item[args.lang] for item in song["lyrics"] if isinstance(item, dict) and args.lang in item]
    onsets = derive(words, lines)
    print(json.dumps([{"line": i, "start": s} for i, s in enumerate(onsets)], indent=2))


if __name__ == "__main__":
    main()
