---
name: testing-strategies
description: >
  Design a risk-based validation policy for software changes across unit,
  integration, contract, smoke, exploratory, and release checks. Use when the
  user needs to decide what test layers are required, how much evidence is enough
  before merge or release, how to control flaky or expensive suites, or how to
  route work between testing policy, backend test implementation, debugging, and
  code review. Triggers on: test strategy, testing pyramid/trophy, coverage plan,
  regression policy, flaky suite policy, release confidence, and what should we
  test for this change.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for CLI/dev workflow, backend, frontend, and fullstack repos that need a
  reusable test-policy layer. Not for stack-specific test implementation,
  root-cause debugging, or line-by-line PR review.
metadata:
  tags: testing, test-strategy, risk-based-testing, regression-policy, flaky-tests, release-confidence
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Testing Strategies

Use this skill when the main question is **"what validation is actually required for this change, and when should it run?"**

The job is not to dump sample unit, integration, or Playwright code.
The job is to:
1. classify the change and its risk,
2. choose the minimum convincing mix of test layers,
3. separate local / PR / release expectations,
4. define exceptions and residual risk clearly,
5. route implementation or failure analysis to the right neighboring skill.

Read [references/validation-matrix.md](references/validation-matrix.md) before handling an unfamiliar architecture or release-critical change.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `testing-strategies`, `backend-testing`, `debugging`, `code-review`, `performance-optimization`, or `web-accessibility` should own the next step.

## When to use this skill
- Define or repair a repo-wide testing policy instead of only writing one test file
- Decide which validation layers a feature, refactor, migration, API change, or bugfix actually needs
- Turn vague requests like “improve our tests” or “what should we test here?” into a risk-based plan
- Choose merge-gate versus release-gate coverage expectations
- Reduce flaky or expensive suites by changing policy, scope, or test-layer mix
- Define how regression coverage should be added after escaped bugs or incidents
- Create a reusable validation brief for developers, reviewers, or release owners

## When not to use this skill
- **The main task is implementing backend/API/database tests, fixtures, mocks, or testcontainers** → use `backend-testing`
- **The main task is reproducing a failure, isolating root cause, or understanding why a test is red** → use `debugging`
- **The main task is reviewing a specific PR or judging whether a diff’s evidence is convincing** → use `code-review`
- **The main task is performance benchmarking or load/perf tuning** → use `performance-optimization`
- **The main task is accessibility-specific verification or visual QA policy** → use `web-accessibility` or `web-design-guidelines`
- **There is no meaningful change or risk decision yet**; in that case define the open questions first instead of pretending a detailed strategy already exists

## Instructions

### Step 1: Frame the change and confidence target
Before choosing test layers, define what changed and what failure would hurt.

Capture:
- change type: feature, refactor, bugfix, migration, API/schema change, UI workflow change, config/deploy change, incident follow-up
- affected surfaces: logic, API, persistence, auth, state sync, jobs, browser behavior, analytics, integrations, release process
- failure cost: annoyance, feature break, data loss, security risk, rollout risk, customer-visible regression
- users and paths that matter most
- current evidence already available: existing tests, screenshots, logs, previews, contract diffs, release notes
- required decision point: local confidence, PR merge confidence, release confidence, or post-incident regression protection

Quick frame:
```markdown
Change type: API contract + DB migration
Hotspots: compatibility, backfill safety, permission checks
Failure cost: high — bad rows and client breakage
Decision point: pre-merge + release confidence
Existing evidence: unit tests only
```

### Step 2: Classify the risk tier
Do not treat every change the same.

Use a simple tiering model:

- **Tier 0 — low risk**
  - docs-only, comments, dead-code deletion, isolated rename, build metadata with obvious verification
- **Tier 1 — ordinary product change**
  - typical feature work, non-critical UI behavior, internal logic, low-blast-radius refactors
- **Tier 2 — high risk**
  - public API changes, migrations, auth/permissions, billing, state machines, background jobs, external integrations, concurrency
- **Tier 3 — release-critical / incident-linked**
  - recently escaped bugs, critical journeys, outage fixes, rollback-sensitive deploy paths, high-value customer workflows

If the change spans multiple tiers, plan for the highest one.

### Step 3: Choose the right validation layers
Prefer the lowest-cost test that still provides credible confidence.

#### Use unit or component/service tests when
- the main risk is logic, validation, branching, mapping, or error handling
- behavior can be isolated without losing the truth of the change
- fast feedback is more valuable than full-environment realism

#### Use integration tests when
- database, framework wiring, serialization, queue behavior, auth middleware, or transaction boundaries matter
- a bug could hide in real dependency wiring even if pure logic is correct

#### Use contract or API-level checks when
- response shapes, events, status codes, schemas, or client/server expectations changed
- multiple teams or services depend on an interface
- full E2E would be too broad for the confidence needed

#### Use smoke or selective E2E checks when
- the risk spans multiple layers that must work together in a realistic flow
- auth/session/bootstrap, checkout, signup, publishing, or similar critical journeys need proof
- release confidence matters more than local developer-loop speed

#### Use manual exploratory or checklist validation when
- visual nuance, browser/device variation, operational edge cases, or human judgment matter
- the path is too rare or unstable to justify permanent automation yet
- you need a release-note or QA checklist item even after automation exists

Name both what **is** and **is not** in scope. A useful plan says, for example, “integration + contract now, no broad E2E because the user journey is unchanged.”

### Step 4: Separate local, PR, and release expectations
A strong strategy does not pretend one suite fits every loop.

