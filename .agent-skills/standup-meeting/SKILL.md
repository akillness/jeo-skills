---
name: standup-meeting
description: >
  Turn messy daily-sync requests into one honest coordination-cadence packet:
  decide whether live-daily, async-daily, hybrid-daily, less-frequent syncs, or
  no recurring standup is justified, then pick the lightest standup mode that
  still catches blockers and handoffs. Use when the user needs a daily scrum,
  async check-in, board-walk, blocker-first sync, remote-team standup, launch-
  week cadence reset, or help fixing an overlong / low-signal standup. Route
  backlog planning to `task-planning`, sizing to `task-estimation`,
  retrospective process repair to `sprint-retrospective`, and incident-command
  work to debugging / launch-specific skills.
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
  source: akillness/jeo-skills
  modernization: 2026-04-12
  hardening: 2026-04-19
  ratchet: 2026-04-20
---

# Standup Meeting

Use this skill when the job is to turn vague daily coordination into **one honest cadence decision, one small evidence packet, and one follow-up path**.

`standup-meeting` owns:
- daily-coordination cadence truth
- standup mode selection when a recurring sync is justified
- blocker / handoff visibility
- short facilitation flow and update templates
- clear separation between the core sync and follow-up huddles
- anti-status-theater guardrails
- explicit `less-frequent` / `no recurring standup` outcomes when daily ritual is unjustified

Read these references before unusual cases or when the request starts to sprawl:
- [references/cadence-gates-and-exceptions.md](references/cadence-gates-and-exceptions.md)
- [references/facilitation-modes.md](references/facilitation-modes.md)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)

## When to use this skill
- A user asks for a daily standup, daily scrum, daily sync, or async check-in format.
- A team needs to decide whether daily live cadence is still justified before choosing board-walk, blocker-first, async, hybrid, or classic three-question standups.
- A daily ritual is running too long, drifting into status reporting, or generating too many side discussions.
- A remote or hybrid team needs a lighter way to coordinate blockers and handoffs.
- A launch / milestone / firefighting window may justify a temporary daily cadence even if the normal answer is lighter.
- The best next artifact is a **Coordination Cadence Brief** with one cadence decision, one mode (if any), and one escalation path.

## When not to use this skill
- **The real job is backlog decomposition, sprint prep, or execution-ready slicing** → `task-planning`.
- **The real job is sizing, confidence framing, or capacity disagreement** → `task-estimation`.
- **The real job is process reflection, recurring ceremony pain, or action follow-through after delivery** → `sprint-retrospective`.
- **The real job is outage command, release war room, or incident triage** → debugging / incident / launch-specific skills.
- **The user mainly wants manager-facing status collection or performance reporting**. This skill is for lateral coordination, not upward theater.

## Instructions

### Step 1: Classify cadence first, then one primary mode if needed
Normalize the request before suggesting any format.

```yaml
standup_intake:
  cadence_decision: live-daily | async-daily | hybrid-daily | less-frequent-sync | no-recurring-standup
  primary_mode: board-walk | blocker-first | async-check-in | hybrid-async-plus-live | classic-three-questions | none
  team_shape: colocated | hybrid | distributed | cross-functional | unknown
  work_source: jira | linear | github-projects | trello | docs | hacknplan | mixed | unknown
  main_problem:
    - blockers-hidden
    - too-long
    - status-theater
    - timezone-friction
    - board-stale
    - too-many-side-discussions
    - low-dependency-work
    - ritual-inertia
    - unclear
  current_signal: strong-board | weak-board | weak-updates | mixed | unknown
  delivery_risk: low | medium | high
  escalation_need: low | medium | high | unknown
  output_shape: coordination-cadence-brief | template-only | facilitation-reset | unknown
```

Use exactly one cadence decision per run:
- `live-daily` — a live daily sync is justified by current blocker / dependency pressure
- `async-daily` — daily visibility still matters, but live attendance cost is too high
- `hybrid-daily` — written updates are daily; live talk is exception-only
- `less-frequent-sync` — a recurring checkpoint still helps, but daily is overkill
- `no-recurring-standup` — board/doc visibility plus ad hoc escalation is a better fit than ritualized daily sync

Choose a primary mode only when the cadence still includes a recurring standup shape:
- `board-walk` — the board should drive the conversation
- `blocker-first` — today’s main job is surfacing impediments and routing help fast
- `async-check-in` — written updates are the default and live talk is optional
- `hybrid-async-plus-live` — written visibility first, short live escalation second
- `classic-three-questions` — only when the team is small and the format still carries real signal
- `none` — use when the best answer is `no-recurring-standup`

Do not blend several cadence outcomes or modes into one mushy answer.

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

### Step 3: Decide whether daily cadence is justified, then pick the lightest mode that still catches risk
Default cadence rules:
- **high blocker frequency, dense dependencies, launch / milestone / incident pressure** → `live-daily`
- **daily visibility matters but live overlap is costly** → `async-daily`
- **written updates plus short exception-only huddle fits best** → `hybrid-daily`
- **work is mostly independent, multi-day, or already visible in strong artifacts** → `less-frequent-sync`
- **board/doc hygiene is strong and blockers should be escalated immediately instead of saved for a ritual** → `no-recurring-standup`

Mode rules once cadence still justifies a standup shape:
- **trusted board + multiple active items** → `board-walk`
- **blocked work or dependency pressure dominates** → `blocker-first`
- **timezone spread or maker-time cost dominates** → `async-check-in`
- **team wants written visibility plus a short exception-only sync** → `hybrid-async-plus-live`
- **small colocated team, still high-signal, little ceremony drift** → `classic-three-questions`

