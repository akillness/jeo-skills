---
title: Backend API Cluster
created: 2026-04-12
updated: 2026-04-12
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [.survey/api-design-modernization-20260412/context.md, graphify-out/GRAPH_REPORT.md]
---

# Backend API Cluster

## Durable finding
The backend API lane works better when each backend skill owns a distinct handoff instead of sharing vague “backend best practices” territory.

Canonical split:
- `api-design` — contract-first API design, resource/type modeling, naming, auth/error/versioning semantics, compatibility review, and downstream handoff
- `backend-testing` — backend verification planning across unit, integration, contract/API, fixture strategy, dependency realism, and CI-vs-local execution
- `api-documentation` — published docs, examples, tutorials, portals, and developer-facing presentation of the contract
- `authentication-setup` — concrete auth implementation
- `database-schema-design` — storage-model design

## Why it matters
Without that split, both `api-design` and `api-documentation` get triggered by “write an OpenAPI spec,” which makes discovery noisy and weakens the handoff story.

The stronger pattern is:
1. `api-design` defines the contract and compatibility stance.
2. `backend-testing` verifies the boundary with explicit layer, fixture, and dependency choices.
3. Adjacent backend skills implement or support the boundary without collapsing into one generic lane.
4. `api-documentation` turns the stable contract into developer-facing docs and examples.

## Operational rule
When upgrading backend contract skills:
- keep the primary trigger on contract decisions, not docs publishing
- make REST vs GraphQL choice explicit
- include compatibility / deprecation guidance
- route auth, testing, and storage work to their neighboring skills instead of absorbing them

## Related pages
- [[skill-support-coverage]]
- [[api-design-modernization-2026-04-12]]
- [[backend-testing-modernization-2026-04-12]]
