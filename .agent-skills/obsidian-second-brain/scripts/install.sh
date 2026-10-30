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

# The upstream vault skill lives where its own quick-install puts it.
CLAUDE_SKILL_DIR="$HOME/.claude/skills/$SKILL"
CLAUDE_HOLD=""

# The jeo-skills routing copy carries this frontmatter line; the upstream skill does not.
is_routing_copy() {
  [ -f "$1/SKILL.md" ] && grep -q '^  source: akillness/jeo-skills$' "$1/SKILL.md"
}

# `npx skills add -g` replaces ~/.claude/skills/<skill> with a link to the routing copy,
# which deletes an upstream checkout (or any other real directory) kept there. Park such a
# directory beside the skills root while the routing skill installs, then put it back.
park_claude_skill_dir() {
  [ "${GLOBAL:-0}" = "1" ] || return 0
  [ -d "$CLAUDE_SKILL_DIR" ] && [ ! -L "$CLAUDE_SKILL_DIR" ] || return 0
  is_routing_copy "$CLAUDE_SKILL_DIR" && return 0
  CLAUDE_HOLD="$(mktemp -d "$HOME/.claude/.$SKILL.hold.XXXXXX")"
  mv "$CLAUDE_SKILL_DIR" "$CLAUDE_HOLD/$SKILL"
  log "Keeping existing $CLAUDE_SKILL_DIR out of the routing-skill install"
}

restore_claude_skill_dir() {
  [ -n "$CLAUDE_HOLD" ] || return 0
  # The slot was empty while parked, so a link or routing copy there came from npx.
  if [ -L "$CLAUDE_SKILL_DIR" ]; then
    rm -f "$CLAUDE_SKILL_DIR"
  elif [ -d "$CLAUDE_SKILL_DIR" ] && is_routing_copy "$CLAUDE_SKILL_DIR"; then
    rm -rf "$CLAUDE_SKILL_DIR"
  fi
  if [ -e "$CLAUDE_SKILL_DIR" ]; then
    warn "$CLAUDE_SKILL_DIR is occupied; the original is kept at $CLAUDE_HOLD/$SKILL"
    CLAUDE_HOLD=""
    return 1
  fi
  mv "$CLAUDE_HOLD/$SKILL" "$CLAUDE_SKILL_DIR"
  rmdir "$CLAUDE_HOLD"
  CLAUDE_HOLD=""
}
trap restore_claude_skill_dir EXIT

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
  park_claude_skill_dir
  # shellcheck disable=SC2086
  npx skills add "$REPO_URL" --skill "$SKILL" $GLOBAL_FLAG $AGENT_FLAGS --yes \
    || warn "npx skills add failed — install manually (git clone)."
  restore_claude_skill_dir
}

# Install or update the upstream checkout at ~/.claude/skills/<skill>. Claude Code gets the
# full upstream skill there; other agents keep the routing copy in ~/.agents/skills.
install_upstream() {
  [ "${WITH_UPSTREAM:-0}" = "1" ] || return 0

  if ! command -v git >/dev/null 2>&1; then
    warn "git not found — cannot clone upstream. See $UPSTREAM_URL"
    return 1
  fi

  local dest="$CLAUDE_SKILL_DIR" stage
  if [ -d "$dest/.git" ]; then
    log "Upstream already cloned at $dest — pulling latest…"
    git -C "$dest" pull --ff-only || warn "git pull failed — leaving existing clone."
  else
    if { [ -e "$dest" ] || [ -L "$dest" ]; } && ! is_routing_copy "$dest"; then
      warn "$dest exists and is neither the upstream checkout nor the jeo-skills routing copy."
      warn "Move it away, then re-run with WITH_UPSTREAM=1."
      return 1
    fi
    log "Cloning upstream vault skill into ${dest}…"
    mkdir -p "$(dirname "$dest")"
    stage="$(mktemp -d "$(dirname "$dest")/.$SKILL.clone.XXXXXX")"
    if ! git clone "$UPSTREAM_URL" "$stage/$SKILL"; then
      rm -rf "$stage"
      warn "Clone failed — see $UPSTREAM_URL"
      return 1
    fi
    # Replace the routing link or copy only once the clone has succeeded.
    if [ -L "$dest" ]; then
      rm -f "$dest"
    elif [ -e "$dest" ]; then
      rm -rf "$dest"
    fi
    mv "$stage/$SKILL" "$dest"
    rmdir "$stage"
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
    # The upstream SKILL.md has no aliases line; a missing match is a count of zero, not a failure.
    n="$(grep -m1 '^aliases:' "$skill_md" | grep -o '/[A-Za-z0-9-]*' | wc -l | tr -d ' ')" || n=0
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
UPSTREAM_STATUS=0
install_upstream || UPSTREAM_STATUS=$?
wire_jeo
verify_report
if [ "$UPSTREAM_STATUS" -ne 0 ]; then
  warn "Finished with errors: the upstream vault skill was not installed (see above)."
  exit 1
fi
log "Done. See .agent-skills/$SKILL/SKILL.md for the routing guide and 45-command reference."
