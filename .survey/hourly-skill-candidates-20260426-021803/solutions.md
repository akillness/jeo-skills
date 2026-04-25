## Solution List
- 5개 키워드 lane 고정 탐색 + lane health metric 기록.
- recommendation-grade 필터(license, freshness<=24mo, not archived, stars>=3, lane fit).
- single-lane concentration 체크로 품질 경보 추가.

## Categories
- 신규 스킬 제안
- 기존 스킬 개선 제안
- 운영 품질 하드닝(문서/검증/리스크)

## What People Actually Use
- agentic ai skill: AbdelhakRazi/flutter-bloc-clean-architecture-skill | lane_status=pass | kept=3/40
- web frontend skill: (없음) | lane_status=degraded | kept=0/4
- web backend skill: cloudforet-io/python-core | lane_status=pass | kept=3/19
- cli open source skill: jeremylongshore/claude-code-plugins-plus-skills | lane_status=pass | kept=5/25
- game development skill: tjboudreaux/cc-plugin-unity-gamedev | lane_status=pass | kept=1/40

## Frequency Ranking
- lane별 추천 후보 수 기준 우선순위: cli open source skill(5), agentic ai skill(3), web backend skill(3), game development skill(1), web frontend skill(0)

## Key Gaps
- 일부 lane에서 low-fit/low-signal 비중이 높아 degraded 상태 발생 가능.
- 단일 lane 집중 시 broad coverage 주장 금지.

## Contradictions
- 검색 적합도는 높지만 라이선스/활동성 부족으로 제외된 후보가 존재.

## Key Insight
- 고정 5-lane sweep + 정량 gate를 적용하면, 시간당 실행에서도 추천 품질을 안정적으로 유지할 수 있다.

- Provenance labels used: indexed snippet, direct page retrieval
