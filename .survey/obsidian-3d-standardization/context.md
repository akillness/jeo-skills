## Workflow Context
- 대상 저장소: `akillness/oh-my-skills`
- 기준: 최근 3일(`git log --since=<UTC cutoff>`) 내 신규 추가된 `.agent-skills/*/SKILL.md`
- 점검 축: 보안 위험, 표준 섹션, 로컬 자산 참조 존재, 실행 가능성.

## Affected Users
- 스킬 설치/활용 사용자
- 유지보수자(PR 리뷰어, 릴리즈 담당)

## Current Workarounds
- 수동 리뷰로 누락 섹션 보완
- 링크 dead 여부 수동 확인

## Adjacent Problems
- 신규 대량 유입 시 품질 편차
- 외부 문서 URL 변경으로 레퍼런스 부패(link rot)

## User Voices
- 운영 요구사항: PR 기반으로 실제 수정까지 진행, 체크 미보고/실패 시 머지 금지.

Provenance: direct git history, local file audit, validation script outputs.