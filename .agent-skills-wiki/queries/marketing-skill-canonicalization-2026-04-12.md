---
title: Marketing Skill Canonicalization 2026-04-12
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, consolidation, trigger-design, marketing, docs]
sources: [.survey/marketing-skill-canonicalization-20260412/triage.md, .survey/marketing-skill-canonicalization-20260412/context.md, .survey/marketing-skill-canonicalization-20260412/solutions.md, .agent-skills/marketing-automation/SKILL.md, .agent-skills/marketing-skills-collection/SKILL.md]
---

# Marketing Skill Canonicalization 2026-04-12

## Question
What is the highest-leverage bounded fix for the `marketing-automation` / `marketing-skills-collection` overlap?

## Answer
Keep `marketing-automation` as the canonical general marketing router and convert `marketing-skills-collection` into a narrow compatibility alias.

## Accepted changes
- Rewrote `marketing-automation/SKILL.md` to own the broad marketing intake/routing lane with one KPI, one chosen lane, and one implementation-ready packet.
- Rewrote `marketing-skills-collection/SKILL.md` into a migration-safe alias instead of a peer default skill.
- Added `marketing-automation/references/` guidance plus evals for both marketing skills.
- Updated README, README.ko, setup prompt, and `skills.json` so the catalog reflects canonical-vs-alias status.
- Refreshed `graphify-out/` so the structural memory layer records the marketing pair as a canonical/alias pattern.

## Rejected alternatives
- Keeping both as peer marketing skills would preserve discovery ambiguity.
- Hard-deleting `marketing-skills-collection` now would create unnecessary migration risk.
- Adding a third general marketing wrapper would repeat the same catalog problem.

## Related pages
- [[marketing-cluster]]
- [[skill-support-coverage]]
