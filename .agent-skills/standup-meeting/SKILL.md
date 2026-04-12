---
name: standup-meeting
description: >
  Facilitate useful daily standups, daily scrums, async check-ins, or walk-the-board
  delivery syncs without turning them into manager-facing status theater. Use when
  the user needs a short daily coordination ritual, blocker triage, async standup
  format, remote-team check-in, or help converting a verbose standup into a board-
  first / blocker-first flow. Not for backlog decomposition, story-point sizing, or
  retrospective analysis.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for software, product, design, and cross-functional delivery teams working
  synchronously, asynchronously, or across time zones. This skill helps choose and
  run the right daily-sync mode; it is not a project-management system of record.
metadata:
  tags: standup, daily-scrum, async-standup, blocker-triage, agile, project-management, delivery-sync
  version: "1.1"
  source: akillness/oh-my-skills
---

# Standup Meeting

Use this skill to turn a vague “run our standup” request into a **short, useful daily coordination ritual**.

The goal is not to force every team into the same three-question script. The goal is to:
- choose the right standup mode for the team shape and work state
- surface blockers and dependency risks quickly
- keep the ritual tied to work movement, not personal performance theater
- route deeper planning, estimation, and retrospective work to adjacent skills

Read [references/facilitation-modes.md](references/facilitation-modes.md) before unusual cases or when choosing between live, async, and hybrid patterns.

If the user mainly needs:
- **backlog breakdown or sprint-candidate planning** → route to `task-planning`
- **story points, t-shirt sizing, or capacity/sizing work** → route to `task-estimation`
- **process reflection after the sprint or after a failed iteration** → route to `sprint-retrospective`

## When to use this skill
- Run or redesign a daily standup / daily scrum / daily sync for a software or product team
- Switch a bloated person-by-person standup into a walk-the-board or blocker-first format
- Decide whether a remote or distributed team should use async, live, or hybrid check-ins
- Produce a short facilitation script, standup template, or sync note format tied to actual work
- Tighten a ritual that is drifting into management status reporting, side quests, or meeting sprawl
- Create a lightweight escalation path for blockers, handoffs, and follow-up huddles

## When not to use this skill
- The real task is decomposing work into ready tasks, stories, or sprint slices → use `task-planning`
- The real task is estimating size, effort, or confidence → use `task-estimation`
- The real task is reviewing what the team learned or which process changes to keep → use `sprint-retrospective`
- The main problem is incident response, outage coordination, or release war-room work → use a debugging / incident / launch-specific skill instead of daily-ceremony guidance

## Instructions

### Step 1: Classify the standup mode
Normalize the request into this intake first:

```yaml
standup_intake:
  team_shape: colocated | hybrid | distributed | unknown
  cadence_need: daily | near-daily | unclear
  current_style: three-questions | board-walk | async-thread | mixed | broken
  work_source: jira | linear | github-projects | trello | docs | mixed | unknown
  main_problem:
    - blockers-hidden
    - too-long
    - status-theater
    - timezone-friction
    - board-stale
    - too-many-side-discussions
    - unclear
  active_risk: low | medium | high
  sprint_or_delivery_goal: "..."
```

Then choose exactly one primary mode:
- `board-walk`
- `blocker-first`
- `async-check-in`
- `hybrid-async-plus-live`
- `classic-three-questions` (only when the team is small and the format is still serving real coordination)

### Step 2: Pick the right mode deliberately
Use these selection rules:

1. **Board-walk**
   - Best when the team already uses a shared board and the meeting should follow work movement
   - Preferred when person-by-person updates are repetitive or disconnected from current risk

2. **Blocker-first**
   - Best when the team is in a sprint crunch, release push, or dependency-heavy period
   - Use when the highest value is exposing impediments and routing follow-up quickly

3. **Async check-in**
   - Best for distributed teams, timezone spread, or heavy maker-schedule cost
   - Use when written updates are acceptable and live discussion is only needed for exceptions

4. **Hybrid async + live escalation**
   - Best when the team wants written visibility plus a short live sync for risky work
   - Good default for hybrid teams with occasional blockers and handoffs

5. **Classic three questions**
   - Use only when the team is small, the updates remain high-signal, and the format is not drifting into status-report theater

### Step 3: Keep the ritual bounded
Apply these rules regardless of mode:
- Keep the core sync to **10-15 minutes max**
- Discuss **movement of work, blockers, and near-term risk**, not every detail of yesterday
- Move deep problem solving to a **follow-up huddle** with only the relevant people
- Speak to the **team and the work**, not upward to management
- If the board is stale, call that out explicitly; bad source-of-truth hygiene is itself a blocker

