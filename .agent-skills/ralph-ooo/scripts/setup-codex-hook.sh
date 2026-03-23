#!/usr/bin/env bash
# ralph-ooo (Ouroboros) - Codex CLI setup helper
# Configures Codex for the full Ouroboros specification-first workflow:
#
#  1) developer_instructions  → ~/.codex/config.toml
#  2) ~/.codex/prompts/ralph-ooo.md      (load via /prompts:ralph-ooo)
#  3) ~/.codex/prompts/ouroboros.md      (load via /prompts:ouroboros)
#
# Usage:
#   bash setup-codex-hook.sh [--dry-run] [--help]

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
      echo "Configures Codex CLI for ralph-ooo / Ouroboros workflows:"
      echo "  1. Adds ooo command contract to ~/.codex/config.toml developer_instructions"
      echo "  2. Creates ~/.codex/prompts/ralph-ooo.md  (load via /prompts:ralph-ooo)"
      echo "  3. Creates ~/.codex/prompts/ouroboros.md  (load via /prompts:ouroboros)"
      echo ""
      echo "Options:"
      echo "  --dry-run   Show what would change without writing"
      echo "  -h, --help  Show this help"
      exit 0
      ;;
    *) ;;
  esac
done

CODEX_DIR="$HOME/.codex"
CODEX_CONFIG="$CODEX_DIR/config.toml"
CODEX_PROMPTS="$CODEX_DIR/prompts"
RALPH_OOO_PROMPT="$CODEX_PROMPTS/ralph-ooo.md"
OUROBOROS_PROMPT="$CODEX_PROMPTS/ouroboros.md"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ralph-ooo × Codex setup                      ║${NC}"
echo -e "${BLUE}║  Stop prompting. Start specifying.             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

if ! command -v codex &>/dev/null; then
  echo -e "${YELLOW}⚠ codex CLI not found in PATH${NC}"
  echo -e "${GRAY}  Install via: npm install -g @openai/codex${NC}"
  echo -e "${GRAY}  Continuing setup anyway (config and prompts will be prepared).${NC}"
  echo ""
fi

mkdir -p "$CODEX_DIR" "$CODEX_PROMPTS"

# ── developer_instructions ──────────────────────────────────────────────────
OOO_INSTRUCTION='ralph-ooo / Ouroboros specification-first workflow active.

COMMANDS:
  ooo interview [topic]   - Socratic questioning until Ambiguity<=0.2
  ooo seed                - Crystallize into immutable YAML spec
  ooo run [seed.yaml]     - Execute via Double Diamond (Discover/Define/Design/Deliver)
  ooo evaluate <id>       - 3-stage: Mechanical->Semantic->Consensus; drift threshold<=0.3
  ooo evolve [topic]      - Evolutionary loop until Similarity>=0.95 or 30 generations
  ooo unstuck [persona]   - Lateral thinking: simplifier|hacker|contrarian|researcher|architect
  ooo status [id]         - Drift check: Goal(50%)+Constraint(30%)+Ontology(20%)
  ooo ralph "task"        - Persistent loop until verified; boulder never stops

RALPH LOOP CONTRACT:
  /ralph "<task>" [--completion-promise=TEXT] [--max-iterations=N]
  1) Keep original task unchanged across all retries
  2) Detect completion: <promise>DONE</promise> in output
  3) If promise missing and iteration < max: continue immediately
  4) Default promise: DONE. Default max: 10.
  5) State file: .omc/state/ralph-ooo-state.json (updated each iteration)

AMBIGUITY GATE: Ambiguity = 1 - SUM(clarity_i x weight_i) must be <=0.2 before seed
CONVERGENCE: Similarity = 0.5*name_overlap + 0.3*type_match + 0.2*exact_match >= 0.95'

