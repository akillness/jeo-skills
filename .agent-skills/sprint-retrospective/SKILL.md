---
name: sprint-retrospective
description: >
  Facilitate sprint retrospectives, milestone postmortems, or iteration reviews
  that turn completed work into a few owned process improvements instead of
  another stale template ritual. Use when the user needs a retrospective mode,
  remote or hybrid facilitation plan, action-item follow-through reset, or help
  reviewing what the team should change after a sprint, release, milestone, or
  rough delivery cycle. Route backlog planning to `task-planning`, sizing to
  `task-estimation`, daily coordination to `standup-meeting`, and deep incident
  forensics to debugging/incident-specific skills.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for software, product, design, ops, and game-delivery teams running
  sprint, release, milestone, or cross-functional retrospectives. This skill is
  for reflection and follow-through, not the system of record for planning or
  incident RCA.
metadata:
  tags: retrospective, sprint-retro, postmortem, async-retro, hybrid-retro, agile, project-management, game-development
  version: "1.2"
  source: akillness/jeo-skills
---

# Sprint Retrospective

Use this skill when the job is to turn completed work into **one retrospective mode, a small set of themes, and a few owned follow-through actions**.

Read these references before unusual cases or when the request starts to sprawl:
- [references/facilitation-modes.md](references/facilitation-modes.md)
- [references/action-review-and-packet-shapes.md](references/action-review-and-packet-shapes.md)

## When to use this skill
- Run a sprint retrospective after a completed sprint, release slice, milestone, or rough iteration
- Facilitate a retro for a remote, hybrid, or cross-functional team
- Convert repeated team complaints into a few concrete process experiments
- Review which retro actions are done, stale, blocked, or worth dropping
- Pick a better retrospective mode instead of reusing a stale template
- Run a software, product, marketing, ops, or game-team milestone postmortem that is more about workflow learning than deep technical RCA

## When not to use this skill
- The real task is planning what to do next, splitting work, or preparing the next sprint → use `task-planning`
- The real task is estimating effort, capacity, confidence, or sizing disagreement → use `task-estimation`
- The real task is a daily sync, board walk, or blocker-first status ritual → use `standup-meeting`
- The main task is outage forensics, security investigation, or deep incident analysis → use debugging / incident / launch-specific skills and only return here for process follow-through

## Instructions

### Step 1: Normalize the intake
Classify the request before suggesting any format.

```yaml
retro_intake:
  cadence: sprint | release | milestone | project-phase | mixed | unclear
  team_shape: colocated | hybrid | distributed | cross-functional | unknown
  current_pain:
    - stale-format
    - low-participation
    - blame-risk
    - too-many-actions
    - no-follow-through
    - remote-friction
    - weak-evidence
    - recurring-same-problems
    - unclear
  evidence_available:
    - previous-actions
    - board-notes
    - ticket-summary
    - metrics
    - customer-feedback
    - playtest-feedback
    - none
  facilitation_need: light | medium | high
  psychological_safety: low | medium | high | unknown
  desired_outcome:
    - identify-themes
    - choose-experiments
    - repair-ritual
    - capture-postmortem-learnings
    - review-old-actions
```

Then choose exactly one primary mode:
- `live-facilitated-retro`
- `async-first-retro`
- `hybrid-retro`
- `milestone-postmortem`
- `action-review-reset`

### Step 2: Choose the smallest fitting mode
Use `references/facilitation-modes.md` and pick the lightest mode that still fits the workflow.

Default rules:
- **distributed team or timezone spread** → prefer `async-first-retro`
- **mixed remote + in-room participation** → prefer `hybrid-retro`
- **release/demo/launch/vertical-slice learning** → prefer `milestone-postmortem`
- **dead action items are the main failure mode** → prefer `action-review-reset`
- otherwise choose `live-facilitated-retro`

Do not blend multiple primary modes into one answer.

### Step 3: Start with evidence and prior commitments
Always review what already happened before generating fresh observations.

Minimum checks:
- previous retro actions: done | stale | blocked | dropped
- sprint or milestone outcome
- carryover work, blockers, or repeated interruptions
- notable QA spikes, launch friction, customer feedback, or playtest feedback
- repeated themes from the last 2-3 retros if available

Rules:
- If prior actions are missing, say so explicitly
- If the team keeps generating many actions but closing none, switch to `action-review-reset`
- If evidence is thin, label the result as low-confidence instead of faking certainty

### Step 4: Gather observations without turning the retro into blame theater
Use one prompt family that matches the chosen mode.

Good families:
- `went well / didn’t go well / change next`
- `start / stop / continue`
- `mad / sad / glad`
- `4Ls`
- custom prompts tied to quality, communication, handoffs, delivery risk, or release readiness

Guardrails:
- use silent writing or async collection when trust is low or a few voices dominate
- keep observations separate from solution proposals until clustering is done
- for milestone or game retros, include prompts for pipeline friction, QA timing, asset/content dependency, playtest signal, and release readiness

