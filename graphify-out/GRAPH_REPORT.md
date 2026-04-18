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
- Graph edges: 1113

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `vibe-kanban` dropped to 195 lines and now reads more clearly as a coding-board front door that can sit on top of GitHub Projects / Linear / Jira instead of pretending to replace them.
4. The planning-review boundary stays cleaner when `vibe-kanban` owns coding-board execution state while planning, browser review, and non-code coordination keep routing outward.

## Highest-degree nodes
- debugging: degree 41
- task-planning: degree 31
- bmad: degree 27
- performance-optimization: degree 27
- code-review: degree 25

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- code-refactoring: 292 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- web-accessibility: 290 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- genkit: 285 lines in SKILL.md

## Duplicate / consolidation notes
- No new vibe-kanban-adjacent helper skill is justified: the bounded win was shrinking `vibe-kanban` in place and syncing the discovery surfaces.
- `vibe-kanban` should stay distinct from generic PM boards, browser-review tools, and planning-only orchestration because it owns coding-board execution state, review queues, and cleanup discipline.
- Duplicate pressure rises when teams describe any tracker board as an AI kanban; explicit tracker-sync guidance is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree skills whose trigger logic can be made smaller without weakening their artifact contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
