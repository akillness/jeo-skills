---
title: Web Accessibility Modernization 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, survey, frontend, trigger-design, skill-quality]
sources: [.survey/web-accessibility-modernization-20260413/context.md, .survey/web-accessibility-modernization-20260413/solutions.md, .agent-skills/web-accessibility/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Web Accessibility Modernization 2026-04-13

## Decision
The best bounded frontend improvement was modernizing `web-accessibility` into an **accessibility remediation and verification anchor** instead of leaving it as a generic WCAG/example dump or adding another adjacent accessibility wrapper.

## Why this won
- W3C explicitly says no tool alone can determine whether a site meets accessibility standards, which means the skill needed stronger manual-vs-automated guidance.
- web.dev frames accessibility testing as automated + manual + assistive-technology work, which the legacy skill only implied.
- The repo already had neighboring frontend skills for broader UI review (`web-design-guidelines`), component API architecture (`ui-component-patterns`), and viewport adaptation (`responsive-design`), so the right move was boundary sharpening rather than expansion.
- `web-accessibility` was still a high-visibility frontend skill with no `references/` or `evals/`, so the upgrade had durable leverage.

## Accepted changes
- Rewrote `web-accessibility` around accessibility surface classification, automated-vs-manual split, semantic HTML before ARIA, keyboard/focus prioritization, and route-outs.
- Added `references/audit-remediation-checklist.md` and `references/handoff-boundaries.md`.
- Added `evals/evals.json`.
- Updated README / README.ko / setup prompt / `skills.json` so discovery surfaces reflect the sharper role.
- Refreshed graph artifacts and frontend-cluster notes to record the cleaner boundary with `web-design-guidelines`, `ui-component-patterns`, and `responsive-design`.

## Rejected changes
- Adding another accessibility audit wrapper.
- Letting `web-accessibility` absorb broader UI/polish review already covered by `web-design-guidelines`.
- Letting `web-accessibility` absorb reusable component API architecture already covered by `ui-component-patterns`.

## Durable takeaway
`web-accessibility` should own **accessibility remediation plus verification planning**, especially the boundary between automated findings and manual follow-up. That makes it a better anchor next to [[frontend-skill-canonicalization]], [[skill-support-coverage]], `web-design-guidelines`, and `ui-component-patterns`.

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
- [[state-management-modernization-2026-04-13]]
