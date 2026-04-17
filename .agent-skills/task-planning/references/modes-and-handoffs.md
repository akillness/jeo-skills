# Modes and Handoffs

## Primary planning modes

### `backlog-cleanup`
Use when the input is a pile of vague, duplicated, or mixed-quality work.

Focus on:
- deduping and clarifying items
- separating ready vs not-ready
- identifying missing scope, design, owners, or approvals
- keeping discovery tasks separate from implementation tasks

### `feature-slice`
Use when one feature, bug cluster, or change request needs assignable slices.

Focus on:
- smallest meaningful delivery slices
- system or workflow boundaries
- acceptance criteria and dependencies
- verification and follow-through slices

### `sprint-candidate`
Use when the job is preparing work for the next sprint/iteration.

Focus on:
- readiness
- blockers
- owner-role clarity
- sequencing and parallel work
- one recommendation about what is ready now vs later

### `release-slice`
Use when the request is tied to a launch, campaign, rollout, or release window.

Focus on:
- timing and external deadlines
- approval checkpoints
- distribution, rollout, or communications dependencies
- analytics, reporting, and launch-day checks

### `milestone-plan`
Use when the work crosses disciplines and converges on a milestone, demo, or event.

Focus on:
- code/system work
- content/polish work
- QA/playtest/build/distribution work
- milestone gates and must-have vs nice-to-have boundaries

### `discovery-first`
Use when the user wants planning but the evidence is too thin to commit cleanly.

Focus on:
- unanswered questions
- validation tasks
- prerequisite decisions
- missing artifacts or external inputs

## Boundary handoffs

| If the request is mainly about... | Use |
|---|---|
| sizing, story points, forecasting, estimate language | `task-estimation` |
| board setup, worktrees, review queues, active-task control plane | `vibe-kanban` |
| reviewing / approving a plan or diff | `plannotator` |
| daily status, blockers, and coordination cadence | `standup-meeting` |
| retrospective learning and follow-through after work is done | `sprint-retrospective` |
| early idea shaping before decomposition | `bmad` or `bmad-idea` |
| game-production orchestration across broader milestone lanes | `bmad-gds` |
| campaign copy, messaging, launch content, or lifecycle automation depth | `marketing-automation` |

## Boundary smell checks
- If you are assigning points, you are drifting toward `task-estimation`.
- If you are opening boards/worktrees/queues, you are drifting toward `vibe-kanban`.
- If you are annotating or approving the plan itself, you are drifting toward `plannotator`.
- If the output reads like a standup or retro, you are in the wrong lane.
- If the packet still depends on unresolved strategy or concept definition, route back to `bmad`, `bmad-idea`, or `bmad-gds` first.
