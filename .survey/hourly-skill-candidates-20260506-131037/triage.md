# Triage
- Problem: 시간별 스킬 후보 탐색에서 lane별 품질 편차와 무근거 추천 발생 위험
- Audience: oh-my-skills 유지보수자
- Why now: 주기 실행 자동화에서 품질 게이트 누락 시 낮은 적합도 후보가 누적됨

## Workflow Context
- provenance: indexed snippet (gh search repos)
- 5개 lane 강제 조사 및 회복 쿼리 적용

## Affected Users
- 스킬 큐레이션 담당자

## Current Workarounds
- 수동 필터링

## Adjacent Problems
- no-checks-reported PR 누적

## User Voices
- 구현+PR까지 자동 진행 필요
