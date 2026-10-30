#!/usr/bin/env bash
# install-openspace.sh — non-interactive installer for OpenSpace
# (https://github.com/HKUDS/OpenSpace, MIT), positioned as the skill-finder /
# skill-retrieval layer for this jeo-skills catalog.
#
# Steps:
#   1. clone or update OpenSpace into OPENSPACE_HOME at GIT_REF
#   2. build (or rebuild a dead) venv and install OpenSpace plus the local BM25
#      ranker dependencies (rank-bm25, PyYAML) into it
#   3. verify `openspace-mcp --help` and the prompt router contract
#      (`route_prompt.py --check`, offline)
#   4. copy the two host skills (skill-discovery, delegate-task) into SKILLS_ROOT
#   5. register the openspace MCP server into every installed runtime via
#      register-openspace-mcp.sh, with OPENSPACE_HOST_SKILL_DIRS=SKILLS_ROOT
#   6. with --hooks: install prompt-time skill routing hooks for every detected
#      host via route-hooks.py
#
# Independent of every other skill (ooo included). Idempotent: re-running updates
# the existing clone instead of failing, and never deletes user files.
#
# Env knobs:
#   OPENSPACE_HOME=<dir>   - clone target (default: ${HOME}/.openspace/OpenSpace)
#   SKILLS_ROOT=<dir>      - host skill directory to copy into and to advertise as
#                            OPENSPACE_HOST_SKILL_DIRS (default: ${HOME}/.agents/skills)
#   OPENSPACE_VENV=<dir>   - venv to install into (default: ${HOME}/.agents/venvs/openspace)
#   PYTHON_BIN=<path>      - python interpreter used to build the venv (default: python3)
#   GIT_REF=<ref>          - git ref to check out (default: the commit the router was
#                            verified against; GIT_REF=main follows upstream)
#
# Usage:
#   bash scripts/install-openspace.sh [--hooks] [--dry-run] [--help]

set -euo pipefail

