# Platform Map
## Settings
- Repo: akillness/oh-my-skills
- Run mode: hourly cron

## Rules
- Merge only on green checks.
- Keep stage-1 and stage-2 recovery query records for every lane.

## Hooks
- validate_survey_artifacts.py --platform-topic --require-provenance

## Platform Gaps
- CI checks absent on current open PR branch.
