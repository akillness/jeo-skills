# Loop Charter

## Goal
Reduce `.agent-skills` catalog drift by making runtime discovery prefer the live filesystem, by teaching the repo's standardization skill to validate catalog/discovery surfaces, and by repairing the most misleading top-level docs/setup counts for this run.

## Current Baseline
- `skill-query-handler.py` trusts `skills.json` before filesystem discovery.
- `skill-standardization` validates `SKILL.md` structure but not catalog/discovery sync.
- README/setup inventory counts lag the live folder set.
- Game-development specialist skills are underrepresented in top-level inventory surfaces.

## Mutable Artifact
Primary: `.agent-skills/skill-standardization/SKILL.md`

## Supporting Artifacts
- `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- `.agent-skills/skill-standardization/references/catalog-sync-checklist.md`
- `.agent-skills/skill-standardization/evals/evals.json`
- `.agent-skills/skill-query-handler.py`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki / graph / survey artifacts for this run

## Fixed Evaluation Harness
- Live filesystem count remains the source of truth for installed skills.
- Changed skill still passes frontmatter/structure validation via `validate_skill.sh`.
- New catalog-sync script detects current mismatch classes (missing skills, stale extras, count drift).
- `skill-query-handler.py list --json` must include live-only skills that were previously hidden by manifest drift.
- README / README.ko / setup prompt counts and inventory text must match the repaired live state for the surfaces we touch.

## Constraints
- Keep the run bounded to catalog/discovery hardening; do not redesign the entire manifest format.
- Prefer transferable maintenance guardrails over one-off local fixes.
- Avoid adding a new broad overlapping skill.
- Update only the docs/setup surfaces materially affected by this change.

## Tried Already
- Keep: skill-level standardization, canonical-vs-alias guidance, and survey-backed modernization.
- Revert: relying on a stale central manifest as the only runtime discovery source.
- Why: drift compounds silently and hides live skills.
