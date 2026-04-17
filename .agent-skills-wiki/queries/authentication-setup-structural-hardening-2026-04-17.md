---
title: Authentication Setup Structural Hardening 2026-04-17
created: 2026-04-17
updated: 2026-04-17
type: query
tags: [skills, survey, trigger-design, skill-quality, backend]
sources: [.survey/authentication-setup-structural-hardening-20260417/triage.md, .survey/authentication-setup-structural-hardening-20260417/context.md, .survey/authentication-setup-structural-hardening-20260417/solutions.md, .survey/authentication-setup-structural-hardening-20260417/loop-charter.md, .agent-skills/authentication-setup/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Authentication Setup Structural Hardening 2026-04-17

## Question
What is the best bounded next backend/fullstack improvement after `authentication-setup` was already modernized and support-complete, given the graph's current emphasis on dense-anchor cleanup instead of new skill creation?

## Decision
Harden `authentication-setup` in place by shrinking the front door, moving enterprise/migration nuance into a focused reference, and tightening the packet-oriented routing shape instead of creating another auth wrapper.

## Why this won
- Graphify showed the repo had already reached full support coverage, so the next leverage came from oversized front doors rather than missing `references/` or `evals/`.
- `authentication-setup` still sat on the oversized watchlist at 337 lines even though the backend boundary itself was already correct.
- Primary docs and issue signals kept reinforcing the same reality: auth setup is a lane-selection and boundary problem with recurring friction around sessions, organizations, enterprise add-ons, and environment drift—not a missing-skill problem.

## Accepted changes
- Shrink `authentication-setup/SKILL.md` from 337 lines to 251 while preserving the same hosted/framework-native/platform-native/enterprise/self-hosted coverage.
- Add `references/enterprise-and-migration-notes.md` for SSO/SCIM, domain mapping, account linking, provider migration, and self-hosted cutover detail.
- Refresh `SKILL.toon` so the compact discovery surface matches the new routing-first shape.
- Expand `evals/evals.json` with a self-hosted migration case while keeping route-outs explicit.
- Refresh graph outputs and wiki notes so future runs see the backend lane as a cleaner dense-anchor pattern.

## Rejected alternatives
- Adding another auth setup wrapper, enterprise-auth wrapper, or migration-only auth skill.
- Re-expanding the main skill with more provider detail instead of using support packets.
- Updating README / README.ko / setup prompt just for cosmetic wording churn when the discovery positioning stayed materially correct.

## Durable takeaway
The backend lane is strongest when `authentication-setup` stays a compact router for auth-lane choice, provider-vs-app ownership, session strategy, and enterprise/migration branching—while `security-best-practices`, `api-design`, `api-documentation`, `backend-testing`, and `database-schema-design` keep their own adjacent surfaces.

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[authentication-setup-modernization-2026-04-14]]
- [[api-documentation-modernization-2026-04-13]]
- [[security-best-practices-modernization-2026-04-14]]
