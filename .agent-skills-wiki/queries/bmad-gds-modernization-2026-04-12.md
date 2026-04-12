---
title: BMAD-GDS Modernization 2026-04-12
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, survey, trigger-design, skill-quality, game-dev, docs]
sources: [.survey/bmad-gds-modernization-20260412/triage.md, .survey/bmad-gds-modernization-20260412/context.md, .survey/bmad-gds-modernization-20260412/solutions.md, .agent-skills/bmad-gds/SKILL.md]
---

# BMAD-GDS Modernization 2026-04-12

## Question
What is the best bounded improvement for `bmad-gds` given the current game-skill cluster?

## Answer
Upgrade `bmad-gds` into the game-production orchestration layer and keep the sharper game specialist skills as downstream lanes.

## Accepted changes
- Rewrote `bmad-gds/SKILL.md` around intake briefs, operating modes, milestone-aware coordination artifacts, and explicit routing rules.
- Added `references/operating-modes.md` and `references/scope-boundaries.md`.
- Added `evals/evals.json` so future loops can ratchet trigger quality and routing behavior.
- Updated README, README.ko, setup prompt, and `skills.json` so discovery surfaces reflect the new positioning.
- Refreshed `graphify-out/` so the structural memory layer records `bmad-gds` as the coordinating node in the game cluster.

## Rejected alternatives
- Adding another overlapping game PM / studio skill in this run.
- Letting `bmad-gds` remain a vague catalog of phases and slash commands.
- Expanding `bmad-gds` into detailed engine-debug or launch-ops behavior that already belongs to narrower skills.

## Related pages
- [[game-development-cluster]]
- [[skill-support-coverage]]
