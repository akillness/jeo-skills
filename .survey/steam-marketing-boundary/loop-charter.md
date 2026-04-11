# Loop Charter

## Goal
Improve trigger precision and reusable guidance for the legacy `marketing-skills-collection` skill without broadening catalog overlap.

## Current Baseline
- `marketing-skills-collection/SKILL.md` is structurally valid but still reads like a broad catch-all marketing trigger.
- Validator baseline: 0 errors, 2 warnings (`Use when` phrasing is weak; `## References` missing).
- The repo already has stronger alternatives for broad canonical use (`marketing-automation`) and Steam-specific game launch work (`steam-store-launch-ops`).

## Mutable Artifact
Primary mutable artifact: `.agent-skills/marketing-skills-collection/SKILL.md`

Supporting files allowed only if they materially improve validation or reuse:
- `.agent-skills/marketing-skills-collection/evals/evals.json`

## Fixed Evaluation Harness
- Agent Skills spec expectations from the loaded `skill-standardization` guidance
- Repo validator: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger-quality prompts for dry-run reasoning:
  1. generic SaaS marketing request should still fit this skill
  2. explicit legacy / platform-specific catalog request should fit this skill
  3. Steam page / Next Fest request should be deferred to `steam-store-launch-ops`
- Success criteria:
  - validator warnings reduced versus baseline
  - description becomes trigger-oriented and boundary-aware
  - supporting evals exist if added

## Constraints
- One bounded improvement area this run
- No new net-new skill unless the survey proves coverage is missing
- Keep the existing 23-sub-skill body; improve routing clarity rather than rewriting the whole skill
- Commit only if the post-change state is clearly better than baseline

## Tried Already
- Keep: identified overlap between `marketing-skills-collection`, `marketing-automation`, and `steam-store-launch-ops`
- Keep: surveyed primary docs and repo evidence before editing
- Revert: none yet
