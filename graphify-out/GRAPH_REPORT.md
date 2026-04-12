# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 45
- Skills with evals/: 44
- Graph nodes: 204
- Graph edges: 553

## Strongest structural findings
1. `.agent-skills` now has a cleaner frontend cluster when `ui-component-patterns` owns reusable primitive / variant / slot API design, while `responsive-design` stays the layout-adaptation lane.
2. `ui-component-patterns` gained both `references/` and `evals/`, which raises support coverage for a previously legacy frontend anchor without adding another overlapping wrapper skill.
3. Documentation surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain the highest-degree discovery nodes, so small positioning changes still materially affect skill activation.
4. The maintenance pattern still holds: upgrading legacy anchors with boundary files and evals produces cleaner graph structure than creating new nearby skills.

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
- debugging: degree 27
- code-review: degree 19
- web-accessibility: degree 19
- jeo: degree 18
- ui-component-patterns: degree 17
- design-system: degree 16
- state-management: degree 15

## Duplicate / consolidation notes
- `ui-component-patterns` should own reusable primitive/API architecture and not expand into token governance, accessibility remediation, state-boundary architecture, or viewport-only layout strategy.
- `responsive-design` remains a likely future modernization candidate, but it should stay narrower than component API design and focus on layout adaptation, breakpoints/container queries, and responsive media.
- Previous frontend canonicalization work around `design-system`/`frontend-design-system`, `react-best-practices`/`vercel-react-best-practices`, `state-management`, and `web-accessibility` remains intact.

## Recommended maintenance direction
- Continue upgrading remaining legacy frontend and infrastructure anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen route-outs and decision matrices instead of adding neighboring wrapper skills.
- Keep re-checking discovery docs whenever a skill boundary changes in a user-visible way.
