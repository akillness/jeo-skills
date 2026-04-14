# Loop Charter

## Goal
Upgrade `git-submodule` from a legacy command catalog into a decision-first operator skill for safe submodule choice, bootstrap, updates, CI checkout, and removal.

## Current Baseline
- `git-submodule/SKILL.md` is a long tutorial-style command dump.
- No `references/` support files.
- No `evals/evals.json`.
- Discovery docs only describe it as generic “Git submodule management”.

## Mutable Artifact
Primary: `.agent-skills/git-submodule/SKILL.md`

Supporting context files allowed in this run:
- `.agent-skills/git-submodule/SKILL.toon`
- `.agent-skills/git-submodule/references/*`
- `.agent-skills/git-submodule/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- survey / wiki / graph artifacts for this bounded run

## Fixed Evaluation Harness
- Agent Skills structure and description quality from `skill-standardization`
- Trigger quality: `git-submodule` should activate for clone/init/update/remove/CI-submodule questions, not for generic Git-history repair
- Boundary quality: must separate submodule choice from `git-workflow`, `workflow-automation`, and `npm-git-install`
- Dry-run prompts:
  1. clone repo with missing submodules
  2. decide submodule vs subtree/vendor choice
  3. update tracked branch and commit pointer
  4. configure GitHub Actions checkout for submodules
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/git-submodule`
  - JSON parse check for `evals/evals.json`
  - JSON parse check for `.agent-skills/skills.json`

## Constraints
- One bounded modernization run only; no new overlapping skill
- Prefer transferable guidance over Git trivia
- Keep the canonical skill focused on submodule-boundary decisions and operator workflows
- Update docs/setup surfaces in the same branch

## Tried Already
- Keep: developer-workflow cluster modernization favors upgrading weak anchors instead of adding more wrappers
- Revert: adding another Git dependency wrapper next to `git-workflow` and `npm-git-install`
- Why: the cluster is cleaner when each Git-adjacent skill owns one boundary
