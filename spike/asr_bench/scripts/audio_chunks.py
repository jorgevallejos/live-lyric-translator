"""Shared helper: feed a mono 16k WAV file as sequential 0.5s chunks.

Used by every driver to simulate real-time streaming ingestion of the
pre-recorded master audio (no live mic in this spike).
"""
from __future__ import annotations

import wave
from dataclasses import dataclass
from typing import Iterator


@dataclass
class Chunk:
    index: int
    pcm: bytes          # raw int16 PCM bytes for this chunk
    start_time: float   # audio seconds at chunk start
    end_time: float      # audio seconds at chunk end


def iter_chunks(wav_path: str, chunk_seconds: float = 0.5) -> Iterator[Chunk]:
    wf = wave.open(wav_path, "rb")
    assert wf.getnchannels() == 1, "expected mono audio"
    assert wf.getsampwidth() == 2, "expected 16-bit PCM"
    sr = wf.getframerate()
    frames_per_chunk = int(round(chunk_seconds * sr))
    idx = 0
    t = 0.0
    while True:
        data = wf.readframes(frames_per_chunk)
        if not data:
            break
        n_frames = len(data) // 2  # 16-bit mono -> 2 bytes/frame
        start = t
        end = t + n_frames / sr
        yield Chunk(index=idx, pcm=data, start_time=start, end_time=end)
        t = end
        idx += 1
    wf.close()


def wav_sample_rate(wav_path: str) -> int:
    wf = wave.open(wav_path, "rb")
    sr = wf.getframerate()
    wf.close()
    return sr


def wav_duration(wav_path: str) -> float:
    wf = wave.open(wav_path, "rb")
    dur = wf.getnframes() / wf.getframerate()
    wf.close()
    return dur
