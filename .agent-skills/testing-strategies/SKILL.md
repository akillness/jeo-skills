---
name: testing-strategies
description: >
  Turn test-policy ambiguity into one packet-first validation brief. Use when the
  main job is deciding which gate is actually being shaped (merge, release, or
  scheduled), what evidence a change needs, how flaky or expensive suites should
  be handled, and whether the next owner is `backend-testing`, `debugging`,
  `code-review`, `deployment-automation`, `steam-store-launch-ops`,
  `game-ci-cd-pipeline`, `web-accessibility`, or `performance-optimization`
  instead of absorbing all test work here. Triggers on: test strategy, merge
  gate, required status checks, release gate, flaky-suite policy, regression
  policy, validation brief, release confidence, and what should we test.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for CLI/dev workflow, backend, frontend, and fullstack repos where the
  main question is policy, confidence, or gate design. Not for stack-specific
  test implementation, root-cause debugging, or line-by-line diff review.
metadata:
  tags: testing, test-strategy, risk-based-testing, regression-policy, flaky-tests, release-confidence
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  source: akillness/jeo-skills
---

# Testing Strategies

Use this skill when the main question is **"what validation packet do we trust, what confidence level do we actually need, and what should the team do next?"**

The job is not to dump a generic pyramid/trophy manifesto or write test code.
The job is to:
1. normalize the current policy packet,
2. name which gate is actually being decided,
3. choose one primary policy mode,
4. name the smallest convincing layer mix,
5. separate local / PR / release / scheduled expectations,
6. state exception and flake rules honestly,
7. route implementation, debugging, release execution, accessibility, game launch, or performance work out immediately.

Read [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) before handling an unfamiliar policy packet.
Read [references/gate-truth-and-release-handovers.md](references/gate-truth-and-release-handovers.md) when the ambiguity is really about branch blockers vs release-only or platform-launch proof.
Read [references/validation-matrix.md](references/validation-matrix.md) when choosing the minimum convincing layer mix.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `testing-strategies`, `backend-testing`, `debugging`, `code-review`, `performance-optimization`, or `web-accessibility` should own the next step.

## When to use this skill
- The team needs one change-based validation brief instead of vague “add more tests” advice
- A developer or reviewer is asking what should run locally, on PR, before release, or on scheduled/nightly cadence
- You need to decide whether unit, integration, contract, smoke, exploratory, or manual checks are actually required
- A flaky or expensive suite problem is really a gate-policy problem
- An escaped bug or incident needs the right regression ratchet without blindly expanding broad E2E coverage
- Release-readiness or QA-signoff work needs to be tied back to the real change risk

## When not to use this skill
- **The main task is implementing API/service/database/browser tests, fixtures, mocks, or testcontainers** → use `backend-testing` or the stack-specific implementation skill
- **The main task is reproducing a failure, isolating why a test is red, or debugging flaky behavior** → use `debugging`
- **The main task is judging one specific PR, diff, or merge request** → use `code-review`
- **The main task is accessibility-heavy verification or visual review policy** → use `web-accessibility` or `web-design-guidelines`
- **The dominant risk is performance benchmarking, load testing, or frame-budget policy** → use `performance-optimization` or `game-performance-profiler`
- **There is no real change or decision point yet**; first define what changed and what confidence decision must be made

## Instructions

### Step 1: Start from the policy packet already in hand
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Normalize the current packet into one of these shapes:
- `change-risk-packet` — a feature, bugfix, migration, API change, auth change, UI flow change, config/deploy change, or incident follow-up
- `gate-design-packet` — the team is arguing about what belongs in local, PR, release, or scheduled gates
- `flake-cost-packet` — the suite is slow, noisy, brittle, or expensive and policy is unclear
- `release-readiness-packet` — staging smoke, signoff, rollout, or checklist work is present but layer ownership is fuzzy
- `incident-ratchet-packet` — an escaped bug or outage fix needs the smallest lasting regression protection

Capture the minimum useful frame:
```markdown
Packet: change-risk-packet
Change type: API contract + DB migration
Hotspots: compatibility, migration safety, permissions
Decision point: PR + release
Current evidence: unit tests only
```

Rule: start from the packet the user already has. Do not demand an ideal QA template before doing useful work.

### Step 2: Name the gate truth before choosing layers
Say which decision point is real right now:
- `merge-gate-truth` — branch-blocking evidence, required status checks, or review-blocking proof
- `release-gate-truth` — staging smoke, rollout safety, rollback notes, permissions, packaging, or human signoff
- `scheduled-breadth-truth` — nightly/cron/matrix coverage that improves confidence but should not block every PR

Rules:
- Do not let protected-branch tooling masquerade as the whole test strategy; it only enforces the blocking subset.
- Do not let release/platform checklists silently expand the PR gate when they are really launch or rollout ownership.
- If more than one gate is present, name the primary gate and the follow-up gate explicitly.

