# Hourly survey gh-search empty-payload ratchet

## Summary
This run observed an empty-success edge case: `gh search repos react --limit 3 --json ...` returned `[]` with exit code 0, while direct GitHub REST search returned populated results. The hourly survey loop should treat this as degraded transport behavior rather than healthy empty evidence.

## Evidence
- `.survey/hourly-skill-candidates-20260427-1828/gh-search-react.json` (empty payload)
- `.survey/hourly-skill-candidates-20260427-1828/evidence.json` (lane recovery + transport status)
- `.survey/hourly-skill-candidates-20260427-1828/web-search-error.log` (`INVALID_API_KEY` fallback context)
- https://cli.github.com/manual/gh_search_repos (direct page retrieval)
- https://docs.github.com/en/rest/search/search#search-repositories (direct page retrieval)

## Ratchet
- Add a deterministic guard: if `gh search repos` exits 0 but returns `[]` for known-populated probes, switch to `gh api "search/repositories?..."` query path and mark provenance.
- Preserve `transport_status` with repository-relative error-log path for reproducible diffs.

## Expected Impact
- Fewer false degraded lanes caused by search transport quirks.
- More stable recommendation-quality candidate discovery across unattended hourly runs.
