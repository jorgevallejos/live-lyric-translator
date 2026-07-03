"""Replay a recognized word stream through the LyricFollower.

Usage (from the repo root):

    python3 -m spike.matcher.replay --words spike/asr_bench/out/<name>.jsonl \
        --song "/Users/jorgevallejos/Chango Pepper/songs/tragedia-de-cerdo-asado.json" \
        --lang es

Input JSONL (one recognized word per line, in emission order):
    {"word": "acuestan", "audio_time": 9.84, "emit_time": 10.51}

Output JSONL on stdout (one advance event per line):
    {"line_index": 0, "audio_time": 9.84, "emit_time": 10.51}

`audio_time` is the time of the word that triggered the advance;
`emit_time` is that word's emit_time (the wall-clock moment the decision
could actually have been made — what S3 measures lag against).
"""

from __future__ import annotations

import argparse
import json
import sys

from .follower import LyricFollower


def load_lines(song_path: str, lang: str) -> list[str]:
    with open(song_path, encoding="utf-8") as f:
        song = json.load(f)
    lines = []
    for i, item in enumerate(song["lyrics"]):
        if isinstance(item, str):  # tolerate plain-string items
            lines.append(item)
        elif lang in item:
            lines.append(item[lang])
        else:
            raise KeyError(f"lyrics[{i}] has no '{lang}' text")
    return lines


def iter_words(words_path: str):
    with open(words_path, encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{words_path}:{lineno}: bad JSON: {exc}")
            yield obj


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m spike.matcher.replay",
        description="Replay a word-stream JSONL through the lyric follower.",
    )
    parser.add_argument("--words", required=True,
                        help="word-stream JSONL from spike/asr_bench/out/")
    parser.add_argument("--song", required=True, help="song JSON path")
    parser.add_argument("--lang", default="es",
                        help="lyrics language key (default: es)")
    parser.add_argument("--window-size", type=int, default=None)
    parser.add_argument("--min-evidence", type=int, default=None)
    parser.add_argument("--skip-evidence", type=int, default=None)
    parser.add_argument("--max-skip", type=int, default=None)
    args = parser.parse_args(argv)

    kwargs = {
        k: v
        for k, v in {
            "window_size": args.window_size,
            "min_evidence": args.min_evidence,
            "skip_evidence": args.skip_evidence,
            "max_skip": args.max_skip,
        }.items()
        if v is not None
    }
    follower = LyricFollower(load_lines(args.song, args.lang), **kwargs)

    out = sys.stdout
    for obj in iter_words(args.words):
        events = follower.feed(obj["word"], float(obj["audio_time"]))
        for ev in events:
            out.write(json.dumps({
                "line_index": ev["line_index"],
                "audio_time": ev["audio_time"],
                "emit_time": float(obj.get("emit_time", obj["audio_time"])),
            }) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