### Step 3: Choose one primary policy mode
Pick exactly one primary mode:
- `layer-selection` — what validation layers prove the changed behavior?
- `gate-shaping` — what belongs in local vs PR vs release vs scheduled loops?
- `flake-and-cost-policy` — what should block, quarantine, move, or become informational?
- `incident-regression-ratchet` — what is the lowest layer that would have caught the escaped bug?
- `release-confidence` — what final smoke, checklist, or rollout proof is still honestly needed?

Optional: name one secondary mode, but do not flatten every testing conversation into the same checklist.

### Step 4: Classify the risk tier and critical path
Use a small risk model:
- **Tier 0 — low risk:** docs, comments, dead code deletion, isolated rename, obvious config metadata
- **Tier 1 — ordinary product change:** routine feature or refactor with limited blast radius
- **Tier 2 — high risk:** public API, migration, auth, billing, external integrations, state machines, concurrency, background jobs
- **Tier 3 — release-critical / incident-linked:** escaped bugs, outage fixes, rollback-sensitive deploy paths, or critical customer journeys

Capture:
- critical paths and users affected
- failure cost: annoyance, feature break, trust damage, data loss, rollout risk, security risk
- evidence already present: tests, screenshots, previews, logs, contract notes, rollout notes, checklists
- the decision point: local confidence, PR/merge confidence, release confidence, or long-running scheduled breadth

If the change spans multiple tiers, plan for the highest one.

### Step 5: Choose the smallest convincing layer mix
Use [references/validation-matrix.md](references/validation-matrix.md).

Default layer choices:
- **Unit / component / service** when logic, validation, branching, or mapping is the main risk
- **Integration** when wiring, DB semantics, middleware, serialization, jobs, or real dependency behavior matters
- **Contract / API-level** when response shapes, schemas, events, or cross-service/client boundaries changed
- **Smoke / selective E2E** when multiple layers must prove one critical end-to-end journey together
- **Manual exploratory / checklist validation** when visual nuance, device variation, operational edge cases, or human signoff is still the honest answer

Always say both:
- what **is required now**
- what is **intentionally out of scope for now** and why

Examples:
- “integration + contract now; no broad browser E2E because the user journey is unchanged”
- “release smoke plus rollout checklist; no new unit tests because the only risk lives in staging config and deployment behavior”

### Step 6: Separate local, PR, release, and scheduled expectations
A useful policy brief does not pretend one suite fits every loop.

Define the smallest truthful gate split:
- **Local** — fast, cheap, developer-loop proof
- **PR / merge** — changed-surface confidence for risky paths
- **Release** — production-facing smoke, migration safety, rollout checks, or manual signoff items
- **Scheduled / nightly** — broad matrices, expensive combinations, compatibility sweeps, long-running suites

Rules of thumb:
- if a suite is too slow or flaky for PRs, move it deliberately instead of silently rerunning it forever
- if branch protection / required status checks are in play, name only the checks that truly must block merge
- if a release checklist exists, tie it back to the specific risk that still needs human proof
- if store/platform launch checklists are now the dominant work, route to the launch or delivery owner instead of stuffing them back into merge coverage
- if the packet is really just release coordination, say so instead of pretending every item is a test-layer choice

### Step 7: Write explicit exception and flake rules
This step is where strategy becomes operational.

State:
- which checks are blocking vs informational
- when a flaky test should be quarantined, fixed, moved to scheduled, or removed from the gate
- what explanation is required when no new regression coverage is added
- whether coverage percentages matter here or are just background reporting
- whether manual verification is temporary, release-only, or an intentional long-term choice

Good defaults:
- repeated flake is a policy problem, not just a rerun ritual
- quarantining can reduce CI noise, but must keep owner + timeout + follow-up visible
- “coverage went up” is not proof that the risky scenario is protected
- escaped bugs should ratchet in the lowest-layer regression that would actually have caught them

### Step 8: Route the next owner immediately
This skill owns policy and confidence decisions, not all downstream work.

Typical route-outs:
- `backend-testing` — write or repair the chosen API/service/database/fixture/contract tests
- `debugging` — investigate why a suite is red, flaky, or environment-specific right now
- `code-review` — judge whether one diff’s current evidence is good enough to approve
- `deployment-automation` — own rollout execution, staging/prod verification sequencing, rollback steps, or release runbooks once the gate is chosen
- `game-ci-cd-pipeline` — own engine/build pipeline implementation or stabilization when the problem is a game CI/CD surface, not policy selection
- `steam-store-launch-ops` — own Steam-specific launch/store/runbook work when the remaining proof is release checklist, page readiness, or launch timing rather than merge confidence
- `web-accessibility` / `web-design-guidelines` — handle accessibility-heavy or visual-governance validation packets
- `performance-optimization` / `game-performance-profiler` — handle benchmark, load, latency, or frame-budget policy when performance is the actual dominant risk

