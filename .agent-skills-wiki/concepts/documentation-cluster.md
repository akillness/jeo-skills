---
title: Documentation Cluster
created: 2026-04-13
updated: 2026-04-13
type: concept
tags: [skills, consolidation, trigger-design, skill-quality, docs, graphify]
sources: [.survey/technical-writing-modernization-20260413/context.md, .survey/technical-writing-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Documentation Cluster

## Cluster members
- `technical-writing` — internal technical-docs anchor for specs, architecture docs, ADRs, runbooks, migration guides, and internal developer guides
- `api-documentation` — published API / SDK / portal docs and developer-facing contract presentation
- `user-guide-writing` — end-user onboarding, tutorials, screenshots, FAQs, and help-center content
- `changelog-maintenance` — release-note hygiene, semver communication, and `CHANGELOG.md` upkeep
- `research-paper-writing` / `presentation-builder` — specialized publishing formats that should not absorb general documentation requests

## Why it matters
The graph-style scan keeps flagging this cluster as a duplicate-prone area. The tools and platforms around docs often market one unified documentation surface, but the repo needs sharper workflow boundaries: internal design/ops docs, API portals, user help, and release-note hygiene are different jobs.

## Durable boundary rule
Treat `technical-writing` as the internal documentation anchor, not the umbrella for every docs request.

Boundary checks:
1. If the request is about API references, portal publishing, or SDK examples, route to `api-documentation`.
2. If the request is about customer onboarding, screenshots, how-to flows, or FAQs, route to `user-guide-writing`.
3. If the request is about shipped changes and version communication, route to `changelog-maintenance`.
4. If the request is about specs, ADRs, architecture docs, runbooks, migration notes, or internal developer guides, keep it in `technical-writing`.

## Current structural note
After the `technical-writing` modernization run, support coverage increased to 49 skills with `references/` and 48 with `evals/`. The docs cluster still needs route-out discipline, but no new wrapper skill was justified.

## Related pages
- [[skill-support-coverage]]
- [[backend-api-cluster]]
- [[technical-writing-modernization-2026-04-13]]
