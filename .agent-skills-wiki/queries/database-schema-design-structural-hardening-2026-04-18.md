---
title: Database schema design structural hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/database-schema-design-structural-hardening-20260419/triage.md, .survey/database-schema-design-structural-hardening-20260419/context.md, .survey/database-schema-design-structural-hardening-20260419/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Database schema design structural hardening 2026-04-18

## Question
What is the best bounded next improvement for `database-schema-design` after the 2026-04-14 modernization pass?

## Decision
Harden `database-schema-design` in place instead of adding another backend/database wrapper. The durable fix is to shrink the front door into a packet-first storage-design anchor that chooses one data lane, one smallest useful artifact, and explicit route-outs to API, auth, testing, reporting, and observability neighbors.

## Why this won
- `graphify-out/GRAPH_REPORT.md` still flagged `database-schema-design` on the oversized watchlist.
- The existing backend cluster already had adjacent anchors for contract shape, auth ownership, verification, reporting, and observability; a new wrapper would only blur those boundaries.
- `SKILL.toon`, `skills.toon`, and README/setup wording were lagging the sharper trigger surface of the live skill.

## Accepted changes
- Rewrote `database-schema-design/SKILL.md` around packet selection, minimum credible evidence, explicit queryable-vs-flexible field decisions, and route-outs.
- Added `references/intake-packets-and-route-outs.md`.
- Expanded `evals/evals.json` with marketing/customer-data and game/live-ops cases.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, README, README.ko, and setup discovery wording.
- Refreshed `graphify-out/` after the structural change.

## Rejected alternatives
- Adding another generic schema/migration helper.
- Letting `database-schema-design` absorb dashboard/reporting or telemetry-observability work.
- Leaving compact/manifest discovery surfaces stale after tightening the front door.

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[database-schema-design-modernization-2026-04-14]]
- [[api-design-modernization-2026-04-12]]
- [[authentication-setup-structural-hardening-2026-04-17]]
