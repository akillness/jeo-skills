# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 70
- Skills with evals/: 69
- Skills with scripts/: 23
- Graph nodes: 254
- Graph edges: 653

## Strongest structural findings
1. `bmad-idea` is stronger as a pre-planning concept router that chooses one framing mode and one concept artifact instead of behaving like a legacy BMAD-CIS persona catalog.
2. The core-orchestration lane is cleaner when early idea framing stays in `bmad-idea`, phase routing stays in `bmad`, GTM execution routing stays in `marketing-automation`, and game-production coordination stays in `bmad-gds`.
3. Support coverage improved again without adding a new skill: `bmad-idea` now has `references/` and `evals/`, which strengthens a high-visibility pre-planning anchor.
4. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so existing-skill rewrites still need synchronized top-level wording updates.
5. The repo still benefits more from upgrading weak legacy anchors than from adding another overlapping creativity wrapper.

## Highest-degree nodes
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- debugging: degree 22
- code-review: degree 20
- performance-optimization: degree 20
- task-planning: degree 19
- security-best-practices: degree 18
- api-documentation: degree 17
- monitoring-observability: degree 17

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `bmad-idea` is now a clearer pre-planning router because it owns concept framing and handoff choice instead of competing with `bmad`, `marketing-automation`, or `bmad-gds` as a generic creativity catalog.
- Discovery docs remain high-degree nodes, so positioning changes still require README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs instead of decision-first routers.
- Re-check README / README.ko / setup prompt whenever a core-orchestration skill changes role.
- Prefer support-file ratchets and sharper route-outs over adding another broad creativity or strategy wrapper skill.
