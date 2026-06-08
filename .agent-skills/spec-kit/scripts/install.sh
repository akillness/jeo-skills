#!/usr/bin/env bash
# spec-kit installer wrapper.
# Installs GitHub's `specify-cli` (spec-kit) via uv or pipx.
#
# Env knobs:
#   SPEC_KIT_REF       — Git ref / tag / SHA to pin (default: main)
#   SPEC_KIT_INTEGRATION — optional: integration to bootstrap after install
#                          (claude, copilot, gemini, codex, cursor, opencode,
#                           qwen, kiro, ...)
#   SPEC_KIT_PROJECT_DIR — optional: target dir to `specify init` into
#                          (default: skip init; only install the CLI)
#
# Usage:
#   bash scripts/install.sh
#   SPEC_KIT_REF=v0.0.10 bash scripts/install.sh
#   SPEC_KIT_INTEGRATION=claude SPEC_KIT_PROJECT_DIR=./my-app bash scripts/install.sh

set -euo pipefail

SPEC_KIT_REF="${SPEC_KIT_REF:-main}"
SPEC_KIT_REPO="git+https://github.com/github/spec-kit.git@${SPEC_KIT_REF}"

echo "=== spec-kit installer ==="
echo "ref: ${SPEC_KIT_REF}"

if command -v uv >/dev/null 2>&1; then
  echo "[1/2] Installing specify-cli via uv tool install"
  uv tool install --force "specify-cli" --from "${SPEC_KIT_REPO}"
elif command -v pipx >/dev/null 2>&1; then
  echo "[1/2] uv not found — falling back to pipx"
  pipx install --force "${SPEC_KIT_REPO}"
else
  echo "ERROR: neither uv nor pipx is installed." >&2
  echo "  Install uv:   curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  echo "  Or pipx:      python3 -m pip install --user pipx && pipx ensurepath" >&2
  exit 1
fi

if ! command -v specify >/dev/null 2>&1; then
  echo "ERROR: 'specify' is not on PATH after install." >&2
  echo "  Make sure your tool bin dir is on PATH (uv: ~/.local/bin)." >&2
  exit 1
fi

echo "[2/2] specify $(specify --version 2>/dev/null || echo 'installed')"
specify integration list || true

if [ -n "${SPEC_KIT_INTEGRATION:-}" ] && [ -n "${SPEC_KIT_PROJECT_DIR:-}" ]; then
  echo ""
  echo "=== Bootstrapping project ==="
  echo "dir:         ${SPEC_KIT_PROJECT_DIR}"
  echo "integration: ${SPEC_KIT_INTEGRATION}"
  mkdir -p "${SPEC_KIT_PROJECT_DIR}"
  ( cd "${SPEC_KIT_PROJECT_DIR}" && specify init . --integration "${SPEC_KIT_INTEGRATION}" --force )
fi

echo ""
echo "Done. Next:"
echo "  specify init my-project --integration claude"
echo "  cd my-project && open it in your AI agent, then run /speckit.constitution"
