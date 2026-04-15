# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 84
- Skills with evals/: 86
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 377
- Graph edges: 1013

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` still index every live skill and remain the highest-degree maintenance nodes.
2. `ralphmode` is no longer just a reference-only permission skill: it now has eval coverage, a refreshed compact variant, and discovery copy that states the settings / rules / hooks model more explicitly.
3. The useful boundary for `ralphmode` is the permission/profile layer for trusted repos versus sandbox-only YOLO, not the runtime ownership of `ralph`, `omc`, `omx`, `ohmg`, or `jeo`.
4. Support-coverage leverage still comes from upgrading indexed legacy anchors instead of adding overlapping orchestration or permissions wrappers.

## Highest-degree nodes
- skills.json: degree 89
- skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- debugging: degree 26
- performance-optimization: degree 25
- code-review: degree 24
- task-planning: degree 24
- monitoring-observability: degree 22
- plannotator: degree 22
- system-environment-setup: degree 22


## Duplicate / consolidation notes
- `ralphmode` should remain the single cross-platform permission-profile skill instead of spawning separate trusted-folder, bypass, or checkpoint wrapper skills.
- The stronger route is workflow-and-boundary hardening: repo-local presets, explicit rules, and hook-backed checkpoints where the platform supports them.
- README / setup surfaces now reflect the sharper route boundary, so discovery copy is aligned with the skill body again.

## Recommended maintenance direction
- Keep upgrading the remaining support-gap skills that still lack `references/` or `evals/` before adding overlapping wrappers.
- Re-run catalog/runtime sync validation whenever discovery copy or manifest descriptions change materially.
- Treat `ralphmode` as the permission/profile layer; route runtime orchestration questions outward to `ralph`, `omc`, `omx`, `ohmg`, and `jeo`.
