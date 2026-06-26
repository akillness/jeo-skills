#!/usr/bin/env bash
# devup-ui installer
#
# Installs the devup-ui routing skill from jeo-skills (as a plugin), and can also
# install the Devup UI npm packages (@devup-ui/react + the matching bundler plugin)
# into a target project.
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1            - install the skill globally (npx skills add -g)
#   AGENTS=<list>       - comma/space agents for -a targeting (e.g. "claude-code,codex")
#   BUNDLER=<name>      - also install npm packages for: next|vite|rsbuild|webpack|bun
#   PROJECT=<dir>       - project directory to run the npm install in (default: skip)
#   PKG_MANAGER=<pm>    - npm|pnpm|yarn|bun (default: npm)
#
# Usage:
#   bash scripts/install.sh
#   GLOBAL=1 bash scripts/install.sh
#   BUNDLER=next PROJECT=/path/to/app bash scripts/install.sh
#   BUNDLER=vite PKG_MANAGER=pnpm PROJECT=. AGENTS="claude-code,codex" bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[devup-ui]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[devup-ui]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"
SKILL="devup-ui"

# ---- skill (plugin) install ----
GLOBAL_FLAG=""
[ "${GLOBAL:-0}" = "1" ] && GLOBAL_FLAG="-g"

AGENT_FLAGS=""
if [ -n "${AGENTS:-}" ]; then
  for a in ${AGENTS//,/ }; do
    AGENT_FLAGS="$AGENT_FLAGS -a $a"
  done
fi

install_skill() {
  if ! command -v npx >/dev/null 2>&1; then
    warn "Node.js/npx not found. Manual install:"
    warn "  git clone $REPO_URL && cp -r jeo-skills/.agent-skills/$SKILL ~/.agents/skills/$SKILL"
    return 0
  fi
  log "Installing $SKILL routing skill via npx skills…"
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill "$SKILL" $GLOBAL_FLAG $AGENT_FLAGS
}

# ---- optional: Devup UI npm packages into a project ----
plugin_pkg_for() {
  case "$1" in
    next)    echo "@devup-ui/next-plugin" ;;
    vite)    echo "@devup-ui/vite-plugin" ;;
    rsbuild) echo "@devup-ui/rsbuild-plugin" ;;
    webpack) echo "@devup-ui/webpack-plugin" ;;
    bun)     echo "@devup-ui/bun-plugin" ;;
    *)       return 1 ;;
  esac
}

install_command_for() {
  case "$1" in
    npm)  echo "npm install" ;;
    pnpm) echo "pnpm add" ;;
    yarn) echo "yarn add" ;;
    bun)  echo "bun add" ;;
    *)    return 1 ;;
  esac
}

install_packages() {
  [ -z "${BUNDLER:-}" ] && return 0

  local plugin_pkg
  if ! plugin_pkg="$(plugin_pkg_for "$BUNDLER")"; then
    warn "Unknown BUNDLER='$BUNDLER' (expected next|vite|rsbuild|webpack|bun); skipping npm install."
    return 0
  fi

  local pm="${PKG_MANAGER:-npm}"
  local add_cmd
  if ! add_cmd="$(install_command_for "$pm")"; then
    warn "Unknown PKG_MANAGER='$pm' (expected npm|pnpm|yarn|bun); skipping npm install."
    return 0
  fi

  if [ -z "${PROJECT:-}" ]; then
    log "BUNDLER=$BUNDLER set but PROJECT is empty. Run in your project:"
    log "  $add_cmd @devup-ui/react $plugin_pkg"
    log "Then register the plugin in your bundler config (see references/installation-and-plugins.md)."
    return 0
  fi

  if [ ! -d "$PROJECT" ]; then
    warn "PROJECT directory not found: $PROJECT; skipping npm install."
    return 0
  fi
  if ! command -v "$pm" >/dev/null 2>&1; then
    warn "Package manager '$pm' not found on PATH; skipping npm install."
    return 0
  fi

  log "Installing @devup-ui/react + $plugin_pkg into $PROJECT via $pm…"
  ( cd "$PROJECT" && $add_cmd @devup-ui/react "$plugin_pkg" )
  log "Next: register the plugin in your $BUNDLER config (see references/installation-and-plugins.md)."
}

# ---- main ----
log "Starting $SKILL setup"
install_skill
install_packages
log "Done. See .agent-skills/$SKILL/SKILL.md for the routing guide and references/."
