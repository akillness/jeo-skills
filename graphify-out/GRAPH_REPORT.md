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
- Graph edges: 1147

## Strongest structural findings
1. Discovery docs still dominate the graph because README / setup / manifest surfaces index nearly the full live catalog, so documentation sync remains mandatory whenever a skill boundary changes materially.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from tightening dense front-door skills instead of adding wrappers.
3. `backend-testing` is now a clearer backend packet router: it separates coverage planning, fixture/reset control, contract/API protection, flaky-suite stabilization, and execution-lane splits instead of blending them into one generic “write tests” front door.
4. The refreshed `backend-testing` lane now keeps policy (`testing-strategies`), contract shape (`api-design`), and auth implementation (`authentication-setup`) route-outs explicit, which should reduce overlap in the backend/code-quality cluster.
5. The next best maintenance wins still look like oversized routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- .agent-skills/skills.json: degree 90
- setup-all-skills-prompt.md: degree 89
- README.md: degree 89
- README.ko.md: degree 89
- .agent-skills/skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 301 lines in SKILL.md
- opencontext: 296 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- testing-strategies: 275 lines in SKILL.md
- skill-autoresearch: 274 lines in SKILL.md
- steam-store-launch-ops: 273 lines in SKILL.md
- state-management: 273 lines in SKILL.md
- fabric: 266 lines in SKILL.md

## Duplicate / consolidation notes
- `backend-testing` should stay distinct from `testing-strategies`, `api-design`, `authentication-setup`, `debugging`, and `code-review` by owning concrete backend test packets rather than policy, interface design, implementation, diagnosis, or judgment.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.
- The backend/code-quality cluster still benefits more from front-door hardening than from adding another testing wrapper.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer packet/route-out clarifications and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
