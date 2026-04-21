---
title: Standup Cadence Gate Ratchet
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/standup-cadence-gate-ratchet-20260420/triage.md, .survey/standup-cadence-gate-ratchet-20260420/context.md, .survey/standup-cadence-gate-ratchet-20260420/solutions.md, .agent-skills/standup-meeting/SKILL.md, .agent-skills/standup-meeting/references/cadence-gates-and-exceptions.md]
---

# Standup Cadence Gate Ratchet

## Question
What is the best bounded next improvement for `standup-meeting` after the 2026-04-19 routing-first hardening pass?

## Answer
The best bounded improvement is **not another standup subtype**. It is an earlier truth gate: before `standup-meeting` picks board-walk, blocker-first, async, hybrid, or classic-three-questions, it should first decide whether a recurring daily standup is justified at all.

## Why this won
- The PM cluster already has good ownership boundaries. `task-planning`, `task-estimation`, `standup-meeting`, and `sprint-retrospective` do not need another adjacent wrapper.
- Primary-source guidance still frames Daily Scrum / standups as short coordination events for active delivery risk, not permanent status rituals.
- Async-first operating models and practitioner snippets show that teams often replace live daily standups with written updates, lighter cadence, or no recurring ritual when work is loosely coupled.
- Cross-domain evidence in this run showed the same pattern across software/dev, product/ops, marketing/GTM, and game delivery: temporary high-risk windows justify tighter cadence, but permanent daily ritual often survives mainly by inertia.

## Accepted ratchet
- Add a **cadence decision** before standup-mode selection: `live-daily`, `async-daily`, `hybrid-daily`, `less-frequent-sync`, or `no-recurring-standup`.
- Keep one primary mode only when cadence still includes a standup shape.
- Add a durable support reference for cadence gates, temporary exceptions, and explicit replacement paths when the answer is `no-recurring-standup`.
- Expand evals with a "remove the daily ritual" case and a temporary launch-week cadence case.
- Sync discovery wording across compact and repo-level surfaces so the skill is discoverable as a cadence truth skill, not just a standup-format picker.

## Rejected alternatives
- Adding another async-checkin / ceremony / PM wrapper skill.
- Re-expanding `standup-meeting` into planning or retrospective territory.
- Treating daily cadence as the default forever and only debating live vs async format.

## Related pages
- [[project-management-cluster]]
- [[standup-meeting-modernization-2026-04-12]]
- [[standup-meeting-structural-hardening-2026-04-19]]
- [[task-planning-packet-ratchet-2026-04-20]]