### Step 4: Produce the daily-sync brief
Return this exact structure:

```markdown
# Daily Sync Brief

## Recommended mode
- Mode: board-walk | blocker-first | async-check-in | hybrid-async-plus-live | classic-three-questions
- Why this mode fits: ...

## Goal for this sync
- ...

## Facilitation flow
1. ...
2. ...
3. ...

## What each person should report
- ...

## Blockers / risk routing
- What belongs in the core sync: ...
- What moves to follow-up: ...
- Who should stay after: ...

## Template
```text
...
```

## Anti-patterns to avoid
- ...
- ...

## Adjacent handoffs
- Use `task-planning` when ...
- Use `task-estimation` when ...
- Use `sprint-retrospective` when ...
```

### Step 5: Tailor the template to the mode
**For board-walk:**
- Use the work board as the agenda
- Review in-progress, blocked, and ready-for-review items first
- Ask who owns the next move, not for a generic personal diary entry

**For blocker-first:**
- Start with anything blocked, aging, or at delivery risk
- Keep each blocker to triage: owner, missing input, next action, follow-up huddle
- Avoid solving the issue inside the core standup

**For async check-in:**
- Ask for yesterday / today / blockers only if it still adds signal
- Prefer prompts like “What moved?”, “What is stuck?”, and “What needs help today?”
- Require a clear escalation path for anything that cannot wait 24 hours

**For hybrid async + live:**
- Use written updates as the base layer
- Reserve the live portion for blockers, handoffs, and sprint-goal risks
- Skip re-reading everything already written unless clarification is needed

### Step 6: Route adjacent PM work explicitly
Before finalizing, state when the user should switch skills:
- If the team keeps discovering vague work that is not ready to execute, recommend `task-planning`
- If the team is arguing about size, risk, or capacity, recommend `task-estimation`
- If the team wants to turn repeated standup pain into process improvements, recommend `sprint-retrospective`

## Output format
Always return a compact **Daily Sync Brief**, not a generic agile tutorial.

Required qualities:
- choose one mode instead of mixing everything together
- keep the meeting tied to real work movement and blocker handling
- separate core-sync content from follow-up huddle content
- keep the template short enough to use immediately
- preserve routing boundaries to the rest of the PM cluster

## Examples

### Example 1: sprint team with blockers
**Input**
> Tomorrow’s standup keeps running 25 minutes because everyone gives long updates. We have two blocked tickets and one item waiting for review.

**Output sketch**
- Mode: `board-walk`
- Flow starts with blocked and in-progress items
- Follow-up huddle only for the two blocked tickets
- Anti-pattern callout: no round-robin biographies

### Example 2: distributed team across time zones
**Input**
> We have engineers in California, Europe, and Korea. Should our standup be async?

**Output sketch**
- Mode: `hybrid-async-plus-live` or `async-check-in`
- Written template centers on movement, blockers, and help-needed
- Live escalation only for urgent dependency or delivery risk

### Example 3: status-theater complaint
**Input**
> Our daily scrum feels like reporting to the manager. Fix it.

**Output sketch**
- Mode: `blocker-first` or `board-walk`
- Anti-patterns: manager-facing updates, deep dives in the room, stale board
- Adjacent handoff: use `sprint-retrospective` if they want durable process changes after trying the new flow

## Best practices
1. **Optimize for coordination, not recital** — the best standup reduces ambiguity about today’s work.
2. **Choose the lightest mode that still catches risk** — not every team needs the same ceremony weight.
3. **Escalate blockers fast, solve them elsewhere** — triage in the standup, fix in a smaller huddle.
4. **Protect maker time** — async or hybrid formats are often better for distributed teams.
5. **Treat stale work tracking as a first-class problem** — a standup cannot compensate for a broken source of truth.
6. **Route out of the ceremony when the need changes** — planning, estimation, and retrospectives are distinct skills.

## References
- Scrum Guide — https://scrumguides.org/scrum-guide.html
- Scrum.org, *What is a Daily Scrum?* — https://www.scrum.org/resources/what-is-a-daily-scrum
- Atlassian, *Standups for agile teams* — https://www.atlassian.com/agile/scrum/standups
- GitLab Handbook, *Asynchronous communication* — https://handbook.gitlab.com/handbook/company/culture/all-remote/asynchronous/
