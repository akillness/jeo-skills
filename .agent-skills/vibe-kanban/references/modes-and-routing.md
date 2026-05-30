# Vibe Kanban Modes and Routing

Use this note when deciding whether `vibe-kanban` is the right surface.

## Core rule
`vibe-kanban` is for **coding-task orchestration with a visible board, isolated workspaces, human review, retries, and PR handoff**.

If the real need is missing one of those pieces, another skill is usually a better fit.

## Modes
| Mode | Use when | Primary value | Common route-outs |
|---|---|---|---|
| Coding board | Several bounded coding tasks need card/workspace control | Board + worktree isolation + review queue | direct coding skill if only one task exists |
| Review queue | Work is already running but human review/retry choice is the bottleneck | Visible review state and evidence-based retries | `code-review` if there is no board lifecycle |
| Agent comparison | Two agents should attack one bounded task independently | Side-by-side diff comparison before choosing a PR | `plannotator` if the work is still plan review only |
| Tracker sync | Board status should mirror a repo/task system | Shared control plane plus external tracking | Existing tracker-only workflow if board adds no value |

## Route-outs
- **Planning before coding** → `task-planning`, `survey`, `plannotator`
- **Single-agent coding run** → direct coding/orchestration skill
- **Browser review / exact UI feedback** → `agentation`, `browser-harness`, `playwriter`
- **PM-only rituals** → `task-planning`, `standup-meeting`, `sprint-retrospective`
- **Marketing/content coordination** → `marketing-automation`
- **Game-production planning without coding workspaces** → `bmad-gds`

## Smell tests
If any of these are true, the board is probably premature:
- the task is one giant epic with no real card boundaries
- the operator cannot review the resulting diffs
- there is no repo or branch context yet
- the request is mostly about docs, campaigns, or status meetings
- the operator only wants a checklist, not a workspace control plane
