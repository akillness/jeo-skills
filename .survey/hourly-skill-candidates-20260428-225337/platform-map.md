# Platform Map
## Settings
- gh CLI + cron 환경에서 비대화형 실행을 전제한다.
## Rules
- open PR backlog >=10이면 carry-forward 모드로 전환한다.
- 후보 PR 선택 전 mergeability 확인을 재시도/폴링한다.
## Hooks
- 필수 아님. 아티팩트(.survey)와 validator 결과를 source-of-truth로 사용한다.
## Platform Gaps
- GitHub mergeability는 즉시 계산되지 않아 `UNKNOWN`이 일시적으로 반환될 수 있다.
