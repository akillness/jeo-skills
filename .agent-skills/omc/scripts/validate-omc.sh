#!/usr/bin/env bash
# validate-omc.sh — Validate OMC installation and configuration
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

echo "=== OMC Installation Validator ==="
echo ""

# Core prerequisites
check "Claude Code CLI available" "command -v claude"
check "Node.js 20+ available" "node -e 'process.exit(parseInt(process.version.slice(1)) >= 20 ? 0 : 1)'"
check "tmux available (required for omc team/wait)" "command -v tmux"

# Plugin installation
check "oh-my-claudecode plugin directory exists" "[ -d '${HOME}/.claude/plugins/oh-my-claudecode' ] || [ -d '${HOME}/.config/claude/plugins/oh-my-claudecode' ]"

# CLAUDE.md presence
check "OMC CLAUDE.md configured" "grep -q 'oh-my-claudecode\|OMC' '${HOME}/.claude/CLAUDE.md' 2>/dev/null"

# Settings check
check "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS documented" \
  "grep -q 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' '${HOME}/.claude/settings.json' 2>/dev/null"

# Optional multi-model
echo ""
echo "--- Optional: Multi-AI Integration ---"
check "Gemini CLI available (omc team :gemini)" "command -v gemini"
check "Codex CLI available (omc team :codex)" "command -v codex"

# omc CLI
echo ""
echo "--- OMC CLI ---"
check "omc CLI available" "command -v omc"

echo ""
echo "=== Results ==="
echo "  Passed: ${PASS}"
echo "  Failed: ${FAIL}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "✓ OMC installation looks healthy"
  echo ""
  echo "Try it:"
  echo "  autopilot: build something"
  echo "  ralph: fix all tests"
  echo "  /oh-my-claudecode:omc-doctor  # OMC's own diagnostics"
else
  echo "! Some checks failed. Run /oh-my-claudecode:omc-doctor inside Claude Code for details."
  exit 1
fi
