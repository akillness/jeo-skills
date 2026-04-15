# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 75
- Skills with evals/: 75
- Skills with scripts/: 23
- Graph nodes: 270
- Graph edges: 1018

## Strongest structural findings
1. `agent-browser` is stronger as the fresh-session deterministic verification anchor than as a generic browser CLI guide.
2. The browser/review cluster is cleanest when `agent-browser` owns clean reproducible checks, `playwriter` owns running-browser reuse, `agentation` owns exact rendered-UI feedback, and `plannotator` owns plan/diff approval.
3. Support coverage improved again without adding a duplicate skill: `agent-browser` now has both `references/` and `evals/`.
4. README.md, README.ko.md, setup-all-skills-prompt.md, and `.agent-skills/skills.json` remain dominant discovery nodes, so wording drift still matters.
5. The repo continues to benefit more from modernizing high-traffic legacy anchors than from adding another overlapping browser or QA wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- setup-all-skills-prompt.md: degree 88
- README.md: degree 88
- README.ko.md: degree 88
- .agent-skills/skills.toon: degree 80
- .agent-skills-wiki/log.md: degree 61
- .agent-skills-wiki/index.md: degree 55
- .agent-skills-wiki/concepts/skill-support-coverage.md: degree 50
- debugging: degree 27
- performance-optimization: degree 25

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `agent-browser` should remain separate from `playwriter`, `agentation`, and `plannotator` because it owns clean-session browser verification rather than running-browser reuse, rendered-UI packets, or plan approval.
- Discovery docs remain high-degree nodes, so wording changes still need README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs or mixed setup dumps instead of decision-first routers.
- Prefer support-file ratchets for long-lived high-traffic skills before adding new overlapping skills.
- Re-check adjacent browser/review skills whenever one of `agent-browser`, `playwriter`, `agentation`, or `plannotator` changes meaning.
