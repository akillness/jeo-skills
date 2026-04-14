# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 90
- Manifest skills in `.agent-skills/skills.json`: 90
- Skills with references/: 66
- Skills with evals/: 65
- Skills with scripts/: 23
- Graph nodes: 247
- Graph edges: 689

## Strongest structural findings
1. `web-design-guidelines` is now a stronger frontend anchor because it owns broad interface audits instead of pretending a single vendor rule file is the whole workflow.
2. The frontend boundary is cleaner when `web-design-guidelines` keeps broad hierarchy/clarity/consistency review while routing accessibility remediation to `web-accessibility`, layout adaptation to `responsive-design`, component API redesign to `ui-component-patterns`, token governance to `design-system`, and React/runtime behavior to `react-best-practices`.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so repositioning a high-visibility frontend anchor still requires top-level wording changes.
4. Support coverage improved again without adding a new overlapping frontend skill: the better move was upgrading the weak anchor and adding reusable references/evals.
5. The repo still benefits more from modernizing legacy anchors with explicit route-outs than from adding adjacent wrapper skills.

## Highest-degree nodes
- README.md: degree 89
- README.ko.md: degree 89
- setup-all-skills-prompt.md: degree 88
- debugging: degree 33
- performance-optimization: degree 22
- code-review: degree 21
- web-accessibility: degree 19
- plannotator: degree 19
- jeo: degree 19
- security-best-practices: degree 18

## Duplicate / consolidation notes
- `web-design-guidelines` should stay the broad interface-audit anchor while `web-accessibility` remains the specialist accessibility lane.
- `web-design-guidelines` should stay the broad interface-audit anchor while `responsive-design` remains the layout adaptation lane.
- `web-design-guidelines` should stay the broad interface-audit anchor while `ui-component-patterns` remains the component API lane.
- `web-design-guidelines` should stay the broad interface-audit anchor while `design-system` remains the system-governance lane.
- `web-design-guidelines` should stay the broad interface-audit anchor while `react-best-practices` remains the React/runtime behavior lane.

## Recommended maintenance direction
- Keep upgrading high-visibility anchors whose discovery metadata still underspecifies their real role.
- Re-check frontend boundary docs whenever `web-design-guidelines`, `web-accessibility`, `responsive-design`, `ui-component-patterns`, or `design-system` changes materially.
- Keep discovery surfaces synchronized whenever a skill is repositioned, not only when a new skill is added.
