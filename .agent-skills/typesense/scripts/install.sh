#!/usr/bin/env bash
# typesense installer wrapper.
# Starts a local Typesense server (Docker) and installs the Python client.
#
# Env knobs:
#   TYPESENSE_VERSION  — image tag to pin (default: 27.1)
#   TYPESENSE_API_KEY  — admin key for the local server (default: a dev key)
#   TYPESENSE_PORT     — host port (default: 8108)
#   TYPESENSE_DATA_DIR — host data volume (default: ~/.typesense-data)
#   TYPESENSE_NO_SERVER=1 — only install the client, do not start the server
#
# Usage:
#   bash scripts/install.sh
#   TYPESENSE_VERSION=27.1 TYPESENSE_API_KEY=mysecret bash scripts/install.sh
#   TYPESENSE_NO_SERVER=1 bash scripts/install.sh

set -euo pipefail

TYPESENSE_VERSION="${TYPESENSE_VERSION:-27.1}"
TYPESENSE_API_KEY="${TYPESENSE_API_KEY:-dev-only-change-me}"
TYPESENSE_PORT="${TYPESENSE_PORT:-8108}"
TYPESENSE_DATA_DIR="${TYPESENSE_DATA_DIR:-$HOME/.typesense-data}"

echo "=== typesense installer ==="
echo "version: ${TYPESENSE_VERSION}  port: ${TYPESENSE_PORT}  data: ${TYPESENSE_DATA_DIR}"

echo "[1/2] Installing the Python client"
if [ -n "${VIRTUAL_ENV:-}" ]; then
  if command -v uv >/dev/null 2>&1; then uv pip install --upgrade typesense; else pip install --upgrade typesense; fi
elif command -v uv >/dev/null 2>&1; then
  uv pip install --system --upgrade typesense 2>/dev/null \
    || uv tool install typesense 2>/dev/null \
    || echo "  (uv could not install into system; use a venv: 'uv venv && source .venv/bin/activate')"
elif command -v pip3 >/dev/null 2>&1; then
  pip3 install --upgrade typesense 2>/dev/null \
    || pip3 install --user --break-system-packages --upgrade typesense
else
  echo "  ⚠️  no uv/pip found — install the client manually: pip install typesense"
fi

if [ "${TYPESENSE_NO_SERVER:-0}" = "1" ]; then
  echo "[2/2] TYPESENSE_NO_SERVER=1 — skipping server start."
else
  echo "[2/2] Starting the local Typesense server (Docker)"
  if ! command -v docker >/dev/null 2>&1; then
    echo "  ⚠️  docker not found — install Docker, or download a binary from https://typesense.org/downloads" >&2
  else
    mkdir -p "$TYPESENSE_DATA_DIR"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^typesense$'; then
      echo "  ℹ️  a container named 'typesense' is already running — leaving it as-is (docker rm -f typesense to reset)"
    else
      docker run -d --name typesense \
        -p "${TYPESENSE_PORT}:8108" \
        -v "${TYPESENSE_DATA_DIR}:/data" \
        "typesense/typesense:${TYPESENSE_VERSION}" \
        --data-dir /data --api-key="${TYPESENSE_API_KEY}" \
        && echo "  ✅ typesense server up on http://localhost:${TYPESENSE_PORT}" \
        || echo "  ⚠️  failed to start container (port in use? try TYPESENSE_PORT=8109)"
    fi
  fi
fi

echo ""
echo "Done. Verify + next steps:"
echo "  curl http://localhost:${TYPESENSE_PORT}/health"
echo "  python -c 'import typesense; print(\"client OK\")'"
echo "  Then create a collection, import documents, and search (see references/commands.md)."
echo "  Admin key (change for production): ${TYPESENSE_API_KEY}"
