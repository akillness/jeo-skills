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
- Graph edges: 1107

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `presentation-builder` dropped to 233 lines and now reads more clearly as a packet-first deck artifact anchor with explicit last-mile surface selection.
4. The documentation lane stays healthiest when `presentation-builder` owns deck-mode + packet + handoff selection while `technical-writing`, `user-guide-writing`, `research-paper-writing`, and `marketing-automation` keep adjacent artifacts separate.

## Highest-degree nodes
- skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- skills.toon: degree 82

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
- database-schema-design: 282 lines in SKILL.md

## Duplicate / consolidation notes
- No new deck wrapper is justified: the bounded win was tightening `presentation-builder` in place and syncing the discovery surfaces.
- `presentation-builder` should stay distinct from `technical-writing` (docs/specs), `user-guide-writing` (tutorial/help flows), `research-paper-writing` (manuscripts), and `marketing-automation` (non-deck GTM planning).
- Duplicate pressure rises when deck requests blur packet choice, source-of-truth handling, and last-mile cleanup into one blob; the packet-first handoff model is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening their output contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
