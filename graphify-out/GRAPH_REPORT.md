# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, documentation indexing, and cross-skill mentions
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 385
- Graph edges: 1109

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `monitoring-observability` drops off the oversized front-door watchlist after shrinking from 290 to 226 lines, and its compact discovery surfaces now match the routing-first packet boundary.
4. The infrastructure/search-analysis boundary stays cleaner when observability starts from packet + action threshold and routes execution, forensics, tuning, BI presentation, and engine-profiler work outward.

## Highest-degree nodes
- debugging: degree 41
- task-planning: degree 30
- bmad: degree 27
- performance-optimization: degree 27
- plannotator: degree 24

## Oversized front-door watchlist
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- code-refactoring: 292 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- state-management: 290 lines in SKILL.md
- web-accessibility: 290 lines in SKILL.md

## Duplicate / consolidation notes
- No new monitoring wrapper is justified: the bounded win was hardening `monitoring-observability` in place and synchronizing stale compact discovery surfaces.
- `monitoring-observability` should stay distinct from `log-analysis`, `performance-optimization`, `deployment-automation`, `data-analysis`, `looker-studio-bigquery`, `langsmith`, and `game-performance-profiler`; it owns packet-first telemetry design/review, not forensics, tuning, rollout execution, KPI explanation, or engine capture analysis.
- Duplicate pressure remains highest when observability requests drift into generic debugging, dashboard-only work, or deployment runbooks without a bounded signal-plan brief.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer packet references, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
