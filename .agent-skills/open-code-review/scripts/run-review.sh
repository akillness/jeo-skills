#!/usr/bin/env bash
# Wrapper around `ocr review`. Defaults to --audience agent (summary-only output).
# Usage: bash scripts/run-review.sh [ocr review flags...]
#   bash scripts/run-review.sh -b "context"
#   bash scripts/run-review.sh --commit abc123
#   bash scripts/run-review.sh --from origin/main --to feature-x --format json
set -euo pipefail

OCR_BIN="${OCR_BIN:-ocr}"
AUDIENCE="${OCR_AUDIENCE:-agent}"

if ! command -v "$OCR_BIN" >/dev/null 2>&1; then
  echo "ocr CLI not found. Install it: bash scripts/install.sh --method npm" >&2
  exit 1
fi

# Pass --audience only when the caller hasn't already set one.
audience_args=()
case " $* " in
  *" --audience "*) ;;
  *) audience_args=(--audience "$AUDIENCE") ;;
esac

exec "$OCR_BIN" review "${audience_args[@]}" "$@"
