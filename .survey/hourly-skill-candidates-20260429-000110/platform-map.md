## Settings
- Run in carry-forward mode under high hourly backlog.

## Rules
- Keep only non-archived, licensed, fresh (<24 months), stars>=3 candidates.

## Hooks
- validate_survey_artifacts.py --platform-topic --require-provenance

## Platform Gaps
- mergeStateStatus can remain UNKNOWN transiently, requiring bounded polling.
