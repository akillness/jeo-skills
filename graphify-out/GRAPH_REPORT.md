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
- Graph edges: 1095

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `changelog-maintenance` is no longer on the oversized front-door watchlist: the front door now drops from 292 to 230 lines, selects one primary mode plus one smallest release-writing packet, and pushes channel handoff detail into a dedicated reference.
4. The documentation cluster pattern continues to hold: the best bounded follow-up is shrinking dense anchors and syncing compact/discovery surfaces rather than spawning adjacent doc wrappers.

## Highest-degree nodes
- debugging: degree 41
- task-planning: degree 30
- performance-optimization: degree 27
- code-review: degree 24
- plannotator: degree 24

## Oversized front-door watchlist
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- code-refactoring: 292 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- monitoring-observability: 290 lines in SKILL.md
- state-management: 290 lines in SKILL.md

## Duplicate / consolidation notes
- No new documentation wrapper is justified: the bounded win was hardening `changelog-maintenance` in place and making packet / handoff routing more explicit.
- `changelog-maintenance` should stay distinct from `technical-writing`, `api-documentation`, `user-guide-writing`, `deployment-automation`, and `marketing-automation`; it owns shipped-change summaries, not rollout mechanics, tutorials, internal runbooks, or launch campaigns.
- Duplicate pressure remains highest when changelog work drifts into migration handbooks, help-center refreshes, or launch messaging without a bounded release-summary packet.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer packet references, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
