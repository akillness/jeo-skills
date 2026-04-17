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
- Graph nodes: 361
- Graph edges: 1076

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage remains complete across the live skill set, so dense-anchor cleanup and truthful routing still matter more than adding new wrapper skills.
3. `steam-store-launch-ops` is healthiest as the single Steam-specific game/marketing bridge skill when it routes by bottleneck (`visibility`, `promise`, `proof`, `timing`, `ops`) instead of behaving like a generic launch-marketing wrapper.
4. The documentation lane is cleaner after the `technical-writing` merge, but `user-guide-writing` remains on the oversized watchlist and still looks like a plausible next bounded documentation follow-up.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 43
- performance-optimization: degree 27
- code-review: degree 25
- bmad: degree 24
- task-planning: degree 24
- design-system: degree 23
- plannotator: degree 23

## Oversized front-door watchlist
- ralph: 499 lines in SKILL.md
- survey: 391 lines in SKILL.md
- autoresearch: 333 lines in SKILL.md
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- skill-standardization: 315 lines in SKILL.md
- user-guide-writing: 314 lines in SKILL.md
- vercel-deploy: 313 lines in SKILL.md
- fabric: 308 lines in SKILL.md
- sprint-retrospective: 304 lines in SKILL.md

## Duplicate / consolidation notes
- No new Steam/game-marketing wrapper is justified: the bounded win was hardening `steam-store-launch-ops` in place.
- `steam-store-launch-ops` should stay distinct from `marketing-automation`, `game-demo-feedback-triage`, and `bmad-gds`; each owns a different decision surface.
- Future duplicate pressure is more likely to come from broad launch/GTM helpers trying to absorb Steam-specific timing/demo/proof work.

## Recommended maintenance direction
- Keep targeting dense front-door skills whose routing logic can be sharpened without expanding the catalog.
- Prefer extracting reusable decision models and hook timelines into references before adding another adjacent skill.
- Re-run catalog/runtime sync validation whenever descriptions, keywords, compact files, or discovery surfaces change materially.
