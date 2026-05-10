## Settings
- Repository: akillness/oh-my-skills
- Active PR: #271
- Run mode: open-PR carry-forward (no new PR)

## Rules
- Required five lanes must be executed every run.
- stage-1 and stage-2 recovery queries are logged for each lane.
- Do not merge when checks are missing or non-green.

## Hooks
- `validate_survey_artifacts.py --platform-topic --require-provenance`
- `validate_hourly_evidence_contract.py <evidence.json>`
- `git diff --check`

## Platform Gaps
- CI pipeline not reporting checks on active branch.
- Merge remains blocked until checks are configured and rerun.

Provenance label used: indexed snippet and thin evidence.
