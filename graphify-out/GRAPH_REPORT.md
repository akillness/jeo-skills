# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support folders, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 28
- Skills with evals/: 27
- Graph nodes: 92
- Graph edges: 620

## Strongest structural findings
1. The frontend cluster still contains the two explicit canonical-vs-alias pairs `react-best-practices` / `vercel-react-best-practices` and `design-system` / `frontend-design-system`. Discovery surfaces remain sensitive to how those pairs are described.
2. The game-development cluster now has a clearer center of gravity: `bmad-gds` has moved closer to a **coordinating producer layer**, while `game-demo-feedback-triage`, `game-build-log-triage`, `game-performance-profiler`, and `steam-store-launch-ops` stay as specialist downstream lanes.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so short wording changes there materially affect how the catalog is navigated.
4. Support coverage improved again, but many older generic skills still lack `references/` and `evals/`; upgrading legacy skills remains higher leverage than adding overlap.

## Community map
- docs
- project-management
- game-dev
- marketing
- web-frontend
- web-backend

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- jeo: degree 33
- bmad-gds: degree 27
- omx: degree 26
- vercel-react-best-practices: degree 25
- vibe-kanban: degree 24
- omc: degree 23
- react-best-practices: degree 23


## Duplicate / consolidation notes
- `react-best-practices` and `vercel-react-best-practices` remain a clean canonical-plus-alias pair.
- `design-system` and `frontend-design-system` remain a clean canonical-plus-alias pair.
- `bmad-gds` is now better treated as the coordinating game-production skill, not a peer duplicate of the sharper game specialist skills.
- `task-planning` and the game specialist skills remain adjacent rather than duplicate because the game cluster carries milestone, playtest, build, and launch context.

## Recommended maintenance direction
- Keep modernizing cluster anchors like `bmad-gds` so they route into sharper specialist skills instead of growing into vague mega-skills.
- Continue adding `references/` and `evals/` to older generic skills before creating more overlapping entries.
- Re-check README/setup/manifest wording whenever a skill changes from generic label to clearer routing or canonical role.
