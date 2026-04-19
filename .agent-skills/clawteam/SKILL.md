---
name: clawteam
description: >
  Route ClawTeam operator requests into the right mode before touching commands:
  manual team control, one-command template launch, monitoring/recovery, or
  provider/runtime profile setup. Use when the user explicitly wants the ClawTeam
  task/inbox/worktree swarm workflow for parallel developer work, fullstack
  delivery, product/ops research teams, marketing/content studios, or game and
  simulation squads. Not for generic multi-agent routing when `jeo`, `omc`,
  `omx`, `ohmg`, `vibe-kanban`, or simple subtask delegation already fit.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: MIT
metadata:
  tags: clawteam, multi-agent, swarm, orchestration, tmux, git-worktree, autonomous, python, routing
  version: "1.1"
  source: https://github.com/HKUDS/ClawTeam
---

# clawteam — ClawTeam operator router

Use this skill when the user explicitly wants **ClawTeam itself** — not just any multi-agent workflow.

`clawteam` owns the ClawTeam-specific operator surface:
- leader + worker teams
- git worktree isolation
- task / inbox state
- tmux or subprocess spawn backends
- board / web UI monitoring
- template launches
- provider profiles and presets

Read these support docs before choosing a path:
- [references/operator-modes-and-route-outs.md](references/operator-modes-and-route-outs.md)
- [references/architecture.md](references/architecture.md)
- [references/agent-types.md](references/agent-types.md)
- [references/use-cases.md](references/use-cases.md)

## When to use this skill
- The user says `clawteam`, `agent swarm`, `spawn agents`, or wants ClawTeam's team/task/inbox model.
- One leader should coordinate multiple CLI agents with explicit task ownership.
- The user wants worktree-isolated parallel implementation, research, or analysis workers.
- The user wants ClawTeam monitoring surfaces such as `board attach`, `board serve`, or task/inbox inspection.
- The user needs ClawTeam runtime setup for non-default providers/models via `profile` and `preset`.
- The job spans developer workflow, web/fullstack, product/ops, marketing/content, or game/team simulation work **and** the chosen execution surface is ClawTeam.

## When not to use this skill
- **The user only wants a generic integrated delivery loop with planning + implementation + QA** → `jeo`, `omc`, `omx`, or `ohmg`.
- **The main job is board/work queue control, not ClawTeam runtime control** → `vibe-kanban`.
- **The main job is lightweight subtask fan-out without team/task/inbox/worktree state** → use built-in delegation / subagents instead.
- **The main job is repo planning or approval gates** → `task-planning`, `plannotator`, or `ralph`.
- **The user wants a broader multi-agent framework comparison rather than ClawTeam operation** → `survey`.

## Instructions

### Step 1: Classify one operating mode
Start with one primary mode.

```yaml
clawteam_mode:
  primary_mode: manual-team | launch-template | monitor-recover | profile-setup
  backend: tmux | subprocess | unknown
  audience: developer-workflow | web-fullstack | product-ops | marketing-content | game-simulation | mixed
  runtime_need: team-state | quick-launch | visibility | provider-setup
  confidence: high | medium | low
```

Choose only one primary mode first:
- `manual-team` — explicit team lifecycle, worker spawning, tasks, inboxes, board use
- `launch-template` — one-command template/team launch
- `monitor-recover` — inspect teams, workers, board state, inbox/task flow, runtime caveats
- `profile-setup` — presets, profiles, provider/model/runtime configuration

### Step 2: Verify the minimal prerequisites
Check what already works **before** wrapping it with ClawTeam.

```bash
python3 --version

tmux -V
clawteam --help

# Replace with the real agent command the user wants to run:
claude --version
codex --version
```

Rules:
1. If the underlying agent CLI fails by itself, do not pretend `clawteam spawn` will fix it.
2. Prefer `tmux` when the user wants live monitoring and interactive panes.
3. Prefer `subprocess` when tmux is unavailable or when headless/background execution is the real need.
4. If provider/model customization matters, route to **profile-setup** before large spawn examples.

### Step 3: Use the right command family for the chosen mode

#### Mode A — manual team control
Use this when the user wants explicit ownership over team lifecycle, workers, tasks, and inboxes.

```bash
# 1. Create the team
clawteam team spawn-team my-team -d "Build the auth module" -n leader

# 2. Spawn workers (tmux backend examples)
clawteam spawn tmux claude --team my-team --agent-name architect --task "Design the API schema"
clawteam spawn tmux claude --team my-team --agent-name backend --task "Implement the auth flow"
clawteam spawn tmux codex  --team my-team --agent-name tester   --task "Write integration tests"

# 3. Create and update tasks
clawteam task create my-team "Design API schema" -o architect
clawteam task create my-team "Implement auth flow" -o backend
clawteam task create my-team "Write integration tests" -o tester --blocked-by 2
clawteam task list my-team --owner backend
clawteam task update my-team 2 --status in_progress
clawteam task update my-team 2 --status completed

# 4. Coordinate via inbox
clawteam inbox send my-team backend "Wait for architect handoff before finalizing handlers"
clawteam inbox receive my-team

# 5. Watch progress
clawteam board attach my-team
# or
clawteam board serve --port 8080
```

Prefer this mode when users need **explicit worker roles, manual dependency control, or mixed agent types**.

#### Mode B — launch a prebuilt template
Use this when the user wants a fast start and the template shape already fits.

