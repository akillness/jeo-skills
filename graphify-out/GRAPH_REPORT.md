# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 59
- Skills with evals/: 58
- Skills with scripts/: 23
- Graph nodes: 232
- Graph edges: 644

## Strongest structural findings
1. Catalog drift is currently repaired: filesystem skills and `.agent-skills/skills.json` both resolve to 89 entries, and top-level README/setup count surfaces were refreshed in the same pass.
2. The game-development lane is now visible in shipped discovery surfaces instead of living only as cross-links inside other skills.
3. `skill-standardization` is now a stronger maintenance anchor because it covers both SKILL.md quality and catalog/discovery sync checks.
4. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so repo-level inventory wording still materially affects activation.
5. The repo still gains more from upgrading high-visibility maintenance anchors than from adding overlapping wrappers in already-covered clusters.

## Community map
- agent-development
- backend
- code-quality
- core-orchestration
- creative-media
- documentation
- frontend
- game-development
- infrastructure
- marketing
- planning-review
- project-management
- search-analysis
- uncategorized
- utilities

## Highest-degree nodes
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- debugging: degree 27
- code-review: degree 16
- jeo: degree 16
- performance-optimization: degree 16
- plannotator: degree 15
- state-management: degree 14
- task-planning: degree 14

## Duplicate / consolidation notes
- `video-production` and `remotion-video-production` stay healthiest as canonical skill + compatibility alias.
- `design-system` and `frontend-design-system` stay healthiest as canonical skill + compatibility alias.
- `marketing-automation` and `marketing-skills-collection` stay healthiest as canonical skill + compatibility alias.
- `skill-standardization` now owns catalog-sync validation in addition to SKILL.md linting, which reduces repo-wide discovery drift.

## Recommended maintenance direction
- Keep runtime discovery filesystem-first, with manifest metadata acting as an overlay rather than a hard gate.
- Run the catalog-sync validator whenever a skill is added, renamed, removed, or canonicalized into an alias.
- Keep README / README.ko / setup prompt inventory surfaces in sync with the live folder set, especially for specialist game-dev lanes.
