---
title: File Organization Structural Hardening 2026-04-17
created: 2026-04-17
updated: 2026-04-17
type: query
tags: [skills, survey, consolidation, trigger-design, skill-quality, docs, game-dev]
sources: [.survey/file-organization-structural-hardening-20260417/triage.md, .survey/file-organization-structural-hardening-20260417/context.md, .survey/file-organization-structural-hardening-20260417/solutions.md, .survey/file-organization-structural-hardening-20260417/loop-charter.md, .survey/file-organization-structural-hardening-20260417/loop-results.md, .agent-skills/file-organization/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# File Organization Structural Hardening 2026-04-17

## Question
After the 2026-04-15 modernization, should the repo add another project-structure wrapper or shrink the still-dense `file-organization` front door into a smaller routing-first skill?

## Answer
Shrink the existing canonical `file-organization` skill in place.

The boundary was already correct: `file-organization` owns repository-shape choice and migration packets across frontend, backend, monorepo, docs, and engine-aware game layouts. The remaining problem was structural. The main `SKILL.md` still carried too much repo-type walkthrough and output-template bulk for a discovery surface, even though the support files already held the durable decision ladder.

## Why this beat adding a new skill
- The developer-workflow cluster already has adjacent specialists for search (`codebase-search`), automation (`workflow-automation`), runnable environments (`system-environment-setup`), subsystem structure (`design-system`, `state-management`), and game-production routing (`bmad-gds`).
- Another repo-structure wrapper would only increase overlap and make route boundaries worse.
- `file-organization` already has high discovery weight in README / setup / manifest surfaces, so shrinking it compounds more value than inventing another entry point.

## Durable boundary
Use `file-organization` when the main question is:
> how should this repository be structured next, and how do we improve it without a risky all-at-once rewrite?

Route out when the real question changes:
- finding current files → `codebase-search`
- generators, task runners, or enforcement → `workflow-automation`
- Docker/devcontainers/toolchains/services needed to run the repo → `system-environment-setup`
- frontend state ownership → `state-management`
- shared UI or design-token package boundaries → `design-system`
- game-production phase routing → `bmad-gds`

## Accepted changes
- Shrunk `file-organization/SKILL.md` from 357 lines to 233 while keeping the decision ladder and boundary packet
- Let existing references carry more of the repo-type detail instead of duplicating it in the front door
- Refreshed `SKILL.toon`
- Expanded eval coverage with backend-service and docs-taxonomy cases
- Refreshed graph and wiki notes so future runs see the lane as a dense-anchor cleanup problem, not a missing-skill gap

## Rejected alternatives
- Adding another generic project-structure or monorepo wrapper
- Re-expanding the front door with more repo-type walkthrough detail
- Letting the skill drift into code search, automation, environment setup, or game-production planning

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[file-organization-modernization-2026-04-15]]
- [[codebase-search-modernization-2026-04-14]]
- [[workflow-automation-modernization-2026-04-13]]
- [[game-development-cluster]]
