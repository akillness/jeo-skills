# Solution Landscape: hourly skill survey loop

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill gate | intent+signal+freshness+license | 추천 품질 향상 | raw recall 감소 가능 | provenance: indexed snippet |
| web-frontend-skill gate | intent+signal+freshness+license | 추천 품질 향상 | raw recall 감소 가능 | provenance: indexed snippet |
| web-backend-skill gate | intent+signal+freshness+license | 추천 품질 향상 | raw recall 감소 가능 | provenance: indexed snippet |
| cli-open-source-skill gate | intent+signal+freshness+license | 추천 품질 향상 | raw recall 감소 가능 | provenance: indexed snippet |
| game-development-skill gate | intent+signal+freshness+license | 추천 품질 향상 | raw recall 감소 가능 | provenance: indexed snippet |

## Categories
- discovery
- quality-gate
- documentation

## What People Actually Use
- GitHub code search/metadata 기반 분류 및 수동 검토 병행

## Frequency Ranking
1. web/frontend-backend lane
2. agentic lane
3. cli/game lane

## Key Gaps
- no checks reported 상태가 merge 차단 사유로 자주 발생
- lane별 low-fit/low-signal 분포 편차

## Contradictions
- 후보 수 증대와 추천 정밀도는 상충

## Key Insight
- 회수율 단계와 승격 단계를 분리하면 근거 보존과 추천 품질을 동시에 달성 가능
