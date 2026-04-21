---
title: Project Management Cluster
created: 2026-04-12
updated: 2026-04-20
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [graphify-out/GRAPH_REPORT.md, .survey/task-planning-modernization/context.md, .survey/task-planning-modernization/solutions.md, .survey/task-planning-structural-hardening-20260418/context.md, .survey/task-planning-structural-hardening-20260418/solutions.md, .survey/task-estimation-modernization-20260412/context.md, .survey/task-estimation-modernization-20260412/solutions.md, .survey/task-estimation-structural-hardening-20260419/context.md, .survey/task-estimation-structural-hardening-20260419/solutions.md, .survey/sprint-retrospective-structural-hardening-20260418/context.md, .survey/sprint-retrospective-structural-hardening-20260418/solutions.md]
---

# Project Management Cluster

The repository's project-management cluster is currently anchored by `task-planning`, `task-estimation`, `standup-meeting`, and `sprint-retrospective`.

## Durable finding
- These skills cover adjacent phases of the same operating loop, and the most recent ratchets strengthened that separation instead of adding another overlapping PM skill.
- `task-planning` now owns decomposition and readiness work.
- `task-planning` now also follows the repo's routing-first hardening pattern: choose one planning mode, separate discovery from delivery, keep packet shapes small, and route sizing / boards / review / cadence outward.
- `task-estimation` now owns estimation-mode selection, reference-story calibration, confidence/risk framing, and split-or-spike decisions.
- The 2026-04-19 structural-hardening pass then shrank `task-estimation` into the same routing-first shape as the rest of the cluster: one primary sizing horizon, one compact estimate packet, support-owned route-out detail, and synced compact/discovery surfaces.
- `standup-meeting` now owns daily coordination mode selection: board-walk, blocker-first, async, and hybrid daily syncs.
- The 2026-04-19 structural-hardening pass then moved `standup-meeting` into the same routing-first shape as the rest of the cluster: one chosen daily-sync mode, one small coordination packet, support-owned route-out detail, and a clearer follow-up-huddle boundary.
- The 2026-04-20 cadence-gate ratchet then made `standup-meeting` more truthful: it now decides whether daily cadence is justified at all before choosing a standup mode, with explicit `less-frequent-sync` and `no-recurring-standup` outcomes plus temporary launch/milestone escalation logic.
- `sprint-retrospective` now owns reflection and follow-through mode selection: live retros, async/hybrid retros, milestone postmortems, and action-review resets.
- The 2026-04-18 structural-hardening pass then shrank `sprint-retrospective` into the same routing-first shape as the rest of the cluster: one chosen mode, prior-action review first, packet guidance moved to references, and a stronger route-out to planning / estimation / daily sync work.
- The PM cluster is now structurally consistent across planning, estimation, daily coordination, and retrospective learning, so it benefits more from boundary clarification and discovery-surface truthfulness than from catalog expansion.

## Implications
- `task-planning` should handle backlog grooming, sprint-prep slicing, release packets, and roadmap-to-delivery decomposition without absorbing sizing or board operations.
- `task-estimation` should stay narrow: sizing, uncertainty, forecast-safe language, split/spike guidance, and one estimate packet rather than planning or schedule theater.
- `standup-meeting` should handle cadence truth, daily/lightweight coordination, and blocker routing, not planning or retrospective analysis.
- `sprint-retrospective` should handle process reflection, repeated-theme detection, and a few owned improvement actions, not planning or daily status ritual.

## Related pages
- [[skill-support-coverage]]
- [[task-planning-modernization-2026-04-12]]
- [[task-planning-structural-hardening-2026-04-18]]
- [[task-estimation-modernization-2026-04-12]]
- [[task-estimation-structural-hardening-2026-04-19]]
- [[standup-meeting-modernization-2026-04-12]]
- [[standup-meeting-structural-hardening-2026-04-19]]
- [[standup-cadence-gate-ratchet-2026-04-20]]
- [[sprint-retrospective-modernization-2026-04-12]]
- [[sprint-retrospective-structural-hardening-2026-04-18]]
