---
title: Testing Strategies Structural Hardening (2026-04-19)
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, consolidation]
sources: [.survey/testing-strategies-structural-hardening-20260419/context.md, .survey/testing-strategies-structural-hardening-20260419/solutions.md, .agent-skills/testing-strategies/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Testing Strategies Structural Hardening (2026-04-19)

## Question
What is the best bounded next improvement for `testing-strategies` now that support coverage is already complete across the code-quality lane?

## Answer
Shrink `testing-strategies` into a packet-first validation-policy router rather than adding another testing wrapper or expanding more implementation detail into the front door.

## Why this won
- The graph layer still says the best remaining wins come from oversized or high-traffic front doors, not from adding adjacent skills.
- The code-quality cluster already has the right lane split: `testing-strategies` for policy, `backend-testing` for implementation, `debugging` for diagnosis, `code-review` for judgment, and `performance-optimization` for bottleneck-led evidence work.
- External guidance and indexed community snippets keep reinforcing the same pattern: broad E2E-by-default is expensive, flaky suites need explicit quarantine/gate policy, and release checklists only help when tied back to real change risk.

## Accepted change
- Reframe `testing-strategies` around five policy packets: `change-risk`, `gate-design`, `flake-cost`, `release-readiness`, and `incident-ratchet`.
- Keep one primary policy mode per run instead of a giant general-purpose testing lecture.
- Add `references/intake-packets-and-route-outs.md` so packet-specific heuristics live outside the front door.
- Expand eval coverage with release-readiness and accessibility-boundary cases.
- Sync compact/discovery surfaces (`SKILL.toon`, `skills.toon`, `skills.json`, README, README.ko, setup prompt).

## Rejected alternatives
- Adding another generic QA / release-readiness wrapper skill.
- Turning `testing-strategies` into a test-implementation cookbook.
- Letting flaky-suite management or release signoff sit as an unstructured side topic outside the policy router.

## Durable boundary
- `testing-strategies` should own the confidence decision.
- `backend-testing` should own concrete implementation of the chosen regression/integration/contract work.
- `debugging` should own current red/flaky suite diagnosis.
- `code-review` should own approval judgment on one diff.
- `web-accessibility` should own accessibility-heavy validation follow-through.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[testing-strategies-modernization-2026-04-13]]
- [[debugging-structural-hardening-2026-04-18]]
- [[code-review-structural-hardening-2026-04-18]]
- [[performance-optimization-structural-hardening-2026-04-18]]