If the board is stale, call that out as part of the diagnosis. A standup cannot compensate forever for a broken source of truth.
If the team only needs temporary higher cadence, say that explicitly: use the daily pattern for the risky window, then review whether to ratchet back down.

### Step 4: Keep the core sync bounded when cadence still includes a sync
If the cadence is `live-daily`, `async-daily`, `hybrid-daily`, or `less-frequent-sync`:
- keep the live core sync to **10-15 minutes max** when one exists
- focus on work movement, blockers, handoffs, and near-term delivery risk
- move deep problem-solving into a **follow-up huddle** with only the relevant people
- speak to the team and the work, not upward to management
- say explicitly when the board, ticket hygiene, or update discipline is itself the blocker

If the cadence is `no-recurring-standup`:
- say what artifact or channel replaces the ritual
- name the escalation trigger for immediate blocker handling
- say when to re-evaluate cadence if risk rises again

### Step 5: Produce one Coordination Cadence Brief
Return one compact packet, not a general agile tutorial.

```markdown
# Coordination Cadence Brief

## Recommended cadence
- Cadence:
- Why this cadence fits:
- Review trigger:

## Recommended mode
- Mode:
- Why this mode fits:

## Goal for this coordination loop
- ...

## Evidence used
- Work source:
- Strongest signals:
- Missing but important:

## Core facilitation flow or replacement path
1. ...
2. ...
3. ...

## What each person should report or update
- ...

## Blocker / handoff routing
- Keep in core sync:
- Escalate immediately when:
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

### Step 6: Tailor the packet to the chosen mode or no-meeting outcome
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) for stable packet shapes.

Mode reminders:
- **board-walk** — review blocked, aging, in-progress, and ready-for-review work before asking for personal diaries
- **blocker-first** — name owner, missing input, and next action quickly; do not solve the blocker in the room
- **async-check-in** — prefer prompts like “What moved?”, “What is stuck?”, and “What needs help today?” over ritualized filler
- **hybrid-async-plus-live** — treat written updates as the base layer and the live sync as escalation only
- **classic-three-questions** — keep only if it still stays short, lateral, and work-focused
- **none** — say which board/doc/channel replaces the ritual and exactly when the team should pull an ad hoc huddle

### Step 7: Route adjacent PM work explicitly
Before finalizing, say when the next job changed:
- use `task-planning` for backlog cleanup, sprint prep, or scope slicing
- use `task-estimation` for effort, confidence, or capacity disputes
- use `sprint-retrospective` when repeated daily-sync pain should become a process change
- do **not** turn this skill into roadmap planning, status theater, or incident command

## Output format
Always return a **Coordination Cadence Brief** with these qualities:
- exactly one cadence decision
- exactly one primary mode or `none`
- one small evidence packet
- explicit separation between core sync and follow-up huddle when a sync exists
- explicit replacement path when the answer is `no-recurring-standup`
- visible blocker / handoff routing
- short reusable template
- clear route-outs to the rest of the PM cluster when the job changes

## Examples

### Example 1: Overlong sprint standup
**Input**
> Tomorrow’s standup keeps running 25 minutes because everyone gives long updates. We have two blockers and one item waiting for review.

**Good output direction**
- cadence: `live-daily`
- mode: `board-walk` or `blocker-first`
- blocked and in-progress work comes first
- follow-up huddle only for the blocked items
- anti-pattern callout: no round-robin biographies

### Example 2: Distributed team
**Input**
> We have engineers in California, Europe, and Korea. Should our daily standup be async?

**Good output direction**
- cadence: `async-daily` or `hybrid-daily`
- mode: `async-check-in` or `hybrid-async-plus-live`
- written template centered on movement, blockers, and help needed
- explicit escalation path for urgent coordination

### Example 3: Manager-facing status theater
**Input**
> Our daily scrum feels like reporting to the manager. Fix it without changing our whole process.

**Good output direction**
- cadence may stay `live-daily`, but the answer must justify it rather than assume it
- mode: `board-walk` or `blocker-first`
- names status theater directly
- keeps the sync lateral and work-focused
- routes recurring ceremony pain to `sprint-retrospective`

### Example 4: Daily ritual no longer justified
**Input**
> Most of our work is independent and already tracked in Linear. The daily standup feels like obligation, not coordination. Should we keep it?

**Good output direction**
- cadence: `less-frequent-sync` or `no-recurring-standup`
- mode: `none` if the ritual should disappear
- replacement path uses board hygiene plus explicit blocker escalation
- review trigger says when the team should re-introduce temporary daily cadence

## Best practices
1. **Optimize for work movement, not recital** — the ritual should clarify today’s coordination job.
2. **Justify cadence before format** — first decide whether daily is warranted at all.
3. **Choose the lightest mode that still catches risk** — not every team needs the same ceremony weight.
4. **Triage blockers in the sync, solve them elsewhere** — follow-up huddles are a feature, not a failure.
5. **Protect maker time** — async or hybrid modes often beat default live meetings for distributed teams.
6. **Treat source-of-truth hygiene as a first-class issue** — stale boards and missing updates are real blockers.
7. **Route repeated pain outward** — planning, estimation, retrospectives, and incident work are different jobs.

## References
- Scrum Guide — https://scrumguides.org/scrum-guide.html
- Scrum.org, *What is a Daily Scrum?* — https://www.scrum.org/resources/what-is-a-daily-scrum
- Atlassian, *Standups for agile teams* — https://www.atlassian.com/agile/scrum/standups
- GitLab Handbook, *Asynchronous communication* — https://handbook.gitlab.com/handbook/company/culture/all-remote/asynchronous/
- Martin Fowler / Jason Yip, *It’s Not Just Standing Up* — https://martinfowler.com/articles/itsNotJustStandingUp.html
