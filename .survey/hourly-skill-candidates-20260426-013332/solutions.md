# Solution Landscape: hourly survey skill maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Lane taxonomy hardening | degraded_causes에 `no-results`를 표준 원인으로 추가 | raw=0 케이스를 기계적으로 분류 가능 | 문서/툰/evals 동시 수정 필요 | 추천 후보 0건 원인 명확화 |
| Deterministic recovery escalation | stage1 후 raw=0 또는 kept=0이면 stage2 1회 강제 | unattended cron에서 판단 일관성 확보 | 쿼리 비용 증가 | 이미 일부 규칙 존재, 표현 보강 필요 |
| Signal/freshness gate | stars/라이선스/최근활동 기준 keep 제한 | 추천 품질 안정화 | 신생 유망 프로젝트 과소평가 가능 | 예외 사유+리스크를 함께 기록 |

## Categories
- 기존 스킬 개선(우선)
- 운영 품질 하드닝
- 신규 스킬 후보 탐색

## What People Actually Use
- agentic ai skill: AbdelhakRazi/flutter-bloc-clean-architecture-skill | lane_status=pass | kept=2/40
- web frontend skill: (없음) | lane_status=degraded | kept=0/4
- web backend skill: (없음) | lane_status=degraded | kept=0/0
- cli open source skill: guarinogabriel/Mac-CLI | lane_status=degraded | kept=1/1
- game development skill: tjboudreaux/cc-plugin-unity-gamedev | lane_status=pass | kept=1/40

## Frequency Ranking
1. cli open source skill
2. agentic ai skill
3. web backend skill
4. game development skill
5. web frontend skill

## Key Gaps
- 일부 lane에서 추천 후보가 0건일 때 degraded_causes 해석이 일관되지 않으면 리뷰 품질이 저하된다.
- lane health metric은 있으나 `no-results` 같은 명시 원인이 빠지면 자동 triage가 불완전해진다.

## Contradictions
- 검색 raw hit는 존재하나 recommendation-grade gate를 통과하지 못해 keep=0인 lane이 발생한다.
- 최신성은 충족하지만 low-signal로 제외되는 후보가 다수 존재한다.

## Key Insight
- 시간당 루프에서는 탐색 폭보다 degraded 원인 라벨의 기계적 일관성이 PR 품질 게이트 안정성에 더 직접적인 영향을 준다.

- Provenance labels used: indexed snippet, direct page retrieval
