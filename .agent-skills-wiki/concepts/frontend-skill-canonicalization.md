---
title: Frontend Skill Canonicalization
created: 2026-04-12
updated: 2026-04-12
type: concept
tags: [skills, consolidation, trigger-design, frontend, docs]
sources: [.survey/frontend-skill-consolidation-20260412/context.md, .survey/frontend-skill-consolidation-20260412/solutions.md, .survey/frontend-design-system-canonicalization-20260412/context.md, .survey/frontend-design-system-canonicalization-20260412/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Frontend Skill Canonicalization

## Durable finding
The frontend cluster now has **two** true canonical-vs-alias pairs:
- `react-best-practices` owns general React/Next.js performance work, while `vercel-react-best-practices` survives only as a compatibility alias.
- `design-system` owns general frontend UI-system work, while `frontend-design-system` survives only as a compatibility alias.

## Why this matters
- Tier-1 discovery relies heavily on compact skill metadata.
- Public inventory surfaces list frontend skills side-by-side, so duplicated descriptions create avoidable activation noise.
- The best fix is usually canonicalization plus sharper trigger wording, not another new frontend skill.
- Canonicalization is only complete when README/setup/manifest surfaces also reflect the new boundary.

## Operational rule
When two frontend skills compete at the metadata layer but not in long-term user value, prefer one canonical skill plus one thin compatibility alias. Add evals so the canonical skill wins ordinary prompts and the alias only survives for exact-name or migration scenarios.

## Related pages
- [[skill-support-coverage]]
- [[react-skill-canonicalization-2026-04-12]]
- [[design-system-canonicalization-2026-04-12]]
