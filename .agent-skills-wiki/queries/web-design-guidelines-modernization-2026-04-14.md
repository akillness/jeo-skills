---
title: Web Design Guidelines Modernization (2026-04-14)
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [survey, skills, trigger-design, skill-quality, frontend, docs]
sources: [.survey/web-design-guidelines-modernization-20260414/triage.md, .survey/web-design-guidelines-modernization-20260414/context.md, .survey/web-design-guidelines-modernization-20260414/solutions.md, .agent-skills/web-design-guidelines/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Web Design Guidelines Modernization (2026-04-14)

## Why this skill was the best bounded target
`web-design-guidelines` was the weakest remaining high-visibility frontend review anchor. The repo had already modernized `web-accessibility`, `responsive-design`, `ui-component-patterns`, and `design-system`, but this neighboring skill still behaved like a thin Vercel-rules fetcher with no `references/`, no `evals/`, and weak trigger boundaries.

## What changed
- Rewrote `web-design-guidelines` into the repo's broad interface audit / design-review anchor.
- Added review modes for launch-readiness, polish/consistency, flow-friction, heuristic, and rule-overlay audits.
- Added explicit category-based review guidance for hierarchy, clarity, consistency, interaction states, wayfinding, responsiveness basics, accessibility basics, and performance/trust signals.
- Added reusable support files:
  - `references/review-modes-and-categories.md`
  - `references/handoff-boundaries.md`
  - `references/ui-audit-packet-template.md`
  - `evals/evals.json`
- Updated discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`) so the repositioned skill is visible at the catalog layer.

## Accepted reasoning
- Vercel Web Interface Guidelines are still a useful overlay, but they work better as one evidence source than as the entire method.
- NN/G heuristics and UI audit checklist guidance both point toward category-based review and explicit task-friction judgment rather than a raw rules dump.
- W3C's accessibility-tool inventory reinforces that automated scanning is only one lane of a broader interface review.
- Graph findings showed that upgrading the remaining weak anchor was better than adding another overlapping frontend review wrapper.

## Rejected alternatives
- Leaving `web-design-guidelines` as a Vercel-only compliance wrapper.
- Letting `web-accessibility` absorb broad UI review just because accessibility basics are part of the audit.
- Adding a second generic UI/UX audit skill instead of sharpening the existing anchor.

## Durable insight
The frontend lane is cleaner when `web-design-guidelines` owns **broad interface audit packets** and routes specialist remediation outward: accessibility-heavy fixes to [[web-accessibility-modernization-2026-04-13]], layout adaptation to [[responsive-design-modernization-2026-04-13]], reusable primitive/API redesign to [[ui-component-patterns-modernization-2026-04-13]], and system governance to [[design-system-canonicalization-2026-04-12]].

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
- [[web-accessibility-modernization-2026-04-13]]
- [[responsive-design-modernization-2026-04-13]]
- [[ui-component-patterns-modernization-2026-04-13]]
- [[design-system-canonicalization-2026-04-12]]
