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
- Graph nodes: 386
- Graph edges: 1057

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `log-analysis` now joins the routing-first cohort: the front door compresses the log lane to 242 lines and pushes packet detail into a dedicated reference.
4. The next best maintenance wins still look like high-degree or oversized routers with stable contracts that can be tightened further without changing the discovery surfaces.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- obsidian-cli: 287 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- steam-store-launch-ops: 273 lines in SKILL.md
- state-management: 273 lines in SKILL.md
- omc: 273 lines in SKILL.md

## Duplicate / consolidation notes
- No new log/incident wrapper is justified: the bounded win was tightening `log-analysis` in place and sharpening evidence-packet routing.
- `log-analysis` should stay distinct from `debugging`, `monitoring-observability`, `pattern-detection`, and `game-build-log-triage` by owning first-blocker triage only.
- Duplicate pressure still rises more from oversized front doors than from missing support coverage; keep shrinking stable routers rather than adding adjacent wrappers.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer support-packet improvements and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup, compact wording, or validator/support scripts change materially.
