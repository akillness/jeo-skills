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
- Graph edges: 1106

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. The `debugging` hardening pass shrank the front door to 252 lines, added an explicit mode-selection packet, and synced stale compact/discovery surfaces without creating another code-quality wrapper.
4. The next bounded wins still come from sharpening high-degree front doors and keeping `SKILL.toon` / manifest / README surfaces truthful after structural edits.

## Highest-degree nodes
- debugging: degree 41
- task-planning: degree 30
- performance-optimization: degree 27
- bmad: degree 26
- code-review: degree 25

## Oversized front-door watchlist
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- vercel-deploy: 314 lines in SKILL.md
- survey: 310 lines in SKILL.md
- fabric: 309 lines in SKILL.md
- sprint-retrospective: 305 lines in SKILL.md
- game-performance-profiler: 297 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- git-submodule: 294 lines in SKILL.md

## Duplicate / consolidation notes
- No new debugging-adjacent wrapper is justified: the bounded win was hardening `debugging` in place.
- `debugging` should stay distinct from `log-analysis`, `testing-strategies`, `code-review`, `performance-optimization`, and `monitoring-observability`; it owns the diagnosis loop after the failure is concrete enough to test.
- Duplicate pressure remains highest when symptom triage, flake policy, env/setup redesign, and performance work drift back into the same front door.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer reference packets, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
