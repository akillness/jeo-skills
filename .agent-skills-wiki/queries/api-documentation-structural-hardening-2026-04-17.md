---
title: API Documentation Structural Hardening 2026-04-17
created: 2026-04-17
updated: 2026-04-17
type: query
tags: [skills, survey, trigger-design, skill-quality, docs, graphify]
sources: [.survey/api-documentation-structural-hardening-20260417/triage.md, .survey/api-documentation-structural-hardening-20260417/context.md, .survey/api-documentation-structural-hardening-20260417/solutions.md, .survey/api-documentation-structural-hardening-20260417/loop-charter.md, graphify-out/GRAPH_REPORT.md]
---

# API Documentation Structural Hardening 2026-04-17

## Question
What is the best bounded next improvement for `api-documentation` after its 2026-04-13 modernization pass, now that support coverage is complete but the front door is still oversized?

## Decision
Harden `api-documentation` in place by shrinking the front door into a routing-first skill, moving packet/navigation detail into focused support material, and expanding eval coverage for large-surface portal grouping instead of adding another API-doc wrapper.

## Why this won
- The cross-domain opportunity scan still showed `api-documentation` as one of the largest remaining documentation-cluster anchors, and graphify kept it on the oversized watchlist at 336 lines.
- Mature API-doc surfaces such as Stripe, GitHub, Redocly, ReadMe, and Postman all separate reference, quickstart, SDK, webhook, troubleshooting, changelog, and migration layers instead of collapsing them into one page.
- User issues in Postman, Stoplight, and Docusaurus reinforce that navigation, selective publishing, and grouping remain real API-doc maintenance jobs even when docs are generated from a spec.
- The repo already had `references/` and `evals/`; the next transferable win was structural hardening, not more coverage or another adjacent skill.

## Accepted changes
- Shrink `.agent-skills/api-documentation/SKILL.md` from 336 to 201 lines.
- Add `references/output-packets-and-navigation.md` so mode skeletons and large-surface grouping guidance live in a support packet instead of the front door.
- Expand `evals/evals.json` with a large-portal regrouping / selective-publishing case.
- Refresh `SKILL.toon` and graph artifacts so the documentation lane reflects the tighter routing-first shape.

## Rejected alternatives
- Adding a new developer-portal or API-doc-navigation wrapper.
- Re-expanding `api-documentation` with more embedded templates and checklists.
- Merging API publication into `technical-writing`, `user-guide-writing`, `authentication-setup`, or `changelog-maintenance`.
- Updating README / README.ko / setup prompt when the top-level positioning stayed materially accurate.

## Durable takeaway
After support coverage reaches 100%, the next documentation-cluster wins come from dense-anchor cleanup: keep a small route-selecting front door, put packet templates and navigation rules in references, and strengthen evals around the actual maintenance pain points users still report.

## Related pages
- [[documentation-cluster]]
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[api-documentation-modernization-2026-04-13]]
- [[technical-writing-modernization-2026-04-13]]
- [[user-guide-writing-modernization-2026-04-13]]
