# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 38
- Skills with evals/: 37
- Graph nodes: 92
- Graph edges: 280

## Strongest structural findings
1. The backend cluster is cleaner end-to-end: `api-design` owns contract decisions, `backend-testing` now owns verification planning, `authentication-setup` owns implementation, and `api-documentation` owns publishing/examples.
2. `backend-testing` is now a stronger backend anchor because it has both `references/` and `evals/`, replacing a very long legacy skill that previously had weak boundary control and no support bundle.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so small wording changes there still materially influence activation and discoverability.
4. The repo continues to improve faster by upgrading high-traffic legacy skills with sharper boundaries and support files than by adding new overlapping wrappers.

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
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 25
- backend-testing: degree 9
- bmad-gds: degree 9
- task-planning: degree 9
- game-demo-feedback-triage: degree 7
- jeo: degree 7
- omx: degree 7
- ralph: degree 7

## Duplicate / consolidation notes
- The backend cluster split is now cleaner: `api-design` handles contract choices, `backend-testing` handles verification planning, `authentication-setup` handles auth implementation, `api-documentation` handles developer-facing docs, and `database-schema-design` handles storage design.
- `backend-testing` should stay narrow: backend coverage selection, fixture/data strategy, dependency realism, and CI-vs-local execution.
- `backend-testing` should not absorb whole-org QA governance (`testing-strategies`), API contract design (`api-design`), or auth implementation (`authentication-setup`).
- Previously cleaned canonical-vs-alias clusters remain intact in frontend, marketing, and environment lanes.

## Recommended maintenance direction
- Keep strengthening remaining high-traffic legacy skills with support files before adding new overlap.
- Use the backend cluster as another template for boundary-driven upgrades: define the job, define the handoff, then add evals and references.
- Re-check README/setup/manifest wording whenever a skill's trigger boundary changes enough to alter discovery behavior.
