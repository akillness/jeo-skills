---
name: task-planning
description: >
  Turn vague features, bugs, roadmap items, or playtest findings into execution-ready
  tasks, sprint candidates, and milestone slices with scope boundaries, dependencies,
  acceptance criteria, and readiness checks. Use when the user needs backlog grooming,
  feature breakdown, sprint planning prep, roadmap-to-delivery translation, release or
  milestone slicing, or a "what should we actually do next?" planning pass for web,
  backend, product, or game work. Not for detailed sizing-only work, standups, or
  retrospectives.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, specs, issue lists, planning notes, PRDs, GDDs, bug lists,
  or chat context that needs to be converted into ready work packets. Works as a
  planning and decomposition workflow, not a project-management system of record.
metadata:
  tags: task-planning, backlog-grooming, sprint-planning, roadmap-slicing, feature-breakdown, game-development, product-planning
  version: "1.1"
  source: akillness/oh-my-skills
---

# Task Planning

Use this skill to turn messy requests into a practical planning packet that a team can actually execute.

The goal is not to produce generic agile ceremony. The goal is to:
- clarify the planning horizon
- split work into slices small enough to schedule or delegate
- surface blockers before commitment
- separate ready work from not-ready work
- preserve context for software, product, and game teams

Read [references/planning-patterns.md](references/planning-patterns.md) and [references/readiness-checklist.md](references/readiness-checklist.md) before handling unusual planning cases.

If the user mainly needs:
- **sizing or story points** → route to `task-estimation`
- **daily execution/status cadence** → route to `standup-meeting`
- **process reflection after work completes** → route to `sprint-retrospective`

## When to use this skill
- Break a feature, bug cluster, roadmap item, or product idea into actionable work
- Groom a backlog before sprint planning or milestone planning
- Turn scattered notes, chats, PRDs, specs, or playtest findings into structured execution slices
- Prepare sprint-candidate tasks with dependencies, assumptions, and acceptance criteria
- Convert broad web, backend, fullstack, product, marketing-ops, or game work into a practical delivery packet
- Clean up overgrown tickets that are too vague, too large, or missing readiness details
- Separate discovery work from implementation work when the request is still too fuzzy to commit

## Instructions

### Step 1: Identify the planning horizon
Label the request before decomposing it.

Possible horizons:
- `single-task`
- `feature-slice`
- `sprint-candidate`
- `release-slice`
- `milestone-plan`
- `backlog-cleanup`
- `mixed-needs-clarification`

Record the available evidence:
- objective or problem statement
- user/business/player value
- current artifacts: issue list, spec, PRD, GDD, notes, logs, bug list, playtest notes
- target surface: frontend, backend, infra, product ops, marketing ops, game system, content pipeline
- constraints: deadline, owner, platform, dependencies, launch/milestone timing
- confidence: high | medium | low

If evidence is thin, do not fake precision. Mark the packet as low-confidence and split **discovery tasks** from **implementation tasks**.

### Step 2: Define the planning packet
Summarize the work in one sentence:

> "We are planning **[scope]** so that **[user/team outcome]** happens by **[timeframe or trigger]**."

Then classify the work into one primary type and optional secondary type.

**Primary types**
- `feature-delivery`
- `bug-fix-batch`
- `integration-rollout`
- `content-production`
- `research-discovery`
- `launch-readiness`
- `ops-automation`
- `unknown-needs-more-input`

Typical mappings:
- new dashboard, API, auth change, onboarding flow → `feature-delivery`
- repeated defects, flaky tests, crash triage cluster → `bug-fix-batch`
- vendor/API/tool migration → `integration-rollout`
- campaign assets, store-page updates, release materials → `content-production` or `launch-readiness`
- feature with unclear requirements → `research-discovery` first
- game vertical slice, demo prep, milestone polish → `milestone-plan` + `feature-delivery` / `content-production`

### Step 3: Break work into execution-ready slices
Decompose the request into slices that are:
- outcome-oriented
- small enough to estimate or assign
- testable/reviewable
- dependency-aware

Use this order:
1. **Discovery** — unknowns, research, validation, missing decisions
2. **Foundation** — schema, architecture, setup, shared assets, environment work
3. **Implementation** — user-facing or system-facing delivery slices
4. **Verification** — QA, analytics, review, smoke tests, playtests, launch checks
5. **Follow-through** — docs, rollout, migration, enablement, monitoring

Rules:
- Split items that contain multiple owners, systems, or acceptance surfaces.
- Split items that cannot be completed and reviewed in one clear pass.
- Keep discovery separate from implementation when requirements are unstable.
- For game work, separate code/system tasks from content/polish/playtest tasks.
- For marketing or launch work, separate asset creation from approval/distribution tasks.

### Step 4: Add readiness fields to each slice
For every slice, capture these fields:
- **Title**
- **Outcome**
- **Owner role**
- **Dependencies**
- **Inputs required**
- **Acceptance criteria**
- **Risk / uncertainty**
- **Ready?** yes | no
- **If not ready, what is missing?**

Use short acceptance criteria, not vague aspirations.

