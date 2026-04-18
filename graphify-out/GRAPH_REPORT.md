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
- Graph nodes: 476
- Graph edges: 1198

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `autoresearch` dropped from 333 to 284 lines and now behaves like a routing-first ML-search front door that picks setup, `program.md`, bounded-loop, results-interpretation, or constrained-hardware mode before diving into details.
4. The search-analysis boundary stays cleaner when `autoresearch` owns the real `program.md` / `train.py` / `prepare.py` / `val_bpb` lane and routes repo-local skill mutation plus app-level eval/observability outward.

## Highest-degree nodes
- debugging: degree 42
- task-planning: degree 31
- bmad: degree 28
- performance-optimization: degree 28
- code-review: degree 25

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- survey: 309 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- code-refactoring: 292 lines in SKILL.md
- langsmith: 290 lines in SKILL.md
- web-accessibility: 290 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md

## Duplicate / consolidation notes
- No new autoresearch-adjacent wrapper is justified: the bounded win was hardening `autoresearch` in place and syncing discovery surfaces.
- `autoresearch` should stay distinct from `skill-autoresearch`, `langsmith`, and survey/research tooling; it owns Karpathy-style ML training search, not repo-local skill ratcheting, app-level observability, or generic literature scans.
- Duplicate pressure rises when users describe prompt-eval or app-observability work using the word “autoresearch”; explicit route-outs remain the right fix.

## Recommended maintenance direction
- Keep targeting high-degree skills whose route-in logic can be made smaller without weakening their artifact contract.
- Prefer packet references, eval expansion, and discovery-surface sync over creating another neighboring wrapper.
- Re-run catalog/runtime sync validation whenever compact or README/setup wording changes materially.
