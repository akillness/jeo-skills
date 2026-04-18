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
- Graph edges: 1054

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `fabric` dropped to 265 lines and now reads like a routing-first operator front door that chooses one lane before handing off exact commands, scaffolds, or server packets.
4. The utilities boundary stays cleaner when `fabric` owns repeatable pattern-driven transforms and routes generic chat prompting, repo-aware coding, and deterministic automation outward.

## Highest-degree nodes
- task-planning: degree 22
- code-review: degree 21
- vibe-kanban: degree 21
- debugging: degree 20
- jeo: degree 20

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
- No new Fabric-adjacent helper skill is justified: the bounded win was shrinking `fabric` in place and syncing the discovery surfaces.
- `fabric` should stay distinct from general LLM CLIs, coding assistants, and workflow-automation skills because it owns repeatable named transforms over external text/content.
- Duplicate pressure rises when users describe any CLI AI workflow as “Fabric”; explicit route-outs remain the right fix.

## Recommended maintenance direction
- Keep targeting high-degree skills whose trigger logic can be made smaller without weakening their artifact contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
