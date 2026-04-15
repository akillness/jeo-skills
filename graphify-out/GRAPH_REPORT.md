# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 86
- Skills with evals/: 88
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 381
- Graph edges: 1063

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` are still the highest-degree maintenance nodes.
2. `marketing-skills-collection` is no longer a references holdout: the alias now has a focused support packet that teaches canonical resolution, legacy-name preservation, and explicit route-outs without reviving a second broad marketing peer.
3. The marketing discovery layer is sharper: `marketing-automation` now advertises the KPI-aware router model in compact surfaces, while `marketing-skills-collection` advertises compatibility/migration behavior instead of the obsolete 23-sub-skill worldview.
4. The highest-value remaining support gaps are now concentrated in the alias lanes `frontend-design-system`, `remotion-video-production`, and `vercel-react-best-practices`, plus the prose-only eval holdout `ralph`.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 40
- performance-optimization: degree 27
- code-review: degree 25
- task-planning: degree 24
- plannotator: degree 23
- bmad: degree 22
- jeo: degree 22

## Duplicate / consolidation notes
- `marketing-automation` should stay distinct from `marketing-skills-collection`: one is the canonical broad marketing router, the other is a compatibility alias for exact-name legacy workflows.
- The bounded win was support/discovery hardening, not another marketing split; no new broad marketing wrapper is justified.
- Remaining weakly separated areas are concentrated in known alias lanes rather than the marketing pair.

## Recommended maintenance direction
- Keep upgrading remaining alias support-gap skills before adding overlapping wrappers.
- Remaining `references/` holdouts: frontend-design-system, remotion-video-production, vercel-react-best-practices.
- Remaining `evals/` holdouts: ralph.
- Re-run catalog/runtime sync validation whenever manifest descriptions or compact discovery wording changes materially.
