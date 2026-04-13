# Loop Charter

## Goal
Improve `plannotator` so it activates reliably as the repo’s visual plan/diff approval gate, stays within the skill-format standard, and gains reusable support files plus evals.

## Current Baseline
- `plannotator/SKILL.md` is 600 lines.
- Validation currently reports 5 warnings: weak trigger phrasing, missing `## Instructions`, `## Examples`, `## Best practices`, and excessive length.
- The skill has scripts, but no `references/` or `evals/`.

## Mutable Artifact
Primary: `.agent-skills/plannotator/SKILL.md`

Supporting artifacts allowed this run:
- `.agent-skills/plannotator/references/*`
- `.agent-skills/plannotator/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki / survey / graph outputs required by the maintenance loop

## Fixed Evaluation Harness
- Agent Skills validation script: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/plannotator`
- JSON parse validation for `evals/evals.json` and `.agent-skills/skills.json`
- Dry-run rubric:
  1. `plannotator` clearly triggers for plan review, diff review, and note export.
  2. Route-outs to `task-planning`, `code-review`, `agentation`, `vibe-kanban`, and `jeo` are explicit.
  3. Core skill stays under 500 lines and shifts detail into references.
  4. Discovery docs reflect the sharper positioning.

## Constraints
- One primary skill modernization only.
- No new overlapping skill.
- Keep existing scripts unless a change is necessary.
- Prefer transferable boundary/support improvements over bespoke platform trivia in the main skill body.

## Tried Already
- Keep: none yet in this run.
- Revert: none yet in this run.
- Why: fresh modernization pass.
