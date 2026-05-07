## Workflow Context
- 대상 저장소: `akillness/oh-my-skills`
- 범위: 최근 3일 내 신규 추가된 스킬 패키지 우선 점검
- 수행 검증: 스킬 validator, 로컬 자산 참조 존재성, 외부 링크 유효성, 보안 위험 문구 점검

## Affected Users
- 스킬을 직접 사용하는 에이전트/개발자
- 스킬 표준화 및 배포 파이프라인 유지보수자

## Current Workarounds
- validator 경고를 수동 무시
- 깨진 레퍼런스 링크는 사용자 스스로 대체 경로 탐색

## Adjacent Problems
- 신규 스킬 대량 유입 시 중복 헤더/섹션 누락 누적
- 외부 명령 예시가 보안 주의 없이 제공될 경우 오용 위험 증가

## User Voices
- 이번 런 요구사항: 보안/품질/완성도 개선을 실제 수정 후 PR까지 진행
- hard gate: PR checks 없거나 실패 시 merge 금지
