# Context: oh-my-skills hourly candidate scan

## Workflow Context
- backlog 우선 원칙에 따라 open backlog PR #157을 먼저 검증 후 merge 처리했다. (direct page retrieval)
- 필수 5개 키워드는 GitHub browser 검색 URL을 기준으로 재수집했고, 후보 repo는 `gh api`로 stars/license/archived/pushed_at를 교차검증했다. (browser-rendered retrieval + direct page retrieval)
- 이번 실행에서는 신규 스킬 추가( `aider-cli-workflow`)와 기존 스킬 개선(`git-workflow` route-out 보강)을 같은 브랜치에 반영했다. (direct page retrieval)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | 신규/개선 후보 선별, 중복 판정, PR/merge 결정 | Advanced |
| Reviewer | 근거 링크·리스크·충돌 검증, 품질 게이트 판정 | Advanced |
| Cron operator | 시간당 작업 재현성/실패 복구 관리 | Intermediate |

## Current Workarounds
1. 키워드 결과 노이즈가 높을 때 검색 URL은 discovery 용도로만 쓰고, 채택 전 메타데이터 재검증을 강제한다. (browser-rendered retrieval + direct page retrieval)
2. 기존 스킬과 경계가 겹치면 신규안 대신 route-out/범위 명확화 개선안으로 전환한다. (direct page retrieval)
3. merge 판단은 품질 게이트 all-pass일 때만 수행하고, fail 시 PR open 유지로 고정한다. (direct page retrieval)

## Adjacent Problems
- `skills.json`/README/setup 카운트 불일치가 repo 전반 품질 게이트를 상시 fail로 만드는 구조적 드리프트가 남아 있다.
- 키워드 기반 상위 결과에 교육용/저활성 저장소가 섞여 false positive가 반복된다.
- 신규 스킬을 추가해도 카탈로그 동기화 자동화가 없으면 문서 일관성 작업량이 누적된다.

## User Voices
- "CLI 오픈소스 후보 최소 3개 포함" — job spec.
- "backlog를 최우선 처리" — job spec.
- "품질 게이트 하나라도 fail이면 머지 금지" — job spec.
