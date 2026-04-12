# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, support bundles, and documentation indexing
- Total skills: 89
- Skills with references/: 42
- Skills with evals/: 41
- Graph nodes: 94
- Graph edges: 431

## Strongest structural findings
1. `testing-strategies` is now a stronger code-quality anchor: it owns risk-based validation policy, change-tier classification, local-vs-PR-vs-release gate selection, flaky-suite rules, and route-outs to implementation/review/debugging skills.
2. The code-quality cluster is separating more cleanly: `testing-strategies` handles policy/orchestration, `backend-testing` handles backend test implementation, `debugging` handles reproduce → isolate → verify failure work, and `code-review` handles reviewer-grade judgment on evidence.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so positioning changes for canonical anchor skills still materially affect activation behavior.
4. The repo maintenance pattern still holds: upgrading a high-traffic legacy anchor with references and evals creates more durable value than adding another overlapping wrapper.

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
- references: degree 42
- evals: degree 41
- task-planning: degree 12
- debugging: degree 12
- code-review: degree 12
- testing-strategies: degree 11
- system-environment-setup: degree 11

## Duplicate / consolidation notes
- `testing-strategies` should stay focused on policy/orchestration and not absorb stack-specific API/service/database test implementation already owned by `backend-testing`.
- `testing-strategies` should not absorb failure diagnosis already owned by `debugging` or reviewer judgment already owned by `code-review`.
- `testing-strategies` should define validation depth and gate policy, then route performance-specific or accessibility-specific validation out when those are the real primary risks.
- Previous canonical-vs-alias cleanups in frontend, marketing, environment, and React lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy anchors that are widely indexed in docs but still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundary decisions and risk-selection heuristics instead of adding neighboring wrapper skills.
- Keep re-checking discovery docs whenever a skill boundary changes in a user-visible way.
