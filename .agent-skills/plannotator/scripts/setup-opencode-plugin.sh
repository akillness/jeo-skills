#!/bin/bash
# plannotator - OpenCode Plugin Registration Script
# Registers @plannotator/opencode@latest and installs slash-command definitions.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m'

DRY_RUN=false
PROJECT_DIR="${PWD}"
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --project-dir=*) PROJECT_DIR="${arg#*=}" ;;
    --project-dir) PROJECT_DIR="" ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--project-dir DIR]"
      exit 0
      ;;
  esac
done

OPENCODE_DIR="$PROJECT_DIR"
OPENCODE_JSON="$OPENCODE_DIR/opencode.json"
OPENCODE_COMMAND_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/command"
PLUGIN_NAME="@plannotator/opencode@latest"

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

prepare_parent() {
  local dir="$1"
  if [ -e "$dir" ]; then
    [ -d "$dir" ] || fail "Refusing to use non-directory config parent: ${dir}"
  else
    mkdir -p "$dir" || fail "Unable to create config directory: ${dir}"
    [ -d "$dir" ] || fail "Refusing to use unsafe config directory: ${dir}"
  fi
}


require_existing_parent() {
  local dir="$1"
  [ -d "$dir" ] || fail "Project directory does not exist: ${dir}"
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
    raise ValueError("opencode.json root must be an object")
PYEOF
}

validate_command_markdown() {
  local path="$1" description="$2" command="$3"
  command -v python3 >/dev/null 2>&1 || fail "python3 not found — cannot validate command text safely"
  python3 - "$path" "$description" "$command" <<'PYEOF'
import sys

path, description, command = sys.argv[1:]
with open(path, encoding="utf-8") as f:
    text = f.read()
if not text.startswith("---\n") or f"description: {description}" not in text or command not in text:
    raise ValueError("command Markdown missing required validated content")
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
  backup="$(mktemp "${parent}/.opencode.json.bak.XXXXXX")" || fail "Unable to create config backup"
  if [ -L "$backup" ] || [ ! -f "$backup" ]; then
    cleanup_owned_temp "$backup"
    fail "Refusing to use unsafe config backup: ${backup}"
  fi
  require_regular_file "$source"
  if ! cp -p "$source" "$backup"; then
    cleanup_owned_temp "$backup"
    fail "Unable to back up ${source}"
  fi
  printf '%s\n' "$backup"
}

write_command_if_absent() {
  local destination="$1" content="$2" description="$3" command="$4" parent="$5"
  [ -L "$destination" ] && fail "Refusing to create symlinked command file: ${destination}"
  [ -e "$destination" ] && [ ! -f "$destination" ] && fail "Refusing to modify non-regular command file: ${destination}"
  if [ -f "$destination" ]; then
    return 1
  fi
  TEMP_FILE="$(mktemp "${parent}/.plannotator-command.XXXXXX")" || fail "Unable to create temporary command file"
  if ! printf '%s\n' "$content" > "$TEMP_FILE" || ! validate_command_markdown "$TEMP_FILE" "$description" "$command"; then
    cleanup_owned_temp "$TEMP_FILE"
    fail "Generated command Markdown is invalid"
  fi
  replace_temp "$TEMP_FILE" "$destination" absent
  return 0
}

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  plannotator × OpenCode Plugin Setup       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
command -v plannotator >/dev/null 2>&1 || fail "plannotator CLI not found; run ./install.sh first"

REVIEW_CMD="${OPENCODE_COMMAND_DIR}/plannotator-review.md"
ANNOTATE_CMD="${OPENCODE_COMMAND_DIR}/plannotator-annotate.md"
REVIEW_CMD_CONTENT='---
description: Open interactive code review for current changes
---

Open the plannotator code review UI for current git diff.

!`plannotator review`

Address the code review feedback above.'
ANNOTATE_CMD_CONTENT='---
description: Open interactive annotation UI for a markdown file
---

Open the plannotator annotation UI for a markdown file.

!`plannotator annotate "$ARGUMENTS"`

Address the annotation feedback above.'

[ -d "$OPENCODE_DIR" ] || fail "Project directory does not exist: ${OPENCODE_DIR}"
[ -e "$OPENCODE_COMMAND_DIR" ] && [ ! -d "$OPENCODE_COMMAND_DIR" ] && fail "Refusing to use non-directory config parent: ${OPENCODE_COMMAND_DIR}"

[ -L "$OPENCODE_JSON" ] && fail "Refusing to modify symlinked config: ${OPENCODE_JSON}"
[ -e "$OPENCODE_JSON" ] && [ ! -f "$OPENCODE_JSON" ] && fail "Refusing to modify non-regular config: ${OPENCODE_JSON}"
[ -L "$REVIEW_CMD" ] && fail "Refusing to modify symlinked command file: ${REVIEW_CMD}"
[ -e "$REVIEW_CMD" ] && [ ! -f "$REVIEW_CMD" ] && fail "Refusing to modify non-regular command file: ${REVIEW_CMD}"
[ -L "$ANNOTATE_CMD" ] && fail "Refusing to modify symlinked command file: ${ANNOTATE_CMD}"
[ -e "$ANNOTATE_CMD" ] && [ ! -f "$ANNOTATE_CMD" ] && fail "Refusing to modify non-regular command file: ${ANNOTATE_CMD}"

