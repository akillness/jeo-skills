# Run Report: hourly-skill-candidates-20260425-112704

## Backlog / Previous agreements
- Open PR found: #169 (`chore(survey): add transport/auth degraded-cause taxonomy for hourly runs`) — no explicit failure marker, kept separate from this run scope.

## Lane status
- agentic ai skill: status=pass, kept=6, raw=33, median_stars_raw=0, zero_star_raw=21, causes=low-signal:27, license:20 (provenance: direct page retrieval)
- web frontend skill: status=degraded, kept=0, raw=4, median_stars_raw=0.0, zero_star_raw=3, causes=license:3, stale:1, low-signal:3 (provenance: direct page retrieval)
- web backend skill: status=degraded, kept=0, raw=0, median_stars_raw=0, zero_star_raw=0, causes=none (provenance: direct page retrieval)
- cli open source skill: status=degraded, kept=1, raw=1, median_stars_raw=9062, zero_star_raw=0, causes=none (provenance: direct page retrieval)
- game development skill: status=pass, kept=1, raw=30, median_stars_raw=0.0, zero_star_raw=17, causes=stale:14, license:21, low-signal:22, archived:1 (provenance: direct page retrieval)

## Applied hardening
- Added explicit low-fit handling for generic personal `*/skills` repos in the agentic lane.
- Synced skill contract docs + toon + evals to keep instruction/test parity.

## Validation
- survey validator: PASS (`--platform-topic --require-provenance`)
- JSON lint: PASS (`python -m json.tool` on evals/graphify artifacts)
- whitespace check: pending via `git diff --check`

## Risk / rollback
- Risk: Over-filtering can hide niche high-quality repos with generic names.
- Mitigation: rule allows explicit exception with workflow docs + traction rationale.
- Rollback: revert this commit or remove the added low-fit bullets and eval entry.
