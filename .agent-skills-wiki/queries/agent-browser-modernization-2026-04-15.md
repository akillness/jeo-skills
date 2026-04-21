---
title: agent-browser modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/agent-browser-modernization-20260415/triage.md, .survey/agent-browser-modernization-20260415/context.md, .survey/agent-browser-modernization-20260415/solutions.md, .survey/agent-browser-modernization-20260415/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# agent-browser modernization 2026-04-15

## Question
What is the best bounded browser-review-cluster improvement after modernizing `playwriter` and `agentation`?

## Answer
Modernize `agent-browser` into the **fresh-session deterministic browser verification** anchor instead of adding another overlapping browser or QA skill.

## Why this won
- The browser-review cluster already had clear adjacent boundaries, so `agent-browser` was the main remaining high-visibility skill still lacking eval coverage.
- The strongest external patterns converged on clean-session verification, resilient refs/locators, explicit before/after evidence, and separate handling for stateful auth/session reuse.
- A bounded rewrite plus `evals/evals.json` improves trigger precision and future ratcheting without inflating the catalog.

## What changed
- Rewrote `agent-browser/SKILL.md` around clean-session verification, route-outs, and the observe → act → observe loop.
- Added `references/modes-and-routing.md`.
- Added `evals/evals.json`.
- Updated README / README.ko / setup prompt / `skills.json` / `skills.toon` so discovery surfaces advertise the tighter role.

## Rejected alternatives
- Adding another browser verification wrapper alongside `agent-browser`.
- Letting `agent-browser` blur into `playwriter`'s running-browser lane.
- Turning `agent-browser` into a generic rendered-UI feedback or plan-review skill.

## Durable note
When the browser-review lane changes, keep the runtime split explicit:
- `agent-browser` = clean reproducible browser verification
- `playwriter` = running-browser / authenticated-session reuse
- `agentation` = exact rendered-UI feedback packets
- `plannotator` = plan/diff approval

## Related pages
- [[browser-review-cluster]]
- [[playwriter-modernization-2026-04-15]]
- [[agentation-modernization-2026-04-15]]
- [[skill-support-coverage]]
