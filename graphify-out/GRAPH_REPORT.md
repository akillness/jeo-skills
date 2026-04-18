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
- Graph edges: 1110

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index the live catalog.
2. Support coverage remains effectively complete across the live skill set, so bounded front-door hardening still beats adding adjacent wrapper skills.
3. `marketing-automation` now fits that hardening pattern better: it shifted from a broad lane catalog toward operating-mode choice (`launch-orchestration`, `conversion-surface`, `lifecycle-retention`, `acquisition-content`, `measurement-experiment`) plus sharper route-outs to `steam-store-launch-ops` and `task-planning`.
4. The marketing cluster stays cleaner when the canonical front door owns mode + packet choice while `marketing-skills-collection` remains a compatibility alias and game-store launch work stays outside the general lane.

## Highest-degree nodes
- debugging: degree 36
- bmad: degree 23
- task-planning: degree 22
- vibe-kanban: degree 22
- code-review: degree 21

## Oversized front-door watchlist
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- survey: 310 lines in SKILL.md
- fabric: 309 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- code-refactoring: 293 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- web-accessibility: 291 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- obsidian-cli: 287 lines in SKILL.md

## Duplicate / consolidation notes
- No new broad marketing wrapper is justified: the bounded win was hardening `marketing-automation` in place.
- `marketing-automation` should stay distinct from `task-planning` and `steam-store-launch-ops`; it owns broad marketing mode selection, not milestone slicing or Steam-specific launch operations.
- Duplicate pressure remains highest when launch planning, lifecycle execution, analytics readout, and game-store work all get pulled into one generic “marketing help” request.

## Recommended maintenance direction
- Keep targeting high-degree skills whose front doors still behave like catalogs instead of routing packets.
- Prefer packet references, eval expansion, and discovery-surface sync over adding neighboring wrappers.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