Define:
- **Local loop** — fast developer confidence: narrow unit/component/service checks, focused integration, lint/type/static checks
- **PR / merge gate** — branch-level confidence: critical automated coverage for changed risk areas, selective integration/contract checks, proof artifacts for omitted layers
- **Release / deploy gate** — production-facing confidence: smoke tests, migration validation, rollout checks, critical-journey verification, manual checklist items if needed
- **Scheduled / nightly** — broad or expensive suites, compatibility matrices, resilience checks, longer-running combinations

If a suite is too slow or flaky for PRs, move it deliberately instead of silently forcing every branch through unreliable gates.

### Step 5: Set rules for flaky, expensive, or skipped tests
Strategy quality often shows up in the exception policy.

Define:
- which tests are blocking versus informational
- when a flaky test should be quarantined, fixed, re-scoped, or removed from the gate
- when a risky change can ship with manual verification plus follow-up automation
- what explanation is required when no new regression coverage is added
- whether coverage percentages are guardrails, reporting signals, or non-goals for this decision

Good default rules:
- treat repeated flake as a policy problem, not just a rerun ritual
- do not accept “coverage went up” as proof that the right scenarios are protected
- if a bug escaped, add the lowest-layer regression check that would have caught it
- if a migration, auth, or public-contract change is present, require stronger-than-unit evidence

### Step 6: Route implementation and diagnosis correctly
This skill owns policy and orchestration, not every downstream action.

Typical handoffs:
- **`backend-testing`** — implement API/service/database/fixture/contract coverage once the strategy is chosen
- **`debugging`** — investigate why a current failure is happening or why a suite is red/flaky
- **`code-review`** — judge whether a specific diff’s tests and evidence are convincing
- **`performance-optimization`** — handle load/perf test policy only when performance is the main risk
- **`web-accessibility` / `web-design-guidelines`** — handle accessibility or visual validation policy when that is the real review surface

If the user asks “what should we test?” stay here. If they ask “how do I write or stabilize those tests?” route out.

### Step 7: Produce the validation brief
Return a concise artifact that someone can act on immediately.

Preferred format:
```markdown
# Validation Strategy Brief

## Change frame
- Type:
- Risk tier:
- Critical paths:
- Decision point: local / PR / release

## Required validation
1. [Layer] ... because ...
2. [Layer] ... because ...
3. [Manual / release check] ... because ...

## Out of scope for now
- ...

## Gate policy
- Local:
- PR:
- Release:
- Scheduled:

## Exceptions / residual risk
- ...

## Next owner
- `backend-testing` / `debugging` / `code-review` / other
```

If the answer is “do less, but at the right layer,” say that explicitly.

## Output format
Always return a **validation strategy brief**, **testing policy packet**, or **change-based coverage recommendation**.

Required qualities:
- classify the change and risk tier
- choose explicit validation layers rather than generic “add tests” advice
- separate local, PR, release, and scheduled expectations when relevant
- explain why certain layers are intentionally excluded
- call out flaky/expensive-suite policy when it affects the decision
- route implementation or diagnosis to the correct neighboring skill

## Examples

### Example 1: API + migration change
**Input**
> This PR changes an API response shape and adds a DB migration. What testing strategy should we require before merge?

**Output sketch**
- Risk tier: 2
- Required validation:
  1. integration test covering migration read/write path
  2. contract/API check for response compatibility
  3. release smoke covering the highest-value consumer path
- Out of scope: broad browser E2E because the user-facing flow is unchanged
- Next owner: `backend-testing`

### Example 2: Flaky browser suite
**Input**
> Our Playwright suite is slow and keeps flaking. What testing strategy should this repo adopt?

**Output sketch**
- Risk tier: mixed, but current policy problem is flake and cost
- Required change:
  1. narrow PR browser coverage to critical journeys only
  2. move broader combinations to scheduled/nightly
  3. shift more confidence to lower-level integration/component checks
  4. define quarantine/fix rules for flaky tests
- Next owner: `backend-testing` for service/API coverage; `debugging` for red/flaky root cause

### Example 3: Bugfix regression decision
**Input**
> We fixed a bug where expired sessions still allowed export downloads. What test should be required?

**Output sketch**
- Risk tier: 2 because auth/session behavior is involved
- Required validation:
  1. regression test at the lowest layer that can prove denied access logic
  2. integration/auth check if middleware wiring is part of the risk
  3. no full broad E2E unless export flow depends on multi-step browser state not covered below
- Next owner: `backend-testing`

## Best practices
1. Start from risk and change surface, not from a favorite testing slogan.
2. Prefer the cheapest test layer that still proves the risky behavior.
3. Keep local, PR, release, and scheduled validation loops distinct.
4. Treat flaky tests as a policy smell, not just a rerun inconvenience.
5. Coverage percentages can support the conversation, but they do not replace scenario-based confidence.
6. State intentional exclusions so the team knows what risk remains.
7. Use escaped bugs to ratchet in the lowest-layer regression that would have caught them.
8. Route implementation to `backend-testing`, diagnosis to `debugging`, and review judgment to `code-review`.
9. For release-critical work, include manual or checklist validation when human judgment is still the honest answer.
10. A short, explicit validation brief beats a giant generic testing manifesto.

## References
- [Martin Fowler — Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html)
- [Martin Fowler — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Martin Fowler — Testing Strategies in a Microservice Architecture](https://martinfowler.com/articles/microservice-testing/)
- [Martin Fowler — Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html)
- [Google Testing Blog — Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)
- [Software Engineering at Google — Testing Overview](https://abseil.io/resources/swe-book/html/ch11.html)
- [Playwright — Best Practices](https://playwright.dev/docs/best-practices)
- [Selenium — Test Practices](https://www.selenium.dev/documentation/test_practices/)
