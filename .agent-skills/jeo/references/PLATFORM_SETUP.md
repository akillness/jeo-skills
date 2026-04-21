# JEO Platform Setup Reference

Use this file for runtime-specific config and install details. Keep `SKILL.md` focused on the orchestration contract.

## Claude Code

Primary config surface: `~/.claude/settings.json`

```json
{
  "hooks": {
    "PermissionRequest": [{
      "matcher": "ExitPlanMode",
      "hooks": [{"type": "command", "command": "python3 ~/.claude/skills/jeo/scripts/claude-plan-gate.py", "timeout": 1800}]
    }],
    "UserPromptSubmit": [{
      "matcher": "*",
      "hooks": [{"type": "command", "command": "python3 ~/.claude/skills/jeo/scripts/claude-agentation-submit-hook.py", "timeout": 300}]
    }]
  },
  "mcpServers": {
    "agentation": {"command": "npx", "args": ["-y", "agentation-mcp", "server"]}
  }
}
```

Notes:
- JEO plan review is **hook-only** in Claude Code. Use `EnterPlanMode` → `ExitPlanMode`; do not call raw plannotator directly.
- Team mode is the preferred execution path. Re-run `bash scripts/setup-claude.sh` if hooks or team behavior look wrong.

## Codex CLI

Primary config surface: `~/.codex/config.toml`

```toml
notify = ["python3", "~/.codex/hooks/jeo-notify.py"]
[tui]
notifications = ["agent-turn-complete"]
```

Important:
- `developer_instructions` must be a top-level string, not a nested table, or Codex fails with `invalid type: map, expected a string`.
- JEO plan review runs via blocking CLI commands, not a Claude-style permission hook.

## Gemini CLI

- Instructions live in `~/.gemini/GEMINI.md`
- AfterAgent safety-net hook lives in `~/.gemini/settings.json`
- The agent must call plannotator directly in blocking mode to receive feedback in the same turn

## OpenCode

- Plugins live in `opencode.json`
- Expected slash commands: `/jeo-plan`, `/jeo-exec`, `/jeo-annotate`, `/jeo-cleanup`
- Keep OpenCode guidance concise unless the repo has direct evidence for new behavior; do not over-claim parity with Claude/Codex/Gemini

## Setup commands

```bash
bash scripts/install.sh --all
bash scripts/check-status.sh
bash scripts/setup-claude.sh
bash scripts/setup-codex.sh
bash scripts/setup-gemini.sh
bash scripts/setup-opencode.sh
```
