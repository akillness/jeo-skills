## Workflow Context
- The hourly loop runs a mandatory five-lane keyword sweep: agentic, frontend, backend, cli, game.
- Recovery queries are triggered for sparse lanes and evidence is preserved even when recommendation keeps are empty.

## Affected Users
- Repository maintainers who need deterministic, low-noise PRs from autonomous runs.
- Reviewers who triage degraded lanes and need explicit cause taxonomy for fast decisions.

## Current Workarounds
- Manual interpretation of `degraded_causes` in `evidence.json`.
- Ad-hoc reviewer comments to explain why a degraded lane is expected vs. a true process failure.

## Adjacent Problems
- Mixed degraded states (e.g., frontend noise vs backend no-results) can look similar without markdown-level lane diagnosis.
- Recommendation quality can regress if low-signal filtering is weakened during future edits.

## User Voices
- Recent hourly hardening commits consistently emphasize deterministic gates, provenance requirements, and low-signal suppression.
- This run still indicates operational value in making degraded lane interpretation explicit in reviewer-facing docs.

## Lane Snapshot
- agentic: lane_status=pass | kept_count=3 raw_count=30 median_stars_raw=0 zero_star_raw=27
- frontend: lane_status=degraded | kept_count=0 raw_count=4 median_stars_raw=0.0 zero_star_raw=3
- backend: lane_status=degraded | kept_count=0 raw_count=0 median_stars_raw=0 zero_star_raw=0
- cli: lane_status=pass | kept_count=3 raw_count=5 median_stars_raw=1621 zero_star_raw=0
- game: lane_status=pass | kept_count=1 raw_count=30 median_stars_raw=0.0 zero_star_raw=17
