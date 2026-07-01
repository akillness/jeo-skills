#!/usr/bin/env bash
# run-mcp.sh — start the PaperBanana MCP server for agent/IDE access.
# Uses uvx so no local clone is required; falls back to an installed console script.
#
# Set a provider key first, e.g.:
#   export GOOGLE_API_KEY=your-key   # or OPENAI_API_KEY / ATLASCLOUD_API_KEY
#
# The server exposes 11 tools: generate_diagram, generate_plot, continue_run,
# continue_diagram, continue_plot, evaluate_diagram, evaluate_plot,
# orchestrate_figures, batch_diagrams, batch_plots, download_references.
set -euo pipefail

if command -v uvx >/dev/null 2>&1; then
  exec uvx --from "paperbanana[mcp]" paperbanana-mcp "$@"
elif command -v paperbanana-mcp >/dev/null 2>&1; then
  exec paperbanana-mcp "$@"
else
  echo "Neither uvx nor paperbanana-mcp found." >&2
  echo "Install uv (https://astral.sh/uv) or run: bash scripts/install.sh --profile mcp" >&2
  exit 1
fi
