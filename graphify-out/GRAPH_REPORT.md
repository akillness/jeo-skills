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
3. `game-performance-profiler` is no longer on the oversized front-door watchlist: the front door now drops to 231 lines, keeps one profiling-brief contract, and pushes mode/route-out density into a dedicated reference.
4. The next bounded wins still come from sharpening remaining oversized front doors and keeping `SKILL.toon` / manifest / README/setup wording truthful after structural edits.

## Highest-degree nodes
- debugging: degree 41
- task-planning: degree 30
- bmad: degree 27
- performance-optimization: degree 27
- code-review: degree 24

## Oversized front-door watchlist
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- git-submodule: 293 lines in SKILL.md
- changelog-maintenance: 292 lines in SKILL.md
- code-refactoring: 292 lines in SKILL.md
- langsmith: 290 lines in SKILL.md

## Duplicate / consolidation notes
- No new game-performance wrapper is justified: the bounded win was hardening `game-performance-profiler` in place and syncing its packet-first discovery surfaces.
- `game-performance-profiler` should stay distinct from `performance-optimization`, `game-build-log-triage`, `game-demo-feedback-triage`, `bmad-gds`, and `steam-store-launch-ops`; it owns engine-specific frame-time triage, benchmark-route design, target-device review, and profiler escalation once runtime evidence exists.
- Duplicate pressure remains highest when generic optimization, build failure triage, and broad game-production coordination drift back into the same front door.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer reference packets, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
