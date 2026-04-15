# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 75
- Skills with evals/: 74
- Skills with scripts/: 23
- Graph nodes: 335
- Graph edges: 1376

## Strongest structural findings
1. `agentation` is stronger as the **exact rendered-UI feedback router** than as a giant mixed install/config/API catalog.
2. The browser/review lane is cleaner when `plannotator` owns plan/diff approval, `agent-browser` owns fresh-session verification, `playwriter` owns running-browser reuse, and `agentation` owns annotation packets plus the handoff loop.
3. The docs / setup surfaces still matter disproportionately: `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` remain high-degree discovery nodes, so wording and count drift must stay synchronized.
4. Support coverage improved again without adding a duplicate skill: `agentation` now has both `references/` and `evals/`, strengthening a flagship planning-review anchor.
5. The repo still benefits more from modernizing weak high-traffic anchors and clarifying route-outs than from adding another overlapping browser or QA wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 80
- survey: degree 78
- .agent-skills-wiki/log.md: degree 60
- .agent-skills-wiki/index.md: degree 54
- .agent-skills-wiki/concepts/skill-support-coverage.md: degree 49
- debugging: degree 38

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `agentation` should remain separate from `agent-browser`, `playwriter`, and `plannotator` because it owns exact rendered-UI feedback and annotation handoff, not browser runtime choice or plan approval.
- Discovery docs remain high-degree nodes, so wording changes still need README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs or mixed setup dumps instead of decision-first routers.
- Prefer support-file ratchets for long-lived high-traffic skills before adding new overlapping skills.
- Re-check adjacent browser/review skills whenever one of `agentation`, `agent-browser`, `playwriter`, or `plannotator` changes meaning.
