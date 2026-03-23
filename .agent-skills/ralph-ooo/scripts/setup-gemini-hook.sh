#!/usr/bin/env bash
# ralph-ooo (Ouroboros) - Gemini CLI AfterAgent hook setup
#
# Configures Gemini CLI to run the ralph-ooo loop continuation hook after each agent turn.
#
# What it does:
#   1) Creates ~/.gemini/hooks/ralph-ooo-check.sh (AfterAgent hook script)
#   2) Patches ~/.gemini/settings.json with the AfterAgent hook entry
#   3) Creates ~/.gemini/extensions/ralph-ooo/ context directory
#
# ⚠️  Gemini v0.30.0 bug: stop_hook_active is always false in hook JSON.
#     This script uses direct state file reading as workaround.
#
# Usage:
#   bash setup-gemini-hook.sh [--dry-run] [--help]

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m'

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]"
      echo ""
      echo "Configures Gemini CLI for ralph-ooo loop continuation:"
      echo "  1. Creates ~/.gemini/hooks/ralph-ooo-check.sh (AfterAgent hook)"
      echo "  2. Patches ~/.gemini/settings.json (adds AfterAgent hook entry)"
      echo "  3. Creates ~/.gemini/extensions/ralph-ooo/ (context directory)"
      echo ""
      echo "After setup, run Gemini with:"
      echo "  gemini -s -y   # sandbox + YOLO mode (no confirmation prompts)"
      echo ""
      echo "NOTE: Gemini v0.30.0 bug — stop_hook_active always false."
      echo "      This script reads .omc/state/ralph-ooo-state.json directly."
      echo ""
      echo "Options:"
      echo "  --dry-run   Show what would change without writing"
      echo "  -h, --help  Show this help"
      exit 0
      ;;
    *) ;;
  esac
done

GEMINI_DIR="$HOME/.gemini"
GEMINI_SETTINGS="$GEMINI_DIR/settings.json"
GEMINI_HOOKS="$GEMINI_DIR/hooks"
GEMINI_EXT="$GEMINI_DIR/extensions/ralph-ooo"
HOOK_SCRIPT="$GEMINI_HOOKS/ralph-ooo-check.sh"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ralph-ooo × Gemini CLI setup                 ║${NC}"
echo -e "${BLUE}║  AfterAgent hook for loop continuation        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

if ! command -v gemini &>/dev/null; then
  echo -e "${YELLOW}⚠ gemini CLI not found in PATH${NC}"
  echo -e "${GRAY}  Install: npm install -g @google/generative-ai-cli${NC}"
  echo -e "${GRAY}  Continuing setup anyway.${NC}"
  echo ""
fi

mkdir -p "$GEMINI_DIR" "$GEMINI_HOOKS" "$GEMINI_EXT"

# ── Step 1: AfterAgent hook script ───────────────────────────────────────────
echo -e "${BLUE}Step 1: AfterAgent hook script (${HOOK_SCRIPT})${NC}"

HOOK_CONTENT='#!/usr/bin/env bash
# ralph-ooo AfterAgent hook for Gemini CLI
#
# Reads .omc/state/ralph-ooo-state.json to decide whether to continue the loop.
# Workaround for Gemini v0.30.0 bug: stop_hook_active is always false in hook JSON.
# We read the state file directly instead of relying on the hook field.
#
# Exit 0  → agent stops (loop complete or not running)
# Exit 1  → agent continues (loop still running)

STATE_FILE=".omc/state/ralph-ooo-state.json"

# Not running ralph-ooo
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

if ! command -v python3 &>/dev/null; then
  exit 0
fi

