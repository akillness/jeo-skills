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
- Graph edges: 825

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup and truthful routing still matter more than adding new wrapper skills.
3. `task-planning` is healthier as a routing-first planning anchor when backlog/sprint/release/milestone mode choice stays in the front door and domain packet detail moves into references.
4. The project-management lane still rewards bounded hardening of canonical anchors over another overlapping backlog or sprint wrapper.

## Highest-degree nodes
- debugging: degree 40
- task-planning: degree 27
- performance-optimization: degree 24

## Oversized front-door watchlist
- survey: 391 lines in SKILL.md
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- vercel-deploy: 313 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- sprint-retrospective: 304 lines in SKILL.md
- git-workflow: 298 lines in SKILL.md
- debugging: 297 lines in SKILL.md

## Duplicate / consolidation notes
- No new PM wrapper is justified: the bounded win was hardening `task-planning` in place.
- `task-planning` should stay distinct from `task-estimation`, `vibe-kanban`, `plannotator`, `standup-meeting`, `sprint-retrospective`, and `bmad-gds`; those own sizing, board control, plan review, cadence, reflection, and broader game orchestration layers.
- Future duplicate pressure remains highest when trackers or board-control language drifts back into the planning anchor.

## Recommended maintenance direction
- Keep targeting dense front-door skills whose method boundary can be sharpened without expanding the catalog.
- Prefer correcting stale compact/manifest/discovery wording before adding another wrapper skill.
- Re-run catalog/runtime sync validation whenever descriptions, compact files, or manifest entries change materially.
