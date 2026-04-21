---
name: backend-testing
description: >
  Turn backend test ambiguity into one practical backend test packet. Use when the
  user needs API/service/repository/auth-flow coverage design, fixture or seed/reset
  strategy, container-vs-mock dependency choices, contract/API compatibility checks,
  or flaky backend-suite stabilization across local and CI. Route org-wide testing
  policy to `testing-strategies`, API shape decisions to `api-design`, and auth
  implementation to `authentication-setup`.
compatibility: >
  Best for backend-focused work in Node, Python, Java, and similar service stacks
  where the agent must choose the smallest credible mix of unit, integration,
  contract, and smoke coverage before or alongside implementation.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  tags: testing, backend, api-test, integration-test, contract-test, testcontainers, ci
  platforms: Claude, ChatGPT, Gemini
  version: "1.2.0"
---

# Backend Testing

Use this skill as a **packet-first backend testing router**.

The job is not to dump boilerplate for every framework. The job is to:
1. classify the request into the right backend test packet,
2. pick the smallest credible mix of test layers,
3. make dependency realism and data control explicit,
4. split local vs PR vs slower lanes honestly,
5. route policy, contract-shape, and auth-implementation work away when they are the real task.

Read these when needed:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/test-layer-matrix.md](references/test-layer-matrix.md)
- [references/stability-checklist.md](references/stability-checklist.md)

## When to use this skill
- Add or repair backend coverage for APIs, services, repositories, workers, integrations, or auth flows
- Decide whether a backend change needs unit, integration, contract/API, or narrow smoke coverage
- Design fixture, factory, seed/reset, auth bootstrap, or environment-control strategy
- Decide when to use mocks, fakes, containers, or real dependencies
- Stabilize flaky backend suites, especially CI-only failures and local-vs-CI drift
- Review whether a backend suite is too broad, too slow, too mock-heavy, or missing a key layer

## When not to use this skill
- The main task is org-wide test policy, gate design, release evidence, or company-wide QA philosophy → use `testing-strategies`
- The main task is API contract shape, versioning, or schema design before tests can be scoped honestly → use `api-design`
- The main task is implementing auth/session/provider behavior rather than testing it → use `authentication-setup`
- The main task is frontend/browser testing or UI workflow coverage
- There is no concrete backend behavior or regression target yet; in that case define the missing behavior packet first instead of pretending the test plan is settled

## Instructions

### Step 1: Classify the request into one packet
Choose the single best entry packet before giving advice.

**Packets**
- `coverage-plan` — which layers to add for a concrete backend change
- `fixture-and-reset-plan` — how to seed, isolate, reset, or bootstrap data/auth state
- `contract-and-api-checks` — how to protect response/event/schema compatibility once the interface already exists
- `flake-stabilization` — how to stabilize CI-only or intermittent backend failures
- `execution-lane-split` — how to divide local-fast, PR, nightly, and release-only backend checks

If the request mixes several concerns, name the **primary packet** and one secondary concern.

### Step 2: Frame the backend surface and risk
Capture the smallest useful context:
- surface: endpoint, service, repository, worker, queue consumer, auth flow, integration, or migration
- highest-risk behaviors: validation, permissions, persistence, retries, idempotency, ordering, serialization, side effects, compatibility
- existing coverage already present
- external dependencies involved: DB, cache, queue, email, payment, third-party API, identity provider, filesystem
- runtime/language stack
- where the evidence must hold: local loop, PR CI, scheduled CI, release smoke

If the request is vague, choose the smallest regression slice worth protecting first.

### Step 3: Choose the right test layers
Use the packet and risk to select the lightest credible layer mix.

#### Unit / service
Prefer when the main risk is branching logic, validation, orchestration, or pure-ish business rules.

#### Integration
Prefer when database behavior, framework wiring, middleware, transactions, queues, caches, or serialization matter.

#### Contract / API
Prefer when clients depend on response shapes, status codes, schemas, or events and the interface already exists.

#### Smoke / selective end-to-end
Prefer only when a narrow release-critical journey crosses several backend boundaries and lower layers would miss the core risk.

State what is **in scope**, what is **out of scope**, and why.

### Step 4: Decide dependency realism on purpose
For each dependency, choose one of:
- **mock / stub** — expensive, unstable, or irrelevant to the behavior under test
- **fake / simulator** — behavior matters, but a lightweight substitute is enough
- **containerized real dependency** — queries, migrations, message semantics, or wire behavior matter enough that drift would hurt
- **shared external environment** — only when unavoidable; call out the fragility cost explicitly

Good defaults:
- prefer real DB behavior when repository, migration, transaction, or serialization behavior is central
- prefer mocks for outbound third-party APIs unless the integration contract itself is under test
- prefer a narrow containerized slice over a giant all-dependencies-in-PR setup
- do not claim fake and real dependencies are equivalent when production parity is the whole risk

### Step 5: Define fixture, data, auth, and environment control
A backend suite becomes untrustworthy when state is vague.

Specify:
- fixture/factory strategy
- seed/reset/rollback plan
- auth/bootstrap helpers for users, roles, tenants, tokens, or sessions
- time/randomness/idempotency control where needed
- isolation rule: per test, per file, per suite, or per environment
- debugging signals to capture when failures happen

If the suite relies on ordering, leftovers, or sleeps, call that fragility out directly.

### Step 6: Split the execution lanes
Treat local, PR, and slower lanes as different jobs.

