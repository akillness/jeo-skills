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
- Graph edges: 716

## Strongest structural findings
1. `playwriter` now cleanly owns the **running-browser / authenticated-session reuse** lane instead of reading like a generic Playwright command dump.
2. The browser-automation boundary is clearer when `playwriter` is used for existing Chrome state and `agent-browser` is used for clean disposable verification.
3. Support coverage improved again without adding a new skill: `playwriter` now has both `references/` and `evals/`, which strengthens a high-visibility browser workflow anchor.
4. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so positioning changes still need synchronized top-level wording updates.
5. The repo continues to gain more from modernizing weak anchors and clarifying route-outs than from adding another overlapping browser/tooling wrapper.

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
- `playwriter` and `agent-browser` should remain separate because they solve different runtime choices: running-browser reuse vs fresh-session isolation.
- `frontend-design-system` remains a compatibility alias / narrower wrapper relative to `design-system` and should not regain equal discovery weight.
- `marketing-skills-collection` remains a compatibility alias / narrower wrapper relative to `marketing-automation` and should not regain equal discovery weight.
- `vercel-react-best-practices` remains a compatibility alias / narrower wrapper relative to `react-best-practices` and should not regain equal discovery weight.
- `remotion-video-production` remains a compatibility alias / narrower wrapper relative to `video-production` and should not regain equal discovery weight.
- Discovery docs remain high-degree nodes, so wording changes still need README / README.ko / setup prompt sync in the same run.

## Recommended maintenance direction
- Keep modernizing weak high-visibility anchors that still read like command catalogs instead of decision-first routers.
- Prefer support-file ratchets for long-lived high-traffic skills before adding new overlapping skills.
- Re-check adjacent browser/tooling skills whenever one side of the runtime boundary changes meaning.
