# Platform Map
## Settings
- Retrieval command: `gh search repos <query> --json fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount`
- Artifact path: `.survey/{slug}/` with triage/context/solutions/platform-map/evidence.

## Rules
- Execute all five mandatory keyword families each run.
- Apply relevance gate with metadata minimum: `license`, `pushed_at/updated`, `archived`, and fit rationale.
- Mark lane-level status (`pass|degraded`) and degraded cause taxonomy in markdown text.

## Hooks
- Validator: `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/{slug} --platform-topic --require-provenance`
- PR gate: validator pass + `git diff --check`.

## Platform Gaps
- Search quality varies by lane and hour, requiring recovery-query provenance.
- Headless runs may not have Obsidian URI execution; markdown write fallback remains necessary.

Provenance: browser-rendered retrieval; direct page retrieval.