Define:
- **local-fast path** — what developers should run repeatedly
- **PR path** — what must gate merges
- **scheduled / nightly path** — heavier breadth or expensive realism
- **release / incident path** — narrow confidence checks or regression ratchets when needed

If the suite is slow, split it. Do not pretend one giant authoritative path is practical everywhere.

### Step 7: Produce one backend test packet
Return one concise packet, not a general essay.

Recommended packet shapes:
- `coverage-plan` → coverage table + dependency strategy + exclusions
- `fixture-and-reset-plan` → fixture/reset memo + auth/bootstrap notes
- `contract-and-api-checks` → compatibility packet + consumer/provider scope + route-outs
- `flake-stabilization` → flake memo with likely causes, isolation fixes, readiness checks, and debug signals
- `execution-lane-split` → lane matrix with local/PR/scheduled/release responsibilities

Minimum packet contents:
- change surface and primary risk
- chosen packet and any secondary concern
- selected layers and why
- dependency realism decisions
- fixture/data/auth/environment control
- execution-lane split
- explicit route-outs when the request is partly owned elsewhere

### Step 8: Verify scope boundaries before finalizing
Check:
- does the packet protect the real backend regression risk rather than generic coverage vanity?
- did you keep org-wide validation policy in `testing-strategies`?
- did you route contract *shape* decisions to `api-design` while keeping contract *protection* here only when the interface already exists?
- did you route auth implementation work to `authentication-setup`?
- will a maintainer understand why a dependency is mocked, faked, containerized, or real?

## Output format

```markdown
## Backend Test Packet: [Surface or Change]

### Packet choice
- Primary packet: coverage-plan | fixture-and-reset-plan | contract-and-api-checks | flake-stabilization | execution-lane-split
- Secondary concern: optional
- Confidence: high | medium | low

### Change framing
- Surface: ...
- Main risks: ...
- Runtime: ...
- Existing coverage: ...

### Layer decisions
| Layer | In scope? | What it protects | Notes |
|------|-----------|------------------|-------|
| Unit / service | yes/no | ... | ... |
| Integration | yes/no | ... | ... |
| Contract / API | yes/no | ... | ... |
| Smoke / selective E2E | yes/no | ... | ... |

### Dependency realism
| Dependency | Strategy | Why |
|------------|----------|-----|
| Database / queue / cache | ... | ... |
| External API | ... | ... |
| Auth provider | ... | ... |

### Data and environment control
- Fixtures / factories: ...
- Seed / reset: ...
- Auth bootstrap: ...
- Isolation rule: ...
- Debug signals: ...

### Execution lanes
- Local-fast: ...
- PR CI: ...
- Scheduled / nightly: ...
- Release / incident: ...

### Route-outs
- `testing-strategies`: ...
- `api-design`: ...
- `authentication-setup`: ...
```

## Examples

### Example 1: auth-heavy API change
**Input:** “We added refresh-token rotation and new admin-only endpoints to our Express API. I need backend tests that catch auth failures, token replay issues, and DB persistence bugs without turning CI into a giant end-to-end suite.”

**Good response shape:**
- chooses `coverage-plan` as the primary packet
- combines unit/service plus integration/API coverage instead of one giant E2E suite
- keeps real DB or containerized persistence where token/session behavior matters
- defines auth bootstrap helpers and reset strategy
- limits smoke coverage to a narrow release-critical path

### Example 2: CI-only flake in a service suite
**Input:** “Our FastAPI tests pass locally but fail in CI around seeded Postgres state and background jobs. Give me a stabilization plan.”

**Good response shape:**
- chooses `flake-stabilization` as the primary packet
- identifies seed/reset drift, readiness, async timing, or leftover state as likely causes
- recommends stronger isolation, readiness checks, and debugging signals instead of just retries
- separates local-fast and CI-authoritative behavior clearly

### Example 3: contract protection after an API already exists
**Input:** “Our payment service and webhook consumers keep drifting on response fields. I do not need API redesign, I need backend tests that catch compatibility regressions.”

**Good response shape:**
- chooses `contract-and-api-checks` as the primary packet
- keeps contract protection here because the interface already exists
- routes any schema redesign or versioning debate to `api-design`
- recommends consumer/provider or schema-compatibility coverage rather than broader smoke inflation

### Example 4: too-broad policy request
**Input:** “Design our overall engineering org testing strategy for frontend, backend, mobile, and QA.”

**Good response shape:**
- recognizes that the primary task belongs to `testing-strategies`
- keeps any backend-specific advice scoped as a handoff only
- refuses to turn `backend-testing` into a universal QA-governance skill

## Best practices
1. Start from the packet, not from the framework.
2. Protect the real backend regression risk before chasing coverage percentages.
3. Prefer layered backend coverage over giant brittle end-to-end suites.
4. Make fixture, seed, and auth bootstrap strategy explicit; hidden state is where trust dies.
5. Split local-fast, PR, scheduled, and release lanes intentionally.
6. Use real dependencies when wire behavior matters, but keep expensive realism bounded.
7. Treat flaky tests as a trust problem, not just an annoyance.
8. Route policy, contract-shape, and auth-implementation ownership away instead of absorbing them.

## References
- [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [pytest: Good Integration Practices](https://docs.pytest.org/en/stable/explanation/goodpractices.html)
- [Testcontainers](https://testcontainers.com/)
- [Pact Docs](https://docs.pact.io/)
- [GitHub Actions: Building and testing Python](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-python)
