---
name: clawteam
description: >
  Multi-agent swarm orchestration where AI agents spawn, coordinate, and self-organize into
  collaborative teams. Use when running parallel AI agent tasks, orchestrating multi-agent
  workflows across Claude Code / Codex / Cursor / custom agents, isolating agent workspaces
  via git worktrees, tracking task dependencies across agents, or running autonomous experiments.
  Triggers on: clawteam, agent swarm, spawn agents, multi-agent team, agent orchestration,
  parallel agents, agent coordination, swarm intelligence, agent spawn, clawteam spawn,
  agent worktree, agentic team, ml agent experiments, autonomous agents, agent team.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: MIT
metadata:
  tags: clawteam, multi-agent, swarm, orchestration, tmux, git-worktree, autonomous, python
  version: "1.0"
  source: https://github.com/HKUDS/ClawTeam
---

# clawteam — Agent Swarm Intelligence

> **Keyword**: `clawteam` · `agent swarm` · `spawn agents` · `multi-agent team`
>
> One command → a self-organizing team of AI agents that spawn workers, coordinate tasks,
> isolate workspaces with git worktrees, and deliver results autonomously.
>
> *"Agents spawn agents, delegate tasks, and deliver results."*

## When to use this skill

- Spawn parallel AI agent workers for large, decomposable tasks
- Run autonomous ML experiments across multiple GPU workers
- Orchestrate full-stack development with specialized agents (API, backend, frontend, tests)
- Run investment analysis with multi-specialist agent teams
- Coordinate agents across Claude Code, Codex, OpenClaw, nanobot, or Cursor
- Monitor live agent progress via tmux tiled views or web Kanban dashboard
- Track task dependencies and automatically unblock agents when prerequisites complete

---

## Installation

```bash
# Requires Python 3.10+, tmux, and at least one compatible CLI coding agent
pip install clawteam

# Verify installation
clawteam --version
clawteam doctor   # check tmux, agent CLI, environment
```

Compatible agents: `claude`, `codex`, `openclaw`, `nanobot`, `cursor`, custom scripts.

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Leader** | The orchestrating agent that spawns workers and delegates tasks |
| **Worker** | A sub-agent spawned into an isolated git worktree + tmux pane |
| **Team** | Named group of workers coordinating on a shared task set |
| **Task** | A unit of work with status: `pending` → `in_progress` → `completed` / `blocked` |
| **Inbox** | File-based or ZeroMQ P2P message queue per agent |
| **Worktree** | Git worktree at branch `clawteam/{team}/{agent}` — isolated file system |

---

## Quick Start

### Spawn a team from your agent session

```bash
# Leader spawns 3 Claude workers on a task
clawteam spawn claude "Build the REST API" --workers 3 --team api-build

# Spawn specialized workers
clawteam spawn claude "Implement auth endpoints" --team api-build --name auth-worker
clawteam spawn claude "Implement user CRUD"     --team api-build --name crud-worker
clawteam spawn codex  "Write integration tests" --team api-build --name test-worker
```

### Check team status

```bash
clawteam status                      # all teams
clawteam status --team api-build     # specific team
clawteam board --team api-build      # live web Kanban dashboard
```

### Send messages between agents

```bash
# Leader sends task to a worker
clawteam send --to crud-worker "Priority: implement DELETE /users/{id} first"

# Worker broadcasts status
clawteam broadcast --team api-build "Auth module complete, unblocking crud-worker"
```

### Task management

```bash
clawteam task add "Implement rate limiting" --team api-build
clawteam task list --team api-build
clawteam task done --id <task-id> --team api-build
clawteam task block --id <task-id> --blocked-by <other-id>
```

---

## Instructions

Use this sequence when the user asks to create or run a ClawTeam workflow.

1. Verify prerequisites first.
   - Check Python 3.10+, `tmux`, `git`, and at least one supported agent CLI.
   - If setup is unclear, run `bash scripts/install.sh` or show the minimal install commands.
2. Pick the team shape.
   - Use `clawteam template ...` for known patterns like `fullstack`, `ml-research`, or `hedge-fund`.
   - Use explicit `clawteam spawn ... --name ...` commands when worker roles need to be custom.
3. Make worker ownership explicit.
   - Give each worker a semantic role such as `architect`, `backend`, `tester`, or `risk-analyst`.
   - If tasks depend on one another, show `clawteam task block --id ... --blocked-by ...`.
4. Show how to monitor and communicate.
   - Include `clawteam status --team <name>`.
   - Include either `clawteam board --team <name>` or `clawteam monitor --team <name>`.
   - Include `clawteam send` or `clawteam broadcast` when coordination matters.
5. Close with the lifecycle.
   - Explain how to mark tasks done, inspect costs when relevant, and tear down the team with `clawteam teardown --team <name>`.

If the user asks for a recommendation, prefer the smallest team that can execute in parallel without overlapping ownership.

---

## Architecture

```
Leader Agent
    │
    ├── clawteam spawn → Worker 1 (tmux pane, git worktree: clawteam/my-team/worker-1)
    ├── clawteam spawn → Worker 2 (tmux pane, git worktree: clawteam/my-team/worker-2)
    └── clawteam spawn → Worker 3 (tmux pane, git worktree: clawteam/my-team/worker-3)
                │
    ┌───────────┼───────────┐
    │           │           │
 Task 1      Task 2      Task 3
 (independent) (blocked  (blocked
               by T1)     by T2)

State: ~/.clawteam/{team}/
  tasks.json    — task list with deps
  inbox/        — per-agent message queues
  snapshots/    — periodic state snapshots
  costs.json    — token/API cost tracking
```

