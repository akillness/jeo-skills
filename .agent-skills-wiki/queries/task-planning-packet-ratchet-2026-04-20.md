---
title: Task Planning Packet Ratchet 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality, project-management]
sources: [.survey/task-planning-next-ratchet-20260420/triage.md, .survey/task-planning-next-ratchet-20260420/context.md, .survey/task-planning-next-ratchet-20260420/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/task-planning/SKILL.md]
---

# Task Planning Packet Ratchet 2026-04-20

## Question
What is the best bounded next improvement for `task-planning` after the earlier routing-first hardening pass?

## Decision
Keep `task-planning` and ratchet it again in place. The best next move is not another PM wrapper: it is shrinking the front door further into a packet-first planning anchor, adding an explicit intake-packets/route-outs reference, and tightening discovery surfaces around decomposition/readiness rather than board or ceremony work.

## Why this won
- `graphify-out/GRAPH_REPORT.md` still listed `task-planning` on the oversized front-door watchlist.
- Official planning/tracking docs reinforced that planning should prepare work for commitment or milestones rather than become the tracking surface itself.
- The project-management cluster is already structurally complete, so another wrapper would only blur boundaries with `task-estimation`, `vibe-kanban`, `plannotator`, `standup-meeting`, `sprint-retrospective`, and `bmad*` skills.

## Accepted changes
- Rewrote `task-planning/SKILL.md` into a smaller packet-first front door (287 lines, down from 294 in the previous revision).
- Added `references/intake-packets-and-route-outs.md` to make packet choice and adjacent route-outs explicit.
- Expanded `evals/evals.json` with a pre-planning concept-framing boundary case.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, README / README.ko, and setup discovery wording.

## Rejected alternatives
- Adding another backlog / sprint / delivery wrapper.
- Letting `task-planning` absorb board control, plan review, or daily/retro ceremony work.
- Pretending thin social/indexed evidence was strong enough to justify a broader market claim than the repo-local structural evidence supported.

## Related pages
- [[project-management-cluster]]
- [[skill-support-coverage]]
- [[task-planning-structural-hardening-2026-04-18]]
- [[task-estimation-structural-hardening-2026-04-19]]
- [[standup-meeting-structural-hardening-2026-04-19]]
- [[sprint-retrospective-structural-hardening-2026-04-18]]
