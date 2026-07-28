#!/usr/bin/env bash
# install-openspace.sh — non-interactive installer for OpenSpace
# (https://github.com/HKUDS/OpenSpace, MIT), positioned as the skill-finder /
# skill-retrieval layer for this jeo-skills catalog.
#
# Steps:
#   1. clone or update OpenSpace into OPENSPACE_HOME
#   2. `pip install -e .`
#   3. verify `openspace-mcp --help`
#   4. copy the two host skills (skill-discovery, delegate-task) into SKILLS_ROOT
#   5. print the MCP config JSON to paste into the host agent, with
#      OPENSPACE_HOST_SKILL_DIRS pointed at SKILLS_ROOT
#
# Idempotent: re-running updates the existing clone instead of failing, and never
# deletes user files.
#
# Env knobs:
#   OPENSPACE_HOME=<dir>   - clone target (default: ${HOME}/.openspace/OpenSpace)
#   SKILLS_ROOT=<dir>      - host skill directory to copy into and to advertise as
#                            OPENSPACE_HOST_SKILL_DIRS (default: ${HOME}/.agents/skills)
#   PYTHON_BIN=<path>      - python interpreter to use (default: python3)
#   GIT_REF=<ref>          - git ref to check out after clone/fetch (default: default branch)
#
# Usage:
#   bash scripts/install-openspace.sh [--dry-run] [--help]

set -euo pipefail

log()  { printf '\033[1;34m[openspace]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[openspace]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/HKUDS/OpenSpace.git"
OPENSPACE_HOME="${OPENSPACE_HOME:-${HOME}/.openspace/OpenSpace}"
SKILLS_ROOT="${SKILLS_ROOT:-${HOME}/.agents/skills}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DRY_RUN=0

usage() {
  cat <<EOF
Usage: bash scripts/install-openspace.sh [--dry-run] [--help]

Installs OpenSpace as the skill-finder layer for this jeo-skills catalog.

Env knobs:
  OPENSPACE_HOME=<dir>   Clone target (default: \${HOME}/.openspace/OpenSpace)
  SKILLS_ROOT=<dir>      Host skill directory (default: \${HOME}/.agents/skills)
  PYTHON_BIN=<path>      Python interpreter (default: python3)
  GIT_REF=<ref>          Git ref to check out after clone/fetch

Options:
  --dry-run   Print the planned actions without cloning, installing, or copying
  --help      Show this help and exit

Idempotent: safe to re-run. Never deletes user files.
EOF
}

while (($# > 0)); do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

print_plan() {
  log "Planned actions (dry-run=${DRY_RUN}):"
  echo "  1. clone/update $REPO_URL -> $OPENSPACE_HOME"
  echo "  2. $PYTHON_BIN -m pip install -e $OPENSPACE_HOME"
  echo "  3. verify: openspace-mcp --help"
  echo "  4. copy host skills into: $SKILLS_ROOT"
  echo "     - $OPENSPACE_HOME/openspace/host_skills/skill-discovery/"
  echo "     - $OPENSPACE_HOME/openspace/host_skills/delegate-task/"
  echo "  5. print MCP config JSON with OPENSPACE_HOST_SKILL_DIRS=$SKILLS_ROOT"
}

require_git() {
  if ! command -v git >/dev/null 2>&1; then
    echo "git not found on PATH" >&2
    exit 1
  fi
}

require_python() {
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Python interpreter not found: $PYTHON_BIN" >&2
    exit 1
  fi
}

clone_or_update() {
  if [ -d "$OPENSPACE_HOME/.git" ]; then
    log "OpenSpace already cloned at $OPENSPACE_HOME — updating"
    git -C "$OPENSPACE_HOME" fetch --tags --prune
    if [ -n "${GIT_REF:-}" ]; then
      git -C "$OPENSPACE_HOME" checkout "$GIT_REF"
      git -C "$OPENSPACE_HOME" pull --ff-only origin "$GIT_REF" || true
    else
      git -C "$OPENSPACE_HOME" pull --ff-only || warn "Could not fast-forward $OPENSPACE_HOME; leaving as-is."
    fi
  else
    log "Cloning $REPO_URL -> $OPENSPACE_HOME"
    mkdir -p "$(dirname "$OPENSPACE_HOME")"
    git clone "$REPO_URL" "$OPENSPACE_HOME"
    if [ -n "${GIT_REF:-}" ]; then
      git -C "$OPENSPACE_HOME" checkout "$GIT_REF"
    fi
  fi
}

install_package() {
  log "Installing OpenSpace (pip install -e .)"
  "$PYTHON_BIN" -m pip install -e "$OPENSPACE_HOME"
}

verify_install() {
  log "Verifying: openspace-mcp --help"
  if ! openspace-mcp --help >/dev/null 2>&1; then
    echo "openspace-mcp --help failed after install" >&2
    exit 1
  fi
  log "openspace-mcp --help OK"
}

copy_host_skills() {
  local src_discovery="$OPENSPACE_HOME/openspace/host_skills/skill-discovery"
  local src_delegate="$OPENSPACE_HOME/openspace/host_skills/delegate-task"

  mkdir -p "$SKILLS_ROOT"

  if [ -d "$src_discovery" ]; then
    log "Copying skill-discovery -> $SKILLS_ROOT/skill-discovery"
    cp -r "$src_discovery" "$SKILLS_ROOT/"
  else
    warn "skill-discovery host skill not found at $src_discovery — skipping"
  fi

  if [ -d "$src_delegate" ]; then
    log "Copying delegate-task -> $SKILLS_ROOT/delegate-task"
    cp -r "$src_delegate" "$SKILLS_ROOT/"
  else
    warn "delegate-task host skill not found at $src_delegate — skipping"
  fi
}

print_mcp_config() {
  cat <<EOF

Paste this into your host agent's MCP config (preserve existing servers):

{
  "mcpServers": {
    "openspace": {
      "command": "openspace-mcp",
      "toolTimeout": 600,
      "env": {
        "OPENSPACE_HOST_SKILL_DIRS": "$SKILLS_ROOT",
        "OPENSPACE_WORKSPACE": "$OPENSPACE_HOME",
        "OPENSPACE_CLOUD_MODE": "live",
        "OPENSPACE_CLOUD_API_KEY": "sk-xxx (optional, for cloud)"
      }
    }
  }
}

Transports: stdio (above) is simplest. For SSE, run:
  openspace-mcp --transport sse --host 127.0.0.1 --port 8080   (endpoint: http://127.0.0.1:8080/sse)
For streamable HTTP, run:
  openspace-mcp --transport streamable-http --host 127.0.0.1 --port 8081   (endpoint: http://127.0.0.1:8081/mcp)
EOF
}

main() {
  if [ "$DRY_RUN" = "1" ]; then
    print_plan
    exit 0
  fi

  require_git
  require_python
  clone_or_update
  install_package
  verify_install
  copy_host_skills
  print_mcp_config
  log "Done. See .agent-skills/openspace/SKILL.md for the routing guide and references/."
}

main
