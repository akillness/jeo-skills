---
title: Codebase Search Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, search-analysis, trigger-design, skill-quality, survey, graphify]
sources: [.survey/codebase-search-structural-hardening-20260419/context.md, .survey/codebase-search-structural-hardening-20260419/solutions.md, .survey/codebase-search-structural-hardening-20260419/platform-map.md, .agent-skills/codebase-search/SKILL.md]
---

# Codebase Search Structural Hardening 2026-04-19

## Question
What is the best bounded next improvement for `codebase-search` after the 2026-04-14 modernization pass?

## Answer
Shrink `codebase-search` into a routing-first repo-navigation front door that chooses one search packet quickly, covers config/content and game-style repository surfaces honestly, and routes to `debugging`, `code-refactoring`, `code-review`, or `graphify` as soon as search is no longer the bottleneck.

## Why this beat other options
- Survey evidence showed the recurring pain is not lack of search tools; it is uncertainty about **which search surface to use next**.
- Real workflows still mix `ripgrep`, IDE search, hosted repo search, symbol tools, scripts, and occasional graph/structural tools instead of living inside one magical search product.
- The old front door still leaned tutorial-heavy and source-code-centric, which underplayed config/content ownership, hosted repo lookup, and game/infrastructure repo shapes.

## Keep
- `codebase-search` remains the repo-navigation anchor for the search-analysis lane.
- Evidence-map output remains the right deliverable.
- Boundary with `debugging`, `log-analysis`, `code-refactoring`, `code-review`, and `graphify` stays explicit.

## Reject
- Adding another search-adjacent wrapper skill.
- Letting `codebase-search` absorb runtime diagnosis, refactoring execution, or full architecture graphing.
- Treating search as code-only when many real requests are about config, content, templates, scenes, assets, or build surfaces.

## Durable notes
- Packet vocabulary is the transferable win: exact-text, symbol/indexed, structural, config/content, hosted search, graph/path trace.
- README/setup discovery wording matters because `codebase-search` is high-visibility and referenced by neighboring skills.
- Search-analysis maintenance should continue preferring smaller front doors plus support bundles over giant command catalogs.

## Related pages
- [[search-analysis-cluster]]
- [[codebase-search-modernization-2026-04-14]]
- [[code-refactoring-modernization-2026-04-14]]
- [[log-analysis-modernization-2026-04-13]]
- [[pattern-detection-modernization-2026-04-14]]
