# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 43
- Skills with evals/: 42
- Graph nodes: 177
- Graph edges: 439

## Strongest structural findings
1. `state-management` is now a clearer frontend architecture anchor: it classifies local, shared, URL/form, server, and long-lived client workflow state before suggesting libraries.
2. The frontend cluster is cleaner when `state-management` owns boundary decisions, while `react-best-practices` owns rendering/performance, `ui-component-patterns` owns component contracts, and `api-design` owns mutation/contract shape.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so one-line positioning changes still materially affect activation behavior.
4. The repo maintenance pattern still holds: upgrading a legacy anchor with sharper route-outs and support files creates more durable value than adding another overlapping wrapper.

## Community map
- backend
- frontend
- game-development
- infrastructure
- project-management
- code-quality
- documentation

## Highest-degree nodes
- README.md: degree 87
- README.ko.md: degree 87
- setup-all-skills-prompt.md: degree 83
- debugging: degree 16
- task-planning: degree 15
- code-review: degree 15
- testing-strategies: degree 14
- backend-testing: degree 12
- bmad-gds: degree 12
- game-demo-feedback-triage: degree 12

## Duplicate / consolidation notes
- `state-management` should stay focused on ownership and state-boundary decisions rather than absorbing React performance tuning, backend API contracts, or bug diagnosis.
- `state-management` should not encourage universal-store advice that duplicates server-state caches inside client stores without a workflow reason.
- Previous canonical-vs-alias cleanups in frontend, marketing, environment, and React lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining frontend/infrastructure legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen decision matrices and route-out boundaries instead of adding neighboring wrapper skills.
- Keep re-checking discovery docs whenever a skill boundary changes in a user-visible way.
