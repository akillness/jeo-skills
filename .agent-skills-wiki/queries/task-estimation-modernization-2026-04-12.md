---
title: Task Estimation Modernization 2026-04-12
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, trigger-design, skill-quality, survey]
sources: [.survey/task-estimation-modernization-20260412/triage.md, .survey/task-estimation-modernization-20260412/context.md, .survey/task-estimation-modernization-20260412/solutions.md, .agent-skills/task-estimation/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Task Estimation Modernization 2026-04-12

## Question
What is the highest-leverage way to improve the weakest remaining project-management sizing lane without creating another overlapping PM skill?

## Answer
Upgrade `task-estimation` into a mode-selecting sizing and forecast-language skill instead of adding another planning or forecasting wrapper.

## Accepted changes
- Rewrote `task-estimation/SKILL.md` around estimation modes, anchor-based sizing, confidence/risk framing, split-or-spike decisions, and forecast-safe language.
- Added explicit boundaries to `task-planning`, `standup-meeting`, and `sprint-retrospective`.
- Added `references/` and `evals/` support files.
- Updated README / README.ko / `skills.json` wording so the stronger scope is discoverable.
- Refreshed graph outputs so the PM cluster now shows a clearer planning / estimation / daily coordination / retrospective split.

## Rejected alternatives
- Creating a separate forecasting or capacity-planning skill now would increase overlap.
- Leaving `task-estimation` as a generic point-scale skill would keep the PM cluster's weakest handoff unresolved.
- Folding sizing into `task-planning` would blur the boundary between readiness work and estimate work.

## Related pages
- [[project-management-cluster]]
- [[skill-support-coverage]]
- [[task-planning-modernization-2026-04-12]]
- [[standup-meeting-modernization-2026-04-12]]
- [[sprint-retrospective-modernization-2026-04-12]]
