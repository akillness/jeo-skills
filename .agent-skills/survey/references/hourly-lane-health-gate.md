# Hourly Lane Health Gate (Survey PR Loop)

이 문서는 시간별 survey 실행 시 lane 품질 판정을 일관되게 유지하기 위한 운영 가이드다.

## Required lanes
- agentic ai skill
- web frontend skill
- web backend skill
- cli open source skill
- game development skill

## Hard gates
1. `raw_count == 0` lane은 stage-1, stage-2 recovery query를 모두 기록해야 한다.
2. recovery 이후에도 0이면 `lane_status: degraded` 및 `degraded_causes: ["no-results"]`를 명시한다.
3. 추천 후보는 다음 기준을 동시에 만족해야 한다.
   - signal floor: stars >= 3 또는 동등한 커뮤니티 신호
   - intent token overlap: lane 토큰/동의어가 fullName 또는 description에 존재
   - freshness: pushed_at 기준 최근 24개월 이내
   - metadata: archived=false, license 식별 가능
4. negation phrase(`no cli`, `without cli`, `not a cli`, `non-cli`)만으로 토큰 매치되는 경우 기본 `low-fit` 처리한다.

## Integrity checks
- lane metric은 같은 최종 데이터셋에서 계산한다 (`raw_count`, `zero_star_raw`, `median_stars_raw`, `kept_count`).
- 불가능 상태(`kept_count > raw_count`)를 금지한다.
- cross-lane에서 `recommended_lane_count < 2`면 `single_lane_concentration: true`를 보고한다.

## Provenance labels
Markdown/JSON 모두에 아래 라벨을 사용한다.
- direct page retrieval
- feed recovery
- indexed snippet
- browser-rendered retrieval
- browser-rendered indexed snippet
- thin evidence
