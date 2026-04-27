# Context: hourly candidate license-quality gate

## Workflow Context
Hourly survey loops run the fixed 5-keyword sweep, apply relevance/freshness/signal gates, then propose merge-safe skill updates. This run used `gh search repos` + `gh api` fallback because web search transport was degraded (`INVALID_API_KEY`). Provenance labels: `direct page retrieval`, `indexed snippet`.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Cron maintainer | Keep recommendation quality stable across unattended runs | advanced |
| Reviewer | Validate evidence quality before merge | advanced |
| Downstream skill users | Depend on legally/reuse-safe references | mixed |

## Current Workarounds
1. Keep unknown licenses out (`null`/`NOASSERTION`), but allow generic `Other` entries if metadata is otherwise strong.
2. Record lane metrics and degraded causes for sparse/noisy lanes.
3. Use GitHub-native retrieval when search transport fails.

## Adjacent Problems
- `Other`/custom licenses are heterogeneous and may include non-open or unclear redistribution terms.
- Lane-level pass/fail can look healthy even when kept candidates contain ambiguous license semantics.
- Reviewers currently need manual per-repo license inspection to catch this.

## User Voices
- "Error searching web ... INVALID_API_KEY" (direct page retrieval)
- GitHub REST license payload exposes `spdx_id`, including `NOASSERTION` cases (direct page retrieval).
- Existing survey gate emphasizes explicit metadata but does not require an open-license allowlist for recommendation-grade keeps (direct page retrieval).

## Lane Health Snapshot
- agentic ai skill: kept=16, raw=20, lane_status=degraded
- web frontend skill: kept=8, raw=19, lane_status=degraded
- web backend skill: kept=0, raw=6, lane_status=degraded
- cli open source skill: kept=8, raw=9, lane_status=degraded
- game development skill: kept=7, raw=15, lane_status=degraded
