#!/usr/bin/env bash
# cli-anything installer wrapper.
# Installs the CLI-Hub package manager (`cli-hub`) and optionally the
# agent-facing CLI-Hub meta-skill.
#
# Env knobs:
#   CLI_ANYTHING_META_SKILL — "1" also installs the cli-hub-meta-skill for
#                             SKILL-compatible agents via `npx skills`
#   CLI_ANYTHING_HUB_SPEC   — pip requirement spec (default: cli-anything-hub)
#                             e.g. "cli-anything-hub==0.2.0" to pin
#
# Usage:
#   bash scripts/install.sh
#   CLI_ANYTHING_META_SKILL=1 bash scripts/install.sh
#   CLI_ANYTHING_HUB_SPEC="cli-anything-hub==0.2.0" bash scripts/install.sh

set -euo pipefail

CLI_ANYTHING_HUB_SPEC="${CLI_ANYTHING_HUB_SPEC:-cli-anything-hub}"

echo "=== cli-anything installer ==="
echo "spec: ${CLI_ANYTHING_HUB_SPEC}"

echo "[1/2] Installing the CLI-Hub package manager"
if [ -n "${VIRTUAL_ENV:-}" ]; then
  # Active venv: install into it
  if command -v uv >/dev/null 2>&1; then
    uv pip install --upgrade "${CLI_ANYTHING_HUB_SPEC}"
  else
    pip install --upgrade "${CLI_ANYTHING_HUB_SPEC}"
  fi
elif command -v uv >/dev/null 2>&1; then
  # No venv: isolated tool env keeps system/Homebrew Python untouched (PEP 668)
  uv tool install --upgrade "${CLI_ANYTHING_HUB_SPEC}"
elif command -v pip3 >/dev/null 2>&1; then
  pip3 install --upgrade "${CLI_ANYTHING_HUB_SPEC}" 2>/dev/null \
    || pip3 install --user --break-system-packages --upgrade "${CLI_ANYTHING_HUB_SPEC}"
else
  echo "ERROR: neither uv nor pip is installed." >&2
  echo "  Install uv:   curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  echo "  Or pip:       python3 -m ensurepip --upgrade" >&2
  exit 1
fi

if command -v cli-hub >/dev/null 2>&1; then
  echo "[2/2] cli-hub available: $(cli-hub --version 2>/dev/null || echo 'installed')"
else
  echo "[2/2] package installed (cli-hub not on PATH yet — check your tool bin dir, e.g. ~/.local/bin)."
fi

if [ "${CLI_ANYTHING_META_SKILL:-0}" = "1" ]; then
  echo ""
  echo "=== Installing the CLI-Hub meta-skill for agents ==="
  if command -v npx >/dev/null 2>&1; then
    npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill -g -y
  else
    echo "WARNING: npx not found — skipping meta-skill install." >&2
    echo "  Install Node.js, then run:" >&2
    echo "  npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill -g -y" >&2
  fi
fi

echo ""
echo "Done. Next:"
echo "  cli-hub list                    # browse the registry"
echo "  cli-hub search <keyword>        # find a CLI for your software"
echo "  cli-hub install <name>          # install it (install the upstream app too)"
echo "  To GENERATE a new harness, install the platform plugin instead:"
echo "  Claude Code: /plugin marketplace add HKUDS/CLI-Anything && /plugin install cli-anything"
