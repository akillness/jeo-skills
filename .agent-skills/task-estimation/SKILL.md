---
name: task-estimation
description: >
  Turn fuzzy work into one honest estimate packet by choosing the right sizing
  horizon, naming confidence and uncertainty, and separating discovery from
  delivery before anyone treats the number like a promise. Use when the user
  needs story points, t-shirt sizing, planning-poker prep, forecast-safe
  language, split-or-spike guidance, or cross-functional sizing across
  developer workflow, web/fullstack, product/ops, marketing/GTM, or game work.
  Route decomposition to `task-planning`, daily coordination to
  `standup-meeting`, and retrospective process learning to
  `sprint-retrospective`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for backlog items, specs, issue lists, PRDs, GDDs, launch notes, support
  requests, and roadmap slices that need relative sizing and uncertainty
  language. This is an estimation and forecast-support workflow, not a deadline
  generator or commitment engine.
license: MIT
metadata:
  tags: task-estimation, story-points, t-shirt-sizing, planning-poker, forecasting, uncertainty, project-management, game-development
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0.0"
  source: akillness/jeo-skills
  modernization: 2026-04-12
  hardening: 2026-04-19
---

# Task Estimation

Use this skill when the job is to turn messy scope into **one estimate packet with the right horizon, honest uncertainty, and one next move**.

`task-estimation` owns:
- relative sizing before commitment
- choosing the lightest credible estimate unit
- confidence / uncertainty language
- split-or-spike decisions
- short forecast-safe translation notes
- cross-functional burden visibility for launch or game work

Read these support docs before unusual cases or when the request starts to sprawl:
- [references/estimation-modes.md](references/estimation-modes.md)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/boundary-guide.md](references/boundary-guide.md)

## When to use this skill
- A user asks “how big is this?”, “how risky is this?”, or “how should we estimate this?”
- A team needs story points, t-shirt sizing, planning-poker preparation, or confidence framing before a sprint or milestone discussion.
- A roadmap item, bug cluster, launch task, or game milestone needs an estimate without pretending it is already schedule-safe.
- Work is mixed enough that the first useful output is an estimate packet plus split/spike guidance.
- The estimate must surface dependencies, approvals, QA, release, content, or live-ops burden rather than only code effort.

## When not to use this skill
- **The main job is decomposition into execution-ready slices** → `task-planning`.
- **The main job is daily status, blockers, or team synchronization** → `standup-meeting`.
- **The main job is reviewing how the process went after delivery** → `sprint-retrospective`.
- **The user wants a hard ship date, fixed commitment, or executive promise with no uncertainty language**.
- **The only honest estimate is discovery itself**. In that case, estimate the spike/prototype/vertical-slice work, not the fantasy final implementation.

## Instructions

### Step 1: Classify one primary estimation mode
Normalize the request before assigning any numbers.

```yaml
estimation_intake:
  primary_mode: coarse-triage | sprint-candidate | forecast-support | discovery-spike | milestone-cross-functional
  domain: developer-workflow | web-fullstack | product-ops | marketing-gtm | game-development | mixed
  source_material: issue-spec | roadmap-note | launch-packet | gdd-playtest | bug-cluster | chat-context | unknown
  novelty: low | medium | high
  confidence: high | medium | low
  output_shape: estimate-packet | comparison-table | spike-brief | unknown
```

Use one primary mode per run:
- `coarse-triage` — rough sizing for intake, backlog cleanup, or roadmap comparison
- `sprint-candidate` — relative sizing for near-term work
- `forecast-support` — range-and-assumptions help for scope/date conversations
- `discovery-spike` — estimate investigation/prototype work, not final delivery
- `milestone-cross-functional` — work where engineering is only part of the burden

Do not blend several primary modes into one answer.

### Step 2: Gather the smallest credible evidence packet
Pull only the evidence needed to support an honest estimate:
- item summary and intended outcome
- current artifacts: issue, PRD, spec, note dump, playtest notes, bug list, launch notes
- systems touched: frontend, backend, data, infra, QA, analytics, content, store/release, live ops
- dependencies, approvals, or external constraints
- known unknowns that could swing the estimate

If evidence is thin, lower confidence immediately or switch to `discovery-spike`.

### Step 3: Choose the lightest estimate unit
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Default selection:
- **T-shirt / coarse bucket** for intake and roadmap comparison
- **Story points / relative scale** for sprint-candidate discussion
- **Range + assumptions** for forecast-support packets
- **Spike estimate** when uncertainty dominates

Rules:
- Keep relative sizing visible even if someone asks for time.
- Translate to time only after stating assumptions.
- If discovery and delivery are mixed together, estimate them separately.

