## Summary
- Executed hourly survey sweep with mandatory 5 keyword lanes and generated `.survey/hourly-skill-candidates-20260429-000110/` artifacts.
- Added a low-risk survey-skill ratchet: when all 5 lanes end with `raw_count == 0`, mark run-level `transport_status.sweep_health=degraded-all-lanes-zero-results` and persist trigger artifacts.
- Updated LLM-Wiki with this ratchet and linked evidence.

## Changes
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/SKILL.toon`
- `.survey/hourly-skill-candidates-20260429-000110/*`
- `llm-wiki/queries/2026-04-29-hourly-survey-all-lanes-zero-results-ratchet.md`
- `llm-wiki/index.md`
- `llm-wiki/log.md`

## Evidence
- `.survey/hourly-skill-candidates-20260429-000110/evidence.json`
- `.survey/hourly-skill-candidates-20260429-000110/validation.txt`
- `.survey/hourly-skill-candidates-20260429-000110/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260429-000110/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260429-000110/obsidian-status.txt`

## Risk
- Low. Documentation/rule-guidance changes only; no runtime code-path mutation.

## Rollback
1. Revert this PR commit.
2. Optionally remove the `.survey/hourly-skill-candidates-20260429-000110/` artifact folder.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260429-000110 --platform-topic --require-provenance` ✅
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` ✅
- `git diff --check` ✅