log()  { printf '\033[1;34m[openspace]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[openspace]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/HKUDS/OpenSpace.git"
# route_prompt.py uses SkillRanker.bm25_only and skill_utils from this commit.
VERIFIED_REF="618c8461dab9a075a7e7c4330b40a18e9f5514d9"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENSPACE_HOME="${OPENSPACE_HOME:-${HOME}/.openspace/OpenSpace}"
SKILLS_ROOT="${SKILLS_ROOT:-${HOME}/.agents/skills}"
OPENSPACE_VENV="${OPENSPACE_VENV:-${HOME}/.agents/venvs/openspace}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
GIT_REF="${GIT_REF:-$VERIFIED_REF}"
DRY_RUN=0
HOOKS=0

usage() {
  cat <<EOF
Usage: bash scripts/install-openspace.sh [--hooks] [--dry-run] [--help]

Installs OpenSpace as the skill-finder layer for this jeo-skills catalog.

Env knobs:
  OPENSPACE_HOME=<dir>   Clone target (default: \${HOME}/.openspace/OpenSpace)
  SKILLS_ROOT=<dir>      Host skill directory (default: \${HOME}/.agents/skills)
  OPENSPACE_VENV=<dir>   Venv target (default: \${HOME}/.agents/venvs/openspace)
  PYTHON_BIN=<path>      Python interpreter used to build the venv (default: python3)
  GIT_REF=<ref>          Git ref (default: verified commit ${VERIFIED_REF:0:12}; main follows upstream)

Options:
  --hooks     Also install prompt-time skill routing hooks for every detected host
  --dry-run   Print the planned actions without cloning, installing, or copying
  --help      Show this help and exit

Idempotent: safe to re-run. Never deletes user files.
EOF
}

while (($# > 0)); do
  case "$1" in
    --hooks)
      HOOKS=1
      shift
      ;;
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
  echo "  1. clone/update $REPO_URL -> $OPENSPACE_HOME at $GIT_REF"
  echo "  2. build venv $OPENSPACE_VENV (rebuilt if its interpreter is gone) and install"
  echo "     -e $OPENSPACE_HOME plus rank-bm25 and PyYAML into it"
  echo "  3. verify: $OPENSPACE_VENV/bin/openspace-mcp --help (symlinked into ${HOME}/.local/bin)"
  echo "     and route_prompt.py --check (local BM25 router contract, offline)"
  echo "  4. copy host skills into: $SKILLS_ROOT"
  echo "     - $OPENSPACE_HOME/openspace/host_skills/skill-discovery/"
  echo "     - $OPENSPACE_HOME/openspace/host_skills/delegate-task/"
  echo "  5. register openspace MCP in every installed runtime (OPENSPACE_HOST_SKILL_DIRS=$SKILLS_ROOT)"
  if [ "$HOOKS" = "1" ]; then
    echo "  6. prompt-time skill routing hooks:"
    OPENSPACE_VENV="$OPENSPACE_VENV" SKILLS_ROOT="$SKILLS_ROOT" python3 "$SCRIPT_DIR/route-hooks.py" install --dry-run | sed 's/^/     /'
  fi
}

require_git() {
  if ! command -v git >/dev/null 2>&1; then
    echo "git not found on PATH" >&2
    exit 1
  fi
}

require_python() {
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Python interpreter not found: $PYTHON_BIN" >&2
    exit 1
  fi
  if ! "$PYTHON_BIN" -c 'import sys; sys.exit(sys.version_info < (3, 12))'; then
    echo "OpenSpace needs Python 3.12+; set PYTHON_BIN or install uv" >&2
    exit 1
  fi
}

clone_or_update() {
  if [ ! -d "$OPENSPACE_HOME/.git" ]; then
    log "Cloning $REPO_URL -> $OPENSPACE_HOME"
    mkdir -p "$(dirname "$OPENSPACE_HOME")"
    git clone "$REPO_URL" "$OPENSPACE_HOME"
  else
    log "OpenSpace already cloned at $OPENSPACE_HOME — updating"
    git -C "$OPENSPACE_HOME" fetch --tags --prune origin
  fi
  if [[ "$GIT_REF" =~ ^[0-9a-f]{40}$ ]]; then
    git -C "$OPENSPACE_HOME" checkout --detach "$GIT_REF"
  else
    git -C "$OPENSPACE_HOME" checkout "$GIT_REF"
    git -C "$OPENSPACE_HOME" pull --ff-only origin "$GIT_REF" || warn "Could not fast-forward $GIT_REF; leaving as-is."
  fi
  log "OpenSpace at $(git -C "$OPENSPACE_HOME" rev-parse --short HEAD)"
}

install_package() {
  # A dedicated venv, exactly like setup guide Step 3l: a bare `pip install -e` against a
  # Homebrew/distro Python fails with PEP 668 "externally-managed-environment", which is
  # how openspace-mcp ends up missing on a machine that "installed successfully".
  # A venv whose base interpreter was removed (a uv Python upgrade) is rebuilt in place.
  # OpenSpace declares mcp>=1.0.0, but mcp 2 removed mcp.server.fastmcp, which
  # openspace-mcp imports; pin the 1.x line until upstream migrates.
  local healthy=0
  local -a packages=(-e "$OPENSPACE_HOME" rank-bm25 PyYAML 'mcp>=1,<2')
  "$OPENSPACE_VENV/bin/python" -c 'import sys' >/dev/null 2>&1 && healthy=1
  if command -v uv >/dev/null 2>&1; then
    if [ "$healthy" = 0 ]; then
      log "Building venv $OPENSPACE_VENV"
      uv venv --clear --python 3.12 "$OPENSPACE_VENV"
    fi
    uv pip install --python "$OPENSPACE_VENV/bin/python" "${packages[@]}"
  else
    if [ "$healthy" = 0 ]; then
      log "Building venv $OPENSPACE_VENV"
      "$PYTHON_BIN" -m venv --clear "$OPENSPACE_VENV"
    fi
    "$OPENSPACE_VENV/bin/python" -m pip install "${packages[@]}"
  fi
}

verify_install() {
  OPENSPACE_BIN="$OPENSPACE_VENV/bin/openspace-mcp"
  log "Verifying: $OPENSPACE_BIN --help"
  if ! "$OPENSPACE_BIN" --help >/dev/null 2>&1; then
    echo "$OPENSPACE_BIN --help failed after install" >&2
    exit 1
  fi
  # Expose it on PATH the same way Step 3l does.
  mkdir -p "${HOME}/.local/bin" && ln -sf "$OPENSPACE_BIN" "${HOME}/.local/bin/openspace-mcp"
  log "openspace-mcp --help OK (symlinked into ${HOME}/.local/bin)"
  if ! OPENSPACE_HOST_SKILL_DIRS="$SKILLS_ROOT" "$OPENSPACE_VENV/bin/python" -B "$SCRIPT_DIR/route_prompt.py" --check; then
    echo "OpenSpace prompt router check failed; GIT_REF=$GIT_REF may have changed the ranker API" >&2
    exit 1
  fi
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

register_mcp() {
  log "Registering the openspace MCP server across installed runtimes"
  SKILLS_ROOT="$SKILLS_ROOT" OPENSPACE_HOME="$OPENSPACE_HOME" OPENSPACE_VENV="$OPENSPACE_VENV" \
    bash "$SCRIPT_DIR/register-openspace-mcp.sh" || \
    warn "Some runtimes could not be registered (see output above)"
}

install_hooks() {
  log "Installing prompt-time skill routing hooks for detected hosts"
  OPENSPACE_VENV="$OPENSPACE_VENV" SKILLS_ROOT="$SKILLS_ROOT" python3 "$SCRIPT_DIR/route-hooks.py" install
}

print_transports() {
  cat <<EOF

Transports: stdio (registered above) is simplest. For SSE, run:
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
  register_mcp
  if [ "$HOOKS" = "1" ]; then
    install_hooks
  fi
  print_transports
  log "Done. See .agent-skills/openspace/SKILL.md for the routing guide and references/."
}

main
