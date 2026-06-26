---
name: clawteam
description: ">"
license: MIT
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: clawteam, multi-agent, swarm, orchestration, tmux, git-worktree, autonomous, python, routing
  version: 1.2
  source: "https://github.com/HKUDS/ClawTeam"
---






# clawteam — ClawTeam runtime operator router

Use this skill when the real question is **"which ClawTeam operator packet do I need right now?"**

`clawteam` owns the **ClawTeam-specific runtime surface**:
- team / task / inbox state
- worker spawning through `tmux` or `subprocess`
- workspace or git-worktree isolation
- board visibility and recovery flows
- template launches
- provider / preset / profile setup tied to spawn behavior

It does **not** own generic multi-agent orchestration, board governance, or lightweight subtask fan-out.

Read these support docs before stretching the boundary:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/operator-modes-and-route-outs.md](references/operator-modes-and-route-outs.md)
- [references/architecture.md](references/architecture.md)
- [references/agent-types.md](references/agent-types.md)
- [references/use-cases.md](references/use-cases.md)

## When to use this skill
- The user explicitly says `clawteam` or clearly wants ClawTeam's team/task/inbox/worktree runtime
- A leader should coordinate named workers with explicit task ownership and message passing
- The user wants ClawTeam board commands such as `board attach`, `board live`, or `board serve`
- The user wants a built-in ClawTeam template launch
- The real blocker is provider/model/profile setup *inside ClawTeam* before spawn
- The workflow spans developer delivery, product/ops research, content operations, or game work **and** the chosen runtime is ClawTeam

## When not to use this skill
- **Generic multi-agent implementation loop with planning + QA** → `jeo`, `omc`, `omx`, or `ohmg`
- **Board/work queue control outside the ClawTeam runtime** → `vibe-kanban`
- **Lightweight parallel subtasks with no team/task/inbox/worktree state** → built-in delegation / subagents
- **Planning or decomposition** → `task-planning`
- **Tool comparison or platform survey** → `survey`

## Instructions

### Step 1: Start from the packet already in hand
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Normalize the request into one packet first:

```yaml
clawteam_packet:
  primary_packet: manual-team | template-launch | monitor-recover | profile-setup | route-out
  backend: tmux | subprocess | unknown
  audience: developer-workflow | product-ops | marketing-content | game-production | mixed
  current_pain: ownership-split | quick-start | stuck-runtime | provider-setup | wrong-tool
  confidence: high | medium | low
```

Choose one primary packet only:
- `manual-team` — explicit team lifecycle, worker roles, tasks, inboxes, dependencies
- `template-launch` — launch a prebuilt ClawTeam team and monitor it
- `monitor-recover` — inspect a running/stuck team, board, inbox, tasks, workspaces, or lifecycle state
- `profile-setup` — preset/profile/provider/model/runtime setup before spawn
- `route-out` — the request is not really about ClawTeam's runtime

Rule: if the user really means “multiple agents” rather than “ClawTeam,” route out immediately.

### Step 2: Verify the minimal runtime before giving deeper commands
Check what already works **before** assuming ClawTeam will smooth it over.

```bash
python3 --version
clawteam --help

tmux -V

# Replace with the agent CLI the user actually wants to run:
claude --version
codex --version
```

Rules:
1. If the underlying agent CLI does not work by itself, do not pretend `clawteam spawn` will fix it.
2. Prefer `tmux` for visible interactive workers and live operator control.
3. Prefer `subprocess` only when headless/background execution is the real need.
4. If provider/model customization is the blocker, choose `profile-setup` before large spawn examples.

### Step 3: Return the smallest useful command packet

#### Packet A — manual-team
Use this when ownership and dependencies must stay explicit.

```bash
clawteam team spawn-team my-team -d "Build the auth module" -n leader
clawteam spawn tmux claude --team my-team --agent-name architect --task "Design the API schema"
clawteam spawn tmux codex --team my-team --agent-name tester --task "Write integration tests"
clawteam task create my-team "Design the API schema" -o architect
clawteam inbox send my-team tester "Wait for API handoff before final checks"
clawteam board attach my-team
```

Use [references/use-cases.md](references/use-cases.md) if the user needs fuller examples for fullstack, research, content, or game-production splits.

#### Packet B — template-launch
Use this when a built-in template already matches the job.

```bash
clawteam template list
clawteam launch hedge-fund --team fund1 --goal "Analyze AAPL, MSFT, NVDA for Q2 2026"
clawteam board attach fund1
```

