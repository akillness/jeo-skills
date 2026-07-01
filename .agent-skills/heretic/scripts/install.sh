#!/usr/bin/env bash
# heretic installer
#
# Installs the upstream p-e-w/heretic tool ("heretic-llm") into the active Python
# environment, or (UV=1) clones the repo for uv.lock-pinned reproducible deps.
#
# It does NOT install PyTorch — torch is hardware-specific (CUDA/ROCm/CPU) and must
# be installed to match your accelerator BEFORE Heretic. The script verifies that a
# compatible torch (>= 2.2) is importable and warns otherwise.
#
# Env knobs:
#   RESEARCH=1     - also install the [research] extra (PaCMAP/matplotlib residual plots)
#   UV=1           - clone the repo and `uv sync` instead of `pip install` (pinned deps)
#   REF=<gitref>   - upstream ref to clone when UV=1 (default: main)
#   PIP=<exe>      - pip executable (default: pip)
#   UPSTREAM_URL=  - source repo (default: https://github.com/p-e-w/heretic)
#   CHECK=1        - only verify `heretic --help` works; install nothing
#   DRY=1          - print the commands that would run, execute nothing
#
# Usage:
#   bash scripts/install.sh
#   RESEARCH=1 bash scripts/install.sh
#   UV=1 bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[heretic]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[heretic]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[heretic]\033[0m %s\n' "$*" >&2; exit 1; }

RESEARCH="${RESEARCH:-0}"
UV="${UV:-0}"
REF="${REF:-main}"
PIP="${PIP:-pip}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/p-e-w/heretic}"
CHECK="${CHECK:-0}"
DRY="${DRY:-0}"

run() {
  if [ "$DRY" = "1" ]; then printf '\033[1;36m[dry]\033[0m %s\n' "$*"; else eval "$*"; fi
}

# Resolve a Python interpreter for the torch check.
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done

# --- CHECK mode: verify an existing install and exit ---
if [ "$CHECK" = "1" ]; then
  command -v heretic >/dev/null 2>&1 || die "heretic not found on PATH — run the installer first"
  run "heretic --help >/dev/null" && log "heretic --help OK"
  exit 0
fi

# --- Verify PyTorch >= 2.2 (do NOT install it; it is hardware-specific) ---
if [ -n "$PY" ]; then
  if "$PY" - <<'PYEOF' >/dev/null 2>&1
import sys
try:
    import torch
except Exception:
    sys.exit(2)
parts = torch.__version__.split("+")[0].split(".")
major, minor = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
sys.exit(0 if (major, minor) >= (2, 2) else 3)
PYEOF
  then
    log "PyTorch >= 2.2 detected"
  else
    warn "PyTorch >= 2.2 not detected. Install a torch build for your hardware first"
    warn "  (MXFP4 models such as gpt-oss need PyTorch >= 2.6). See https://pytorch.org/get-started/"
  fi
else
  warn "No python interpreter found — skipping PyTorch check"
fi

EXTRA=""
[ "$RESEARCH" = "1" ] && EXTRA="[research]"

if [ "$UV" = "1" ]; then
  # Reproducible: clone + uv sync (pins every dependency via uv.lock)
  command -v git >/dev/null 2>&1 || die "git is required for UV=1"
  command -v uv  >/dev/null 2>&1 || die "uv is required for UV=1 — https://docs.astral.sh/uv/"
  DEST="${HERETIC_SRC:-$PWD/heretic-src}"
  if [ -d "$DEST/.git" ]; then
    log "Reusing existing clone at $DEST"
  else
    log "Cloning $UPSTREAM_URL@$REF into $DEST"
    run "git clone --depth 1 --branch '$REF' '$UPSTREAM_URL' '$DEST'" \
      || run "git clone --depth 1 '$UPSTREAM_URL' '$DEST'" \
      || die "Failed to clone $UPSTREAM_URL"
  fi
  if [ "$RESEARCH" = "1" ]; then
    log "Syncing pinned dependencies with uv (+ research extra)"
    run "cd '$DEST' && uv sync --extra research"
  else
    log "Syncing pinned dependencies with uv"
    run "cd '$DEST' && uv sync"
  fi
  log "Run Heretic with:  cd '$DEST' && uv run heretic <model>"
else
  # Simplest: pip install the published package
  command -v "$PIP" >/dev/null 2>&1 || die "'$PIP' not found — set PIP=<pip executable>"
  log "Installing heretic-llm${EXTRA} via $PIP"
  run "$PIP install -U 'heretic-llm${EXTRA}'"
  log "Installed. Verify with:  heretic --help"
fi

log 'Next (a model you have the right to modify):  heretic Qwen/Qwen3-4B-Instruct-2507'
log 'Responsible use: honour base-model licenses + platform ToS; AGPL-3.0 applies to Heretic.'
