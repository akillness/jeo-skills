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
- Graph edges: 1063
- Category counts: agent-development=2, backend=5, code-quality=5, core-orchestration=10, creative-media=2, documentation=5, frontend=10, infrastructure=13, marketing=2, planning-review=5, project-management=4, search-analysis=7, uncategorized=7, utilities=12

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so bounded front-door cleanup is still more valuable than adding another wrapper skill.
3. `web-accessibility` dropped to 231 lines and now reads as a routing-first remediation anchor with explicit packet selection, route-outs, and routed-app feedback coverage.
4. The frontend lane stays healthiest when `web-accessibility` owns remediation + verification, while `web-design-guidelines`, `responsive-design`, `ui-component-patterns`, and `design-system` keep neighboring critique, layout, API, and governance work separate.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- task-planning: degree 30
- performance-optimization: degree 26
- debugging: degree 25

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- code-refactoring: 292 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- presentation-builder: 284 lines in SKILL.md

## Duplicate / consolidation notes
- No new accessibility wrapper is justified: the bounded win was tightening `web-accessibility` in place and syncing the discovery surfaces.
- `web-accessibility` should stay distinct from `web-design-guidelines` (broad critique), `responsive-design` (layout strategy), `ui-component-patterns` (reusable API boundaries), and `design-system` (governance).
- Routed-app navigation feedback is a useful sub-lane inside accessibility remediation, not a separate standalone skill.

## Recommended maintenance direction
- Keep targeting oversized front-door skills whose trigger logic can be made smaller without weakening their output contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
