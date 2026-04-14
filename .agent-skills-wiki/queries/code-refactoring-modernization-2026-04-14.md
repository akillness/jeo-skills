---
title: Code Refactoring Modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/code-refactoring-modernization-20260414/triage.md, .survey/code-refactoring-modernization-20260414/context.md, .survey/code-refactoring-modernization-20260414/solutions.md, .survey/code-refactoring-modernization-20260414/loop-charter.md, graphify-out/GRAPH_REPORT.md]
---

# Code Refactoring Modernization 2026-04-14

## Question
What is the best bounded next code-quality modernization target after `debugging`, `code-review`, and `testing-strategies` were already sharpened, given the need to avoid another overlapping quality or cleanup wrapper?

## Decision
Modernize `code-refactoring` into the behavior-preserving structural-cleanup anchor instead of adding another cleanup, migration, or code-quality wrapper.

## Why this won
- Survey evidence showed the same recurring workflow across CLI/dev, web/fullstack, backend, and game-programming repos: teams still rely on a cleanup loop built from local semantic refactors, search, tests, and reviewable slices, with codemods reserved for repeated migrations.
- The old skill was still a textbook pattern dump with weak trigger wording, no support files, and weak route-outs to `debugging`, `code-review`, `testing-strategies`, `performance-optimization`, and `codebase-search`.
- The graph refresh after the rewrite made the code-quality cluster read more cleanly as cleanup → policy → implementation → diagnosis → judgment → tuning, which is more reusable than adding another generic code-quality layer.

## Accepted changes
- Rewrite `code-refactoring` as a mode-selecting structural-cleanup skill.
- Add `references/` for refactor modes, handoff boundaries, and a safe-refactor checklist.
- Add `evals/evals.json` that test local cleanup, behavior-freeze-first legacy cleanup, repo-scale migration planning, and route-out behavior.
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces stop hiding the sharper role.
- Refresh graph outputs and wiki notes so future runs see the code-quality cluster as a cleaner split.

## Rejected alternatives
- Adding another generic cleanup or technical-debt wrapper.
- Leaving `code-refactoring` as a design-pattern catalog with little workflow guidance.
- Folding debugging, PR judgment, test-policy design, or performance profiling into the same skill.
- Treating repo-wide migrations as just a bigger local refactor with no transform-validation loop.

## Durable takeaway
The code-quality cluster improves when `code-refactoring` owns behavior-preserving structural cleanup, `testing-strategies` owns validation policy, `backend-testing` owns backend coverage implementation, `debugging` owns failure diagnosis, `code-review` owns change judgment, and `performance-optimization` owns measurement-led tuning.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[debugging-modernization-2026-04-13]]
- [[code-review-modernization-2026-04-13]]
- [[testing-strategies-modernization-2026-04-13]]
