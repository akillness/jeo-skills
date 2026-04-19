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
- Graph edges: 1162

## Strongest structural findings
1. Discovery docs still dominate the graph because README / setup / manifest surfaces index nearly the full live catalog, so documentation sync remains mandatory whenever a skill boundary changes materially.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from tightening dense front-door skills instead of adding wrappers.
3. `state-management` is now smaller and more explicit: it forces one primary packet, calls out the likely wrong owner, and routes React Router/server-state misclassification away from universal-store advice.
4. The frontend cluster remains cleaner when `state-management` owns ownership classification and routes component API, layout, performance, debugging, and API-contract work outward.
5. The next best maintenance wins still look like oversized routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- README.md: degree 90
- README.ko.md: degree 90
- setup-all-skills-prompt.md: degree 90
- .agent-skills/skills.json: degree 90
- .agent-skills/skills.toon: degree 90
- debugging: degree 39
- task-planning: degree 31
- bmad: degree 29

## Oversized front-door watchlist
- jeo: 305 lines in SKILL.md
- steam-store-launch-ops: 305 lines in SKILL.md
- clawteam: 301 lines in SKILL.md
- opencontext: 296 lines in SKILL.md
- task-planning: 288 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- testing-strategies: 275 lines in SKILL.md
- skill-autoresearch: 274 lines in SKILL.md
- fabric: 266 lines in SKILL.md
- omc: 265 lines in SKILL.md

## Duplicate / consolidation notes
- `state-management` should stay distinct from `react-best-practices`, `api-design`, `debugging`, `ui-component-patterns`, `design-system`, and `responsive-design` by owning packet classification rather than performance, API contracts, active failure diagnosis, component API design, system governance, or viewport strategy.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.
- The frontend cluster still benefits more from front-door hardening than from another React state wrapper.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer packet/route-out clarifications and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
