# Validation Matrix

Use this matrix when choosing the minimum convincing validation plan.

## By change type

| Change type | Usually required | Often useful | Usually avoid unless truly needed |
|---|---|---|---|
| Pure logic / validation rule | Unit or component/service tests | Focused integration if framework wiring matters | Broad E2E |
| API response / schema / event contract | Contract or API-level checks | Integration for real serialization/wiring | Full browser E2E if no user flow changed |
| Database migration / persistence behavior | Integration with real DB semantics | Release smoke for critical write/read path | Mock-heavy-only proof |
| Auth / permissions / session flow | Integration for middleware / wiring | Selective smoke/E2E for critical flow | Unit-only proof when real access control wiring is risky |
| UI-only interaction / rendering | Component/integration plus screenshots/previews | Selective browser flow for critical path | Huge browser regression matrix by default |
| Cross-service / distributed workflow | Contract + targeted integration | Narrow end-to-end smoke | Broad all-services E2E for every PR |
| Incident regression | Lowest layer that would have caught the bug | Add higher-level check only if it proves missing system interaction | Unrelated coverage expansion |

## By decision point

| Decision point | Goal | Default bias |
|---|---|---|
| Local loop | Fast developer feedback | Narrow, cheap, deterministic checks |
| PR / merge | Credible branch confidence | Changed-surface coverage, targeted integration/contract, required evidence |
| Release | Production-facing confidence | Critical-path smoke, migration safety, operational checklist items |
| Scheduled / nightly | Breadth and matrix coverage | Expensive combinations, compatibility runs, long-tail scenarios |

## Risk reminders
- Tier 0: docs / dead code / isolated rename — light verification is often enough.
- Tier 1: normal feature or refactor — choose the smallest layer mix that proves the behavior.
- Tier 2: API, migration, auth, billing, integrations, concurrency — require stronger-than-unit evidence.
- Tier 3: escaped bug, outage fix, release-critical journey — add explicit regression and release confidence.

## Anti-patterns
- Using browser E2E as the default proof for every change.
- Saying "coverage increased" instead of naming the protected scenario.
- Running slow flaky suites on every PR because nobody defined a better gate.
- Treating manual release checks as shameful when they are the honest answer for some risks.
- Confusing policy questions with test-implementation questions.
