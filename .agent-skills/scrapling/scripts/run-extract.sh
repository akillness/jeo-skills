#!/usr/bin/env bash
set -euo pipefail

if (($# < 3)); then
  echo "Usage: bash scripts/run-extract.sh <mode> <url> <output_file> [extra scrapling args...]" >&2
  echo "Modes: get, post, put, delete, fetch, stealthy-fetch, dynamic, stealth, auto" >&2
  exit 2
fi

SCRAPLING_BIN="${SCRAPLING_BIN:-scrapling}"
MODE="$1"
URL="$2"
OUTPUT_FILE="$3"
shift 3

case "$MODE" in
  auto|get)
    COMMAND=(extract get)
    ;;
  post|put|delete|fetch|stealthy-fetch)
    COMMAND=(extract "$MODE")
    ;;
  dynamic)
    COMMAND=(extract fetch)
    ;;
  stealth|protected)
    COMMAND=(extract stealthy-fetch)
    ;;
  *)
    echo "Unsupported mode: $MODE" >&2
    exit 2
    ;;
esac

exec "$SCRAPLING_BIN" "${COMMAND[@]}" "$URL" "$OUTPUT_FILE" "$@"