If the user asks “what should we test?” stay here.
If they ask “how do we write or stabilize those tests?” route out.

### Step 9: Produce one concise validation brief
Preferred format:
```markdown
# Validation Strategy Brief

## Policy packet
- Packet:
- Gate truth:
- Primary mode:
- Risk tier:
- Decision point:

## Required validation now
1. [Layer] ... because ...
2. [Layer] ... because ...
3. [Manual / release check] ... because ...

## Gate split
- Local:
- PR:
- Release:
- Scheduled:

## Out of scope for now
- ...

## Exception / flake policy
- ...

## Next owner
- `backend-testing` / `debugging` / `code-review` / other
```

A short, explicit brief beats a giant testing manifesto.
If the honest answer is “do less, but at the right layer,” say that directly.

## Output format
Always return a **validation strategy brief**, **gate-shaping memo**, or **regression-ratchet brief**.

Required qualities:
- identify the packet already in hand
- name the real gate being decided before expanding into more layers
- choose one primary policy mode
- classify risk and critical path explicitly
- separate local, PR, release, and scheduled expectations when relevant
- explain intentional exclusions instead of hand-waving them away
- route implementation, debugging, review, accessibility, or performance work to the correct neighboring skill

## Examples

### Example 1: API + migration packet
**Input**
> This PR changes an API contract and adds a DB migration. What validation should be required before merge?

**Output sketch**
- Packet: `change-risk-packet`
- Gate truth: `merge-gate-truth`
- Primary mode: `layer-selection`
- Risk tier: 2
- Required validation:
  1. integration test for migration read/write path
  2. contract/API check for response compatibility
  3. release smoke on the highest-value consumer path
- Out of scope: broad browser E2E because the user flow is unchanged
- Next owner: `backend-testing`

### Example 2: Flaky browser suite packet
**Input**
> Our Playwright suite is slow and keeps flaking. What testing strategy should this repo adopt?

**Output sketch**
- Packet: `flake-cost-packet`
- Gate truth: `merge-gate-truth` with `scheduled-breadth-truth` follow-up
- Primary mode: `flake-and-cost-policy`
- Required change:
  1. narrow PR browser coverage to critical journeys only
  2. move broader combinations to scheduled runs
  3. define quarantine/fix rules for repeated flake
  4. shift confidence to lower-level integration/component checks where honest
- Next owner: `backend-testing` for implementation, `debugging` for current flake root cause

### Example 3: Release-readiness packet
**Input**
> Engineering says tests are green, but should we require anything else before this release?

**Output sketch**
- Packet: `release-readiness-packet`
- Gate truth: `release-gate-truth`
- Primary mode: `release-confidence`
- Required validation:
  1. targeted staging smoke for the changed customer journey
  2. migration / rollback checklist item if deploy shape changed
  3. explicit note that no new broad regression sweep is required beyond scheduled coverage
- Route-out: accessibility-specific signoff to `web-accessibility` if the change is UI-state heavy

### Example 4: Game launch checklist packet
**Input**
> Our build passed CI, but we still have Steam release checklist items and packaging work. Does this stay here?

**Output sketch**
- Packet: `release-readiness-packet`
- Gate truth: `release-gate-truth`
- Primary mode: `release-confidence`
- Required validation: targeted final smoke plus the minimum proof that launch/build checklist items are satisfied
- Out of scope: expanding branch-blocking PR checks just because store/platform launch work remains
- Next owner: `steam-store-launch-ops` and/or `game-ci-cd-pipeline`

## Best practices
1. Start from the packet already in hand, not from a favorite testing slogan.
2. Prefer the cheapest layer that still proves the risky behavior.
3. Keep local, PR, release, and scheduled loops distinct.
4. Treat flaky tests as a policy smell, not just a rerun inconvenience.
5. Tie release checklists back to actual risk instead of treating them as a separate universe.
6. State intentional exclusions so residual risk is visible.
7. Use escaped bugs to ratchet in the lowest-layer regression that would have caught them.
8. Make merge blockers, release-only proof, and scheduled breadth explicit instead of blending them together.
9. Route implementation to `backend-testing`, diagnosis to `debugging`, rollout execution to `deployment-automation`, platform/game launch work to `steam-store-launch-ops` or `game-ci-cd-pipeline`, and accessibility-heavy validation to `web-accessibility`.
10. Use manual validation when it is the honest answer, not as a shameful fallback.
11. One concise validation brief is more reusable than a giant testing manifesto.

## References
- [Martin Fowler — Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html)
- [Martin Fowler — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Google Testing Blog — Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)
- [Selenium — Test Practices](https://www.selenium.dev/documentation/test_practices/)
- [Playwright — Best Practices](https://playwright.dev/docs/best-practices)
- [Pact Docs](https://docs.pact.io/)
