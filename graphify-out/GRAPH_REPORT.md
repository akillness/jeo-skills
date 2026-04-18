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
- Graph edges: 1055
- Category counts: agent-development=2, backend=5, code-quality=5, core-orchestration=10, creative-media=2, documentation=5, frontend=10, infrastructure=13, marketing=2, planning-review=5, project-management=4, search-analysis=7, uncategorized=7, utilities=12

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `task-estimation` now reads more clearly as a routing-first estimate-packet anchor that chooses one sizing horizon and keeps split/spike and forecast-safe language explicit.
4. The project-management lane stays healthiest when `task-planning` owns decomposition, `task-estimation` owns sizing and uncertainty packets, `standup-meeting` owns daily coordination, and `sprint-retrospective` owns process learning.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- survey: 310 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- obsidian-cli: 287 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- responsive-design: 278 lines in SKILL.md
- looker-studio-bigquery: 277 lines in SKILL.md

## Duplicate / consolidation notes
- No new PM wrapper is justified: the bounded win was tightening `task-estimation` in place and syncing the discovery surfaces.
- `task-estimation` should stay distinct from `task-planning` (decomposition), `standup-meeting` (daily sync), and `sprint-retrospective` (reflection and process correction).
- Duplicate pressure rises when sizing, planning, forecasting, and commitment language blur together; the routing-first estimate-packet model is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening the output contract.
- Prefer support-packet improvements and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
