---
name: task-planning
description: >
  Turn vague features, bug clusters, roadmap items, launch work, or playtest findings
  into one execution-ready planning packet by choosing the right packet type,
  separating discovery from delivery, and making blockers, dependencies, and the next
  move explicit. Use when the user needs backlog cleanup, feature slicing, sprint or
  milestone prep, release planning, or roadmap-to-delivery translation across
  developer workflow, web/fullstack, product/ops, marketing/GTM, or game work. Route
  sizing to `task-estimation`, board/worktree control to `vibe-kanban`, plan review
  to `plannotator`, daily syncs to `standup-meeting`, retros to
  `sprint-retrospective`, and pre-planning concept framing to `bmad`, `bmad-idea`, or
  `bmad-gds`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, issue lists, specs, PRDs, GDDs, launch notes, playtest
  feedback, or chat context that must become a compact execution packet. This is a
  planning and decomposition workflow, not the long-term system of record.
license: MIT
metadata:
  tags: task-planning, backlog-grooming, sprint-planning, milestone-planning, roadmap-slicing, feature-breakdown, launch-planning, game-development
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  source: akillness/jeo-skills
  modernization: 2026-04-12
  hardening: 2026-04-18
  ratchet: 2026-04-20
---

# Task Planning

Use this skill when the job is **turning messy context into one small planning packet that a team can actually act on**.

`task-planning` is the PM front door for backlog cleanup, feature decomposition, sprint-candidate prep, release slicing, milestone packets, and roadmap-to-delivery translation before estimation, boards, review, or execution.

Core references:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/packet-shapes.md](references/packet-shapes.md)
- [references/readiness-checklist.md](references/readiness-checklist.md)
- [references/planning-patterns.md](references/planning-patterns.md)

## When to use this skill
- The request is too vague, too large, or too mixed to hand straight to implementation.
- A backlog needs to be cleaned into ready vs not-ready work.
- A roadmap item, feature, bug cluster, launch beat, or playtest finding needs execution slices.
- A team needs one compact packet that names dependencies, blockers, and acceptance criteria.
- The packet spans multiple disciplines: frontend/backend, PM/ops, GTM/content, or code/content/build/playtest work.
- The key question is "what should we actually do next?" rather than "how big is it?" or "what board should we use?"

## When not to use this skill
- **The main job is sizing, forecasting, or story-point language** → `task-estimation`.
- **The work already exists and the real job is board/worktree/queue control** → `vibe-kanban`.
- **The plan already exists and the real job is review/approval or diff markup** → `plannotator`.
- **The main job is daily status coordination** → `standup-meeting`.
- **The main job is reflection on completed work** → `sprint-retrospective`.
- **The work is still concept framing, scope shaping, or game-production orchestration before decomposition** → `bmad`, `bmad-idea`, or `bmad-gds` first.

## Instructions

### Step 1: Choose one intake packet
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) and pick exactly one primary packet:

```yaml
task_planning_packet:
  packet: backlog-cleanup | feature-slice | sprint-candidate | release-packet | milestone-packet | discovery-first
  domain: developer-workflow | web-fullstack | product-ops | marketing-gtm | game-development | mixed
  source_material: repo/issues | prd/spec | gdd/playtest | launch-notes | chat-context | mixed | unknown
  readiness_state: mostly-ready | mixed | mostly-fuzzy
  output_shape: single-packet | slice-table-plus-not-ready | release-packet | milestone-packet | discovery-packet
```

Packet meanings:
- `backlog-cleanup` — clarify, dedupe, and separate ready from not-ready work.
- `feature-slice` — turn one feature or bug cluster into assignable slices.
- `sprint-candidate` — prepare the next iteration's ready work.
- `release-packet` — shape launch, rollout, campaign, or go-live work.
- `milestone-packet` — coordinate cross-discipline milestone or demo work, especially for games.
- `discovery-first` — expose unknowns before pretending implementation is ready.

### Step 2: Gather the minimum credible evidence
Do not plan from vibes alone. Pull the smallest packet that supports decomposition:
- goal or problem statement
- user, business, team, or player outcome
- current artifacts: issues, spec/PRD, GDD, launch notes, playtest notes, bug list, or chat context
- timeline or trigger: sprint, release, milestone, event, or dependency window
- obvious constraints: owner, platform, environment, approvals, external dependencies
- missing details that could make the packet fake-ready

If evidence is thin, say so and choose `discovery-first` instead of inventing certainty.

