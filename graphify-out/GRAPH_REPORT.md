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
- Category counts: agent-development=2, backend=5, code-quality=5, core-orchestration=10, creative-media=2, documentation=5, frontend=10, infrastructure=13, marketing=2, planning-review=5, project-management=4, search-analysis=7, uncategorized=7, utilities=12

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `code-refactoring` dropped to 264 lines and now reads more clearly as a packet-first cleanup anchor that starts from the artifact the user already has.
4. The code-quality lane stays healthiest when `code-refactoring` owns cleanup packets while `debugging`, `code-review`, `testing-strategies`, `performance-optimization`, and `codebase-search` keep diagnosis, judgment, policy, bottleneck analysis, and impact mapping separate.

## Highest-degree nodes
- skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- survey: 310 lines in SKILL.md
- task-planning: 295 lines in SKILL.md
- langsmith: 291 lines in SKILL.md
- jeo: 289 lines in SKILL.md
- obsidian-cli: 287 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- database-schema-design: 283 lines in SKILL.md
- task-estimation: 279 lines in SKILL.md

## Duplicate / consolidation notes
- No new code-quality wrapper is justified: the bounded win was tightening `code-refactoring` in place and syncing the discovery surfaces.
- `code-refactoring` should stay distinct from `debugging` (diagnosis), `code-review` (review judgment), `testing-strategies` (validation policy), `performance-optimization` (bottleneck-led tuning), and `codebase-search` (impact mapping / symbol inventory).
- Duplicate pressure rises when cleanup requests blur packet choice, guardrail design, migration tooling, and route-out decisions into one blob; the packet-first refactor model is the right fix.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose trigger logic can be made smaller without weakening their output contract.
- Prefer focused support packets and synced discovery surfaces over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever README/setup or compact wording changes materially.
