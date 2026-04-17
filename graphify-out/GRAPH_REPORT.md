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
- Graph nodes: 474
- Graph edges: 1190

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup and truthful routing still matter more than adding new wrapper skills.
3. `user-guide-writing` is healthier as a mode-selecting user-doc anchor when it chooses one primary mode plus the smallest useful artifact packet instead of behaving like a long mixed template dump.
4. The documentation lane now shows the same post-support-coverage pattern across `technical-writing`, `api-documentation`, and `user-guide-writing`: shrink the front door, move slower-changing structure into references, and ratchet boundary-heavy evals.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 44
- performance-optimization: degree 28
- bmad: degree 26
- code-review: degree 26
- plannotator: degree 25
- task-planning: degree 25
- design-system: degree 24

## Oversized front-door watchlist
- ralph: 499 lines in SKILL.md
- survey: 391 lines in SKILL.md
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- skill-standardization: 315 lines in SKILL.md
- vercel-deploy: 313 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- sprint-retrospective: 304 lines in SKILL.md
- task-planning: 300 lines in SKILL.md

## Duplicate / consolidation notes
- No new documentation wrapper is justified: the bounded win was hardening `user-guide-writing` in place.
- `user-guide-writing` should stay distinct from `technical-writing`, `api-documentation`, `changelog-maintenance`, and `presentation-builder`; each owns a different audience and artifact shape.
- Future duplicate pressure is more likely to come from broad help-center / onboarding / docs-program helpers trying to absorb page-type routing that already belongs inside the documentation cluster.

## Recommended maintenance direction
- Keep targeting dense front-door skills whose routing logic can be sharpened without expanding the catalog.
- Prefer extracting reusable mode structures and output-packet rules into references before adding another adjacent skill.
- Re-run catalog/runtime sync validation whenever descriptions, keywords, compact files, or discovery surfaces change materially.
