# Board Packets and Surface Selection

Use this packet when the operator is not deciding **whether** to use `vibe-kanban`, but **how** to shape the board once a coding-board workflow is justified.

## Choose the board packet
| Packet | Use when | Required fields | Route out when |
|---|---|---|---|
| Parallel coding cards | Several independent coding tasks can run without stepping on each other | repo, base branch, one bounded outcome per card, assigned agent, review surface | the tasks are still one giant epic |
| Agent comparison | Two agents should attack the same bounded task independently | comparison question, identical task contract, separate branches/workspaces, explicit decision rule | the operator only wants plan review |
| Review queue | The hard part is no longer execution, but judging retries vs approval across active cards | review owner, evidence source, retry policy, PR handoff rule | there is no real board lifecycle |
| Tracker sync | GitHub Projects / Linear / Jira remains the source of truth, but coding workspaces still need a control plane | tracker item link, coding task scope, workspace owner, cleanup owner | the external tracker alone is enough |

## Recommended surface choices
| Decision | Good default | Why |
|---|---|---|
| Card scope | one bounded coding task | keeps retries, review, and cleanup cheap |
| Review surface | board-then-PR | fast local iteration without losing durable review history |
| Workspace isolation | one branch/worktree per active card | reduces collisions and blame confusion |
| Active parallelism | only as many cards as one reviewer can realistically absorb | review is usually the real bottleneck |
| Tracker relationship | keep the tracker canonical, let `vibe-kanban` own coding execution state | prevents a second PM system from taking over |

## Practical intake fields
Before opening or syncing a card, capture:
- exact goal and acceptance checks
- repo and base branch
- agent selection
- review surface (`board-first`, `PR-first`, or `board-then-PR`)
- cleanup owner
- tracker link if an external board remains canonical

## Common failure modes
- **Board opened too early**: the work was still an epic or planning discussion.
- **Parallelism outran review**: several cards were active, but nobody could compare diffs fast enough.
- **Tracker confusion**: status drifted between GitHub/Linear/Jira and the board.
- **Cleanup skipped**: stale `vk/*` branches, worktrees, or preview servers accumulated.

## Route-outs to keep honest
- planning and approval before coding → `task-planning`, `survey`, `plannotator`, `jeo`
- code review without a real board lifecycle → `code-review`
- exact rendered-UI/browser work → `agentation`, `browser-harness`, `playwriter`
- PM rituals or roadmap coordination → PM skills
- marketing/content approvals → `marketing-automation`
- non-code milestone / launch planning in games → `bmad-gds`
