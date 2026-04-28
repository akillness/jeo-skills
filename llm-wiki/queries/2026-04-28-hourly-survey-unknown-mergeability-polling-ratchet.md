# Hourly Survey UNKNOWN-mergeability polling ratchet (2026-04-28)

## Question
백로그 게이트로 carry-forward 모드일 때, 대상 PR의 `mergeStateStatus`가 `UNKNOWN`으로 보이면 어떤 저위험 규칙을 추가해야 unattended 머지 신뢰도를 높일 수 있는가?

## Survey-derived finding
- 단일 샘플의 `UNKNOWN`을 최종 상태로 확정하지 않는다.
- 짧은 bounded 재조회(폴링) 후에도 `UNKNOWN` 지속 시 해당 PR을 보류하고 다음 후보 PR로 결정적으로 전환한다.
- 보류 사유(UNKNOWN 지속, 재조회 횟수, 전환 후보)를 `.survey/<slug>/` 아티팩트에 남긴다.

## Why this is a ratchet
- 기존 규칙은 `DIRTY` 분기는 강하지만 `UNKNOWN`의 지연-계산 특성에 대한 분기가 약했다.
- 본 규칙은 파괴적 작업 없이 분기 정확도를 높여 실패/재시도 비용을 줄인다.

## Artifacts
- `.survey/hourly-skill-candidates-20260428-225337/evidence.json`
- `.survey/hourly-skill-candidates-20260428-225337/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260428-225337/graphify-refined.json`
