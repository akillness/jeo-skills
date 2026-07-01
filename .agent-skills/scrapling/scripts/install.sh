#!/usr/bin/env bash
# scrapling installer
#
# Installs this routing skill from jeo-skills (as a plugin) and, unless
# skipped, the upstream Scrapling Python package (D4Vinci/Scrapling,
# BSD-3-Clause) at the requested profile.
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1            - install the skill globally (npx skills add -g)
#   AGENTS=<list>       - comma/space agents for -a targeting (e.g. "claude-code,codex")
#   SKIP_SKILL=1        - skip the jeo-skills plugin registration step
#   SKIP_PACKAGE=1      - skip the `pip install scrapling[...]` step
#   PYTHON_BIN=<path>   - python interpreter to use (default: python3)
#
# Usage:
#   bash scripts/install.sh [--profile parser|fetchers|shell|ai|all] [--force]
#   GLOBAL=1 bash scripts/install.sh --profile all
#   SKIP_PACKAGE=1 AGENTS="claude-code,codex" bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[scrapling]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[scrapling]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"
SKILL="scrapling"

PYTHON_BIN="${PYTHON_BIN:-python3}"
PROFILE="${PROFILE:-all}"
SCRAPLING_SPEC=""
FORCE_FLAG=""

while (($# > 0)); do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --force)
      FORCE_FLAG="--force"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash scripts/install.sh [--profile parser|fetchers|shell|ai|all] [--force]" >&2
      exit 2
      ;;
  esac
done

# ---- step 1: skill (plugin) install ----
GLOBAL_FLAG=""
[ "${GLOBAL:-0}" = "1" ] && GLOBAL_FLAG="-g"

AGENT_FLAGS=""
if [ -n "${AGENTS:-}" ]; then
  for a in ${AGENTS//,/ }; do
    AGENT_FLAGS="$AGENT_FLAGS -a $a"
  done
fi

install_skill() {
  if [ "${SKIP_SKILL:-0}" = "1" ]; then
    log "SKIP_SKILL=1 set — skipping jeo-skills plugin registration"
    return 0
  fi
  if ! command -v npx >/dev/null 2>&1; then
    warn "Node.js/npx not found. Manual install:"
    warn "  git clone $REPO_URL && cp -r jeo-skills/.agent-skills/$SKILL ~/.agents/skills/$SKILL"
    return 0
  fi
  log "Installing '$SKILL' routing skill via npx skills…"
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill "$SKILL" $GLOBAL_FLAG $AGENT_FLAGS --yes \
    || warn "npx skills add failed — install manually (git clone)."
}

# ---- step 2: upstream Scrapling Python package ----
install_package() {
  if [ "${SKIP_PACKAGE:-0}" = "1" ]; then
    log "SKIP_PACKAGE=1 set — skipping Scrapling package install"
    return 0
  fi

  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Python interpreter not found: $PYTHON_BIN" >&2
    exit 1
  fi

  case "$PROFILE" in
    parser)
      SCRAPLING_SPEC="scrapling>=0.4.2"
      ;;
    fetchers)
      SCRAPLING_SPEC='scrapling[fetchers]>=0.4.2'
      ;;
    shell)
      SCRAPLING_SPEC='scrapling[shell]>=0.4.2'
      ;;
    ai)
      SCRAPLING_SPEC='scrapling[ai]>=0.4.2'
      ;;
    all)
      SCRAPLING_SPEC='scrapling[all]>=0.4.2'
      ;;
    *)
      echo "Unsupported profile: $PROFILE" >&2
      exit 2
      ;;
  esac

  "$PYTHON_BIN" -m pip install "$SCRAPLING_SPEC"
  "$PYTHON_BIN" -c 'import scrapling; print(f"scrapling {scrapling.__version__}")'

  if [[ "$PROFILE" != "parser" ]]; then
    "$PYTHON_BIN" -m scrapling.cli install ${FORCE_FLAG:+$FORCE_FLAG}
  fi
}

# ---- main ----
log "Starting $SKILL setup (profile: $PROFILE)"
install_skill
install_package
log "Done. See .agent-skills/$SKILL/SKILL.md for the routing guide and references/."
