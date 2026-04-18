# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, documentation indexing, and cross-skill mentions
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 385
- Graph edges: 1064

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `security-best-practices` dropped to 232 lines and now reads more clearly as a routing-first hardening anchor with explicit security-layer packets and route-outs.
4. The security lane stays healthiest when `security-best-practices` owns layer classification and hardening briefs while `authentication-setup`, `api-design`, `database-schema-design`, `backend-testing`, `debugging`, and `system-environment-setup` keep adjacent concerns separate.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- code-refactoring: 292 lines in SKILL.md
- web-accessibility: 290 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- presentation-builder: 284 lines in SKILL.md

## Duplicate / consolidation notes
- No new security wrapper is justified: the bounded win was tightening `security-best-practices` in place and syncing the discovery surfaces.
- `security-best-practices` should stay distinct from `authentication-setup` (auth-stack choice), `api-design` (interface contracts), `database-schema-design` (schema/data-model work), `backend-testing` (test implementation), and `debugging` / `code-review` (code-level fixes and review judgment).
- Duplicate pressure rises when headers/CSP, CSRF, rate limits, secrets, and scanner findings are all described as one blob; the routing-first hardening brief is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening their output contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
