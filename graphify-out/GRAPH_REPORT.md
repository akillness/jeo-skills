# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 48
- Skills with evals/: 47
- Graph nodes: 210
- Graph edges: 575

## Strongest structural findings
1. `plannotator` is now a cleaner planning-review anchor: the main skill body acts as a visual approval gate for concrete plans/diffs, while setup, route-outs, and troubleshooting moved into support references.
2. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so concise one-line positioning still materially affects activation.
3. Support coverage keeps ratcheting upward through legacy-anchor modernization rather than new-skill sprawl.
4. The next maintenance wins are still the remaining widely indexed legacy anchors missing both `references/` and `evals/`.

## Community map
- skill
- planning-review
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
- debugging: degree 28
- jeo: degree 19
- plannotator: degree 19
- web-accessibility: degree 19
- code-review: degree 18
- design-system: degree 17
- ui-component-patterns: degree 17

## Duplicate / consolidation notes
- `video-production` and `remotion-video-production` should stay separated by clearer route-outs rather than growing into one another.
- `technical-writing` and `user-guide-writing` should stay separated by clearer route-outs rather than growing into one another.
- `technical-writing` and `api-documentation` should stay separated by clearer route-outs rather than growing into one another.
- `technical-writing` and `changelog-maintenance` should stay separated by clearer route-outs rather than growing into one another.
- `plannotator` and `code-review` should stay separated by clearer route-outs rather than growing into one another.
- `plannotator` and `task-planning` should stay separated by clearer route-outs rather than growing into one another.
- `plannotator` should stay the visual approval gate for concrete plans/diffs instead of absorbing planning, orchestration state, or broad PR policy.

## Recommended maintenance direction
- Continue upgrading remaining legacy anchors that are widely indexed in docs but still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and dry-run validation instead of adding overlapping wrappers.
- Re-check discovery docs whenever a high-visibility skill changes role or trigger phrasing.