```bash
# Discover available templates
clawteam template list

# Launch a built-in team
clawteam launch hedge-fund --team fund1 --goal "Analyze AAPL, MSFT, NVDA for Q2 2026"

# Then monitor it
clawteam board attach fund1
# or
clawteam board serve --port 8080
```

Prefer this mode when the user says things like:
- "Use the built-in team"
- "Launch the hedge-fund / research template"
- "I want one command, then I just watch"

#### Mode C — monitor, inspect, and recover
Use this when a team already exists or the question is operational.

```bash
clawteam team discover
clawteam team status my-team
clawteam board show my-team
clawteam board live my-team --interval 3
clawteam board attach my-team
clawteam board serve --port 8080
clawteam task list my-team --status blocked
clawteam inbox peek my-team
clawteam workspace list my-team
clawteam lifecycle idle my-team
```

Reality checks:
- Do not oversell long-running worker persistence. Upstream issue #148 documents worker keepalive / ongoing-job failures in some subprocess flows.
- Do not assume agent-definition/config features are fully applied without verification. Upstream issue #146 documents gaps between parsed definitions and runtime behavior.
- If the question becomes broader runtime debugging or platform comparison, route to `survey` or the relevant orchestration/runtime skill instead of expanding this skill endlessly.

#### Mode D — provider/runtime profile setup
Use this when the real problem is **which provider/model/runtime configuration should ClawTeam use?**

```bash
# Inspect built-in presets
clawteam preset list
clawteam preset show moonshot-cn

# Generate reusable runtime profiles
clawteam preset generate-profile moonshot-cn claude --name claude-kimi
clawteam preset generate-profile minimax-global claude --name claude-minimax

# Interactive setup + health checks
clawteam profile wizard
clawteam profile doctor claude
MOONSHOT_API_KEY=*** clawteam profile test claude-kimi

# Spawn using the profile
clawteam spawn tmux --profile claude-kimi --team my-team --agent-name researcher --task "Compare onboarding flows"
```

Prefer this mode when the user mentions:
- custom providers/models
- non-default gateways
- fresh-machine setup
- preset/profile generation
- provider-specific failures before spawn

### Step 4: Keep the boundary honest
Before finalizing instructions, check that `clawteam` still owns the job.

Keep it inside `clawteam` when the user needs:
- ClawTeam CLI commands
- team/task/inbox/worktree state
- template launches
- ClawTeam board/runtime visibility
- provider profiles tied to ClawTeam spawn

Route outward when the user mainly needs:
- generic multi-agent repo delivery → `jeo`, `omc`, `omx`, `ohmg`
- planning / decomposition → `task-planning`
- visual coding board control → `vibe-kanban`
- tool/platform comparison → `survey`

### Step 5: Return the smallest useful operator packet
Default shape:

```markdown
# ClawTeam Operator Packet

## Mode
- Primary mode:
- Why it fits:
- Backend:

## Preconditions
- Verified:
- Missing / risky:

## Commands
1. ...
2. ...
3. ...

## Monitoring / verification
- ...

## Caveats
- ...

## Route-outs kept out of scope
- ...
```

## Examples

### Example 1: Fullstack feature split
**Input**
> Use ClawTeam to split a full-stack feature across multiple agents.

**Good output direction**
- choose `manual-team`
- create the team first with `team spawn-team`
- spawn architect/backend/tester workers with `spawn tmux ...`
- use `task create` / `task update`
- finish with `board attach` or `board serve`

### Example 2: One-command launch
**Input**
> Launch a prebuilt ClawTeam team for market analysis and let me watch it.

**Good output direction**
- choose `launch-template`
- use `template list` if needed
- use `launch hedge-fund --team ... --goal ...`
- monitor with `board attach` or `board serve`

### Example 3: Provider setup first
**Input**
> I want ClawTeam to run Claude through a non-default provider model.

**Good output direction**
- choose `profile-setup`
- use `preset list/show`, `preset generate-profile`, `profile doctor/test`
- only then show `spawn tmux --profile ...`

### Example 4: Honest route-out
**Input**
> I just need a generic multi-agent implementation loop with planning and QA.

**Good output direction**
- route away from `clawteam`
- recommend `jeo`, `omc`, `omx`, or `ohmg`
- explain that `clawteam` is the ClawTeam CLI operator surface, not the generic router for every orchestration ask

## Best practices
1. Pick one operating mode first instead of dumping every ClawTeam command.
2. Verify the underlying agent CLI before wrapping it in `spawn`.
3. Prefer `tmux` for visible interactive teams and `subprocess` for headless cases.
4. Use `launch` when a template truly fits; use `manual-team` when ownership and dependencies must be explicit.
5. Treat provider/model setup as its own path via `preset` and `profile`.
6. Keep long-running worker claims honest; note upstream caveats when persistence matters.
7. Keep `clawteam` distinct from generic orchestration, planning, and board-control skills.
8. Update compact and discovery surfaces when the trigger wording changes materially.

## References
- [ClawTeam README](https://github.com/HKUDS/ClawTeam)
- [PyPI: clawteam](https://pypi.org/project/clawteam/)
- [references/operator-modes-and-route-outs.md](references/operator-modes-and-route-outs.md)
- [references/architecture.md](references/architecture.md)
- [references/agent-types.md](references/agent-types.md)
- [references/use-cases.md](references/use-cases.md)