# ── Step 1: config.toml ──────────────────────────────────────────────────────
echo -e "${BLUE}Step 1: config.toml developer_instructions${NC}"
if [ -f "$CODEX_CONFIG" ] && grep -q "ralph-ooo\|ooo interview\|ouroboros" "$CODEX_CONFIG" 2>/dev/null; then
  echo -e "${YELLOW}⚠ developer_instructions already contains ralph-ooo/Ouroboros reference${NC}"
  echo -e "${GRAY}  No changes made to config.toml.${NC}"
else
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN] Would add ralph-ooo ooo contract to developer_instructions in ${CODEX_CONFIG}${NC}"
  else
    if [ -f "$CODEX_CONFIG" ] && grep -q "^developer_instructions" "$CODEX_CONFIG" 2>/dev/null; then
      if command -v python3 &>/dev/null; then
        python3 - "$CODEX_CONFIG" "$OOO_INSTRUCTION" <<'PYEOF'
import sys, re

path, addition = sys.argv[1], sys.argv[2]

def escape_toml(v):
    return v.replace("\\", "\\\\").replace('"', '\\"')

with open(path) as f:
    content = f.read()

pattern = re.compile(r'^(developer_instructions\s*=\s*")(.+?)(")', re.MULTILINE | re.DOTALL)
match = pattern.search(content)
if match:
    current = match.group(2)
    if "ralph-ooo" not in current and "ooo interview" not in current:
        new_val = current + " " + addition
        content = (content[:match.start()]
                   + f'developer_instructions = "{escape_toml(new_val)}"'
                   + content[match.end():])
        with open(path, "w") as out:
            out.write(content)
        print("Updated existing developer_instructions.")
    else:
        print("developer_instructions already includes ralph-ooo contract.")
else:
    with open(path, "a") as out:
        out.write(f'\ndeveloper_instructions = "{escape_toml(addition)}"\n')
    print("Appended developer_instructions.")
PYEOF
      else
        printf '\ndeveloper_instructions = "%s"\n' "$OOO_INSTRUCTION" >> "$CODEX_CONFIG"
      fi
    else
      printf 'developer_instructions = "%s"\n' "$OOO_INSTRUCTION" > "$CODEX_CONFIG"
    fi
    echo -e "${GREEN}✓ Updated ${CODEX_CONFIG}${NC}"
  fi
fi

# ── Step 2: ralph-ooo prompt ─────────────────────────────────────────────────
echo ""
echo -e "${BLUE}Step 2: ralph-ooo prompt file (${RALPH_OOO_PROMPT})${NC}"

RALPH_OOO_CONTENT='# ralph-ooo — Ouroboros Completion Loop

The boulder never stops. This prompt configures Codex for ralph-ooo loop execution.

## Loop Contract

```
/ralph "task" [--completion-promise=TEXT] [--max-iterations=N]
```

1. Keep original task unchanged across all retries
2. Completion detected as: `<promise>DONE</promise>` in output
3. If not found and iteration < max → continue immediately
4. Default promise: `DONE` | Default max iterations: `10`

## State File

Create `.omc/state/ralph-ooo-state.json` at loop start:
```json
{
  "mode": "ralph-ooo",
  "session_id": "<uuid>",
  "request": "<original request>",
  "status": "running",
  "iteration": 0,
  "max_iterations": 10,
  "last_checkpoint": null,
  "seed_path": null,
  "verification_history": []
}
```

## Progress Report Format

```
[Ralph-OOO Iteration N/max]
Executing in parallel...

Verification: FAILED | PASSED
Score: 0.0 – 1.0
Issues:
  - <issue 1>

The boulder never stops. Continuing...
```

## Completion

```
<promise>DONE</promise>

Ralph-OOO COMPLETE
==================
Request: <original>
Duration: <time>
Iterations: <count>
```

## Full ooo Workflow

```
ooo interview "topic"   → Socratic interview (Ambiguity≤0.2)
ooo seed                → Generate spec
ooo run [seed.yaml]     → Execute spec
ooo evaluate <id>       → 3-stage verification
ooo evolve "topic"      → Evolutionary loop (Similarity≥0.95)
ooo unstuck [persona]   → Lateral thinking
ooo ralph "task"        → Persistent loop
```

