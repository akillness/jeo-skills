#!/usr/bin/env bash
# awesome-agent-skills installer
#
# Installs the awesome-agent-skills routing skill from jeo-skills, and can also
# pull the full upstream collection (19 persona skills + self-improving optimizer)
# from Shubhamsaboo/awesome-llm-apps.
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1        - install the skill globally (npx skills add -g)
#   WITH_UPSTREAM=1 - also install the full upstream awesome-agent-skills collection
#   AGENTS=<list>   - comma/space agents for -a targeting (e.g. "claude-code,codex")
#
# Usage:
#   bash scripts/install.sh
#   GLOBAL=1 WITH_UPSTREAM=1 AGENTS="claude-code,codex" bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[awesome-agent-skills]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[awesome-agent-skills]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"
UPSTREAM="shubhamsaboo/awesome-agent-skills"

# Build optional flags
GLOBAL_FLAG=""
[ "${GLOBAL:-0}" = "1" ] && GLOBAL_FLAG="-g"

AGENT_FLAGS=""
if [ -n "${AGENTS:-}" ]; then
  # accept comma- or space-separated agent list
  for a in ${AGENTS//,/ }; do
    AGENT_FLAGS="$AGENT_FLAGS -a $a"
  done
fi

install_skill() {
  if ! command -v npx >/dev/null 2>&1; then
    warn "Node.js/npx not found. Manual install:"
    warn "  git clone $REPO_URL && cp -r jeo-skills/.agent-skills/awesome-agent-skills ~/.agents/skills/awesome-agent-skills"
    return 0
  fi

  log "Installing awesome-agent-skills routing skill via npx skills…"
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill awesome-agent-skills $GLOBAL_FLAG $AGENT_FLAGS --yes \
    || warn "npx skills add failed — install manually (git clone)."

  if [ "${WITH_UPSTREAM:-0}" = "1" ]; then
    log "Installing full upstream collection ($UPSTREAM)…"
    # shellcheck disable=SC2086
    npx skills add "$UPSTREAM" $GLOBAL_FLAG $AGENT_FLAGS --yes \
      || warn "Upstream install failed — see https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/awesome_agent_skills"
  fi
}

log "Starting awesome-agent-skills setup"
install_skill
log "Done. See .agent-skills/awesome-agent-skills/SKILL.md for the routing guide and 6 reference pipelines."
