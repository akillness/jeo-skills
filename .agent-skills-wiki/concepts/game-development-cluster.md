---
title: Game Development Cluster
created: 2026-04-12
updated: 2026-04-18
type: concept
tags: [skills, consolidation, trigger-design, game-dev]
sources: [graphify-out/GRAPH_REPORT.md, .survey/bmad-gds-modernization-20260412/context.md, .survey/bmad-gds-modernization-20260412/solutions.md]
---

# Game Development Cluster

The repository's game-development lane now has a clearer shape:
- `bmad-gds` as the coordinating producer/orchestrator skill
- `game-demo-feedback-triage` for feedback weighting and fix-first recommendations
- `game-build-log-triage` for build/package/editor/CI failures
- `game-performance-profiler` for profiling and bottleneck diagnosis
- `steam-store-launch-ops` for public-facing launch/store operations

Recent refinement:
- `game-performance-profiler` now starts from quick evidence packets, benchmark routes, and packaged-on-device review before escalating to deeper profiler tooling.
- The 2026-04-18 structural-hardening pass then shrank `game-performance-profiler` from 296 to 231 lines, added a dedicated mode-selection / route-out reference, and removed it from the oversized front-door watchlist without changing the cluster boundary.
- The four specialist game-support skills now all ship compact discovery variants, so the game lane is no longer an outlier against the repo's tiered discovery model.
- `steam-store-launch-ops` is strongest as a bottleneck-first public-facing router: keep it focused on Steam-specific visibility, page promise, demo proof, event timing, and launch-ops readiness instead of letting it drift into generic marketing advice or playtest-feedback synthesis.

## Durable finding
- The cluster did not need another new game skill in this run.
- The higher-leverage move was to modernize `bmad-gds` so it routes into the sharper specialist skills instead of overlapping with them.
- The main abstraction for this cluster is **coordination first, specialist depth second**.

## Implications
- `bmad-gds` should own mixed game-production packets and milestone-aware next-artifact decisions.
- The specialist skills should stay narrow and deterministic.
- `game-performance-profiler` should own runtime frame-time triage plus next-capture choice; it should not collapse into generic app tuning or absorb broader player-feedback prioritization.
- `log-analysis` can support mixed app/infra/browser/CI log triage around game projects, but Unity/Unreal editor/build/package logs should still route to `game-build-log-triage`.
- Discovery surfaces matter: the top-level README/setup inventory should continue listing the game specialist lane explicitly so those skills are not discoverable only through cross-links inside `bmad-gds`.
- Future game-cluster work should prefer support upgrades and clearer boundaries over catalog expansion.
- Steam-specific public launch work should stay distinct from `game-demo-feedback-triage`: the former chooses launch/store interventions, the latter weighs gameplay/player-feedback evidence.

## Related pages
- [[skill-support-coverage]]
- [[bmad-gds-modernization-2026-04-12]]
- [[log-analysis-modernization-2026-04-13]]
- [[steam-store-launch-ops-structural-hardening-2026-04-17]]
