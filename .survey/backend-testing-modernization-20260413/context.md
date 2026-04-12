# Context: backend-testing modernization

## Workflow Context
Backend testing pain shows up when teams change API behavior, auth/session rules, data-access logic, or service integrations and then discover that their current suite is either too shallow to catch regressions or too broad to trust in daily work.

Direct-source notes captured in this run:
- Martin Fowler's **The Practical Test Pyramid** explicitly frames testing as different buckets of granularity and includes unit, integration, contract, UI, end-to-end, acceptance, and exploratory testing as distinct layers rather than one giant suite: https://martinfowler.com/articles/practical-test-pyramid.html
- GitLab's **Unhealthy tests** guidance treats flaky tests as a real operational category, not a minor annoyance, reinforcing that backend CI instability is a workflow problem as much as a coding problem: https://docs.gitlab.com/development/testing_guide/unhealthy_tests/#flaky-tests/
- Testcontainers positions itself around “unit tests with real dependencies” and short-lived databases/message brokers, which matches the current industry pattern of preferring more realistic integration environments without requiring permanent shared setups: https://testcontainers.com/
- Playwright's docs include a dedicated **API testing** guide, which supports the growing practice of using API-level verification separately from browser-heavy end-to-end suites: https://playwright.dev/docs/api-testing
- Schemathesis centers on generating property-based tests from OpenAPI or GraphQL schemas, showing the current pull toward contract/schema-driven backend verification: https://schemathesis.readthedocs.io/en/stable/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend engineer | Protect API, service, repository, and auth behavior during feature work | Intermediate to advanced |
| Platform / DevEx engineer | Keep CI trustworthy, fast enough, and diagnosable | Advanced |
| QA / SDET / quality-minded engineer | Shape coverage mix and stability rules across backend workflows | Intermediate to advanced |
| Fullstack engineer | Add enough backend protection without turning every change into full E2E work | Intermediate |
| Service owner / microservice team | Preserve interface compatibility and integration trust | Intermediate to advanced |

## Current Workarounds
1. **Keep E2E small and intentional** — teams push most coverage into unit, service, API, and integration layers, leaving only narrow release-critical flows at smoke/E2E level.
2. **Use containerized real dependencies** — especially databases, caches, and queues — when query semantics, migrations, or wire behavior matter more than raw speed.
3. **Split local vs CI lanes** — fast local checks for iteration, broader PR or scheduled suites for higher confidence.
4. **Rely on fixture/factory/bootstrap helpers** for auth, tenants, users, tokens, and seeded data instead of repeating setup in every file.
5. **Quarantine or retry flaky tests temporarily** while chasing root causes like readiness, shared state, or async timing.
6. **Use contract-aware tools** such as API/schema tests when full cross-service E2E would be too slow or brittle.

## Adjacent Problems
- Auth/bootstrap setup can dominate test effort when roles, sessions, and token rotation are involved.
- Seed/reset strategy often decides whether backend tests are trustworthy or silently order-dependent.
- Local-vs-CI environment drift creates “works locally, fails in CI” failure modes.
- Over-mocking can make suites fast but blind to real integration breakage.
- Overuse of broad end-to-end tests can make suites slow, noisy, and hard to debug.
- Contract drift between services or clients can escape generic unit testing.

## User Voices
> “The ‘Test Pyramid’ is a metaphor that tells us to group software tests into buckets of different granularity.” — Martin Fowler / Ham Vocke, *The Practical Test Pyramid* (direct source: https://martinfowler.com/articles/practical-test-pyramid.html)

> GitLab treats flaky tests as part of an explicit “Unhealthy tests” workflow, which is a strong signal that instability is an operational maintenance issue, not just an occasional nuisance (direct source: https://docs.gitlab.com/development/testing_guide/unhealthy_tests/#flaky-tests/).

> Testcontainers describes the value proposition as “unit tests with real dependencies” and “throwaway, lightweight instances of databases, message brokers, web browsers, or just about anything that can run in a Docker container,” which captures the modern backend-testing shift toward realistic but disposable integration environments (direct source: https://testcontainers.com/).

> Schemathesis leads with automatic property-based tests from OpenAPI or GraphQL schemas, reflecting the current backend-testing reality that teams increasingly want schema-driven verification instead of hand-writing every negative case (direct source: https://schemathesis.readthedocs.io/en/stable/).
