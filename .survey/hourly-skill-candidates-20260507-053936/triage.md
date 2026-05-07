# Triage
- Problem: 시간별 후보 발굴은 수행되지만 lane별 의도 적합성과 신호 바닥선 검증이 누락되면 품질 저하가 발생한다.
- Audience: oh-my-skills 유지보수자 및 자동화 러너
- Why now: 최근 오픈 PR에서 checks 부재가 반복되어 merge 품질게이트가 자주 막히고 있어, run 산출물의 감사 가능성 강화가 즉시 필요하다.

## Workflow Context
- 대상: akillness/oh-my-skills 시간별 survey-first 유지보수 루프
- 범위: 5개 lane 고정 조사 + 근거/프로비넌스/품질게이트 기록

## Affected Users
- 스킬 유지보수자
- 자동화 파이프라인 운영자

## Current Workarounds
- 수동 PR 확인
- ad-hoc 검색어 보강

## Adjacent Problems
- CI checks 미보고 상태의 backlog 누적
- lane별 추천 편향(single lane concentration)

## User Voices
- provenance가 markdown에도 남아야 reviewer 감사가 가능하다는 요구가 반복됨.
