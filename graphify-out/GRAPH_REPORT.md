# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 88
- Manifest skills in `.agent-skills/skills.json`: 88
- Skills with references/: 88
- Skills with evals/: 88
- Skills with scripts/: 23
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 88
- Skills missing compact variants: 0
- Graph nodes: 380
- Graph edges: 1029

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` are still the highest-degree maintenance nodes because they index the live catalog.
2. Basic support coverage remains complete across the live skill set: all 88 skills still have `references/`, `evals/`, and a compact discovery variant. Structural maintenance should keep shifting from missing support folders to trigger clarity, boundary quality, and stale high-visibility anchors.
3. `design-system` was the clearest next bounded frontend-cluster cleanup target because its old front door had grown into a 459-line mixed manual even after canonical-vs-alias cleanup. The current pass shrank it to 257 lines, expanded the canonical reference bundle to 4 markdown docs, and refreshed discovery wording around governance-first ownership.
4. `design-system` should stay distinct from adjacent lanes: shared token/governance direction is not the same job as component-family API architecture (`ui-component-patterns`), responsive layout adaptation (`responsive-design`), accessibility remediation (`web-accessibility`), or broad interface audit (`web-design-guidelines`).

## Highest-degree nodes
- skills.json: degree 88
- README.md: degree 87
- README.ko.md: degree 87
- setup-all-skills-prompt.md: degree 87
- skills.toon: degree 80
- debugging: degree 26
- performance-optimization: degree 26
- code-review: degree 24
- task-planning: degree 24
- plannotator: degree 23
- jeo: degree 23
- vibe-kanban: degree 22

## Duplicate / consolidation notes
- `design-system` should stay distinct from `ui-component-patterns`, `responsive-design`, `web-accessibility`, and `web-design-guidelines`: it owns shared token/governance rules and cross-surface system direction, not component API extraction, layout-collapse strategy, accessibility remediation, or broad page critique.
- No new wrapper skill is justified in the frontend design-system lane; the bounded win remains improving the existing canonical anchor and syncing support/discovery surfaces.
- Future duplicate pressure is more likely to come from high-visibility skills absorbing adjacent workflows than from missing support directories.

## Recommended maintenance direction
- Keep improving high-degree anchors when they drift or become too dense before adding new adjacent skills.
- Re-run catalog/runtime sync validation whenever `skills.json`, `skills.toon`, or top-level docs change materially.
- Prefer reference-doc splits and truthful routing/discovery updates when a main `SKILL.md` starts to overgrow its trigger surface or carry stale route-outs.
