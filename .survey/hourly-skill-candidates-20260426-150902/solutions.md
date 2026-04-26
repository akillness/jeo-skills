# Solution Landscape: oh-my-skills hourly survey hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| License fallback retrieval ratchet | When GraphQL `licenseInfo` is null, retry via REST `gh api repos/<owner>/<repo> --jq .license.spdx_id` before classifying unknown license | Low-risk, deterministic, preserves existing gates | Slightly more API calls | Recommended |
| Keep current strict behavior | Treat null as unknown license without retry | Simpler implementation | False degradation in healthy lanes | Not recommended |
| Manual exception notes | Keep strict behavior, allow per-run manual overrides | Flexible in edge cases | High operator burden, non-deterministic | Secondary fallback only |

## Categories
- Metadata reliability hardening
- Recommendation-gate accuracy
- Cron-loop stability

## What People Actually Use
- `gh search repos` for sweep discovery (`indexed snippet` provenance).
- `gh repo view --json` for compact metadata retrieval.
- `gh api repos/<owner>/<repo>` when field-level metadata must be authoritative.

## Frequency Ranking
1. GitHub-native discovery (`gh search repos`) for all five lanes.
2. GraphQL metadata retrieval (`gh repo view`) as first pass.
3. REST endpoint fallback (`gh api repos/...`) when license is null.

## Key Gaps
- Current survey docs require license metadata but do not codify deterministic fallback when GraphQL license fields are null.
- This creates an avoidable all-lane degraded state (`license` taxonomy inflation).

## Contradictions
- Candidate `guarinogabriel/Mac-CLI` appears as `license: null` in GraphQL view but returns `MIT` via REST endpoint.

## Key Insight
Add one explicit license metadata fallback rule (GraphQL -> REST) so recommendation gates stay strict while avoiding false negatives from missing fields.

Evidence links:
- https://github.com/guarinogabriel/Mac-CLI
- https://github.com/openakita/openakita
- https://github.com/sangrokjung/claude-forge

Provenance: indexed snippet, direct page retrieval
