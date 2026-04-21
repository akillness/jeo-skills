---
title: Performance optimization modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/performance-optimization-modernization-20260414/triage.md, .survey/performance-optimization-modernization-20260414/context.md, .survey/performance-optimization-modernization-20260414/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Performance optimization modernization 2026-04-14

## Question
What was the best bounded next improvement after the `code-refactoring` modernization: add another performance-related wrapper or modernize the legacy `performance-optimization` anchor itself?

## Why this came next
- The code-quality cluster already had clearer roles for refactoring, debugging, review, and testing policy, which made `performance-optimization` the next weak high-visibility anchor.
- The old skill was still a generic React/database optimization dump with weak trigger precision, no support files, and almost no route-outs to neighboring skills.
- Repo scan plus the structural graph kept pointing to the same maintenance rule: upgrade the canonical anchor with support files instead of adding another overlapping wrapper.

## Survey takeaway
Cross-domain performance evidence converged on the same workflow:
1. establish a baseline,
2. choose the right profiling artifact,
3. isolate the narrowest bottleneck,
4. try one or two high-leverage changes,
5. verify before/after impact.

That pattern held across frontend interaction tuning, page-load and bundle work, backend/API hot paths, database plan tuning, load/capacity checks, and runtime/game-adjacent frame-budget work.

## Decision
Keep `performance-optimization` as the canonical code-quality lane for measurement-led tuning.

Do **not** add another generic performance wrapper.

Instead:
- rewrite the skill around bottleneck modes and evidence selection
- add route-outs to `monitoring-observability`, `debugging`, `code-refactoring`, `testing-strategies`, and `game-performance-profiler`
- add support files that make the tuning workflow reusable and ratchetable

## Accepted changes
- Rewrote `performance-optimization` into a measurement-led bottleneck-analysis and tuning skill.
- Added `references/tuning-modes.md`.
- Added `references/handoff-boundaries.md`.
- Added `references/measurement-checklist.md`.
- Added `evals/evals.json`.
- Updated `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json` so discovery surfaces reflect the sharper role.
- Refreshed `graphify-out/` after the support-coverage change.

## Rejected changes
- Adding another generic performance wrapper for web/backend optimization
- Folding telemetry setup into this skill instead of routing to `monitoring-observability`
- Treating correctness debugging or generic refactoring as part of the same skill
- Letting engine-specific Unity/Unreal capture interpretation replace `game-performance-profiler`

## Durable insight
The code-quality cluster is stronger when `performance-optimization` owns **measurement-led tuning** while neighboring skills own telemetry setup, correctness diagnosis, structural cleanup, and test-policy design. The best maintenance move was another anchor upgrade with support bundles, not a new duplicate.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[code-refactoring-modernization-2026-04-14]]
- [[debugging-modernization-2026-04-13]]
- [[testing-strategies-modernization-2026-04-13]]
