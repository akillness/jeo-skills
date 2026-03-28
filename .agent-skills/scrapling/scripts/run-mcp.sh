#!/usr/bin/env bash
set -euo pipefail

SCRAPLING_BIN="${SCRAPLING_BIN:-scrapling}"
HTTP_FLAG=""
HOST="0.0.0.0"
PORT="8000"

while (($# > 0)); do
  case "$1" in
    --http)
      HTTP_FLAG="--http"
      shift
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash scripts/run-mcp.sh [--http] [--host HOST] [--port PORT]" >&2
      exit 2
      ;;
  esac
done

if [[ -n "$HTTP_FLAG" ]]; then
  exec "$SCRAPLING_BIN" mcp --http --host "$HOST" --port "$PORT"
fi

exec "$SCRAPLING_BIN" mcp
