## Settings
- validator: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- git window: UTC now - 3 days

## Rules
- 신규 후보 우선 점검
- 대규모 리팩토링 금지, 롤백 쉬운 최소 변경 우선
- 체크 미보고/실패 시 머지 금지

## Hooks
- pre-PR: validator + `git diff --check`
- post-PR: `gh pr checks`

## Platform Gaps
- validator 통과와 외부 링크 생존성은 별개라 `curl -I -L` 보완 필요
- CI 체크 미설정 브랜치는 자동 머지 불가(운영상 blocker 처리 필요)