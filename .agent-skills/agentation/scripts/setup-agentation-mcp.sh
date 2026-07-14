#!/usr/bin/env bash
# setup-agentation-mcp.sh — Register agentation MCP server for all AI agent platforms
#
# Usage:
#   bash setup-agentation-mcp.sh           # all platforms
#   bash setup-agentation-mcp.sh --claude  # Claude Code only
#   bash setup-agentation-mcp.sh --codex   # Codex CLI only
#   bash setup-agentation-mcp.sh --gemini  # Gemini CLI only
#   bash setup-agentation-mcp.sh --opencode # OpenCode only
#   bash setup-agentation-mcp.sh --all     # all platforms (explicit)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}ℹ  $*${NC}"; }
ok()    { echo -e "${GREEN}✅ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠  $*${NC}"; }
err()   { echo -e "${RED}✗  $*${NC}" >&2; }

SETUP_INCOMPLETE=false
CODEX_SECTION_APPENDED=false


mark_incomplete() {
  SETUP_INCOMPLETE=true
}

config_mode() {
  local config="$1"

  stat -f '%Lp' "$config" 2>/dev/null || stat -c '%a' "$config" 2>/dev/null
}

config_temp() {
  local config="$1"
  local parent="${config%/*}"
  local name="${config##*/}"

  mktemp "$parent/.${name}.XXXXXX"
}

remove_config_temp() {
  local temp="$1"

  [[ -z "$temp" ]] || rm -f -- "$temp"
}
validate_toml() {
  local config="$1"

  if ! command -v python3 &>/dev/null; then
    err "python3 with tomllib is required to validate $config"
    return 1
  fi
  python3 - "$config" >/dev/null 2>&1 <<'PY'
import sys

try:
    import tomllib
except ModuleNotFoundError:
    sys.exit(1)

try:
    with open(sys.argv[1], "rb") as source:
        tomllib.load(source)
except (OSError, tomllib.TOMLDecodeError):
    sys.exit(1)
PY
}


merge_json_config() {
  local config="$1"
  local entry="$2"
  local filter="$3"
  local temp=""
  local mode=""

  if [[ -L "$config" ]]; then
    err "Refusing to replace symlinked config: $config"
    return 1
  fi
  if [[ ! -f "$config" ]]; then
    err "Expected regular config file: $config"
    return 1
  fi
  if ! command -v jq &>/dev/null; then
    err "jq is required to update $config"
    return 1
  fi
  if ! temp="$(config_temp "$config")"; then
    err "Could not create a temporary config beside $config"
    return 1
  fi
  if ! jq --argjson entry "$entry" "$filter" "$config" > "$temp"; then
    err "jq merge failed for $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! jq empty "$temp"; then
    err "jq produced invalid JSON for $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! mode="$(config_mode "$config")"; then
    err "Could not read permissions for $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! chmod "$mode" "$temp"; then
    err "Could not preserve permissions for $config"
    remove_config_temp "$temp"
    return 1
  fi
  if [[ -L "$config" || ! -f "$config" ]]; then
    err "Refusing to replace symlinked config: $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! mv -f "$temp" "$config"; then
    err "Could not atomically replace $config"
    remove_config_temp "$temp"
    return 1
  fi
}

create_config() {
  local config="$1"
  local format="$2"
  local temp=""

  if [[ -L "$config" ]]; then
    err "Refusing to create over symlinked config: $config"
    return 1
  fi
  if [[ -e "$config" ]]; then
    err "Refusing to overwrite existing config: $config"
    return 1
  fi
  if ! mkdir -p "${config%/*}"; then
    err "Could not create config directory for $config"
    return 1
  fi
  if [[ -L "$config" || -e "$config" ]]; then
    err "Refusing to overwrite existing config: $config"
    return 1
  fi
  if ! temp="$(config_temp "$config")"; then
    err "Could not create a temporary config beside $config"
    return 1
  fi
  if ! cat > "$temp"; then
    err "Could not write temporary config for $config"
    remove_config_temp "$temp"
    return 1
  fi
  case "$format" in
    json)
      if ! jq empty "$temp"; then
        err "New config content is not valid JSON: $config"
        remove_config_temp "$temp"
        return 1
      fi
      ;;
    toml)
      if ! validate_toml "$temp"; then
        err "New config content is not valid TOML: $config"
        remove_config_temp "$temp"
        return 1
      fi
      ;;
    *)
      err "Unsupported config format for $config: $format"
      remove_config_temp "$temp"
      return 1
      ;;
  esac
  if [[ -L "$config" || -e "$config" ]]; then
    err "Refusing to overwrite existing config: $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! mv "$temp" "$config"; then
    err "Could not atomically create $config"
    remove_config_temp "$temp"
    return 1
  fi
}

