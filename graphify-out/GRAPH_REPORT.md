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
- Graph edges: 956

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. The `code-review` hardening pass kept the front door under the 500-line guideline at 255 lines, added an explicit intake-packet escalation reference, expanded eval coverage for repo-admin and gameplay-validation cases, and synced stale compact/discovery surfaces.
4. The next bounded wins still come from sharpening high-degree front doors and keeping `SKILL.toon` / manifest / README surfaces truthful after structural edits.

## Highest-degree nodes
- task-planning: degree 22
- code-review: degree 21
- vibe-kanban: degree 21
- debugging: degree 20
- jeo: degree 20

## Oversized front-door watchlist
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- vercel-deploy: 313 lines in SKILL.md
- survey: 309 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- sprint-retrospective: 304 lines in SKILL.md
- game-performance-profiler: 296 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- git-submodule: 293 lines in SKILL.md

## Duplicate / consolidation notes
- No new code-review wrapper is justified: the bounded win was hardening `code-review` in place.
- `code-review` should stay distinct from `git-workflow`, `debugging`, `testing-strategies`, `performance-optimization`, `web-design-guidelines`, `web-accessibility`, and repo/PR workflow skills; it owns merge-readiness judgment on a concrete change.
- Duplicate pressure remains highest when Git hygiene, repo administration, debugging, UI critique, and review judgment drift back into the same front door.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer reference packets, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
