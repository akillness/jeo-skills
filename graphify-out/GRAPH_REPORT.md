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
- Graph edges: 1055
- Category counts: agent-development=2, backend=5, code-quality=5, core-orchestration=10, creative-media=2, documentation=5, frontend=10, infrastructure=13, marketing=2, planning-review=5, project-management=4, search-analysis=7, uncategorized=7, utilities=12

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `responsive-design` now reads more clearly as a routing-first responsive strategy anchor that chooses one packet before suggesting mechanisms and keeps dense-data, media, and reflow verification explicit.
4. The frontend lane stays healthiest when `responsive-design` owns layout strategy, `web-accessibility` owns remediation-heavy a11y work, `ui-component-patterns` owns reusable component APIs, and `design-system` owns shared breakpoint/token governance.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- looker-studio-bigquery: 276 lines in SKILL.md
- codebase-search: 275 lines in SKILL.md

## Duplicate / consolidation notes
- No new responsive/front-end wrapper is justified: the bounded win was tightening `responsive-design` in place and syncing the discovery surfaces.
- `responsive-design` should stay distinct from `ui-component-patterns` (component API design), `web-accessibility` (accessibility remediation), `design-system` (shared breakpoint/token governance), and `web-design-guidelines` (broad UI audit).
- Duplicate pressure rises when responsive layout, launch review, component structure, and accessibility remediation blur together; the routing-first packet model is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening the output contract.
- Prefer support-packet improvements and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
