#!/bin/bash
# plannotator - Status Check Script
# Verifies CLI install, hook configuration for all AI tools, and environment variables
#
# Usage: ./check-status.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

check_pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
check_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARN=$((WARN+1)); }
check_fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     plannotator Status Report              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. CLI ─────────────────────────────────────────
echo -e "${BLUE}CLI Installation${NC}"

if command -v plannotator &>/dev/null; then
  VERSION=$(plannotator --version 2>/dev/null || echo "unknown")
  check_pass "plannotator CLI installed (version: ${VERSION})"
  check_pass "Location: $(which plannotator)"
else
  check_fail "plannotator CLI not found in PATH"
  echo -e "    ${GRAY}Fix: run ./install.sh${NC}"
fi

echo ""

# ── 2. Hook Configuration ──────────────────────────
echo -e "${BLUE}Hook Configuration${NC}"

CLAUDE_SUBDIR=".claude"
CLAUDE_DIR="$HOME/${CLAUDE_SUBDIR}"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"
HOOK_CONFIGURED=false

if [ -L "$SETTINGS_FILE" ]; then
  check_warn "Claude settings file is a symlink (skipping read): ${SETTINGS_FILE}"
elif [ -f "$SETTINGS_FILE" ]; then
  if grep -q "plannotator" "$SETTINGS_FILE" 2>/dev/null; then
    check_pass "plannotator hook found in ${SETTINGS_FILE}"
    HOOK_CONFIGURED=true

    # Check hook is for ExitPlanMode
    if grep -q "ExitPlanMode" "$SETTINGS_FILE" 2>/dev/null; then
      check_pass "Hook is bound to ExitPlanMode (plan review enabled)"
    else
      check_warn "Hook found but not bound to ExitPlanMode"
    fi
  else
    check_warn "No plannotator hook in ${SETTINGS_FILE}"
    echo -e "    ${GRAY}Fix: run ./setup-hook.sh${NC}"
  fi
else
  check_warn "Claude settings file not found at ${SETTINGS_FILE}"
  echo -e "    ${GRAY}Fix: run ./setup-hook.sh to create it${NC}"
fi

# Check for plugin install (alternative to manual hook)
PLUGIN_DIR="${CLAUDE_DIR}/plugins"
if [ -d "$PLUGIN_DIR" ] && ls "$PLUGIN_DIR" 2>/dev/null | grep -qi plannotator; then
  check_pass "plannotator Claude Code plugin detected"
  HOOK_CONFIGURED=true
fi

if [ "$HOOK_CONFIGURED" = false ]; then
  check_fail "No hook configuration found — plan review won't trigger automatically"
  echo -e "    ${GRAY}Fix: run ./setup-hook.sh${NC}"
fi

echo ""

# ── 3. Environment Variables ───────────────────────
echo -e "${BLUE}Environment Variables${NC}"

if [ -n "$PLANNOTATOR_REMOTE" ]; then
  check_pass "PLANNOTATOR_REMOTE=${PLANNOTATOR_REMOTE} (remote mode active)"
else
  echo -e "  ${GRAY}-${NC} PLANNOTATOR_REMOTE not set (local mode — browser opens automatically)"
fi

if [ -n "$PLANNOTATOR_PORT" ]; then
  check_pass "PLANNOTATOR_PORT=${PLANNOTATOR_PORT}"
else
  echo -e "  ${GRAY}-${NC} PLANNOTATOR_PORT not set (random port in local mode, 19432 in remote mode)"
fi

if [ -n "$PLANNOTATOR_BROWSER" ]; then
  check_pass "PLANNOTATOR_BROWSER=${PLANNOTATOR_BROWSER}"
else
  echo -e "  ${GRAY}-${NC} PLANNOTATOR_BROWSER not set (uses system default)"
fi

if [ -n "$PLANNOTATOR_SHARE_URL" ]; then
  check_pass "PLANNOTATOR_SHARE_URL=${PLANNOTATOR_SHARE_URL}"
else
  echo -e "  ${GRAY}-${NC} PLANNOTATOR_SHARE_URL not set (uses share.plannotator.ai)"
fi

echo ""

# ── 4. Review Command ──────────────────────────────
echo -e "${BLUE}Code Review (/plannotator-review)${NC}"

