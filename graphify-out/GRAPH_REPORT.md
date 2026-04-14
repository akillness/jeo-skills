# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 69
- Skills with evals/: 68
- Skills with scripts/: 23
- Graph nodes: 252
- Graph edges: 711

## Strongest structural findings
1. `npm-git-install` is stronger as a decision-first delivery skill that chooses between Git refs, tarballs, workspaces, and publish-first registry paths instead of acting like an npm-only command dump.
2. The developer-workflow lane is cleaner when Git package delivery choice stays separate from local branch/history mechanics in `git-workflow` and repo-scoped command glue in `workflow-automation`.
3. Support coverage improved again without adding a new skill: `npm-git-install` now has `references/` and `evals/`, which reduces drift in a high-utility CLI/developer workflow lane.
4. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so even existing-skill rewrites need synchronized top-level wording updates.
5. The repo still benefits more from upgrading weak legacy anchors than from adding another overlapping utility wrapper skill.

## Highest-degree nodes
- setup-all-skills-prompt.md: degree 88
- README.md: degree 88
- README.ko.md: degree 88
- debugging: degree 30
- bmad: degree 19
- code-review: degree 18
- performance-optimization: degree 17
- jeo: degree 16
- task-planning: degree 15
- plannotator: degree 15

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `npm-git-install` is now a clearer developer-workflow utility because it owns Git-based package delivery choice instead of overlapping with local Git history (`git-workflow`) or repo automation (`workflow-automation`).
- Discovery docs remain high-degree nodes, so utility-skill positioning changes still require README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak utility and developer-workflow anchors that still lack support files or decision boundaries.
- Re-check README / README.ko / setup prompt whenever a high-visibility utility skill changes role.
- Prefer support-file ratchets and boundary sharpening over adding new overlapping install/packaging wrappers.
