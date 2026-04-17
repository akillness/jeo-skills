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
- Graph edges: 1043

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage stays complete across the live skill set, so the next structural wins still come from dense-anchor cleanup, truthful routing, and compact-surface synchronization rather than adding missing support folders.
3. `authentication-setup` was a good bounded target because the backend lane was already conceptually modernized, but the front door still duplicated enterprise/migration and session boundary detail. This pass shrank it from 337 lines to 251 and moved the remaining rollout nuance into a focused support packet.
4. The backend lane stays cleanest when `authentication-setup` owns auth-lane choice plus provider-vs-app boundaries, `security-best-practices` owns hardening, `api-design` owns contract semantics, `backend-testing` owns regression coverage, and `api-documentation` owns published developer docs.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 26
- performance-optimization: degree 26
- code-review: degree 24
- task-planning: degree 24
- jeo: degree 23
- plannotator: degree 23
- monitoring-observability: degree 22

## Oversized front-door watchlist
- ralph: 500 lines in SKILL.md
- survey: 392 lines in SKILL.md
- file-organization: 358 lines in SKILL.md
- api-documentation: 337 lines in SKILL.md
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- technical-writing: 321 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- skill-standardization: 316 lines in SKILL.md
- user-guide-writing: 315 lines in SKILL.md

## Duplicate / consolidation notes
- No new authentication wrapper is justified: the bounded win was hardening the existing canonical product-auth router in place.
- Future duplicate pressure is more likely to come from auth setup drifting into security, API design/docs, or backend testing than from missing auth subtopics.
- `authentication-setup` should stay distinct from `security-best-practices`, `api-design`, `api-documentation`, `backend-testing`, and `database-schema-design`; each owns a different decision surface.

## Recommended maintenance direction
- Keep targeting oversized or stale high-degree anchors after support coverage is already complete.
- Prefer splitting enterprise, migration, and operator-detail packets into references before adding another skill in the same lane.
- Re-run catalog/runtime sync validation whenever compact files or discovery wording change materially.
