## Settings
- Search transport: `web_search` degraded (401 INVALID_API_KEY)
- Fallback transport: GitHub REST search via `gh api`

## Rules
- Preserve canonical survey artifact contract and validator headings
- Keep provenance labels validator-compatible (`indexed snippet`, `direct page retrieval`)
- Keep `transport_status.web_search.error_log` repository-relative

## Hooks
- None required for this ratchet; deterministic CLI + file artifacts are sufficient

## Platform Gaps
- Hosted web search credentials may be unavailable in cron runners, requiring fallback transport and explicit degraded-cause reporting.
