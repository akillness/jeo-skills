---
title: API Documentation Modernization 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/api-documentation-modernization-20260413/triage.md, .survey/api-documentation-modernization-20260413/context.md, .survey/api-documentation-modernization-20260413/solutions.md, .survey/api-documentation-modernization-20260413/loop-charter.md, graphify-out/GRAPH_REPORT.md]
---

# API Documentation Modernization 2026-04-13

## Question
What is the best bounded next modernization target after `technical-writing` and `user-guide-writing`, given the need to keep the documentation cluster sharp without adding another overlapping wrapper?

## Decision
Modernize `api-documentation` into the developer-facing API-docs anchor instead of adding a new portal/docs wrapper or broadening neighboring skills.

## Why this won
- The broad opportunity scan across CLI/dev workflow, web/product/ops, marketing/content, and game-dev-adjacent workflows showed that API documentation remains a stable, repeated job with durable categories: reference docs, quickstarts, integration guides, SDK/webhook guidance, and migration updates.
- `api-design` already owns contract-first design; `technical-writing` already owns internal docs; `user-guide-writing` already owns customer help. The cleanest next move was finishing the remaining documentation-cluster anchor.
- The legacy `api-documentation` skill was a long OpenAPI/Swagger example dump without support files or clear route-outs, so modernization produced more leverage than inventing another docs wrapper.

## Accepted changes
- Rewrite `api-documentation` as a workflow-first developer-docs skill.
- Add `references/` for mode selection, example quality, and drift control.
- Add `evals/evals.json` that test reference/quickstart/webhook/SDK activation plus route-out to `api-design`.
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces describe the sharper role.
- Refresh graphify outputs and wiki notes so future runs see `api-documentation` as part of the modernized documentation cluster.

## Rejected alternatives
- Adding another documentation wrapper focused on portals or developer experience.
- Merging `api-documentation` into `technical-writing` or `user-guide-writing`.
- Letting the skill absorb contract/interface design work better owned by `api-design`.
- Treating auth implementation or release-note hygiene as part of the same skill.

## Durable takeaway
The documentation cluster improves when each skill owns one documentation job clearly: internal technical docs, developer-facing API docs, customer-facing help docs, and changelog hygiene. `api-documentation` should stay centered on truthful developer-facing publication and drift control, not on contract design or general docs sprawl.

## Related pages
- [[documentation-cluster]]
- [[skill-support-coverage]]
- [[technical-writing-modernization-2026-04-13]]
- [[user-guide-writing-modernization-2026-04-13]]
- [[api-design-modernization-2026-04-12]]
