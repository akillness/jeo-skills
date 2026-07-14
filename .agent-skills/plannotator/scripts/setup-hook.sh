#!/bin/bash
# plannotator - Claude Code Hook Setup Script
# Adds the ExitPlanMode hook to ~/.claude/settings.json.
#
# Usage: ./setup-hook.sh [--dry-run]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m'

DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]"
      echo ""
      echo "Adds the plannotator hook to ~/.claude/settings.json"
      exit 0
      ;;
  esac
done

SETTINGS_DIR="$HOME/.claude"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"

fail() {
  echo -e "${RED}✗ $1${NC}" >&2
  exit 1
}

cleanup_owned_temp() {
  local temp="${1:-}"
  if [ -n "$temp" ] && [ ! -L "$temp" ] && [ -f "$temp" ]; then
    rm -f "$temp" || true
  fi
}

require_regular_file() {
  local path="$1"
  [ -L "$path" ] && fail "Refusing to modify symlinked config: ${path}"
  [ -f "$path" ] || fail "Refusing to modify missing or non-regular config: ${path}"
}

require_absent_file() {
  local path="$1"
  [ -L "$path" ] && fail "Refusing to create symlinked config: ${path}"
  [ ! -e "$path" ] || fail "Refusing to replace existing config: ${path}"
}

prepare_parent() {
  local dir="$1"
  if [ -e "$dir" ]; then
    [ -d "$dir" ] || fail "Refusing to use non-directory config parent: ${dir}"
  else
    mkdir -p "$dir" || fail "Unable to create config directory: ${dir}"
    [ -d "$dir" ] || fail "Refusing to use unsafe config directory: ${dir}"
  fi
}

file_mode() {
  if [ "$(uname)" = "Darwin" ]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

validate_json() {
  command -v python3 >/dev/null 2>&1 || fail "python3 not found — cannot validate JSON safely"
  python3 - "$1" <<'PYEOF'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    value = json.load(f)
if not isinstance(value, dict):
    raise ValueError("settings.json root must be an object")
PYEOF
}
replace_temp() {
  local temp="$1" destination="$2" expected="$3"
  if [ -L "$temp" ] || [ ! -f "$temp" ]; then
    fail "Temporary config file became unsafe: ${temp}"
  fi
  if [ "$expected" = existing ]; then
    require_regular_file "$destination"
  else
    require_absent_file "$destination"
  fi
  mv -f "$temp" "$destination" || fail "Unable to install ${destination}"
}

create_backup() {
  local source="$1" parent="$2" backup
  backup="$(mktemp "${parent}/.settings.json.bak.XXXXXX")" || fail "Unable to create settings backup"
  # Verify both paths immediately before copying; mktemp ownership alone is not enough.
  if [ -L "$backup" ] || [ ! -f "$backup" ]; then
    cleanup_owned_temp "$backup"
    fail "Refusing to use unsafe settings backup: ${backup}"
  fi
  require_regular_file "$source"
  if ! cp -p "$source" "$backup"; then
    cleanup_owned_temp "$backup"
    fail "Unable to back up ${source}"
  fi
  printf '%s\n' "$backup"
}

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    plannotator Hook Setup                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
command -v plannotator >/dev/null 2>&1 || fail "plannotator CLI not found; run ./install.sh first"

# Require the configuration parent to resolve to a directory.
[ -e "$SETTINGS_DIR" ] && [ ! -d "$SETTINGS_DIR" ] && fail "Refusing to use non-directory config parent: ${SETTINGS_DIR}"

# Reject both real and dangling symlinks before every read or mutation.
[ -L "$SETTINGS_FILE" ] && fail "Refusing to modify symlinked config: ${SETTINGS_FILE}"
[ -e "$SETTINGS_FILE" ] && [ ! -f "$SETTINGS_FILE" ] && fail "Refusing to modify non-regular config: ${SETTINGS_FILE}"

HOOK_JSON='{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "plannotator",
            "timeout": 1800
          }
        ]
      }
    ]
  }
}'

CONFIGURED=false
if [ -f "$SETTINGS_FILE" ]; then
  require_regular_file "$SETTINGS_FILE"
  if python3 - "$SETTINGS_FILE" <<'PYEOF'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    settings = json.load(f)
if not isinstance(settings, dict):
    raise ValueError("settings.json root must be an object")
