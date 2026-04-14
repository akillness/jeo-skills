# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 62
- Skills with evals/: 61
- Skills with scripts/: 23
- Graph nodes: 238
- Graph edges: 923

## Strongest structural findings
1. `database-schema-design` is now a stronger backend anchor because it owns storage-model decisions, integrity rules, and staged schema evolution instead of a generic SQL/NoSQL example dump.
2. The backend cluster is sharper when `database-schema-design` handles storage boundaries while `api-design`, `authentication-setup`, and `backend-testing` own interface, auth setup, and verification handoffs.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so existing-skill repositioning still needs top-level wording updates.
4. Support coverage improved again without adding a new overlapping backend skill: the better move was modernizing the remaining legacy backend anchor.
5. The repo still gains more from upgrading weak anchors with support bundles than from adding another broad wrapper in already-covered clusters.

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
- uncategorized
- utilities

## Highest-degree nodes
- README.ko.md: degree 177
- README.md: degree 177
- setup-all-skills-prompt.md: degree 177
- debugging: degree 32
- code-review: degree 23
- performance-optimization: degree 23
- jeo: degree 22
- plannotator: degree 22
- web-accessibility: degree 22
- api-documentation: degree 20

## Duplicate / consolidation notes
- `database-schema-design` should stay the backend storage-model anchor rather than splitting into another broad data-model or migration wrapper.
- `api-design` remains the better home for interface contracts and compatibility semantics.
- `authentication-setup` remains the better home for auth-provider/session/user-org ownership setup.
- `backend-testing` remains the better home for migration/repository/API verification planning.
- Discovery wording in README/setup surfaces still matters because top-level docs connect to every shipped skill.

## Recommended maintenance direction
- Keep upgrading high-visibility legacy anchors with support bundles before adding new overlapping backend or infrastructure skills.
- Re-check backend-cluster boundary wording whenever `database-schema-design`, `api-design`, `authentication-setup`, or `backend-testing` is materially edited.
- Keep catalog/discovery surfaces synchronized when an existing skill is repositioned, not only when a new skill is added.
