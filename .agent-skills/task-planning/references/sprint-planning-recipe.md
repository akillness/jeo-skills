# Sprint Planning Recipe

Merged into `task-planning` on 2026-09-19 from the former `sprint-plan` skill
(phuryn/pm-skills); that name is recorded in `skills.json` `retired_skills`. Use this recipe
when the packet is a **sprint candidate** (see `planning-patterns.md` horizons) and the
team already has a backlog plus velocity history. Sizing individual items stays with
`task-estimation`; this note only turns ready slices into a committed sprint.

Read what the user provides first: backlog export, velocity data, team roster, PTO
calendar, previous sprint report.

## 1. Capacity

- Team members and availability: PTO, on-call, recurring meetings, part-time allocation.
- Historical velocity: average completed points over the last 3 sprints (drop an outlier
  sprint only with a stated reason).
- Buffer: reserve **15-20%** for bugs, interrupts, and tech debt.
- `available = avg_velocity × availability_ratio − buffer` (points or ideal hours — use
  whatever the team already tracks).

## 2. Select stories against a Definition of Ready

Pull from the prioritized backlog, highest first. A story is ready only if it has clear
acceptance criteria, an estimate, and no open blocker. Flag anything that fails the gate as
*needs refinement* — never commit it to fill capacity. Stop adding when `available` is
reached.

## 3. Map dependencies and the critical path

- Story-to-story dependencies and their order
- External-team or vendor dependencies, with a named owner and a date
- The critical path: the chain that, if it slips, moves the sprint goal

## 4. Name the risks and a mitigation each

- high-uncertainty or high-complexity stories
- external dependencies that could slip
- knowledge concentration (only one person can do it)

## 5. Write the sprint goal

One sentence describing what success looks like at the end of the sprint — the outcome,
not the list of stories.

## 6. Sprint plan summary

```text
Sprint goal: <one sentence>
Duration: <1 week | 2 weeks | ...>
Team capacity: <x points> (velocity <avg> × availability <r> − buffer <b>)
Committed: <y points> across <z stories>
Buffer left: <x − y>

Stories:
1. <title> — <points> — <owner> — depends on: <...>
...

Needs refinement (not committed): ...

Risks:
- <risk> → <mitigation>
```

Deliver it as markdown next to the planning packet, and hand estimation disputes to
`task-estimation`, daily follow-through to `standup-meeting`, and the end-of-sprint review
to `sprint-retrospective`.
