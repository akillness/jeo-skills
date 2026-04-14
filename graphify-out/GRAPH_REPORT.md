# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 90
- Skills with references/: 54
- Skills with evals/: 53
- Graph nodes: 223
- Graph edges: 540

## Strongest structural findings
1. `authentication-setup` now reads as a product-auth setup router instead of a JWT/OAuth code dump, which sharpens the backend lane around lane selection, ownership boundaries, session model choice, and enterprise handoff.
2. The backend cluster stays healthier when auth setup, API contract design, backend verification, storage modeling, and security hardening remain explicit neighboring anchors instead of collapsing into one auth catch-all.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
4. Support coverage improved again by modernizing an indexed legacy anchor with both `references/` and `evals/` instead of adding another overlapping auth wrapper.
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

## Highest-degree nodes
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 84
- task-planning: degree 17
- code-review: degree 16
- debugging: degree 16
- api-documentation: degree 15
- plannotator: degree 15
- testing-strategies: degree 15
- web-accessibility: degree 15

## Duplicate / consolidation notes
- `api-design` and `backend-testing` should stay separated by clearer route-outs rather than growing into one another.
- `backend-testing` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `debugging` should stay separated by clearer route-outs rather than growing into one another.
- `deployment-automation` and `workflow-automation` should stay separated by clearer route-outs rather than growing into one another.
- `authentication-setup` and `security-best-practices` should stay separated by keeping product-auth setup distinct from hardening, OWASP, CSRF, cookie, and abuse-control work.
- `authentication-setup` and `api-design` should stay separated by keeping auth-lane selection distinct from endpoint scope / contract semantics.
- `authentication-setup` and `backend-testing` should stay separated by keeping auth setup distinct from regression coverage and matrix testing.

## Recommended maintenance direction
- Continue upgrading remaining highly visible legacy anchors that still lack both `references/` and `evals/.`
- Prefer support bundles that sharpen boundaries and maintenance signals instead of adding overlapping wrappers.
- Re-check discovery docs whenever a backend/auth or security-adjacent skill changes role or trigger phrasing.
