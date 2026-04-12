# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 44
- Skills with evals/: 43
- Graph nodes: 179
- Graph edges: 475

## Strongest structural findings
1. `web-accessibility` is now a stronger frontend accessibility anchor: it owns accessibility remediation plus manual-vs-automated verification instead of acting like a generic WCAG dump.
2. The frontend cluster boundary is cleaner: `web-accessibility` handles accessibility remediation/verification, `web-design-guidelines` handles broader UI review, `ui-component-patterns` handles reusable component APIs, and `responsive-design` handles viewport adaptation.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree discovery hubs, so one-line positioning changes still matter for activation.
4. The repo maintenance pattern still holds: upgrading a high-traffic legacy anchor with references and evals creates more durable value than adding another neighboring wrapper skill.

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
- web-accessibility: degree 19
- code-review: degree 16
- debugging: degree 16
- task-planning: degree 15
- state-management: degree 14
- testing-strategies: degree 14
- api-design: degree 13

## Duplicate / consolidation notes
- `web-accessibility` should stay focused on accessibility remediation and verification rather than absorbing broad UI-polish review already covered by `web-design-guidelines`.
- `web-accessibility` should not absorb reusable primitive/component API architecture already covered by `ui-component-patterns` or system-level design work owned by `design-system`.
- `web-accessibility` should keep viewport-only layout adaptation routed to `responsive-design`.
- Recent canonical-vs-alias cleanups in React, design-system, marketing, and environment lanes remain intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy anchors that are widely indexed in docs but still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundary decisions and verification heuristics instead of adding overlapping wrapper skills.
- Keep re-checking discovery docs whenever a skill boundary changes in a user-visible way.
