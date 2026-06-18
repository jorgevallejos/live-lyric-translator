"""
Metrics and reporting for lyric line advancement accuracy and latency.
"""

from typing import List, Dict, Tuple
import statistics


class MetricsReporter:
    """
    Compares detected line advances to ground truth and reports metrics.
    """

    def __init__(self):
        self.results = []

    def compare_advances(
        self,
        ground_truth: List[Dict],
        detected_advances: List[Dict],
    ) -> Dict:
        """
        Compare ground truth line timings to detected advances.

        Args:
            ground_truth: [{"line_idx", "line_text", "start_time", "end_time"}, ...]
            detected_advances: [{"line_idx", "timestamp", "detected_at_time"}, ...]

        Returns:
            {
                "matched": [...],  # Lines where we detected advancement
                "missed": [...],   # Ground truth lines we missed
                "false_positives": [...],  # Detected advances with no ground truth
                "metrics": {
                    "accuracy": float (0-1),
                    "precision": float,
                    "recall": float,
                    "latency_mean": float (seconds),
                    "latency_std": float,
                    "latency_min": float,
                    "latency_max": float,
                },
            }
        """
        matched = []
        missed = []
        false_positives = list(detected_advances)
        latencies = []

        for gt in ground_truth:
            gt_idx = gt["line_idx"]
            gt_time = gt["start_time"]  # When line STARTS being sung

            # Find corresponding detection
            found_detection = None
            for detected in detected_advances:
                if detected["line_idx"] == gt_idx:
                    found_detection = detected
                    false_positives.remove(detected)
                    break

            if found_detection:
                # Calculate latency: how late did we detect it?
                detected_time = found_detection["timestamp"]
                latency = detected_time - gt_time  # Can be negative (early) or positive (late)
                latencies.append(latency)

                matched.append(
                    {
                        "line_idx": gt_idx,
                        "line_text": gt.get("line_text", ""),
                        "ground_truth_time": gt_time,
                        "detected_time": detected_time,
                        "latency": latency,
                        "on_time": abs(latency) < 0.5,  # Within 500ms is "on time"
                    }
                )
            else:
                missed.append(
                    {
                        "line_idx": gt_idx,
                        "line_text": gt.get("line_text", ""),
                        "ground_truth_time": gt_time,
                    }
                )

        # Compute metrics
        total_gt = len(ground_truth)
        total_detected = len(detected_advances)

        recall = len(matched) / total_gt if total_gt > 0 else 0.0
        precision = len(matched) / total_detected if total_detected > 0 else 0.0

        accuracy = len(matched) / total_gt if total_gt > 0 else 0.0

        latency_stats = {
            "latency_mean": statistics.mean(latencies) if latencies else 0.0,
            "latency_std": statistics.stdev(latencies) if len(latencies) > 1 else 0.0,
            "latency_min": min(latencies) if latencies else 0.0,
            "latency_max": max(latencies) if latencies else 0.0,
            "on_time_count": sum(1 for m in matched if m["on_time"]),
            "on_time_pct": (
                100.0 * sum(1 for m in matched if m["on_time"]) / len(matched)
                if matched
                else 0.0
            ),
        }

        return {
            "matched": matched,
            "missed": missed,
            "false_positives": false_positives,
            "summary": {
                "ground_truth_lines": total_gt,
                "detected_lines": total_detected,
                "matched_lines": len(matched),
                "missed_lines": len(missed),
                "false_positives": len(false_positives),
            },
            "metrics": {
                "accuracy": accuracy,
                "precision": precision,
                "recall": recall,
                **latency_stats,
            },
        }

    def print_report(self, comparison: Dict, title: str = "ASR Line-Following Report"):
        """Pretty-print the comparison report."""
        print("\n" + "=" * 80)
        print(title)
        print("=" * 80)

        summary = comparison["summary"]
        print(f"\nSummary:")
        print(f"  Ground truth lines:  {summary['ground_truth_lines']}")
        print(f"  Detected lines:      {summary['detected_lines']}")
        print(f"  Matched:             {summary['matched_lines']}")
        print(f"  Missed:              {summary['missed_lines']}")
        print(f"  False positives:     {summary['false_positives']}")

        metrics = comparison["metrics"]
        print(f"\nMetrics:")
        print(f"  Accuracy:            {metrics['accuracy']:.1%}")
        print(f"  Precision:           {metrics['precision']:.1%}")
        print(f"  Recall:              {metrics['recall']:.1%}")
        print(f"  On-time (±500ms):    {metrics['on_time_pct']:.1f}% ({metrics['on_time_count']}/{summary['matched_lines']})")
        print(f"\nLatency (seconds):")
        print(f"  Mean:                {metrics['latency_mean']:+.3f}s")
        print(f"  Std Dev:             {metrics['latency_std']:.3f}s")
        print(f"  Min (early):         {metrics['latency_min']:+.3f}s")
        print(f"  Max (late):          {metrics['latency_max']:+.3f}s")

        # Detailed matched lines
        if comparison["matched"]:
            print(f"\nMatched Lines:")
            print(f"  {'Idx':<4} {'Detected':<12} {'Truth':<12} {'Latency':<10} {'Line'}")
            print(f"  {'-' * 4} {'-' * 12} {'-' * 12} {'-' * 10} {'-' * 40}")
            for m in comparison["matched"]:
                indicator = "✓" if m["on_time"] else "⚠"
                latency_str = f"{m['latency']:+.2f}s"
                line_preview = m["line_text"][:40].replace("\n", " ")
                print(
                    f"  {indicator}{m['line_idx']:<3} {m['detected_time']:<12.2f} {m['ground_truth_time']:<12.2f} {latency_str:<10} {line_preview}"
                )

        # Missed lines
        if comparison["missed"]:
            print(f"\nMissed Lines (detected as later/not detected):")
            for m in comparison["missed"][:10]:  # Show first 10
                print(f"  Line {m['line_idx']:3d}: {m['line_text']}")
            if len(comparison["missed"]) > 10:
                print(f"  ... and {len(comparison['missed']) - 10} more")

        # False positives
        if comparison["false_positives"]:
            print(f"\nFalse Positives (spurious detections):")
            for m in comparison["false_positives"][:5]:  # Show first 5
                print(f"  Line {m['line_idx']:3d} at {m['timestamp']:.2f}s")
            if len(comparison["false_positives"]) > 5:
                print(f"  ... and {len(comparison['false_positives']) - 5} more")

        print("\n" + "=" * 80)

    def export_csv(self, comparison: Dict, output_path: str):
        """Export detailed results to CSV."""
        import csv

        with open(output_path, "w", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "line_idx",
                    "line_text",
                    "ground_truth_time",
                    "detected_time",
                    "latency",
                    "status",
                ],
            )
            writer.writeheader()

            for m in comparison["matched"]:
                writer.writerow(
                    {
                        "line_idx": m["line_idx"],
                        "line_text": m["line_text"],
                        "ground_truth_time": f"{m['ground_truth_time']:.3f}",
                        "detected_time": f"{m['detected_time']:.3f}",
                        "latency": f"{m['latency']:.3f}",
                        "status": "on_time" if m["on_time"] else "late",
                    }
                )

            for m in comparison["missed"]:
                writer.writerow(
                    {
                        "line_idx": m["line_idx"],
                        "line_text": m["line_text"],
                        "ground_truth_time": f"{m['ground_truth_time']:.3f}",
                        "detected_time": "",
                        "latency": "",
                        "status": "missed",
                    }
                )

        print(f"Results exported to {output_path}")
