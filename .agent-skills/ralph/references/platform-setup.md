# Platform Setup Guide

> Multi-platform configuration for ralph-ooo on Claude Code, Codex CLI, Gemini CLI, and OpenCode.

---

## Platform Support Matrix

| Platform | Support Level | Mechanism | ooo Commands | Auto Loop |
|----------|:-------------:|-----------|:-----------:|:---------:|
| **Claude Code** | Full | Skills system + UserPromptSubmit hook | All `ooo` commands | Via hooks |
| **Codex CLI** | Adapted | bash loop + `/prompts:ralph-ooo` | Via conversation | Manual state file |
| **Gemini CLI** | Native | AfterAgent hook | All `ooo` commands | Via hook |
| **OpenCode** | Native | Skills system | All `ooo` commands | Via loop |

---

## Claude Code (Full Mode)

### Option A: Ouroboros native plugin

```bash
# Install
claude plugin marketplace add Q00/ouroboros
claude plugin install ouroboros@ouroboros

# One-time setup (inside Claude Code session)
ooo setup
```

### Option B: oh-my-skills integration

```bash
npx skills add https://github.com/akillness/oh-my-skills --skill ralph-ooo
```

### Hooks

Claude Code hooks auto-activate on install. Configured at `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/session-start.mjs\"",
        "timeout": 5
      }]
    }],
    "UserPromptSubmit": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/keyword-detector.mjs\"",
        "timeout": 5
      }]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/drift-monitor.mjs\"",
        "timeout": 3
      }]
    }]
  }
}
```

Hook behaviors:
- `SessionStart` → initializes session state
- `UserPromptSubmit` → keyword-detector triggers `ooo` commands automatically
- `PostToolUse(Write|Edit)` → drift-monitor tracks deviation from seed

### Usage

```
ooo interview "I want to build a task CLI"
ooo seed
ooo run
ooo evaluate <session_id>
ooo ralph "fix all failing tests"
```

---

## Codex CLI (Adapted Mode)

Codex CLI has no native AfterAgent hooks. Ralph loop uses conversation-level promise detection.

### Setup

```bash
bash .agent-skills/ralph-ooo/scripts/setup-codex-hook.sh
```

This configures:
1. `~/.codex/config.toml` — adds `developer_instructions` with ooo command contract
2. `~/.codex/prompts/ralph-ooo.md` — load via `/prompts:ralph-ooo`
3. `~/.codex/prompts/ouroboros.md` — load via `/prompts:ouroboros`

### Manual config.toml

```toml
developer_instructions = """
Ouroboros specification-first workflow active. ooo command contract:

COMMANDS:
  ooo interview [topic]   - Socratic questioning until Ambiguity≤0.2
  ooo seed                - Crystallize into immutable YAML spec
  ooo run [seed.yaml]     - Execute via Double Diamond
  ooo evaluate <id>       - 3-stage: Mechanical→Semantic→Consensus
  ooo evolve [topic]      - Evolutionary loop until Similarity≥0.95
  ooo unstuck [persona]   - Lateral thinking
  ooo status [id]         - Drift check
  ooo ralph "task"        - Persistent loop until verified

RALPH LOOP CONTRACT:
  /ralph "<task>" [--completion-promise=TEXT] [--max-iterations=N]
  Signal: <promise>DONE</promise>
  Default promise: DONE. Default max: 10.
  State: .omc/state/ralph-ooo-state.json
  The boulder never stops.
"""
```

### Usage

```bash
# Start Codex
codex

# Load ralph-ooo context
/prompts:ralph-ooo

# Start ralph loop
/ralph "fix all TypeScript errors" --max-iterations=10
```

### Ralph loop contract (Codex)

1. Treat `/ralph "<task>"` as a binding contract command
2. Keep original task unchanged across all retries
3. Detect completion: `<promise>DONE</promise>` in output
4. If promise missing and iteration < max → continue immediately
5. If promise found or max reached → finish with status report
6. Update `.omc/state/ralph-ooo-state.json` each iteration

### High-autonomy mode

For sandbox environments only:

```bash
codex --dangerously-bypass-approvals-and-sandbox \
  -c model_reasoning_effort="high" \
  -c model_reasoning_summary="detailed"
```

---

## Gemini CLI (AfterAgent Hook Mode)

### Install via extensions

```bash
gemini extensions install https://github.com/Q00/ouroboros
```

Or use setup script:

```bash
bash .agent-skills/ralph-ooo/scripts/setup-gemini-hook.sh
```

### Required settings.json

Add to `~/.gemini/settings.json`:

```json
{
  "hooksConfig": { "enabled": true },
  "context": {
    "includeDirectories": ["~/.gemini/extensions/ralph-ooo"]
  },
  "hooks": {
    "AfterAgent": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bash ~/.gemini/hooks/ralph-ooo-check.sh",
        "timeout": 10
      }]
    }]
  }
}
```

### Ralph-ooo AfterAgent hook script

Location: `~/.gemini/hooks/ralph-ooo-check.sh`

```bash
#!/usr/bin/env bash
# Reads .omc/state/ralph-ooo-state.json to decide whether to continue the loop.
# Workaround for Gemini v0.30.0 bug: stop_hook_active is always false in hook JSON.

STATE_FILE=".omc/state/ralph-ooo-state.json"

if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

STATUS=$(python3 -c "import json,sys; d=json.load(open('$STATE_FILE')); print(d.get('status',''))")
ITER=$(python3 -c "import json,sys; d=json.load(open('$STATE_FILE')); print(d.get('iteration',0))")
MAX=$(python3 -c "import json,sys; d=json.load(open('$STATE_FILE')); print(d.get('max_iterations',10))")

if [ "$STATUS" = "complete" ] || [ "$STATUS" = "cancelled" ]; then
  exit 0
fi

if [ "$ITER" -ge "$MAX" ]; then
  exit 0
fi

# Inject continuation prompt
echo "CONTINUE_RALPH: Ralph-OOO iteration $ITER/$MAX still running. Continue with ooo ralph loop."
exit 1   # non-zero exit re-triggers agent
```

### ⚠️ Gemini v0.30.0 Bug

`stop_hook_active` is always `false` in hook JSON. **Do not rely on it.**

Workaround: read `.omc/state/ralph-ooo-state.json` directly to determine loop state.

### Recommended Gemini run mode

```bash
gemini -s -y   # sandbox + YOLO (no confirmation prompts)
```

---

## OpenCode

OpenCode natively supports the skills system. No additional setup required.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": "Use ooo commands for specification-first development. ooo interview to start."
}
```

Skills auto-load from the `.agent-skills/` directory.

---

## State File Location

Across all platforms, ralph-ooo state lives at:

```
.omc/state/ralph-ooo-state.json
```

Use the state utility script to manage it:

```bash
bash .agent-skills/ralph-ooo/scripts/ooo-state.sh init "fix all tests"
bash .agent-skills/ralph-ooo/scripts/ooo-state.sh status
bash .agent-skills/ralph-ooo/scripts/ooo-state.sh checkpoint
bash .agent-skills/ralph-ooo/scripts/ooo-state.sh reset
bash .agent-skills/ralph-ooo/scripts/ooo-state.sh resume
```
