## Settings
- Preserve five keyword families and deterministic stage-1/stage-2 recovery templates.
- Keep lane thresholds (`>=1 where feasible`, CLI target `3+`) and explicit lane metrics.

## Rules
- Keep discovery evidence broad; recommendation-grade keeps strict (license + freshness + fit + signal floor).
- If `raw_count == 0` after recovery, report `degraded_causes: no-results` explicitly.

## Hooks
- Pre-PR hook: run validator with `--platform-topic --require-provenance`.
- Pre-merge hook: require lane_status + lane_metrics + degraded_causes completeness checks.

## Platform Gaps
- Search providers vary in recall/noise; GitHub-native retrieval remains the most deterministic unattended fallback.

## Provenance
- direct page retrieval
- indexed snippet
- thin evidence
