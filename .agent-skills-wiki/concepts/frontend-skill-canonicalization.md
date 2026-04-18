---
title: Frontend Skill Canonicalization
created: 2026-04-12
updated: 2026-04-19
type: concept
tags: [skills, consolidation, trigger-design, frontend, docs]
sources: [.survey/frontend-skill-consolidation-20260412/context.md, .survey/frontend-design-system-canonicalization-20260412/context.md, .survey/frontend-legacy-anchors-20260413/context.md, .survey/frontend-legacy-anchors-20260413/platform-map.md, .survey/frontend-alias-support-hardening-20260416/context.md, .survey/react-grab-structural-hardening-20260416/context.md, .survey/react-grab-structural-hardening-20260416/solutions.md, .survey/design-system-structural-hardening-20260416/context.md, .survey/design-system-structural-hardening-20260416/solutions.md, .survey/responsive-design-structural-hardening-20260419/context.md, .survey/responsive-design-structural-hardening-20260419/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Frontend Skill Canonicalization

## Durable finding
The frontend cluster now has **two** true canonical-vs-alias pairs plus three clearer anchors:
- `react-best-practices` owns general React/Next.js performance work, while `vercel-react-best-practices` survives only as a compatibility alias.
- `design-system` owns general frontend UI-system work, while `frontend-design-system` survives only as a compatibility alias.
- `state-management` now owns React state-boundary decisions across local, shared, URL/form, server, and long-lived client workflow state instead of remaining a generic library-tour skill.
- The 2026-04-18 structural-hardening pass tightened that boundary further: `state-management` is now an ownership-packet router that explicitly accounts for router-native data ownership and routes responsive-layout and design-system governance questions out instead of absorbing them.
- `web-accessibility` now owns accessibility remediation plus manual-vs-automated verification, while `web-design-guidelines` now owns the broad interface-audit lane for hierarchy, clarity, consistency, interaction-state quality, responsiveness basics, accessibility basics, and launch-readiness review.
- `ui-component-patterns` now owns reusable primitive / variant / slot API design, while `responsive-design` owns the responsive-layout lane.
- The 2026-04-19 structural-hardening pass tightened that boundary further: `responsive-design` is now a routing-first strategy anchor that chooses one packet (`page-layout`, `component-slot`, `dense-data`, `media-behavior`, or `verification-reflow`) before suggesting mechanisms, and it routes broad UI review, accessibility-heavy remediation, and system-wide breakpoint governance out instead of absorbing them.
- `react-grab` stays distinct from both the browser-review cluster and the broader frontend architecture lane: it owns exact React element-context capture from a live browser UI, not generic browser automation (`agent-browser`, `playwriter`), rendered-UI review (`agentation`), performance diagnosis (`react-best-practices`), or general UI-system design (`design-system`).
- `design-system` now behaves like a stronger canonical anchor instead of a generic example dump: it owns token governance, primitive naming, and cross-surface system direction, while routing component API design to `ui-component-patterns`, responsive layout work to `responsive-design`, accessibility-heavy remediation to `web-accessibility`, and broad critique to `web-design-guidelines`.

## Why this matters
- Tier-1 discovery relies heavily on compact skill metadata.
- Public inventory surfaces list frontend skills side-by-side, so duplicated descriptions create avoidable activation noise.
- The best fix is usually canonicalization plus sharper trigger wording, not another new frontend skill.
- Canonicalization is only complete when README/setup/manifest surfaces also reflect the new boundary.

## Operational rule
When two frontend skills compete at the metadata layer but not in long-term user value, prefer one canonical skill plus one thin compatibility alias. Add evals so the canonical skill wins ordinary prompts and the alias only survives for exact-name or migration scenarios.

Canonicalization is not fully done until compact discovery surfaces (`SKILL.toon`, shared manifests, and any top-level discovery copy that changed materially) also present the alias as a redirect layer rather than a peer frontend default.

## Related pages
- [[skill-support-coverage]]
- [[react-skill-canonicalization-2026-04-12]]
- [[design-system-canonicalization-2026-04-12]]
- [[frontend-alias-support-hardening-2026-04-16]]
- [[react-grab-structural-hardening-2026-04-16]]
- [[design-system-structural-hardening-2026-04-16]]
- [[state-management-modernization-2026-04-13]]
- [[state-management-structural-hardening-2026-04-18]]
- [[web-accessibility-modernization-2026-04-13]]
- [[ui-component-patterns-modernization-2026-04-13]]
- [[responsive-design-modernization-2026-04-13]]
- [[responsive-design-structural-hardening-2026-04-19]]
