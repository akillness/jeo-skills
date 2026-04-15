# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 73
- Skills with evals/: 72
- Skills with scripts/: 23
- Graph nodes: 342
- Graph edges: 982

## Strongest structural findings
1. `file-organization` is stronger as the **repo-shape choice and incremental migration** skill than as a static scaffold catalog.
2. The utilities / developer-workflow lane is cleaner when `file-organization` owns structure choice, `workflow-automation` owns repeatable commands and generators, and `codebase-search` owns repo archaeology.
3. The docs / setup surfaces still matter disproportionately: `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` remain high-degree discovery nodes, so positioning changes must stay synchronized.
4. Support coverage improved again without adding a duplicate skill: `file-organization` now has both `references/` and `evals/`, strengthening a high-visibility utility anchor.
5. The repo still benefits more from modernizing weak anchors and clarifying route-outs than from adding another overlapping project-layout wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 80
- debugging: degree 33
- bmad: degree 22
- code-review: degree 21
- performance-optimization: degree 20
- jeo: degree 19

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `file-organization` should remain separate from `workflow-automation`, `codebase-search`, and `system-environment-setup` because it owns repo-shape choice and migration guidance, not search, scaffolding, or runnable-environment setup.
- Discovery docs remain high-degree nodes, so wording changes still need README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs or template dumps instead of decision-first routers.
- Prefer support-file ratchets for long-lived high-traffic skills before adding new overlapping skills.
- Re-check adjacent utility / developer-workflow skills whenever a structure, automation, or dependency-boundary skill changes meaning.
