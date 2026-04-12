# Loop Charter

## Goal
Improve `git-workflow` so it becomes a modern, high-signal local Git collaboration and recovery skill with sharper trigger boundaries, better execution clarity, and reusable support files.

## Current Baseline
Baseline is the existing `.agent-skills/git-workflow/SKILL.md`: a broad Git command catalog with weak routing boundaries, minimal PR distinction, no support files, and no eval coverage.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/git-workflow/SKILL.md`

Supporting artifacts allowed if the primary change is kept:
- `.agent-skills/git-workflow/references/*.md`
- `.agent-skills/git-workflow/evals/evals.json`
- repo discovery surfaces that materially describe the skill (`README.md`, `README.ko.md`, `.agent-skills/skills.json`)
- survey/wiki/graph memory files for this run

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Trigger quality: skill should clearly activate for local Git collaboration, rebasing, conflict handling, recovery, and safe push requests
- Boundary quality: skill should explicitly route PR lifecycle/review/planning/debugging work to adjacent skills when appropriate
- Dry-run prompts:
  1. “I rebased my branch and now I need to push safely without overwriting teammates.”
  2. “Help me clean up my local commits and get this branch ready for review.”
  3. “I hard-reset the wrong branch — can Git recover this?”
  4. “Can you handle this GitHub PR review?” (should route away from main use)
- Validation checks:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/git-workflow`
  - `python3 -m json.tool .agent-skills/git-workflow/evals/evals.json`

## Constraints
- Max one bounded modernization target this run
- No new overlapping skill unless clearly required (not expected this run)
- Keep the skill focused on local Git state changes and recovery
- Do not change the evaluation harness mid-run
- Prefer transferable improvements over repo-specific hacks

## Tried Already
- Keep: modernize existing cluster anchors instead of adding overlap (`task-planning`, `standup-meeting`, `sprint-retrospective`, `survey`, `bmad-gds`)
- Revert: broad duplicate creation when canonicalization or modernization is enough
- Why: repo graph and wiki history show more leverage from sharpening old anchors than adding noisy siblings
