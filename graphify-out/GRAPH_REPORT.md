# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 90
- Skills with references/: 53
- Skills with evals/: 52
- Graph nodes: 221
- Graph edges: 533

## Strongest structural findings
1. `deployment-automation` now reads as the release-execution anchor for preview/staging/prod promotion, rollout strategy, post-deploy verification, and rollback planning.
2. The developer-workflow/infrastructure lane remains healthier when CI workflow authoring, machine setup, deployment execution, and observability are kept as separate anchors.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
4. Support coverage improved again by modernizing an indexed legacy anchor with both `references/` and `evals/` instead of adding another overlapping deployment wrapper.
5. The next maintenance gains likely come from remaining legacy infrastructure/code-quality anchors that still lack both support bundles and sharp route-outs.

## Community map
- infrastructure
- utilities
- core-orchestration
- frontend
- search-analysis
- planning-review
- backend
- documentation

## Highest-degree nodes
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 84
- task-planning: degree 17
- debugging: degree 16
- code-review: degree 16
- web-accessibility: degree 15
- testing-strategies: degree 15
- plannotator: degree 15
- system-environment-setup: degree 14

## Duplicate / consolidation notes
- `api-design` and `backend-testing` should stay separated by clearer route-outs rather than growing into one another.
- `backend-testing` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `bmad-gds` and `game-demo-feedback-triage` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `debugging` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `git-workflow` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `debugging` and `log-analysis` should stay separated by clearer route-outs rather than growing into one another.
- `debugging` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `deployment-automation` and `workflow-automation` should stay separated by clearer route-outs rather than growing into one another.
- `deployment-automation` and `system-environment-setup` should stay separated by clearer route-outs rather than growing into one another.
- `deployment-automation` and `monitoring-observability` should stay separated by clearer route-outs rather than growing into one another.
- `deployment-automation` and `vercel-deploy` should stay separated by clearer route-outs rather than growing into one another.

## Recommended maintenance direction
- Continue upgrading remaining highly visible legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and maintenance signals instead of adding overlapping wrappers.
- Re-check discovery docs whenever an infrastructure or developer-workflow skill changes role or trigger phrasing.
