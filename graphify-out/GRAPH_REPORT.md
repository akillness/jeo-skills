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
- Graph nodes: 851
- Graph edges: 1585
- Category counts: agent-development=2, backend=5, code-quality=5, core-orchestration=10, creative-media=2, documentation=5, frontend=10, infrastructure=13, marketing=2, planning-review=5, project-management=4, search-analysis=7, uncategorized=7, utilities=12

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `codebase-search` now reads more clearly as a routing-first repo-navigation anchor that chooses one search packet before dropping into debugging, refactoring, review, or graph mapping.
4. The search-analysis lane stays healthiest when `codebase-search` owns repo navigation, `log-analysis` owns log-first triage, `pattern-detection` owns repeated rule/anomaly hunting, `data-analysis` owns dataset reasoning, and `graphify` owns persistent structure mapping.

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
- langsmith: 290 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- looker-studio-bigquery: 276 lines in SKILL.md
- ui-component-patterns: 274 lines in SKILL.md

## Duplicate / consolidation notes
- No new search-adjacent wrapper is justified: the bounded win was tightening `codebase-search` in place and syncing the discovery surfaces.
- `codebase-search` should stay distinct from `debugging` (root cause), `code-refactoring` (behavior-preserving changes), `code-review` (diff judgment), and `graphify` (persistent graph/path tracing).
- Duplicate pressure rises when repo search, config/content ownership, graph/path tracing, and diagnosis blur together; the packet-first routing model is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening the output contract.
- Prefer support-packet improvements and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
