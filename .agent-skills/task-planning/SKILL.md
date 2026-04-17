---
name: task-planning
description: >
  Turn vague features, bugs, roadmap items, launch work, or playtest findings into
  execution-ready planning packets with horizon choice, slice boundaries,
  dependencies, acceptance criteria, blocker visibility, and a clear next move.
  Use when the user needs backlog grooming, sprint or milestone preparation,
  roadmap-to-delivery translation, release slicing, or a "what should we actually
  do next?" planning pass across developer workflow, web/fullstack, product/ops,
  marketing/GTM, or game work. Route sizing-only asks to `task-estimation`, board
  control to `vibe-kanban`, plan review to `plannotator`, daily status to
  `standup-meeting`, and retrospective learning to `sprint-retrospective`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, issue lists, specs, PRDs, GDDs, launch notes, playtest
  feedback, or chat context that must become a compact execution packet. This is a
  planning and decomposition workflow, not the long-term system of record.
license: MIT
metadata:
  tags: task-planning, backlog-grooming, sprint-planning, milestone-planning, roadmap-slicing, feature-breakdown, launch-planning, game-development
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0.0"
  source: akillness/oh-my-skills
  modernization: 2026-04-12
  hardening: 2026-04-18
---

# Task Planning

Use this skill when the job is **turning messy context into a small, actionable planning packet**.

`task-planning` is the project-management anchor for:
- backlog cleanup before commitment
- feature and bug-cluster decomposition
- sprint-candidate preparation
- release and launch slicing
- milestone planning across product, GTM, and game work
- separating discovery from delivery before estimation, board setup, or execution

Read these support docs before choosing the mode or boundary:
- [references/modes-and-handoffs.md](references/modes-and-handoffs.md)
- [references/packet-shapes.md](references/packet-shapes.md)
- [references/planning-patterns.md](references/planning-patterns.md)
- [references/readiness-checklist.md](references/readiness-checklist.md)

## When to use this skill
- A request is too vague, too large, or too mixed to hand straight to implementation.
- A backlog needs to be cleaned up into ready vs not-ready work.
- A roadmap item, feature, bug cluster, launch beat, or playtest finding needs execution slices.
- A team needs one compact packet that names dependencies, blockers, and acceptance criteria.
- A project spans multiple disciplines such as frontend/backend, PM/ops, GTM/content, or code/content/playtest/game-launch work.
- You need the next action to be explicit: start implementation, run discovery, groom with owners, estimate, or defer.

## When not to use this skill
- **The main job is sizing, forecasting, or story-point work** → `task-estimation`.
- **The tasks already exist and the real job is board/worktree/queue control** → `vibe-kanban`.
- **The plan already exists and the real job is review/approval or rendered diff feedback** → `plannotator`.
- **The main job is daily status coordination** → `standup-meeting`.
- **The main job is reflection on completed work** → `sprint-retrospective`.
- **The real work is still pre-planning idea shaping or game-production orchestration** → `bmad`, `bmad-idea`, or `bmad-gds` first.

## Instructions

### Step 1: Classify one primary planning mode
Normalize the request before decomposing it.

```yaml
task_planning_mode:
  primary_mode: backlog-cleanup | feature-slice | sprint-candidate | release-slice | milestone-plan | discovery-first
  domain: developer-workflow | web-fullstack | product-ops | marketing-gtm | game-development | mixed
  source_material: repo/issues | prd/spec | gdd/playtest | launch-notes | chat-context | mixed | unknown
  readiness_state: mostly-ready | mixed | mostly-fuzzy
  output_shape: single-packet | slice-table-plus-not-ready | milestone-packet | release-packet | unknown
```

Use one primary mode per run:
- `backlog-cleanup` → clarify, dedupe, and separate ready from not-ready work
- `feature-slice` → turn one feature or bug cluster into assignable slices
- `sprint-candidate` → prepare the next iteration's ready work
- `release-slice` → shape launch, rollout, or campaign work
- `milestone-plan` → coordinate cross-discipline milestone work, especially for games
- `discovery-first` → expose unknowns before pretending implementation is ready

### Step 2: Gather the minimum credible evidence
Do not plan from vibes alone. Pull the smallest packet that supports decomposition:
- objective or problem statement
- user, business, team, or player outcome
- current artifacts: issues, PRD, spec, GDD, notes, playtest feedback, launch notes, bug list
- timeline or trigger: next sprint, milestone, release, event, dependency window
- obvious constraints: owner, platform, environment, approvals, external dependencies
- missing details that could make the packet fake-ready

If details are thin, label assumptions explicitly and choose `discovery-first` instead of inventing certainty.

### Step 3: Split discovery from delivery early
Before making slices, ask whether the request contains unknowns that belong in discovery rather than implementation.

Default rule:
1. **Discovery** — unanswered questions, research, validation, missing decisions
2. **Foundation** — setup, architecture, shared assets, schema, tooling, environment
3. **Delivery** — user-facing or system-facing implementation slices
4. **Verification** — QA, analytics, reviews, smoke tests, playtests, launch checks
5. **Follow-through** — docs, enablement, rollout, monitoring, distribution, reporting

Do not bury research or missing decisions inside build tickets.

### Step 4: Choose the smallest packet shape
Use [references/packet-shapes.md](references/packet-shapes.md) and keep the output compact.

