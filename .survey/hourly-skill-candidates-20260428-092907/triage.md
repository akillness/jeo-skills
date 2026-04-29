# Triage
- Problem: Hourly five-lane survey quality drift: sparse/noisy lanes and metadata-shape inconsistency can suppress recommendation-grade keeps.
- Audience: Maintainers of akillness/oh-my-skills hourly survey automation and reviewers.
- Why now: This run showed uneven lane health and exposed a license-field shape mismatch risk between gh search payloads and strict license gates.

## Lane Health Snapshot
- agentic-ai: lane_status=pass, kept_count=3, raw_count=40, median_stars_raw=0.0, zero_star_raw=25, degraded_causes=license,low-signal (indexed snippet)
- web-frontend: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0.0, zero_star_raw=3, degraded_causes=license,stale,low-signal (indexed snippet)
- web-backend: lane_status=degraded, kept_count=0, raw_count=2, median_stars_raw=201.5, zero_star_raw=0, degraded_causes=license,stale (indexed snippet)
- cli-open-source: lane_status=pass, kept_count=30, raw_count=40, median_stars_raw=275.5, zero_star_raw=0, degraded_causes=license,stale,archived (indexed snippet)
- game-development: lane_status=pass, kept_count=1, raw_count=40, median_stars_raw=0.0, zero_star_raw=27, degraded_causes=license,stale,archived,low-signal (indexed snippet)

## Provenance
- indexed snippet: `gh search repos` lane sweeps
- direct page retrieval: `gh repo view`/`gh api repos/<owner>/<repo>` metadata enrichment
