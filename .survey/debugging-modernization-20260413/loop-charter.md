# Loop Charter

## Goal
Improve the practical usefulness and trigger clarity of `.agent-skills/debugging` without creating a duplicate skill.

## Current Baseline
`debugging` is a generic legacy skill with broad advice, little boundary guidance, no support bundle, and no evaluation cases.

## Mutable Artifact
Primary: `.agent-skills/debugging/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger/boundary rubric: must clearly separate `debugging` from `log-analysis`, `testing-strategies`, and `code-review`
- Support-file rubric: add references and evals only if they strengthen execution clarity
- Discovery-surface rubric: update `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json` if positioning changes materially
- Dry-run prompts: runtime regression, flaky CI/test issue, and symptom-first log-driven issue that should hand off to `log-analysis`

## Constraints
- One bounded modernization pass only
- No new overlapping skill unless the survey shows a clear structural gap
- Keep changes comparable and reversible
- Preserve repo conventions and existing category structure

## Tried Already
- Keep: modernize nearby legacy anchors (`git-workflow`, `task-planning`, `backend-testing`, `log-analysis`) instead of adding wrappers
- Revert: creating overlapping adjacent skills when a stronger canonical skill was enough
- Why: transferable upgrades beat noisy duplication in this repository