Rules:
- If the user needs one next action set, prefer a **single packet**.
- If the key need is ready vs not-ready triage, use **slice table plus not-ready list**.
- If the work is a launch or cross-functional window, use a **release packet**.
- If the work is milestone-heavy and cross-discipline, use a **milestone packet**.
- If the packet starts doing decomposition, estimation, board operations, and review at once, split the responsibilities and route outward.

### Step 5: Build slices with readiness fields
Every slice should have:
- title
- outcome
- owner role
- dependencies
- inputs required
- acceptance criteria
- risk / uncertainty
- ready? yes / no
- if not ready, what is missing?

Use short, testable acceptance criteria. Avoid vague statements like “works better” or “marketing improved.”

### Step 6: Surface sequencing and blockers
Before finalizing, explicitly name:
- what can run in parallel
- what must happen in order
- what is blocked
- what should be deferred

Use blocker buckets from [references/readiness-checklist.md](references/readiness-checklist.md):
- `missing-scope`
- `missing-design`
- `missing-data`
- `external-dependency`
- `environment-access`
- `approval-needed`
- `cross-team-handoff`

### Step 7: Run the boundary check
Use [references/modes-and-handoffs.md](references/modes-and-handoffs.md) before shipping the packet.

Verify:
1. The mode matches the real planning job.
2. Discovery is separated from implementation when confidence is low.
3. The packet does not silently absorb sizing, board control, plan approval, standup, or retro work.
4. Cross-domain nuance is preserved without turning the packet into a giant tutorial.
5. The output ends with one clear next move.

### Step 8: Return a brief or the finished planning packet
Preferred brief shape before full drafting:

```markdown
# Task Planning Brief

## Mode
- Primary mode:
- Domain:
- Why it fits:
- Output shape:

## Source material used
- Main evidence:
- Constraints / dependencies:
- Assumptions / gaps:

## Planned slices
1. slice
2. slice
3. slice

## Boundary notes
- Route-outs kept out of scope:
- Not-ready work that stays separate:
- Recommended next move:
```

If the user already asked for the final artifact, return a compact planning packet directly.

## Output format
Default packet shape:

```markdown
# Planning Packet

## Planning horizon
- Mode:
- Domain:
- Confidence: high | medium | low

## Goal
- ...

## Assumptions
- ...

## Work slices
| Slice | Outcome | Owner role | Dependencies | Ready? |
|------|---------|------------|--------------|--------|
| ... | ... | ... | ... | yes/no |

## Slice details
### 1. [Slice name]
- Inputs required:
- Acceptance criteria:
  - [ ] ...
- Risks / uncertainty:
- Notes:

## Sequencing
1. ...
2. ...

## Blockers / not-ready items
- Bucket:
- Missing:
- Next action:

## Recommended next move
- start implementation | run discovery first | groom with owners | estimate now | defer until dependency clears
```

## Examples

### Example 1: Fullstack feature slicing
**Input**
> Break down a new team-invite flow for our SaaS app. We need email invites, acceptance, and admin visibility before sprint planning.

**Good output direction**
- mode: `sprint-candidate`
- domain: `web-fullstack`
- split backend/data, invite acceptance flow, admin visibility, verification, and follow-through
- keep story points out of scope

### Example 2: Backlog cleanup
**Input**
> We have a pile of vague onboarding backlog items. Clean them up so we can see what is actually ready next week.

**Good output direction**
- mode: `backlog-cleanup`
- output shape: `slice-table-plus-not-ready`
- mark missing scope, ownership, or approvals explicitly
- separate discovery tickets from implementation tickets

### Example 3: Marketing / launch packet
**Input**
> Plan the next release push for our B2B launch: landing-page updates, email sequence, attribution checks, and launch-day reporting.

**Good output direction**
- mode: `release-slice`
- domain: `marketing-gtm`
- separate asset creation, review/approval, distribution, measurement, and reporting
- keep campaign copywriting depth routed to `marketing-automation`

### Example 4: Game milestone packet
**Input**
> Plan the next milestone for our roguelike demo: tutorial polish, controller support, and a streamer-ready build.

**Good output direction**
- mode: `milestone-plan`
- domain: `game-development`
- separate code/system work, content/polish, build/QA, and playtest/distribution concerns
- keep broader game-production orchestration routed to `bmad-gds` when needed

### Example 5: Boundary with boards and review
**Input**
> We already agreed on the tasks. Set up the kanban board, worktrees, and review queue.

**Good output direction**
- route to `vibe-kanban`
- explain that `task-planning` owns decomposition/readiness, not board control or PR queue management

## Best practices
1. Choose one primary planning mode before decomposing the work.
2. Keep discovery separate from delivery whenever requirements are unstable.
3. Prefer small, reviewable slices over broad work categories.
4. Surface blockers and missing inputs explicitly instead of burying them in notes.
5. Preserve domain nuance for web/fullstack, product/ops, marketing/GTM, and game work without bloating the front door.
6. Route sizing, board control, review, daily cadence, and retrospectives out instead of stretching the skill boundary.
7. Keep the packet compact enough that a team can act on it immediately.
8. Update compact and manifest discovery surfaces when the role wording changes materially.

## References
- [Atlassian — Backlog refinement](https://www.atlassian.com/agile/scrum/backlog-refinement)
- [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)
- [Azure Boards backlogs](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/?view=azure-devops)
- [GitLab issue boards](https://docs.gitlab.com/user/project/issue_board/)
