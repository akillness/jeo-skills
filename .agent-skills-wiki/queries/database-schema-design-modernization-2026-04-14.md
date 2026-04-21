---
title: Database schema design modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/database-schema-design-modernization-20260414/triage.md, .survey/database-schema-design-modernization-20260414/context.md, .survey/database-schema-design-modernization-20260414/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Database schema design modernization 2026-04-14

## Question
What was the best bounded next backend-cluster improvement after the recent auth, API, testing, and search-analysis upgrades: add another storage/database wrapper or modernize the remaining legacy `database-schema-design` anchor itself?

## Why this came next
- The README-visible Backend cluster had only one remaining skill without both `references/` and `evals/`: `database-schema-design`.
- The old skill was still a 694-line SQL/NoSQL example dump with weak trigger wording, little boundary guidance, and no modern migration-safety or staged-evolution workflow.
- Repo scan plus the graph report kept pointing to the same maintenance rule: upgrade the canonical anchor with support bundles instead of adding another overlapping backend wrapper.

## Survey takeaway
Cross-source backend evidence converged on one durable pattern:
1. choose the right storage lane,
2. model entities and invariants around real reads/writes,
3. justify constraints and indexes explicitly,
4. plan staged schema evolution for live systems,
5. hand off interface, auth, and verification work to neighboring backend skills.

That pattern showed up across Fowler's evolutionary database framing, Prisma's migration mental model and troubleshooting docs, Atlas's declarative-vs-versioned framing, PostgreSQL's DDL docs, and framework-native migration workflows in Rails and Django.

## Decision
Keep `database-schema-design` as the canonical backend lane for **storage-model and migration-safety design**.

Do **not** add another generic DB-modeling or migration wrapper.

Instead:
- rewrite the skill around storage-lane choice, entity/lifecycle boundaries, integrity rules, access patterns, and staged schema evolution
- add route-outs to `api-design`, `authentication-setup`, `backend-testing`, `api-documentation`, and `security-best-practices`
- add support files that make the schema review and storage-lane choice reusable and ratchetable

## Accepted changes
- Rewrote `database-schema-design` into a storage-model and migration-safety skill.
- Added `references/storage-decision-matrix.md`.
- Added `references/schema-review-checklist.md`.
- Added `evals/evals.json`.
- Updated `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json` so discovery surfaces reflect the sharper role.
- Refreshed `graphify-out/` after the support-coverage change.

## Rejected changes
- Adding another generic schema/migration helper instead of improving the canonical anchor
- Letting the skill absorb API contract design, auth-provider setup, or backend verification planning
- Keeping the old giant vendor/example-heavy dump with weak trigger boundaries

## Durable insight
The backend cluster is stronger when `database-schema-design` owns **storage boundaries plus staged schema evolution** while neighboring skills own API contracts, auth setup, docs, verification, and hardening. The best maintenance move was another anchor upgrade with support bundles, not a new duplicate.

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[api-design-modernization-2026-04-12]]
- [[backend-testing-modernization-2026-04-12]]
- [[authentication-setup-modernization-2026-04-14]]
