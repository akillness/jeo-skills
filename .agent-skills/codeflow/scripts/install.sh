#!/usr/bin/env bash
# codeflow installer wrapper.
# Self-hosts the CodeFlow web app (braedonsaunders/codeflow, MIT): clones (or
# updates) the single-file repo locally and opens index.html in the browser.
# CodeFlow has NO build step and NO npm install — it loads pinned React/D3/Babel
# from CDNs and runs 100% client-side. For the hosted app, just visit
# https://codeflow-five.vercel.app/ instead.
#
# Env knobs:
#   CODEFLOW_DIR     — clone target (default: ~/.codeflow)
#   CODEFLOW_REPO    — upstream git URL (default: braedonsaunders/codeflow)
#   CODEFLOW_NO_OPEN=1 — clone/update only, do not launch a browser
#
# Usage:
#   bash scripts/install.sh
#   CODEFLOW_DIR=~/tools/codeflow bash scripts/install.sh
#   CODEFLOW_NO_OPEN=1 bash scripts/install.sh

set -euo pipefail

CODEFLOW_DIR="${CODEFLOW_DIR:-$HOME/.codeflow}"
CODEFLOW_REPO="${CODEFLOW_REPO:-https://github.com/braedonsaunders/codeflow.git}"

echo "=== codeflow installer ==="
echo "repo: ${CODEFLOW_REPO}"
echo "dir:  ${CODEFLOW_DIR}"

if ! command -v git >/dev/null 2>&1; then
  echo "  ⚠️  git not found — install git, or just use the hosted app: https://codeflow-five.vercel.app/" >&2
  exit 1
fi

echo "[1/2] Cloning / updating the repo"
if [ -d "$CODEFLOW_DIR/.git" ]; then
  git -C "$CODEFLOW_DIR" pull --ff-only \
    && echo "  ✅ updated $CODEFLOW_DIR" \
    || echo "  ⚠️  could not fast-forward — leaving the existing checkout as-is"
else
  git clone --depth 1 "$CODEFLOW_REPO" "$CODEFLOW_DIR" \
    && echo "  ✅ cloned to $CODEFLOW_DIR"
fi

INDEX_HTML="$CODEFLOW_DIR/index.html"
if [ ! -f "$INDEX_HTML" ]; then
  echo "  ⚠️  $INDEX_HTML not found — upstream layout may have changed" >&2
  exit 1
fi

if [ "${CODEFLOW_NO_OPEN:-0}" = "1" ]; then
  echo "[2/2] CODEFLOW_NO_OPEN=1 — skipping browser launch."
else
  echo "[2/2] Opening index.html in the default browser"
  if command -v open >/dev/null 2>&1; then            # macOS
    open "$INDEX_HTML"
  elif command -v xdg-open >/dev/null 2>&1; then       # Linux
    xdg-open "$INDEX_HTML" >/dev/null 2>&1 &
  elif command -v powershell.exe >/dev/null 2>&1; then # Windows (WSL/Git Bash)
    powershell.exe Start-Process "$INDEX_HTML" >/dev/null 2>&1 || start "$INDEX_HTML"
  else
    echo "  ℹ️  no opener found — open this file manually: $INDEX_HTML"
  fi
fi

echo ""
echo "Done. Next steps:"
echo "  • Hosted (no install): https://codeflow-five.vercel.app/"
echo "  • Local file:          file://$INDEX_HTML"
echo "  • Paste a repo (owner/name) or full GitHub URL, then press Enter."
echo "  • For private repos / higher rate limits, add a GitHub token in the UI (kept in browser memory only)."
echo "  • Optional parser unit tests:  node --test \"$CODEFLOW_DIR/tests/\""
