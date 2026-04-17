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
- Graph nodes: 912
- Graph edges: 2070

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup and truthful routing still matter more than adding new wrapper skills.
3. `skill-standardization` is healthier as a routing-first maintenance anchor when it uses truthful repo-root validator commands and pushes slower-changing mode detail into `references/working-modes.md` instead of carrying stale script assumptions in the front door.
4. The agent-development lane now shows the same post-support-coverage pattern as other mature clusters: keep the canonical skill, shrink the entry surface, and sync derived discovery artifacts instead of inventing another meta wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- setup-all-skills-prompt.md: degree 88
- README.md: degree 88
- README.ko.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 47
- jeo: degree 43
- harness: degree 38
- plannotator: degree 37
- bmad: degree 35
- vibe-kanban: degree 34
- performance-optimization: degree 32

## Oversized front-door watchlist
- ralph: 499 lines in SKILL.md
- survey: 391 lines in SKILL.md
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- vercel-deploy: 313 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- sprint-retrospective: 304 lines in SKILL.md
- task-planning: 300 lines in SKILL.md

## Duplicate / consolidation notes
- No new standardization-adjacent meta skill is justified: the bounded win was hardening `skill-standardization` in place.
- `skill-standardization` should stay distinct from `skill-autoresearch`; one owns spec/canonicalization/discovery sync, the other owns frozen-evaluator keep-or-revert loops.
- Future duplicate pressure is more likely to come from broad maintenance wrappers that blur validator guidance, catalog sync, and orchestration hooks into one new peer skill.

## Recommended maintenance direction
- Keep targeting dense front-door skills whose routing logic can be sharpened without expanding the catalog.
- Prefer fixing truthful execution paths and stale discovery residue inside canonical skills before adding another wrapper.
- Re-run catalog/runtime sync validation whenever descriptions, keywords, compact files, or discovery surfaces change materially.
