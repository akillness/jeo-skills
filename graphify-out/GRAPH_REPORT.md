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
- Graph edges: 1146

## Strongest structural findings
1. Discovery docs still dominate the graph because README / setup / manifest surfaces index nearly the full live catalog, so documentation sync remains mandatory whenever a skill boundary changes materially.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from tightening dense front-door skills instead of adding wrappers.
3. `omc` is now a routing-first Claude-first orchestration front door: the skill starts by choosing plugin setup, in-session runtime, terminal runtime, recovery/update, or boundary route-out instead of mixing plugin docs, CLI manual, and adjacent ownership in one surface.
4. The refreshed `omc` lane now makes the plugin-vs-CLI split explicit (`/team` vs `omc team`, in-session Autopilot/Ralph/Ultrawork vs shell-side `omc` commands), which is more stable than copying volatile upstream command catalogs into the front door.
5. The next best maintenance wins still look like oversized routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- .agent-skills/skills.json: degree 90
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- .agent-skills/skills.toon: degree 83

## Oversized front-door watchlist
- clawteam: 301 lines in SKILL.md
- opencontext: 296 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- testing-strategies: 275 lines in SKILL.md
- state-management: 273 lines in SKILL.md
- steam-store-launch-ops: 273 lines in SKILL.md
- skill-autoresearch: 268 lines in SKILL.md
- plannotator: 267 lines in SKILL.md

## Duplicate / consolidation notes
- `omc` should stay distinct from `jeo`, `ralphmode`, `omx`, `ohmg`, `plannotator`, `agent-browser`, `playwriter`, and `agentation` by owning Claude-first runtime routing instead of long-loop orchestration, permissions, review gates, browser verification, or non-Claude runtime adoption.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.
- Plugin slash skills and the `omc` terminal CLI should be described as adjacent surfaces, not as one interchangeable command family.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer packet/route-out clarifications and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
