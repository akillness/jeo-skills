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
- Graph edges: 1152

## Strongest structural findings
1. Discovery docs still dominate the graph because README / setup / manifest surfaces index nearly the full live catalog, so documentation sync remains mandatory whenever a skill boundary changes materially.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from tightening dense front-door skills instead of adding wrappers.
3. `opencontext` is now a packet-first active project-memory router: the front door chooses memory-layer choice, load-context, search-context, store-conclusions, setup-integration, or repo-packer route-out instead of behaving like a long OpenContext CLI catalog.
4. The refreshed `opencontext` lane now calls out repo packers explicitly as a neighboring one-shot snapshot workflow, which keeps manifests/stable links/handoff packets as the distinctive contract of the project-memory layer.
5. The next best maintenance wins still look like oversized routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- .agent-skills/skills.json: degree 90
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- .agent-skills/skills.toon: degree 83

## Oversized front-door watchlist
- clawteam: 300 lines in SKILL.md
- opencontext: 295 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- testing-strategies: 274 lines in SKILL.md
- steam-store-launch-ops: 272 lines in SKILL.md
- state-management: 272 lines in SKILL.md
- omc: 272 lines in SKILL.md
- skill-autoresearch: 267 lines in SKILL.md

## Duplicate / consolidation notes
- `opencontext` should stay distinct from `llm-wiki`, `graphify`, and note/vault skills by owning active project-memory packets, manifests, stable links, and cross-agent handoff rather than narrative wiki maintenance, structural graph memory, or human-authored note organization.
- `opencontext` should also stay distinct from repo packers such as Repomix / Gitingest / Code2Prompt by owning durable load/search/store loops instead of one-shot repo-to-prompt snapshots.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer packet/route-out clarifications and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
