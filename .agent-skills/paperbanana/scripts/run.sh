#!/usr/bin/env bash
# run.sh — thin wrapper over the paperbanana CLI so the skill can drive any mode
# without hand-writing Python. Pass the subcommand and its flags straight through.
#
# Examples:
#   bash scripts/run.sh plot --data results.csv --intent "Bar chart of accuracy"
#   bash scripts/run.sh generate --input method.txt --caption "Overview of our framework"
#   bash scripts/run.sh generate --input method.txt --caption "Overview" --optimize --auto
#   bash scripts/run.sh evaluate --generated out.png --reference human.png \
#       --context method.txt --caption "Overview"
#   bash scripts/run.sh polish --input figure.png --venue icml --iterations 2
#   bash scripts/run.sh orchestrate --paper paper.pdf --dry-run
set -euo pipefail

PAPERBANANA_BIN="${PAPERBANANA_BIN:-paperbanana}"

if [[ $# -eq 0 ]]; then
  echo "Usage: bash scripts/run.sh <generate|plot|batch|plot-batch|sweep|orchestrate|composite|evaluate|polish|venues|studio|setup|data> [flags...]" >&2
  echo "Smallest-mode-first: plot (data, VLM-only) < generate (one diagram) < batch/sweep/orchestrate." >&2
  exit 2
fi

if ! command -v "$PAPERBANANA_BIN" >/dev/null 2>&1; then
  echo "paperbanana CLI not found. Install first: bash scripts/install.sh --profile <profile>" >&2
  exit 1
fi

exec "$PAPERBANANA_BIN" "$@"
