#!/usr/bin/env bash
# spec-stack installer wrapper.
# Installs the stack's CLI surfaces: specify-cli (spec layer) and
# cli-anything-hub (tool layer). The loop layer (ouroboros) is opt-in
# because Claude Code users typically install it as a plugin instead
# (claude plugin marketplace add Q00/ouroboros).
#
# Env knobs:
#   SPEC_STACK_OOO      — "1" also pip-installs ouroboros-ai[all]
#   SPEC_KIT_REF        — git ref for spec-kit (default: main)
#   CLI_ANYTHING_HUB_SPEC — pip requirement spec (default: cli-anything-hub)
#
# Usage:
#   bash scripts/install.sh
#   SPEC_STACK_OOO=1 bash scripts/install.sh
#   SPEC_KIT_REF=v0.0.10 bash scripts/install.sh

set -euo pipefail

SPEC_KIT_REF="${SPEC_KIT_REF:-main}"
CLI_ANYTHING_HUB_SPEC="${CLI_ANYTHING_HUB_SPEC:-cli-anything-hub}"
SPEC_KIT_FROM="git+https://github.com/github/spec-kit.git@${SPEC_KIT_REF}"

echo "=== spec-stack installer ==="
echo "spec-kit ref: ${SPEC_KIT_REF}"
echo "cli-hub spec: ${CLI_ANYTHING_HUB_SPEC}"
echo "ooo via pip:  ${SPEC_STACK_OOO:-0}"

# Fast path: all requested layers already on PATH → skip network installs.
# Set FORCE=1 to reinstall/upgrade.
if [ "${FORCE:-0}" != "1" ] \
  && command -v specify >/dev/null 2>&1 \
  && command -v cli-hub >/dev/null 2>&1 \
  && { [ "${SPEC_STACK_OOO:-0}" != "1" ] || command -v ouroboros >/dev/null 2>&1; }; then
  echo "All stack layers already installed — set FORCE=1 to reinstall/upgrade."
  exit 0
fi

install_pkg() {
  # $1 = pip requirement spec, $2 = optional --from source for uv tool
  local spec="$1" from="${2:-}"
  if [ -n "${VIRTUAL_ENV:-}" ]; then
    if command -v uv >/dev/null 2>&1; then
      if [ -n "$from" ]; then uv pip install --upgrade "${spec} @ ${from}"; else uv pip install --upgrade "$spec"; fi
    else
      if [ -n "$from" ]; then pip install --upgrade "${spec} @ ${from}"; else pip install --upgrade "$spec"; fi
    fi
  elif command -v uv >/dev/null 2>&1; then
    # No venv: isolated tool env keeps system/Homebrew Python untouched (PEP 668)
    if [ -n "$from" ]; then uv tool install --force "$spec" --from "$from"; else uv tool install --upgrade "$spec"; fi
  elif command -v pipx >/dev/null 2>&1; then
    if [ -n "$from" ]; then pipx install --force "$from"; else pipx install --force "$spec"; fi
  elif command -v pip3 >/dev/null 2>&1; then
    local target="${from:-$spec}"
    pip3 install --upgrade "$target" 2>/dev/null \
      || pip3 install --user --break-system-packages --upgrade "$target"
  else
    echo "ERROR: none of uv / pipx / pip is installed." >&2
    echo "  Install uv:   curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
    exit 1
  fi
}

echo "[1/3] Installing specify-cli (spec layer)"
install_pkg specify-cli "${SPEC_KIT_FROM}"

echo "[2/3] Installing cli-anything-hub (tool layer)"
install_pkg "${CLI_ANYTHING_HUB_SPEC}"

if [ "${SPEC_STACK_OOO:-0}" = "1" ]; then
  echo "[3/3] Installing ouroboros-ai (loop layer)"
  install_pkg "ouroboros-ai[all]"
else
  echo "[3/3] Skipping ouroboros pip install (set SPEC_STACK_OOO=1 to include)."
  echo "      Claude Code plugin route: claude plugin marketplace add Q00/ouroboros"
fi

echo ""
echo "Verify:"
for bin in specify cli-hub ouroboros; do
  if command -v "$bin" >/dev/null 2>&1; then
    echo "  ✅ $bin"
  else
    echo "  ⚠️  $bin not on PATH (check your tool bin dir, e.g. ~/.local/bin)"
  fi
done

echo ""
echo "Next (pattern A — full-stack):"
echo "  specify init . --integration claude    # write the spec"
echo "  /speckit.constitution → /speckit.specify → /speckit.clarify"
echo "  ouroboros interview && ouroboros seed generate   # freeze the contract"
echo "  cli-hub search <keyword>                # arm the tools (registry first)"
echo "  ouroboros run / ralph ↔ ouroboros evaluate       # loop until verified"
