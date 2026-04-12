# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 37
- Skills with evals/: 36
- Graph nodes: 92
- Graph edges: 322

## Strongest structural findings
1. `api-design` is now a stronger backend anchor: it owns contract-first API design, compatibility review, and downstream handoff instead of drifting into docs publishing.
2. The backend cluster boundary is cleaner: `api-design` owns contract design, `api-documentation` owns published docs/examples, `authentication-setup` owns auth implementation, `backend-testing` owns verification, and `database-schema-design` owns storage-model work.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so wording changes there still materially alter how a skill is found.
4. Support coverage improved again in a high-utility lane: `api-design` now carries both references and evals.

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
- README.md: degree 87
- README.ko.md: degree 87
- setup-all-skills-prompt.md: degree 83
- task-planning: degree 13
- bmad-gds: degree 10
- game-demo-feedback-triage: degree 10
- system-environment-setup: degree 9
- sprint-retrospective: degree 9
- standup-meeting: degree 9
- task-estimation: degree 9

## Duplicate / consolidation notes
- `api-design` and `api-documentation` should stay separate but no longer compete for the same primary trigger boundary.
- `api-design` should stay narrow: contract shape, semantics, compatibility review, and handoff quality.
- `api-design` should not absorb docs portal setup, tutorial writing, auth implementation, or test planning.

## Recommended maintenance direction
- Keep strengthening remaining high-traffic backend and infrastructure legacy skills with support files before adding overlap.
- Use the `api-design` rewrite as a template for other contract/governance skills: define the boundary, define the handoff, then add evals and references.
- Re-check README/setup/manifest wording whenever a skill's trigger boundary changes enough to affect discovery.
