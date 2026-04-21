---
title: Frontend alias support hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, survey, frontend, skill-quality, docs]
sources: [.survey/frontend-alias-support-hardening-20260416/triage.md, .survey/frontend-alias-support-hardening-20260416/context.md, .survey/frontend-alias-support-hardening-20260416/solutions.md, .survey/frontend-alias-support-hardening-20260416/loop-charter.md, .agent-skills/frontend-design-system/SKILL.md, .agent-skills/vercel-react-best-practices/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Frontend alias support hardening 2026-04-16

## Question
What is the best bounded next improvement for the remaining frontend alias pair: leave `frontend-design-system` and `vercel-react-best-practices` as thin wrappers, delete them, or harden them in place with support packets and compact-surface sync?

## Decision
Harden both aliases in place.

## Why
- The graph showed these were two of the last remaining `references/` holdouts, while the canonical frontend taxonomy was already settled.
- The real gap was not skill overlap anymore; it was derived-artifact drift: `skills.toon` still described both aliases like ordinary peer frontend skills.
- npm’s deprecate-not-delete model supports preserving legacy entry points while steering users toward the supported target package or version.
- React Profiler and Next.js lazy-loading docs reinforce that substantive React performance guidance belongs in the canonical measurement-led skill, not in the legacy alias shell.

## Accepted changes
- Added alias-side `references/` packets to `frontend-design-system` and `vercel-react-best-practices`.
- Updated both `SKILL.md` files so the alias packets are the first redirect step before the canonical handoff.
- Refreshed both alias `SKILL.toon` files and the shared `.agent-skills/skills.toon` entries so compact discovery now matches `skills.json`.
- Refreshed graph outputs and recorded the remaining repo-wide support-gap list.

## Rejected changes
- Deleting either alias outright.
- Re-promoting either alias into a peer canonical frontend skill.
- Leaving the compact discovery drift in place while relying on repo memory to explain the boundary.

## Durable boundary
`design-system` remains the canonical UI-system anchor and `react-best-practices` remains the canonical measurement-led React / Next.js performance anchor. Their legacy aliases should survive only for exact-name compatibility, migration-safe routing, and setup surfaces that still reference the old folder names.

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
- [[design-system-canonicalization-2026-04-12]]
- [[react-skill-canonicalization-2026-04-12]]
- [[react-best-practices-support-hardening-2026-04-16]]
