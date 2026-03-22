#!/usr/bin/env bash
# clawteam skill — installation and environment setup

set -euo pipefail

echo "=== ClawTeam Installation ==="
echo ""

# Check Python version
if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3.10+ is required."
  echo "  macOS:  brew install python"
  echo "  Ubuntu: sudo apt install python3"
  exit 1
fi

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")

if [[ "$PY_MAJOR" -lt 3 ]] || ([[ "$PY_MAJOR" -eq 3 ]] && [[ "$PY_MINOR" -lt 10 ]]); then
  echo "ERROR: Python 3.10+ required, found: $PY_VERSION"
  exit 1
fi
echo "✓ Python: $PY_VERSION"

# Check tmux
if ! command -v tmux &>/dev/null; then
  echo "ERROR: tmux is required."
  echo "  macOS:  brew install tmux"
  echo "  Ubuntu: sudo apt install tmux"
  exit 1
fi
echo "✓ tmux: $(tmux -V)"

# Check git
if ! command -v git &>/dev/null; then
  echo "ERROR: git is required."
  exit 1
fi
echo "✓ git: $(git --version | head -1)"

# Install clawteam
echo ""
echo "Installing clawteam..."
pip install clawteam

echo ""
echo "✓ clawteam: $(clawteam --version 2>/dev/null || echo 'installed')"

# Check for at least one compatible agent
echo ""
echo "Checking for compatible agents..."
FOUND_AGENT=false

if command -v claude &>/dev/null; then
  echo "  ✓ Claude Code detected"
  FOUND_AGENT=true
fi
if command -v codex &>/dev/null; then
  echo "  ✓ OpenAI Codex CLI detected"
  FOUND_AGENT=true
fi
if command -v openclaw &>/dev/null; then
  echo "  ✓ OpenClaw detected"
  FOUND_AGENT=true
fi

if [[ "$FOUND_AGENT" == "false" ]]; then
  echo "  ⚠ No compatible agent found."
  echo "  Install one of:"
  echo "    Claude Code:  npm install -g @anthropic-ai/claude-code"
  echo "    Codex CLI:    npm install -g @openai/codex"
fi

# Run doctor
echo ""
echo "Running environment check..."
clawteam doctor 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Quick start:"
echo "  clawteam spawn claude 'Build a REST API' --workers 3 --team my-team"
echo "  clawteam status --team my-team"
echo "  clawteam board --team my-team"
