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
- Graph edges: 1072

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` are still the highest-degree maintenance nodes because they index the live catalog.
2. Basic support coverage is now complete across the live skill set: all 89 skills have `references/`, `evals/`, and a compact discovery variant. Structural maintenance should keep shifting from missing support folders to trigger clarity, boundary quality, and stale high-visibility anchors.
3. `jeo` remains one of the highest-degree runtime skills, and this run improved the maintenance shape by shrinking `SKILL.md` well under the 500-line guideline while moving platform/state/troubleshooting detail into dedicated references.
4. The core-orchestration lane is still healthiest when `jeo` stays the integrated router and routes outward to `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, and `ralphmode` instead of absorbing their specialist surfaces.

## Highest-degree nodes
- skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- skills.toon: degree 81
- debugging: degree 40
- performance-optimization: degree 27
- code-review: degree 25
- plannotator: degree 24
- task-planning: degree 24
- jeo: degree 23
- ralph: degree 23

## Duplicate / consolidation notes
- `jeo` should stay distinct from `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, and `ralphmode`: it owns the integrated delivery loop and `.jeo` resume surface, not each specialist runtime or review layer.
- No new wrapper skill is justified in the orchestration cluster; the bounded win remains improving the existing anchor and syncing discovery surfaces.
- Future duplicate pressure is more likely to come from boundary creep inside high-visibility router skills than from missing support directories.

## Recommended maintenance direction
- Keep improving high-degree anchors when they drift or become too dense before adding new adjacent skills.
- Re-run catalog/runtime sync validation whenever `skills.json`, `skills.toon`, or top-level docs change materially.
- Prefer reference-doc splits for setup/state/troubleshooting detail when a main `SKILL.md` starts to overgrow its trigger surface.
