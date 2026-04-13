# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Skills with references/: 49
- Skills with evals/: 48
- Graph nodes: 212
- Graph edges: 583

## Strongest structural findings
1. `technical-writing` is now a cleaner internal technical-docs anchor: specs, architecture docs, ADRs, runbooks, migrations, and internal developer guides are grouped together while API portals, end-user tutorials, and changelog hygiene stay routed outward.
2. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so one-line positioning still materially affects activation.
3. Support coverage keeps ratcheting upward through modernization of legacy anchors instead of new-skill sprawl.
4. The documentation cluster is still a boundary-sensitive area where sharper route-outs beat consolidation by merger.

## Community map
- frontend
- infrastructure
- project-management
- code-quality
- documentation
- backend
- game-development

## Highest-degree nodes
- README.ko.md: degree 87
- README.md: degree 87
- setup-all-skills-prompt.md: degree 83
- debugging: degree 28
- jeo: degree 19
- plannotator: degree 19
- web-accessibility: degree 19
- code-review: degree 18
- design-system: degree 17
- task-planning: degree 17

## Duplicate / consolidation notes
- `video-production` and `remotion-video-production` should stay separated by clearer route-outs rather than growing into one another.
- `technical-writing` and `user-guide-writing` should stay separated by clearer route-outs rather than growing into one another.
- `technical-writing` and `api-documentation` should stay separated by clearer route-outs rather than growing into one another.
- `technical-writing` and `changelog-maintenance` should stay separated by clearer route-outs rather than growing into one another.
- `plannotator` and `code-review` should stay separated by clearer route-outs rather than growing into one another.
- `plannotator` and `task-planning` should stay separated by clearer route-outs rather than growing into one another.
- `technical-writing` should stay the internal technical-docs anchor instead of absorbing API portal publishing, end-user tutorials, or release-note hygiene.

## Recommended maintenance direction
- Continue upgrading remaining widely indexed legacy anchors that still lack both `references/` and `evals/`.
- Prefer support bundles that sharpen boundaries and dry-run validation instead of adding overlapping wrappers.
- Re-check discovery docs whenever a high-visibility skill changes role or trigger phrasing.
