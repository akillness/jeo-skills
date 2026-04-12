# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support folders, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 32
- Skills with evals/: 31
- Graph nodes: 178
- Graph edges: 390

## Strongest structural findings
1. `sprint-retrospective` is now a stronger project-management reflection anchor: it gained both `references/` and `evals/`, sharpened its trigger surface around live, async, hybrid, and milestone/postmortem facilitation, and now routes clearly to `task-planning`, `task-estimation`, and `standup-meeting`.
2. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so wording changes there still materially affect catalog navigation.
3. Support coverage improved again, but many older generic skills still lack `references/` and `evals/`; upgrading legacy anchors remains higher leverage than adding overlap.
4. The PM cluster now has clearer role separation end to end: planning, estimation, daily coordination, and reflection each have a more distinct anchor.

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
- utilities

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- bmad-gds: degree 12
- game-demo-feedback-triage: degree 12
- task-planning: degree 12
- omx: degree 10
- sprint-retrospective: degree 10
- standup-meeting: degree 10
- jeo: degree 9

## Duplicate / consolidation notes
- `react-best-practices` and `vercel-react-best-practices` form a canonical-plus-alias pair.
- `design-system` and `frontend-design-system` form a canonical-plus-alias pair.
- `marketing-automation` and `marketing-skills-collection` form a canonical-plus-alias pair.
- `standup-meeting` remains a stronger PM-cluster skill with support files and clear routing to planning, estimation, and retrospectives.
- `sprint-retrospective` is now a stronger reflection anchor: support files present = references:true, evals:true, and the skill explicitly separates retros from planning, estimation, and standups.
- `survey` remains the research-quality anchor because it has both `references/` and `evals/` support.
- `bmad-gds` remains a coordinating game-production skill rather than a duplicate of narrower game specialists.

## Recommended maintenance direction
- Keep modernizing cluster anchors so they route into sharper specialist skills instead of growing into vague mega-skills.
- Continue adding `references/` and `evals/` to older generic skills before creating more overlapping entries.
- Re-check README/setup/manifest wording whenever a skill changes in trigger scope, canonical role, or evidence-handling behavior.
