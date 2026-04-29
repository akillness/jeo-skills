# Context: hourly skill maintenance (hourly-skill-candidates-20260426-081527)

## Workflow Context
- 1시간 주기 크론이 후보 탐색→근거 수집→PR 생성→리뷰/머지를 수행한다.
- 현재 오픈 PR이 누적되는 구간이 있어, 무분별한 신규 변경보다 품질/중복 방지가 중요하다.
- 근거 수집은 GitHub 검색/API 기반 `indexed snippet`/`direct page retrieval` 라벨로 추적한다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | PR 승인/머지, 품질 게이트 관리 | advanced |
| Cron operator | 주기 실행 안정성 및 실패 대응 | intermediate |
| Skill consumer | 최신/정확한 스킬 사용 | mixed |

## Current Workarounds
1. 키워드 고정 5개 레인으로 후보를 계속 수집한다.
2. 라이선스/활성도/시그널 기준으로 자동 필터링한다.
3. Graphify/Obsidian CLI 실패 시 파일 기반 fallback으로 산출물을 보존한다.

## Adjacent Problems
- 오픈 PR 누적 시 리뷰 부하 증가
- 체크 미구성 리포지토리에서 merge gate가 자주 block됨
- 반복 실행 간 중복 후보 재제안 가능성

## User Voices
- "검증 실패 시 머지하지 말고 원인/대응안을 보고" — scheduler policy
- "survey 방식의 검색 기반 리서치로 근거 수집" — scheduler policy
- "RTK/Graphify/Obsidian/LLM-Wiki를 매 실행 반영" — scheduler policy
