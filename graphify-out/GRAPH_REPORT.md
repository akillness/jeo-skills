# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 46
- Skills with evals/: 45
- Graph nodes: 206
- Graph edges: 556

## Strongest structural findings
1. `responsive-design` is now a stronger frontend layout anchor: it owns mobile-first, container-aware layout adaptation plus overflow/reflow verification instead of acting like a generic CSS example dump.
2. The frontend cluster boundary is cleaner: `ui-component-patterns` handles reusable component APIs, `responsive-design` handles layout adaptation, `web-accessibility` handles remediation/verification, and `web-design-guidelines` stays the broad review lane.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so one-line positioning changes still matter for activation.
4. The repo maintenance pattern still holds: upgrading a high-traffic legacy anchor with references and evals creates more durable value than adding another neighboring wrapper skill.

## Community map
- skill
- frontend
- infrastructure
- code-quality
- project-management
- game-development
- backend

## Highest-degree nodes
- README.md: degree 87
- README.ko.md: degree 87
- setup-all-skills-prompt.md: degree 83
- debugging: degree 27
- web-accessibility: degree 19
- jeo: degree 18
- code-review: degree 18
- ui-component-patterns: degree 17
- design-system: degree 17
- task-planning: degree 15

## Duplicate / consolidation notes
- `responsive-design` should stay focused on layout adaptation and verification rather than absorbing reusable primitive/API architecture already covered by `ui-component-patterns`.
- `responsive-design` should keep accessibility-heavy reflow/touch-target remediation routed to `web-accessibility`.
- `responsive-design` should not absorb broader UI-guideline audits already covered by `web-design-guidelines`.
- Recent canonical-vs-alias cleanups in React, design-system, marketing, and environment lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy anchors that are widely indexed in docs but still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundary decisions and verification heuristics instead of adding overlapping wrapper skills.
- Keep re-checking discovery docs whenever a skill boundary changes in a user-visible way.
