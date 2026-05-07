# Context

## 요구사항
- 최근 3일 내 신규 추가 스킬 우선 점검
- 보안/품질/완성도 개선 필요 시 최소 수정 + PR
- validator 재실행 및 결과 포함

## 범위
- 신규 SKILL.md 후보 식별: `git log --since='3 days ago' --diff-filter=A --name-only -- '.agent-skills/*/SKILL.md'`
- 후보별 validator 실행
- 보안 패턴 점검(토큰 하드코딩/원격 파이프 실행/과격 삭제 명령/sudo 남용)
- 참조 파일 존재성 점검
