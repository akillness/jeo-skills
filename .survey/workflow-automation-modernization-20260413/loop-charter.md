# Loop Charter

## Goal
Improve the practical usefulness, trigger precision, and reusable support coverage of `.agent-skills/workflow-automation`.

## Current Baseline
`workflow-automation` is a legacy example-heavy skill with broad trigger language, overlapping scope with CI/CD, deployment, and environment/setup skills, and no `references/` or `evals/` support.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/workflow-automation/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills specification and the repo's `skill-standardization` validator
- Trigger clarity against realistic workflow-automation prompts
- Boundary quality versus neighboring skills (`git-workflow`, `deployment-automation`, `system-environment-setup`, `monitoring-observability`)
- Support coverage check: at least one durable `references/` guide and `evals/evals.json` if the rewrite is kept
- Discovery surface review for README.md, README.ko.md, setup-all-skills-prompt.md, and `.agent-skills/skills.json` when positioning materially changes

## Constraints
- Max one coherent modernization pass this run
- Prefer sharpening/modernizing the existing skill over creating a new overlapping one
- No evaluator changes mid-run
- Keep changes transferable across CLI, backend, and web/fullstack repos
- Revert if the result becomes another generic DevOps wrapper or duplicates existing skills

## Tried Already
- Keep: modernize high-traffic legacy anchors with sharper boundaries plus `references/` and `evals/`
- Revert: adding new overlapping wrappers when an existing indexed skill can be upgraded instead
- Why: support-backed modernization has produced cleaner trigger boundaries and better docs/graph/wiki compounding than adding new near-duplicates
