#!/usr/bin/env bash
# harness install script
# Installs the harness plugin into Claude Code and verifies prerequisites
set -euo pipefail

HARNESS_REPO="https://github.com/revfactory/harness"
CLAUDE_SKILLS_DIR="${HOME}/.claude/skills"
SKILL_NAME="harness"

print_ok()  { echo "✓ $*"; }
print_err() { echo "✗ $*" >&2; }
print_info(){ echo "→ $*"; }

# 1. Check Claude Code is available
if ! command -v claude &>/dev/null; then
  print_err "Claude Code CLI not found. Install from https://docs.anthropic.com/claude-code"
  exit 1
fi
print_ok "Claude Code CLI found: $(claude --version 2>/dev/null || echo 'unknown version')"

# 2. Ensure CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is documented
print_info "Note: Agent Team execution requires:"
print_info "  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"

# 3. Ensure skills directory exists
mkdir -p "${CLAUDE_SKILLS_DIR}"

# 4. Install via npx skills or direct copy
if command -v npx &>/dev/null; then
  print_info "Installing harness via npx skills..."
  npx skills add "${HARNESS_REPO}" --skill harness -g \
    && print_ok "harness installed via npx skills" \
    || {
      print_info "npx skills failed, falling back to direct copy..."
      _direct_install
    }
else
  _direct_install
fi

# 5. Verify SKILL.md is present
if [ -f "${CLAUDE_SKILLS_DIR}/${SKILL_NAME}/SKILL.md" ]; then
  print_ok "SKILL.md present at ${CLAUDE_SKILLS_DIR}/${SKILL_NAME}/SKILL.md"
else
  print_err "SKILL.md not found — installation may have failed"
  exit 1
fi

echo ""
echo "harness installed. Activate with:"
echo "  'build a harness for this project'"
echo "  'design an agent team for [domain]'"
echo "  'set up a harness'"

_direct_install() {
  local TMP
  TMP="$(mktemp -d)"
  print_info "Cloning ${HARNESS_REPO} into ${TMP}..."
  git clone --depth 1 "${HARNESS_REPO}" "${TMP}/harness-repo" 2>/dev/null \
    || { print_err "git clone failed. Ensure git is installed and network is available."; exit 1; }
  cp -R "${TMP}/harness-repo/skills/${SKILL_NAME}" "${CLAUDE_SKILLS_DIR}/${SKILL_NAME}"
  rm -rf "${TMP}"
  print_ok "harness copied to ${CLAUDE_SKILLS_DIR}/${SKILL_NAME}"
}
