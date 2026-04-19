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
- Graph edges: 1116

## Strongest structural findings
1. Discovery docs remain the highest-degree nodes because README / setup / manifest surfaces still index nearly the full live catalog.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from shrinking dense front-door skills instead of adding wrappers.
3. `graphify` is now a live top-level utilities skill instead of a nested off-catalog folder, which closes a real runtime-discovery gap for the repo's structural-memory lane.
4. `scrapling` now matches the repo's routing-first pattern more closely: intake packet first, parser/HTTP before browser, stealth as a later escalation, and honest route-outs to APIs, managed unblockers, or crawler frameworks.
5. The next best maintenance wins still look like oversized or high-degree routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- setup-all-skills-prompt.md: degree 90
- README.md: degree 90
- README.ko.md: degree 90
- .agent-skills/skills.toon: degree 90
- .agent-skills/skills.json: degree 90

## Oversized front-door watchlist
- clawteam: 330 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- obsidian-cli: 287 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- testing-strategies: 275 lines in SKILL.md
- steam-store-launch-ops: 273 lines in SKILL.md
- state-management: 273 lines in SKILL.md
- omc: 273 lines in SKILL.md
- opencontext: 271 lines in SKILL.md

## Duplicate / consolidation notes
- `graphify` should stay distinct from `codebase-search`, `llm-wiki`, and `opencontext` by owning durable graph artifacts, graph-backed path tracing, and truthful structural fallback rather than search-first navigation, markdown synthesis, or project-memory handoff.
- `scrapling` should stay distinct from general browser automation, crawler frameworks, and agent-facing scrape APIs by owning mode selection inside the Scrapling ecosystem rather than trying to absorb every scraping-adjacent stack.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer support-packet improvements and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
