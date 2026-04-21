---
title: Backend Testing Modernization
created: 2026-04-12
updated: 2026-04-12
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/backend-testing-modernization-20260413/context.md, .survey/backend-testing-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Backend Testing Modernization

## Question
What is the best bounded upgrade for the backend verification lane without creating another overlapping testing skill?

## Answer
Modernize `backend-testing` itself instead of adding another testing wrapper.

The high-value fix is to make `backend-testing` own:
- backend-specific coverage selection across unit, integration, contract/API, and narrow smoke layers
- dependency realism choices (mock vs fake vs containerized real dependency)
- fixture / seed / auth bootstrap strategy
- local-vs-CI lane design and flaky-test stabilization

It should **not** try to own:
- whole-org QA policy (`testing-strategies`)
- API contract design (`api-design`)
- auth implementation (`authentication-setup`)

## Why this won
- The prior skill was long, generic, and framework-example-heavy, which made triggers noisy and reuse weak.
- Survey evidence in this run still pointed toward layered testing, explicit flake handling, and realistic dependency choices rather than “just add more E2E.”
- The backend cluster already had a strong contract-design anchor after the `api-design` ratchet; verification was the next weak spot.
- Adding `references/` and `evals/` improves future ratcheting without adding duplicate catalog surface area.

## Rejected alternatives
- Adding a second backend test strategy skill
- Turning `backend-testing` into a generic company-wide testing governance skill
- Leaving dependency realism, fixture strategy, and local-vs-CI splits implicit

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[api-design-modernization-2026-04-12]]
