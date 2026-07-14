#!/usr/bin/env bash
# obsidian-second-brain installer
#
# Installs the obsidian-second-brain routing skill from jeo-skills, and can also
# clone the full upstream vault skill (45 commands + background/scheduled agents)
# from akillness/obsidian-second-brain.
#
# It additionally wires the skill into jeo-code (jeo): the 45 commands surface as
# slash aliases automatically (from SKILL.md frontmatter), and a write-time
# AI-first validator is registered as an advisory post-turn hook.
#
# Idempotent and safe to re-run.
#
# Env knobs:
#   GLOBAL=1        - install the skill globally (npx skills add -g)
#   WITH_UPSTREAM=1 - also clone the full upstream obsidian-second-brain vault skill
#   VAULT=<dir>     - vault root for the jeo AI-first hook (and upstream setup.sh)
#   AGENTS=<list>   - comma/space agents for -a targeting (e.g. "claude-code,codex")
#   JEO=1|0|auto    - jeo wiring: 1 force, 0 skip, auto (default) wires when
#                     ~/.jeo/config.json exists
#   JEO_CONFIG=<f>  - override jeo config path (default ~/.jeo/config.json)
#   UNINSTALL=1     - remove the jeo AI-first hook (with backup) and exit
#
# Usage:
#   bash scripts/install.sh
#   JEO=1 VAULT="$HOME/.llm-wiki" bash scripts/install.sh
#   GLOBAL=1 WITH_UPSTREAM=1 VAULT="$HOME/my-vault" AGENTS="claude-code,codex" bash scripts/install.sh
#   UNINSTALL=1 bash scripts/install.sh

set -euo pipefail

