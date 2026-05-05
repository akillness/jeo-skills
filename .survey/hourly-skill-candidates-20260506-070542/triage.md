# Triage
- Problem: 시간별 후보 조사에서 lane별 품질 편차와 근거 누락 위험이 반복됨.
- Audience: oh-my-skills 유지보수자/리뷰어
- Why now: 자동화 런에서 PR 품질게이트를 통과시키려면 validator 호환 산출물과 provenance가 필수.

## Workflow Context
- Provenance label: indexed snippet
- Run slug: hourly-skill-candidates-20260506-070542

## Affected Users
- 스킬 작성자, 자동화 운영자

## Current Workarounds
- 수동 재검토와 ad-hoc 필터링

## Adjacent Problems
- lane 집중도(single lane concentration) 발생 시 커버리지 과대평가

## User Voices
- "구현 변경+PR까지 완료" 요구
