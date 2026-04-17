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
- Graph nodes: 94
- Graph edges: 1091

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup and truthful routing still matter more than adding new wrapper skills.
3. `ralph` is healthier as a routing-first method anchor when runtime ownership is pushed into references and sibling skills instead of leaving stale Codex-only fallback framing in the front door.
4. The core orchestration lane still rewards bounded hardening of canonical anchors over another overlapping persistent-loop wrapper.

## Highest-degree nodes
- debugging: degree 36
- task-planning: degree 21
- code-review: degree 18
- design-system: degree 18
- performance-optimization: degree 18
- marketing-automation: degree 17
- ralph: degree 17
- system-environment-setup: degree 17

## Oversized front-door watchlist
- survey: 391 lines in SKILL.md
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- vercel-deploy: 313 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- sprint-retrospective: 304 lines in SKILL.md
- task-planning: 300 lines in SKILL.md
- git-workflow: 298 lines in SKILL.md

## Duplicate / consolidation notes
- No new persistent-completion wrapper is justified: the bounded win was hardening `ralph` in place.
- `ralph` should stay distinct from `omc`, `omx`, `ohmg`, `jeo`, and `ralphmode`; those own runtime, harness, integrated delivery, and permission layers.
- Future duplicate pressure remains highest where runtime-specific hook/setup guidance drifts back into the portable front door.

## Recommended maintenance direction
- Keep targeting dense front-door skills whose method boundary can be sharpened without expanding the catalog.
- Prefer correcting stale runtime claims and updating derived discovery surfaces before adding another wrapper.
- Re-run catalog/runtime sync validation whenever descriptions, keywords, compact files, or discovery surfaces change materially.
