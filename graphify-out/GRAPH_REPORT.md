# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 40
- Skills with evals/: 38
- Graph nodes: 92
- Graph edges: 585

## Strongest structural findings
1. `log-analysis` is now a stronger cross-domain anchor: it owns read-only root-cause triage for application, infrastructure, browser, and CI logs while explicitly routing Unity/Unreal specialist work to `game-build-log-triage`.
2. The repo's most successful maintenance pattern still holds: upgrading a high-traffic legacy skill with sharper boundaries and support files adds more value than introducing another overlapping wrapper.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so even one-line description changes materially affect skill activation.
4. The game-development cluster remains specialist-first: `game-build-log-triage` keeps engine-specific build/editor/package expertise, while `log-analysis` now covers the general cross-stack log triage lane.

## Community map
- backend
- frontend
- game-development
- infrastructure
- marketing
- project-management
- search-analysis
- documentation

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- log-analysis: degree 22
- ui-component-patterns: degree 21
- web-accessibility: degree 21
- survey: degree 20
- design-system: degree 19
- bmad-gds: degree 18
- game-demo-feedback-triage: degree 18

## Duplicate / consolidation notes
- `log-analysis` should stay focused on general root-cause log triage and not absorb observability setup from `monitoring-observability`.
- `log-analysis` should not absorb code-fix workflows already covered by `debugging`.
- `log-analysis` should explicitly hand off Unity/Unreal editor/build/package logs to `game-build-log-triage`.
- The previous canonical-vs-alias cleanups in frontend, marketing, and environment lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy high-traffic skills that still lack both `references/` and `evals/`.
- Prefer cross-surface boundary fixes (source identification, handoff rules, support bundles) over adding new wrappers.
- Keep re-checking the discovery docs whenever a skill's trigger boundary changes in a user-visible way.
