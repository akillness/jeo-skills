---
title: Testing Strategies Modernization 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [survey, skills, trigger-design, skill-quality]
sources: [.survey/testing-strategies-modernization-20260413/triage.md, .survey/testing-strategies-modernization-20260413/context.md, .survey/testing-strategies-modernization-20260413/solutions.md, .survey/testing-strategies-modernization-20260413/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Testing Strategies Modernization 2026-04-13

## Question
What is the highest-value bounded improvement for the legacy `testing-strategies` skill after adjacent upgrades to `backend-testing`, `debugging`, and `code-review`?

## Answer
Rewrite `testing-strategies` into a **risk-based validation-policy skill** instead of leaving it as a generic test-pyramid / sample-code skill.

## Why this won
The survey showed a stable gap between:
- conceptual testing models like the pyramid or trophy,
- real-world release confidence work that still uses docs, checklists, and manual judgment,
- and repo-level decisions about what validation should run locally, on PRs, and before release.

That gap is not well served by another implementation-heavy skill. It is best served by a policy/orchestration anchor that:
1. classifies change risk,
2. selects the minimum convincing validation layers,
3. separates local / PR / release expectations,
4. defines flaky/expensive-suite rules,
5. routes implementation to `backend-testing`, failure diagnosis to `debugging`, and reviewer judgment to `code-review`.

## Accepted changes
- Rewrite `testing-strategies/SKILL.md` around risk tiers, validation-layer selection, and gate policy.
- Add `references/validation-matrix.md` and `references/handoff-boundaries.md`.
- Add `evals/evals.json`.
- Update `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json` so the stronger role is discoverable.
- Refresh graph outputs and wiki notes.

## Rejected alternatives
- Adding another overlapping testing-policy wrapper.
- Keeping `testing-strategies` as a sample-code and generic test-pyramid skill.
- Letting `testing-strategies` absorb backend implementation details or debugging work.
- Treating coverage percentage guidance as the whole strategy.

## Structural result
The code-quality cluster is now easier to route:
- policy → `testing-strategies`
- implementation → `backend-testing`
- diagnosis → `debugging`
- review judgment → `code-review`

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[backend-testing-modernization-2026-04-12]]
- [[debugging-modernization-2026-04-13]]
- [[code-review-modernization-2026-04-13]]
