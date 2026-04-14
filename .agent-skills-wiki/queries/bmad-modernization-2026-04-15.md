---
title: bmad modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/bmad-modernization-20260415/triage.md, .survey/bmad-modernization-20260415/context.md, .survey/bmad-modernization-20260415/solutions.md, .agent-skills/bmad/SKILL.md]
---

# bmad modernization 2026-04-15

## Question
What is the best bounded improvement for `bmad` given the repo's current orchestration stack and the upstream BMAD direction?

## Answer
Modernize `bmad` into the portable BMAD/BMM core router: choose project level, identify the current phase, recommend one next artifact, and route runtime-specific or specialist depth outward instead of keeping a giant command catalog inside the main skill body.

## Accepted changes
- Rewrote `.agent-skills/bmad/SKILL.md` around level selection, phase detection, next-artifact routing, and explicit handoffs.
- Added `references/core-routing.md`, `references/status-and-review.md`, and `references/runtime-and-module-boundaries.md`.
- Added `evals/evals.json`.
- Updated `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `docs/bmad/README.md`, and `.agent-skills/skills.json` so discovery surfaces match the stronger role.

## Rejected changes
- Adding another BMAD-adjacent wrapper skill.
- Keeping runtime-specific setup, review-gate detail, TEA depth, and module catalogs inside the main `bmad` trigger surface.

## Why this should stick
This matches the repo's now-durable pattern: a narrow anchor skill plus references and downstream specialists (`plannotator`, `task-planning`, `omc`, `omx`, `ohmg`, `bmad-gds`) instead of a monolithic catch-all.

## Links
- [[skill-support-coverage]]
- [[core-orchestration-platform-cluster]]
- [[bmad-gds-modernization-2026-04-12]]
- [[ohmg-modernization-2026-04-15]]
