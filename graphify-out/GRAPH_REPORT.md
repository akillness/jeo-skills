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
- Graph nodes: 810
- Graph edges: 1512

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage stays complete across the live skill set, so the next structural wins still come from dense-anchor cleanup, truthful routing, and compact-surface synchronization rather than adding missing support folders.
3. `api-documentation` was a good bounded target because the documentation cluster already had the correct canonical boundary, but the front door still duplicated mode templates and checklists that now belong in focused references. This pass shrank it from 336 lines to 202 and added a new support packet for output packets and navigation.
4. The documentation lane stays cleanest when `api-documentation` owns developer-facing API publication, `api-design` owns contract design, `technical-writing` owns internal builder docs, `user-guide-writing` owns end-user help, and `changelog-maintenance` owns release-history hygiene.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 42
- performance-optimization: degree 27
- code-review: degree 25
- plannotator: degree 24
- task-planning: degree 24
- design-system: degree 23
- jeo: degree 23

## Oversized front-door watchlist
- ralph: 500 lines in SKILL.md
- survey: 392 lines in SKILL.md
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- technical-writing: 321 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- skill-standardization: 316 lines in SKILL.md
- user-guide-writing: 315 lines in SKILL.md
- vercel-deploy: 314 lines in SKILL.md
- fabric: 309 lines in SKILL.md

## Duplicate / consolidation notes
- No new API-doc wrapper is justified: the bounded win was hardening the existing canonical `api-documentation` skill in place.
- Future duplicate pressure is more likely to come from API-doc requests drifting into contract design, internal technical docs, end-user docs, or auth implementation than from missing developer-doc subskills.
- `api-documentation` should stay distinct from `api-design`, `technical-writing`, `user-guide-writing`, `authentication-setup`, and `changelog-maintenance`; each owns a different decision surface.

## Recommended maintenance direction
- Keep targeting oversized or stale high-degree anchors after support coverage is already complete.
- Prefer moving mode templates, navigation guidance, and operational checklists into focused references before adding another skill in the same lane.
- Re-run catalog/runtime sync validation whenever compact files or discovery wording change materially.
