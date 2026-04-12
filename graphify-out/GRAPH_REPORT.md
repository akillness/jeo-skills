# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 26
- Skills with evals/: 22
- Graph nodes: 92
- Graph edges: 411

## Strongest structural findings
1. The project-management cluster is small and weakly supported relative to repo size: `task-planning`, `task-estimation`, `standup-meeting`, and `sprint-retrospective` form a clear cluster, but `task-planning` previously lacked references/evals while adjacent skills already occupied neighboring planning phases.
2. Game-development skills are more operationally specialized (`game-build-log-triage`, `game-ci-cd-pipeline`, `game-demo-feedback-triage`, `game-performance-profiler`, `steam-store-launch-ops`) than the general PM cluster, which suggests an opportunity for cross-domain planning skills that bridge software/product/game execution.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) act as indexing hubs rather than detailed guidance, so description quality inside each SKILL.md remains the main discoverability lever.
4. Support coverage remains uneven across the corpus: many skills still lack `references/` and `evals/`, which makes consolidation and quality verification harder over time.

## Community map
- docs
- project-management
- game-dev
- marketing
- web-frontend
- web-backend
- general

## Highest-degree nodes
- README.md: degree 83
- README.ko.md: degree 83
- setup-all-skills-prompt.md: degree 83
- jeo: degree 17
- bmad: degree 12
- omx: degree 12
- ui-component-patterns: degree 12
- debugging: degree 11
- game-demo-feedback-triage: degree 11
- design-system: degree 10
- ralph: degree 10
- survey: degree 10

## Duplicate / consolidation notes
- `task-planning` and `task-estimation` are adjacent but not duplicates.
- `standup-meeting` and `sprint-retrospective` remain cadence/process skills, not planning-decomposition skills.
- No merge is recommended in the project-management cluster if boundaries stay explicit.

## Recommended maintenance direction
- Strengthen under-supported bridge skills before adding more narrow PM duplicates.
- Prefer adding refs/evals and sharper trigger language to older generic skills.
- Re-check documentation labels whenever a skill meaningfully changes scope.
