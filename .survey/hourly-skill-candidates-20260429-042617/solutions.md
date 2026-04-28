# Solution Landscape: oh-my-skills hourly survey loop

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai | GitHub search lane | 빠른 후보 수집 | 노이즈 가능성 | kept=3, raw=30 |
| web-frontend | GitHub search lane | 빠른 후보 수집 | 노이즈 가능성 | kept=1, raw=4 |
| web-backend | GitHub search lane | 빠른 후보 수집 | 노이즈 가능성 | kept=1, raw=1 |
| cli-open-source | GitHub search lane | 빠른 후보 수집 | 노이즈 가능성 | kept=1, raw=2 |
| game-development | GitHub search lane | 빠른 후보 수집 | 노이즈 가능성 | kept=8, raw=30 |

## Categories
- survey-first research
- metadata-gated recommendation

## What People Actually Use
GitHub Search API 기반 repo discovery + 정적 아티팩트 검증.

## Frequency Ranking
1. agentic-ai (kept=3)
2. web-frontend (kept=1)
3. web-backend (kept=1)
4. cli-open-source (kept=1)
5. game-development (kept=8)

## Key Gaps
- freshness(24개월) 자동 필터 근거 문서화 강화 필요.

## Contradictions
- broad recall과 lane-fit precision 간 긴장.

## Key Insight
lane 고정 + recovery 시도 기록 + provenance 라벨 고정이 재현성을 만든다. (browser-rendered indexed snippet)
