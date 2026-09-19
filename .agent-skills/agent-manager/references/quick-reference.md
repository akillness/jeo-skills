# agent-manager Quick Reference

> Source: [fractalmind-ai/agent-manager-skill](https://github.com/fractalmind-ai/agent-manager-skill)

## Setup

```bash
# Define CLI alias (pick the path that exists)
CLI="python3 ~/.claude/skills/agent-manager/scripts/main.py"
# or: CLI="python3 ~/.agent/skills/agent-manager/scripts/main.py"
# or from cloned repo: CLI="python3 agent-manager/scripts/main.py"
```

## Core Commands

| Command | Description |
|---------|-------------|
| `$CLI list` | All agents (running/stopped/disabled) |
| `$CLI list --running` | Only running agents |
| `$CLI start NAME` | Start agent in `tmux` session `agent-NAME` |
| `$CLI start NAME --working-dir PATH` | Override working directory |
| `$CLI stop NAME` | Kill agent tmux session |
| `$CLI status NAME` | Runtime snapshot + last heartbeat |
| `$CLI monitor NAME` | Last 100 lines of output |
| `$CLI monitor NAME -n 500` | Last N lines |
| `$CLI monitor NAME --follow` | Live tail (Ctrl+C to stop) |
| `$CLI send NAME "msg"` | Send message + Enter |
| `$CLI send NAME --no-enter "msg"` | Type without submitting |
| `$CLI assign NAME` | Assign task from stdin |
| `$CLI assign NAME --task-file FILE` | Assign task from file |
| `$CLI doctor` | Sanity check |

## Schedule Commands

| Command | Description |
|---------|-------------|
| `$CLI schedule list` | List all scheduled jobs |
| `$CLI schedule sync` | Write to system crontab |
| `$CLI schedule sync --dry-run` | Preview crontab changes |
| `$CLI schedule run NAME --job JOB` | Manual job trigger |

## Heartbeat Commands

| Command | Description |
|---------|-------------|
| `$CLI heartbeat list` | List heartbeat configs |
| `$CLI heartbeat sync` | Sync to crontab |
| `$CLI heartbeat sync --dry-run` | Preview |
| `$CLI heartbeat run EMP_XXXX` | Manual trigger |
| `$CLI heartbeat trace` | Recent audit events |
| `$CLI heartbeat trace --agent EMP_0001 --since ISO_DATE` | Filtered |
| `$CLI heartbeat slo` | Daily SLO summary |
| `$CLI heartbeat slo --window weekly` | Weekly summary |

## Agent YAML Frontmatter Fields

```yaml
---
name: dev                          # Agent identifier
description: Dev Agent             # Description
enabled: true                      # false = cannot be started
working_directory: ${REPO_ROOT}    # Supports ${REPO_ROOT}
launcher: claude                   # Full path or provider name
launcher_args:                     # CLI args for launcher
  - --dangerously-skip-permissions
launcher_config:                   # Provider-specific startup config
  model_instructions_file: path/to/prompt.md
skills:                            # Injected as system prompt
  - review-pr
  - agent-manager
schedules:                         # Cron-scheduled tasks (0 to N)
  - name: daily-standup
    cron: "0 9 * * 1-5"
    task: |
      Review issues and prioritize work
    max_runtime: 30m
    enabled: true
heartbeat:                         # Periodic check-in (0 or 1)
  cron: "*/30 * * * *"
  max_runtime: 5m
  session_mode: auto               # restore | auto | fresh
  enabled: true
tmux:                              # Optional tmux layout
  layout:
    split: h
    panes:
      - {}
      - split: v
        panes: [{}, {}]
  target_pane: "1.1"
---
```

## Session Modes (heartbeat)

| Mode | Behavior |
|------|----------|
| `restore` | Reuse existing session (default) |
| `auto` | Rollover when context < 25% |
| `fresh` | Always start fresh after handoff |

## SLO Targets

| Metric | Target |
|--------|--------|
| Success rate | ≥ 99% |
| Timeout rate | ≤ 2% |
| Recovery p95 | ≤ 120,000ms |

## Direct tmux Access

```bash
tmux attach -t agent-dev        # Interactive session (Ctrl+b d to detach)
tmux capture-pane -p -t agent-dev -S -100   # Last 100 lines
tmux ls | grep ^agent-          # List all agent sessions
```

## Path Resolution Order

Repo root: `$REPO_ROOT` → git superproject → git toplevel → parent-walk

Skills lookup (first match wins):
1. `<repo>/.agent/skills/<skill>/SKILL.md`
2. `~/.agent/skills/<skill>/SKILL.md`
3. `<repo>/.claude/skills/<skill>/SKILL.md`
4. `~/.claude/skills/<skill>/SKILL.md`
