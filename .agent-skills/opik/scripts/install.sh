#!/usr/bin/env bash
# opik installer wrapper.
# Installs the Opik Python SDK and (optionally) a local self-hosted server.
#
# Env knobs:
#   OPIK_INSTALL_MODE — "sdk" (default) installs only the Python SDK;
#                       "local" also clones the platform and starts ./opik.sh
#   OPIK_REF          — Git ref / tag / SHA for the local server clone (default: main)
#   OPIK_DIR          — clone target for local mode (default: ./opik)
#   OPIK_PROFILE      — optional ./opik.sh profile flag for local mode
#                       (e.g. --infra, --backend, --guardrails)
#
# Usage:
#   bash scripts/install.sh
#   OPIK_INSTALL_MODE=local bash scripts/install.sh
#   OPIK_INSTALL_MODE=local OPIK_REF=1.7.0 OPIK_PROFILE=--backend bash scripts/install.sh

set -euo pipefail

OPIK_INSTALL_MODE="${OPIK_INSTALL_MODE:-sdk}"
OPIK_REF="${OPIK_REF:-main}"
OPIK_DIR="${OPIK_DIR:-./opik}"

echo "=== opik installer ==="
echo "mode: ${OPIK_INSTALL_MODE}"

# Fast path: SDK already installed → skip network install (FORCE=1 to upgrade).
if [ "${FORCE:-0}" != "1" ] && [ "${OPIK_INSTALL_MODE}" = "sdk" ] \
  && command -v opik >/dev/null 2>&1; then
  echo "opik already installed ($(opik --version 2>/dev/null || echo unknown)) — set FORCE=1 to upgrade."
  exit 0
fi

echo "[1/2] Installing the opik Python SDK"
if [ -n "${VIRTUAL_ENV:-}" ]; then
  # Active venv: install the importable SDK into it
  if command -v uv >/dev/null 2>&1; then
    uv pip install --upgrade opik
  else
    pip install --upgrade opik
  fi
elif command -v uv >/dev/null 2>&1; then
  # No venv: isolated CLI install; keeps system/Homebrew Python untouched (PEP 668)
  uv tool install --upgrade opik
  echo "NOTE: installed the 'opik' CLI in an isolated uv tool env."
  echo "      For SDK usage, run 'uv pip install opik' inside your project venv."
elif command -v pip3 >/dev/null 2>&1; then
  pip3 install --upgrade opik 2>/dev/null \
    || pip3 install --user --break-system-packages --upgrade opik
else
  echo "ERROR: neither uv nor pip is installed." >&2
  echo "  Install uv:   curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  echo "  Or pip:       python3 -m ensurepip --upgrade" >&2
  exit 1
fi

if command -v opik >/dev/null 2>&1; then
  echo "[2/2] opik CLI available: $(opik --version 2>/dev/null || echo 'installed')"
else
  echo "[2/2] SDK installed (CLI entrypoint not on PATH — check your Python bin dir)."
fi

if [ "${OPIK_INSTALL_MODE}" = "local" ]; then
  echo ""
  echo "=== Local self-hosted server (Docker Compose) ==="
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is required for OPIK_INSTALL_MODE=local." >&2
    exit 1
  fi
  if [ ! -d "${OPIK_DIR}/.git" ]; then
    git clone https://github.com/comet-ml/opik.git "${OPIK_DIR}"
  fi
  ( cd "${OPIK_DIR}" && git fetch --tags && git checkout "${OPIK_REF}" && ./opik.sh ${OPIK_PROFILE:-} )
  echo "Opik UI: http://localhost:5173"
fi

echo ""
echo "Done. Next:"
echo "  opik configure                 # point the SDK at your server / Comet.com workspace"
echo "  python -c 'import opik; print(opik.__version__)'"
echo "  Then add @opik.track or a framework integration to start logging traces."
