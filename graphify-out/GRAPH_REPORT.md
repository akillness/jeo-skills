# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 72
- Skills with evals/: 71
- Skills with scripts/: 23
- Graph nodes: 258
- Graph edges: 675

## Strongest structural findings
1. `git-submodule` is stronger as the **embedded external-repo boundary and operator-flow** skill than as a generic command catalog.
2. The developer-workflow lane is cleaner when `git-workflow` owns local history mechanics, `git-submodule` owns embedded-repo boundaries, and `npm-git-install` owns package-delivery choices.
3. Support coverage improved again without adding a new skill: `git-submodule` now has both `references/` and `evals/`, which strengthens a high-utility Git workflow anchor.
4. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so positioning changes still need synchronized top-level wording updates.
5. The repo still gains more from upgrading weak anchors and clarifying route-outs than from adding another overlapping Git helper.

## Highest-degree nodes
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- debugging: degree 22
- performance-optimization: degree 22
- code-review: degree 20
- task-planning: degree 19
- web-accessibility: degree 19
- monitoring-observability: degree 18
- security-best-practices: degree 18

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `git-submodule` should remain separate from `git-workflow` and `npm-git-install` because it owns the embedded-external-repo boundary, not generic history repair or package delivery.
- Discovery docs remain high-degree nodes, so wording changes still need README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs instead of decision-first routers.
- Prefer support-file ratchets for long-lived high-traffic skills before adding new overlapping skills.
- Re-check adjacent Git/dependency skills whenever one side of the repo-boundary decision changes meaning.
