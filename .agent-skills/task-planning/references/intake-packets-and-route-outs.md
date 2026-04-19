# Intake Packets and Route-outs

Use this sheet at the start of every `task-planning` run.

## Choose one intake packet

### `backlog-cleanup`
Use when the input is a pile of vague, duplicated, or mixed-quality work.

Keep:
- dedupe / merge notes
- ready vs not-ready separation
- missing scope / design / owners / approvals
- one recommendation about what is ready now, what needs grooming, and what needs discovery

### `feature-slice`
Use when one feature, bug cluster, or change request needs assignable slices.

Keep:
- smallest meaningful delivery slices
- clear system/workflow boundaries
- acceptance criteria and dependencies
- verification and follow-through slices

### `sprint-candidate`
Use when the job is preparing the next iteration's realistic ready work.

Keep:
- readiness
- blockers
- owner-role clarity
- sequencing and parallelism
- one recommendation about what is ready now vs later

### `release-packet`
Use when the request is tied to a launch, rollout, campaign, or go-live window.

Keep:
- trigger date / event / freeze point
- creation, approval, distribution, verification, and reporting slices
- critical dependencies
- launch-day checks and fallback actions

### `milestone-packet`
Use when work crosses disciplines and converges on a demo, event, or milestone.

Keep:
- code/system work
- content/polish work
- QA/playtest/build/distribution work
- must-have vs stretch scope
- milestone gates and fallback scope

### `discovery-first`
Use when the user wants a plan but the evidence is too thin to commit cleanly.

Keep:
- unanswered questions
- validation tasks
- prerequisite decisions
- missing artifacts or external inputs
- one handoff back into `task-planning` once uncertainty drops

## Route-outs to keep explicit

| If the request is mainly about... | Route to |
|---|---|
| sizing, story points, t-shirt sizing, forecast language | `task-estimation` |
| board setup, worktrees, queue control, active-task flow | `vibe-kanban` |
| reviewing or approving the plan itself | `plannotator` |
| daily blockers, status, and sync cadence | `standup-meeting` |
| retrospective learning after execution | `sprint-retrospective` |
| early concept framing, strategy shaping, problem framing | `bmad` or `bmad-idea` |
| broad game-production orchestration before slice detail | `bmad-gds` |
| launch messaging, campaign content depth, lifecycle automation | `marketing-automation` |

## Smell checks
- If you are assigning points, you are drifting into `task-estimation`.
- If you are opening boards/worktrees/queues, you are drifting into `vibe-kanban`.
- If you are annotating or approving the plan itself, you are drifting into `plannotator`.
- If the output reads like a standup or retro, you are in the wrong lane.
- If the packet still depends on unresolved concept or strategy questions, route back to `bmad`, `bmad-idea`, or `bmad-gds` first.
