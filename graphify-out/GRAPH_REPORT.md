# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support folders, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 33
- Skills with evals/: 32
- Skills with scripts/: 23
- Skills with assets/: 0
- Graph nodes: 180
- Graph edges: 482

## Strongest structural findings
1. `git-workflow` is now a stronger utilities-cluster anchor: it gained both `references/` and `evals/`, sharpened its trigger surface around local Git collaboration, rebase/merge decisions, push safety, and recovery, and now routes clearly away from planning, code review, debugging, and hosted PR administration.
2. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so wording changes there still materially affect catalog navigation.
3. Support coverage improved again, but many older generic skills still lack `references/` and `evals/`; upgrading legacy anchors remains higher leverage than adding overlap.
4. The utilities cluster now has a clearer distinction between local Git workflow hygiene (`git-workflow`), submodule management (`git-submodule`), and broader repo/context tooling such as `graphify`, `llm-wiki`, and `opencontext`.

## Community map
- agent-development
- backend
- code-quality
- core-orchestration
- creative-media
- documentation
- frontend
- infrastructure
- marketing
- planning-review
- project-management
- search-analysis
- uncategorized
- utilities

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- jeo: degree 18
- debugging: degree 16
- bmad-gds: degree 14
- game-demo-feedback-triage: degree 14
- bmad: degree 13
- omx: degree 13
- task-planning: degree 13

## Duplicate / consolidation notes
- `react-best-practices` and `vercel-react-best-practices` form a canonical-plus-alias pair.
- `design-system` and `frontend-design-system` form a canonical-plus-alias pair.
- `marketing-automation` and `marketing-skills-collection` form a canonical-plus-alias pair.
- `survey` remains the research-quality anchor because it has both `references/` and `evals/` support.
- `bmad-gds` remains a coordinating game-production skill rather than a duplicate of narrower game specialists.
- `git-workflow` now acts as the local Git collaboration and recovery anchor instead of a vague PR-and-everything cheat sheet.

## Recommended maintenance direction
- Keep modernizing cluster anchors so they route into sharper specialist skills instead of growing into vague mega-skills.
- Continue adding `references/` and `evals/` to older generic skills before creating more overlapping entries.
- Re-check README/setup/manifest wording whenever a skill changes in trigger scope, canonical role, or evidence-handling behavior.
