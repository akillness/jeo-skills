# Solution Landscape: oh-my-skills hourly survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic_ai_skill | gh search + relevance gates | 근거 저장 자동화 | 노이즈 lane 발생 가능 | status=pass, kept=29/30 |
| web_frontend_skill | gh search + relevance gates | 근거 저장 자동화 | 노이즈 lane 발생 가능 | status=pass, kept=2/30 |
| web_backend_skill | gh search + relevance gates | 근거 저장 자동화 | 노이즈 lane 발생 가능 | status=pass, kept=1/30 |
| cli_open_source_skill | gh search + relevance gates | 근거 저장 자동화 | 노이즈 lane 발생 가능 | status=pass, kept=7/22 |
| game_development_skill | gh search + relevance gates | 근거 저장 자동화 | 노이즈 lane 발생 가능 | status=pass, kept=1/30 |

## Categories
- discovery, filtering, validation, merge-gating

## What People Actually Use
- GitHub 검색(gh search repos) 기반 증거 수집과 indexed snippet 라벨링.

## Frequency Ranking
1. cli_open_source_skill
2. web_backend_skill
3. game_development_skill
4. web_frontend_skill
5. agentic_ai_skill

## Key Gaps
- 일부 lane에서 low-fit/low-signal 비중이 높아 추천 부족.

## Contradictions
- raw_count는 충분해도 intent-overlap/신호 바닥선으로 kept가 0이 될 수 있음.

## Key Insight
- broad recall을 유지하되 recommendation은 freshness(24개월)+signal+intent overlap의 교집합만 유지하는 것이 안전.
