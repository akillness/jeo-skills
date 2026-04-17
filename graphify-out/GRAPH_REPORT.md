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
- Graph nodes: 94
- Graph edges: 806

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest / compact surfaces still index almost the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding new wrapper skills.
3. `git-workflow` is healthier as a routing-first local Git anchor when mode packets live in references and the front door stays focused on local-state triage, collaboration risk, and safe next moves.
4. The developer-workflow lane still rewards bounded hardening of canonical anchors over creating adjacent Git wrappers that would blur the clean boundary with hosted PR or repo-management flows.

## Highest-degree nodes
- debugging: degree 34
- code-review: degree 19
- task-planning: degree 19
- performance-optimization: degree 18
- survey: degree 17
- vibe-kanban: degree 17
- jeo: degree 16
- bmad: degree 15

## Oversized front-door watchlist
- survey: 392 lines in SKILL.md
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- vercel-deploy: 314 lines in SKILL.md
- fabric: 309 lines in SKILL.md
- sprint-retrospective: 305 lines in SKILL.md
- debugging: 298 lines in SKILL.md
- game-performance-profiler: 297 lines in SKILL.md

## Duplicate / consolidation notes
- No new Git wrapper is justified: the bounded win was hardening `git-workflow` in place.
- `git-workflow` should stay distinct from hosted PR/repo-management flows; those own remote review/admin state, not local history repair.
- Future duplicate pressure remains highest where local Git mechanics drift back into hosted PR language or generic repo-automation claims.

## Recommended maintenance direction
- Keep targeting dense front-door skills whose method boundary can be sharpened without expanding the catalog.
- Prefer correcting stale compact/discovery wording and moving packet detail to references before adding another wrapper.
- Re-run catalog/runtime sync validation whenever descriptions, compact files, or discovery surfaces change materially.
