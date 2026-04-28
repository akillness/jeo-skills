## Settings
- Search transport setting degraded: `web_search` returned `INVALID_API_KEY`.
- Fallback setting: GitHub REST search via `gh api search/repositories`.

## Rules
- Keep `transport_status.web_search.error_log` repository-relative.
- Capture provider envelope fields when available (`error_tag`, `request_ids[]`).

## Hooks
- Pre-PR gate: if hourly open PR backlog >= 10, run carry-forward first.
- If selected carry-forward PR is `DIRTY`, create replacement branch from `main`.

## Platform Gaps
- Hosted web search key availability differs by runtime; GH API lane is more reliable in this environment.

Provenance: indexed snippet, direct page retrieval.
