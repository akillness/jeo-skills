---
name: backend-testing
description: >
  Design and implement backend test coverage for APIs, services, auth flows, data
  access, and integration boundaries. Use when the user needs unit/service/API /
  contract coverage, fixture strategy, testcontainers or dependency setup, flaky
  test triage, CI-vs-local test layering, or regression protection around backend
  changes. Not for whole-project test-policy design, API contract design, or auth
  implementation.
compatibility: >
  Best for backend-focused work in Node, Python, Java, and similar service stacks
  where the agent needs to choose the right mix of unit, integration, contract,
  and smoke coverage before or alongside implementation.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  tags: testing, backend, api-test, integration-test, contract-test, testcontainers, ci
  platforms: Claude, ChatGPT, Gemini
  version: "1.1.0"
---

# Backend Testing

Use this skill to turn a vague “add tests” request into a backend-focused coverage plan that is realistic, maintainable, and fast enough to keep shipping.

The job is not to dump boilerplate for every test runner. The job is to:
- choose the right backend test layers for the change
- decide what should be mocked, containerized, or exercised for real
- protect API, auth, database, and service behavior without bloating end-to-end coverage
- design fixture / seed / reset strategy so tests stay trustworthy
- make local-vs-CI execution explicit instead of pretending one suite fits every loop

Read [references/test-layer-matrix.md](references/test-layer-matrix.md) and [references/stability-checklist.md](references/stability-checklist.md) before handling large or flaky backend suites.

If the user mainly needs:
- **organization-wide test policy, a generic test pyramid, or cross-stack QA strategy** → use `testing-strategies`
- **API contract design or REST/GraphQL shape decisions** → use `api-design`
- **published docs or example portals for the API** → use `api-documentation`
- **auth implementation, token/session setup, or RBAC design** → use `authentication-setup`
- **database schema / indexing / normalization design** → use `database-schema-design`

## When to use this skill
- Add or repair backend coverage for APIs, service objects, repositories, workers, or auth flows
- Choose the right mix of unit, integration, contract, smoke, or selective end-to-end tests for a backend change
- Design fixture, factory, seed, or test-data reset strategy for a service
- Decide whether dependencies should be mocked, stubbed, containerized, or hit for real
- Add contract checks for REST / GraphQL / event boundaries after the interface is already defined
- Triage flaky backend tests, CI-only failures, or environment drift between local and CI runs
- Review whether a backend suite is too broad, too slow, too brittle, or too mock-heavy

## When not to use this skill
- The main task is inventing a full-company QA policy or broad testing philosophy → use `testing-strategies`
- The main task is API shape/versioning design before tests can be scoped honestly → use `api-design`
- The main task is implementing auth features rather than testing them → use `authentication-setup`
- The task is pure frontend/browser workflow coverage with UI concerns dominating the effort
- There is no concrete backend behavior, interface, or regression risk to test yet; in that case define the open questions and the minimum verification slice instead of pretending coverage is settled

## Instructions

### Step 1: Frame the backend test target
Capture what changed before choosing a test stack.

Record:
- backend surface being changed: endpoint, service, worker, repository, auth flow, integration, migration, or queue consumer
- failure modes that matter most: validation, auth, permissions, persistence, retries, idempotency, concurrency, side effects
- existing coverage already in place
- external dependencies involved: DB, cache, queue, email, payment, third-party API, identity provider
- runtime and language stack
- where the suite must run: local dev loop, PR CI, nightly, release smoke, or incident regression

If the request is vague, define the smallest credible behavior slice to protect first.

### Step 2: Choose the right test layers
Do not default to “just add more E2E.”

#### Prefer unit / service tests when
- the behavior is mostly pure logic or orchestration
- you can isolate dependencies cleanly
- the fastest feedback loop matters most
- the main risk is branching logic, validation, or edge-case handling

#### Prefer integration tests when
- the change depends on a real database, queue, cache, filesystem, or framework wiring
- repository / transaction / serialization behavior matters
- auth middleware, request parsing, or dependency wiring is part of the risk

#### Prefer contract or API-level tests when
- clients depend on response shapes, status codes, schemas, or events
- multiple services or teams share an interface
- you need to catch drift without running a full system stack

#### Prefer smoke or selective end-to-end tests when
- the change crosses several backend boundaries that must work together
- auth/session/bootstrap setup is part of the real risk
- a narrow release-critical journey needs proof, but full broad E2E would be wasteful

State which layers are in scope and why. If something is intentionally out of scope, say so.

### Step 3: Decide mock vs real dependency strategy
Choose realism intentionally.

For each dependency, decide one of:
- **mock / stub** when the dependency is expensive, unstable, or irrelevant to the change
- **fake / simulator** when behavior matters but a lightweight substitute is enough
- **containerized real dependency** when wire behavior, migrations, SQL, message semantics, or cache behavior matter
- **shared external environment** only when unavoidable; call out the brittleness cost

Good defaults:
- mock outbound third-party APIs unless the integration contract itself is under test
- use real DB behavior for repository / migration / query logic when drift would hurt
- prefer containerized dependencies over hand-wavy in-memory substitutes when production parity matters
- keep full-stack dependency trees narrow on PR paths; move heavier breadth to scheduled or gated runs

### Step 4: Design fixtures, data, and environment control
A backend suite fails when setup is sloppy.

Define:
- fixture or factory strategy
- seed/reset/rollback plan
- auth/bootstrap helpers for users, roles, tenants, tokens, or sessions
- clock / randomness / idempotency control where needed
- isolation rule: per test, per file, per suite, or per environment