PLUGIN_CONFIGURED=false
if [ -f "$OPENCODE_JSON" ]; then
  require_regular_file "$OPENCODE_JSON"
  if python3 - "$OPENCODE_JSON" <<'PYEOF'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    config = json.load(f)
if not isinstance(config, dict):
    raise ValueError("opencode.json root must be an object")
plugins = config.get("plugin", [])
if not isinstance(plugins, list):
    raise ValueError("opencode.json plugin must be an array")
sys.exit(0 if any(isinstance(item, str) and "plannotator" in item for item in plugins) else 3)
PYEOF
  then
    PLUGIN_CONFIGURED=true
  else
    status=$?
    [ "$status" -eq 3 ] || fail "Existing JSON configuration is invalid"
  fi
fi

PLUGIN_CHANGED=false
REVIEW_CHANGED=false
ANNOTATE_CHANGED=false
BACKUP=""

if [ "$DRY_RUN" = false ]; then
  require_existing_parent "$OPENCODE_DIR"
  prepare_parent "$OPENCODE_COMMAND_DIR"
  if [ "$PLUGIN_CONFIGURED" = false ]; then
    if [ -f "$OPENCODE_JSON" ]; then
      require_regular_file "$OPENCODE_JSON"
      ORIGINAL_MODE="$(file_mode "$OPENCODE_JSON")" || fail "Unable to determine permissions for ${OPENCODE_JSON}"
      TEMP_FILE="$(mktemp "${OPENCODE_DIR}/.opencode.json.XXXXXX")" || fail "Unable to create temporary config file"
      if ! python3 - "$OPENCODE_JSON" "$TEMP_FILE" "$PLUGIN_NAME" <<'PYEOF'
import json
import sys

path, output_path, plugin = sys.argv[1:]
with open(path, encoding="utf-8") as f:
    config = json.load(f)
if not isinstance(config, dict):
    raise ValueError("opencode.json root must be an object")
plugins = config.setdefault("plugin", [])
if not isinstance(plugins, list):
    raise ValueError("opencode.json plugin must be an array")
plugins.append(plugin)
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(config, f, indent=2)
    f.write("\n")
PYEOF
      then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Unable to update JSON configuration"
      fi
      if ! validate_json "$TEMP_FILE" || ! chmod "$ORIGINAL_MODE" "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Generated JSON configuration failed validation or permission preservation"
      fi
      BACKUP="$(create_backup "$OPENCODE_JSON" "$OPENCODE_DIR")"
      replace_temp "$TEMP_FILE" "$OPENCODE_JSON" existing
    else
      TEMP_FILE="$(mktemp "${OPENCODE_DIR}/.opencode.json.XXXXXX")" || fail "Unable to create temporary config file"
      if ! printf '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugin": ["%s"]\n}\n' "$PLUGIN_NAME" > "$TEMP_FILE" || ! validate_json "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Generated JSON configuration is invalid"
      fi
      replace_temp "$TEMP_FILE" "$OPENCODE_JSON" absent
    fi
    PLUGIN_CHANGED=true
  fi
  if write_command_if_absent "$REVIEW_CMD" "$REVIEW_CMD_CONTENT" "Open interactive code review for current changes" 'plannotator review' "$OPENCODE_COMMAND_DIR"; then
    REVIEW_CHANGED=true
  fi
  if write_command_if_absent "$ANNOTATE_CMD" "$ANNOTATE_CMD_CONTENT" "Open interactive annotation UI for a markdown file" 'plannotator annotate "$ARGUMENTS"' "$OPENCODE_COMMAND_DIR"; then
    ANNOTATE_CHANGED=true
  fi
fi

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] No changes written.${NC}"
else
  [ -n "$BACKUP" ] && echo -e "${GRAY}  Backup saved: ${BACKUP}${NC}"
  [ "$PLUGIN_CHANGED" = true ] && echo -e "${GREEN}✓ Plugin configured in ${OPENCODE_JSON}${NC}"
  [ "$PLUGIN_CONFIGURED" = true ] && echo -e "${YELLOW}⚠ plannotator already in ${OPENCODE_JSON}${NC}"
  [ "$REVIEW_CHANGED" = true ] && echo -e "${GREEN}✓ Created /plannotator-review command${NC}"
  [ "$REVIEW_CHANGED" = false ] && echo -e "${GRAY}  /plannotator-review already exists — skipped${NC}"
  [ "$ANNOTATE_CHANGED" = true ] && echo -e "${GREEN}✓ Created /plannotator-annotate command${NC}"
  [ "$ANNOTATE_CHANGED" = false ] && echo -e "${GRAY}  /plannotator-annotate already exists — skipped${NC}"
  echo ""
  echo -e "${GREEN}OpenCode plugin setup complete!${NC}"
fi
