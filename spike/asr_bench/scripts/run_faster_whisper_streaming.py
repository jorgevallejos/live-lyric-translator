"""Streaming ASR bench driver: faster-whisper, simulated via rolling
re-transcription (whisper-family models have no native streaming API).

Simulation design
------------------
Audio is fed in sequential 0.5s chunks (per the spike contract). A rolling
buffer holds the last WINDOW_SECONDS of audio. Every RETRANSCRIBE_EVERY_N
chunks (i.e. every RETRANSCRIBE_EVERY_N * 0.5s of new audio), we run a full
transcription pass over the current buffer with word timestamps.

Stability / emission rule ("local agreement by trailing margin")
------------------------------------------------------------------
A word from a pass is considered *stable* (safe to emit) if its end time is
more than COMMIT_LAG seconds before the trailing edge of the buffer used for
that pass. Words within COMMIT_LAG of the trailing edge are still subject to
revision by more audio context in the next pass (Whisper's segmentation
often shifts near a cut boundary), so they are held back.

We track `emitted_until`, the audio_time up to which words have already been
emitted. On each pass, we walk the new transcript's words in order and emit
any word whose end time is (a) stable per the above and (b) starts at or
after `emitted_until` (dedupes words already emitted by a previous pass,
matching on time position rather than string, since the rolling buffer
re-transcribes overlapping audio every pass). After emitting, `emitted_until`
advances to the end time of the last emitted word.

This is a simplified version of the "local agreement" trick used by
whisper_streaming (Machacek et al.) -- instead of comparing two consecutive
hypotheses word-by-word, we exploit the fact that Whisper's word timestamps
are usually stable once they're not at the trailing edge of the context
window, and use a fixed trailing margin as the confirmation signal. Simpler,
and honestly documents its own failure mode (a word can still be emitted
early with a wrong reading if the model was confidently wrong on first
pass -- there's no revision once emitted).

emit_time model: a pass triggered when the simulated wall clock reaches
trigger_time (= chunk boundary, or later if previous passes left us behind)
takes wall-clock P seconds. All words emitted from that pass get
emit_time = trigger_time + P. If P exceeds the audio-time budget covered by
RETRANSCRIBE_EVERY_N chunks, the next trigger is pushed back accordingly
(sim_clock never goes backwards) -- this is the "falling behind" case we
must report honestly per the spike brief.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from audio_chunks import iter_chunks, wav_duration  # noqa: E402

import numpy as np  # noqa: E402


def pcm16_bytes_to_float32(pcm: bytes) -> np.ndarray:
    arr = np.frombuffer(pcm, dtype=np.int16)
    return (arr.astype(np.float32)) / 32768.0


def run(
    audio_path: str,
    model_size: str,
    out_path: str,
    chunk_seconds: float = 0.5,
    window_seconds: float = 12.0,
    retranscribe_every_n: int = 4,   # every 2.0s of new audio
    commit_lag: float = 1.5,
    stats_out: str | None = None,
) -> dict:
    from faster_whisper import WhisperModel

    sr = 16000
    t_load0 = time.perf_counter()
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    load_time = time.perf_counter() - t_load0

    words_out = []
    pass_latencies = []
    pass_records = []  # for debugging/report: (trigger_time, buffer_span, n_words_in_pass, n_emitted)

    buffer = np.zeros(0, dtype=np.float32)
    buffer_start_time = 0.0  # audio_time of buffer[0]

    emitted_until = -1.0  # audio_time; words starting before this are already emitted
    sim_clock = 0.0
    n_chunks = 0
    chunks_since_pass = 0

    audio_duration = wav_duration(audio_path)

    def do_pass(trigger_time: float):
        nonlocal sim_clock, emitted_until
        t0 = time.perf_counter()
        segments, _info = model.transcribe(
            buffer,
            language="es",
            word_timestamps=True,
            condition_on_previous_text=False,
            vad_filter=False,
        )
        segments = list(segments)
        t1 = time.perf_counter()
        proc_latency = t1 - t0
        pass_latencies.append(proc_latency)

        sim_clock = max(trigger_time, sim_clock) + proc_latency

        buf_trailing_edge = buffer_start_time + len(buffer) / sr
        n_words_in_pass = 0
        n_emitted = 0
        for seg in segments:
            for w in seg.words:
                n_words_in_pass += 1
                abs_start = buffer_start_time + w.start
                abs_end = buffer_start_time + w.end
                stable = (buf_trailing_edge - abs_end) > commit_lag
                if stable and abs_start >= emitted_until:
                    words_out.append({
                        "word": w.word.strip(),
                        "audio_time": round(abs_start, 3),
                        "emit_time": round(sim_clock, 3),
                    })
                    emitted_until = abs_end
                    n_emitted += 1
        pass_records.append({
            "trigger_time": round(trigger_time, 3),
            "sim_clock_after": round(sim_clock, 3),
            "proc_latency": round(proc_latency, 3),
            "buffer_span": [round(buffer_start_time, 3), round(buf_trailing_edge, 3)],
            "n_words_in_pass": n_words_in_pass,
            "n_emitted": n_emitted,
        })

    last_chunk = None
    for chunk in iter_chunks(audio_path, chunk_seconds):
        n_chunks += 1
        last_chunk = chunk
        new_samples = pcm16_bytes_to_float32(chunk.pcm)
        buffer = np.concatenate([buffer, new_samples])

        # trim buffer to window_seconds, sliding buffer_start_time forward
        max_samples = int(window_seconds * sr)
        if len(buffer) > max_samples:
            trim = len(buffer) - max_samples
            buffer = buffer[trim:]
            buffer_start_time += trim / sr

        chunks_since_pass += 1
        if chunks_since_pass >= retranscribe_every_n:
            trigger_time = max(chunk.end_time, sim_clock)
            do_pass(trigger_time)
            chunks_since_pass = 0

    # final flush pass over whatever remains, forcing emission of all
    # remaining stable-or-not words (end of stream -- nothing left to
    # revise them).
    if last_chunk is not None:
        t0 = time.perf_counter()
        segments, _info = model.transcribe(
            buffer, language="es", word_timestamps=True,
            condition_on_previous_text=False, vad_filter=False,
        )
        segments = list(segments)
        t1 = time.perf_counter()
        proc_latency = t1 - t0
        pass_latencies.append(proc_latency)
        sim_clock = max(last_chunk.end_time, sim_clock) + proc_latency
        n_emitted = 0
        for seg in segments:
            for w in seg.words:
                abs_start = buffer_start_time + w.start
                abs_end = buffer_start_time + w.end
                if abs_start >= emitted_until:
                    words_out.append({
                        "word": w.word.strip(),
                        "audio_time": round(abs_start, 3),
                        "emit_time": round(sim_clock, 3),
                    })
                    emitted_until = abs_end
                    n_emitted += 1
        pass_records.append({
            "trigger_time": "final_flush",
            "sim_clock_after": round(sim_clock, 3),
            "proc_latency": round(proc_latency, 3),
            "n_emitted": n_emitted,
        })

    with open(out_path, "w") as f:
        for rec in words_out:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    stats = {
        "model_size": model_size,
        "model_load_seconds": load_time,
        "n_chunks": n_chunks,
        "chunk_seconds": chunk_seconds,
        "window_seconds": window_seconds,
        "retranscribe_every_n": retranscribe_every_n,
        "commit_lag": commit_lag,
        "n_words": len(words_out),
        "n_passes": len(pass_latencies),
        "pass_latencies": pass_latencies,
        "final_sim_clock": sim_clock,
        "audio_duration": audio_duration,
        "pass_records": pass_records,
    }
    if stats_out:
        with open(stats_out, "w") as f:
            json.dump(stats, f, indent=2)
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--model-size", default="small")
    ap.add_argument("--out", required=True)
    ap.add_argument("--chunk-seconds", type=float, default=0.5)
    ap.add_argument("--window-seconds", type=float, default=12.0)
    ap.add_argument("--retranscribe-every-n", type=int, default=4)
    ap.add_argument("--commit-lag", type=float, default=1.5)
    ap.add_argument("--stats-out", default=None)
    args = ap.parse_args()

    stats = run(
        args.audio, args.model_size, args.out,
        chunk_seconds=args.chunk_seconds,
        window_seconds=args.window_seconds,
        retranscribe_every_n=args.retranscribe_every_n,
        commit_lag=args.commit_lag,
        stats_out=args.stats_out,
    )
    summary = {k: v for k, v in stats.items() if k not in ("pass_latencies", "pass_records")}
    lat = stats["pass_latencies"]
    if lat:
        summary["pass_latency_mean"] = sum(lat) / len(lat)
        summary["pass_latency_max"] = max(lat)
        summary["realtime_factor"] = stats["audio_duration"] / sum(lat)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
