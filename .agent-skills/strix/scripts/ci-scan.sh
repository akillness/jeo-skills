#!/usr/bin/env bash

set -euo pipefail

TARGET="${1:-./}"
MODE="${STRIX_SCAN_MODE:-quick}"

if [[ -z "${STRIX_LLM:-}" ]]; then
  echo "STRIX_LLM must be set in CI." >&2
  exit 1
fi

if ! command -v strix >/dev/null 2>&1; then
  echo "Strix is not installed on this runner." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker must be available on the CI runner." >&2
  exit 1
fi

exec strix -n --target "$TARGET" --scan-mode "$MODE"
