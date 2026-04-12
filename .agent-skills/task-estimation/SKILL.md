---
name: task-estimation
description: >
  Turn vague backlog items, stories, bugs, spikes, roadmap slices, or milestone work
  into practical size signals, uncertainty notes, and forecast-safe estimate packets.
  Use when the user needs story points, t-shirt sizing, planning-poker prep,
  reference-story calibration, confidence/risk framing, or a "how big is this / how
  risky is this / how should we estimate it?" pass for software, product, or game
  work. Not for backlog decomposition, standups, retrospectives, or hard deadline
  promises.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for backlog items, specs, issue lists, PRDs, GDDs, roadmap notes, and sprint
  candidates that need sizing and uncertainty language. Works as an estimation and
  forecasting-support workflow, not as a commitment engine or executive deadline
  generator.
metadata:
  tags: estimation, agile, story-points, planning-poker, forecasting, capacity-planning, project-management
  version: "1.1"
  source: akillness/oh-my-skills
---

# Task Estimation

Use this skill to turn messy work items into estimates that help teams make decisions without pretending uncertainty is gone.

The goal is not to produce fake precision. The goal is to:
- pick the right estimation mode for the planning horizon
- size work relative to comparable work
- surface risk, uncertainty, and hidden dependencies
- separate an estimate from a commitment or deadline
- create estimate packets that neighboring PM skills can actually use

Read [references/estimation-modes.md](references/estimation-modes.md) and [references/boundary-guide.md](references/boundary-guide.md) before handling unusual cases.

If the user mainly needs:
- **backlog decomposition, acceptance criteria, or sprint-ready slices** → route to `task-planning`
- **daily execution/status coordination** → route to `standup-meeting`
- **process reflection or team-health review after the work** → route to `sprint-retrospective`

## When to use this skill
- Estimate a story, bug cluster, spike, feature slice, or milestone candidate
- Run or prepare planning-poker / team sizing conversations
- Translate vague work into story points, t-shirt sizes, or rough size buckets
- Add confidence, uncertainty, and dependency language before a sprint or milestone commitment
- Compare candidate items for sequencing, capacity planning, or roadmap discussion
- Decide when work is too large or too unknown to estimate cleanly and should be split or treated as discovery first
- Create estimate packets for software, product, ops, content, or game-development work

## When not to use this skill
- The main problem is turning broad work into ready tasks, acceptance criteria, or dependency-aware slices → use `task-planning`
- The main problem is running a daily check-in or blocker review → use `standup-meeting`
- The main problem is learning from completed work or changing the process → use `sprint-retrospective`
- The user wants a hard ship date, contractual promise, or executive commitment with no uncertainty language
- The only honest answer is that there is not enough information yet; in that case estimate the **discovery spike**, not the imagined finished implementation

## Instructions

### Step 1: Identify the estimation mode
Label the request before assigning numbers.

Possible modes:
- `coarse-triage` — rough sizing for backlog cleanup, roadmap comparison, or intake triage
- `sprint-candidate` — relative sizing for work likely to enter the next sprint / milestone
- `forecast-support` — confidence/risk view for date or scope discussions
- `discovery-spike` — estimate the investigation/prototype, not the eventual implementation
- `milestone-cross-functional` — work that spans engineering, design, content, QA, platform, or approvals
- `unknown-needs-more-input`

Record the evidence you actually have:
- item summary
- intended outcome / user value
- current artifacts: issue, spec, PRD, GDD, note dump, bug list, playtest note, roadmap line
- known systems touched: frontend, backend, infra, analytics, content, QA, store/release, live ops
- dependencies or approvals
- novelty level: low | medium | high
- confidence level: high | medium | low

If confidence is low, do not force a precise estimate. Mark it clearly and prefer a discovery spike or broader bucket.

### Step 2: Choose the right estimation unit
Use the lightest unit that matches the decision.

Recommended unit selection:
- **T-shirt / coarse buckets** for early backlog or roadmap comparison
- **Story points / relative buckets** for sprint-candidate or team sizing conversations
- **Range + confidence notes** for forecast-support conversations
- **Discovery spike estimate** when uncertainty is too high for implementation sizing

Rules:
- Do not use hours as the primary estimate unless the user explicitly requires a time-based translation.
- If stakeholders need time, translate **after** relative sizing and keep the uncertainty visible.
- If a work item mixes discovery and delivery, estimate them separately.

### Step 3: Calibrate against anchors
Do not estimate in a vacuum.

Use 2-3 anchors:
- one known small/reference item
- one medium/typical item
- one large item that usually should be split

For each candidate item, compare:
- complexity
- unknowns
- dependency count
- cross-functional coordination
- testing / validation burden
- rollout / migration / approval cost

If no anchor exists, say so. The estimate should become more conservative, not more confident.

### Step 4: Size the work
Use a practical scale and state why.

Suggested relative scale:
- `1` — tiny, highly familiar, low risk
- `2` — small, one surface, little coordination
- `3` — moderate, clear but non-trivial
- `5` — meaningful slice with multiple steps or modest uncertainty
- `8` — large slice with several surfaces, higher testing/integration load
- `13` — too large or too uncertain for one clean delivery slice
- `21+` — epic / milestone cluster; split before committing

Suggested coarse buckets:
- `XS` — tiny / trivial follow-through
- `S` — small, narrow surface
- `M` — moderate, standard delivery slice
- `L` — large, likely multiple moving parts
- `XL` — too large or too fuzzy; split or convert to discovery

