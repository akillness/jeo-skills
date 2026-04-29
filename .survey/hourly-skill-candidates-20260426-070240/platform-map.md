## Settings
- Keep mandatory five-lane sweep and deterministic recovery triggers.
- Keep recommendation-grade gate defaults: non-empty license, non-archived, freshness floor, fit threshold, and stars>=3 signal floor.

## Rules
- Preserve broad discovery evidence in JSON, but keep markdown and review outputs explicit about lane health classes.
- Treat `raw_count==0` as `degraded-no-results` and include explicit reviewer action guidance.

## Hooks
- Pre-PR: run `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260426-070240 --platform-topic --require-provenance`.
- Pre-merge: verify lane-health diagnostic wording appears in docs/evals and that `git diff --check` is clean.

## Platform Gaps
- Search-provider quality differs over time; GitHub-native discovery remains the most deterministic baseline for this loop.

## Provenance
- direct page retrieval
- indexed snippet
- thin evidence
