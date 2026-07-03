"""Non-streaming, full-file reference transcription with word timestamps.

Produces spike/asr_bench/out/forced-align-reference.jsonl in the same
word-stream JSONL shape as the streaming candidates, with emit_time set
equal to audio_time (per the spike contract -- this is the QA reference,
not a real-time candidate).
"""
from __future__ import annotations

import argparse
import itertools
import json
import time


def run(audio_path: str, out_path: str, model_size: str = "medium") -> dict:
    from faster_whisper import WhisperModel

    t0 = time.perf_counter()
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    load_time = time.perf_counter() - t0

    t1 = time.perf_counter()
    segments, info = model.transcribe(
        audio_path,
        language="es",
        word_timestamps=True,
        condition_on_previous_text=True,  # best-quality full-file pass; no streaming constraint here
    )
    segments = list(segments)
    transcribe_time = time.perf_counter() - t1

    words = list(itertools.chain.from_iterable(s.words for s in segments))
    with open(out_path, "w") as f:
        for w in words:
            f.write(json.dumps({
                "word": w.word.strip(),
                "audio_time": round(w.start, 3),
                "emit_time": round(w.start, 3),
            }, ensure_ascii=False) + "\n")

    return {
        "model_size": model_size,
        "model_load_seconds": load_time,
        "transcribe_seconds": transcribe_time,
        "n_words": len(words),
        "language_probability": getattr(info, "language_probability", None),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model-size", default="medium")
    args = ap.parse_args()
    stats = run(args.audio, args.out, args.model_size)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
