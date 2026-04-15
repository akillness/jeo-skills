---
title: File Organization Modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, consolidation, trigger-design, skill-quality, docs, game-dev]
sources: [.survey/file-organization-modernization-20260415/triage.md, .survey/file-organization-modernization-20260415/context.md, .survey/file-organization-modernization-20260415/solutions.md, .survey/file-organization-modernization-20260415/platform-map.md, .agent-skills/file-organization/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# File Organization Modernization 2026-04-15

## Question
Should the repo add another project-structure wrapper skill, or modernize the existing `file-organization` skill into a clearer boundary?

## Answer
Modernizing `file-organization` was the better bounded move.

The old skill was highly discoverable but low-signal: it mostly dumped example folder trees for React/Next.js and Node/Express, with weak trigger wording, no migration guidance, no support files, and almost no treatment of docs/ops or game-development repositories.

The survey showed that real-world structure decisions are usually not about picking one canonical tree. They are about choosing the **lowest-complexity structure that fits the current repo shape**:
- keep framework or engine defaults when they already solve the problem,
- escalate to feature/domain grouping when change locality matters,
- escalate to `apps/` + `packages/libs/` when multi-app or multi-package boundaries appear,
- use docs taxonomy for docs/ops repos,
- use engine-aware hybrids for Unity/Unreal-style code + content repos.

## Why this beat adding a new skill
- The repo already had adjacent skills for search (`codebase-search`), automation (`workflow-automation`), environment setup (`system-environment-setup`), frontend subsystem boundaries (`state-management`, `design-system`), and game-production orchestration (`bmad-gds`).
- Another wrapper skill would have increased overlap instead of clarifying the route-outs.
- `file-organization` already had top-level discovery weight in README / setup surfaces, so upgrading it compounds more value than creating a new name.

## Durable boundary
Use `file-organization` when the main question is:
> how should this repository be structured next, and how do we improve it without a risky all-at-once rewrite?

Route out when the real question changes:
- finding existing files → `codebase-search`
- scaffolds / generators / task runners → `workflow-automation`
- runnable environments / Docker / devcontainers → `system-environment-setup`
- frontend state ownership → `state-management`
- shared UI package / design-token boundaries → `design-system`
- game-production phase routing → `bmad-gds`

## Accepted changes
- Rewrote `file-organization` as a decision-first, migration-aware skill
- Added `references/` and `evals/`
- Updated README / README.ko / setup prompt / skill manifests
- Refreshed graph and wiki notes so future runs keep the boundary straight

## Rejected alternatives
- Adding another generic repo-structure / monorepo-structure wrapper
- Keeping the skill as a static scaffold catalog
- Letting the skill absorb search, automation, or environment setup responsibilities

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[workflow-automation-modernization-2026-04-13]]
- [[codebase-search-modernization-2026-04-14]]
- [[bmad-gds-modernization-2026-04-12]]
