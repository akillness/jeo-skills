# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 76
- Skills with evals/: 76
- Skills with scripts/: 23
- Graph nodes: 340
- Graph edges: 1348

## Strongest structural findings
1. `presentation-builder` is stronger as the deck-artifact anchor than as a short slides-grab command note.
2. The documentation/publishing cluster is cleanest when `presentation-builder` owns editable deck workflows, while `technical-writing`, `user-guide-writing`, `research-paper-writing`, and `marketing-automation` keep their existing artifact boundaries.
3. Support coverage improved again without adding a duplicate skill: `presentation-builder` now has both `references/` and `evals/`, plus a synced `SKILL.toon` discovery surface.
4. README.md, README.ko.md, setup-all-skills-prompt.md, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` remain dominant discovery nodes, so wording drift still matters.
5. The repo continues to benefit more from modernizing high-traffic legacy anchors than from adding another overlapping pitch/deck wrapper.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- survey: degree 82
- .agent-skills/skills.toon: degree 80
- .agent-skills-wiki/concepts/skill-support-coverage.md: degree 52
- debugging: degree 51
- code-review: degree 31
- task-planning: degree 31

## Duplicate / consolidation notes
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- `presentation-builder` should remain separate from `technical-writing`, `user-guide-writing`, `research-paper-writing`, and `marketing-automation` because it owns deck artifacts rather than long-form docs, end-user help, academic manuscripts, or broad GTM planning.
- Discovery docs remain high-degree nodes, so wording changes still need README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs or mixed setup dumps instead of decision-first routers.
- Prefer support-file ratchets for long-lived high-traffic skills before adding new overlapping skills.
- Re-check adjacent documentation/publishing skills whenever one of `presentation-builder`, `technical-writing`, `user-guide-writing`, `research-paper-writing`, or `marketing-automation` changes meaning.
