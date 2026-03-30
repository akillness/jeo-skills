# Orchestrator Skill Template

Templates for creating orchestrator skills that coordinate agent teams.

---

## Template A: Agent Team Mode (Default)

Use when agents need to communicate or cross-validate.

```markdown
---
name: {domain}-orchestrator
description: >
  Orchestrate the {domain} agent team. Coordinates {N} specialists
  through {pattern} execution. Use when {trigger conditions}.
model: opus
allowed-tools: Bash Read Write Edit Glob Grep Agent TeamCreate TaskCreate TaskUpdate SendMessage
---

# {Domain} Orchestrator

## Phase 0: Preparation

1. Analyze input and define workspace root: `_workspace/{run-id}/`
2. Create task manifest: `_workspace/{run-id}/tasks.json`
3. Initialize output directories for each agent

## Phase 1: Team Assembly

```
TeamCreate:
  members:
    - name: {agent-a}
      definition: .claude/agents/{agent-a}.md
    - name: {agent-b}
      definition: .claude/agents/{agent-b}.md
```

Assign initial tasks via TaskCreate. Set status to `pending`.

## Phase 2: Parallel Execution

Each agent:
1. Claims tasks (TaskUpdate → in_progress)
2. Does work, writes outputs to `_workspace/{run-id}/{agent-name}/`
3. Communicates discoveries to peers via SendMessage (if fan-out or expert pool)
4. Marks tasks done (TaskUpdate → completed)
5. Signals orchestrator

## Phase 3: Integration

After all agents complete:
1. Read outputs from `_workspace/{run-id}/*/`
2. Merge, deduplicate, resolve conflicts
3. Generate final deliverable at `_workspace/{run-id}/final-output.{ext}`

## Phase 4: Cleanup

1. Archive `_workspace/{run-id}/` — do not delete intermediate artifacts
2. Write summary to `_workspace/{run-id}/run-summary.md`
3. Report results to user
```

---

## Template B: Sub-Agent Mode (Lightweight)

Use when tasks are independent and no cross-agent communication is needed.

```markdown
---
name: {domain}-runner
description: >
  Run {N} independent {domain} sub-tasks in parallel. Use when
  {trigger conditions} and agents do not need to communicate.
model: sonnet
allowed-tools: Bash Read Write Edit Glob Grep Agent
---

# {Domain} Runner

## Step 1: Preparation

Parse input, define output paths, create `_workspace/{run-id}/`.

## Step 2: Sub-Agent Invocation

Invoke agents via Agent tool. Run independent agents in parallel:

```
Agent(task="...", definition=".claude/agents/{agent-a}.md")
Agent(task="...", definition=".claude/agents/{agent-b}.md")
```

Wait for all to complete before proceeding.

## Step 3: Integration

Collect results from each agent's output path.
Merge into final deliverable.

## Step 4: Output

Write `_workspace/{run-id}/final-output.{ext}` and summarize for user.
```

---

## Data Passing Conventions

| Convention | Rule |
|------------|------|
| Workspace root | `_workspace/{run-id}/` with absolute paths |
| Per-agent output | `_workspace/{run-id}/{agent-name}/` |
| Final output | `_workspace/{run-id}/final-output.{ext}` |
| Run summary | `_workspace/{run-id}/run-summary.md` |
| Task manifest | `_workspace/{run-id}/tasks.json` |

**Always use absolute paths.** Relative paths break when agents change working directory.

---

## Error Handling Scenarios

| Scenario | Response |
|----------|----------|
| Agent timeout | Retry once; if still failing, mark task as `failed` and continue with partial results |
| Data conflict | Log conflict to `_workspace/{run-id}/conflicts.md`; prefer most recent update |
| Missing output | Warn in summary; do not block final integration |
| Team communication failure | Fall back to file-based coordination via shared `_workspace/` |
