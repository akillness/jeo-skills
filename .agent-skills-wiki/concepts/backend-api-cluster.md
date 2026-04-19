---
title: Backend API Cluster
created: 2026-04-12
updated: 2026-04-20
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [.survey/api-design-modernization-20260412/context.md, .survey/database-schema-design-structural-hardening-20260419/context.md, .survey/database-schema-design-structural-hardening-20260419/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Backend API Cluster

## Durable finding
The backend API lane works better when each backend skill owns a distinct handoff instead of sharing vague “backend best practices” territory.

Canonical split:
- `api-design` — contract-first API design, resource/type modeling, naming, auth/error/versioning semantics, compatibility review, and downstream handoff
- `backend-testing` — backend verification planning across unit, integration, contract/API, fixture strategy, dependency realism, and CI-vs-local execution
- `api-documentation` — published docs, examples, tutorials, portals, and developer-facing presentation of the contract
- `authentication-setup` — product-auth setup routing across hosted/framework-native/platform-native/enterprise/self-hosted choices, session boundaries, app-owned user/org data, and migration-sensitive SSO/SCIM handoff
- `database-schema-design` — packet-first storage-model and migration-safety design: entity boundaries, cardinality, constraints, indexes, queryable-vs-flexible field choices, lifecycle rules, and staged schema evolution
- `security-best-practices` — hardening work such as cookie flags, CSRF, rate limiting, secret handling, and OWASP controls that should not be buried inside auth setup
- `looker-studio-bigquery` / `monitoring-observability` — downstream reporting or telemetry visibility layers that should stay route-outs once the storage boundary is stable enough

## Why it matters
Without that split, both `api-design` and `api-documentation` get triggered by “write an OpenAPI spec,” which makes discovery noisy and weakens the handoff story.

The stronger pattern is:
1. `api-design` defines the contract and compatibility stance.
2. `authentication-setup` chooses the auth lane, session model, and provider-vs-app ownership boundary.
3. `backend-testing` verifies the boundary with explicit layer, fixture, and dependency choices.
4. `security-best-practices` hardens the boundary without redefining the auth architecture.
5. `api-documentation` turns the stable contract into developer-facing docs and examples.
6. `database-schema-design` now routes dashboard/reporting and telemetry-visibility follow-through outward instead of pretending storage modeling should also own stakeholder reporting or observability design.

Recent ratchets:
- after the 2026-04-17 structural-hardening pass, `authentication-setup` is a tighter router with the enterprise/migration nuance pushed into a focused support packet instead of keeping that rollout detail in the main front door.
- after the 2026-04-18 structural-hardening pass, `database-schema-design` is a smaller packet-first router with a dedicated intake/route-out reference instead of a longer all-in-one backend storage explainer.
- after the 2026-04-20 structural-hardening pass, `backend-testing` now starts from one backend test packet (`coverage-plan`, `fixture-and-reset-plan`, `contract-and-api-checks`, `flake-stabilization`, or `execution-lane-split`) instead of a generic backend-testing catch-all, which makes its boundary with `testing-strategies`, `api-design`, and `authentication-setup` much clearer.

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
- [[backend-testing-structural-hardening-2026-04-20]]
- [[authentication-setup-modernization-2026-04-14]]
- [[authentication-setup-structural-hardening-2026-04-17]]
