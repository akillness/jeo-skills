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
- Graph edges: 836

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. The `survey` hardening pass kept the canonical 4-lane `.survey/{slug}` contract while shrinking the front door from 392 to 309 lines and moving slower-changing portability detail into a focused reference.
4. The next research-layer wins still come from sharpening dense front doors and truthful discovery wording, not from inventing another nearby research wrapper.

## Highest-degree nodes
- debugging: degree 46
- task-planning: degree 27
- performance-optimization: degree 25
- plannotator: degree 24
- code-review: degree 22

## Oversized front-door watchlist
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- vercel-deploy: 314 lines in SKILL.md
- survey: 310 lines in SKILL.md
- fabric: 309 lines in SKILL.md
- sprint-retrospective: 305 lines in SKILL.md
- debugging: 298 lines in SKILL.md
- game-performance-profiler: 297 lines in SKILL.md
- task-planning: 295 lines in SKILL.md

## Duplicate / consolidation notes
- No new adjacent research wrapper is justified: the bounded win was hardening `survey` in place.
- `survey` should stay distinct from `plan`, `jeo`, `ralph`, `skill-autoresearch`, and domain anchors; it owns reusable landscape artifacts, not architecture planning or implementation.
- Future duplicate pressure remains highest when market/workflow discovery, platform-config details, and execution planning drift back into one giant front door.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer references/evals/discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever discovery wording or compact surfaces change materially.
