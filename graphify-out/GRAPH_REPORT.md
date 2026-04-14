# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 55
- Skills with evals/: 54
- Skills with scripts/: 23
- Graph nodes: 224
- Graph edges: 616

## Strongest structural findings
1. `code-refactoring` now reads as the code-quality lane's behavior-preserving structure-improvement anchor instead of a textbook pattern dump, which sharpens the boundary between cleanup, diagnosis, review judgment, validation-policy design, and performance tuning.
2. The code-quality cluster stays healthier when `code-refactoring`, `debugging`, `code-review`, `testing-strategies`, and `performance-optimization` each own a different stage of the confidence loop instead of offering generic quality advice.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
4. Support coverage improved again by modernizing an indexed legacy anchor with both `references/` and `evals/` instead of adding another overlapping wrapper.
5. The next maintenance gains likely come from remaining high-visibility legacy anchors that still lack both support bundles and modern route-outs.

## Community map
- infrastructure
- utilities
- core-orchestration
- frontend
- search-analysis
- planning-review
- backend
- documentation
- code-quality

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- debugging: degree 25
- jeo: degree 16
- code-review: degree 15
- plannotator: degree 15
- task-planning: degree 14
- web-accessibility: degree 14
- bmad-gds: degree 13

## Duplicate / consolidation notes
- `code-refactoring` and `debugging` should stay separated by keeping behavior-preserving cleanup distinct from failure diagnosis and regression isolation.
- `code-refactoring` and `code-review` should stay separated by keeping structural improvement distinct from merge judgment and reviewer comment quality.
- `code-refactoring` and `testing-strategies` should stay separated by keeping one-refactor verification decisions distinct from test-program policy.
- `code-refactoring` and `performance-optimization` should stay separated by keeping structure cleanup distinct from measurement-led tuning.
- `deployment-automation` and `workflow-automation` should stay separated by clearer route-outs rather than growing into one another.
- `authentication-setup` and `security-best-practices` should stay separated by keeping product-auth setup distinct from hardening, OWASP, CSRF, cookie, and abuse-control work.

## Recommended maintenance direction
- Continue upgrading remaining highly visible legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and maintenance signals instead of adding overlapping wrappers.
- Re-check discovery docs whenever a code-quality, backend, or documentation skill changes role or trigger phrasing.
