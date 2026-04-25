## Workflow Context
- Hourly cron loop executes mandatory five-lane keyword sweep before skill maintenance decisions.
- Lanes: agentic, frontend, backend, cli, game. Recovery queries are activated by deterministic sparse/noisy triggers.

## Affected Users
- Repo maintainers and reviewers who must trust recommendation-grade candidates in unattended PR loops.

## Current Workarounds
- Manual reviewer filtering after PR creation.
- Ad-hoc rejection of low-star repos during self-review.

## Adjacent Problems
- Lane pass/degraded status can pass with very low-traction keeps.
- Degraded cause taxonomy does not explicitly separate low-signal drift from low-fit drift in docs.

## User Voices
- Repeated hourly hardening commits indicate ongoing effort to improve deterministic quality gates.
- Current evidence indicates low-signal repositories still appear in recommendation-grade lists in some lanes.

## Lane Snapshot
- agentic: lane_status=pass | kept_count=6 raw_count=33 median_stars_raw=0 zero_star_raw=21
- frontend: lane_status=degraded | kept_count=0 raw_count=4 median_stars_raw=0.0 zero_star_raw=3
- backend: lane_status=degraded | kept_count=0 raw_count=0 median_stars_raw=0 zero_star_raw=0
- cli: lane_status=pass | kept_count=3 raw_count=5 median_stars_raw=825 zero_star_raw=0
- game: lane_status=pass | kept_count=1 raw_count=30 median_stars_raw=0.0 zero_star_raw=17
