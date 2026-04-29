## Settings
- Required lanes: agentic ai skill, web frontend skill, web backend skill, cli open source skill, game development skill.
- Provenance label policy: include direct page retrieval/feed recovery strings in markdown artifacts.

## Rules
- Keep candidate promotion non-destructive and metadata-gated (license, archived, recency, signal).
- Do not merge when validation gates fail.

## Hooks
- validator: `.agent-skills/survey/scripts/validate_survey_artifacts.py --platform-topic --require-provenance`
- quality checks: `git diff --check`

## Platform Gaps
- GitHub search phrase sensitivity can cause lane-level no-results; fallback query variants should be codified.
