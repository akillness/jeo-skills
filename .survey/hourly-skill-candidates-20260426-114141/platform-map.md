## Settings
- Cron hourly execution with fixed survey lane list.
- Evidence artifacts are stored under `.survey/{slug}` and validated with `--platform-topic --require-provenance`.

## Rules
- Keep recommendation-grade candidates only when license is present, repo is non-archived, recent activity is within 24 months, and traction signal exists.
- If lane health is weak, mark `lane_status: degraded` with explicit `degraded_causes` taxonomy.

## Hooks
- Pre-PR hook: run survey validator and `git diff --check`.
- Merge hook: block merge if PR checks are absent/failing.

## Platform Gaps
- Headless runs may lack Obsidian URI CLI; direct vault file writes are required fallback.
- Graphify query may fail on schema drift (`links` vs `edges`), requiring fallback refined graph JSON.

Provenance: indexed snippet, direct page retrieval
