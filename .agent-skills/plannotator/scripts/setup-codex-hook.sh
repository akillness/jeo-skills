#!/bin/bash
# plannotator - Codex CLI Setup Script
# Configures plannotator for Codex CLI by:
#   1. Adding developer_instructions to Codex config.toml (--config-dir or CODEX_HOME)
#   2. Creating a plannotator prompt at prompts/plannotator.md inside the Codex config dir
#
# Usage: ./setup-codex-hook.sh [--dry-run] [--config-dir <dir>]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m'

DRY_RUN=false
CONFIG_DIR_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --config-dir)
      shift
      [ $# -gt 0 ] || { echo "Missing value for --config-dir" >&2; exit 1; }
      CONFIG_DIR_OVERRIDE="$1"
      ;;
    --config-dir=*) CONFIG_DIR_OVERRIDE="${1#*=}" ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--config-dir <dir>]"
      echo ""
      echo "Configures plannotator for Codex CLI:"
      echo "  1. Adds plannotator instructions to config.toml developer_instructions (default: CODEX_HOME or \$HOME/.codex)"
      echo "  2. Creates prompts/plannotator.md inside that Codex config dir"
      echo ""
      echo "Options:"
      echo "  --dry-run           Show what would change without writing"
      echo "  --config-dir <dir>  Override Codex config directory"
      echo "  -h, --help          Show this help"
      exit 0
      ;;
  esac
  shift
done

CODEX_SUBDIR=".codex"
CODEX_DIR="${CONFIG_DIR_OVERRIDE:-$HOME/${CODEX_SUBDIR}}"
CODEX_CONFIG="$CODEX_DIR/config.toml"
CODEX_PROMPTS="$CODEX_DIR/prompts"
PLANNOTATOR_PROMPT="$CODEX_PROMPTS/plannotator.md"

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
  [ ! -e "$path" ] || fail "Refusing to write over an already-present target: ${path}"
}

