# Platform Map
## Settings
- Scheduler: hourly cron maintenance loop.
- Target repository: https://github.com/akillness/oh-my-skills
- Validation: `.agent-skills/survey/scripts/validate_survey_artifacts.py --platform-topic --require-provenance`

## Rules
- Keep five mandatory keyword families every run.
- Keep recommendation-grade floors (freshness + signal) while preserving discovery evidence.
- Use provenance labels in markdown (`direct page retrieval`, etc.).

## Hooks
- RTK summary generation from `.survey/hourly-skill-candidates-20260425-075308/evidence.json`.
- Graphify refinement fallback artifact persisted in run directory.
- Obsidian and LLM-wiki notes appended per run.

## Platform Gaps
- Desktop/URI-dependent Obsidian CLI may fail in headless cron contexts.
- Graphify query mode may fail on schema/runtime mismatch and needs save-result fallback.
- Some lanes (notably backend) may require stage-2 recovery templates to avoid repetitive zero-hit outcomes.

## Provenance
- direct page retrieval
