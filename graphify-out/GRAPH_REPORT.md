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
3. `git-submodule` is no longer an oversized front door: it dropped to 208 lines after moving mode packets and hosted-platform constraints into a focused support reference.
4. The next bounded wins still come from sharpening remaining oversized anchors and keeping `SKILL.toon` / manifest / README/setup wording truthful after structural edits.

## Highest-degree nodes
- debugging: degree 41
- task-planning: degree 30
- bmad: degree 27
- performance-optimization: degree 27
- code-review: degree 24

## Oversized front-door watchlist
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- survey: 310 lines in SKILL.md
- fabric: 309 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- changelog-maintenance: 293 lines in SKILL.md
- code-refactoring: 293 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- monitoring-observability: 291 lines in SKILL.md

## Duplicate / consolidation notes
- No new Git wrapper is justified: the bounded win was hardening `git-submodule` in place and syncing its discovery surfaces.
- `git-submodule` should stay distinct from `git-workflow`, `npm-git-install`, `workflow-automation`, and `system-environment-setup`; it owns external-repo boundary choice plus pinned-state / hosted-constraint operator flows after the repo has already chosen Git as the mechanism.
- Duplicate pressure remains highest when package delivery, generic Git cleanup, repo bootstrap automation, and hosted checkout constraints drift back into the same front door.

## Recommended maintenance direction
- Keep targeting high-degree or oversized skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer reference packets, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
