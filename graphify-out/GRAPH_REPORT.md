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
- Graph edges: 1102

## Strongest structural findings
1. Discovery docs still dominate the graph because README / setup / manifest surfaces index nearly the full live catalog, so documentation sync remains mandatory whenever a skill boundary changes materially.
2. Support coverage remains effectively complete across the live skill set, so the highest-value maintenance wins still come from tightening dense front-door skills instead of adding wrappers.
3. `skill-autoresearch` is now a packet-first repo-local ratcheting router: start from `benchmark-readiness`, `charter-freeze`, `baseline-score`, `one-change-mutation`, `support-sync`, `final-report`, or `route-out` instead of treating the skill like a generic eval-platform explainer.
4. The refreshed `skill-autoresearch` lane now calls hosted dashboards/traces and GPU-bound `autoresearch` out explicitly, which keeps markdown/git artifact ratcheting as the distinctive contract of the search-analysis maintenance layer.
5. The next best maintenance wins still look like oversized routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- .agent-skills/skills.json: degree 90
- .agent-skills/skills.toon: degree 90
- README.ko.md: degree 90
- README.md: degree 90
- setup-all-skills-prompt.md: degree 90

## Oversized front-door watchlist
- clawteam: 300 lines in SKILL.md
- opencontext: 295 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- testing-strategies: 274 lines in SKILL.md
- skill-autoresearch: 273 lines in SKILL.md
- steam-store-launch-ops: 272 lines in SKILL.md
- state-management: 272 lines in SKILL.md
- plannotator: 266 lines in SKILL.md

## Duplicate / consolidation notes
- `skill-autoresearch` should stay distinct from `autoresearch` by owning repo-local markdown/git ratchets rather than GPU-bound ML search loops.
- `skill-autoresearch` should also stay distinct from hosted eval/observability products such as Promptfoo, LangSmith, Braintrust, and Weave by owning append-only repo artifacts, support-surface sync, and PR-reviewable keep/revert history.
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer packet/route-out clarifications and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