### Step 5: Cluster themes and constrain the action count
After collecting notes:
1. merge duplicates
2. group into 3-5 themes max
3. separate controllable team issues from escalations
4. rank themes
5. choose **1-3 actions max**

Every action needs:
- an owner
- a due date, next sprint, or checkpoint
- a success signal
- explicit escalation labeling when the team cannot solve it alone

### Step 6: Build the retrospective brief
Return a compact brief, not a generic agile tutorial.

```markdown
# Retrospective Brief

## Recommended mode
- Mode: live-facilitated-retro | async-first-retro | hybrid-retro | milestone-postmortem | action-review-reset
- Why this mode fits: ...

## Review of previous actions
| Action | Status | What happened | Keep / close / escalate |
|--------|--------|---------------|--------------------------|
| ... | done/stale/blocked/dropped | ... | ... |

## Evidence considered
- ...

## Top themes
1. ...
2. ...
3. ...

## Facilitation flow
1. ...
2. ...
3. ...
4. ...

## Prompt set
```text
...
```

## Agreed actions
| Action | Owner | Due | Success signal |
|--------|-------|-----|----------------|
| ... | ... | ... | ... |

## Risks / escalations
- ...

## Adjacent handoffs
- Use `task-planning` when ...
- Use `task-estimation` when ...
- Use `standup-meeting` when ...
```

### Step 7: Tailor the brief to the mode
Use `references/action-review-and-packet-shapes.md` for stable packet patterns.

Mode-specific reminders:
- **live-facilitated-retro** — timebox discussion and use silent writing first if louder voices dominate
- **async-first-retro** — collect notes in a bounded window, then reserve the live step for clarification and prioritization only
- **hybrid-retro** — make the shared board/doc the primary workspace so remote participants do not get outrun by room talk
- **milestone-postmortem** — include quality, handoffs, readiness, and cross-discipline coordination prompts without drifting into full RCA
- **action-review-reset** — spend the first half on prior commitments and why they failed before collecting anything new

### Step 8: Route adjacent PM work explicitly
Before finalizing, state when the user should switch skills:
- use `task-planning` for next-sprint decomposition, backlog cleanup, or scope slicing
- use `task-estimation` for sizing, confidence, or capacity disagreements
- use `standup-meeting` when the right next move is a lighter daily coordination change

## Output format
Always return a **Retrospective Brief** with these qualities:
- exactly one primary mode
- previous-action review before new action creation
- 3-5 themes maximum
- 1-3 owned actions maximum
- clear distinction between team-owned actions and escalations
- explicit PM-cluster handoffs when the job changes

## Examples

### Example 1: remote team stuck in stale retros
**Input**
> Our sprint retros are the same every two weeks and people barely talk. We’re remote across three time zones.

**Output sketch**
- Mode: `async-first-retro`
- Silent/async collection window before the meeting
- Short live clustering and vote
- 1-2 actions with explicit owner and next-retro review

### Example 2: game milestone postmortem
**Input**
> We just finished a demo milestone for our Unity game. QA found issues late, art handoffs slipped, and the team is frustrated.

**Output sketch**
- Mode: `milestone-postmortem`
- Prompts include handoffs, asset readiness, QA timing, and cross-discipline blockers
- Actions split between team-owned workflow experiments and producer escalations

### Example 3: same action items keep dying
**Input**
> Every retro ends with five good ideas and none of them ever happen.

**Output sketch**
- Mode: `action-review-reset`
- First section audits prior actions
- New action count capped at 1-2
- Notes why prior actions failed and what review hook changes next cycle

## Best practices
1. **Start with prior commitments** — otherwise the retro becomes performative novelty.
2. **Pick the smallest mode that fits** — more templates is not the same as better learning.
3. **Keep action counts brutally small** — a few owned changes beat a wall of wishes.
4. **Preserve non-blame framing** — process reflection dies when people feel individually judged.
5. **Use evidence, not memory theater** — bring sprint outcomes, QA spikes, support load, launch friction, or playtest signal when available.
6. **Route out when the job changes** — planning, sizing, and daily-sync redesign are adjacent jobs, not retro substeps.

## References
- Atlassian Team Playbook, *Retrospective* — https://www.atlassian.com/team-playbook/plays/retrospective
- Scrum.org, *What is a Sprint Retrospective?* — https://www.scrum.org/resources/what-is-a-sprint-retrospective
- Miro, *Remote Retrospective Guide* — https://miro.com/agile/guide-to-remote-retrospectives/
- Parabol, *22 Retrospective Ideas for Ambitious Teams* — https://www.parabol.co/resources/sprint-retrospective-ideas/
- TeamRetro, *Sprint Retrospective Template* — https://ww2.teamretro.com/retro-template/sprint-retrospective/
