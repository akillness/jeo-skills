# Platform Map
## Categories
- Discovery
- Validation
- Reporting
- PR governance

## Settings
- Mandatory lanes: 5 keywords families fixed by policy.

## Rules
- Keep recovery_queries with both stages for every lane.
- No merge when checks are absent.

## Hooks
- validate_survey_artifacts.py
- validate_hourly_evidence_contract.py (new)

## Platform Gaps
- CI bootstrap still needed on carry-forward open PR branch.
