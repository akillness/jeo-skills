## Settings
- validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- candidate window: UTC now - 3 days (`git log --since=<utc-cutoff> --diff-filter=A`)

## Rules
- 신규 후보 우선 점검
- 경고/오류 감소를 위한 최소 범위 수정
- PR checks absent/failed => hard merge block

## Hooks
- pre-PR: `git diff --check`, validator 재실행
- post-PR: `gh pr checks` 결과 기반 merge decision

## Platform Gaps
- 일부 환경에서 고위험 패턴 문자열 포함 monolithic command가 안전 가드에 의해 차단될 수 있어 명령 분할 전략 필요
