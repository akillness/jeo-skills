# Context
## Workflow Context
- 매시간 survey 기반 후보 탐색 후 PR 생성/머지를 수행하는 자동화 루프가 동작한다.
## Affected Users
- 리포지토리 유지보수자, 자동화 봇 리뷰어.
## Current Workarounds
- mergeStateStatus만으로 후보 PR을 판단하거나 수동 확인을 반복한다.
## Adjacent Problems
- GH API의 mergeability 계산 지연 시 UNKNOWN 상태가 잦아 의사결정이 흔들린다.
## User Voices
- indexed snippet: GitHub CLI/REST 문서와 실사용 이슈에서 mergeable 계산 지연이 반복 보고됨.
