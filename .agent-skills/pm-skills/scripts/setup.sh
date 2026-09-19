#!/usr/bin/env bash
# PM-Skills setup script
# Installs the AI operating system for product managers via Claude plugin marketplace
# Source: https://github.com/phuryn/pm-skills

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[pm-skills]${NC} $*"; }
warn() { echo -e "${YELLOW}[pm-skills WARN]${NC} $*"; }
err()  { echo -e "${RED}[pm-skills ERROR]${NC} $*" >&2; }
info() { echo -e "${BLUE}[pm-skills INFO]${NC} $*"; }

# Parse flags
INSTALL_ALL=false
PLUGINS=()

for arg in "$@"; do
  case "$arg" in
    --all) INSTALL_ALL=true ;;
    --discovery)    PLUGINS+=("pm-product-discovery") ;;
    --strategy)     PLUGINS+=("pm-product-strategy") ;;
    --execution)    PLUGINS+=("pm-execution") ;;
    --research)     PLUGINS+=("pm-market-research") ;;
    --analytics)    PLUGINS+=("pm-data-analytics") ;;
    --gtm)          PLUGINS+=("pm-go-to-market") ;;
    --growth)       PLUGINS+=("pm-marketing-growth") ;;
    --toolkit)      PLUGINS+=("pm-toolkit") ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --all          Install all 8 plugins"
      echo "  --discovery    Install pm-product-discovery (13 skills)"
      echo "  --strategy     Install pm-product-strategy (12 skills)"
      echo "  --execution    Install pm-execution (15 skills)"
      echo "  --research     Install pm-market-research (7 skills)"
      echo "  --analytics    Install pm-data-analytics (3 skills)"
      echo "  --gtm          Install pm-go-to-market (6 skills)"
      echo "  --growth       Install pm-marketing-growth (5 skills)"
      echo "  --toolkit      Install pm-toolkit (4 skills)"
      echo ""
      echo "Default (no flags): installs core plugins (discovery + strategy + execution)"
      exit 0
      ;;
  esac
done

ALL_PLUGINS=(
  "pm-product-discovery"
  "pm-product-strategy"
  "pm-execution"
  "pm-market-research"
  "pm-data-analytics"
  "pm-go-to-market"
  "pm-marketing-growth"
  "pm-toolkit"
)

CORE_PLUGINS=(
  "pm-product-discovery"
  "pm-product-strategy"
  "pm-execution"
)

# ── Prerequisite: Claude Code ──────────────────────────────────────────────────
log "Checking prerequisites..."

if ! command -v claude &>/dev/null; then
  err "Claude Code CLI not found."
  echo ""
  echo "Install Claude Code from: https://claude.ai/code"
  echo "Then re-run this script."
  exit 1
fi

CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1 || echo "unknown")
log "Claude Code found: $CLAUDE_VERSION"

# ── Add marketplace collection ─────────────────────────────────────────────────
log "Adding phuryn/pm-skills to Claude marketplace..."

if claude plugin marketplace add phuryn/pm-skills 2>/dev/null; then
  log "Marketplace collection added."
else
  warn "Could not add from marketplace (may already exist, or try manual install)."
  warn "Trying manual install from GitHub..."

  if command -v git &>/dev/null; then
    TMP_DIR=$(mktemp -d)
    trap "rm -rf $TMP_DIR" EXIT

    log "Cloning phuryn/pm-skills..."
    if git clone --depth 1 https://github.com/phuryn/pm-skills "$TMP_DIR/pm-skills" 2>/dev/null; then
      SKILLS_DIR="${HOME}/.claude/skills"
      mkdir -p "$SKILLS_DIR"

      for plugin in "${ALL_PLUGINS[@]}"; do
        if [[ -d "$TMP_DIR/pm-skills/$plugin" ]]; then
          cp -r "$TMP_DIR/pm-skills/$plugin" "$SKILLS_DIR/"
          log "Copied $plugin to $SKILLS_DIR/"
        fi
      done
      log "Manual install complete."
    else
      err "Could not clone repository. Check your internet connection."
      exit 1
    fi
  else
    err "git not found. Install git or Claude Code marketplace to continue."
    exit 1
  fi
fi

# ── Determine which plugins to install ────────────────────────────────────────
if [[ "$INSTALL_ALL" == "true" ]]; then
  TARGET_PLUGINS=("${ALL_PLUGINS[@]}")
elif [[ ${#PLUGINS[@]} -gt 0 ]]; then
  TARGET_PLUGINS=("${PLUGINS[@]}")
else
  TARGET_PLUGINS=("${CORE_PLUGINS[@]}")
  info "Installing core plugins only. Use --all for all 8 plugins."
fi

# ── Install selected plugins ───────────────────────────────────────────────────
log "Installing ${#TARGET_PLUGINS[@]} plugin(s)..."
INSTALLED=()
FAILED=()

for plugin in "${TARGET_PLUGINS[@]}"; do
  info "Installing $plugin..."
  if claude plugin install "${plugin}@pm-skills" 2>/dev/null; then
    log "  ✓ $plugin"
    INSTALLED+=("$plugin")
  else
    warn "  ✗ $plugin (may already be installed)"
    FAILED+=("$plugin")
  fi
done

# ── Verify installation ────────────────────────────────────────────────────────
log "Verifying installed plugins..."
INSTALLED_LIST=$(claude plugin list 2>/dev/null || echo "")

for plugin in "${TARGET_PLUGINS[@]}"; do
  if echo "$INSTALLED_LIST" | grep -q "$plugin"; then
    log "  ✓ $plugin — active"
  else
    warn "  ? $plugin — not detected in plugin list"
  fi
done

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "PM-Skills installation complete!"
log ""
log "Installed plugins: ${#INSTALLED[@]}"
for p in "${INSTALLED[@]}"; do log "  • $p"; done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  warn "Could not install (may already exist): ${FAILED[*]}"
fi

echo ""
info "Quick start commands:"
info "  /discover          → Opportunity solution tree (Teresa Torres)"
info "  /write-prd         → Generate structured PRD"
info "  /north-star        → Define north star metric"
info "  /strategy          → Build product strategy"
info "  /plan-launch       → Go-to-market launch plan"
info "  /sprint            → Sprint planning"
info "  /write-stories     → Generate user stories"
info ""
info "Documentation: https://github.com/phuryn/pm-skills"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
