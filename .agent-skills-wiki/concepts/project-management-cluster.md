---
title: Project Management Cluster
created: 2026-04-12
updated: 2026-04-12
type: concept
tags: [skills, consolidation, trigger-design]
sources: [graphify-out/GRAPH_REPORT.md, .survey/task-planning-modernization/context.md, .survey/task-planning-modernization/solutions.md]
---

# Project Management Cluster

The repository's project-management cluster is currently anchored by `task-planning`, `task-estimation`, `standup-meeting`, and `sprint-retrospective`.

## Durable finding
- These skills cover adjacent phases of the same operating loop, but only `task-planning` was still behaving like a generic legacy skill.
- The cluster does **not** need another overlapping PM skill right now.
- The better move is boundary clarification and support upgrades: sharper trigger language, explicit routing to adjacent skills, and eval/reference coverage.

## Implications
- `task-planning` should handle backlog grooming, sprint-prep slicing, and roadmap-to-delivery decomposition.
- `task-estimation` should remain sizing-only.
- `standup-meeting` and `sprint-retrospective` should remain cadence/process skills, not decomposition skills.

## Related pages
- [[skill-support-coverage]]
- [[task-planning-modernization-2026-04-12]]
