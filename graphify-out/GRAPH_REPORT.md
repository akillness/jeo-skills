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
- Graph nodes: 607
- Graph edges: 1334

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index almost the whole live catalog.
2. Support coverage stays complete across the live skill set, so the next structural wins still come from dense-anchor cleanup, truthful routing, and compact-surface synchronization rather than adding missing support folders.
3. `file-organization` was a good bounded target because the developer-workflow lane already had the correct canonical boundary, but the front door still duplicated repo-type walkthroughs and output scaffolding that now belong in references. This pass shrank it from 357 lines to 233 and broadened eval coverage to backend and docs-taxonomy cases.
4. The developer-workflow lane stays cleanest when `file-organization` owns repository-shape choice and migration packets, `codebase-search` owns archaeology, `workflow-automation` owns enforcement/generators, `system-environment-setup` owns runnable environments, and `bmad-gds` owns game-production routing.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 48
- jeo: degree 39
- plannotator: degree 36
- bmad: degree 31
- performance-optimization: degree 30
- vibe-kanban: degree 30
- harness: degree 28

## Oversized front-door watchlist
- ralph: 500 lines in SKILL.md
- survey: 392 lines in SKILL.md
- api-documentation: 337 lines in SKILL.md
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- technical-writing: 321 lines in SKILL.md
- scrapling: 320 lines in SKILL.md
- skill-standardization: 316 lines in SKILL.md
- user-guide-writing: 315 lines in SKILL.md
- vercel-deploy: 314 lines in SKILL.md

## Duplicate / consolidation notes
- No new repo-structure wrapper is justified: the bounded win was hardening the existing canonical `file-organization` skill in place.
- Future duplicate pressure is more likely to come from repo-shape questions drifting into search, automation, environment setup, or subsystem/game-planning skills than from missing structure subtopics.
- `file-organization` should stay distinct from `codebase-search`, `workflow-automation`, `system-environment-setup`, `design-system`, `state-management`, and `bmad-gds`; each owns a different decision surface.

## Recommended maintenance direction
- Keep targeting oversized or stale high-degree anchors after support coverage is already complete.
- Prefer moving repo-type walkthrough bulk into focused references before adding another skill in the same lane.
- Re-run catalog/runtime sync validation whenever compact files or discovery wording change materially.
