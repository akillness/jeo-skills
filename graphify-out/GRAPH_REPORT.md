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
- Graph edges: 1112

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `database-schema-design` dropped to 246 lines and now reads more clearly as a packet-first storage-design anchor with explicit report/telemetry route-outs.
4. The backend lane is healthier when `database-schema-design` owns storage-model and migration packets while `api-design`, `authentication-setup`, `backend-testing`, `looker-studio-bigquery`, and `monitoring-observability` keep their adjacent follow-through roles separate.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- survey: 310 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- obsidian-cli: 287 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- task-estimation: 279 lines in SKILL.md
- responsive-design: 278 lines in SKILL.md

## Duplicate / consolidation notes
- No new database wrapper is justified: the bounded win was tightening `database-schema-design` in place and syncing the discovery surfaces.
- `database-schema-design` should stay distinct from `api-design` (contract shape), `authentication-setup` (identity/session ownership), `backend-testing` (verification), `looker-studio-bigquery` (reporting presentation), and `monitoring-observability` (telemetry freshness / alerts).
- Duplicate pressure rises when schema requests blur data modeling, dashboard design, auth ownership, and migration verification into one blob; the packet-first route-out model is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening their output contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
