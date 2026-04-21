---
title: Backend Testing Structural Hardening 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/backend-testing-structural-hardening-20260420/triage.md, .survey/backend-testing-structural-hardening-20260420/context.md, .survey/backend-testing-structural-hardening-20260420/solutions.md, .survey/backend-testing-structural-hardening-20260420/lane-c.md, graphify-out/GRAPH_REPORT.md]
---

# Backend Testing Structural Hardening 2026-04-20

## Question
What is the best bounded follow-up for `backend-testing` now that the backend and code-quality cluster already has support coverage and adjacent routers for policy, API design, and auth setup?

## Answer
Tighten `backend-testing` into a packet-first backend test router.

The winning move is to start from the request packet the operator actually has:
- `coverage-plan`
- `fixture-and-reset-plan`
- `contract-and-api-checks`
- `flake-stabilization`
- `execution-lane-split`

That keeps `backend-testing` focused on concrete backend verification work while routing these adjacent jobs away:
- org-wide test policy → `testing-strategies`
- API contract shape / versioning debates → `api-design`
- auth/session/provider implementation → `authentication-setup`

## Why this won
- The modernization pass already fixed the lane split; the remaining weakness was a still-large front door that could blur packet choice.
- Survey evidence still points to layered backend testing, explicit dependency realism, and CI-vs-local drift handling rather than another generic testing wrapper.
- Contract/API protection and flaky-suite stabilization both deserved first-class packet language instead of being side notes under a broad “write backend tests” umbrella.
- The structural graph shows the repo now gets more value from tightening dense front doors than from adding new skills.

## Rejected alternatives
- Adding another backend testing wrapper for flake work or contract testing
- Broadening `backend-testing` into org-wide test governance
- Pulling API redesign or auth implementation detail back into the testing skill

## Related pages
- [[backend-api-cluster]]
- [[skill-support-coverage]]
- [[backend-testing-modernization-2026-04-12]]
- [[testing-strategies-structural-hardening-2026-04-19]]
