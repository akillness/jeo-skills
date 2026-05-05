# Hourly Lane Metric Integrity Gate

이 문서는 시간별 survey 실행에서 lane 지표 무결성을 보장하기 위한 운영 가드레일을 정의한다.

## 목적
- evidence.json 내 lane 지표(`raw_count`, `kept_count`, `zero_star_raw`, `median_stars_raw`)의 정합성 보장
- recovery query 전환 이후 지표 불일치 방지
- PR 리뷰 시 재현 가능한 감사 경로 제공

## 필수 규칙
1. lane별 최종 raw dataset은 단일 source set으로 확정한다.
2. `kept_count`는 항상 `raw_count` 이하이어야 한다.
3. `raw_count == 0`이면 stage-1/stage-2 recovery query 시도 내역을 남기고 `degraded_causes`에 `no-results`를 반드시 포함한다.
4. recommendation-grade 승격 조건은 아래를 모두 만족해야 한다.
   - lane-intent token overlap
   - negation-aware intent guard 통과
   - signal floor(stars >= 3 또는 동등 근거)
   - freshness window(최근 24개월)
   - non-archived + license 확인

## 리뷰 체크포인트
- evidence.json의 `lane_health`와 `lanes` 카운트가 일치하는지 확인
- markdown 산출물에 provenance 라벨이 텍스트로 표기됐는지 확인
- cross-lane concentration(`recommended_lane_count`)가 과장되지 않았는지 확인

## provenance
- direct page retrieval
- indexed snippet
