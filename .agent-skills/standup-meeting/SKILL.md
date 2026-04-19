---
name: standup-meeting
description: >
  Turn messy daily-sync requests into one coordination packet: choose the right
  standup mode, gather the smallest work-state evidence, keep blockers and
  handoffs visible, and move deep dives into follow-up huddles instead of status
  theater. Use when the user needs a daily scrum, async check-in, board-walk,
  blocker-first sync, remote-team standup, or help fixing an overlong / low-
  signal standup. Route backlog planning to `task-planning`, sizing to
  `task-estimation`, retrospective process repair to `sprint-retrospective`, and
  incident-command work to debugging / launch-specific skills.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for software, product, design, ops, and game-delivery teams running
  synchronous, asynchronous, or hybrid daily coordination. This skill helps pick
  one standup mode and one escalation path; it is not a project-management
  system of record or a people-performance reporting tool.
license: MIT
metadata:
  tags: standup, daily-scrum, async-standup, blocker-triage, agile, project-management, delivery-sync, hybrid-teams
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0.0"
  source: akillness/oh-my-skills
  modernization: 2026-04-12
  hardening: 2026-04-19
---

# Standup Meeting

Use this skill when the job is to turn vague daily coordination into **one sync mode, one small evidence packet, and one follow-up path**.

`standup-meeting` owns:
- daily coordination around live work
- standup mode selection
- blocker / handoff visibility
- short facilitation flow and update templates
- clear separation between the core sync and follow-up huddles
- anti-status-theater guardrails

Read these references before unusual cases or when the request starts to sprawl:
- [references/facilitation-modes.md](references/facilitation-modes.md)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)

## When to use this skill
- A user asks for a daily standup, daily scrum, daily sync, or async check-in format.
- A team needs to choose between board-walk, blocker-first, async, hybrid, or classic three-question standups.
- A daily ritual is running too long, drifting into status reporting, or generating too many side discussions.
- A remote or hybrid team needs a lighter way to coordinate blockers and handoffs.
- The best next artifact is a **Daily Sync Brief** with one mode, one template, and one escalation path.

## When not to use this skill
- **The real job is backlog decomposition, sprint prep, or execution-ready slicing** → `task-planning`.
- **The real job is sizing, confidence framing, or capacity disagreement** → `task-estimation`.
- **The real job is process reflection, recurring ceremony pain, or action follow-through after delivery** → `sprint-retrospective`.
- **The real job is outage command, release war room, or incident triage** → debugging / incident / launch-specific skills.
- **The user mainly wants manager-facing status collection or performance reporting**. This skill is for lateral coordination, not upward theater.

## Instructions

### Step 1: Classify one primary standup mode
Normalize the request before suggesting any format.

```yaml
standup_intake:
  primary_mode: board-walk | blocker-first | async-check-in | hybrid-async-plus-live | classic-three-questions
  team_shape: colocated | hybrid | distributed | cross-functional | unknown
  work_source: jira | linear | github-projects | trello | docs | mixed | unknown
  main_problem:
    - blockers-hidden
    - too-long
    - status-theater
    - timezone-friction
    - board-stale
    - too-many-side-discussions
    - unclear
  current_signal: strong-board | weak-board | weak-updates | mixed | unknown
  delivery_risk: low | medium | high
  output_shape: daily-sync-brief | template-only | facilitation-reset | unknown
```

Use exactly one primary mode per run:
- `board-walk` — the board should drive the conversation
- `blocker-first` — today’s main job is surfacing impediments and routing help fast
- `async-check-in` — written updates are the default and live talk is optional
- `hybrid-async-plus-live` — written visibility first, short live escalation second
- `classic-three-questions` — only when the team is small and the format still carries real signal

Do not blend several modes into one mushy answer.

### Step 2: Gather the smallest credible coordination packet
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Minimum evidence packet:
- current board / issue tracker / document source
- in-progress and blocked work
- near-term delivery goal or sprint goal if known
- obvious handoffs or dependencies
- timezone / hybrid constraints if relevant
- whether the board is trusted, stale, or missing key work

If evidence is thin, lower confidence instead of inventing certainty.

### Step 3: Pick the lightest mode that still catches risk
Default rules:
- **trusted board + multiple active items** → `board-walk`
- **blocked work or dependency pressure dominates** → `blocker-first`
- **timezone spread or maker-time cost dominates** → `async-check-in`
- **team wants written visibility plus a short exception-only sync** → `hybrid-async-plus-live`
- **small colocated team, still high-signal, little ceremony drift** → `classic-three-questions`

