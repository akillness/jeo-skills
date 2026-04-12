# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, and documentation indexing
- Total skills: 90
- Skills with references/: 41
- Skills with evals/: 40
- Graph nodes: 93
- Graph edges: 420

## Strongest structural findings
1. `debugging` is now a stronger code-quality anchor: it owns the reproduce → isolate → hypothesize → verify loop after symptom triage and explicitly routes raw log narrowing to `log-analysis`.
2. The code-quality cluster is separating more cleanly: `log-analysis` handles symptom-first evidence reduction, `debugging` handles root-cause workflow, `testing-strategies` handles broader coverage policy, and `code-review` remains the preventive audit lane.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so even one-line positioning changes materially affect activation behavior.
4. The repo's most reliable maintenance pattern still holds: upgrading a high-traffic legacy skill with stronger boundaries and support files produces more structural value than adding another overlapping wrapper.

## Community map
- backend
- frontend
- game-development
- infrastructure
- project-management
- search-analysis
- documentation

## Highest-degree nodes
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 84
- debugging: degree 22
- jeo: degree 15
- task-planning: degree 13
- bmad: degree 12
- backend-testing: degree 12
- bmad-gds: degree 12
- game-demo-feedback-triage: degree 12

## Duplicate / consolidation notes
- `debugging` should stay focused on root-cause workflow and not absorb raw symptom-first log triage from `log-analysis`.
- `debugging` should not absorb broad test-program design from `testing-strategies`.
- `debugging` should not become a generic PR audit wrapper already covered by `code-review`.
- Previous canonical-vs-alias cleanups in frontend, marketing, environment, and log-analysis lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy code-quality and infrastructure anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that clarify handoffs between neighboring skills instead of creating new overlapping wrappers.
- Keep re-checking the discovery docs whenever a skill boundary changes in a user-visible way.
