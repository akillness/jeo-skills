# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support folders, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 31
- Skills with evals/: 30
- Graph nodes: 153
- Graph edges: 362

## Strongest structural findings
1. `standup-meeting` is now a stronger project-management anchor: it gained both `references/` and `evals/`, sharpened its trigger surface around async / board-walk / blocker-first daily syncs, and now routes clearly to `task-planning`, `task-estimation`, and `sprint-retrospective`.
2. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so wording changes there still materially affect catalog navigation.
3. Support coverage improved again, but many older generic skills still lack `references/` and `evals/`; upgrading legacy anchors remains higher leverage than adding overlap.
4. Canonical-vs-alias pairs remain the clearest consolidation pattern in the repo, while the PM cluster is trending toward stronger role separation instead of new skill sprawl.

## Community map
- web-backend
- web-frontend
- game-dev
- docs
- project-management
- marketing

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- bmad-gds: degree 12
- game-demo-feedback-triage: degree 12
- task-planning: degree 11
- omx: degree 9
- standup-meeting: degree 9
- steam-store-launch-ops: degree 9
- game-build-log-triage: degree 8

## Duplicate / consolidation notes
- `react-best-practices` and `vercel-react-best-practices` form a canonical-plus-alias pair.
- `design-system` and `frontend-design-system` form a canonical-plus-alias pair.
- `marketing-automation` and `marketing-skills-collection` form a canonical-plus-alias pair.
- `standup-meeting` is now a stronger PM-cluster skill: it adds both `references/` and `evals/` while clarifying routing to planning, estimation, and retrospectives.
- `survey` remains the research-quality anchor because it has both `references/` and `evals/` support.
- `bmad-gds` remains a coordinating game-production skill rather than a duplicate of narrower game specialists.

## Recommended maintenance direction
- Keep modernizing cluster anchors so they route into sharper specialist skills instead of growing into vague mega-skills.
- Continue adding `references/` and `evals/` to older generic skills before creating more overlapping entries.
- Re-check README/setup/manifest wording whenever a skill changes in trigger scope, canonical role, or evidence-handling behavior.
