# Loop Charter

## Goal
Improve `code-refactoring` so it triggers reliably for safe behavior-preserving cleanup, decomposition, duplication removal, and repeated API migration work without overlapping `code-review`, `debugging`, `testing-strategies`, or `performance-optimization`.

## Current Baseline
Current skill is a long legacy example dump centered on textbook refactoring patterns. It lacks mode selection, verification emphasis, route-outs, supporting `references/`, and `evals/`.

## Mutable Artifact
Primary: `.agent-skills/code-refactoring/SKILL.md`

Supporting context (may change only to reflect the ratcheted primary artifact):
- `.agent-skills/code-refactoring/references/*`
- `.agent-skills/code-refactoring/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki / survey / graph outputs

## Fixed Evaluation Harness
- Agent Skills spec requirements from `skill-standardization`
- Existing code-quality-cluster boundary decisions already recorded in the wiki
- Validation prompts:
  1. "Refactor this oversized checkout handler into smaller units without changing behavior."
  2. "Replace a deprecated API across 200 TypeScript files before a framework upgrade."
  3. "A PR mixes a rename-only cleanup with semantic changes; how should we handle it?"
- Quality rubric:
  - trigger precision
  - explicit mode selection
  - strong behavior-preservation loop
  - clear route-outs to neighboring code-quality skills
  - useful support files and eval coverage

## Constraints
- One bounded modernization only; do not add another overlapping code-quality skill
- Prefer transferable workflow guidance over long pattern catalogs
- Keep docs/discovery updates limited to wording that reflects the sharper role
- Validate with `validate_skill.sh` and JSON parsing for evals

## Tried Already
- Keep: code-quality modernizations that sharpen one stage of the confidence loop instead of creating another wrapper
- Revert: overlapping quality/testing/debugging additions that blur ownership
- Why: graph and wiki history both show stronger anchor skills are more reusable than catalog growth
