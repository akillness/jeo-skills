# Loop Charter

## Goal
Improve one high-leverage legacy frontend skill so its trigger quality, execution clarity, and support-file coverage better match the modernized frontend cluster.

## Current Baseline
`responsive-design` is a 500+ line legacy skill with generic examples, weak route-outs, and no `references/` or `evals/`.

## Mutable Artifact
Primary: `.agent-skills/responsive-design/SKILL.md`
Supporting: docs/setup surfaces, support files, wiki notes, survey artifacts, graph outputs.

## Fixed Evaluation Harness
- Agent Skills spec via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger/ownership rubric: must clearly distinguish `responsive-design` from `ui-component-patterns`, `web-accessibility`, `design-system`, and `web-design-guidelines`
- Support-file bar: add at least one focused `references/` file and `evals/evals.json`
- Discovery surface check: update `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json` if positioning changes materially

## Constraints
- One bounded modernization target only
- Keep changes comparable to recent frontend anchor rewrites
- No new overlapping skill unless the survey clearly justifies it
- Prefer transferable heuristics over framework-specific trivia

## Tried Already
- Keep: modernized `ui-component-patterns` as the reusable primitive/API anchor
- Revert: creating another overlapping frontend wrapper instead of sharpening remaining anchors
- Why: the graph/wiki evidence favors boundary cleanup and support-file upgrades over catalog sprawl
