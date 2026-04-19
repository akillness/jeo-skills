# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, discovery indexing, and explicit cross-skill mentions
- Total skills: 90
- Manifest skills in `.agent-skills/skills.json`: 90
- Skills with references/: 90
- Skills with evals/: 90
- Skills with scripts/: 25
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 90
- Skills missing compact variants: 0
- Graph nodes: 390
- Graph edges: 1148

## Strongest structural findings
1. Discovery docs still dominate the graph because README / setup / manifest surfaces index nearly the full live catalog, so documentation sync remains mandatory whenever a skill boundary changes materially.
2. Support coverage is still effectively complete across the live skill set, so the best maintenance wins remain bounded front-door ratchets rather than new wrapper skills.
3. `clawteam` is now a clearer packet-first runtime operator surface: it starts from one operator packet (`manual-team`, `template-launch`, `monitor-recover`, or `profile-setup`) and routes generic orchestration, board governance, and lightweight delegation outward sooner.
4. The refreshed `clawteam` boundary aligns better with repo-local orchestration owners (`jeo`, `omc`, `omx`, `ohmg`) and board governance (`vibe-kanban`) while keeping tmux/worktree runtime reality explicit.
5. The next best maintenance wins still look like oversized routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- .agent-skills/skills.json: degree 90
- README.md: degree 89
- README.ko.md: degree 89
- setup-all-skills-prompt.md: degree 89
- .agent-skills/skills.toon: degree 82
- debugging: degree 38
- task-planning: degree 31
- bmad: degree 29

## Oversized front-door watchlist
- jeo: 304 lines in SKILL.md
- steam-store-launch-ops: 304 lines in SKILL.md
- opencontext: 295 lines in SKILL.md
- task-planning: 287 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- testing-strategies: 274 lines in SKILL.md
- skill-autoresearch: 273 lines in SKILL.md
- fabric: 265 lines in SKILL.md
- omc: 264 lines in SKILL.md
- scrapling: 264 lines in SKILL.md

## Duplicate / consolidation notes
- `clawteam` should stay distinct from `jeo`, `omc`, `omx`, and `ohmg` by owning the ClawTeam-specific team/task/inbox/worktree/runtime surface rather than broad orchestration or policy routing.
- `clawteam` should stay distinct from `vibe-kanban` by routing board-governance and queue-control asks outward.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer packet/route-out clarifications and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