STATUS=$(python3 -c "
import json, sys
try:
    with open(\"$STATE_FILE\") as f:
        d = json.load(f)
    print(d.get(\"status\", \"\"))
except Exception:
    print(\"\")
")

ITER=$(python3 -c "
import json, sys
try:
    with open(\"$STATE_FILE\") as f:
        d = json.load(f)
    print(d.get(\"iteration\", 0))
except Exception:
    print(0)
")

MAX=$(python3 -c "
import json, sys
try:
    with open(\"$STATE_FILE\") as f:
        d = json.load(f)
    print(d.get(\"max_iterations\", 10))
except Exception:
    print(10)
")

# Loop is done
if [ "$STATUS" = "complete" ] || [ "$STATUS" = "cancelled" ] || [ "$STATUS" = "failed" ]; then
  exit 0
fi

# Iteration cap reached
if [ "$ITER" -ge "$MAX" ]; then
  echo "ralph-ooo: max_iterations ($MAX) reached. Loop stopping." >&2
  exit 0
fi

# Loop still running — inject continuation context
echo "RALPH_OOO_CONTINUE: Iteration $ITER/$MAX still running. Continue the ooo ralph loop. The boulder never stops." >&2
exit 1
'

if [ -f "$HOOK_SCRIPT" ]; then
  echo -e "${YELLOW}⚠ ${HOOK_SCRIPT} already exists — overwriting${NC}"
fi

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would create ${HOOK_SCRIPT}${NC}"
else
  printf '%s\n' "$HOOK_CONTENT" > "$HOOK_SCRIPT"
  chmod +x "$HOOK_SCRIPT"
  echo -e "${GREEN}✓ Created ${HOOK_SCRIPT}${NC}"
fi

# ── Step 2: Patch settings.json ───────────────────────────────────────────────
echo ""
echo -e "${BLUE}Step 2: Patch ~/.gemini/settings.json${NC}"

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would patch ${GEMINI_SETTINGS} with AfterAgent hook${NC}"
elif command -v python3 &>/dev/null; then
  python3 - "$GEMINI_SETTINGS" "$HOOK_SCRIPT" "$GEMINI_EXT" <<'PYEOF'
import json, sys, os

settings_path = sys.argv[1]
hook_script   = sys.argv[2]
ext_dir       = sys.argv[3]

# Load or create settings
if os.path.exists(settings_path):
    with open(settings_path) as f:
        try:
            settings = json.load(f)
        except json.JSONDecodeError:
            settings = {}
else:
    settings = {}

# hooksConfig
settings.setdefault("hooksConfig", {})["enabled"] = True

# context includeDirectories
ctx = settings.setdefault("context", {})
dirs = ctx.setdefault("includeDirectories", [])
if ext_dir not in dirs:
    dirs.append(ext_dir)

# AfterAgent hook entry
hook_entry = {
    "matcher": "*",
    "hooks": [{
        "type": "command",
        "command": f"bash {hook_script}",
        "timeout": 10
    }]
}

hooks = settings.setdefault("hooks", {})
after_agent = hooks.setdefault("AfterAgent", [])

# Check if already present
already = any(
    any(h.get("command", "").endswith("ralph-ooo-check.sh")
        for h in entry.get("hooks", []))
    for entry in after_agent
)
if not already:
    after_agent.append(hook_entry)
    print("Added AfterAgent hook entry.")
else:
    print("AfterAgent hook already present.")

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
print(f"Updated {settings_path}")
PYEOF
  echo -e "${GREEN}✓ Patched ${GEMINI_SETTINGS}${NC}"
else
  echo -e "${YELLOW}⚠ python3 not found — skipping settings.json patch${NC}"
  echo -e "${GRAY}  Add manually to ${GEMINI_SETTINGS}:${NC}"
  echo -e "${GRAY}  {\"hooks\": {\"AfterAgent\": [{\"matcher\": \"*\", \"hooks\": [{\"type\": \"command\", \"command\": \"bash ${HOOK_SCRIPT}\", \"timeout\": 10}]}]}}${NC}"
fi

# ── Step 3: Extensions context directory ─────────────────────────────────────
echo ""
echo -e "${BLUE}Step 3: Extensions context directory (${GEMINI_EXT})${NC}"

EXT_CONTEXT="$GEMINI_EXT/CONTEXT.md"
EXT_CONTENT='# ralph-ooo — Ouroboros for Gemini CLI

Ouroboros specification-first workflow is active.

## ooo Commands

| Command | What It Does |
|---------|--------------|
| `ooo interview "topic"` | Socratic questioning until Ambiguity≤0.2 |
| `ooo seed` | Crystallize into immutable YAML spec |
| `ooo run [seed.yaml]` | Execute via Double Diamond |
| `ooo evaluate <id>` | 3-stage: Mechanical→Semantic→Consensus |
| `ooo evolve "topic"` | Evolutionary loop until Similarity≥0.95 |
| `ooo unstuck [persona]` | Lateral thinking |
| `ooo status [id]` | Drift check |
| `ooo ralph "task"` | Persistent loop — the boulder never stops |

## Ralph Loop State

State file: `.omc/state/ralph-ooo-state.json`
Completion signal: `<promise>DONE</promise>`

## Cancellation

`/ouroboros:cancel` — save checkpoint and exit
`/ouroboros:cancel --force` — clear all state
`ooo ralph continue` — resume from checkpoint

Source: https://github.com/Q00/ouroboros — MIT License
'

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would create ${EXT_CONTEXT}${NC}"
else
  printf '%s\n' "$EXT_CONTENT" > "$EXT_CONTEXT"
  echo -e "${GREEN}✓ Created ${EXT_CONTEXT}${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}ralph-ooo × Gemini CLI setup complete.${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Restart Gemini session"
echo -e "  2. Run with sandbox + YOLO mode: ${GREEN}gemini -s -y${NC}"
echo -e "  3. Start specification: ${GREEN}ooo interview \"your idea\"${NC}"
echo -e "  4. Start persistent loop: ${GREEN}ooo ralph \"your task\"${NC}"
echo ""
echo -e "${YELLOW}⚠  Known issue: Gemini v0.30.0 — stop_hook_active always false.${NC}"
echo -e "${GRAY}   Workaround: hook reads .omc/state/ralph-ooo-state.json directly.${NC}"
echo ""
