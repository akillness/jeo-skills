# Context: hourly-skill-candidates

## Workflow Context
- 매 1시간 실행되는 survey-first 루프에서 5개 lane을 조사하고, evidence.json 및 markdown 아티팩트를 생성한다.
- 이번 런의 데이터 수집 소스는 GitHub 검색 결과이며 provenance 라벨은 direct page retrieval이다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 후보 승인 및 머지 | Advanced |
| Automation Operator | 크론/CI 신뢰성 관리 | Advanced |
| Contributor | 근거 기반 개선 제안 | Intermediate |

## Current Workarounds
1. lane별 쿼리를 수동 재시도하여 no-results 여부를 확인한다.
2. 결과가 많을 때 stars/signal 기준으로 수동 필터링한다.

## Adjacent Problems
- 체크 미보고(no checks reported) 상태에서 PR 누적 시 머지 정체가 발생한다.
- lane intent token 부재 저장소가 추천에 섞이는 위험이 있다.

## User Voices
- "rhysmcneill/agentic-ai-library: stars 3, license apache-2.0" — https://github.com/rhysmcneill/agentic-ai-library (provenance: direct page retrieval)