if command -v plannotator &>/dev/null; then
  # Try to check if review subcommand exists
  if plannotator review --help &>/dev/null 2>&1; then
    check_pass "plannotator review command available"
  else
    check_warn "plannotator review command may not be available (check CLI version)"
  fi
else
  check_fail "Cannot check review command — CLI not installed"
fi

echo ""

# ── 3b. Gemini CLI Hook ─────────────────────────────────────
echo -e "${BLUE}Gemini CLI Hook${NC}"

GEMINI_SUBDIR=".gemini"
GEMINI_DIR="$HOME/${GEMINI_SUBDIR}"
GEMINI_SETTINGS="${GEMINI_DIR}/settings.json"
if [ -L "$GEMINI_SETTINGS" ]; then
  check_warn "Gemini settings file is a symlink (skipping read): ${GEMINI_SETTINGS}"
elif [ -f "$GEMINI_SETTINGS" ]; then
  if grep -q "plannotator" "$GEMINI_SETTINGS" 2>/dev/null; then
    check_pass "plannotator hook found in ${GEMINI_SETTINGS}"
    if grep -q "ExitPlanMode" "$GEMINI_SETTINGS" 2>/dev/null; then
      check_pass "Hook bound to ExitPlanMode"
    else
      check_warn "Hook found but not bound to ExitPlanMode"
    fi
  else
    check_warn "No plannotator hook in ${GEMINI_SETTINGS}"
    echo -e "    ${GRAY}Fix: run ./setup-gemini-hook.sh${NC}"
  fi
else
  echo -e "  ${GRAY}-${NC} Gemini settings file not found at ${GEMINI_SETTINGS} (run ./setup-gemini-hook.sh to configure)"
fi

GEMINI_MD="${GEMINI_DIR}/GEMINI.md"
if [ -L "$GEMINI_MD" ]; then
  check_warn "GEMINI.md is a symlink (skipping read): ${GEMINI_MD}"
elif [ -f "$GEMINI_MD" ] && grep -q "plannotator" "$GEMINI_MD" 2>/dev/null; then
  check_pass "plannotator instructions found in ${GEMINI_MD}"
else
  echo -e "  ${GRAY}-${NC} No plannotator instructions in GEMINI.md (run ./setup-gemini-hook.sh)"
fi

echo ""

# ── 3c. Codex CLI Configuration ────────────────────────────
echo -e "${BLUE}Codex CLI Configuration${NC}"

CODEX_SUBDIR=".codex"
CODEX_DIR="$HOME/${CODEX_SUBDIR}"
CODEX_CONFIG="${CODEX_DIR}/config.toml"
if [ -L "$CODEX_CONFIG" ]; then
  check_warn "Codex config is a symlink (skipping read): ${CODEX_CONFIG}"
elif [ -f "$CODEX_CONFIG" ]; then
  if grep -q "plannotator" "$CODEX_CONFIG" 2>/dev/null; then
    check_pass "plannotator found in ${CODEX_CONFIG} developer_instructions"
  else
    check_warn "No plannotator reference in ${CODEX_CONFIG}"
    echo -e "    ${GRAY}Fix: run ./setup-codex-hook.sh${NC}"
  fi
else
  echo -e "  ${GRAY}-${NC} Codex config not found at ${CODEX_CONFIG} (run ./setup-codex-hook.sh to configure)"
fi

CODEX_PROMPT="${CODEX_DIR}/prompts/plannotator.md"
if [ -L "$CODEX_PROMPT" ]; then
  check_warn "Codex prompt is a symlink (skipping read): ${CODEX_PROMPT}"
elif [ -f "$CODEX_PROMPT" ]; then
  check_pass "plannotator prompt file found at ${CODEX_PROMPT}"
else
  echo -e "  ${GRAY}-${NC} No plannotator prompt at ${CODEX_PROMPT} (run ./setup-codex-hook.sh)"
fi

echo ""

# ── 3d. OpenCode Plugin ─────────────────────────────────────
echo -e "${BLUE}OpenCode Plugin${NC}"

OPENCODE_COMMAND_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/command"
OPENCODE_JSON_FOUND=false

