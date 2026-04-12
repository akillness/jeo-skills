# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support folders, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 27
- Skills with evals/: 26
- Graph nodes: 92
- Graph edges: 333

## Strongest structural findings
1. The frontend cluster now contains **two explicit canonical-vs-alias pairs**: `react-best-practices` / `vercel-react-best-practices` and `design-system` / `frontend-design-system`. In both cases the repo is stronger when one skill owns ordinary prompts and the alias survives only for exact-name compatibility.
2. The project-management cluster remains adjacent rather than duplicate: `task-planning`, `task-estimation`, `standup-meeting`, and `sprint-retrospective` still cover different phases of the same workflow.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) continue to act as indexing hubs rather than deep guidance, so canonical-vs-alias wording in those hubs materially affects agent discovery.
4. Support coverage improved again, but remains uneven enough that future runs should keep upgrading older generic skills with `references/` and `evals/` before adding overlap.

## Community map
- docs
- project-management
- game-dev
- marketing
- web-frontend
- web-backend

## Highest-degree nodes
- README.ko.md: degree 83
- README.md: degree 83
- setup-all-skills-prompt.md: degree 83
- ui-component-patterns: degree 12
- web-accessibility: degree 12
- design-system: degree 9
- frontend-design-system: degree 9
- react-best-practices: degree 9
- vercel-react-best-practices: degree 9
- backend-testing: degree 8

## Duplicate / consolidation notes
- `react-best-practices` and `vercel-react-best-practices` are now a clean canonical-plus-alias pair.
- `design-system` and `frontend-design-system` are now a clean canonical-plus-alias pair.
- `task-planning` and `task-estimation` remain adjacent but not duplicates.
- `standup-meeting` and `sprint-retrospective` remain cadence/process skills, not planning-decomposition skills.

## Recommended maintenance direction
- Prefer canonicalization plus compatibility aliases when two skills compete in metadata but not in long-term user value.
- Keep adding `references/` and `evals/` to older generic skills before creating more overlapping entries.
- Re-check README/setup/manifest wording whenever a skill changes from peer entry to compatibility alias.
