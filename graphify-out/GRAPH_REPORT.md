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
- Graph edges: 1084

## Strongest structural findings
1. Discovery docs remain the highest-degree nodes because README / setup / manifest surfaces still index nearly the full live catalog.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from shrinking dense front-door skills instead of adding wrappers.
3. `clawteam` is now better aligned with the repo's routing-first pattern: manual team control, template launch, monitoring/recovery, and profile setup are explicit operator modes instead of one long feature tour.
4. The `clawteam` support packet now matches the upstream CLI more closely: `team spawn-team`, `launch`, `board attach/serve`, `task create/update`, `inbox send`, and `profile` / `preset` flows are visible where the old skill mixed earlier command families.
5. The next best maintenance wins still look like oversized or high-degree routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- .agent-skills/skills.json: degree 90
- setup-all-skills-prompt.md: degree 89
- README.md: degree 89
- README.ko.md: degree 89
- .agent-skills/skills.toon: degree 83

## Oversized front-door watchlist
- clawteam: 300 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- testing-strategies: 274 lines in SKILL.md
- steam-store-launch-ops: 272 lines in SKILL.md
- state-management: 272 lines in SKILL.md
- omc: 272 lines in SKILL.md
- opencontext: 270 lines in SKILL.md

## Duplicate / consolidation notes
- `clawteam` should stay distinct from `jeo`, `omc`, `omx`, `ohmg`, and lightweight subtask delegation by owning the ClawTeam-specific task/inbox/worktree/runtime operator surface rather than generic orchestration.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer support-packet improvements and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
