#!/usr/bin/env bash
# deep-research installer
#
# Installs the deep-research routing skill from jeo-skills. Optionally installs
# the Python dependency for the deep/report phases, and the full upstream
# slash-command skills (Claude Code / OpenCode / Codex) from
# Weizhena/Deep-Research-skills.
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1        - install the skill globally (npx skills add -g)
#   WITH_DEPS=1     - pip install pyyaml (needed by the deep-phase validator)
#   WITH_UPSTREAM=1 - also clone + install the upstream slash-command skills
#   AGENTS=<list>   - comma/space agents for -a targeting (e.g. "claude-code,codex")
#
# Usage:
#   bash scripts/install.sh
#   GLOBAL=1 WITH_DEPS=1 AGENTS="claude-code,codex" bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[deep-research]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deep-research]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"
UPSTREAM_URL="https://github.com/Weizhena/Deep-Research-skills"

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
    warn "  git clone $REPO_URL && cp -r jeo-skills/.agent-skills/deep-research ~/.agents/skills/deep-research"
    return 0
  fi

  log "Installing deep-research routing skill via npx skills…"
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill deep-research $GLOBAL_FLAG $AGENT_FLAGS --yes \
    || warn "npx skills add failed — install manually (git clone)."
}

install_deps() {
  [ "${WITH_DEPS:-0}" = "1" ] || return 0
  if command -v pip >/dev/null 2>&1; then
    log "Installing Python dependency (pyyaml) for the deep-phase validator…"
    pip install pyyaml || warn "pip install pyyaml failed — install it manually."
  elif command -v pip3 >/dev/null 2>&1; then
    log "Installing Python dependency (pyyaml) via pip3…"
    pip3 install pyyaml || warn "pip3 install pyyaml failed — install it manually."
  else
    warn "pip/pip3 not found — install pyyaml manually for validate_json.py."
  fi
}

install_upstream() {
  [ "${WITH_UPSTREAM:-0}" = "1" ] || return 0
  if ! command -v git >/dev/null 2>&1; then
    warn "git not found — cannot fetch upstream slash-command skills."
    return 0
  fi
  tmp="$(mktemp -d)"
  log "Cloning upstream slash-command skills ($UPSTREAM_URL)…"
  if git clone --depth 1 "$UPSTREAM_URL" "$tmp/dr" >/dev/null 2>&1; then
    mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents"
    cp -r "$tmp/dr/skills/research-en/." "$HOME/.claude/skills/" 2>/dev/null || true
    cp "$tmp/dr/agents/web-search-agent.md" "$HOME/.claude/agents/" 2>/dev/null || true
    cp -r "$tmp/dr/agents/web-search-modules" "$HOME/.claude/agents/" 2>/dev/null || true
    log "Upstream Claude Code skills + web-search agent installed to ~/.claude."
  else
    warn "Upstream clone failed — see $UPSTREAM_URL for manual steps."
  fi
  rm -rf "$tmp"
}

log "Starting deep-research setup"
install_skill
install_deps
install_upstream
log "Done. See .agent-skills/deep-research/SKILL.md for the routing guide and 4 reference pipelines."