Avoid hidden shared state. If a suite depends on ordering, time, or leftover records, say that it is fragile.

### Step 5: Shape the local and CI workflow separately
Treat local and CI as related but different loops.

Specify:
- what developers should run frequently in the local loop
- what must run on pull requests
- what can run nightly / scheduled / release-only
- whether retries/quarantine are temporary operational mitigations
- how failures should be debugged: logs, traces, request snapshots, seed replay, container logs

If the suite is slow, propose a split instead of pretending it is fine.

### Step 6: Produce the backend test packet
Pick the lightest artifact that still gives the team a usable test plan.

Recommended formats:
- **test plan table** for PR-ready implementation work
- **coverage map + fixture plan** when the suite already exists but needs reshaping
- **flake triage memo** for CI instability or environment drift
- **contract coverage outline** when response/event compatibility is the main risk

Minimum packet:
- change surface and highest-risk behaviors
- chosen test layers and exclusions
- dependency strategy (mock / fake / container / real)
- fixture/data/auth bootstrap plan
- local-vs-CI execution plan
- failure-debug notes
- handoffs to adjacent skills when needed

### Step 7: Review for trustworthiness and scope control
Before finalizing, check:
- does the plan protect the real regression risk, not just easy happy paths?
- are API/auth/error/data edge cases explicit enough?
- is the suite too broad for the feedback loop it is supposed to serve?
- did you accidentally turn a backend test task into general QA policy, contract design, or auth implementation?
- will a future maintainer understand setup, seeding, and dependency choices?

Route next steps clearly:
- `testing-strategies` for broader organization-wide policy
- `api-design` for contract shape or compatibility decisions
- `api-documentation` for published examples/docs
- `authentication-setup` for auth implementation details

## Output format

```markdown
## Backend Test Packet: [Change or Surface]

### Change framing
- Surface: [endpoint / service / worker / repository / auth flow / integration]
- Main risks: [validation / auth / data integrity / retries / compatibility / etc.]
- Runtime: [Node / Python / Java / other]

### Coverage layers
| Layer | In scope? | What it protects | Notes |
|------|-----------|------------------|-------|
| Unit / service | yes/no | ... | ... |
| Integration | yes/no | ... | ... |
| Contract / API | yes/no | ... | ... |
| Smoke / selective E2E | yes/no | ... | ... |

### Dependency strategy
| Dependency | Strategy | Why |
|------------|----------|-----|
| Database | real container / fake / mock | ... |
| External API | mock / simulator / real sandbox | ... |
| Auth provider | helper / fake / real integration | ... |

### Fixtures and environment
- Seed/reset plan: [...]
- Auth/bootstrap helpers: [...]
- Isolation rule: [...]
- Debug signals: [...]

### Execution plan
- Local fast path: [...]
- PR CI path: [...]
- Nightly / release path: [...]

### Handoffs
- Contract design: [does `api-design` need to clarify interface rules?]
- Auth implementation: [does `authentication-setup` need to own setup changes?]
- Broader test policy: [does `testing-strategies` need to own the bigger redesign?]
```

## Examples

### Example 1: Auth-heavy API change
**Input:** “We added refresh-token rotation and role-gated admin endpoints in our Express API. I need the right backend tests without making CI miserable.”

**Good response shape:**
- chooses a mix of unit/service tests plus API/integration coverage for token rotation, auth failures, and permission checks
- uses real DB behavior or containers where token/session persistence matters
- defines auth/bootstrap helpers instead of repeating login setup everywhere
- keeps full-stack E2E limited to a narrow smoke path instead of bloating the suite
- routes auth implementation details to `authentication-setup` if they are still unsettled

### Example 2: CI-only flake in a service suite
**Input:** “Our FastAPI tests pass locally but fail in CI around seeded Postgres state and background jobs. We need a stabilization plan.”

**Good response shape:**
- identifies environment drift, seed/reset, and async timing as the main risks
- proposes tighter isolation, container readiness checks, and better failure signals/log capture
- splits local-fast and CI-authoritative coverage clearly
- avoids pretending more retry loops alone solve the issue

### Example 3: Too-broad testing request
**Input:** “Design our overall engineering org testing strategy for frontend, backend, mobile, and QA.”

**Good response shape:**
- recognizes that the primary task belongs to `testing-strategies`
- keeps any backend-specific advice scoped as a handoff, not the full answer
- avoids turning `backend-testing` into a universal QA governance skill

## Best practices
1. Protect the real backend regression risk before chasing coverage percentages.
2. Prefer layered backend coverage over a giant brittle end-to-end suite.
3. Make fixture, seed, and auth bootstrap strategy explicit; hidden state is where trust dies.
4. Separate local-fast, PR, and scheduled coverage lanes on purpose.
5. Use real dependencies when wire behavior matters, but be honest about the cost.
6. Treat flaky tests as a trust problem, not just an annoyance.
7. Hand off contract design, auth implementation, and broad test policy to adjacent skills instead of absorbing them.

## References
- [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [GitLab Docs: Unhealthy tests / flaky tests](https://docs.gitlab.com/development/testing_guide/unhealthy_tests/#flaky-tests/)
- [Testcontainers](https://testcontainers.com/)
- [Playwright API testing](https://playwright.dev/docs/api-testing)
- [Schemathesis](https://schemathesis.readthedocs.io/en/stable/)
