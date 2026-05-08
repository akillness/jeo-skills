# Platform Map
## Settings
- Source: GitHub indexed snippet search via gh CLI.
- Validation: survey validator + hourly evidence contract validator.

## Rules
- Keep mandatory 5 lanes.
- Preserve provenance labels in markdown and JSON.

## Hooks
- validate_hourly_evidence_contract.py before commit.
- validate_survey_artifacts.py with --platform-topic --require-provenance.

## Platform Gaps
- CI checks are not configured/reported on current PR branch, requiring blocker comment.
