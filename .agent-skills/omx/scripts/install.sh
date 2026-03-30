#!/usr/bin/env bash
# omx (oh-my-codex) install script
# Installs OMX and verifies prerequisites
set -euo pipefail

OMX_PACKAGE="oh-my-codex"
CODEX_PACKAGE="@openai/codex"

print_ok()  { echo "✓ $*"; }
print_err() { echo "✗ $*" >&2; }
print_info(){ echo "→ $*"; }

# 1. Check Node.js >= 20
if ! command -v node &>/dev/null; then
  print_err "Node.js not found. Install from https://nodejs.org (v20+)"
  exit 1
fi
NODE_VER=$(node -e 'process.exit(parseInt(process.version.slice(1)) >= 20 ? 0 : 1)' 2>/dev/null && echo "OK" || echo "OLD")
if [ "$NODE_VER" = "OLD" ]; then
  print_err "Node.js 20+ required. Current: $(node --version)"
  exit 1
fi
print_ok "Node.js $(node --version)"

# 2. Install Codex CLI if missing
if ! command -v codex &>/dev/null; then
  print_info "Installing Codex CLI..."
  npm install -g "${CODEX_PACKAGE}"
  print_ok "Codex CLI installed"
else
  print_ok "Codex CLI found: $(codex --version 2>/dev/null || echo 'unknown version')"
fi

# 3. Install oh-my-codex
print_info "Installing ${OMX_PACKAGE}..."
npm install -g "${OMX_PACKAGE}"
print_ok "${OMX_PACKAGE} installed: $(omx --version 2>/dev/null || echo 'installed')"

# 4. Run OMX setup
print_info "Running omx setup..."
omx setup
print_ok "OMX setup complete"

# 5. Check tmux (optional but recommended for team mode)
if command -v tmux &>/dev/null; then
  print_ok "tmux found — team mode available"
elif command -v psmux &>/dev/null; then
  print_ok "psmux found — Windows team mode available"
else
  print_info "tmux not found — install for team mode:"
  print_info "  macOS: brew install tmux"
  print_info "  Ubuntu: sudo apt install tmux"
  print_info "  Windows: winget install psmux"
fi

echo ""
print_ok "OMX installed. Recommended first session:"
echo ""
echo "  omx --madmax --high"
echo ""
echo "Then inside Codex:"
echo "  /prompts:architect \"analyze the codebase\""
echo "  \$plan \"plan the next feature\""
echo "  \$ralph \"fix all failing tests\""
