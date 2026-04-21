# Loop Charter

## Goal
Improve `skill-standardization` so future canonical-vs-alias rewrites explicitly review and sync alias-side support docs when those docs restate the canonical contract.

## Current Baseline
`skill-standardization` already covers validator truth, duplicate handling, catalog sync, and compact-surface review, but the alias-support-sync lesson is only partially encoded and easy to miss outside the main SKILL body.

## Mutable Artifact
Primary: `.agent-skills/skill-standardization/SKILL.md`

Supporting context files (only if needed to keep the contract truthful):
- `.agent-skills/skill-standardization/SKILL.toon`
- `.agent-skills/skill-standardization/references/working-modes.md`
- `.agent-skills/skill-standardization/evals/evals.json`

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/skill-standardization`
- `python3 -m json.tool .agent-skills/skill-standardization/evals/evals.json`
- manual check: the updated skill/reference/evals must explicitly mention alias-side support docs as part of canonical-vs-alias maintenance
- manual check: no README / README.ko / setup prompt update unless the trigger/discovery surface materially changed

## Constraints
- One bounded maintenance theme only: alias-support sync in `skill-standardization`
- No new skill creation
- No broad repo-wide graph refresh unless structural understanding changes materially
- Keep or revert based on whether the rule becomes more explicit and transferable under the same harness

## Tried Already
- Keep: prior repo-wide alias hardening in frontend / marketing / creative-media lanes
- Keep: current SKILL.md draft that adds alias-side support sync bullets
- Open question: whether the support reference and evals also need the same rule for durable transfer
