"""Streaming ASR bench driver: Vosk.

True streaming recognizer -- feeds the audio in sequential 0.5s chunks via
AcceptWaveform, and reads word-level timestamps out of Vosk's own JSON
result (Vosk aligns words internally, so audio_time is exact, not a
best-effort emission estimate).

emit_time model: for a chunk ending at simulated wall-clock time T, we call
AcceptWaveform/Result and measure the wall-clock processing time P for that
call. Words that come back in that result are stamped emit_time = T + P
(cumulative: if Vosk falls behind, later chunks start their processing at
the previously-delayed wall clock, not at the "ideal" chunk boundary -- see
`sim_clock` below). Partial-result words are NOT emitted (only finalized
Result() words), since partials can change; this matches "final" semantics
in the shared contract (a word is emitted once, when Vosk commits to it).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from audio_chunks import iter_chunks, wav_sample_rate  # noqa: E402


def run(audio_path: str, model_dir: str, out_path: str, chunk_seconds: float = 0.5) -> dict:
    from vosk import Model, KaldiRecognizer

    sr = wav_sample_rate(audio_path)
    t_load0 = time.perf_counter()
    model = Model(model_dir)
    rec = KaldiRecognizer(model, sr)
    rec.SetWords(True)
    load_time = time.perf_counter() - t_load0

    words_out = []
    pass_latencies = []

    # sim_clock tracks the simulated wall-clock time. It only ever moves
    # forward by max(chunk_seconds, actual processing time) per chunk, so a
    # slow pass compounds delay into subsequent emit times exactly as real
    # streaming would.
    sim_clock = 0.0
    n_chunks = 0

    for chunk in iter_chunks(audio_path, chunk_seconds):
        n_chunks += 1
        # Chunk "arrives" at its ideal end_time at the earliest; if we're
        # already behind (sim_clock > chunk.end_time), processing starts
        # immediately when the previous pass finished.
        arrival = max(chunk.end_time, sim_clock)

        t0 = time.perf_counter()
        final = rec.AcceptWaveform(chunk.pcm)
        result_json = rec.Result() if final else rec.PartialResult()
        t1 = time.perf_counter()
        proc_latency = t1 - t0
        pass_latencies.append(proc_latency)

        sim_clock = arrival + proc_latency

        if final:
            result = json.loads(result_json)
            for w in result.get("result", []):
                words_out.append({
                    "word": w["word"],
                    "audio_time": round(w["start"], 3),
                    "emit_time": round(sim_clock, 3),
                })

    # flush final partial result
    t0 = time.perf_counter()
    final_json = json.loads(rec.FinalResult())
    t1 = time.perf_counter()
    sim_clock = max(chunk.end_time, sim_clock) + (t1 - t0)
    for w in final_json.get("result", []):
        words_out.append({
            "word": w["word"],
            "audio_time": round(w["start"], 3),
            "emit_time": round(sim_clock, 3),
        })

    with open(out_path, "w") as f:
        for rec_ in words_out:
            f.write(json.dumps(rec_, ensure_ascii=False) + "\n")

    stats = {
        "model_load_seconds": load_time,
        "n_chunks": n_chunks,
        "chunk_seconds": chunk_seconds,
        "n_words": len(words_out),
        "pass_latencies": pass_latencies,
        "final_sim_clock": sim_clock,
        "audio_duration": chunk.end_time if n_chunks else 0.0,
    }
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--chunk-seconds", type=float, default=0.5)
    ap.add_argument("--stats-out", default=None)
    args = ap.parse_args()

    stats = run(args.audio, args.model_dir, args.out, args.chunk_seconds)
    print(json.dumps({k: v for k, v in stats.items() if k != "pass_latencies"}, indent=2))
    if args.stats_out:
        with open(args.stats_out, "w") as f:
            json.dump(stats, f, indent=2)


if __name__ == "__main__":
    main()
