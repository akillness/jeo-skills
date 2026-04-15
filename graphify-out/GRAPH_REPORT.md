# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 79
- Skills with evals/: 80
- Skills with scripts/: 23
- Graph nodes: 276
- Graph edges: 885

## Strongest structural findings
1. `looker-studio-bigquery` is structurally healthier as the BigQuery-backed stakeholder dashboard/reporting anchor than as a generic Looker Studio feature dump: the modernized skill now has explicit support files, evals, and route-outs to `data-analysis`, `pattern-detection`, `monitoring-observability`, and `survey`.
2. The search-analysis cluster boundary remains cleaner when `data-analysis` owns KPI explanation and dataset reasoning while `looker-studio-bigquery` owns the dashboard/reporting layer on top of curated BigQuery data.
3. The infrastructure discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`) still dominate graph degree, so wording drift around high-visibility skills materially affects discoverability.
4. The support-coverage ratchet matters: this run raises the structural floor for a previously weak but README-visible infrastructure/search-analysis-adjacent skill without adding another overlapping analytics wrapper.
5. The better next move remains bounded modernization of weak anchors and aliases, not expanding the catalog with another BI/dashboard wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 80
- debugging: degree 24
- code-review: degree 23
- task-planning: degree 23
- performance-optimization: degree 22
- plannotator: degree 21
- system-environment-setup: degree 21
- vibe-kanban: degree 21

## Duplicate / consolidation notes
- `looker-studio-bigquery` should stay separate from `data-analysis`: dashboard/reporting build-out is not the same as explaining what changed in the numbers.
- `looker-studio-bigquery` should stay separate from `pattern-detection`: stakeholder dashboards are not repeatable anomaly/rule scans.
- `looker-studio-bigquery` should stay separate from `monitoring-observability`: BI reporting does not replace telemetry instrumentation, alerts, or reliability coverage.
- The lane does not justify another BigQuery/BI wrapper right now; the cleaner move was to modernize the existing anchor and add support coverage.

## Recommended maintenance direction
- Keep upgrading high-visibility legacy skills that still lack `references/` or `evals/` before inventing new wrappers.
- Re-check search-analysis and infrastructure boundaries whenever a dashboard/reporting skill is materially repositioned.
- Keep discovery docs and shipped manifests aligned with major trigger-surface rewrites.
