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
- Graph nodes: 617
- Graph edges: 1331

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage stays complete across the live skill set, so the next structural wins still come from dense-anchor cleanup, truthful routing, and compact-surface synchronization rather than adding missing support folders.
3. `technical-writing` was the best bounded target this run because the documentation-cluster boundary was already correct, but the front door still carried duplicated mode/template detail and a malformed route-out section. This pass shrank it from 320 lines to 220, pushed reusable skeletons into `references/mode-structures.md`, and expanded route-out coverage for API docs, release notes, decks, and GTM copy.
4. The documentation lane stays cleanest when `technical-writing` owns internal specs/architecture/ADR/runbook/migration work, `api-documentation` owns published developer docs, `user-guide-writing` owns end-user help, `changelog-maintenance` owns release history, `presentation-builder` owns deck artifacts, and `marketing-automation` owns positioning / launch messaging.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 44
- jeo: degree 39
- harness: degree 33
- plannotator: degree 33
- bmad: degree 31
- vibe-kanban: degree 30
- performance-optimization: degree 29

## Oversized front-door watchlist
- ralph: 500 lines in SKILL.md
- survey: 392 lines in SKILL.md
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- skill-standardization: 316 lines in SKILL.md
- user-guide-writing: 315 lines in SKILL.md
- vercel-deploy: 314 lines in SKILL.md
- fabric: 309 lines in SKILL.md
- sprint-retrospective: 305 lines in SKILL.md


## Duplicate / consolidation notes
- No new documentation wrapper is justified: the bounded win was hardening the existing canonical `technical-writing` skill in place.
- Future duplicate pressure is more likely to come from internal-docs requests drifting into API publishing, user help, release notes, decks, or launch copy than from missing internal-doc subtopics.
- `technical-writing` should stay distinct from `api-documentation`, `user-guide-writing`, `changelog-maintenance`, `presentation-builder`, and `marketing-automation`; each owns a different audience and deliverable.

## Recommended maintenance direction
- Keep targeting oversized or stale high-degree anchors after support coverage is already complete.
- Prefer moving repeated templates and slower-changing handbooks into focused references before adding another skill in the same lane.
- Re-run catalog/runtime sync validation whenever compact files or discovery wording change materially.
