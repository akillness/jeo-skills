# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 41
- Skills with evals/: 40
- Graph nodes: 92
- Graph edges: 342

## Strongest structural findings
1. `code-review` is now a stronger code-quality anchor: it owns workflow-aware diff / PR judgment, missing-evidence checks, severity framing, and explicit route-outs to Git, debugging, testing-policy, UI-governance, and repo-policy workflows.
2. The code-quality cluster is separating more cleanly: `code-review` handles preventive review judgment, `debugging` handles reproduce → isolate → verify diagnosis, `log-analysis` handles symptom-first evidence reduction, and `testing-strategies` remains the broader coverage-policy lane.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so one-line positioning changes still materially affect activation behavior.
4. The repo maintenance pattern still holds: upgrading a high-traffic legacy skill with stronger boundaries and support files creates more durable value than adding another overlapping wrapper.

## Community map
- backend
- frontend
- game-development
- infrastructure
- project-management
- code-quality
- documentation

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- code-review: degree 10
- debugging: degree 10
- task-planning: degree 10
- bmad-gds: degree 9
- system-environment-setup: degree 9
- backend-testing: degree 8
- api-design: degree 7

## Duplicate / consolidation notes
- `code-review` should stay focused on review judgment and not absorb local Git cleanup already owned by `git-workflow`.
- `code-review` should not absorb root-cause diagnosis already owned by `debugging` or raw symptom narrowing already owned by `log-analysis`.
- `code-review` should not become a broad test-program design skill; that remains `testing-strategies`.
- Previous canonical-vs-alias cleanups in frontend, marketing, environment, and React lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy code-quality and infrastructure anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen route-out decisions and review evidence requirements instead of adding neighboring wrapper skills.
- Keep re-checking discovery docs whenever a skill boundary changes in a user-visible way.