Do **not** bury this in a full manual-team walkthrough unless the template clearly fails to fit.

#### Packet C — monitor-recover
Use this when a team already exists or runtime truth is the real question.

```bash
clawteam team discover
clawteam team status my-team
clawteam board show my-team
clawteam task list my-team --status blocked
clawteam inbox peek my-team
clawteam workspace list my-team
```

Use this packet to inspect stuck workers, blocked tasks, missing inbox activity, or workspace drift.

#### Packet D — profile-setup
Use this when the runtime/provider setup is the actual blocker.

```bash
clawteam preset list
clawteam preset show moonshot-cn
clawteam preset generate-profile moonshot-cn claude --name claude-kimi
clawteam profile doctor claude
MOONSHOT_API_KEY=*** clawteam profile test claude-kimi
clawteam spawn tmux --profile claude-kimi --team my-team --agent-name researcher --task "Compare onboarding flows"
```

Use this packet before large team examples when the question is really about provider/model/runtime configuration.

### Step 4: Keep the runtime reality honest
ClawTeam-style workflows are still operator-heavy.

State these realities when relevant:
- `tmux` + worktree/session inspection is often part of the real workflow, not an implementation detail
- long-running worker persistence may be fragile in some flows; do not oversell it
- trust prompts, permission flows, and backend-specific quirks can still leak through the abstraction
- manual cleanup, merge, or workspace hygiene may still matter after a run

Important upstream caveats:
- issue #148 documents worker keepalive problems in ongoing-job subprocess patterns
- issue #146 documents gaps between parsed agent definitions/configs and applied runtime behavior

If the user wants generic orchestration policy, board governance, or lightweight built-in delegation, route outward instead of growing this skill.

### Step 5: Return one concise operator brief
Preferred format:

```markdown
# ClawTeam Operator Brief

## Packet
- Packet:
- Why it fits:
- Backend:

## Preconditions
- Verified:
- Missing / risky:

## Commands
1. ...
2. ...
3. ...

## Monitoring / recovery
- ...

## Caveats
- ...

## Route-outs kept out of scope
- ...
```

Short, truthful packets beat giant command dumps.

## Examples

### Example 1: Fullstack feature split
**Input**
> Use ClawTeam to split a full-stack feature across a leader and two workers.

**Good output direction**
- choose `manual-team`
- verify the runtime and worker CLI first
- create the team, spawn workers, create explicit tasks, and end with a board command
- keep planning/review policy outside this skill

### Example 2: Template first
**Input**
> Launch a built-in ClawTeam team and let me watch it.

**Good output direction**
- choose `template-launch`
- use `template list` if needed
- use `launch ... --team ... --goal ...`
- monitor with `board attach` or `board serve`

### Example 3: Runtime recovery
**Input**
> A ClawTeam worker keeps dying after its first turn. What should I check?

**Good output direction**
- choose `monitor-recover`
- inspect team, board, task, inbox, and workspace state
- mention that long-running worker persistence is not guaranteed in every flow
- avoid pretending a generic orchestration skill owns the problem

### Example 4: Honest route-out
**Input**
> I just need a generic multi-agent implementation loop with planning and QA.

**Good output direction**
- choose `route-out`
- recommend `jeo`, `omc`, `omx`, or `ohmg`
- explain that `clawteam` is the ClawTeam runtime/operator surface, not the generic answer to every multi-agent request

## Best practices
1. Pick one packet first instead of dumping every ClawTeam command family.
2. Verify the underlying agent CLI and backend before spawning workers.
3. Prefer `tmux` for visible operator control; use `subprocess` only when headless execution is the real need.
4. Use template launch only when the built-in archetype actually fits.
5. Treat provider/profile setup as its own path.
6. Keep worker persistence and config-application caveats explicit.
7. Keep `clawteam` distinct from orchestration routers, planning skills, and board-governance tools.
8. Update compact and discovery surfaces when the trigger wording changes materially.

## References
- [ClawTeam README](https://github.com/HKUDS/ClawTeam)
- [PyPI: clawteam](https://pypi.org/project/clawteam/)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/operator-modes-and-route-outs.md](references/operator-modes-and-route-outs.md)
- [references/architecture.md](references/architecture.md)
- [references/agent-types.md](references/agent-types.md)
- [references/use-cases.md](references/use-cases.md)
