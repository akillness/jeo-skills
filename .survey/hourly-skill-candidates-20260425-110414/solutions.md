## Solution List
- keep 가능한 후보가 없어 복구 검색 필요 (thin evidence)

## Categories
- 신규안: 기존 skill 디렉터리와 직접 매핑되지 않는 후보
- 개선안: 기존 survey/validator/reference 강화를 통한 품질 게이트 개선

## What People Actually Use
- GitHub stars/forks가 높은 OSS와 최근 업데이트된 저장소가 반복적으로 상위에 노출됨 (direct page retrieval).
- CLI lane은 다수 성숙 OSS가 확인되어 스포트라이트 유지 가능 (direct page retrieval).

## Frequency Ranking
- agentic: kept 0 / raw 30 (lane_status: degraded)
- frontend: kept 0 / raw 4 (lane_status: degraded)
- backend: kept 0 / raw 0 (lane_status: degraded)
- cli: kept 0 / raw 0 (lane_status: degraded)
- game: kept 0 / raw 30 (lane_status: degraded)

## Key Gaps
- agentic: degraded_causes={'license': 30, 'low-fit': 1}
- frontend: degraded_causes={'license': 4, 'stale': 1}
- backend: degraded_causes={}
- cli: degraded_causes={}
- game: degraded_causes={'license': 30, 'stale': 14, 'low-fit': 1, 'archived': 1}

## Contradictions
- 키워드 일치만으로는 도메인 적합성이 보장되지 않아 low-fit drop 비중이 존재.
- 최신성(freshness)과 커버리지(5 lane) 사이에 트레이드오프가 발생할 수 있음.

## Key Insight
- lane_status를 pass/degraded로만 두지 말고 kept/raw/median_stars/zero_star를 함께 기록하면 반복 실행에서 품질 추세를 추적하기 쉽다. (direct page retrieval)
