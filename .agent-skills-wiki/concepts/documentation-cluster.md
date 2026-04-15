---
title: Documentation Cluster
created: 2026-04-13
updated: 2026-04-15
type: concept
tags: [skills, consolidation, trigger-design, skill-quality, docs, graphify]
sources: [.survey/technical-writing-modernization-20260413/context.md, .survey/technical-writing-modernization-20260413/solutions.md, .survey/user-guide-writing-modernization-20260413/context.md, .survey/user-guide-writing-modernization-20260413/solutions.md, .survey/presentation-builder-modernization-20260415/context.md, .survey/presentation-builder-modernization-20260415/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Documentation Cluster

## Cluster members
- `technical-writing` — internal technical-docs anchor for specs, architecture docs, ADRs, runbooks, migration guides, and internal developer guides
- `api-documentation` — published API / SDK / portal docs and developer-facing contract presentation
- `user-guide-writing` — end-user onboarding, tutorials, screenshots, FAQs, and help-center content
- `changelog-maintenance` — release-history / release-notes anchor for `CHANGELOG.md`, migration/deprecation updates, customer/developer release summaries, and lightweight game patch notes
- `research-paper-writing` — specialized academic / manuscript package anchor for claim/evidence mapping, figure-table support, rebuttal workflow, and camera-ready revision; it should not absorb deck, general documentation, or marketing requests
- `presentation-builder` — deck-artifact anchor for investor / roadmap / launch / architecture-demo / workshop / game-pitch slides that need visual review and editable export/handoff

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
After the `technical-writing`, `user-guide-writing`, `api-documentation`, `changelog-maintenance`, `presentation-builder`, and `research-paper-writing` hardening runs, the documentation cluster now has sharper anchors for internal docs, developer-facing API docs, end-user help content, release-history / release-summary work, presentation artifacts, and academic manuscript packages. The latest graph-style scan reports 83 skills with `references/` and 84 with `evals/`; route-out discipline and support-file ratchets still matter more than adding a new wrapper skill.

## Related pages
- [[skill-support-coverage]]
- [[backend-api-cluster]]
- [[technical-writing-modernization-2026-04-13]]
- [[user-guide-writing-modernization-2026-04-13]]
- [[api-documentation-modernization-2026-04-13]]
- [[changelog-maintenance-modernization-2026-04-14]]
- [[presentation-builder-modernization-2026-04-15]]
