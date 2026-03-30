#!/usr/bin/env bash
# validate-omx.sh — Validate OMX installation and configuration
set -euo pipefail

PASS=0
FAIL=0

check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo "✓ $label"
    ((PASS++)) || true
  else
    echo "✗ $label"
    ((FAIL++)) || true
  fi
}

echo "=== OMX Installation Validator ==="
echo ""

# Core prerequisites
check "Node.js 20+ available" "node -e 'process.exit(parseInt(process.version.slice(1)) >= 20 ? 0 : 1)'"
check "Codex CLI available" "command -v codex"
check "omx CLI available" "command -v omx"

# OMX version
if command -v omx &>/dev/null; then
  VERSION=$(omx --version 2>/dev/null || echo "unknown")
  echo "  omx version: ${VERSION}"
fi

# Setup artifacts
check "AGENTS.md present" "[ -f '${PWD}/AGENTS.md' ] || [ -f '${HOME}/.codex/AGENTS.md' ]"
check ".omx/ state directory exists" "[ -d '${PWD}/.omx' ] || true"  # may not exist yet

# Optional team runtime
echo ""
echo "--- Team Runtime ---"
check "tmux available (macOS/Linux team mode)" "command -v tmux"
check "psmux available (Windows native team mode)" "command -v psmux"

# Codex auth
echo ""
echo "--- Codex Auth ---"
check "OPENAI_API_KEY set" "[ -n '${OPENAI_API_KEY:-}' ]"

echo ""
echo "=== Results ==="
echo "  Passed: ${PASS}"
echo "  Failed: ${FAIL}"
echo ""

if [ "$FAIL" -le 2 ]; then
  echo "✓ OMX installation looks healthy"
  echo ""
  echo "Run omx doctor for detailed diagnostics:"
  echo "  omx doctor"
  echo "  omx doctor --team"
else
  echo "! Validation issues found. Run:"
  echo "  omx doctor"
  exit 1
fi