### Step 4: Calibrate against anchors and burden
Do not estimate in a vacuum.

Compare against 2-3 anchors when possible:
- one small familiar item
- one medium normal item
- one large item that usually needs splitting

Check burden explicitly:
- complexity and novelty
- unknowns and dependency count
- testing / QA / validation load
- rollout, migration, approval, or coordination work
- content, localization, certification, or live-ops burden for GTM/game cases

If no anchors exist, say so and increase caution rather than pretending confidence.

### Step 5: Produce one estimate packet
Every answer should include:
- estimate mode
- estimate unit and value
- confidence
- why this size
- uncertainty drivers
- dependencies / approvals
- split-or-spike recommendation
- forecast note: how this should and should not be used
- adjacent handoff when the next job changed

Use one compact packet, not a long agile tutorial.

### Step 6: Trigger split-or-spike decisions early
Recommend a split when:
- the estimate reaches `13`, `XL`, or similar “too big” territory
- discovery and implementation are bundled together
- more than one owner/system/approval path is hidden in one item
- validation, migration, or launch burden is non-trivial

Recommend a spike when:
- key unknowns dominate the estimate
- external APIs, vendors, or platform behavior are unclear
- product/game direction is still being validated
- the estimate would otherwise be fake precision

### Step 7: Route adjacent work explicitly
Before finalizing, state what comes next:
- use `task-planning` for slice design, acceptance criteria, owners, and execution packets
- use `standup-meeting` when the next need is daily coordination on already-chosen work
- use `sprint-retrospective` when the next need is learning whether the sizing process worked
- do **not** turn this skill into roadmap commitments, status theater, or board management

## Output format

```markdown
# Estimate Packet

## Mode
- Primary mode:
- Domain:
- Why it fits:

## Evidence used
- Main artifacts:
- Systems / functions touched:
- Assumptions / gaps:

## Recommended estimate
- Unit:
- Estimate:
- Confidence:
- Comparable anchors:

## Why this size
- ...
- ...

## Uncertainty drivers
- ...

## Dependencies / approvals
- ...

## Split or spike recommendation
- Keep as-is | Split | Estimate the spike first
- Reason:

## Forecast note
- Safe use:
- Unsafe use:

## Adjacent handoff
- Next skill / process:
```

## Examples

### Example 1: Sprint-candidate SaaS feature
**Input**
> Estimate adding Slack OAuth login plus account linking for the next sprint. We already have user accounts and one OAuth provider in production.

**Good output direction**
- mode: `sprint-candidate`
- unit: story points
- estimate: moderate relative slice with medium confidence
- include auth-flow and verification burden
- route final decomposition to `task-planning`

### Example 2: Product/ops roadmap item with high ambiguity
**Input**
> How big is a full creator analytics dashboard for Q3? Metrics, data sources, and stakeholder definitions are still fuzzy.

**Good output direction**
- mode: `coarse-triage` or `discovery-spike`
- unit: t-shirt size or spike brief
- confidence: low
- explicitly say the estimate is not ready for a hard date conversation

### Example 3: Game milestone packet
**Input**
> Estimate adding a tutorial checkpoint system before the public demo build. It touches save state, UI messaging, QA regression, and demo flow polish.

**Good output direction**
- mode: `milestone-cross-functional`
- include non-code burden like QA/polish and release readiness
- recommend split or spike if checkpoint rules are still undefined

## Best practices
1. Estimate the current decision horizon, not the entire dream scope.
2. Keep relative sizing separate from hard commitments.
3. Use anchors and comparable work when available.
4. Separate discovery from delivery early.
5. Surface non-code burden instead of hiding it in one engineering number.
6. Prefer one compact estimate packet over a lecture on agile theory.
7. If the estimate is weak, say it is weak.

## References
- [Scrum Guide](https://scrumguides.org/)
- [Atlassian: What are story points in Agile and how do you estimate them?](https://www.atlassian.com/agile/project-management/estimation)
- [Scrum.org: Story Points: To Estimate or Not to Estimate](https://www.scrum.org/resources/blog/story-points-estimate-or-not-estimate)
- [John Cutler: Can You Stop Using Story Points?](https://cutle.fish/blog/can-you-stop-using-story-points/)
- [Rami Ismail: Prototypes & Vertical Slice](https://ltpf.ramiismail.com/prototypes-and-vertical-slice/)
- [Mountain Goat Software: Why I Don't Use Story Points for Sprint Planning](https://www.mountaingoatsoftware.com/blog/why-i-dont-use-story-points-for-sprint-planning)
