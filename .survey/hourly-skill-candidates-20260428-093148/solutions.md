## Solution List

1. Harden survey skill transport fallback schema with provider error envelope fields:
   - `transport_status.web_search.error_tag`
   - `transport_status.web_search.request_ids[]`
2. Extend eval assertion to require envelope capture when available.

## Categories
- reliability
- observability
- hourly-survey-maintenance

## What People Actually Use
- GitHub API fallback (`gh api search/repositories`) under search transport outages.
- Structured outage metadata capture for post-run diffing.

## Frequency Ranking
1. Search/auth degradation in unattended runs (high)
2. Mergeability drift on carry-forward PRs (medium)

## Key Gaps
- Existing rule captured error log path but not provider envelope IDs/tags.

## Contradictions
- None found.

## Key Insight
- Capturing request-scoped IDs (`requestId`) in artifacts materially improves outage forensics with near-zero maintenance cost.
