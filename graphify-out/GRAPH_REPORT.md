# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 385
- Graph edges: 1093

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` are still the highest-degree maintenance nodes because they index the live catalog.
2. Basic support coverage remains complete across the live skill set: all 89 skills still have `references/`, `evals/`, and a compact discovery variant. Structural maintenance should keep shifting from missing support folders to trigger clarity, boundary quality, and stale high-visibility anchors.
3. `react-grab` was the clearest next bounded frontend/browser cleanup target because its old front door had grown into a 494-line mixed manual. The current pass shrank it to 213 lines, increased focused reference coverage to 4 markdown docs, and aligned helper-script prerequisites with upstream Node.js >=22.
4. `react-grab` should stay distinct from adjacent lanes: React element-context capture is not the same job as generic browser automation (`agent-browser`, `playwriter`), rendered UI annotation (`agentation`), or React performance diagnosis (`react-best-practices`).

## Highest-degree nodes
- skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- skills.toon: degree 81
- debugging: degree 45
- performance-optimization: degree 28
- plannotator: degree 26
- code-review: degree 25
- task-planning: degree 24
- design-system: degree 23
- jeo: degree 23

## Duplicate / consolidation notes
- `react-grab` should stay distinct from `agent-browser`, `playwriter`, `agentation`, `react-best-practices`, and `design-system`: it owns exact React element-context capture from a live browser UI, not browser runtime choice, visual annotation, performance triage, or UI-system design.
- No new wrapper skill is justified in the frontend/browser lane; the bounded win remains improving the existing anchor and syncing support/discovery surfaces.
- Future duplicate pressure is more likely to come from high-visibility skills absorbing adjacent workflows than from missing support directories.

## Recommended maintenance direction
- Keep improving high-degree anchors when they drift or become too dense before adding new adjacent skills.
- Re-run catalog/runtime sync validation whenever `skills.json`, `skills.toon`, or top-level docs change materially.
- Prefer reference-doc splits and truthful prerequisite sync when a main `SKILL.md` starts to overgrow its trigger surface or helper scripts drift from upstream reality.
