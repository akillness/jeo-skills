# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 71
- Skills with evals/: 70
- Skills with scripts/: 23
- Graph nodes: 256
- Graph edges: 724

## Strongest structural findings
1. `file-organization` is stronger as a decision-first structure router that chooses the right boundary unit—feature, shared layer, route segment, or workspace package—instead of behaving like a static React/Node folder catalog.
2. The utilities/developer-workflow lane is cleaner when repo structure guidance stays in `file-organization`, environment/runtime provisioning stays in `system-environment-setup`, task-runner glue stays in `workflow-automation`, and reusable component API shape stays outside this skill.
3. Support coverage improved again without adding a new skill: `file-organization` now has `references/` and `evals/`, which upgrades a previously weak indexed utility anchor.
4. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so utility-skill rewrites still need synchronized top-level wording updates.
5. The repo still benefits more from upgrading weak legacy anchors than from adding another overlapping structure/template wrapper.

## Highest-degree nodes
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- debugging: degree 35
- performance-optimization: degree 22
- bmad: degree 21
- code-review: degree 21
- jeo: degree 19
- plannotator: degree 19
- task-planning: degree 19

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `file-organization` is stronger as a decision-first repo-structure anchor when it chooses feature/shared/route/package boundaries plus migration steps instead of presenting one universal folder tree.
- Discovery docs remain high-degree nodes, so README / README.ko / setup prompt wording should stay synchronized whenever a utility skill changes role.

## Recommended maintenance direction
- Keep modernizing weak indexed anchors that still read like template dumps instead of decision-first routers.
- Re-check README / README.ko / setup prompt whenever a utility or cluster-boundary skill changes role.
- Prefer support-file ratchets and sharper route-outs over adding another broad repo-structure wrapper.
