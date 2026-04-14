# Loop Charter

## Goal
Improve `file-organization` so it becomes a reusable, decision-first project-structure skill instead of a static tree dump.

## Current Baseline
Current `file-organization/SKILL.md` is long, example-heavy, and weakly bounded. It lacks support files and evals, and its trigger description is too generic to distinguish structural architecture decisions from adjacent skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/file-organization/SKILL.md`

Supporting files allowed only if they directly improve transferability and validation:
- `.agent-skills/file-organization/references/*`
- `.agent-skills/file-organization/evals/evals.json`
- `.agent-skills/file-organization/SKILL.toon`
- discovery docs / manifests if positioning changes require sync

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Repo-local validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/file-organization`
- Catalog sync validation: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Dry-run bar:
  1. Skill should trigger on restructuring / folder-boundary / monorepo-split prompts
  2. Skill should route component-API, design-system, env-setup, and automation requests away when structure is not the primary problem
  3. Skill should offer migration steps, not only static example trees

## Constraints
- One bounded modernization target this run
- Prefer transferable rules over framework-specific command dumps
- Keep docs/setup surfaces in sync if positioning changes materially
- No new duplicate skill unless the survey proves a distinct unmet boundary

## Tried Already
- Keep: modernize weak indexed anchors instead of adding overlapping skills
- Keep: add `references/` and `evals/` when the new structure materially improves transferability
- Revert: broad template dumps that blur boundaries with adjacent skills