# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support folders, cross-skill mentions, and documentation indexing
- Total skills: 90
- Skills with references/: 27
- Skills with scripts/: 23
- Skills with assets/: 0
- Skills with evals/: 25
- Graph nodes: 93
- Graph edges: 351

## Strongest structural findings
1. The React performance lane now has an explicit canonical/alias split: `react-best-practices` owns the general React/Next.js performance job, while `vercel-react-best-practices` is now a compatibility alias for exact-name workflows.
2. The repo still has a second frontend duplicate candidate: `design-system` and `frontend-design-system` remain close enough in metadata that they should be reviewed in a future consolidation pass.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) are still the main indexing hubs, so description quality and canonical labeling remain the main discoverability levers.
4. Support coverage improved slightly in this run because the canonical React skill and its alias now both carry `evals/`, but overall support coverage across the corpus remains uneven.

## Community map
- docs
- project-management
- game-dev
- marketing
- web-frontend
- web-backend
- general

## Highest-degree nodes
- README.ko.md: degree 90
- README.md: degree 90
- setup-all-skills-prompt.md: degree 90
- jeo: degree 18
- ohmg: degree 11
- omc: degree 11
- omx: degree 11
- survey: degree 11
- bmad-gds: degree 10
- vibe-kanban: degree 10


## Duplicate / consolidation notes
- `react-best-practices` and `vercel-react-best-practices`: no merge required right now if the alias stays thin and the canonical skill remains the default. Alias cleanup is in progress at the metadata layer.
- `design-system` and `frontend-design-system`: still a likely future canonicalization target.
- `task-planning` and `task-estimation`: adjacent but not duplicates.
- `standup-meeting` and `sprint-retrospective`: cadence/process skills, not planning-decomposition skills.

## Recommended maintenance direction
- Keep strengthening canonical skills before adding more narrow frontend variants.
- Use evals to justify whether a second named skill deserves to stay separate.
- Re-check public inventories whenever a skill becomes canonical or alias-only.
