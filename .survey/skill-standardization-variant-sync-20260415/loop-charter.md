# Loop Charter

## Goal
Improve `skill-standardization` so future skill rewrites treat compact discovery variants (`SKILL.toon` / `SKILL.compact.md`) as first-class sync surfaces, reducing silent runtime drift.

## Current Baseline
`skill-standardization` already covers Agent Skills spec compliance, description quality, duplicate consolidation, and catalog sync (`skills.json`, README, setup prompt), but it does not explicitly require compact-variant review in the reusable workflow.

## Mutable Artifact
Primary: `.agent-skills/skill-standardization/SKILL.md`

Supporting context files that may change only if the primary artifact proves better:
- `.agent-skills/skill-standardization/SKILL.toon`
- `.agent-skills/skill-standardization/references/catalog-sync-checklist.md`
- `.agent-skills/skill-standardization/evals/evals.json`
- `.agent-skills-wiki/*`
- `.survey/skill-standardization-variant-sync-20260415/*`

## Fixed Evaluation Harness
- Agent Skills spec expectations from `https://agentskills.io/specification`
- Trigger-description guidance from `https://agentskills.io/skill-creation/optimizing-descriptions`
- Eval discipline from `https://agentskills.io/skill-creation/evaluating-skills`
- Repo-local validation:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/skill-standardization`
  - `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
  - `python3 -m json.tool .agent-skills/skill-standardization/evals/evals.json >/dev/null`

## Constraints
- One bounded improvement set only; do not create a new overlapping skill.
- Keep the standardization workflow transferable across many future skills.
- Prefer codifying existing practice over inventing a repo-specific one-off rule.
- Do not change the evaluator mid-run.

## Tried Already
- Keep: catalog-sync validation for `skills.json` + README/setup surfaces.
- Revert/insufficient: treating compact discovery variants as ad hoc per-run memory instead of standard guidance.
