# Loop Charter

## Goal
Improve `plannotator` by shrinking it into a routing-first visual approval-gate skill that chooses one review packet, keeps platform capability gaps honest, and routes PR policy / orchestration / UI-annotation work outward instead of mixing all of it into the front door.

## Current Baseline
- Current best version: `.agent-skills/plannotator/SKILL.md` at 266 lines with `references/review-modes-and-boundaries.md`, `references/platform-setup.md`, `references/notes-and-troubleshooting.md`, `scripts/`, and `evals/evals.json` from the 2026-04-13 modernization pass.
- Current quality: solid boundaries versus `task-planning`, `agentation`, and `code-review`, but still too mode-heavy in the front door and not explicit enough about manual-vs-hook review, spec/markdown approval, downstream PR-native review, or current Codex/OpenCode gaps.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/plannotator/SKILL.md`

Supporting artifacts allowed only if the primary change clearly requires them:
- `.agent-skills/plannotator/references/intake-packets-and-route-outs.md`
- `.agent-skills/plannotator/references/platform-setup.md`
- `.agent-skills/plannotator/references/notes-and-troubleshooting.md`
- `.agent-skills/plannotator/evals/evals.json`
- `.agent-skills/plannotator/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki / graph / survey artifacts for this run

## Fixed Evaluation Harness
- Spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/plannotator`
- Catalog sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- JSON validity for touched eval / manifest / graph artifacts
- Trigger quality check: the description and `SKILL.toon` must clearly trigger on plan review, diff review, markdown/spec approval, and platform setup without claiming to own planning, broad PR policy, or UI screenshot critique
- Dry-run usefulness check against at least 4 prompts covering plan review, diff review, markdown/spec review, and manual/partial-platform setup

## Constraints
- Max scope: one coherent structural-hardening pass for an existing skill
- Prefer patching the existing skill over creating any new skill
- Keep the front door shorter; move packet tables and platform/detail nuance into support docs
- Update README / README.ko / setup prompt only if the trigger/discovery wording materially changes
- Do not change the evaluation harness mid-run

## Tried Already
- Keep: 2026-04-13 modernization pass that established `plannotator` as the browser-review lane's visual approval gate with support docs and evals
- Revert: broadening `plannotator` into the planning engine, orchestration owner, or generic PR-review policy skill
- Why: survey evidence says the next bounded gain is a clearer packet router and more honest platform-gap handling, not another overlapping browser-review skill