Good acceptance criteria:
- Given valid credentials, login redirects to the dashboard and preserves the next-path.
- Build pipeline uploads the artifact with branch, platform, and build-number naming.
- Demo feedback spreadsheet is triaged into must-fix, nice-to-fix, and messaging-only buckets.

Weak acceptance criteria:
- "works well"
- "looks better"
- "marketing is improved"

### Step 5: Surface sequencing and blockers
Before returning the plan, explicitly identify:
- items blocked by decisions, assets, or external access
- work that can run in parallel
- work that must happen in sequence
- tasks that should be deferred because they are not ready

Use these blocker buckets:
- `missing-scope`
- `missing-design`
- `missing-data`
- `external-dependency`
- `environment-access`
- `approval-needed`
- `cross-team-handoff`

Do not silently bury blockers inside a task list.

### Step 6: Build the planning packet
Return a concise packet with this exact structure:

```markdown
# Planning Packet

## Planning horizon
- Horizon: ...
- Primary type: ...
- Secondary type: ...
- Confidence: high | medium | low

## Goal
- ...

## Assumptions
- ...
- ...

## Work slices
| Slice | Outcome | Owner role | Dependencies | Ready? |
|------|---------|------------|--------------|--------|
| ... | ... | ... | ... | yes/no |

## Slice details
### 1. [Slice name]
- Outcome: ...
- Inputs required: ...
- Acceptance criteria:
  - [ ] ...
  - [ ] ...
- Risks / uncertainty: ...
- Notes: ...

## Sequencing
1. ...
2. ...
3. ...

## Blockers / not-ready items
- Bucket: ...
- Missing: ...
- Next action: ...

## Recommended next move
- Choose one: start implementation | run discovery first | groom with owners | estimate now | defer until dependency clears
```

### Step 7: Tailor the packet to the domain
**For web / software work, focus on:**
- user flow or system boundary
- frontend/backend/data split
- rollout, analytics, QA, and docs follow-through
- hidden auth, migration, or infra dependencies

**For product / operations work, focus on:**
- decision checkpoints
- stakeholder approvals
- source-of-truth artifacts
- operational handoffs and reporting needs

**For marketing / GTM work, focus on:**
- asset production vs review vs distribution
- messaging dependencies
- launch window timing
- channels and instrumentation

**For game work, focus on:**
- system/code tasks vs content/art tasks vs playtest/polish tasks
- milestone or demo timing
- platform-specific constraints
- build, QA, and feedback loops that affect planning order

### Step 8: Keep the skill distinct from adjacent PM skills
- Do **not** assign story points unless the user asks for sizing; hand that off to `task-estimation`.
- Do **not** convert this into a standup/status report.
- Do **not** turn retrospective lessons into future work unless the user explicitly wants a planning pass.
- When a request is mostly prioritization across many competing initiatives, state the top planning packet first and mark the rest as backlog candidates.

## Output format
Always return a planning packet, not a giant agile tutorial.

Required qualities:
- prioritize ready, assignable slices over abstract work categories
- separate discovery from implementation when confidence is low
- surface blockers and missing inputs explicitly
- keep the plan compact enough to act on immediately
- preserve domain-specific nuances for software, product, marketing, and game work

## Examples

### Example 1: Fullstack feature request
**Input**
> Break down a new team-invite flow for our SaaS app. We need email invites, acceptance, and admin visibility before next sprint planning.

**Output sketch**
- Horizon: `sprint-candidate`
- Primary type: `feature-delivery`
- Work slices:
  1. invite data model + backend endpoints
  2. admin UI for sending/resending invites
  3. invite acceptance flow
  4. verification + analytics + docs
- Blockers: missing policy for expired invites
- Recommended next move: groom with owner, then estimate

### Example 2: Product backlog cleanup
**Input**
> We have twelve messy backlog items for onboarding improvements. Please clean them up before planning.

**Output sketch**
- Horizon: `backlog-cleanup`
- Primary type: `research-discovery`
- Separate duplicates and vague requests into discovery vs implementation
- Mark which items are not ready because they lack user problem, success metric, or owner
- Return 3-5 sprint-ready candidates instead of preserving all twelve as-is

### Example 3: Game milestone slice
**Input**
> Plan the next milestone for our roguelike demo: tutorial polish, controller support, and streamer-ready build.

**Output sketch**
- Horizon: `milestone-plan`
- Primary type: `feature-delivery`
- Secondary type: `launch-readiness`
- Split into code/system, UI/tutorial content, QA/playtest, and build/distribution slices
- Surface blocker: missing minimum demo success criteria
- Recommended next move: discovery on success criteria, then milestone commit

## Best practices
1. **Plan for commitment, not for admiration.** A smaller ready plan beats an impressive vague one.
2. **Keep discovery separate.** Unknowns are work, but they are not implementation.
3. **Name blockers early.** Teams lose time when hidden dependencies show up after commitment.
4. **Different domains need different slice boundaries.** Web, ops, marketing, and game work do not decompose the same way.
5. **Treat backlog cleanup as real work.** A noisy backlog is already planning debt.
6. **Use this skill before estimation.** First make the work ready, then size it.

## References
- [Planning patterns](references/planning-patterns.md)
- [Readiness checklist](references/readiness-checklist.md)
