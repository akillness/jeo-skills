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
3. The `performance-optimization` hardening pass kept the front door compact at 246 lines, added an explicit intake-packet escalation reference, expanded eval coverage beyond pure web/backend cases, and synced stale compact/discovery surfaces.
4. The next bounded wins still come from sharpening high-degree front doors and keeping `SKILL.toon` / manifest / README surfaces truthful after structural edits.

## Highest-degree nodes
- debugging: degree 41
- task-planning: degree 30
- performance-optimization: degree 27
- bmad: degree 26
- code-review: degree 25

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
- No new performance wrapper is justified: the bounded win was hardening `performance-optimization` in place.
- `performance-optimization` should stay distinct from `monitoring-observability`, `debugging`, `code-refactoring`, `testing-strategies`, and `game-performance-profiler`; it owns artifact-first measurement-led tuning after a concrete performance signal exists.
- Duplicate pressure remains highest when telemetry setup, correctness diagnosis, benchmark policy, and engine-specific profiler reading drift back into the same front door.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer reference packets, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
