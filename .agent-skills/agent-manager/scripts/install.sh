#!/usr/bin/env bash
# agent-manager install script
# Installs fractalmind-ai/agent-manager-skill via openskills or git clone
set -euo pipefail

SKILL_NAME="agent-manager"
GITHUB_REPO="fractalmind-ai/agent-manager-skill"
INSTALL_DIR="${HOME}/.claude/skills/${SKILL_NAME}"
ALT_DIR="${HOME}/.agent/skills/${SKILL_NAME}"

echo "=== agent-manager installer ==="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 is required but not installed."
  echo "  macOS: brew install python3"
  echo "  Ubuntu: sudo apt-get install python3"
  exit 1
fi
echo "  ✓ python3 $(python3 --version 2>&1 | cut -d' ' -f2)"

if ! command -v tmux &>/dev/null; then
  echo "ERROR: tmux is required but not installed."
  echo "  macOS: brew install tmux"
  echo "  Ubuntu: sudo apt-get install tmux"
  exit 1
fi
echo "  ✓ tmux $(tmux -V | cut -d' ' -f2)"

echo ""

# Method 1: openskills (recommended)
echo "Installing via openskills..."
if npx --yes openskills install "${GITHUB_REPO}" 2>/dev/null; then
  echo "  ✓ Installed via openskills"
else
  echo "  openskills install failed, trying global install..."
  if npx --yes openskills install "${GITHUB_REPO}" --global 2>/dev/null; then
    echo "  ✓ Installed globally via openskills"
  else
    echo "  openskills unavailable, falling back to git clone..."

    # Method 2: Manual git clone
    if ! command -v git &>/dev/null; then
      echo "ERROR: git is required for manual installation."
      exit 1
    fi

    TMP_DIR=$(mktemp -d)
    trap "rm -rf ${TMP_DIR}" EXIT

    echo "  Cloning ${GITHUB_REPO}..."
    git clone --depth=1 "https://github.com/${GITHUB_REPO}.git" "${TMP_DIR}/repo" 2>/dev/null

    mkdir -p "${INSTALL_DIR}"
    cp -r "${TMP_DIR}/repo/agent-manager/." "${INSTALL_DIR}/"
    echo "  ✓ Installed to ${INSTALL_DIR}"
  fi
fi

# Also install to alt path if it doesn't exist
if [ ! -d "${ALT_DIR}" ]; then
  mkdir -p "${ALT_DIR}"
  if [ -d "${INSTALL_DIR}" ]; then
    cp -r "${INSTALL_DIR}/." "${ALT_DIR}/"
    echo "  ✓ Synced to ${ALT_DIR}"
  fi
fi

echo ""

# Verify installation
echo "Verifying installation..."
MAIN_PY=""
for path in \
  "${INSTALL_DIR}/scripts/main.py" \
  "${ALT_DIR}/scripts/main.py" \
  "${PWD}/.claude/skills/${SKILL_NAME}/scripts/main.py" \
  "${PWD}/.agent/skills/${SKILL_NAME}/scripts/main.py"; do
  if [ -f "${path}" ]; then
    MAIN_PY="${path}"
    break
  fi
done

if [ -z "${MAIN_PY}" ]; then
  echo "WARNING: Could not locate main.py. Installation may have used a custom path."
  echo "  Check: ls ~/.claude/skills/ or ls ~/.agent/skills/"
else
  echo "  Found: ${MAIN_PY}"
  if python3 "${MAIN_PY}" doctor 2>/dev/null; then
    echo "  ✓ Doctor check passed"
  else
    echo "  NOTE: doctor check did not pass — run from your project root with agents/ directory"
  fi
fi

echo ""
echo "=== Installation complete ==="
echo ""
echo "Usage:"
echo "  # Set CLI alias (use path found above)"
echo "  CLI=\"python3 ${MAIN_PY:-~/.claude/skills/agent-manager/scripts/main.py}\""
echo ""
echo "  \$CLI list                   # List all agents"
echo "  \$CLI start EMP_0001         # Start an agent"
echo "  \$CLI status EMP_0001        # Check status"
echo "  \$CLI monitor EMP_0001 --follow  # Live monitor"
echo "  \$CLI stop EMP_0001          # Stop agent"
echo ""
echo "  For project setup: bash ${INSTALL_DIR}/scripts/setup.sh"