See /prompts:ouroboros for the complete Ouroboros reference.
'

if [ -f "$RALPH_OOO_PROMPT" ]; then
  echo -e "${YELLOW}⚠ ${RALPH_OOO_PROMPT} already exists — overwriting${NC}"
fi
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would create/update ${RALPH_OOO_PROMPT}${NC}"
else
  printf '%s\n' "$RALPH_OOO_CONTENT" > "$RALPH_OOO_PROMPT"
  echo -e "${GREEN}✓ Created ${RALPH_OOO_PROMPT}${NC}"
fi

# ── Step 3: ouroboros prompt ─────────────────────────────────────────────────
echo ""
echo -e "${BLUE}Step 3: ouroboros prompt file (${OUROBOROS_PROMPT})${NC}"

OUROBOROS_CONTENT='# Ouroboros — Specification-First AI Development

> Stop prompting. Start specifying.
> The serpent does not repeat — it evolves.

## The Loop

```
Interview → Seed → Execute → Evaluate
    ↑                           ↓
    └──── Evolutionary Loop ────┘
```

## Commands

| Command | What It Does |
|---------|--------------|
| `ooo interview "topic"` | Socratic questioning → Ambiguity≤0.2 |
| `ooo seed` | Crystallize into immutable YAML spec |
| `ooo run [seed.yaml]` | Execute via Double Diamond |
| `ooo evaluate <id>` | 3-stage: Mechanical→Semantic→Consensus |
| `ooo evolve "topic"` | Evolutionary loop → Similarity≥0.95 |
| `ooo unstuck [persona]` | Lateral thinking: simplifier|hacker|contrarian|researcher|architect |
| `ooo status [id]` | Drift check (threshold ≤ 0.3) |
| `ooo ralph "task"` | Persistent loop until verified |

## Ambiguity Gate

```
Ambiguity = 1 − Σ(clarityᵢ × weightᵢ)
Greenfield: Goal(40%) + Constraint(30%) + Success(30%)
Brownfield: Goal(35%) + Constraint(25%) + Success(25%) + Context(15%)
Threshold: ≤ 0.2 → ready for Seed
```

## Convergence Gate

```
Similarity = 0.5×name_overlap + 0.3×type_match + 0.2×exact_match
Threshold: ≥ 0.95 → CONVERGED → loop stops
```

## Nine Minds (On-Demand)

socratic-interviewer | ontologist | seed-architect | evaluator |
contrarian | hacker | simplifier | researcher | architect

## Cancellation

- `/ouroboros:cancel` — save checkpoint, exit
- `/ouroboros:cancel --force` — clear all state
- `/ralph-ooo:cancel` — alias
- `ooo ralph continue` — resume from checkpoint

Source: https://github.com/Q00/ouroboros — MIT License
'

if [ -f "$OUROBOROS_PROMPT" ]; then
  echo -e "${YELLOW}⚠ ${OUROBOROS_PROMPT} already exists — overwriting${NC}"
fi
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] Would create/update ${OUROBOROS_PROMPT}${NC}"
else
  printf '%s\n' "$OUROBOROS_CONTENT" > "$OUROBOROS_PROMPT"
  echo -e "${GREEN}✓ Created ${OUROBOROS_PROMPT}${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}ralph-ooo × Codex setup complete.${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Restart Codex session"
echo -e "  2. Load ralph-ooo context:  ${GREEN}/prompts:ralph-ooo${NC}"
echo -e "  3. Load full reference:     ${GREEN}/prompts:ouroboros${NC}"
echo -e "  4. Start specification:     ${GREEN}ooo interview \"your idea\"${NC}"
echo -e "  5. Start persistent loop:   ${GREEN}/ralph \"your task\" --max-iterations=10${NC}"
echo ""
echo -e "${GRAY}Note: Codex has no native AfterAgent hooks.${NC}"
echo -e "${GRAY}Ralph loop relies on <promise>DONE</promise> detection.${NC}"
echo ""
