## Summary
- Executed hourly survey run with mandatory survey-first evidence collection.
- `web_search` transport was degraded (`INVALID_API_KEY`), so run used `gh api search/repositories` fallback and recorded error envelope evidence.
- Added low-risk ratchet to survey skill: require recording `transport_status.web_search.error_tag` and `transport_status.web_search.request_ids[]` when available.
- Updated eval assertions to enforce the new artifact expectation.
- Updated LLM-Wiki (query note + index/log) and stored run artifacts under `.survey/hourly-skill-candidates-20260428-093148/`.

## Carry-forward context
- Open hourly backlog preflight triggered carry-forward mode.
- Most recent carry-forward PR #208 was `DIRTY`, so this PR is a clean replacement branch from `main` per unattended policy.

## Evidence / Artifacts
- `.survey/hourly-skill-candidates-20260428-093148/evidence.json`
- `.survey/hourly-skill-candidates-20260428-093148/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260428-093148/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260428-093148/web-search-error.log`
- `.survey/hourly-skill-candidates-20260428-093148/validation.txt`

## Risk
- Low. Documentation/skill/eval + run artifacts only.
- No runtime product code changes.

## Rollback
1. Revert this PR commit.
2. Remove `.survey/hourly-skill-candidates-20260428-093148/` artifacts if undesired.
3. Re-run next hourly cycle.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260428-093148 --platform-topic --require-provenance` -> PASS
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` -> PASS
- `git diff --check` -> clean
