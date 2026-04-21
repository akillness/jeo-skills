# Loop Charter

## Goal
Improve the remaining frontend compatibility aliases so they are clearly self-documenting redirect layers across full and compact discovery surfaces.

## Current Baseline
- `frontend-design-system` and `vercel-react-best-practices` are already narrowed to compatibility aliases in `SKILL.md` and `skills.json`.
- Both still lack `references/` packets.
- `skills.toon` still describes both like peer canonical skills.

## Mutable Artifact
Primary mutable artifact set for this bounded run:
- `.agent-skills/frontend-design-system/`
- `.agent-skills/vercel-react-best-practices/`
- `.agent-skills/skills.toon`

## Fixed Evaluation Harness
- Agent Skills spec via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Compact/catalog sync review: the alias wording in `SKILL.md`, `skills.json`, and `skills.toon` must agree
- Dry-run usefulness: existing alias evals plus any added route-out eval should keep canonical-vs-alias behavior explicit
- Duplicate policy: no new frontend skill folders; aliases remain non-canonical

## Constraints
- Max scope: support hardening only; do not rewrite the canonical frontend skills again
- Max artifact types: focused `references/`, targeted eval additions if needed, and compact-surface sync
- Forbidden edits: no new overlapping frontend skill, no deletion of either alias, no broad README rewrite unless wording is actually stale
- Output format: preserve standard SKILL structure and compact discovery conventions

## Tried Already
- Keep: canonicalize the frontend pairs and move ordinary UI-system / React perf work to `design-system` and `react-best-practices`
- Keep: harden canonical skills in place rather than adding new wrappers
- Revert: treating aliases as peer defaults
- Why: the repo now prefers one canonical entry plus one narrow compatibility layer when exact-name compatibility still matters
