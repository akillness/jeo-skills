# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 90
- Skills with references/: 57
- Skills with evals/: 56
- Skills with scripts/: 23
- Graph nodes: 229
- Graph edges: 566

## Strongest structural findings
1. `performance-optimization` now reads as the code-quality lane's measurement-led tuning anchor instead of a generic React/database optimization dump, which sharpens the boundary between profiling, observability setup, debugging, refactoring, and benchmark policy.
2. The code-quality cluster stays healthier when `code-refactoring`, `debugging`, `code-review`, `testing-strategies`, and `performance-optimization` each own a different stage of the confidence loop instead of offering generic quality advice.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
4. Support coverage improved again by modernizing an indexed legacy anchor with both `references/` and `evals/` instead of adding another overlapping wrapper.
5. The next maintenance gains likely come from remaining high-visibility legacy anchors that still lack both support bundles and modern route-outs.

## Community map
- planning-review
- agent-development
- infrastructure
- backend
- search-analysis
- core-orchestration
- documentation
- code-quality
- utilities
- frontend
- creative-media
- marketing
- project-management

## Highest-degree nodes
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 85
- debugging: degree 18
- performance-optimization: degree 18
- code-review: degree 17
- task-planning: degree 17
- testing-strategies: degree 17
- api-documentation: degree 16
- plannotator: degree 15

## Duplicate / consolidation notes
- `code-refactoring` and `performance-optimization` should stay separated by keep structure cleanup distinct from measurement-led tuning.
- `performance-optimization` and `debugging` should stay separated by keep bottleneck measurement distinct from correctness-failure diagnosis.
- `performance-optimization` and `testing-strategies` should stay separated by keep one-issue verification distinct from benchmark/test policy.
- `performance-optimization` and `monitoring-observability` should stay separated by keep tuning decisions distinct from telemetry-platform setup.
- `deployment-automation` and `workflow-automation` should stay separated by keep release execution distinct from recurring job automation.
- `authentication-setup` and `security-best-practices` should stay separated by keep product-auth setup distinct from broad hardening work.

## Recommended maintenance direction
- Continue upgrading remaining highly visible legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and maintenance signals instead of adding overlapping wrappers.
- Re-check discovery docs whenever a code-quality, backend, infrastructure, or documentation skill changes role or trigger phrasing.
