# Solution Landscape: oh-my-skills hourly survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Survey skill ratchet: game lane stage-2 escalation template | Add deterministic stage-2 query template for game lane when stage-1 remains raw_count==0 | Improves parity across lanes; deterministic cron behavior | May still degrade on true ecosystem sparsity | low-risk docs/reference change |
| Keep current state without ratchet | Continue existing policy and only report degradation | No code/doc change required | Repeats no-results with no recovery depth for game lane | Not preferred |
| Broaden all lane queries aggressively | Increase recall using much looser queries | Higher chance of non-zero hits | Higher noise and reviewer burden | medium risk |

## Categories
- Deterministic recovery hardening
- Status-quo reporting
- High-recall/noise expansion

## What People Actually Use
Maintainers currently rely on deterministic lane-status reporting plus minimal-risk skill/reference ratchets, because hourly automation favors predictable validation over broad manual curation. (provenance: direct page retrieval)

## Frequency Ranking
1. Deterministic lane-status + degraded-cause reporting
2. Lane-specific recovery template tuning
3. Broad-query experimentation

## Key Gaps
- Game lane lacks explicit stage-2 escalation template even though backend/frontend already encode stage escalation patterns.
- Repeated `no-results` in game lane reduces cross-lane recommendation diversity.

## Contradictions
- Broadening queries can increase recall but often weakens fit/signal quality, conflicting with recommendation-grade strictness.

## Key Insight
A narrow documentation/skill ratchet that adds game-lane stage-2 escalation is the highest-safety improvement: it preserves existing quality gates while making degraded-lane handling more symmetric and deterministic for unattended runs. (provenance: indexed snippet, direct page retrieval)

## Lane Health Snapshot
| Lane | lane_status | Metrics | degraded_causes | Top keep |
|------|-------------|---------|-----------------|----------|
| agentic-ai-skill | pass | raw=20, kept=16, median_stars=12279.5, zero_star=0 | license | bytedance/deer-flow |
| web-frontend-skill | degraded | raw=0, kept=0, median_stars=0, zero_star=0 | no-results | n/a |
| web-backend-skill | degraded | raw=0, kept=0, median_stars=0, zero_star=0 | no-results | n/a |
| cli-open-source-skill | pass | raw=30, kept=6, median_stars=1.0, zero_star=13 | license, low-fit, low-signal | jeremylongshore/claude-code-plugins-plus-skills |
| game-development-skill | degraded | raw=0, kept=0, median_stars=0, zero_star=0 | no-results | n/a |

## Recommendation Concentration
- recommended_lane_count: 2
- single_lane_concentration: false
