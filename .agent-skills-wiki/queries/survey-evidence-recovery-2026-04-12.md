---
title: Survey Evidence Recovery 2026-04-12
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, survey, trigger-design, skill-quality, docs, graphify]
sources: [.survey/survey-evidence-recovery-20260412/triage.md, .survey/survey-evidence-recovery-20260412/context.md, .survey/survey-evidence-recovery-20260412/solutions.md, .survey/survey-evidence-recovery-20260412/platform-map.md, .agent-skills/survey/SKILL.md, .agent-skills/survey/references/evidence-recovery-ladder.md, graphify-out/GRAPH_REPORT.md]
---

# Survey Evidence Recovery 2026-04-12

## Question
What is the highest-leverage bounded improvement for the `survey` skill right now?

## Answer
Harden `survey` as the repo's evidence-recovery gate instead of adding another nearby research skill: make the fallback ladder explicit, add reusable support files, and update discovery surfaces so maintainers know the skill can keep working through broken search/extract runs.

## Accepted changes
- Expanded `survey/SKILL.md` with a clearer trigger-oriented description, an explicit evidence-recovery ladder, and standardized `Instructions`, `Examples`, `Best practices`, and `References` sections.
- Added `survey/references/evidence-recovery-ladder.md` so direct retrieval, feed recovery, snippet recovery, and thin-evidence stops are reusable instead of buried in old survey artifacts.
- Added `survey/evals/evals.json` covering API-auth failure, URL drift, and snippet-only recovery scenarios.
- Updated README, README.ko, setup prompt, and `skills.json`/`skills-lock.json` so discovery surfaces reflect the stronger evidence-recovery role.
- Refreshed `graphify-out/` so structural memory records `survey` as a support-backed anchor rather than a support-light generic skill.

## Rejected alternatives
- Adding a second research-hardening skill would create overlap instead of improving the main survey entry point.
- Leaving the new evidence-recovery tactics only in run-specific survey artifacts would force future loops to rediscover them.
- Going broader than `survey` in the same loop would dilute the bounded keep-or-revert comparison.

## Related pages
- [[skill-support-coverage]]
- [[frontend-skill-canonicalization]]
- [[marketing-skill-canonicalization-2026-04-12]]
