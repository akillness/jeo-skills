# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, and documentation indexing
- Total skills: 85
- Skills with references/: 30
- Skills with evals/: 29
- Graph nodes: 88
- Graph edges: 294

## Strongest structural findings
1. `task-estimation` is now the stronger sizing lane inside the PM cluster: it owns estimation modes, reference-story calibration, confidence/risk framing, split-or-spike decisions, and forecast-safe language.
2. The PM cluster is cleaner end-to-end: `task-planning` owns decomposition, `task-estimation` owns sizing, `standup-meeting` owns daily coordination, and `sprint-retrospective` owns learning/follow-through.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so small wording changes there still materially influence activation and discoverability.
4. Support coverage improved again in project management: `task-estimation` now has both `references/` and `evals/`, raising the floor for another high-frequency legacy skill.

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
- README.ko.md: degree 84
- README.md: degree 84
- setup-all-skills-prompt.md: degree 82
- task-planning: degree 12
- sprint-retrospective: degree 9
- standup-meeting: degree 9
- system-environment-setup: degree 9
- task-estimation: degree 9
- environment-setup: degree 7
- ralph: degree 7

## Duplicate / consolidation notes
- The PM cluster now has a clearer four-part split: planning (`task-planning`), estimation (`task-estimation`), daily coordination (`standup-meeting`), and reflection (`sprint-retrospective`).
- `task-estimation` should stay narrow: sizing, uncertainty, forecasting support, and split-or-spike guidance.
- `task-estimation` should not absorb backlog decomposition, status updates, or retrospective facilitation.
- The canonical-vs-alias cleanups in other clusters remain intact (`react-best-practices` / `vercel-react-best-practices`, `design-system` / `frontend-design-system`, `marketing-automation` / `marketing-skills-collection`, `system-environment-setup` / `environment-setup`).

## Recommended maintenance direction
- Keep strengthening remaining high-traffic legacy skills with support files before adding new overlap.
- Use the modern PM cluster as a template for boundary-driven upgrades: define the job, define the handoff, then add evals and references.
- Re-check README/setup/manifest wording whenever a skill's trigger boundary changes enough to alter discovery behavior.
