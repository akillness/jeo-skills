# Loop Charter

## Goal
Improve `jeo` as the repo's highest-visibility orchestration entrypoint by making the trigger surface easier to scan and maintain without changing the core PLAN → EXECUTE → VERIFY → CLEANUP contract.

## Current Baseline
- `jeo/SKILL.md` is 506 lines and triggers a file-length warning in `validate_skill.sh --all .agent-skills`.
- The file mixes workflow routing with platform config, state-schema detail, and troubleshooting notes.
- `jeo` is referenced from README, README.ko, setup prompts, and compact discovery artifacts, so boundary drift has a high blast radius.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/jeo/SKILL.md`

Supporting artifacts allowed only when needed to keep the main file clearer and synced:
- `.agent-skills/jeo/references/*`
- `.agent-skills/jeo/SKILL.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki / survey / graph outputs for this run

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/jeo`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh --all .agent-skills` should no longer warn on `jeo`
- Dry-run check against realistic prompts: integrated orchestration request, resume-with-ledger request, UI-annotate request
- Boundary check: `jeo` must still route correctly to `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, and `ralphmode`

## Constraints
- One coherent improvement set only; no unrelated skill churn
- Preserve cross-platform support
- Prefer moving detail into references over deleting operational guidance
- Refresh compact/discovery surfaces if the trigger surface changes materially
- Update README / README.ko / setup prompt only if positioning/discoverability changed enough to justify it

## Tried Already
- Keep: recent orchestration-lane hardening of `ohmg`, `ralphmode`, and `ralph`
- Revert: adding another overlapping orchestration wrapper
- Why: the wiki already treats this cluster as boundary-sensitive; support hardening beats wrapper proliferation
