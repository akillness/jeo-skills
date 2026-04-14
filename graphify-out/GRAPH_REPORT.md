# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 60
- Skills with evals/: 59
- Skills with scripts/: 23
- Graph nodes: 234
- Graph edges: 653

## Strongest structural findings
1. `data-analysis` is now a stronger search-analysis anchor because it has a workflow-first rewrite plus new `references/` and `evals/` support.
2. Search-analysis boundaries are sharper when `data-analysis` owns dataset reasoning, `pattern-detection` owns repeated anomaly hunting, and BI build-out routes to `looker-studio-bigquery`.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so even existing-skill repositioning should update top-level inventory wording.
4. The repo still benefits more from upgrading legacy anchors with support bundles than from adding overlapping wrapper skills in already-covered clusters.
5. Support coverage improved again in a high-utility cross-domain lane without creating new catalog noise.

## Community map
- backend
- code-quality
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
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- debugging: degree 31
- performance-optimization: degree 21
- code-review: degree 19
- jeo: degree 19
- plannotator: degree 19
- web-accessibility: degree 19
- task-planning: degree 17

## Duplicate / consolidation notes
- `data-analysis` should stay the generic dataset-reasoning anchor rather than splitting into another broad analytics wrapper.
- `pattern-detection` remains the better home for repeated anomaly/rule-based scanning once detection becomes the main job.
- `looker-studio-bigquery` remains the better home for dashboard construction and BigQuery-connected reporting workflows.
- Discovery wording in README/setup surfaces still matters because top-level docs connect to every shipped skill.

## Recommended maintenance direction
- Keep upgrading legacy high-utility anchors with support bundles before adding new analytics-adjacent skills.
- Re-check search-analysis boundary wording whenever `data-analysis`, `pattern-detection`, or BI/reporting skills are materially edited.
- Keep catalog/discovery surfaces synchronized when an existing skill is repositioned, not only when a new skill is added.
