# Solution Landscape: backend-testing modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| pytest | Python-first test runner + fixtures | Dominant Python default; flexible fixtures; broad ecosystem | Fixture graphs can become opaque; async setup complexity grows fast | Good anchor when the runtime is Python, but the skill should stay tool-agnostic |
| Jest / Vitest | Node unit and service test runners | Fast local feedback; broad TypeScript/Node fit | Mocking and module/tooling differences create churn across stacks | Mention as examples, not as the whole skill |
| JUnit / Spring Boot Test / MockMvc | Java backend testing stack | Mature ecosystem; strong framework integration | Context startup cost and slow suites need active control | Useful as a Java branch, not the core identity of the skill |
| Supertest / REST Assured / framework test clients | API-level verification | Good for request/response, status code, and auth/error checks | Still needs data/bootstrap discipline underneath | Maps well to the skill's API and contract-testing layer |
| Testcontainers | Real dependency integration testing | Strong realism for DB/cache/queue behavior; multi-language support | Slower startup, Docker dependency, heavier CI cost | Direct source in this run shows it as a mainstream option for real dependencies |
| Playwright API testing | API and auth-flow verification without full UI focus | Useful for request chains, auth setup, and smoke coverage | Can tempt teams into broader E2E than needed | Direct source in this run confirms dedicated API-testing support |
| Schemathesis | OpenAPI / GraphQL schema-driven property testing | Strong for edge cases and schema-based coverage | More niche than generic runners; depends on stable schema ownership | Direct source in this run confirms current schema-driven testing lane |
| Pact / contract testing tools | Consumer/provider compatibility checks | Useful when interface drift matters across teams/services | Setup and governance overhead for smaller teams | Best framed as optional backend-testing sub-mode |

## Categories
- **Unit / service tests** — logic, validation, orchestration, edge cases
- **Integration tests** — DB, queue, cache, framework wiring, middleware, migrations
- **Contract / API tests** — response shape, status codes, schema drift, interface compatibility
- **Smoke / selective E2E** — narrow release-critical journeys crossing multiple backend boundaries
- **Stability operations** — flake triage, seed/reset discipline, local-vs-CI split, debug signal capture

## What People Actually Use
The practical stack is not one tool; it is a layered workflow. Teams typically mix:
- unit or service tests for logic-heavy paths
- integration tests with real or containerized dependencies for persistence/wiring risk
- API/contract checks for interface stability
- a small smoke slice for the most valuable cross-boundary backend flows
- operational mitigation for flakiness: readiness checks, better data isolation, log capture, and sometimes temporary retries/quarantine

## Frequency Ranking
1. General-purpose backend test runners (pytest, Jest/Vitest, JUnit)
2. Framework/API integration helpers (Supertest, MockMvc, WebTestClient, framework test clients)
3. Testcontainers / real-dependency integration setups
4. Contract and schema-aware tools (Pact, Schemathesis)
5. Narrow smoke/E2E API flows (including Playwright API usage where appropriate)

## Key Gaps
- Many catalogs still describe backend testing as a generic “write unit/integration/API tests” skill without helping the agent choose the right layer.
- Legacy test skills often blur local, PR, and scheduled lanes, which makes advice less actionable.
- Fixture/data/bootstrap strategy is often under-specified even though it determines suite trustworthiness.
- Backend skills often fail to explain when to use mocks vs containers vs real integrations.
- Adjacent boundaries with `testing-strategies`, `api-design`, and `authentication-setup` are easy to blur unless the trigger wording is explicit.

## Contradictions
- Marketed message: one tool can solve backend testing. Reality: teams use layered combinations and still need workflow decisions around state, realism, and CI scope.
- Marketed message: just add more end-to-end tests. Reality: the strongest evidence still points toward layered coverage with a small top-of-pyramid slice.
- Marketed message: retries are enough for flakiness. Reality: readiness, isolation, and debug signal quality are the durable fixes.

## Key Insight
The best upgrade is not another backend-testing skill or another framework-specific wrapper. It is turning `backend-testing` into a boundary-aware decision skill that helps the agent choose test layers, dependency realism, fixture discipline, and local-vs-CI execution on purpose. That makes the skill more reusable across Node, Python, Java, and service-oriented stacks while reducing overlap with broader `testing-strategies`, contract-first `api-design`, and implementation-focused `authentication-setup`.
