# Triage
- Problem: 시간별 스킬 후보 조사에서 lane 품질 변동으로 저품질 추천이 섞일 수 있음.
- Audience: oh-my-skills 유지보수자
- Why now: 시간별 자동 반영 루프의 안정성과 재현성 확보가 필요함.

## Workflow Context
- 범위: 5개 lane 고정 키워드 조사 + 근거 보존
- Provenance label: indexed snippet, feed recovery

## Affected Users
- 스킬 패키지 관리/검증을 수행하는 유지보수자

## Current Workarounds
- 수동 샘플링과 PR 리뷰 의존

## Adjacent Problems
- no-results lane 발생 시 보고 누락 위험

## User Voices
- "제안-only로 끝내지 말고 구현+PR까지" 요구를 반영
