# Context: backend-testing structural hardening

## Workflow Context
`backend-testing` sits after a backend change is concrete enough to protect but before the repo should default to broad QA policy or giant end-to-end suites. The practical workflow is usually: identify the backend surface and failure modes, choose the smallest credible mix of unit/service, integration, contract/API, and smoke coverage, then define fixture/data/auth/bootstrap and local-vs-CI execution rules. This matches repo-local references and outside primary sources emphasizing layered tests over one oversized suite ([The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html), [pytest good practices](https://docs.pytest.org/en/stable/explanation/goodpractices.html), [GitHub Actions Python testing](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-python)).

Containerized real dependencies and contract checks are now common enough that the front door needs to classify them explicitly instead of burying them as implementation detail. Testcontainers positions itself around using real dependencies like PostgreSQL in tests, while Pact positions contract testing as a fast reliability layer between services instead of requiring full integration environments for every change ([Testcontainers guide](https://testcontainers.com/guides/getting-started-with-testcontainers-for-java/), [Pact docs](https://docs.pact.io/)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend engineer | Protect API/service/repository regressions around concrete code changes | Intermediate |
| Platform or DevOps-minded maintainer | Keep containerized dependencies and CI execution stable enough to trust | Intermediate to advanced |
| Tech lead or reviewer | Decide whether the suite is too broad, too mock-heavy, or missing a critical layer | Advanced |
| Agent operator | Turn “add tests” or “fix flaky backend tests” into a bounded packet and clear route-outs | Intermediate |
| Auth/API owner | Keep testing guidance separate from contract design or auth implementation | Intermediate to advanced |

## Current Workarounds
1. **Layer tests manually from memory.** People fall back to generic “unit + integration + maybe E2E” language even when the risk is specifically contract drift, persistence behavior, or CI-only instability.
2. **Reach for containerized realism when drift hurts.** Testcontainers is commonly used when real DB or dependency behavior matters more than speed-only fakes ([Testcontainers guide](https://testcontainers.com/guides/getting-started-with-testcontainers-for-java/)).
3. **Use contract testing only when teams already know to ask for it.** Pact’s docs frame contract testing as a distinct layer for inter-application messages and APIs, but many “add backend tests” requests still skip that distinction until failures appear ([Pact docs](https://docs.pact.io/)).
4. **Split local and CI informally.** GitHub’s CI docs show matrix and build/test workflows, but many teams still describe local-vs-CI policy loosely rather than as an explicit packet ([GitHub Actions Python testing](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-python)).
5. **Treat flakiness as a debugging afterthought.** Indexed discussion results repeatedly surface CI-only drift, seeded-state leaks, and non-determinism as recurring pain rather than rare exceptions (`DuckDuckGo HTML indexed snippets`, medium confidence).

## Adjacent Problems
- **Boundary drift into test policy.** Without a sharper front door, `backend-testing` can get pulled into org-wide QA strategy that belongs to `testing-strategies`.
- **Boundary drift into contract or auth design.** Requests about API shape or auth implementation can masquerade as test tasks unless route-outs stay explicit.
- **Manual packet selection remains the real behavior.** Even with good references, people still ask for one practical packet: implementation plan, flake memo, contract outline, or fixture reshaping note.
- **CI realism is expensive.** Real containers and broader smoke tests improve fidelity but can bloat PR paths unless local, PR, and scheduled lanes are separated clearly.

## User Voices
- Pact describes contract testing as a code-first way to test HTTP and message integrations using consumer/provider contracts rather than broad end-to-end environments ([Pact docs](https://docs.pact.io/)).
- Testcontainers’ getting-started guide explicitly frames testing with a real PostgreSQL dependency rather than a fake substitute when database behavior matters ([Testcontainers guide](https://testcontainers.com/guides/getting-started-with-testcontainers-for-java/)).
- Martin Fowler’s practical test pyramid argues for balancing fast lower-level tests with fewer expensive end-to-end tests, which is exactly the scope `backend-testing` should select rather than hand-wave ([The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)).
- DuckDuckGo indexed snippets for backend/flaky-test queries repeatedly surface CI-vs-local drift, seeded-state leaks, and non-determinism as recurring developer complaints (`DuckDuckGo HTML indexed snippet`, medium confidence).
