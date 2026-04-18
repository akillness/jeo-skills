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
- Graph edges: 1118

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `state-management` is still on the oversized front-door watchlist, but the line count dropped from 290 to 273 and the boundary now covers URL/router ownership plus stronger route-outs to `responsive-design` and `design-system`.
4. The frontend boundary stays cleaner when `state-management` owns ownership-packet classification and routes performance, API-contract, debugging, component-API, design-system, and responsive-layout questions outward.

## Highest-degree nodes
- debugging: degree 48
- task-planning: degree 30
- performance-optimization: degree 28
- monitoring-observability: degree 27
- plannotator: degree 27

## Oversized front-door watchlist
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- survey: 310 lines in SKILL.md
- fabric: 309 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- code-refactoring: 293 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- web-accessibility: 291 lines in SKILL.md
- jeo: 289 lines in SKILL.md

## Duplicate / consolidation notes
- No new React state wrapper is justified: the bounded win was hardening `state-management` in place and synchronizing compact/discovery surfaces.
- `state-management` should stay distinct from `react-best-practices`, `api-design`, `debugging`, `ui-component-patterns`, `design-system`, and `responsive-design`; it owns ownership-packet decisions, not performance tuning, contract design, bug forensics, component APIs, system governance, or layout adaptation.
- Duplicate pressure remains highest when ownership questions drift into generic performance complaints, responsive breakpoints, or broken-code debugging without a fresh architecture decision.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer packet references, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.