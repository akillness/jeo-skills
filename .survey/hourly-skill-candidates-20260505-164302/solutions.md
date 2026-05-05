# Solution Landscape: hourly skill survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic_ai_skill | lane별 2단계 recovery + fit gate | raw=6 데이터 보존 | 추천 없음 시 degraded 명시 | attempts=1, degraded_causes=license,low-signal (provenance: indexed snippet) |
| web_frontend_skill | lane별 2단계 recovery + fit gate | raw=1 데이터 보존 | 추천 없음 시 degraded 명시 | attempts=1, degraded_causes=low-signal (provenance: indexed snippet) |
| web_backend_skill | lane별 2단계 recovery + fit gate | raw=0 데이터 보존 | 추천 없음 시 degraded 명시 | attempts=2, degraded_causes=no-results (provenance: indexed snippet) |
| cli_open_source_skill | lane별 2단계 recovery + fit gate | raw=0 데이터 보존 | 추천 없음 시 degraded 명시 | attempts=2, degraded_causes=no-results (provenance: indexed snippet) |
| game_development_skill | lane별 2단계 recovery + fit gate | raw=7 데이터 보존 | 추천 없음 시 degraded 명시 | attempts=1, degraded_causes=low-signal (provenance: indexed snippet) |

## Categories
- Discovery 품질
- Recommendation 게이팅
- 증적/감사 가능성

## What People Actually Use
현재 런에서는 GitHub search API 기반 indexed snippet + direct page retrieval 중심으로 증적을 축적했다.

## Frequency Ranking
1. lane 결과 부족(no-results)
2. low-fit 후보 누적
3. low-signal 후보 다수

## Key Gaps
- 특정 lane(web backend, cli open source)에서 결과 0건 발생
- cross-lane 추천 집중도 저하(recommended_lane_count=0)

## Contradictions
- broad query는 결과를 주지만 intent 일치 후보는 거의 없음

## Key Insight
recovery query와 provenance 라벨을 강제해도, lane 의미론 게이트를 통과하는 실제 추천 후보가 없을 수 있으므로 degraded를 숨기지 않고 구조적으로 보고해야 한다.
