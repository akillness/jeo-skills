# Solution Landscape: oh-my-skills hourly candidate sweep

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic lane | keyword+recovery 검색 후 relevance gate 적용 | provenance 명시 가능 | 노이즈 query는 degraded 가능 | top_keep=(none); lane_status=degraded |
| frontend lane | keyword+recovery 검색 후 relevance gate 적용 | provenance 명시 가능 | 노이즈 query는 degraded 가능 | top_keep=expo/expo; lane_status=pass |
| backend lane | keyword+recovery 검색 후 relevance gate 적용 | provenance 명시 가능 | 노이즈 query는 degraded 가능 | top_keep=payloadcms/payload; lane_status=pass |
| cli lane | keyword+recovery 검색 후 relevance gate 적용 | provenance 명시 가능 | 노이즈 query는 degraded 가능 | top_keep=nxtrace/NTrace-core; lane_status=pass |
| game lane | keyword+recovery 검색 후 relevance gate 적용 | provenance 명시 가능 | 노이즈 query는 degraded 가능 | top_keep=(none); lane_status=degraded |

## Categories
- 신규 스킬 후보 발굴
- 기존 survey/reference 개선

## What People Actually Use
- stars/forks 신호가 있는 성숙 OSS가 keep 후보로 남는다. (direct page retrieval)
- signal-floor가 없는 신규 저장소는 low-fit 또는 thin evidence 리스크로 제외된다. (direct page retrieval)

## Frequency Ranking
1. cli: kept 28 / raw 35 (lane_status: pass)
1. backend: kept 24 / raw 56 (lane_status: pass)
1. frontend: kept 15 / raw 64 (lane_status: pass)
1. agentic: kept 0 / raw 40 (lane_status: degraded)
1. game: kept 0 / raw 40 (lane_status: degraded)

## Key Gaps
- agentic: degraded_causes={'low-fit': 40, 'license': 25}
- frontend: degraded_causes={'low-fit': 49, 'license': 20, 'stale': 1}
- backend: degraded_causes={'low-fit': 30, 'license': 8}
- cli: degraded_causes={'license': 4, 'low-fit': 4}
- game: degraded_causes={'license': 31, 'low-fit': 40, 'stale': 19, 'archived': 2}

## Contradictions
- 검색 recall을 넓히면 low-fit/no-license 유입이 증가하고 precision이 하락한다.
- freshness floor를 엄격히 적용하면 niche lane 후보 수가 급감할 수 있다.

## Key Insight
- lane별 recovery 쿼리를 레퍼런스 문서에 고정하면 반복 실행에서 degraded 복구 속도가 빨라지고 리뷰 변동이 줄어든다. (direct page retrieval)
