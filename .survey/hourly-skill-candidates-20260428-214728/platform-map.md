# Platform Map

## Settings
- Cron executes hourly maintenance loop with fixed survey artifact contract.
- Backlog gate threshold applies before deciding PR strategy.

## Rules
- Use survey keyword families and relevance gate before recommending changes.
- If carry-forward target is DIRTY, create replacement PR from fresh `main`; no force-push/rebase in unattended mode.

## Hooks
- Validator gate (`validate_survey_artifacts.py`) must pass before PR actions.
- Graphify result persistence and fallback artifact generation retained for observability.

## Platform Gaps
- Mergeability can oscillate by base drift, creating unmergeable carry-forward PRs.
- Unattended environments cannot safely resolve interactive merge conflicts.

Provenance: indexed snippet, direct page retrieval
