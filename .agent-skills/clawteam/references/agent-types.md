# Agent Types & Compatibility

ClawTeam supports any CLI-based coding agent. Agents are spawned in tmux panes
and receive coordination prompts automatically.

## Supported Agents

| Agent | Spawn Key | Notes |
|-------|-----------|-------|
| Claude Code | `claude` | Recommended. Full tool access. |
| OpenAI Codex CLI | `codex` | Good for code generation tasks |
| OpenClaw | `openclaw` | Claude-compatible open alternative |
| nanobot | `nanobot` | Lightweight, fast for simple tasks |
| Cursor | `cursor` | IDE-integrated agent |
| Custom script | `script:/path/to/agent.sh` | Any CLI agent |

## Spawning with Specific Agents

```bash
# Claude Code (default)
clawteam spawn claude "Implement auth module" --team myteam

# Codex CLI
clawteam spawn codex "Write unit tests" --team myteam

# Mixed team (Claude for complex tasks, Codex for tests)
clawteam spawn claude "Design API architecture" --team myteam --name architect
clawteam spawn claude "Implement endpoints"    --team myteam --name backend
clawteam spawn codex  "Generate test suite"    --team myteam --name tester

# Custom agent script
clawteam spawn script:/usr/local/bin/my-agent "Analyze logs" --team myteam
```

## Coordination Prompt Injection

ClawTeam automatically injects a coordination prompt when spawning workers.
The prompt teaches the agent to:

1. Check tasks: `clawteam task list --team {name} --owner {me}`
2. Start task: `clawteam task start --id {id}`
3. Complete task: `clawteam task done --id {id}`
4. Check inbox: `clawteam inbox --team {name} --worker {me}`
5. Report to leader: `clawteam send --to leader "{status}"`

Workers are fully autonomous after spawning — they check tasks, work, and report
without further human input.

## Worker Naming Conventions

Use semantic names that describe the worker's role:

```bash
# Good — role is clear
clawteam spawn claude "..." --name auth-engineer
clawteam spawn claude "..." --name test-engineer
clawteam spawn claude "..." --name data-analyst

# Avoid — generic names make monitoring confusing
clawteam spawn claude "..." --name worker-1
clawteam spawn claude "..." --name agent-a
```

## Multi-Agent Patterns

### Parallel Independent Workers
```bash
# All workers get different subtasks, no dependencies
for i in 1 2 3 4; do
  clawteam spawn claude "Experiment config $i: lr=0.000${i}" \
    --team ml-exp --name exp-${i}
done
```

### Sequential Pipeline
```bash
# Task B waits for Task A
clawteam task add "Generate dataset" --team pipeline --id gen
clawteam task add "Train model"      --team pipeline --id train
clawteam task add "Evaluate model"   --team pipeline --id eval
clawteam task block --id train --blocked-by gen
clawteam task block --id eval  --blocked-by train
```

### Leader-Worker Hierarchy
```bash
# Leader orchestrates, workers execute
clawteam spawn claude "Orchestrate the full-stack build. Use clawteam spawn for subtasks." \
  --team fullstack --name leader --role leader
```
