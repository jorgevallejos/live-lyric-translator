#!/bin/zsh
# S3: replay every ASR word stream through the matcher, then score vs ground truth.
# Usage: spike/harness/run_all.sh [song_json] [gt_offset]
set -e
cd "$(dirname "$0")/../.."   # repo root

SONG="${1:-/Users/jorgevallejos/Chango Pepper/songs/tragedia-de-cerdo-asado.json}"
GT_OFFSET="${2:-9.303}"
OUT=spike/harness/out
mkdir -p "$OUT"

events_files=()
for stream in spike/asr_bench/out/*.jsonl; do
  name="$(basename "$stream" .jsonl)"
  [[ "$name" == "forced-align-reference" ]] && continue
  echo "replaying $name ..."
  python3 -m spike.matcher.replay --words "$stream" --song "$SONG" --lang es \
    > "$OUT/$name.events.jsonl"
  events_files+=("$OUT/$name.events.jsonl")
done

python3 spike/harness/metrics.py --song "$SONG" --gt-offset "$GT_OFFSET" \
  --events "${events_files[@]}" --json "$OUT/summary.json" | tee "$OUT/metrics.md"