setup_json_config() {
  local label="$1"
  local config="$2"
  local entry="$3"
  local filter="$4"

  if [[ -L "$config" ]]; then
    err "$label: refusing to replace symlinked config: $config"
    return 1
  fi
  if ! command -v jq &>/dev/null; then
    warn "$label: jq not found — leaving $config untouched"
    return 1
  fi
  if [[ -e "$config" ]]; then
    if ! merge_json_config "$config" "$entry" "$filter"; then
      return 1
    fi
    ok "$label: merged into $config"
    return 0
  fi
  if ! create_config "$config" json; then
    return 1
  fi
  ok "$label: created $config"
}

append_codex_section() {
  local config="$1"
  local entry="$2"
  local temp=""
  local mode=""

  CODEX_SECTION_APPENDED=false

  if [[ -L "$config" ]]; then
    err "Refusing to replace symlinked config: $config"
    return 1
  fi
  if [[ ! -f "$config" ]]; then
    err "Expected regular config file: $config"
    return 1
  fi
  if ! validate_toml "$config"; then
    err "Codex config is not valid TOML: $config"
    return 1
  fi
  if grep -Fqx '[mcp_servers.agentation]' "$config"; then
    warn "Codex CLI: agentation already in $config — skipping"
    return 0
  fi
  if ! temp="$(config_temp "$config")"; then
    err "Could not create a temporary config beside $config"
    return 1
  fi
  if ! cat "$config" > "$temp"; then
    err "Could not copy $config to its temporary replacement"
    remove_config_temp "$temp"
    return 1
  fi
  if ! printf '%s' "$entry" >> "$temp"; then
    err "Could not append agentation MCP settings to $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! validate_toml "$temp"; then
    err "Generated Codex config is not valid TOML: $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! mode="$(config_mode "$config")"; then
    err "Could not read permissions for $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! chmod "$mode" "$temp"; then
    err "Could not preserve permissions for $config"
    remove_config_temp "$temp"
    return 1
  fi
  if [[ -L "$config" || ! -f "$config" ]]; then
    err "Refusing to replace symlinked config: $config"
    remove_config_temp "$temp"
    return 1
  fi
  if ! mv -f "$temp" "$config"; then
    err "Could not atomically replace $config"
    remove_config_temp "$temp"
    return 1
  fi
  CODEX_SECTION_APPENDED=true

}

# ─── Argument parsing ────────────────────────────────────────────────────────
SETUP_CLAUDE=false
SETUP_CODEX=false
SETUP_GEMINI=false
SETUP_OPENCODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --claude)   SETUP_CLAUDE=true ;;
    --codex)    SETUP_CODEX=true ;;
    --gemini)   SETUP_GEMINI=true ;;
    --opencode) SETUP_OPENCODE=true ;;
    --all)      SETUP_CLAUDE=true; SETUP_CODEX=true; SETUP_GEMINI=true; SETUP_OPENCODE=true ;;
    *) warn "Unknown flag: $1" ;;
  esac
  shift
done

# Default: all platforms
if [[ "$SETUP_CLAUDE$SETUP_CODEX$SETUP_GEMINI$SETUP_OPENCODE" == "falsefalsefalsefalse" ]]; then
  SETUP_CLAUDE=true; SETUP_CODEX=true; SETUP_GEMINI=true; SETUP_OPENCODE=true
fi

