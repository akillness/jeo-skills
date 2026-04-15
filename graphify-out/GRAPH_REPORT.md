# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 74
- Skills with evals/: 73
- Skills with scripts/: 23
- Graph nodes: 344
- Graph edges: 936

## Strongest structural findings
1. `opencontext` is stronger as the **project/repo memory and cross-agent handoff** skill than as a generic persistent-memory command catalog.
2. The memory lane is cleaner when `opencontext` owns active project context, `llm-wiki` owns long-lived synthesized markdown knowledge bases, and `graphify` owns structural graph memory.
3. Support coverage improved again without adding a duplicate skill: `opencontext` now has both `references/` and `evals/`, strengthening a high-utility utility anchor.
4. Discovery docs still matter disproportionately: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and the skill manifests remain high-degree nodes, so positioning changes must stay synchronized.
5. The repo still benefits more from upgrading weak anchors and clarifying route-outs than from adding another overlapping memory wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- debugging: degree 25
- code-review: degree 23
- performance-optimization: degree 23
- system-environment-setup: degree 22
- task-planning: degree 22

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `opencontext` should remain separate from `llm-wiki`, `graphify`, and human-authored note/vault skills because it owns active project memory and cross-agent handoff, not full wiki maintenance, graph mapping, or manual note curation.
- Discovery docs remain high-degree nodes, so wording changes still need README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs or template dumps instead of decision-first routers.
- Prefer support-file ratchets for long-lived high-traffic skills before adding new overlapping skills.
- Re-check adjacent memory / knowledge-management skills whenever `opencontext`, `llm-wiki`, or graph-backed repo-understanding surfaces change meaning.
