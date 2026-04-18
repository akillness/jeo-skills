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
- Graph edges: 1107

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `workflow-automation` dropped to 213 lines and now reads more clearly as a routing-first repo workflow anchor with explicit maintenance-bot and workflow-diagnosis lanes.
4. The developer-workflow lane stays healthiest when `workflow-automation` owns repo-local command glue, while `system-environment-setup`, `deployment-automation`, `git-workflow`, and `testing-strategies` keep neighboring concerns separate.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- survey: 310 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- code-refactoring: 293 lines in SKILL.md
- web-accessibility: 291 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- obsidian-cli: 287 lines in SKILL.md
- security-best-practices: 285 lines in SKILL.md

## Duplicate / consolidation notes
- No new workflow-automation wrapper is justified: the bounded win was tightening `workflow-automation` in place and syncing the discovery surfaces.
- `workflow-automation` should stay distinct from `system-environment-setup` (machine/runtime setup), `deployment-automation` (release/deploy execution), `git-workflow` (history/collaboration), and `testing-strategies` (policy depth).
- Duplicate pressure rises when repos mix README command lists, hook configs, shell scripts, and CI YAML without one human-facing front door; workflow-diagnosis is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening their output contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
