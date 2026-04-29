# Platform Map

## Settings
- Claude/Codex/Gemini unattended loops can share the same artifact contract under `.survey/{slug}`.

## Rules
- Use `gh search repos` for discovery (indexed snippet), then `gh api repos/<owner>/<repo>` for direct page retrieval metadata.
- Apply quality gate: license + freshness + low-signal + low-fit + archived.
- Record lane_status metrics and degraded causes.

## Hooks
- Validator hook: python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/{slug} --platform-topic --require-provenance

## Platform Gaps
- Search transport differences can cause uneven recall; GitHub-native fallback is deterministic in cron mode.