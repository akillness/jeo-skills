# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 88
- Skills with references/: 88
- Skills with evals/: 88
- Skills with scripts/: 23
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 88
- Skills missing compact variants: 0
- Graph nodes: 380
- Graph edges: 1057

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` are still the highest-degree maintenance nodes because they index the live catalog.
2. The core-orchestration lane is cleaner after the remotion alias PR merged: `ralph` is now the main remaining support hardening target, and the bounded win this run is to finish its eval/residue gap instead of inventing another orchestration wrapper.
3. `ralph` now looks like a support-complete canonical method candidate once eval coverage lands: the remaining repo-local friction is stale self-path examples that still point at `.agent-skills/ralph-ooo/...` rather than the live `ralph` directory.
4. After this run, the remaining structural eval holdouts should be empty; future graph refreshes should focus on boundary quality and duplicate pressure rather than missing basic support folders.

## Highest-degree nodes
- .agent-skills/skills.json: degree 88
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 87
- .agent-skills/skills.toon: degree 80
- debugging: degree 34
- code-review: degree 22
- performance-optimization: degree 21
- task-planning: degree 21
- vibe-kanban: degree 21
- jeo: degree 20
- survey: degree 20

## Duplicate / consolidation notes
- `ralph` should stay distinct from `omc`, `omx`, `ohmg`, `jeo`, `plannotator`, and `ralphmode`: it owns the specification-first method + persistent completion loop, not the platform runtime, approval gate, or permission layer.
- The bounded win is support hardening in place, not another orchestration wrapper.
- Creative-media and frontend alias lanes remain settled; this run shifts attention back to the core-orchestration support holdout.

## Recommended maintenance direction
- Keep improving intentional support holdouts before adding overlapping wrappers.
- Remaining `references/` holdouts: none.
- Remaining `evals/` holdouts: none.
- Re-run catalog/runtime sync validation whenever skill boundaries or compact/discovery wording changes materially.
