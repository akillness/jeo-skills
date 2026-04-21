# Loop Charter

## Goal
Modernize `file-organization` into a reusable, decision-first skill for choosing and migrating project/repo structure across frontend, backend, fullstack/monorepo, docs/ops, and game-development repos.

## Current Baseline
The current skill is a static catalog of folder trees and naming examples. It has no `references/`, no `evals/`, weak trigger wording, thin boundary guidance, and little coverage for docs/ops or game-development layouts.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/file-organization/SKILL.md`

Supporting artifacts allowed for the same bounded run:
- `.agent-skills/file-organization/SKILL.toon`
- `.agent-skills/file-organization/references/*`
- `.agent-skills/file-organization/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `.survey/file-organization-modernization-20260415/*`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec / repo validator: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger-quality check: description must state when to use the skill and what it does, without collapsing into adjacent skills
- Support-file bar: add at least references and evals if the rewrite is kept
- Discovery-surface sync: README.md, README.ko.md, setup prompt, and catalog entries must reflect any material repositioning
- JSON validity checks for `.agent-skills/skills.json` and `evals/evals.json`

## Constraints
- Keep the run bounded to one skill modernization, not a whole cluster rewrite
- Prefer transferable guidance over framework-specific template dumping
- Do not create a noisy duplicate skill when a modernization solves the problem
- Keep claims source-backed in the survey artifacts
- If the resulting skill is not materially clearer or more useful than baseline, revert

## Tried Already
- Keep: modernizing adjacent developer-workflow anchors (`workflow-automation`, `git-workflow`, `git-submodule`, `npm-git-install`) by clarifying boundaries and adding references/evals
- Keep: cluster-level wiki notes that prioritize upgrading weak anchors over adding overlap
- Revert / avoid: another generic wrapper skill for repo organization; any rewrite that turns `file-organization` into search, automation, environment setup, or design-system guidance
