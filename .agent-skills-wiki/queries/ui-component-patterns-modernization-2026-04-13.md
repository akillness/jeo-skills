---
title: UI Component Patterns Modernization 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, frontend, trigger-design, skill-quality, survey]
sources: [.survey/frontend-legacy-anchors-20260413/context.md, .survey/frontend-legacy-anchors-20260413/solutions.md, .survey/frontend-legacy-anchors-20260413/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# UI Component Patterns Modernization — 2026-04-13

## Question
What is the best bounded frontend improvement after the `web-accessibility` and `state-management` upgrades: modernize `responsive-design`, modernize `ui-component-patterns`, or add another frontend wrapper?

## Decision
Modernize **`ui-component-patterns`**.

## Why this won
- Survey synthesis showed the highest-frequency day-to-day pain is duplicated primitives, prop sprawl, inconsistent variants, and weak shared-component boundaries.
- `ui-component-patterns` has cleaner route-outs than `responsive-design`: it can hand token/system work to `design-system`, accessibility remediation to `web-accessibility`, layout adaptation to `responsive-design`, state ownership to `state-management`, and runtime performance to `react-best-practices`.
- Graph refresh confirmed the frontend cluster is cleaner when `ui-component-patterns` owns reusable primitive / variant / slot API design and `responsive-design` stays narrower.
- The existing skill was still a long legacy example dump with no `references/` or `evals/`, so it cleared the upgrade bar without creating a noisy duplicate.

## Accepted changes
- Rewrote `ui-component-patterns/SKILL.md` into a reusable primitive / variant / slot API skill with explicit route-ins and route-outs.
- Added `references/component-api-checklist.md` and `references/handoff-boundaries.md`.
- Added `evals/evals.json` covering reusable API design, controlled-vs-uncontrolled boundaries, and handoffs to `design-system` and `web-accessibility`.
- Updated README / README.ko / setup prompt / `skills.json` so discovery surfaces describe the sharper role.
- Refreshed graph artifacts and frontend-cluster notes.

## Rejected changes
- Modernizing `responsive-design` in the same run; that would have mixed two adjacent frontend rewrites and weakened comparability.
- Adding another frontend component-library or design-system wrapper; the repo already had the right anchor name.
- Letting `ui-component-patterns` absorb system governance, accessibility remediation, or layout-only responsive strategy.

## Durable takeaway
`ui-component-patterns` should own **reusable primitive/API architecture**, especially shared-vs-local decisions, variants, slots, and controlled-vs-uncontrolled boundaries. It should remain adjacent to — not merged with — [[frontend-skill-canonicalization]], `design-system`, `web-accessibility`, `responsive-design`, `state-management`, and `react-best-practices`.
