#!/usr/bin/env bash
# obsidian-second-brain installer
#
# Installs the obsidian-second-brain routing skill from jeo-skills, and can also
# clone the full upstream vault skill (45 commands + background/scheduled agents)
# from akillness/obsidian-second-brain.
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1        - install the skill globally (npx skills add -g)
#   WITH_UPSTREAM=1 - also clone the full upstream obsidian-second-brain vault skill
#   VAULT=<dir>     - when WITH_UPSTREAM=1, run upstream setup.sh against this vault
#   AGENTS=<list>   - comma/space agents for -a targeting (e.g. "claude-code,codex")
#
# Usage:
#   bash scripts/install.sh
#   GLOBAL=1 WITH_UPSTREAM=1 VAULT="$HOME/my-vault" AGENTS="claude-code,codex" bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[obsidian-second-brain]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[obsidian-second-brain]\033[0m %s\n' "$*" >&2; }

REPO_URL="https://github.com/akillness/jeo-skills"
UPSTREAM_URL="https://github.com/akillness/obsidian-second-brain"
SKILL="obsidian-second-brain"

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
    warn "  git clone $REPO_URL && cp -r jeo-skills/.agent-skills/$SKILL ~/.agents/skills/$SKILL"
    return 0
  fi

  log "Installing $SKILL routing skill via npx skills…"
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill "$SKILL" $GLOBAL_FLAG $AGENT_FLAGS --yes \
    || warn "npx skills add failed — install manually (git clone)."
}

install_upstream() {
  [ "${WITH_UPSTREAM:-0}" = "1" ] || return 0

  if ! command -v git >/dev/null 2>&1; then
    warn "git not found — cannot clone upstream. See $UPSTREAM_URL"
    return 0
  fi

  local dest="$HOME/.claude/skills/$SKILL"
  if [ -d "$dest/.git" ]; then
    log "Upstream already cloned at $dest — pulling latest…"
    git -C "$dest" pull --ff-only || warn "git pull failed — leaving existing clone."
  else
    log "Cloning upstream vault skill into $dest…"
    git clone "$UPSTREAM_URL" "$dest" \
      || { warn "Clone failed — see $UPSTREAM_URL"; return 0; }
  fi

  if [ -n "${VAULT:-}" ] && [ -f "$dest/scripts/setup.sh" ]; then
    log "Running upstream setup.sh against vault: $VAULT"
    bash "$dest/scripts/setup.sh" "$VAULT" \
      || warn "Upstream setup.sh failed — run it manually: bash $dest/scripts/setup.sh \"$VAULT\""
    log "Vault wired. Next: open your CLI in the vault and run /obsidian-init"
  else
    log "Upstream cloned. Next: bash $dest/scripts/setup.sh \"/path/to/your/vault\" && /obsidian-init"
  fi
}

log "Starting $SKILL setup"
install_skill
install_upstream
log "Done. See .agent-skills/$SKILL/SKILL.md for the routing guide and 45-command reference."
