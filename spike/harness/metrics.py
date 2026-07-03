"""S3 metrics: score matcher advance events against the song's ground-truth timeline.

Usage:
    python3 spike/harness/metrics.py \
        --song "/path/to/tragedia-de-cerdo-asado.json" \
        --gt-offset 9.303 \
        --events spike/harness/out/faster-whisper-small.events.jsonl [more.events.jsonl ...] \
        [--json spike/harness/out/summary.json]

Each events file: one JSON object per line, {"line_index": int, "audio_time": float, "emit_time": float}
(audio_time = word that triggered the advance, emit_time = when the decision was available on the
simulated wall clock — emit_time is what would drive the audience subtitle, so lags are scored on it).

Ground truth: timeline entries excluding section markers (start == end == 0); entry.start minus
--gt-offset is the master-audio moment the line should appear.
"""
import argparse
import json
import statistics
import sys
from pathlib import Path


def load_ground_truth(song_path: str, gt_offset: float) -> list[float]:
    song = json.loads(Path(song_path).read_text())
    timeline = song["timeline"]
    return [t["start"] - gt_offset for t in timeline
            if not (t["start"] == 0 and t["end"] == 0)]


def load_truth_file(path: str) -> list[float]:
    """Empirical ground truth: JSON [{"line": i, "start": seconds}, ...]."""
    entries = json.loads(Path(path).read_text())
    return [e["start"] for e in sorted(entries, key=lambda e: e["line"])]


def load_events(path: str) -> list[dict]:
    events = []
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line:
            events.append(json.loads(line))
    return events


def score(events: list[dict], truth: list[float]) -> dict:
    n_lines = len(truth)
    detected: dict[int, dict] = {}
    wrong_direction = 0
    duplicates = 0
    out_of_range = 0
    last_index = -1
    for ev in events:
        i = ev["line_index"]
        if i < 0 or i >= n_lines:
            out_of_range += 1
            continue
        if i < last_index:
            wrong_direction += 1
            continue
        if i in detected:
            duplicates += 1
            continue
        detected[i] = ev
        last_index = max(last_index, i)

    lags = []          # emit_time - truth (what the audience experiences)
    audio_lags = []    # audio_time - truth (matcher decision point in audio)
    per_line = []
    false_early = 0
    for i, t in enumerate(truth):
        ev = detected.get(i)
        if ev is None:
            per_line.append({"line": i, "truth": round(t, 2), "detected": None})
            continue
        lag = ev["emit_time"] - t
        lags.append(lag)
        audio_lags.append(ev["audio_time"] - t)
        if lag < -1.0:
            false_early += 1
        per_line.append({
            "line": i, "truth": round(t, 2),
            "detected": round(ev["emit_time"], 2), "lag": round(lag, 2),
            "audio_time": round(ev["audio_time"], 2),
        })

    missed = n_lines - len(detected)
    within = lambda tol: sum(1 for l in lags if abs(l) <= tol)
    summary = {
        "lines": n_lines,
        "advanced": len(detected),
        "missed": missed,
        "pct_within_0.5s": round(100 * within(0.5) / n_lines, 1),
        "pct_within_1.0s": round(100 * within(1.0) / n_lines, 1),
        "median_lag_s": round(statistics.median(lags), 2) if lags else None,
        "mean_lag_s": round(statistics.fmean(lags), 2) if lags else None,
        "median_audio_lag_s": round(statistics.median(audio_lags), 2) if audio_lags else None,
        "false_early_advances(<-1s)": false_early,
        "wrong_direction_events": wrong_direction,
        "duplicate_advances": duplicates,
        "out_of_range_events": out_of_range,
        "per_line": per_line,
    }
    return summary


def fmt_table(name: str, s: dict) -> str:
    lines = [f"### {name}", ""]
    lines.append(f"- advanced {s['advanced']}/{s['lines']} lines, missed {s['missed']}")
    lines.append(f"- within ±0.5 s: {s['pct_within_0.5s']}% — within ±1.0 s: {s['pct_within_1.0s']}%")
    lines.append(f"- lag (emit vs truth): median {s['median_lag_s']} s, mean {s['mean_lag_s']} s"
                 f" (audio-time median {s['median_audio_lag_s']} s)")
    lines.append(f"- false early advances (<-1 s): {s['false_early_advances(<-1s)']}, "
                 f"wrong-direction: {s['wrong_direction_events']}, duplicates: {s['duplicate_advances']}")
    lines.append("")
    lines.append("| line | truth (s) | detected (s) | lag (s) |")
    lines.append("|---|---|---|---|")
    for p in s["per_line"]:
        if p["detected"] is None:
            lines.append(f"| {p['line']} | {p['truth']} | — | MISSED |")
        else:
            lines.append(f"| {p['line']} | {p['truth']} | {p['detected']} | {p['lag']:+.2f} |")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--song", required=True)
    ap.add_argument("--gt-offset", type=float, default=9.303)
    ap.add_argument("--truth-file", help="empirical ground truth JSON; overrides song timeline")
    ap.add_argument("--events", nargs="+", required=True)
    ap.add_argument("--json", help="write machine-readable summaries here")
    args = ap.parse_args()

    truth = (load_truth_file(args.truth_file) if args.truth_file
             else load_ground_truth(args.song, args.gt_offset))
    all_summaries = {}
    for path in args.events:
        name = Path(path).name.replace(".events.jsonl", "").replace(".jsonl", "")
        s = score(load_events(path), truth)
        all_summaries[name] = s
        print(fmt_table(name, s))

    if args.json:
        Path(args.json).write_text(json.dumps(all_summaries, indent=2))
        print(f"(summaries written to {args.json})", file=sys.stderr)


if __name__ == "__main__":
    main()
