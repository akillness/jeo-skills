# Context: oh-my-skills hourly candidate maintenance

## Workflow Context
- 매 실행마다 `survey 기반 후보 탐색 → 근거 수집 → 변경 구현 → PR/리뷰/머지`가 반복된다.
- 이번 실행에서는 `web_search`가 `INVALID_API_KEY`로 실패하여 GitHub API 기반 fallback이 필수였다. (provenance: direct page retrieval)
- 동일 키워드라도 검색 결과 품질 편차가 커서 seed repository와 relevance gate가 없으면 오탐 후보가 상위에 노출된다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | 후보 검토, PR 승인/머지 | Advanced |
| Cron operator | 자동 실행 안정성 관리 | Advanced |
| Skill consumers | 설치/활용 | Intermediate |

## Current Workarounds
1. web_search 실패 시 GitHub Search/Repo API로 직접 조회한다. (direct page retrieval)
2. 키워드별 seed repository를 병행 조회해 검색 노이즈를 상쇄한다.
3. `license / pushed_at / archived` 메타데이터가 부족한 후보는 리스크로 분류한다.

## Adjacent Problems
- CLI 키워드에서 도구 자체가 아닌 리스트/모음형 레포가 상위 노출되는 문제.
- backend 키워드에서 교육용/샘플 레포가 혼입되는 문제.
- 증거 링크는 충분하지만 품질 필터 기준이 스킬 문서에 약하게 반영될 수 있음.

## User Voices
- "매 1시간마다 ... 기존 스킬 개선 및 신규 스킬 추가를 PR 기반으로 진행" — scheduled task
- "후보 탐색 및 근거 수집은 반드시 survey 방식" — scheduled task
