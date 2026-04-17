---
title: Task Planning Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, project-management]
sources: [.survey/task-planning-structural-hardening-20260418/triage.md, .survey/task-planning-structural-hardening-20260418/context.md, .survey/task-planning-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Task Planning Structural Hardening 2026-04-18

## Question
What is the best bounded next improvement for the repo's `task-planning` lane after the PM modernization wave?

## Decision
Harden `task-planning` in place instead of adding another PM wrapper. The durable fix is to shrink the front door into a routing-first planning anchor, keep one primary planning mode per run, separate discovery from delivery explicitly, and sync the compact/manifest discovery surfaces so the repo stops advertising a stale software-only / user-story-only picture.

## Why this won
- `graphify-out/GRAPH_REPORT.md` still flagged `task-planning` as a high-degree node and an oversized front door.
- Neighboring PM skills already own sizing (`task-estimation`), daily cadence (`standup-meeting`), and reflection (`sprint-retrospective`), so a new wrapper would only blur boundaries.
- Repo-local manifests (`skills.json`, `skills.toon`, `SKILL.toon`) still lagged the live skill wording.

## Accepted changes
- Rewrote `task-planning/SKILL.md` around primary mode selection, discovery-vs-delivery split, packet-shape choice, and explicit route-outs.
- Added `references/modes-and-handoffs.md` and `references/packet-shapes.md`.
- Expanded `evals/evals.json` with launch and board-control boundary coverage.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, and README discovery wording.

## Rejected alternatives
- Adding another backlog / sprint / delivery wrapper.
- Merging sizing or board-control behavior into `task-planning`.
- Leaving the stale compact and manifest surfaces untouched after rewriting the front door.

## Related pages
- [[project-management-cluster]]
- [[skill-support-coverage]]
- [[task-planning-modernization-2026-04-12]]
- [[task-estimation-modernization-2026-04-12]]
- [[standup-meeting-modernization-2026-04-12]]
- [[sprint-retrospective-modernization-2026-04-12]]
