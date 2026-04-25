## Settings
- Source retrieval: GitHub search/API-first due to hourly sweep policy and resilience requirements. (direct page retrieval)
- Recommendation-grade gate: license + freshness + signal + fit enforced before keeps. (indexed snippet)

## Rules
- Mandatory five keyword families executed every run.
- Lane status and lane metrics emitted per lane.
- Proposed hardening: include `no-results` when `raw_count==0` post-recovery. (indexed snippet)

## Hooks
- No platform-specific hook dependency required for this run.
- Validation and reporting remain repo-local via artifact validator and markdown contract. (indexed snippet)

## Platform Gaps
- Current taxonomy lacks explicit no-result marker, weakening deterministic reviewer triage under cron automation.
- Gap is cross-platform (Claude/Codex/Gemini) because artifact contract is shared. (indexed snippet)