log()  { printf '\033[1;34m[obsidian-second-brain]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[obsidian-second-brain]\033[0m %s\n' "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/akillness/jeo-skills"
UPSTREAM_URL="https://github.com/akillness/obsidian-second-brain"
SKILL="obsidian-second-brain"
JEO_CONFIG="${JEO_CONFIG:-$HOME/.jeo/config.json}"

# Never follow or replace a config symlink, including a dangling one.
reject_jeo_config_symlink() {
  if [ -L "$JEO_CONFIG" ]; then
    warn "Refusing to modify symlinked jeo config: $JEO_CONFIG"
    return 1
  fi
}

# The temp file must live beside the config so mv(1) is an atomic rename.
replace_jeo_config_atomically() {
  local tmp="$1" mode

  if [ ! -s "$tmp" ] || ! jq empty "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"
    warn "Merged config invalid — left $JEO_CONFIG unchanged."
    return 1
  fi
  if ! mode="$(stat -f '%Lp' "$JEO_CONFIG" 2>/dev/null)"; then
    if ! mode="$(stat -c '%a' "$JEO_CONFIG" 2>/dev/null)"; then
      rm -f "$tmp"
      warn "Could not read mode for $JEO_CONFIG — left it unchanged."
      return 1
    fi
  fi
  if ! chmod "$mode" "$tmp"; then
    rm -f "$tmp"
    warn "Could not preserve mode for $JEO_CONFIG — left it unchanged."
    return 1
  fi
  if [ -L "$JEO_CONFIG" ] || [ ! -f "$JEO_CONFIG" ]; then
    rm -f "$tmp"
    warn "Refusing to replace unsafe jeo config destination: $JEO_CONFIG"
    return 1
  fi
  if ! mv -f "$tmp" "$JEO_CONFIG"; then
    rm -f "$tmp"
    warn "Could not atomically replace $JEO_CONFIG — left it unchanged."
    return 1
  fi
}

# Create a unique, regular backup beside the config before copying into it.
create_jeo_config_backup() {
  local config_dir config_name backup

  if ! reject_jeo_config_symlink; then
    return 1
  fi
  config_dir="$(dirname "$JEO_CONFIG")"
  config_name="$(basename "$JEO_CONFIG")"
  if ! backup="$(mktemp "${config_dir}/.${config_name}.bak.osb.XXXXXX")"; then
    warn "Could not create secure backup beside $JEO_CONFIG — left it unchanged."
    return 1
  fi
  if [ -L "$backup" ] || [ ! -f "$backup" ]; then
    rm -f "$backup"
    warn "Refusing unsafe backup target for $JEO_CONFIG."
    return 1
  fi
  if [ -L "$backup" ] || [ ! -f "$backup" ] || [ -L "$JEO_CONFIG" ] || [ ! -f "$JEO_CONFIG" ]; then
    rm -f "$backup"
    warn "Refusing unsafe config or backup path for $JEO_CONFIG."
    return 1
  fi
  if ! cp "$JEO_CONFIG" "$backup"; then
    rm -f "$backup"
    warn "Could not back up $JEO_CONFIG — left it unchanged."
    return 1
  fi
  printf '%s\n' "$backup"
}

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

# Locate the installed AI-first adapter (prefer the installed skill dirs).
resolve_adapter() {
  local cand
  for cand in \
    "$HOME/.agents/skills/$SKILL/scripts/jeo-validate-ai-first.sh" \
    "$HOME/.claude/skills/$SKILL/scripts/jeo-validate-ai-first.sh" \
    "$SCRIPT_DIR/jeo-validate-ai-first.sh"; do
    if [ -f "$cand" ]; then
      printf '%s' "$cand"
      return 0
    fi
  done
  return 1
}

# Register the advisory AI-first validator as a jeo post-turn hook.
wire_jeo() {
  case "${JEO:-auto}" in
    0) return 0 ;;
    *)
      if ! reject_jeo_config_symlink; then
        return 1
      fi
      ;;
  esac
  case "${JEO:-auto}" in
    1) ;;  # forced
    *) [ -f "$JEO_CONFIG" ] || return 0 ;;  # auto: only when jeo is present
  esac

  if [ ! -f "$JEO_CONFIG" ]; then
    warn "JEO requested but $JEO_CONFIG not found."
    return 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    warn "jq not found — cannot safely edit $JEO_CONFIG. Install jq and re-run with JEO=1."
    if [ "${JEO:-auto}" = "1" ]; then
      return 1
    fi
    return 0
  fi

  local adapter
  if ! adapter="$(resolve_adapter)"; then
    warn "AI-first adapter not found — skipping jeo hook (re-run after the skill is installed)."
    if [ "${JEO:-auto}" = "1" ]; then
      return 1
    fi
    return 0
  fi
  chmod +x "$adapter" 2>/dev/null || true

  local vault="${VAULT:-$HOME/.llm-wiki}"
  if [ ! -d "$vault" ]; then
    warn "Vault '$vault' not found — set VAULT=<dir> to enable the AI-first hook. Skipping hook."
    if [ "${JEO:-auto}" = "1" ]; then
      return 1
    fi
    return 0
  fi

  local run="OBSIDIAN_VAULT_PATH=\"$vault\" bash \"$adapter\""
  local bak tmp config_dir config_name hook_present
  if ! hook_present="$(jq -r 'any(.hooks.hooks[]?; ((.run // "") | test("jeo-validate-ai-first")))' "$JEO_CONFIG")"; then
    warn "Could not inspect $JEO_CONFIG — left it unchanged."
    return 1
  fi
  if ! bak="$(create_jeo_config_backup)"; then
    return 1
  fi
  config_dir="$(dirname "$JEO_CONFIG")"
  config_name="$(basename "$JEO_CONFIG")"
  if ! tmp="$(mktemp "${config_dir}/.${config_name}.osb.XXXXXX")"; then
    warn "Could not create secure temp beside $JEO_CONFIG — left it unchanged."
    return 1
  fi

  if [ "$hook_present" = "true" ]; then
    log "AI-first hook already present — refreshing its run command (vault: $vault)"
    if ! jq --arg run "$run" '
      .hooks.hooks |= map(
        if ((.run // "") | test("jeo-validate-ai-first"))
        then { event: "post-turn", match: { tool: "write|edit" }, run: $run, timeoutMs: 15000 }
        else . end)
    ' "$JEO_CONFIG" > "$tmp"; then
      rm -f "$tmp"
      warn "Could not merge $JEO_CONFIG — left it unchanged."
      return 1
    fi
  else
    log "Adding AI-first post-turn hook (advisory) for vault: $vault"
    # Append only — never reassign the array, to preserve existing jeo hooks.
    if ! jq --arg run "$run" '
      .hooks = (.hooks // {}) |
      .hooks.hooks = ((.hooks.hooks // []) + [{
        event: "post-turn",
        match: { tool: "write|edit" },
        run: $run,
        timeoutMs: 15000
      }])
    ' "$JEO_CONFIG" > "$tmp"; then
      rm -f "$tmp"
      warn "Could not merge $JEO_CONFIG — left it unchanged."
      return 1
    fi
  fi

  if ! replace_jeo_config_atomically "$tmp"; then
    return 1
  fi
  log "jeo config updated (backup: $bak)"
}

# Remove the AI-first hook and restore a clean config.
uninstall_jeo() {
  if ! reject_jeo_config_symlink; then
    return 1
  fi
  if [ ! -f "$JEO_CONFIG" ]; then
    warn "$JEO_CONFIG not found — nothing to uninstall."
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    warn "jq required to uninstall the hook safely. Aborting."
    return 1
  fi

  local bak tmp config_dir config_name
  if ! bak="$(create_jeo_config_backup)"; then
    return 1
  fi
  config_dir="$(dirname "$JEO_CONFIG")"
  config_name="$(basename "$JEO_CONFIG")"
  if ! tmp="$(mktemp "${config_dir}/.${config_name}.osb.XXXXXX")"; then
    warn "Could not create secure temp beside $JEO_CONFIG — left it unchanged."
    return 1
  fi
  if ! jq '.hooks.hooks |= (map(select(((.run // "") | test("jeo-validate-ai-first")) | not)))' \
    "$JEO_CONFIG" > "$tmp"; then
    rm -f "$tmp"
    warn "Could not update $JEO_CONFIG — left it unchanged."
    return 1
  fi
  if ! replace_jeo_config_atomically "$tmp"; then
    return 1
  fi
  log "Removed AI-first hook from $JEO_CONFIG (backup: $bak)"
}

# Report what got wired and the deliberately-unported Claude-only surfaces.
verify_report() {
  if ! reject_jeo_config_symlink; then
    return 1
  fi
  local skill_md=""
  local cand
  for cand in \
    "$HOME/.agents/skills/$SKILL/SKILL.md" \
    "$HOME/.claude/skills/$SKILL/SKILL.md" \
    "$SCRIPT_DIR/../SKILL.md"; do
    [ -f "$cand" ] && { skill_md="$cand"; break; }
  done

  if [ -n "$skill_md" ]; then
    local n
    n="$(grep -m1 '^aliases:' "$skill_md" | grep -o '/[A-Za-z0-9-]*' | wc -l | tr -d ' ')"
    log "Slash aliases declared in SKILL.md: ${n:-0} (expect 45)"
  fi

  if command -v jq >/dev/null 2>&1 && [ -f "$JEO_CONFIG" ]; then
    if jq -e '.hooks.hooks[]? | select((.run // "") | test("jeo-validate-ai-first"))' "$JEO_CONFIG" >/dev/null 2>&1; then
      log "jeo AI-first hook: present"
    else
      log "jeo AI-first hook: not registered (set JEO=1 VAULT=<dir> to enable)"
    fi
    jq empty "$JEO_CONFIG" >/dev/null 2>&1 && log "jeo config: valid JSON" || warn "jeo config: INVALID JSON"
  fi

  log "Not ported to jeo (Claude Code only): / dispatcher palette, SessionStart"
  log "context loader, PostCompact background agent. Vault behavior is identical;"
  log "only the trigger surface differs."
}

# ---- main ----
if [ "${UNINSTALL:-0}" = "1" ]; then
  log "Uninstalling jeo AI-first hook"
  uninstall_jeo
  log "Uninstall complete."
  exit 0
fi

log "Starting $SKILL setup"
install_skill
install_upstream
wire_jeo
verify_report
log "Done. See .agent-skills/$SKILL/SKILL.md for the routing guide and 45-command reference."
