# Solution Landscape: hourly skill candidate survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai | GH repository search with metadata gates | Fast broad recall | Noisy without fit/signal filters | kept=3, raw=20 |
| web-frontend | GH repository search with metadata gates | Fast broad recall | Noisy without fit/signal filters | kept=1, raw=4 |
| web-backend | GH repository search with metadata gates | Fast broad recall | Noisy without fit/signal filters | kept=0, raw=0 |
| cli-oss | GH repository search with metadata gates | Fast broad recall | Noisy without fit/signal filters | kept=0, raw=0 |
| game-dev | GH repository search with metadata gates | Fast broad recall | Noisy without fit/signal filters | kept=4, raw=20 |

## Categories
- Search-first lane discovery
- Metadata-gated recommendation promotion

## What People Actually Use
GitHub repository search with star/activity/license checks and provenance notes (indexed snippet).

## Frequency Ranking
1. GitHub search lane sweep
2. Metadata-gated filtering
3. Reviewer checklist-based merge

## Key Gaps
- Some lanes return low-fit candidates despite keyword overlap.
- Recovery query attempts are not always explicitly recorded in markdown.

## Contradictions
- Broad-recall queries improve coverage but increase low-fit noise.

## Key Insight
Recommendation-grade promotion should require lane-intent fit + traction signal + recency gate, while preserving raw discovery evidence for auditability.

## Recovery Notes
- web-backend: stage1=`web backend open source skill stars:>50 pushed:>2024-01-01` (raw_count=0), stage2=`backend framework cli tool language:python stars:>100` (raw_count=20).
- cli-oss: stage1=`cli open source developer tool stars:>200 pushed:>2024-01-01` (raw_count=20), stage2 not needed.