for candidate in "${PWD}/opencode.json" "$HOME/.config/opencode/opencode.json" "$HOME/opencode.json"; do
  if [ -f "$candidate" ] && grep -q "plannotator" "$candidate" 2>/dev/null; then
    check_pass "plannotator plugin found in ${candidate}"
    OPENCODE_JSON_FOUND=true
    break
  fi
done

if [ "$OPENCODE_JSON_FOUND" = false ]; then
  echo -e "  ${GRAY}-${NC} No plannotator plugin in opencode.json (run ./setup-opencode-plugin.sh)"
fi

if [ -f "${OPENCODE_COMMAND_DIR}/plannotator-review.md" ]; then
  check_pass "/plannotator-review slash command registered"
else
  echo -e "  ${GRAY}-${NC} /plannotator-review not found (run ./setup-opencode-plugin.sh)"
fi

if [ -f "${OPENCODE_COMMAND_DIR}/plannotator-annotate.md" ]; then
  check_pass "/plannotator-annotate slash command registered"
else
  echo -e "  ${GRAY}-${NC} /plannotator-annotate not found (run ./setup-opencode-plugin.sh)"
fi

echo ""

# ── 3e. Obsidian ────────────────────────────────────────────
echo -e "${BLUE}Obsidian (Optional — for plan auto-save)${NC}"

if command -v obsidian &>/dev/null 2>&1 || [ -d "/Applications/Obsidian.app" ] || [ -d "$HOME/Applications/Obsidian.app" ]; then
  check_pass "Obsidian detected"
else
  echo -e "  ${GRAY}-${NC} Obsidian not found (install: ${BLUE}https://obsidian.md/download${NC})"
  echo -e "  ${GRAY}   Enable vault sync in plannotator UI → gear icon → Obsidian Integration${NC}"
fi

echo ""

echo -e "${BLUE}Bear Notes (Optional — for plan auto-save)${NC}"

if [ -d "/Applications/Bear.app" ] || [ -d "$HOME/Applications/Bear.app" ]; then
  check_pass "Bear.app detected"
  echo -e "  ${GRAY}-${NC} Quick check: ${GREEN}open \"bear://x-callback-url/create?title=Plannotator%20Check&text=ok\"${NC}"
else
  echo -e "  ${GRAY}-${NC} Bear.app not found (install from App Store)"
  echo -e "  ${GRAY}   Bear export uses ${BLUE}bear://x-callback-url/create${NC} in system browser${NC}"
fi

echo ""

# ── 5. Git Status ──────────────────────────────────────────
echo -e "${BLUE}Git Repository${NC}"

if git rev-parse --git-dir &>/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  check_pass "Git repository detected (branch: ${BRANCH})"

  DIFF_COUNT=$(git diff --shortstat 2>/dev/null | grep -oE '[0-9]+ file' | head -1 || echo "0 file")
  if [ "$DIFF_COUNT" != "0 file" ]; then
    check_pass "Uncommitted changes found — ready for /plannotator-review"
  else
    echo -e "  ${GRAY}-${NC} No uncommitted changes (commit some code first for diff review)"
  fi
else
  check_warn "Not in a git repository — diff review won't work"
fi

echo ""

# ── Summary ────────────────────────────────────────
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   ${PASS}"
[ $WARN -gt 0 ] && echo -e "  ${YELLOW}Warnings:${NC} ${WARN}"
[ $FAIL -gt 0 ] && echo -e "  ${RED}Failed:${NC}   ${FAIL}"
echo ""

if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
  echo -e "${GREEN}All checks passed — plannotator is ready!${NC}"
elif [ $FAIL -eq 0 ]; then
  echo -e "${YELLOW}Setup is mostly complete — check warnings above${NC}"
else
  echo -e "${RED}Setup incomplete — fix the failures above before using plannotator${NC}"
fi

echo ""
echo -e "${BLUE}Setup scripts available:${NC}"
echo -e "  ${GREEN}./setup-hook.sh${NC}            Claude Code hook"
echo -e "  ${GREEN}./setup-gemini-hook.sh${NC}     Gemini CLI hook"
echo -e "  ${GREEN}./setup-codex-hook.sh${NC}      Codex CLI"
echo -e "  ${GREEN}./setup-opencode-plugin.sh${NC} OpenCode plugin"
echo -e "  ${GREEN}./install.sh --all${NC}         All integrations at once"
echo ""
