#!/usr/bin/env bash
# omc (oh-my-claudecode) install script
# Installs OMC plugin into Claude Code and verifies prerequisites
set -euo pipefail

OMC_REPO="https://github.com/Yeachan-Heo/oh-my-claudecode"
CLAUDE_SKILLS_DIR="${HOME}/.claude/skills"
SKILL_NAME="omc"

print_ok()  { echo "✓ $*"; }
print_err() { echo "✗ $*" >&2; }
print_info(){ echo "→ $*"; }

# 1. Check Claude Code is available
if ! command -v claude &>/dev/null; then
  print_err "Claude Code CLI not found. Install from https://docs.anthropic.com/claude-code"
  exit 1
fi
print_ok "Claude Code CLI found: $(claude --version 2>/dev/null || echo 'unknown version')"

# 2. Note native teams requirement
print_info "Tip: Enable native teams in ~/.claude/settings.json:"
print_info '  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }'

# 3. Ensure skills directory exists
mkdir -p "${CLAUDE_SKILLS_DIR}"

# 4. Install via Claude Code plugin marketplace
print_info "Installing oh-my-claudecode via plugin marketplace..."
if claude --print "/plugin marketplace add ${OMC_REPO}" 2>/dev/null; then
  print_ok "Plugin added to marketplace"
  if claude --print "/plugin install oh-my-claudecode" 2>/dev/null; then
    print_ok "oh-my-claudecode plugin installed"
  else
    print_info "Run in Claude Code: /plugin install oh-my-claudecode"
  fi
else
  print_info "Marketplace add failed — run manually in Claude Code:"
  print_info "  /plugin marketplace add ${OMC_REPO}"
  print_info "  /plugin install oh-my-claudecode"
fi

# 5. npm fallback
print_info ""
print_info "Alternative: install via npm (package: oh-my-claude-sisyphus)"
print_info "  npm install -g oh-my-claude-sisyphus"

echo ""
print_ok "After installation, run in Claude Code:"
echo "  /oh-my-claudecode:omc-setup"
echo ""
echo "Then try:"
echo "  autopilot: build a REST API for managing tasks"
echo "  ralph: fix all failing tests"
echo "  /oh-my-claudecode:team 3:executor \"implement feature X\""
