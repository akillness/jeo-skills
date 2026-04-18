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
- Graph edges: 1117

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `genkit` dropped to 251 lines and now reads more clearly as a packet-first backend workflow anchor that acknowledges plain SDK, Firebase AI Logic, Firebase CLI, and survey fallbacks.
4. The Firebase AI lane stays healthiest when `genkit` owns server-side workflow contracts, `firebase-ai-logic` owns direct app/client integration, and `firebase-cli` owns operator/runtime setup work.

## Highest-degree nodes
- debugging: degree 40
- task-planning: degree 30
- bmad: degree 27
- performance-optimization: degree 27
- code-review: degree 24

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
- autoresearch: 284 lines in SKILL.md

## Duplicate / consolidation notes
- No new Firebase/AI wrapper skill is justified: the bounded win was tightening `genkit` in place and syncing the discovery surfaces.
- `genkit` should stay distinct from `firebase-ai-logic` (direct app/client SDK integration) and `firebase-cli` (Firebase operator work).
- Duplicate pressure rises when teams describe any backend AI feature as a “full-stack AI framework” task; packet-first fallback guidance is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening their output contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
