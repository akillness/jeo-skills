# Context: oh-my-skills hourly candidate scan

## Workflow Context
- 이번 실행은 `web_search`가 401(INVALID_API_KEY)로 실패하여, GitHub 검색 페이지 + GitHub REST API 조회로 복구했다. (direct page retrieval + browser-rendered retrieval)
- 샌드박스 환경에서 GitHub HTTPS 인증서 검증 실패(`CERTIFICATE_VERIFY_FAILED`)가 재현되어, 메타데이터 조회에 한해 unverified SSL 컨텍스트를 사용했다. (direct page retrieval, risk flagged)
- backlog 우선 규칙에 따라 직전 실행에서 미반영된 survey fallback 하드닝(문서 보강)을 이번 PR에 포함한다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | 후보 선별, 중복 판정, PR/머지 결정 | Advanced |
| Reviewer | 근거 링크/리스크/충돌 검증 | Advanced |
| Cron operator | 주기 실행 안정성 관리 | Intermediate |

## Current Workarounds
1. `web_search` 실패 시 GitHub 검색 URL을 증거 링크로 사용하고, 후보 repo는 API로 재검증한다. (browser-rendered retrieval + direct page retrieval)
2. 키워드 노이즈가 심한 경우(특히 frontend/backend/game) 고품질 seed repo로 후보를 좁히되, 필터링 사실을 명시한다. (direct page retrieval)
3. 인증서 이슈 환경에서는 unverified SSL을 메타데이터 수집에만 제한하고 리스크로 명시한다. (direct page retrieval)

## Adjacent Problems
- 키워드 기반 검색은 교육용/저신뢰 저장소가 상위에 혼재되어 false positive가 높다.
- 기존 스킬 카탈로그와 신규 후보의 경계(신규안 vs 개선안) 판정 시간이 증가한다.
- API 인증/인프라 이슈가 반복되면 시간당 자동화의 재현성이 저하된다.

## User Voices
- "CLI 오픈소스 후보를 매 실행마다 최소 3개 포함" — 사용자 요구사항 (job spec)
- "합의 여부와 관계없이, 품질 기준을 충족하는 업데이트는 작업 브랜치에서 반영하고 PR을 생성" — 사용자 요구사항 (job spec)
- "실험적/불안정 프로젝트는 위험 표기" — 사용자 요구사항 (job spec)
