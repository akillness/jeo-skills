# Loop Charter

## Goal
Improve the `marketing-skills-collection` alias so it is easier to use safely in legacy workflows without reintroducing a second broad marketing peer skill.

## Current Baseline
- `marketing-skills-collection/SKILL.md` is already a thin compatibility alias for `marketing-automation`.
- `marketing-skills-collection/evals/evals.json` already verifies basic alias behavior.
- The alias still has no `references/` bundle.
- `marketing-automation/SKILL.toon`, `marketing-skills-collection/SKILL.toon`, and `.agent-skills/skills.toon` still describe the outdated 23-sub-skill model.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/marketing-skills-collection/SKILL.md`

Supporting artifacts allowed only if they directly reinforce the same boundary:
- `.agent-skills/marketing-skills-collection/references/*`
- `.agent-skills/marketing-skills-collection/SKILL.toon`
- `.agent-skills/marketing-automation/SKILL.toon`
- `.agent-skills/skills.toon`
- discovery/docs/wiki/graph files only if the trigger surface materially changes

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/marketing-skills-collection`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Manual rubric:
  - alias stays explicitly subordinate to `marketing-automation`
  - support files stay lightweight and migration-focused
  - compact variants no longer advertise the obsolete 23-sub-skill model
  - no new peer broad-marketing wrapper is introduced

## Constraints
- Max one bounded skill-improvement set in this run
- No new marketing skill directories
- No edits to the fixed evaluator during the run
- Prefer transferable alias-support patterns over marketing-only trivia
- Keep docs/setup churn minimal unless the discovery surface materially changes

## Tried Already
- Keep: canonicalize `marketing-automation` + narrow `marketing-skills-collection` into a compatibility alias
- Revert: treating both as peer broad-marketing skills
- Why: the repo already decided one canonical router is lower-noise and easier to maintain
