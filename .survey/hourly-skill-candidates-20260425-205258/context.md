## Workflow Context
- Hourly cron loop executes mandatory five-lane keyword sweep before skill maintenance decisions.
- Lanes: agentic, frontend, backend, cli, game. Recovery queries are activated by deterministic sparse/noisy triggers.

## Affected Users
- Repo maintainers and reviewers who need deterministic lane health interpretation in unattended merge loops.

## Current Workarounds
- Manual interpretation when a lane remains empty after recovery.
- Ad-hoc reviewer comments to infer whether emptiness means low-fit noise or genuinely no discoverable repositories.

## Adjacent Problems
- Existing degraded-cause taxonomy can miss explicit signaling for true no-results lanes.
- Missing no-results classification creates noisy triage and inconsistent reviewer expectations.

## User Voices
- Repeated hourly hardening commits show preference for deterministic, reviewable lane metrics and causes.
- This run demonstrates a real backend no-results lane despite stage-1 + stage-2 recovery, validating need for explicit taxonomy support.

## Lane Snapshot
- agentic: lane_status=pass | kept_count=5 raw_count=33 median_stars_raw=0.0 zero_star_raw=21
- frontend: lane_status=degraded | kept_count=0 raw_count=4 median_stars_raw=0.0 zero_star_raw=3
- backend: lane_status=degraded | kept_count=0 raw_count=0 median_stars_raw=0 zero_star_raw=0
- cli: lane_status=degraded | kept_count=2 raw_count=5 median_stars_raw=829.0 zero_star_raw=0
- game: lane_status=pass | kept_count=1 raw_count=30 median_stars_raw=0.0 zero_star_raw=17
