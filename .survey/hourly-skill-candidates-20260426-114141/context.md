## Workflow Context
- 1시간 주기 cron에서 키워드 5개 lane을 고정 실행하고, 각 lane에서 raw discovery 후 relevance/signal/freshness gate를 거쳐 추천군을 만든다.
- 이번 실행은 GitHub 검색 결과(indexed snippet)와 후보 저장소 메타데이터 조회(direct page retrieval)를 결합해 근거를 구성했다.

## Affected Users
- 저장소 메인테이너: 품질 게이트를 통과한 변경만 머지해야 한다.
- 리뷰어: lane_status/degraded_causes를 빠르게 판단해야 한다.
- 자동화 운영자: 검색 장애 또는 노이즈 편향 시 복구 쿼리를 확인해야 한다.

## Current Workarounds
- raw_count/kept_count가 부족한 lane에 대해 recovery query를 단계적으로 추가 실행.
- license 누락, stale(24개월 초과), archived, low-signal 후보는 추천군에서 제외.

## Adjacent Problems
- 특정 lane에 추천이 집중될 수 있어 cross-lane concentration 위험이 발생한다.
- GitHub 검색은 키워드 매칭 노이즈가 있어, fit rationale 없는 추천은 품질 저하를 유발한다.

## User Voices
- "검색 기반이어도 머지 가능한 근거 형식으로 남겨야 한다."
- "무분별한 신규 스킬보다 기존 스킬의 작은 고품질 개선이 더 안전하다."

Provenance: indexed snippet, direct page retrieval
