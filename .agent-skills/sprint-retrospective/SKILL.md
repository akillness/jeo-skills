---
name: sprint-retrospective
description: >
  Facilitate sprint retrospectives, milestone postmortems, or iteration reviews that
  turn completed work into a few owned process improvements instead of another stale
  template exercise. Use when the user needs a retro format, async or hybrid retro
  flow, retrospective facilitation script, action-item follow-through, or help
  reviewing what the team should change after a sprint, release, milestone, or rough
  delivery cycle. Not for backlog planning, story-point sizing, daily standups, or
  deep incident root-cause analysis.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for software, product, design, and game-delivery teams running sprint,
  release, milestone, or cross-functional retrospectives. This skill helps structure
  reflection, theme detection, and action follow-through; it is not the source of
  truth for project tracking or incident forensics.
metadata:
  tags: retrospective, sprint-retro, postmortem, async-retro, hybrid-retro, agile, project-management, game-development
  version: "1.1"
  source: akillness/oh-my-skills
---

# Sprint Retrospective

Use this skill to turn a vague “run a retro” request into a **small, honest, action-focused reflection loop**.

The goal is not to dump another list of retrospective templates. The goal is to:
- review whether previous retro actions actually landed
- choose the right retro mode for the team shape and delivery cycle
- separate observations from action proposals
- keep action counts small enough to survive contact with reality
- route planning, sizing, and daily-sync work back to the rest of the PM cluster

Read [references/facilitation-modes.md](references/facilitation-modes.md) before unusual cases or when deciding between live, async, hybrid, and milestone/postmortem patterns.

If the user mainly needs:
- **backlog grooming, scope breakdown, or next-sprint slicing** → route to `task-planning`
- **story points, t-shirt sizes, or confidence sizing** → route to `task-estimation`
- **daily coordination, blocker triage, or async check-ins** → route to `standup-meeting`

## When to use this skill
- Run a sprint retrospective after a completed sprint, release slice, milestone, or rough iteration
- Facilitate a retro for a remote, hybrid, or cross-functional team
- Convert repeated team complaints into a few concrete process experiments
- Review which retro actions are done, stale, blocked, or worth dropping
- Pick the right retrospective format instead of reusing a stale template every time
- Run a software, product, or game-team milestone postmortem that is more about workflow learning than deep technical RCA

## When not to use this skill
- The real task is planning what to do next or splitting work into tasks → use `task-planning`
- The real task is estimating size, capacity, effort, or confidence → use `task-estimation`
- The real task is a daily sync, board walk, or blocker-first meeting → use `standup-meeting`
- The main task is outage forensics, security investigation, or deep incident analysis → use a debugging / incident / launch-specific skill and only pull this skill back in for follow-through changes

## Instructions

### Step 1: Normalize the retrospective intake
Classify the request before suggesting a format.

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
    - incident-summary
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

### Step 2: Choose the mode deliberately
Use these selection rules:

1. **live-facilitated-retro**
   - Best when the team can meet synchronously and needs strong facilitation, clustering, and decision-making
   - Good default when psychological safety is acceptable and the main challenge is turning observations into actions

2. **async-first-retro**
   - Best for distributed teams, timezone spread, or teams that need writing time before discussion
   - Use when candid input improves if people can submit notes before the meeting

3. **hybrid-retro**
   - Best for teams mixing in-room and remote participants
   - Use when one shared board/doc should anchor both silent writing and a short live synthesis

4. **milestone-postmortem**
   - Best for product, release, or game-delivery cycles where the unit of reflection is a milestone, demo, launch slice, or vertical slice instead of a strict sprint
   - Keep the focus on workflow, handoffs, QA, readiness, and process learning rather than full incident RCA

5. **action-review-reset**
   - Best when the team already knows the same problems but keeps failing to close prior retro actions
   - Start with the previous action ledger before collecting any new observations

### Step 3: Start with evidence and prior commitments
Always review what already happened before generating new opinions.

Required checks:
- previous retro actions: done | stale | blocked | dropped
- sprint/milestone goal outcome
- carryover work, blockers, or repeated interruptions
- notable incidents, QA spikes, launch friction, or customer/player feedback that shaped the cycle
- repeated themes from the last 2-3 retros if available

