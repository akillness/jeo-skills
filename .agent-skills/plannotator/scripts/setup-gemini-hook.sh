#!/bin/bash
# plannotator - Gemini CLI Hook Setup Script
# Adds the ExitPlanMode hook to ~/.gemini/settings.json and instructions to GEMINI.md.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m'

DRY_RUN=false
MD_ONLY=false
HOOK_ONLY=false
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --md-only) MD_ONLY=true ;;
    --hook-only) HOOK_ONLY=true ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--md-only] [--hook-only]"
      exit 0
      ;;
  esac
done

GEMINI_DIR="$HOME/.gemini"
SETTINGS_FILE="$GEMINI_DIR/settings.json"
GEMINI_MD="$GEMINI_DIR/GEMINI.md"

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
    raise ValueError("settings.json root must be an object")
PYEOF
}

validate_gemini_markdown() {
  command -v python3 >/dev/null 2>&1 || fail "python3 not found — cannot validate instructions safely"
  python3 - "$1" <<'PYEOF'
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    text = f.read()
if "## plannotator — Plan Review" not in text or "plannotator review" not in text:
    raise ValueError("GEMINI.md missing required plannotator instructions")
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
  local source="$1" parent="$2" template="$3" backup
  backup="$(mktemp "${parent}/${template}.XXXXXX")" || fail "Unable to create configuration backup"
  if [ -L "$backup" ] || [ ! -f "$backup" ]; then
    cleanup_owned_temp "$backup"
    fail "Refusing to use unsafe configuration backup: ${backup}"
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
echo -e "${BLUE}║  plannotator × Gemini CLI Setup            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
command -v plannotator >/dev/null 2>&1 || fail "plannotator CLI not found; run ./install.sh first"

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

PLANNOTATOR_MD_BLOCK='
## plannotator — Plan Review

When you have a complete implementation plan, **always submit it for human review** before proceeding:

```bash
# Save markdown plan to file, then send validated JSON payload:
cat > /tmp/plan.md << '\''PLAN'\''
# Your plan markdown...
PLAN

python3 -c "
import json
print(json.dumps({'\''tool_input'\'': {'\''plan'\'': open('\''/tmp/plan.md'\'').read(), '\''permission_mode'\'': '\''acceptEdits'\''}}))
" | plannotator > /tmp/plannotator_feedback.txt 2>&1 &
```

**Workflow:**
1. Create your implementation plan in markdown
2. Run the python3 JSON command above (manual mode) OR let ExitPlanMode hook trigger automatically
3. Wait for user approval in the browser UI
4. If approved → proceed with implementation
5. If changes requested → revise and resubmit

**Code review after implementation:**
```bash
plannotator review          # Review all uncommitted changes
plannotator review HEAD~1   # Review specific commit
```

**Plan mode:** Run `gemini --approval-mode plan` to work in read-only planning mode.
plannotator hooks automatically trigger when you exit plan mode.
'

if [ "$DRY_RUN" = false ]; then
  prepare_parent "$GEMINI_DIR"
fi

SETTINGS_BACKUP=""
MD_BACKUP=""
SETTINGS_CHANGED=false
MD_CHANGED=false

[ -e "$GEMINI_DIR" ] && [ ! -d "$GEMINI_DIR" ] && fail "Refusing to use non-directory config parent: ${GEMINI_DIR}"

if [ "$MD_ONLY" = false ]; then
  [ -L "$SETTINGS_FILE" ] && fail "Refusing to modify symlinked config: ${SETTINGS_FILE}"
  [ -e "$SETTINGS_FILE" ] && [ ! -f "$SETTINGS_FILE" ] && fail "Refusing to modify non-regular config: ${SETTINGS_FILE}"
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
    isinstance(hook, dict) and hook.get("matcher") == "ExitPlanMode"
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
  if [ "$CONFIGURED" = false ] && [ "$DRY_RUN" = false ]; then
    if [ -f "$SETTINGS_FILE" ]; then
      require_regular_file "$SETTINGS_FILE"
      ORIGINAL_MODE="$(file_mode "$SETTINGS_FILE")" || fail "Unable to determine permissions for ${SETTINGS_FILE}"
      TEMP_FILE="$(mktemp "${GEMINI_DIR}/.settings.json.XXXXXX")" || fail "Unable to create temporary config file"
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
requests.append({"matcher": "ExitPlanMode", "hooks": [{"type": "command", "command": "plannotator", "timeout": 1800}]})
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
      SETTINGS_BACKUP="$(create_backup "$SETTINGS_FILE" "$GEMINI_DIR" ".settings.json.bak")"
      replace_temp "$TEMP_FILE" "$SETTINGS_FILE" existing
    else
      TEMP_FILE="$(mktemp "${GEMINI_DIR}/.settings.json.XXXXXX")" || fail "Unable to create temporary config file"
      if ! printf '%s\n' "$HOOK_JSON" > "$TEMP_FILE" || ! validate_json "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Generated JSON configuration is invalid"
      fi
      replace_temp "$TEMP_FILE" "$SETTINGS_FILE" absent
    fi
    SETTINGS_CHANGED=true
  fi
fi

if [ "$HOOK_ONLY" = false ]; then
  [ -L "$GEMINI_MD" ] && fail "Refusing to modify symlinked instruction file: ${GEMINI_MD}"
  [ -e "$GEMINI_MD" ] && [ ! -f "$GEMINI_MD" ] && fail "Refusing to modify non-regular instruction file: ${GEMINI_MD}"
  MD_CONFIGURED=false
  if [ -f "$GEMINI_MD" ]; then
    require_regular_file "$GEMINI_MD"
    if grep -q "plannotator" "$GEMINI_MD"; then
      MD_CONFIGURED=true
    fi
  fi
  if [ "$MD_CONFIGURED" = false ] && [ "$DRY_RUN" = false ]; then
    if [ -f "$GEMINI_MD" ]; then
      require_regular_file "$GEMINI_MD"
      ORIGINAL_MODE="$(file_mode "$GEMINI_MD")" || fail "Unable to determine permissions for ${GEMINI_MD}"
      TEMP_FILE="$(mktemp "${GEMINI_DIR}/.GEMINI.md.XXXXXX")" || fail "Unable to create temporary instruction file"
      if ! { cat "$GEMINI_MD"; printf '\n%s\n' "$PLANNOTATOR_MD_BLOCK"; } > "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Unable to generate updated instruction file"
      fi
      if ! validate_gemini_markdown "$TEMP_FILE" || ! chmod "$ORIGINAL_MODE" "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Generated instruction file failed validation or permission preservation"
      fi
      MD_BACKUP="$(create_backup "$GEMINI_MD" "$GEMINI_DIR" ".GEMINI.md.bak")"
      replace_temp "$TEMP_FILE" "$GEMINI_MD" existing
    else
      TEMP_FILE="$(mktemp "${GEMINI_DIR}/.GEMINI.md.XXXXXX")" || fail "Unable to create temporary instruction file"
      if ! { printf '%s\n' '# Gemini CLI Agent Configuration'; printf '\n%s\n' "$PLANNOTATOR_MD_BLOCK"; } > "$TEMP_FILE" || ! validate_gemini_markdown "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Generated instruction file is invalid"
      fi
      replace_temp "$TEMP_FILE" "$GEMINI_MD" absent
    fi
    MD_CHANGED=true
  fi
fi

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] No changes written.${NC}"
else
  [ -n "$SETTINGS_BACKUP" ] && echo -e "${GRAY}  Settings backup saved: ${SETTINGS_BACKUP}${NC}"
  [ -n "$MD_BACKUP" ] && echo -e "${GRAY}  Instructions backup saved: ${MD_BACKUP}${NC}"
  [ "$SETTINGS_CHANGED" = true ] && echo -e "${GREEN}✓ Hook configured in ${SETTINGS_FILE}${NC}"
  [ "$MD_CHANGED" = true ] && echo -e "${GREEN}✓ Instructions configured in ${GEMINI_MD}${NC}"
  [ "$MD_ONLY" = false ] && [ "$SETTINGS_CHANGED" = false ] && echo -e "${YELLOW}⚠ plannotator hook already exists in ${SETTINGS_FILE}${NC}"
  [ "$HOOK_ONLY" = false ] && [ "$MD_CHANGED" = false ] && echo -e "${YELLOW}⚠ plannotator instructions already exist in ${GEMINI_MD}${NC}"
  echo ""
  echo -e "${GREEN}Gemini CLI setup complete!${NC}"
fi
