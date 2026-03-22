# ClawTeam Architecture

## Overview

ClawTeam uses a filesystem-first architecture with no external database.
All state persists as JSON in `~/.clawteam/{team}/`.

```
~/.clawteam/
└── {team-name}/
    ├── tasks.json         # task list with dependencies
    ├── inbox/             # per-agent message queues
    │   ├── leader.json
    │   └── {worker}.json
    ├── snapshots/         # periodic state snapshots
    ├── costs.json         # token/API cost tracking
    └── workers.json       # registered workers
```

## Workspace Isolation

Each worker operates in a dedicated git worktree:

```bash
# Branch pattern: clawteam/{team}/{worker}
git worktree add .worktrees/api-build/auth-worker clawteam/api-build/auth-worker
```

Benefits:
- No file conflicts between parallel workers
- Each worker has independent working directory
- Clean merge strategy: review each branch individually
- Automatic cleanup on `clawteam teardown`

## Transport Layer

### FileTransport (default)
- Atomic writes via tmp file + rename (POSIX atomic)
- Works on any filesystem, no network required
- JSON inbox files per agent
- Suitable for single-machine teams

### P2PTransport (ZeroMQ)
- TCP direct connections between agents
- Sub-millisecond latency for high-frequency messaging
- Graceful degradation to FileTransport when peer offline
- Required for cross-machine teams

```bash
# Enable P2P transport
export CLAWTEAM_TRANSPORT=p2p
# Or in ~/.clawteam/config.toml:
[transport]
type = "p2p"
```

## Task State Machine

```
pending → in_progress → completed
              ↑
           blocked ──────────┘ (when blocking task completes, auto-unblocks)
```

Task dependency graph prevents out-of-order execution:
```bash
# Task B blocked until Task A completes
clawteam task add "Implement API endpoints" --team myteam --id task-a
clawteam task add "Write integration tests" --team myteam --id task-b
clawteam task block --id task-b --blocked-by task-a
# task-b auto-transitions pending when task-a completes
```

## Agent Spawning (tmux Backend)

1. `clawteam spawn` creates new tmux session `ct-{team}-{worker}`
2. Git worktree created at `clawteam/{team}/{worker}` branch
3. Coordination prompt injected into agent's initial message
4. Agent receives task list and inbox location
5. Worker operates autonomously; leader monitors via `clawteam status`

## Inter-Agent Messaging

```
Worker → clawteam send --to leader "Task complete"
           │
           └─→ ~/.clawteam/{team}/inbox/leader.json (appended)

Leader → clawteam broadcast --team myteam "New priority: focus on auth"
           │
           └─→ All workers' inbox files updated
```

## Cost Tracking

ClawTeam tracks token usage and API costs per agent:
```bash
clawteam costs --team myteam
# Output:
# Worker          Tokens    Cost
# auth-worker     45,230    $0.54
# crud-worker     38,100    $0.46
# test-worker     22,450    $0.27
# ─────────────────────────────
# Total           105,780   $1.27
```

Set budget limits in `~/.clawteam/config.toml` to prevent runaway costs.
