# ClawTeam operator modes and route-outs

Start with [intake-packets-and-route-outs.md](intake-packets-and-route-outs.md) when you need the fastest packet choice. Use this document when the packet is already known and you want the more detailed mode table.

## Choose one mode first

| Mode | Use when | Core commands | Do not blur into |
|------|----------|---------------|------------------|
| `manual-team` | The user wants explicit team creation, worker roles, tasks, inboxes, and dependency control | `team spawn-team`, `spawn`, `task create/update/list`, `inbox send/receive`, `board attach/serve` | generic orchestration wrappers, planning, board-only tools |
| `launch-template` | The user wants a one-command prebuilt team | `template list`, `launch <template> --team ... --goal ...` | manual lifecycle walkthroughs unless needed after launch |
| `monitor-recover` | A team already exists and the job is visibility, inspection, or runtime recovery | `team discover/status`, `board show/live/attach/serve`, `task list`, `inbox peek/receive`, `workspace list`, `lifecycle idle` | generic debugging or platform-comparison work |
| `profile-setup` | Provider/model/runtime config is the real blocker | `preset list/show`, `preset generate-profile`, `profile wizard/doctor/test` | huge spawn examples before runtime health is proven |

## Route-outs

Use another skill when the job is mainly:
- integrated planning → execution → QA orchestration: `jeo`, `omc`, `omx`, `ohmg`
- planning and decomposition: `task-planning`
- board/work queue control outside ClawTeam: `vibe-kanban`
- cross-platform landscape research or tool comparison: `survey`
- lightweight parallel subtasks without team/task/inbox/worktree state: built-in delegation/subagents

## Backend choice

| Backend | Use when | Notes |
|---------|----------|-------|
| `tmux` | You want visible workers, tiled monitoring, and the usual interactive ClawTeam experience | Preferred default for most developer/operator flows |
| `subprocess` | You need headless execution, non-interactive workers, or tmux is unavailable | Keep caveats explicit; long-running/keepalive flows may be fragile |

## Reality notes
- Upstream issue #148 documents worker keepalive problems for ongoing-job subprocess flows. Do not present long-running workers as guaranteed.
- Upstream issue #146 documents agent-definition/config application gaps. Verify behavior instead of assuming all parsed config fields are honored.
- If the user wants ClawTeam because of the explicit team/task/inbox/worktree contract, stay in this skill. If they only want "multiple agents," route outward.