file_mode() {
  if [ "$(uname)" = "Darwin" ]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
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

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  plannotator × Codex CLI Setup             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

if ! command -v plannotator &>/dev/null; then
  echo -e "${RED}✗ plannotator CLI not found${NC}"
  echo -e "${YELLOW}  Run ./install.sh first${NC}"
  exit 1
fi
echo -e "${GREEN}✓ plannotator CLI is installed${NC}"
echo ""

if ! command -v codex &>/dev/null; then
  echo -e "${YELLOW}⚠ codex CLI not found in PATH${NC}"
  echo -e "${GRAY}  Install via: npm install -g @openai/codex${NC}"
  echo -e "${GRAY}  Continuing setup anyway...${NC}"
  echo ""
fi

[ -e "$CODEX_DIR" ] && [ ! -d "$CODEX_DIR" ] && fail "Refusing to use non-directory config parent: ${CODEX_DIR}"
[ -L "$CODEX_CONFIG" ] && fail "Refusing to modify symlinked config: ${CODEX_CONFIG}"
[ -e "$CODEX_CONFIG" ] && [ ! -f "$CODEX_CONFIG" ] && fail "Refusing to modify non-regular config: ${CODEX_CONFIG}"
[ -L "$PLANNOTATOR_PROMPT" ] && fail "Refusing to modify symlinked prompt file: ${PLANNOTATOR_PROMPT}"
[ -e "$PLANNOTATOR_PROMPT" ] && [ ! -f "$PLANNOTATOR_PROMPT" ] && fail "Refusing to modify non-regular prompt file: ${PLANNOTATOR_PROMPT}"
if [ "$DRY_RUN" = false ]; then
  mkdir -p "$CODEX_DIR" "$CODEX_PROMPTS"
fi

# ════════════════════════════════════════════════════════════
# PART 1: developer_instructions in config.toml
# ════════════════════════════════════════════════════════════
echo -e "${BLUE}━━ Step 1: config.toml developer_instructions ━━━━${NC}"
echo ""

PLANNOTATOR_INSTRUCTION='Before implementing any plan, write the plan markdown to /tmp/plan.md and run: `python3 -c "import json; print(json.dumps({\"tool_input\": {\"plan\": open(\"/tmp/plan.md\").read(), \"permission_mode\": \"acceptEdits\"}}))" | plannotator > /tmp/pn_out.txt 2>&1 & sleep 5; cat /tmp/pn_out.txt`. Wait for user approval in plannotator UI. After coding, run `plannotator review` to open code review.'

if [ -f "$CODEX_CONFIG" ] && grep -q "plannotator" "$CODEX_CONFIG" 2>/dev/null; then
  echo -e "${YELLOW}⚠ plannotator already referenced in ${CODEX_CONFIG}${NC}"
  echo -e "${GRAY}  No changes made to config.toml.${NC}"
else
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN] Would add to developer_instructions in ${CODEX_CONFIG}:${NC}"
    echo "  $PLANNOTATOR_INSTRUCTION"
  else
    if [ ! -f "$CODEX_CONFIG" ]; then
      TEMP_FILE="$(mktemp "${CODEX_DIR}/.config.toml.XXXXXX")" || fail "Unable to create temporary config file"
      if ! printf 'developer_instructions = "%s"\n' "$PLANNOTATOR_INSTRUCTION" > "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Unable to write temporary config file"
      fi
      replace_temp "$TEMP_FILE" "$CODEX_CONFIG" absent
      echo -e "${GREEN}✓ Created ${CODEX_CONFIG} with plannotator instructions${NC}"
    else
      require_regular_file "$CODEX_CONFIG"
      ORIGINAL_MODE="$(file_mode "$CODEX_CONFIG")" || fail "Unable to determine permissions for ${CODEX_CONFIG}"
      TEMP_FILE="$(mktemp "${CODEX_DIR}/.config.toml.XXXXXX")" || fail "Unable to create temporary config file"
      if ! cp -p "$CODEX_CONFIG" "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Unable to stage ${CODEX_CONFIG}"
      fi
      if grep -q "^developer_instructions" "$TEMP_FILE"; then
        if command -v python3 &>/dev/null; then
          if ! python3 - "$TEMP_FILE" "$PLANNOTATOR_INSTRUCTION" <<'PYEOF'
import sys, re

path = sys.argv[1]
addition = sys.argv[2]

with open(path, encoding="utf-8") as f:
    content = f.read()

pattern = r'^(developer_instructions\s*=\s*")(.+?)(")'
match = re.search(pattern, content, re.MULTILINE)

if match:
    current = match.group(2)
    if "plannotator" not in current:
        new_val = current + " " + addition
        content = content[:match.start()] + f'developer_instructions = "{new_val}"' + content[match.end():]
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Appended to developer_instructions.")
    else:
        print("plannotator already in developer_instructions — no change.")
else:
    with open(path, "a", encoding="utf-8") as f:
        f.write(f'\ndeveloper_instructions = "{addition}"\n')
    print("Added developer_instructions line.")
PYEOF
          then
            cleanup_owned_temp "$TEMP_FILE"
            fail "Unable to update developer_instructions in ${CODEX_CONFIG}"
          fi
        else
          printf '\ndeveloper_instructions = "%s"\n' "$PLANNOTATOR_INSTRUCTION" >> "$TEMP_FILE"
        fi
      else
        printf '\ndeveloper_instructions = "%s"\n' "$PLANNOTATOR_INSTRUCTION" >> "$TEMP_FILE"
      fi
      if ! chmod "$ORIGINAL_MODE" "$TEMP_FILE"; then
        cleanup_owned_temp "$TEMP_FILE"
        fail "Unable to preserve permissions on ${CODEX_CONFIG}"
      fi
      BACKUP="$(create_backup "$CODEX_CONFIG" "$CODEX_DIR" ".config.toml.bak")"
      echo -e "${GRAY}  Backup saved: ${BACKUP}${NC}"
      replace_temp "$TEMP_FILE" "$CODEX_CONFIG" existing
      echo -e "${GREEN}✓ Updated developer_instructions in ${CODEX_CONFIG}${NC}"
    fi
  fi
fi
echo ""