hooks = settings.get("hooks", {})
if not isinstance(hooks, dict):
    raise ValueError("settings.json hooks must be an object")
requests = hooks.get("PermissionRequest", [])
if not isinstance(requests, list):
    raise ValueError("settings.json hooks.PermissionRequest must be an array")
configured = any(
    isinstance(hook, dict)
    and hook.get("matcher") == "ExitPlanMode"
    and isinstance(hook.get("hooks"), list)
    and any(isinstance(command, dict) and command.get("command") == "plannotator" for command in hook["hooks"])
    for hook in requests
)
sys.exit(0 if configured else 3)
PYEOF
  then
    CONFIGURED=true
  else
    status=$?
    [ "$status" -eq 3 ] || fail "Existing JSON configuration is invalid"
  fi
fi

echo -e "${BLUE}Hook to be added:${NC}"
echo "$HOOK_JSON"
echo ""

if [ "$CONFIGURED" = true ]; then
  echo -e "${YELLOW}⚠ plannotator hook already exists in ${SETTINGS_FILE}${NC}"
  echo -e "${GRAY}No changes made. Remove manually if you want to reconfigure.${NC}"
  exit 0
fi

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] No changes written.${NC}"
  echo -e "Target file: ${SETTINGS_FILE}"
  exit 0
fi

prepare_parent "$SETTINGS_DIR"
[ -L "$SETTINGS_FILE" ] && fail "Refusing to modify symlinked config: ${SETTINGS_FILE}"
[ -e "$SETTINGS_FILE" ] && [ ! -f "$SETTINGS_FILE" ] && fail "Refusing to modify non-regular config: ${SETTINGS_FILE}"

if [ -f "$SETTINGS_FILE" ]; then
  require_regular_file "$SETTINGS_FILE"
  ORIGINAL_MODE="$(file_mode "$SETTINGS_FILE")" || fail "Unable to determine permissions for ${SETTINGS_FILE}"
  TEMP_FILE="$(mktemp "${SETTINGS_DIR}/.settings.json.XXXXXX")" || fail "Unable to create temporary config file"
  if ! python3 - "$SETTINGS_FILE" "$TEMP_FILE" <<'PYEOF'
import json
import sys

path, output_path = sys.argv[1:]
with open(path, encoding="utf-8") as f:
    settings = json.load(f)
if not isinstance(settings, dict):
    raise ValueError("settings.json root must be an object")
hooks = settings.setdefault("hooks", {})
if not isinstance(hooks, dict):
    raise ValueError("settings.json hooks must be an object")
requests = hooks.setdefault("PermissionRequest", [])
if not isinstance(requests, list):
    raise ValueError("settings.json hooks.PermissionRequest must be an array")
requests.append({
    "matcher": "ExitPlanMode",
    "hooks": [{"type": "command", "command": "plannotator", "timeout": 1800}],
})
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
PYEOF
  then
    cleanup_owned_temp "$TEMP_FILE"
    fail "Unable to merge JSON configuration"
  fi
  if ! validate_json "$TEMP_FILE" || ! chmod "$ORIGINAL_MODE" "$TEMP_FILE"; then
    cleanup_owned_temp "$TEMP_FILE"
    fail "Generated JSON configuration failed validation or permission preservation"
  fi
  BACKUP="$(create_backup "$SETTINGS_FILE" "$SETTINGS_DIR")"
  if ! replace_temp "$TEMP_FILE" "$SETTINGS_FILE" existing; then
    cleanup_owned_temp "$TEMP_FILE"
    exit 1
  fi
  echo -e "${GRAY}  Backup saved: ${BACKUP}${NC}"
else
  TEMP_FILE="$(mktemp "${SETTINGS_DIR}/.settings.json.XXXXXX")" || fail "Unable to create temporary config file"
  if ! printf '%s\n' "$HOOK_JSON" > "$TEMP_FILE" || ! validate_json "$TEMP_FILE"; then
    cleanup_owned_temp "$TEMP_FILE"
    fail "Generated JSON configuration is invalid"
  fi
  if ! replace_temp "$TEMP_FILE" "$SETTINGS_FILE" absent; then
    cleanup_owned_temp "$TEMP_FILE"
    exit 1
  fi
fi

echo -e "${GREEN}✓ Hook configured in ${SETTINGS_FILE}${NC}"
echo ""
echo -e "${GREEN}Hook setup complete!${NC}"
