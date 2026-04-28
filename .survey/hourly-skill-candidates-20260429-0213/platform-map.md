## Settings
- Survey lane: transport-failure fallback diagnostics.
- Artifact root: `.survey/hourly-skill-candidates-20260429-0213/`.

## Rules
- Keep transport artifacts repository-relative.
- Preserve structured provider envelope fields when available.

## Hooks
- Validation hook: `validate_survey_artifacts.py --platform-topic --require-provenance`.
- Documentation mirrors: main SKILL + checklist reference.

## Platform Gaps
- Existing docs covered `error_tag` and `request_ids[]` but not explicit `http_status` capture.

Provenance: direct page retrieval