echo "╔══════════════════════════════════════════╗"
echo "║  agentation MCP Setup                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── Claude Code (~/.claude/claude_desktop_config.json) ───────────────────
if [[ "$SETUP_CLAUDE" == "true" ]]; then
  info "Setting up Claude Code..."
  CLAUDE_CFG="$HOME/.claude/claude_desktop_config.json"
  MCP_JSON='{"command":"npx","args":["-y","agentation-mcp","server"]}'

  if setup_json_config "Claude Code" "$CLAUDE_CFG" "$MCP_JSON" '.mcpServers.agentation = $entry' <<'EOF'
{
  "mcpServers": {
    "agentation": {
      "command": "npx",
      "args": ["-y", "agentation-mcp", "server"]
    }
  }
}
EOF
  then
    :
  else
    mark_incomplete
  fi
  echo ""
fi

# ─── Codex CLI (~/.codex/config.toml) ─────────────────────────────────────
if [[ "$SETUP_CODEX" == "true" ]]; then
  info "Setting up Codex CLI..."
  CODEX_CFG="$HOME/.codex/config.toml"
  CODEX_ENTRY=$'\n# agentation MCP Server\n[mcp_servers.agentation]\ncommand = "npx"\nargs = ["-y", "agentation-mcp", "server"]\n'

  if [[ -L "$CODEX_CFG" ]]; then
    err "Codex CLI: refusing to replace symlinked config: $CODEX_CFG"
    mark_incomplete
  elif [[ -e "$CODEX_CFG" ]]; then
    if append_codex_section "$CODEX_CFG" "$CODEX_ENTRY"; then
      if [[ "$CODEX_SECTION_APPENDED" == "true" ]]; then
        ok "Codex CLI: appended to $CODEX_CFG"
      fi
    else
      mark_incomplete
    fi
  elif create_config "$CODEX_CFG" toml <<'EOF'

# agentation MCP Server
[mcp_servers.agentation]
command = "npx"
args = ["-y", "agentation-mcp", "server"]
EOF
  then
    ok "Codex CLI: created $CODEX_CFG"
  else
    mark_incomplete
  fi
  echo ""
fi

# ─── Gemini CLI (~/.gemini/settings.json) ─────────────────────────────────
if [[ "$SETUP_GEMINI" == "true" ]]; then
  info "Setting up Gemini CLI..."
  GEMINI_CFG="$HOME/.gemini/settings.json"
  MCP_JSON='{"command":"npx","args":["-y","agentation-mcp","server"]}'

  if setup_json_config "Gemini CLI" "$GEMINI_CFG" "$MCP_JSON" '.mcpServers.agentation = $entry' <<'EOF'
{
  "mcpServers": {
    "agentation": {
      "command": "npx",
      "args": ["-y", "agentation-mcp", "server"]
    }
  }
}
EOF
  then
    :
  else
    mark_incomplete
  fi
  echo ""
fi

# ─── OpenCode (~/.config/opencode/opencode.json) ──────────────────────────
if [[ "$SETUP_OPENCODE" == "true" ]]; then
  info "Setting up OpenCode..."
  OC_CFG="$HOME/.config/opencode/opencode.json"
  MCP_ENTRY='{"type":"local","command":["npx","-y","agentation-mcp","server"]}'

  if setup_json_config "OpenCode" "$OC_CFG" "$MCP_ENTRY" '.mcp.agentation = $entry' <<'EOF'
{
  "mcp": {
    "agentation": {
      "type": "local",
      "command": ["npx", "-y", "agentation-mcp", "server"]
    }
  }
}
EOF
  then
    :
  else
    mark_incomplete
  fi
  echo ""
fi

# ─── Done ─────────────────────────────────────────────────────────────────
if [[ "$SETUP_INCOMPLETE" == "true" ]]; then
  err "Setup incomplete — one or more requested configs were left unchanged"
  exit 1
fi

echo "╔══════════════════════════════════════════╗"
echo "║  Setup Complete                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Restart your agent(s)"
echo "  2. Start agentation MCP server:  npx agentation-mcp server"
echo "  3. Add to your app:              import { Agentation } from 'agentation'"
echo "     <Agentation endpoint=\"http://localhost:4747\" />"
echo ""
echo "Available MCP tools: agentation_watch_annotations, agentation_resolve, agentation_acknowledge, ..."
echo "Run 'npx agentation-mcp doctor' to verify."