Always add the reason:
- what makes it this size
- what could move it up or down
- what needs to be split if it exceeds a clean delivery slice

### Step 5: Add uncertainty and forecast-safe language
Every useful estimate packet needs more than one number.

Capture:
- `estimate_unit`
- `estimate_value`
- `confidence`: high | medium | low
- `uncertainty drivers`
- `dependencies / approvals`
- `split recommendation`: yes | no
- `forecast note`: how this estimate should and should not be used

Good forecast language:
- "This is a **relative size signal**, not a delivery promise."
- "Confidence is low because API behavior and migration scope are still unknown."
- "Treat this as an `L` until the spike resolves dependency risk."
- "If you need a date forecast, use historical throughput / capacity after slicing the work."

### Step 6: Handle special cases explicitly
#### Discovery-heavy work
- Estimate the spike/prototype/validation activity, not the final feature fantasy.
- State what question the spike should answer.
- Re-estimate after the spike if the unknowns shrink.

#### Cross-functional / game / launch work
- Include content, QA, approvals, store/release, or localization burdens when relevant.
- Do not hide non-code work inside one engineering number.
- If coordination dominates the risk, say that explicitly.

#### Forecast conversion requests
If asked for time or schedule language:
1. keep the relative estimate visible
2. state assumptions (team size, known blockers, comparable past work)
3. provide a range, not a single-point promise
4. note that historical throughput/cycle time is better for date forecasting than raw points alone

### Step 7: Trigger split-or-spike decisions
Recommend splitting when any of these are true:
- estimate is `13` / `XL` or larger
- discovery and implementation are mixed together
- more than one owner/system/approval path is hidden in one item
- testing, migration, rollout, or platform work is non-trivial
- the team cannot explain the estimate in one short paragraph

Recommend a discovery spike when:
- key unknowns dominate the estimate
- external dependencies or vendor behavior are unclear
- game or product direction is still being validated
- the estimate would otherwise be a guess dressed up as planning

### Step 8: Preserve boundaries with adjacent PM skills
- Hand off to `task-planning` if the next need is decomposition into execution-ready slices.
- Hand off to `standup-meeting` if the next need is daily coordination against the chosen work.
- Hand off to `sprint-retrospective` if the next need is learning whether the estimation process itself worked.
- Do not convert this skill into a roadmap commitment or executive status update machine.

## Output format

```markdown
## Estimate Packet: [Item Name]

### Estimation mode
- Mode: [coarse-triage | sprint-candidate | forecast-support | discovery-spike | milestone-cross-functional]
- Primary unit: [story-points | t-shirt | range | spike]

### Recommended estimate
- Estimate: [value]
- Confidence: [high | medium | low]
- Comparable anchors: [reference items or "none available"]

### Why this size
- [2-4 bullets on scope, complexity, unknowns, validation burden]

### Uncertainty drivers
- [bullets]

### Dependencies / approvals
- [bullets or "none identified"]

### Split or spike recommendation
- [split / keep as-is / estimate the spike first]
- Reason: [short explanation]

### Forecast note
- [how this estimate should be used]
- [what it should not be used for]

### Adjacent handoff
- Next skill/process: [task-planning | standup-meeting | sprint-retrospective | none yet]
```

## Examples

### Example 1: Sprint-candidate backend feature
Input: "Estimate adding Slack OAuth login plus account-linking for the next sprint."

Output shape:
- Mode: `sprint-candidate`
- Unit: story points
- Estimate: `5`
- Confidence: medium
- Why: touches auth flow, account-linking logic, error handling, and test coverage, but the OAuth provider and user model already exist
- Forecast note: useful for sprint capacity comparison; not a promise of a fixed ship day
- Handoff: `task-planning` to split implementation, migration, and verification slices

### Example 2: Roadmap item with too much uncertainty
Input: "How big is a full creator-analytics dashboard for Q3?"

Output shape:
- Mode: `coarse-triage`
- Unit: t-shirt sizing
- Estimate: `XL`
- Confidence: low
- Why: multiple unknown data sources, reporting needs, role permissions, and unclear stakeholder definitions
- Split or spike: estimate a discovery spike first
- Forecast note: not ready for a deadline conversation until discovery narrows the scope

### Example 3: Game milestone task
Input: "Estimate adding a tutorial checkpoint system before the demo build."

Output shape:
- Mode: `milestone-cross-functional`
- Unit: story points or range
- Estimate: `8`
- Confidence: medium-low
- Why: gameplay scripting, save/checkpoint behavior, QA regression, UX messaging, and demo-flow validation all matter
- Forecast note: include test/polish burden, not only code implementation time

## Best practices
1. Estimate the decision horizon, not the entire dream scope.
2. Keep relative sizing separate from hard deadlines.
3. Use reference anchors whenever possible.
4. Split discovery from implementation when uncertainty is doing most of the work.
5. Surface non-code burden: QA, approvals, rollout, migration, content, localization, release tasks.
6. Prefer ranges and confidence notes over fake precision.
7. When the item is too large, say so and recommend a split instead of inflating the number.

## References
- [Scrum Guide](https://scrumguides.org/)
- [Atlassian: Agile estimation and story points](https://www.atlassian.com/agile/project-management/estimation)
- [Joel on Software: Evidence-Based Scheduling](https://www.joelonsoftware.com/2007/10/26/evidence-based-scheduling/)
- [Rami Ismail: Prototypes and Vertical Slice](https://ltpf.ramiismail.com/prototypes-and-vertical-slice/)