**Workspace isolation**: Each worker operates in `clawteam/{team}/{worker}` git branch → no merge conflicts during parallel development.

**Transport**: FileTransport (default, atomic tmp+rename) or P2PTransport (ZeroMQ TCP with filesystem fallback).

---

## Pre-built Team Templates

### ML Research Team

```bash
# 8 agents × H100 GPU experiments
clawteam template ml-research \
  --agents 8 \
  --task "Optimize transformer attention with val_bpb target 0.97" \
  --team ml-exp
```

### Full-Stack Development Team

```bash
clawteam template fullstack \
  --agents 4 \
  --task "Build e-commerce product catalog API" \
  --team shop-api
# Spawns: api-designer, backend-dev, frontend-dev, test-engineer
```

### Investment Analysis Team

```bash
clawteam template hedge-fund \
  --agents 7 \
  --ticker AAPL \
  --team aapl-analysis
# Spawns: growth-analyst, technical-analyst, fundamental-analyst,
#         sentiment-analyst, risk-analyst, macro-analyst, synthesizer
```

---

## Monitoring

```bash
# Real-time tiled tmux view (split panes per worker)
clawteam monitor --team api-build

# Web Kanban dashboard (localhost:7420)
clawteam board --team api-build --port 7420

# Show agent costs and token usage
clawteam costs --team api-build
```

---

## Configuration

Config file: `~/.clawteam/config.toml`

```toml
[transport]
type = "file"          # "file" (default) or "p2p" (ZeroMQ)

[workspace]
base_dir = "~/.clawteam"
worktree_pattern = "clawteam/{team}/{agent}"

[spawn]
default_agent = "claude"
tmux_session_prefix = "ct-"

[costs]
budget_limit = 10.0    # USD, optional
alert_threshold = 0.8  # warn at 80% of budget
```

Environment variables override config:
```bash
CLAWTEAM_TRANSPORT=p2p   # use ZeroMQ
CLAWTEAM_BASE_DIR=/tmp/clawteam
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `clawteam spawn <agent> <task>` | Spawn a worker agent with a task |
| `clawteam status [--team NAME]` | Show team and task status |
| `clawteam board [--team NAME]` | Open web Kanban dashboard |
| `clawteam monitor [--team NAME]` | Live tmux tiled view |
| `clawteam send --to <worker> <msg>` | Send message to a specific worker |
| `clawteam broadcast --team <name> <msg>` | Broadcast to all team workers |
| `clawteam task add/list/done/block` | Manage tasks |
| `clawteam costs [--team NAME]` | Show token/cost usage |
| `clawteam doctor` | Check environment and dependencies |
| `clawteam template <name>` | Use pre-built team templates |
| `clawteam teardown --team NAME` | Shut down team and clean up |

---

## Worker Auto-Injection

When ClawTeam spawns a worker, it injects a coordination prompt teaching the agent to:

1. Check assigned tasks: `clawteam task list --team {name} --owner {me}`
2. Mark task in progress: `clawteam task start --id {id}`
3. Report completion: `clawteam task done --id {id}`
4. Check inbox: `clawteam inbox --team {name} --worker {me}`
5. Send status: `clawteam send --to leader "Task complete: {summary}"`

Workers operate autonomously — no human intervention needed once spawned.

---

## Examples

### Example 1: Spawn a 3-worker API team

```bash
clawteam spawn claude "Design the API contracts" --team api-build --name architect
clawteam spawn claude "Implement the REST endpoints" --team api-build --name backend
clawteam spawn codex "Write integration tests" --team api-build --name tester

clawteam task block --id backend-impl --blocked-by api-spec
clawteam task block --id integration-tests --blocked-by backend-impl

clawteam status --team api-build
clawteam board --team api-build
```

### Example 2: Run parallel ML experiments

```bash
clawteam template ml-research \
  --agents 4 \
  --task "Sweep learning rate and context length for val_bpb improvement" \
  --team ml-sweep

clawteam monitor --team ml-sweep
clawteam costs --team ml-sweep
```

### Example 3: Check what a team is doing right now

```bash
clawteam status --team shop-api
clawteam board --team shop-api --port 7420
clawteam inbox --team shop-api --worker backend
```

---

## Best practices

1. **Name workers semantically** — `auth-worker`, `test-engineer`, not `worker-1`
2. **Use task dependencies** — `clawteam task block` prevents out-of-order execution
3. **Set budget limits** — use `budget_limit` in config to prevent runaway costs
4. **Use templates for known patterns** — `ml-research`, `fullstack`, `hedge-fund`
5. **FileTransport for most cases** — P2PTransport only needed for cross-machine teams
6. **Monitor with `clawteam board`** — web dashboard gives clearest progress view

---

## References

- [Architecture Overview](references/architecture.md) — transport, workspace isolation, state model
- [Agent Types & Compatibility](references/agent-types.md) — claude, codex, openclaw, nanobot, cursor
- [Use Cases & Templates](references/use-cases.md) — ML research, fullstack dev, investment analysis
- [ClawTeam GitHub](https://github.com/HKUDS/ClawTeam) — MIT License
- [PyPI](https://pypi.org/project/clawteam/) — `pip install clawteam`
