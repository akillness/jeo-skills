---
title: UI Component Patterns Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, frontend, trigger-design, skill-quality, survey]
sources: [.survey/ui-component-patterns-structural-hardening-20260419/context.md, .survey/ui-component-patterns-structural-hardening-20260419/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# UI Component Patterns Structural Hardening — 2026-04-19

## Question
What is the best bounded frontend follow-up after the recent responsive/front-end hardening work: add another component-architecture wrapper, leave `ui-component-patterns` alone, or tighten the existing skill into a routing-first reusable-component front door?

## Decision
Tighten **`ui-component-patterns`** in place.

## Why this won
- Graph refresh showed `ui-component-patterns` was still on the oversized front-door watchlist even after support coverage became complete across the repo.
- Survey evidence from Radix, MUI, shadcn/ui, and Storybook pointed to the same recurring pressure: teams need one packet for shared-vs-local scope, slots/anatomy, controlled ownership, alternate-root composition, or docs/verification — not another generic component-pattern wrapper.
- The market docs are strong on examples and APIs, but weaker on **which packet to choose first** and where to hand off to design-system, accessibility, responsive layout, app-state, or React-performance work.
- A packet-first front door improves trigger quality and compacts the skill without widening the repo's frontend surface area.

## Accepted changes
- Rewrote `ui-component-patterns/SKILL.md` into a routing-first packet selector.
- Added `references/intake-packets-and-route-outs.md`.
- Expanded `evals/evals.json` with alternate-root composition and Storybook/docs-verification cases.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, README / README.ko, and setup discovery wording.
- Refreshed graph artifacts and frontend-cluster notes.

## Rejected changes
- Adding another frontend wrapper for component libraries or polymorphic components.
- Letting `ui-component-patterns` absorb design-system governance, accessibility remediation, responsive layout strategy, app-level state ownership, or React performance tuning.
- Leaving compact/discovery wording on the stale generic “component best practices” framing after the front-door rewrite.

## Durable takeaway
`ui-component-patterns` should own **routing-first reusable component architecture**: pick one packet, make the primitive/wrapper boundary explicit, and route adjacent frontend work outward early. The clean boundary is between reusable component design and neighboring lanes, not between yet more overlapping component-library wrappers.
