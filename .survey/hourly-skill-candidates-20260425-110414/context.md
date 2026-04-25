## Workflow Context
- hourly survey → artifact 생성 → skill 업데이트 → PR/리뷰/머지 루프를 안정적으로 유지한다.
- 이번 실행은 GitHub 검색 기반 survey를 사용했고, 근거는 evidence.json에 저장했다 (direct page retrieval).

## Affected Users
- 스킬 저장소 유지보수자
- cron 기반 자동 개선 파이프라인 사용자

## Current Workarounds
- 수동으로 lane별 신뢰도 판단을 해왔고, 기준이 실행마다 달랐다.
- 일부 lane은 노이즈 비율이 높은데도 동일 가중치로 처리되는 경향이 있었다.

## Adjacent Problems
- provenance 표기 누락 시 validator 실패 가능성
- lane degraded 사유를 정량으로 설명하지 못하면 PR 리뷰 비용 증가

## User Voices
- agentic ai skill | lane_status: degraded | kept=0 | median_stars_raw=0.0 | zero_star_raw=21 (direct page retrieval)
- web frontend skill | lane_status: degraded | kept=0 | median_stars_raw=0.0 | zero_star_raw=3 (direct page retrieval)
- web backend skill | lane_status: degraded | kept=0 | median_stars_raw=0 | zero_star_raw=0 (direct page retrieval)
- cli open source skill | lane_status: degraded | kept=0 | median_stars_raw=0 | zero_star_raw=0 (direct page retrieval)
- game development skill | lane_status: degraded | kept=0 | median_stars_raw=0.0 | zero_star_raw=17 (direct page retrieval)
