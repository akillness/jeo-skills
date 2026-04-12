---
title: Design System Canonicalization 2026-04-12
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, consolidation, trigger-design, frontend, docs]
sources: [.survey/frontend-design-system-canonicalization-20260412/triage.md, .survey/frontend-design-system-canonicalization-20260412/context.md, .survey/frontend-design-system-canonicalization-20260412/solutions.md, .agent-skills/design-system/SKILL.md, .agent-skills/frontend-design-system/SKILL.md]
---

# Design System Canonicalization 2026-04-12

## Question
What is the highest-leverage bounded fix for the `design-system` / `frontend-design-system` overlap?

## Answer
Keep `design-system` as the canonical frontend UI-system skill and convert `frontend-design-system` into a narrow compatibility alias.

## Accepted changes
- Rewrote `design-system/SKILL.md` to clearly own general UI-system work with stronger trigger language.
- Rewrote `frontend-design-system/SKILL.md` into a compatibility alias instead of a peer default skill.
- Added `design-system/references/scope-boundaries.md` plus evals for both skills.
- Updated README, README.ko, setup prompt, and `skills.json` so the catalog reflects canonical-vs-alias status.
- Added duplicate-handling guidance to `skill-standardization` so the pattern transfers beyond this pair.

## Rejected alternatives
- Keeping both as peer frontend skills would preserve trigger ambiguity.
- Hard-deleting `frontend-design-system` now would be riskier than narrowing it to a compatibility alias.
- Splitting the pair into two truly different frontend jobs was not justified by the existing content.

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
