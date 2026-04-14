# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 90
- Skills with references/: 55
- Skills with evals/: 54
- Graph nodes: 225
- Graph edges: 621

## Strongest structural findings
1. `changelog-maintenance` now reads as the release-history / release-notes anchor for changelogs, migration updates, and lightweight patch notes instead of a generic semver/example dump.
2. The documentation cluster is cleaner when release history, internal technical docs, developer-facing API docs, and end-user help stay as separate neighboring anchors with explicit route-outs.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
4. Support coverage improved again by modernizing an indexed documentation anchor with both `references/` and `evals/` instead of adding another release-note wrapper.
5. The next maintenance gains likely come from remaining highly visible legacy anchors that still lack both support bundles and modern route-outs.

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
- debugging: degree 28
- jeo: degree 19
- plannotator: degree 19
- web-accessibility: degree 19
- code-review: degree 18
- design-system: degree 17
- task-planning: degree 17

## Duplicate / consolidation notes
- `api-design` and `backend-testing` should stay separated by clearer route-outs rather than growing into one another.
- `backend-testing` and `testing-strategies` should stay separated by clearer route-outs rather than growing into one another.
- `code-review` and `debugging` should stay separated by clearer route-outs rather than growing into one another.
- `deployment-automation` and `workflow-automation` should stay separated by clearer route-outs rather than growing into one another.
- `authentication-setup` and `security-best-practices` should stay separated by keeping product-auth setup distinct from hardening, OWASP, CSRF, cookie, and abuse-control work.
- `changelog-maintenance` should stay separated from `technical-writing`, `user-guide-writing`, and `marketing-automation` by owning release-history / release-summary artifacts instead of internal specs, tutorials, or campaign copy.

## Recommended maintenance direction
- Continue upgrading remaining highly visible legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and maintenance signals instead of adding overlapping wrappers.
- Re-check discovery docs whenever a documentation-cluster or release-communication skill changes role or trigger phrasing.