# ════════════════════════════════════════════════════════════
# PART 2: plannotator prompt file
# ════════════════════════════════════════════════════════════
echo -e "${BLUE}━━ Step 2: plannotator prompt file ━━━━━━━━━━━━━━━${NC}"
echo ""

PROMPT_CONTENT='# plannotator — Plan Review Agent

Use this prompt to do a plan review session with plannotator before implementation.

## How to Use

```bash
# In Codex, invoke with:
/prompts:plannotator "Review my plan for [feature]"
```

## Workflow

1. Create your implementation plan in markdown format
2. Pipe it to plannotator for human review:
   ```bash
   cat > /tmp/plan.md << '"'"'PLAN
   # Implementation Plan: [Feature Name]

   ## Steps
   1. ...
   2. ...
   PLAN

   python3 -c "import json; print(json.dumps({\"tool_input\": {\"plan\": open(\"/tmp/plan.md\").read(), \"permission_mode\": \"acceptEdits\"}}))" | plannotator > /tmp/plannotator_feedback.txt 2>&1 &
   ```
3. User reviews and annotates in browser UI
4. If approved → proceed with implementation
5. If changes requested → revise plan and resubmit

## After Coding

```bash
# Review all uncommitted changes
plannotator review

# Review a specific commit
plannotator review HEAD~1

# Review branch diff
plannotator review main...HEAD
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PLANNOTATOR_REMOTE` | Set to `1` for remote/SSH mode |
| `PLANNOTATOR_PORT` | Fixed port (default: random) |
| `PLANNOTATOR_BROWSER` | Custom browser path |

## Obsidian Integration

Approved plans auto-save to Obsidian when enabled in plannotator UI settings.
Install Obsidian: https://obsidian.md/download
'

if [ -f "$PLANNOTATOR_PROMPT" ]; then
  echo -e "${YELLOW}⚠ ${PLANNOTATOR_PROMPT} already exists${NC}"
  echo -e "${GRAY}  Skipping (delete file to recreate).${NC}"
elif [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would create ${PLANNOTATOR_PROMPT}${NC}"
else
  TEMP_PROMPT="$(mktemp "${CODEX_PROMPTS}/.plannotator.md.XXXXXX")" || fail "Unable to create temporary prompt file"
  if ! printf '%s\n' "$PROMPT_CONTENT" > "$TEMP_PROMPT"; then
    cleanup_owned_temp "$TEMP_PROMPT"
    fail "Unable to write temporary prompt file"
  fi
  replace_temp "$TEMP_PROMPT" "$PLANNOTATOR_PROMPT" absent
  echo -e "${GREEN}✓ Created ${PLANNOTATOR_PROMPT}${NC}"
fi
echo ""

echo -e "${GREEN}Codex CLI setup complete!${NC}"
echo ""
echo -e "${BLUE}How to use plannotator in Codex:${NC}"
echo ""
echo -e "  ${BLUE}Plan review:${NC}"
echo -e "    ${GREEN}cat > /tmp/plan.md << 'PLAN'${NC}"
echo -e "    ${GREEN}# ...your markdown...${NC}"
echo -e "    ${GREEN}PLAN${NC}"
echo -e "    ${GREEN}python3 -c \"import json; print(json.dumps({\\\"tool_input\\\": {\\\"plan\\\": open(\\\"/tmp/plan.md\\\").read(), \\\"permission_mode\\\": \\\"acceptEdits\\\"}}))\" | plannotator > /tmp/plannotator_feedback.txt 2>&1 &${NC}"
echo ""
echo -e "  ${BLUE}Code review after coding:${NC}"
echo -e "    ${GREEN}plannotator review${NC}"
echo ""
echo -e "  ${BLUE}Use plannotator agent prompt:${NC}"
echo -e "    ${GREEN}/prompts:plannotator${NC}  (inside Codex interactive session)"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  ${BLUE}1.${NC} Run ${GREEN}./check-status.sh${NC} to verify configuration"
echo -e "  ${BLUE}2.${NC} Start a Codex session and use plannotator review"
echo ""
