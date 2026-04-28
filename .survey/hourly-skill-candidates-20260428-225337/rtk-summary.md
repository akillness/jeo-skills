# RTK Compact Summary
- Five-lane keyword sweep completed via `gh api search/repositories` with provenance labels `indexed snippet` and `direct page retrieval`.
- Pass lanes: `agentic_ai_skill`(1 keep), `cli_open_source_skill`(2 keeps). Degraded lanes: frontend/backend/game (mostly low-fit, low-signal, or empty raw).
- Highest-leverage low-risk ratchet: in carry-forward mode, do not decide from first `mergeStateStatus` sample when it is `UNKNOWN`; perform bounded re-checks and deterministic fallback to next PR candidate.
- Reason: current backlog already exceeds threshold, and `UNKNOWN` mergeability states are frequent in unattended GH flows; explicit polling/fallback reduces false skips and failed merge attempts.