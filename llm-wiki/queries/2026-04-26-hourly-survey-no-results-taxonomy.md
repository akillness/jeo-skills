# Hourly survey no-results taxonomy ratchet

- Date: 2026-04-26
- Run slug: `hourly-skill-candidates-20260425-205258`
- Mode: `repo-maintenance`

## Summary
Current hourly sweep produced a backend lane with `raw_count=0` after deterministic stage-1 and stage-2 recovery. This confirms that degraded-cause reporting needs an explicit `no-results` value instead of relying on implicit emptiness.

## Evidence
- Survey evidence JSON: `.survey/hourly-skill-candidates-20260425-205258/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260425-205258/rtk-summary.md`
- Graphify refinement fallback: `.survey/hourly-skill-candidates-20260425-205258/graphify-refined.json`
- Backend lane query logs include:
  - `web backend skill`
  - `backend api framework observability stars:>300 pushed:>=2024-01-01`
  - `backend developer platform api template stars:>150 pushed:>=2024-01-01`

## Recommendation
- Extend degraded-cause taxonomy to include `no-results`.
- Require `no-results` whenever `raw_count == 0` after documented recovery passes.
- Add eval coverage so this behavior is enforced in future unattended runs.

## Lane Snapshot
- agentic: pass | kept=5 raw=33
- frontend: degraded | kept=0 raw=4
- backend: degraded | kept=0 raw=0 degraded_causes={'no-results': 1}
- cli: degraded | kept=2 raw=5
- game: pass | kept=1 raw=30

## Provenance
- direct page retrieval