### Step 3: Split discovery from delivery early
Before you write slices, separate:
1. **Discovery** — unanswered questions, validation, missing decisions
2. **Foundation** — setup, architecture, shared assets, tooling, environments
3. **Delivery** — user-facing or system-facing implementation slices
4. **Verification** — QA, analytics, review, smoke tests, playtests, launch checks
5. **Follow-through** — docs, enablement, rollout, reporting, monitoring, distribution

Do not bury research or unresolved decisions inside build tickets.

### Step 4: Choose the smallest packet shape
Use [references/packet-shapes.md](references/packet-shapes.md).

Rules:
- If the user needs one next-action set, prefer a **single packet**.
- If the main need is ready vs not-ready triage, use **slice table plus not-ready list**.
- If the work is tied to a launch window, use a **release packet**.
- If the work is milestone-heavy and cross-discipline, use a **milestone packet**.
- If the packet starts doing decomposition, estimation, board control, review, and ceremony work at once, split responsibilities and route outward.

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

Use short, testable acceptance criteria. Avoid vague statements like "works better" or "launch ready".

### Step 6: Surface sequence and blockers
Explicitly name:
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

### Step 7: Run the route-out check
Verify all of these:
1. The chosen packet matches the real planning job.
2. Discovery is separated from implementation when confidence is low.
3. The packet does not silently absorb sizing, board control, plan review, standups, or retros.
4. Cross-domain nuance survives without turning the output into a tutorial.
5. The packet ends with one clear next move.

Route-outs to keep explicit:
- sizing → `task-estimation`
- board/worktree/queue control → `vibe-kanban`
- plan review / approval → `plannotator`
- daily coordination → `standup-meeting`
- completed-work reflection → `sprint-retrospective`
- concept framing / strategy shaping → `bmad`, `bmad-idea`, `bmad-gds`

### Step 8: Return the brief or the final packet
Preferred brief shape before full drafting:

```markdown
# Task Planning Brief

## Packet choice
- Packet:
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

## Route-out notes
- Out of scope:
- Not-ready work kept separate:
- Recommended next move:
```

If the user already asked for the final artifact, return a compact planning packet directly.

## Output format
Default packet shape:

```markdown
# Planning Packet

## Planning horizon
- Packet:
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
- packet: `sprint-candidate`
- domain: `web-fullstack`
- split backend/data, invite acceptance flow, admin visibility, verification, and follow-through
- keep story points out of scope

### Example 2: Backlog cleanup
**Input**
> We have a pile of vague onboarding backlog items. Clean them up so we can see what is actually ready next week.

**Good output direction**
- packet: `backlog-cleanup`
- output shape: `slice-table-plus-not-ready`
- mark missing scope, ownership, or approvals explicitly
- separate discovery tickets from implementation tickets

### Example 3: Marketing / launch packet
**Input**
> Plan the next release push for our B2B launch: landing-page updates, email sequence, attribution checks, and launch-day reporting.

**Good output direction**
- packet: `release-packet`
- domain: `marketing-gtm`
- separate asset creation, review/approval, distribution, measurement, and reporting
- route deep copywriting/campaign execution to `marketing-automation`

### Example 4: Game milestone packet
**Input**
> Plan the next milestone for our roguelike demo: tutorial polish, controller support, and a streamer-ready build.

**Good output direction**
- packet: `milestone-packet`
- domain: `game-development`
- separate code/system work, content/polish, build/QA, and playtest/distribution concerns
- keep broader game-production orchestration routed to `bmad-gds` when needed

## Best practices
1. Choose one primary packet before decomposing the work.
2. Keep discovery separate from delivery whenever requirements are unstable.
3. Prefer small, reviewable slices over broad work categories.
4. Surface blockers and missing inputs explicitly instead of burying them in notes.
5. Preserve domain nuance for developer workflow, web/fullstack, product/ops, marketing/GTM, and game work without bloating the front door.
6. Route sizing, board control, review, daily cadence, and retrospectives out instead of stretching the skill boundary.
7. Keep the packet compact enough that a team can act on it immediately.
8. Update compact and manifest discovery surfaces when the role wording changes materially.

## References
- [Atlassian — Backlog refinement](https://www.atlassian.com/agile/scrum/backlog-refinement)
- [Atlassian — Sprint planning](https://www.atlassian.com/agile/scrum/sprint-planning)
- [GitHub Docs — About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)
- [GitHub Docs — About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones)
- [HacknPlan Docs](https://hacknplan.com/docs/milestones-and-deadlines/)
