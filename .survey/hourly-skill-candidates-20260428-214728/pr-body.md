## Summary
- Ran the required hourly **survey-based** candidate sweep (5 keyword lanes) and generated a complete artifact set under `.survey/hourly-skill-candidates-20260428-214728/`.
- Applied RTK compact summarization and Graphify-style refinement artifacts for lane-health traceability.
- Added a low-risk survey ratchet for unattended backlog carry-forward flow: when selected carry-forward PR is `DIRTY`, create a replacement PR from fresh `main` (no force-push/rebase).
- Synced reference taxonomy to include explicit `no-results` degraded cause.

## What changed
- `.agent-skills/survey/SKILL.md`
  - Added deterministic fallback for `DIRTY` carry-forward PRs in unattended cron loops.
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
  - Added `no-results` to degraded-cause taxonomy section.
  - Added carry-forward `DIRTY` replacement-PR guidance.
- `.survey/hourly-skill-candidates-20260428-214728/*`
  - Added triage/context/solutions/platform-map/evidence/RTK summary/Graphify files/validator output.

## Evidence / provenance
- Evidence: `.survey/hourly-skill-candidates-20260428-214728/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260428-214728/rtk-summary.md`
- Graphify refinement: `.survey/hourly-skill-candidates-20260428-214728/graphify-refined.json`
- Validator log: `.survey/hourly-skill-candidates-20260428-214728/validation.txt`
- Provenance labels used: `indexed snippet`, `direct page retrieval`

## Risk
- Low risk: documentation + survey artifact updates only.
- Potential risk: stricter carry-forward behavior may increase replacement-PR frequency when queue is heavily conflicted.

## Rollback plan
1. Revert this PR commit.
2. Remove `.survey/hourly-skill-candidates-20260428-214728/` artifacts if needed.
3. Restore prior survey guidance text.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260428-214728 --platform-topic --require-provenance` ✅
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` ✅
- `git diff --check` ✅
