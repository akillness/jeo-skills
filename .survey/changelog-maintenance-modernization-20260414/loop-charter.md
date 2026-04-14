# Loop Charter

## Goal
Improve `changelog-maintenance` so it triggers reliably for changelog upkeep, release notes, migration callouts, and game patch-note workflows without overlapping neighboring documentation or launch skills.

## Current Baseline
Current skill is a legacy example-heavy changelog / semver dump with weak mode selection, weak route-outs, and no supporting `references/` or `evals/`.

## Mutable Artifact
Primary: `.agent-skills/changelog-maintenance/SKILL.md`

Supporting context (may change only to reflect the ratcheted primary artifact):
- `.agent-skills/changelog-maintenance/references/*`
- `.agent-skills/changelog-maintenance/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki / survey / graph outputs

## Fixed Evaluation Harness
- Agent Skills spec requirements from `skill-standardization`
- Repo modernization pattern from recently upgraded documentation-cluster skills
- Validation prompts:
  1. “Update CHANGELOG.md and draft release notes for v2.4.0 from the merged PR summary.”
  2. “Write a migration update for a breaking auth deprecation and link the right docs.”
  3. “Turn this Steam game update into lightweight patch notes and route launch messaging elsewhere.”
- Quality rubric:
  - clear trigger precision
  - explicit mode selection
  - strong route-outs / boundaries
  - practical structure over code dumps
  - support files present and useful

## Constraints
- One bounded modernization only; do not create a new overlapping skill
- Keep changes within the documentation cluster unless docs/discovery surfaces need wording updates
- Prefer transferable guidance over platform-specific rabbit holes
- Validate with the repo's `validate_skill.sh` and JSON parsing for evals

## Tried Already
- Keep: documentation-cluster modernizations that converted legacy dumps into boundary-aware anchors with references + evals
- Revert: adding overlapping wrappers instead of upgrading the indexed legacy anchor
- Why: support coverage and graph findings consistently favor stronger anchors over more catalog noise
