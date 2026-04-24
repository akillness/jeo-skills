# Platform Map
## Settings
- Retrieval: `gh search repos --json fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount`
- Output package: `.survey/{slug}/` with triage/context/solutions/platform-map + evidence.json.

## Rules
- Mandatory five keyword families executed every hourly run.
- Apply relevance gate with metadata minimum: license/pushed_at/archived/fit rationale.
- Treat unknown license as exclusion by default unless exception rationale is explicit.

## Hooks
- Validator: `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/{slug} --platform-topic --require-provenance`
- Quality gate before merge: validator pass + `git diff --check`.

## Platform Gaps
- Web/frontend/backend keyword lanes produce higher noise; need freshness floor to prevent stale recommendations.
- Obsidian CLI binary may be unavailable in headless runners; direct file write fallback required.

Provenance: browser-rendered retrieval; direct page retrieval.