If the board is stale, call that out as part of the diagnosis. A standup cannot compensate forever for a broken source of truth.

### Step 4: Keep the core sync bounded
Regardless of mode:
- keep the core sync to **10-15 minutes max**
- focus on work movement, blockers, handoffs, and near-term delivery risk
- move deep problem-solving into a **follow-up huddle** with only the relevant people
- speak to the team and the work, not upward to management
- say explicitly when the board, ticket hygiene, or update discipline is itself the blocker

### Step 5: Produce one Daily Sync Brief
Return one compact packet, not a general agile tutorial.

```markdown
# Daily Sync Brief

## Recommended mode
- Mode:
- Why this mode fits:

## Goal for this sync
- ...

## Evidence used
- Work source:
- Strongest signals:
- Missing but important:

## Core facilitation flow
1. ...
2. ...
3. ...

## What each person should report
- ...

## Blocker / handoff routing
- Keep in core sync:
- Move to follow-up huddle:
- Who should stay after:

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

### Step 6: Tailor the packet to the chosen mode
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) for stable packet shapes.

Mode reminders:
- **board-walk** — review blocked, aging, in-progress, and ready-for-review work before asking for personal diaries
- **blocker-first** — name owner, missing input, and next action quickly; do not solve the blocker in the room
- **async-check-in** — prefer prompts like “What moved?”, “What is stuck?”, and “What needs help today?” over ritualized filler
- **hybrid-async-plus-live** — treat written updates as the base layer and the live sync as escalation only
- **classic-three-questions** — keep only if it still stays short, lateral, and work-focused

### Step 7: Route adjacent PM work explicitly
Before finalizing, say when the next job changed:
- use `task-planning` for backlog cleanup, sprint prep, or scope slicing
- use `task-estimation` for effort, confidence, or capacity disputes
- use `sprint-retrospective` when repeated daily-sync pain should become a process change
- do **not** turn this skill into roadmap planning, status theater, or incident command

## Output format
Always return a **Daily Sync Brief** with these qualities:
- exactly one primary mode
- one small evidence packet
- explicit separation between core sync and follow-up huddle
- visible blocker / handoff routing
- short reusable template
- clear route-outs to the rest of the PM cluster when the job changes

## Examples

### Example 1: Overlong sprint standup
**Input**
> Tomorrow’s standup keeps running 25 minutes because everyone gives long updates. We have two blockers and one item waiting for review.

**Good output direction**
- mode: `board-walk` or `blocker-first`
- blocked and in-progress work comes first
- follow-up huddle only for the blocked items
- anti-pattern callout: no round-robin biographies

### Example 2: Distributed team
**Input**
> We have engineers in California, Europe, and Korea. Should our daily standup be async?

**Good output direction**
- mode: `async-check-in` or `hybrid-async-plus-live`
- written template centered on movement, blockers, and help needed
- explicit escalation path for urgent coordination

### Example 3: Manager-facing status theater
**Input**
> Our daily scrum feels like reporting to the manager. Fix it without changing our whole process.

**Good output direction**
- mode: `board-walk` or `blocker-first`
- names status theater directly
- keeps the sync lateral and work-focused
- routes recurring ceremony pain to `sprint-retrospective`

## Best practices
1. **Optimize for work movement, not recital** — the ritual should clarify today’s coordination job.
2. **Choose the lightest mode that still catches risk** — not every team needs the same ceremony weight.
3. **Triage blockers in the sync, solve them elsewhere** — follow-up huddles are a feature, not a failure.
4. **Protect maker time** — async or hybrid modes often beat default live meetings for distributed teams.
5. **Treat source-of-truth hygiene as a first-class issue** — stale boards and missing updates are real blockers.
6. **Route repeated pain outward** — planning, estimation, retrospectives, and incident work are different jobs.

## References
- Scrum Guide — https://scrumguides.org/scrum-guide.html
- Scrum.org, *What is a Daily Scrum?* — https://www.scrum.org/resources/what-is-a-daily-scrum
- Atlassian, *Standups for agile teams* — https://www.atlassian.com/agile/scrum/standups
- GitLab Handbook, *Asynchronous communication* — https://handbook.gitlab.com/handbook/company/culture/all-remote/asynchronous/
- Martin Fowler / Jason Yip, *It’s Not Just Standing Up* — https://martinfowler.com/articles/itsNotJustStandingUp.html
