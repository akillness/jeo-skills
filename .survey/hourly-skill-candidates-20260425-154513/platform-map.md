## Settings
- Preserve five keyword families and deterministic rescue triggers.
- Keep recommendation-grade threshold checks lane-specific (>=1 feasible lane, CLI target 3+).

## Rules
- Keep discovery evidence broad; keep list strict (license + freshness + non-archived + fit + signal-floor).
- For signal-floor exceptions, require explicit rationale and risk note in markdown.

## Hooks
- Pre-PR hook: run validator with `--platform-topic --require-provenance`.
- Pre-merge hook: enforce lane metrics and lane_status presence in markdown summary.

## Platform Gaps
- Different search providers vary in coverage/noise; GitHub-native retrieval remains the most deterministic fallback for this maintenance loop.

## Provenance
- direct page retrieval
- indexed snippet (reserved fallback label)
- thin evidence (reserved fallback label)
