# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, discovery indexing, and support-file links
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 25
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 945
- Graph edges: 1670
- Category counts: agent-development=2, backend=5, code-quality=5, core-orchestration=10, creative-media=2, documentation=5, frontend=10, infrastructure=13, marketing=2, planning-review=5, project-management=4, search-analysis=7, uncategorized=7, utilities=12

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `looker-studio-bigquery` is no longer on the top-10 oversized front-door watchlist after the packet-first pass: the front door now compresses the BigQuery reporting lane to 196 lines and pushes packet detail into a dedicated reference.
4. The next best maintenance wins still look like high-degree or oversized routers with stable contracts that can be tightened further without changing the discovery surfaces.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- setup-all-skills-prompt.md: degree 88
- README.md: degree 88
- README.ko.md: degree 88
- .agent-skills/skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- steam-store-launch-ops: 272 lines in SKILL.md
- state-management: 272 lines in SKILL.md
- omc: 272 lines in SKILL.md

## Duplicate / consolidation notes
- No new BI/reporting wrapper is justified: the bounded win was tightening `looker-studio-bigquery` in place and sharpening packet-first routing.
- `looker-studio-bigquery` should stay distinct from `data-analysis`, `pattern-detection`, `monitoring-observability`, and `survey` by owning BigQuery-backed stakeholder dashboard delivery only.
- Duplicate pressure now rises more from oversized front doors than from missing support coverage; keep shrinking stable routers rather than adding adjacent wrappers.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer support-packet improvements and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup, compact wording, or validator/support scripts change materially.
