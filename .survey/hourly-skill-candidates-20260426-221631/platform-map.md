# Platform Map: hourly survey execution

## Settings
- Search surface: `gh search repos` with supported fields (`fullName`, `license`, `pushedAt`, `stargazersCount`).
- Validator mode: `--platform-topic --require-provenance` for schema/provenance enforcement.

## Rules
- Mandatory five-lane keyword sweep every run.
- Keep raw evidence; promote recommendations only after license/freshness/signal/fit gate.
- Mark lane_status `degraded` with explicit degraded_causes including `no-results` when applicable.

## Hooks
- RTK summary generated from compact lane-metric command output.
- Graphify refinement recorded per-run with fallback artifact if query path fails.
- Obsidian + LLM-Wiki notes updated for traceability.

## Platform Gaps
- GitHub query quality differs by lane and can over-return low-signal repositories.
- Headless environments may fail URI-based Obsidian actions; file-write fallback remains required.

Provenance: indexed snippet; direct page retrieval
