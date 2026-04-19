# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, discovery indexing, and explicit cross-skill mentions
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 25
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 386
- Graph edges: 1071

## Strongest structural findings
1. Discovery docs remain the highest-degree nodes because README / setup / manifest surfaces still index nearly the full live catalog.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from shrinking dense front-door skills instead of adding wrappers.
3. `scrapling` now matches the repo's routing-first pattern more closely: intake packet first, parser/HTTP before browser, stealth as a later escalation, and honest route-outs to APIs, managed unblockers, or crawler frameworks.
4. The next best maintenance wins still look like oversized or high-degree routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- setup-all-skills-prompt.md: degree 89
- README.md: degree 89
- README.ko.md: degree 89
- .agent-skills/skills.toon: degree 89
- .agent-skills/skills.json: degree 89

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
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
- `scrapling` should stay distinct from general browser automation, crawler frameworks, and agent-facing scrape APIs by owning mode selection inside the Scrapling ecosystem rather than trying to absorb every scraping-adjacent stack.
- The durable gap in this lane is truthful routing: parser-only vs HTTP vs dynamic browser vs stealth vs MCP vs spiders, with explicit route-outs to direct API interception, managed unblockers, or larger crawl frameworks.
- Discovery docs remain high-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer support-packet improvements and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
