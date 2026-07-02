#!/usr/bin/env bash
# Wrapper around `ocr scan` — reviews whole files instead of a diff.
# Works in non-git directories (falls back to a .gitignore-honoring filesystem walk).
# Usage: bash scripts/run-scan.sh [ocr scan flags...]
#   bash scripts/run-scan.sh --preview
#   bash scripts/run-scan.sh --path internal --exclude '**/*_test.go'
#   bash scripts/run-scan.sh --max-tokens-budget 500000 --format json
set -euo pipefail

OCR_BIN="${OCR_BIN:-ocr}"

if ! command -v "$OCR_BIN" >/dev/null 2>&1; then
  echo "ocr CLI not found. Install it: bash scripts/install.sh --method npm" >&2
  exit 1
fi

exec "$OCR_BIN" scan "$@"
