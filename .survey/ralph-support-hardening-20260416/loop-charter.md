# Loop Charter

## Goal
Improve the existing `ralph` skill without creating overlap by making the support surface measurably safer and more reusable for specification-first persistent-loop users.

## Current Baseline
- `ralph` is the canonical spec-first / persistent-completion skill.
- `graphify-out/GRAPH_REPORT.md` says it is the only remaining live skill missing `evals/evals.json`.
- Repo-local support text still contains stale `ralph-ooo` install/path examples that force users to translate live repo paths manually.

## Mutable Artifact
Primary: `.agent-skills/ralph/SKILL.md`

Supporting artifacts allowed if the primary change proves useful:
- `.agent-skills/ralph/evals/evals.json`
- `.agent-skills/ralph/SKILL.toon`
- `.agent-skills/ralph/references/platform-setup.md`
- wiki / survey / graph artifacts that record the decision

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/ralph`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Residue scan: no broken `.agent-skills/ralph-ooo/` self-path references remain in live `ralph` support docs after the change
- Dry-run prompts must still route clearly to `ralph` for: vague requirement clarification, persistent completion loop, and platform setup questions

## Constraints
- Max one coherent bounded improvement set this run
- No new orchestration wrapper skill
- Do not blur `ralph` into `omc`, `omx`, `ohmg`, `jeo`, `plannotator`, or `ralphmode`
- Update docs/setup surfaces only if the change materially affects discovery or onboarding
- Prefer transferable support fixes over one-off prose churn

## Tried Already
- Keep: survey + wiki evidence says harden `ralph` in place rather than add a new wrapper
- Keep: use repo-local and upstream evidence even when web search APIs fail
- Revert candidate: any change that broadens `ralph` into runtime/platform ownership instead of support/eval hardening
