#!/usr/bin/env bash
# install.sh — install PaperBanana with only the extras the chosen mode needs.
# Prefer a virtual environment. Set PYTHON_BIN to target a specific interpreter.
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
PROFILE="${PROFILE:-plot}"
SPEC=""

usage() {
  echo "Usage: bash scripts/install.sh [--profile plot|diagram|pdf|studio|mcp|all]" >&2
  echo "  plot     VLM-only statistical plots (Gemini/OpenAI VLM; no image-gen needed)" >&2
  echo "  diagram  methodology diagrams (image-gen provider: OpenAI default)" >&2
  echo "  pdf      + PyMuPDF for PDF inputs" >&2
  echo "  studio   + Gradio local web UI" >&2
  echo "  mcp      MCP server surface" >&2
  echo "  all      openai + google + pdf + studio + mcp" >&2
}

while (($# > 0)); do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python interpreter not found: $PYTHON_BIN" >&2
  exit 1
fi

case "$PROFILE" in
  plot)    SPEC='paperbanana[google]' ;;
  diagram) SPEC='paperbanana[openai]' ;;
  pdf)     SPEC='paperbanana[pdf]' ;;
  studio)  SPEC='paperbanana[studio]' ;;
  mcp)     SPEC='paperbanana[mcp]' ;;
  all)     SPEC='paperbanana[openai,google,pdf,studio,mcp]' ;;
  *) echo "Unsupported profile: $PROFILE" >&2; usage; exit 2 ;;
esac

"$PYTHON_BIN" -m pip install "$SPEC"
"$PYTHON_BIN" -c 'import importlib.metadata as m; print("paperbanana", m.version("paperbanana"))'

echo ""
echo "Next: set exactly one provider key (OPENAI_API_KEY / GOOGLE_API_KEY / ATLASCLOUD_API_KEY),"
echo "or run 'paperbanana setup' for a guided Gemini key flow. Plots need only a VLM key."