Rules:
- If prior actions are missing, say so explicitly
- If the team keeps generating many actions but closing none, switch to `action-review-reset`
- If evidence is thin, do not fake certainty; mark findings as low-confidence observations

### Step 4: Gather observations without turning them into blame theater
Use a format that matches the mode and the team's energy.

Recommended pattern families:
- `went-well / didn’t-go-well / change-next`
- `start / stop / continue`
- `mad / sad / glad`
- `4Ls`
- custom theme prompts tied to delivery risk, quality, communication, handoffs, or decision quality

Guidance:
- Use the lightest format that still surfaces honest signal
- For low-trust teams, prefer silent writing or facilitator-mediated note capture before discussion
- For milestone or game retros, include prompts for pipeline friction, QA timing, asset/content dependency, playtest signal, and release readiness
- Keep observations separate from solutions until clustering is done

### Step 5: Cluster themes and constrain the action count
After collecting notes:
1. merge duplicates
2. group into 3-5 themes max
3. decide which themes are controllable by the team
4. vote or rank the themes
5. choose **1-3 actions max**

Action rules:
- every action needs an owner
- every action needs a due sprint/date/checkpoint
- every action needs a success signal
- escalation items should be labeled as escalations, not disguised as team-owned work
- prefer small experiments over huge “fix the process” declarations

### Step 6: Build the retrospective brief
Return this exact structure:

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

### Step 7: Tailor the brief to the chosen mode
**For live-facilitated-retro:**
- open with previous-action review
- use silent writing before discussion if a few voices dominate
- timebox clustering and ranking so the room reaches actions, not just catharsis

**For async-first-retro:**
- collect notes over a bounded window
- ask for observations, impact, and proposed experiment separately
- use the live step only for clarifications, prioritization, and final action choice

**For hybrid-retro:**
- make the shared board/doc the primary workspace for everyone
- prevent in-room side conversations from outrunning remote participants
- use short verbal summaries, not long spoken brainstorms

**For milestone-postmortem:**
- include quality, handoff, release/readiness, and cross-discipline coordination prompts
- distinguish controllable process changes from broader strategic constraints
- keep technical RCA brief unless an incident-specific skill takes over

**For action-review-reset:**
- spend the first half on prior commitments, not fresh templates
- cut the action list down ruthlessly
- identify why previous actions failed: no owner, no date, no authority, no review loop, or too much scope

### Step 8: Route adjacent PM work explicitly
Before finalizing, state when the user should switch skills:
- If the team needs to split new work, clarify scope, or prepare the next sprint, recommend `task-planning`
- If the team is arguing about size, confidence, or capacity for upcoming work, recommend `task-estimation`
- If repeated retro issues need a lighter daily coordination change, recommend `standup-meeting`

## Output format
Always return a compact **Retrospective Brief**, not a generic agile tutorial.

Required qualities:
- choose one primary mode
- review previous actions before inventing new ones
- keep themes and actions bounded
- preserve psychological safety and non-blame framing
- distinguish team-owned actions from escalations
- keep routing boundaries to the rest of the PM cluster explicit

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
- Actions split between team-owned workflow experiments and producer escalation items

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
2. **Choose the lightest format that still surfaces signal** — more templates is not the same as better learning.
3. **Keep the action count brutally small** — a few owned changes beat a wall of wishes.
4. **Preserve non-blame framing** — process reflection dies when people feel individually judged.
5. **Use evidence, not memory theater** — bring in sprint outcomes, support load, QA spikes, or playtest signal when available.
6. **Route out of the retro when the need changes** — planning, sizing, and daily-sync redesign are adjacent but distinct jobs.

## References
- Atlassian Team Playbook, *Retrospective* — https://www.atlassian.com/team-playbook/plays/retrospective
- Scrum.org, *What is a Sprint Retrospective?* — https://www.scrum.org/resources/what-is-a-sprint-retrospective
- Parabol, *Sprint Retrospective* — https://www.parabol.co/resources/sprint-retrospective/
- Retromat — https://retromat.org/
