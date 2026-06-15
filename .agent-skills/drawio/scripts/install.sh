#!/usr/bin/env bash
# drawio skill installer
#
# Installs the draw.io desktop CLI (needed for PNG/SVG/PDF/JPG export) and the
# upstream Agents365-ai/drawio-skill bundle. Idempotent and safe to re-run.
#
# Env knobs:
#   SKIP_CLI=1        - skip draw.io desktop CLI install (assume already present)
#   SKIP_SKILL=1      - skip pulling the upstream drawio-skill bundle
#   WITH_GRAPHVIZ=1   - also install Graphviz (only needed for codebase auto-layout)
#   GLOBAL=1          - install the skill globally (npx skills add -g)
#
# Usage:
#   bash scripts/install.sh
#   WITH_GRAPHVIZ=1 GLOBAL=1 bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[drawio]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[drawio]\033[0m %s\n' "$*" >&2; }

os="$(uname -s 2>/dev/null || echo unknown)"

install_drawio_cli() {
  if command -v drawio >/dev/null 2>&1; then
    log "draw.io CLI already present: $(drawio --version 2>/dev/null || echo '(version unknown)')"
    return 0
  fi

  case "$os" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        log "Installing draw.io desktop via Homebrew…"
        brew install --cask drawio
      else
        warn "Homebrew not found. Install draw.io manually: https://github.com/jgraph/drawio-desktop/releases"
      fi
      ;;
    Linux)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        warn "WSL2 detected — the skill uses the Windows draw.io exe via /mnt/c automatically."
        warn "Install draw.io on Windows: https://github.com/jgraph/drawio-desktop/releases"
      else
        warn "Install the .deb/.rpm from https://github.com/jgraph/drawio-desktop/releases"
        warn "For headless export also run: sudo apt install xvfb"
      fi
      ;;
    *)
      warn "Unrecognized OS '$os'. Download draw.io: https://github.com/jgraph/drawio-desktop/releases"
      ;;
  esac

  command -v drawio >/dev/null 2>&1 \
    && log "draw.io CLI ready: $(drawio --version 2>/dev/null || true)" \
    || warn "draw.io CLI still not on PATH — export to PNG/SVG/PDF will be unavailable until it is."
}

install_graphviz() {
  if command -v dot >/dev/null 2>&1; then
    log "Graphviz already present."
    return 0
  fi
  case "$os" in
    Darwin) command -v brew >/dev/null 2>&1 && brew install graphviz || warn "Install Graphviz: brew install graphviz" ;;
    Linux)  sudo apt-get install -y graphviz 2>/dev/null || warn "Install Graphviz: apt install graphviz (or your distro's package)" ;;
    *)      warn "Install Graphviz from https://graphviz.org/download/" ;;
  esac
}

install_skill_bundle() {
  if command -v npx >/dev/null 2>&1; then
    if [ "${GLOBAL:-0}" = "1" ]; then
      log "Installing upstream drawio-skill bundle globally via npx skills…"
      npx skills add Agents365-ai/365-skills -g || warn "npx skills add failed — install manually (git clone)."
    else
      log "Installing upstream drawio-skill bundle via npx skills…"
      npx skills add Agents365-ai/365-skills || warn "npx skills add failed — install manually (git clone)."
    fi
  else
    warn "Node.js/npx not found. Manual install:"
    warn "  git clone https://github.com/Agents365-ai/drawio-skill.git ~/.claude/skills/drawio-skill"
  fi
}

log "Starting draw.io skill setup (os=$os)"
[ "${SKIP_CLI:-0}"   = "1" ] || install_drawio_cli
[ "${WITH_GRAPHVIZ:-0}" = "1" ] && install_graphviz || true
[ "${SKIP_SKILL:-0}" = "1" ] || install_skill_bundle
log "Done. Verify with: drawio --version"
