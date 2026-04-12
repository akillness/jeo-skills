---
title: API Design Modernization 2026-04-12
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [survey, skills, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/api-design-modernization-20260412/triage.md, .survey/api-design-modernization-20260412/context.md, .survey/api-design-modernization-20260412/solutions.md, .agent-skills/api-design/SKILL.md]
---

# API Design Modernization 2026-04-12

## Question
What is the best bounded backend-cluster improvement this run: add a new API workflow skill, rewrite `api-design`, or merge it toward `api-documentation`?

## Answer
Rewrite `api-design` as the contract-first backend anchor and keep `api-documentation` separate.

## Why this won
- Repo-local workflow evidence places API design before implementation, testing, and docs publishing.
- The strongest overlap was both skills claiming spec/OpenAPI authoring without a clear handoff.
- A rewrite plus support files is a better ratchet than adding another backend duplicate.
- Discovery surfaces benefit from sharper wording because README/setup/skills metadata are still high-degree hubs.

## Accepted changes
- Rewrote `api-design` around contract framing, style choice, resource/type modeling, semantics, compatibility review, and handoff quality.
- Added `references/boundary-guide.md` and `references/contract-review-checklist.md`.
- Added `evals/evals.json` with REST, GraphQL, and boundary-routing prompts.
- Updated README / README.ko / setup prompt / `skills.json` so the stronger positioning is discoverable.
- Refreshed graph outputs to capture the backend boundary change and new support coverage.

## Rejected options
- Adding a separate backend contract-governance skill in this run.
- Merging `api-design` into `api-documentation`.
- Expanding `api-design` into auth implementation, testing strategy, or docs portal setup.

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
