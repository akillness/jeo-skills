# Loop Charter

## Goal
Choose one frontend skill improvement with the best ratio of user value to scope, then modernize it in a way that transfers across many frontend tasks.

## Current Baseline
`responsive-design` and `ui-component-patterns` are still long example-heavy legacy skills with broad descriptions and no support bundles. Nearby frontend skills (`state-management`, `web-accessibility`, `react-best-practices`, `design-system`) were recently modernized and now provide sharper boundaries.

## Mutable Artifact
One primary skill per iteration: start with whichever of `responsive-design` or `ui-component-patterns` the survey supports most strongly.

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Description/trigger quality: explicit route-in and route-out boundaries against adjacent frontend skills
- Support bundle check: add `references/` and `evals/` when the upgrade warrants them
- Discovery surface check: if the skill meaning changes materially, update `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`
- Reuse check: improvement should clarify decisions or workflows that transfer across multiple frontend stacks, not just one library example

## Constraints
- Keep the run bounded to one coherent frontend anchor improvement set
- Do not create a noisy duplicate if a modernization or boundary rewrite is better
- Do not change the evaluation harness mid-run
- Prefer keep-or-revert decisions grounded in survey evidence and repo structure

## Tried Already
- Keep: modernize adjacent frontend anchors like `state-management` and `web-accessibility`
- Revert: adding new overlapping wrappers instead of sharpening existing anchors
- Why: repo history shows durable gains come from upgrading legacy anchors and clarifying boundaries
