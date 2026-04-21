# Loop Charter

## Goal
Upgrade `database-schema-design` into a modern storage-model + migration-safety anchor with sharper triggers, clearer adjacency to neighboring backend skills, and useful support files.

## Current Baseline
- Existing file: `.agent-skills/database-schema-design/SKILL.md`
- Current state: 694-line legacy skill, weak trigger precision, no `references/`, no `evals/`, generic example-heavy content, no strong route-outs to adjacent backend skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/database-schema-design/SKILL.md`

Supporting artifacts allowed if the primary skill rewrite justifies them:
- `.agent-skills/database-schema-design/references/*`
- `.agent-skills/database-schema-design/evals/evals.json`
- README / README.ko / `.agent-skills/skills.json` if the repositioning materially changes discovery wording
- wiki / graph / survey files required by the maintenance loop

## Fixed Evaluation Harness
- Agent Skills frontmatter and section conventions
- Trigger quality: should activate on schema design, storage modeling, migrations, indexing, constraints, multi-tenant/audit/soft-delete choices, and rollout-safe schema evolution
- Boundary quality: should route API contract work to `api-design`, docs to `api-documentation`, auth ownership to `authentication-setup`, verification to `backend-testing`, and security hardening to `security-best-practices`
- Support quality: add at least one useful reference and eval coverage if the rewrite is kept
- Validation steps:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/database-schema-design`
  - JSON parse check for `evals/evals.json`
  - repo diff review for accidental spillover

## Constraints
- One coherent improvement set only
- No new skill creation in this run
- Prefer reusable decision frameworks over DB-vendor trivia dumps
- Keep README/setup updates proportional to the actual repositioning

## Keep/Revert Criteria
- **Keep** if the new skill is clearly more triggerable, more bounded, and more practical for modern delivery workflows than the baseline.
- **Revert** if the rewrite stays generic, duplicates neighboring backend skills, or adds support files without improving routing usefulness.

## Tried Already
- Keep: modernize adjacent backend skills (`api-design`, `backend-testing`, `api-documentation`, `authentication-setup`) into sharper anchors.
- Revert: adding overlapping backend wrappers instead of upgrading the remaining legacy backend anchor.
- Why: the backend cluster works better when each skill owns one clear handoff.
