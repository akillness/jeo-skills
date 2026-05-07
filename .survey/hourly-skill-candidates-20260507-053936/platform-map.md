## Settings
- 조사 lane: agentic ai skill / web frontend skill / web backend skill / cli open source skill / game development skill
- 기간 윈도우: pushed >= 2026-04-30

## Rules
- 추천은 stars>=3 또는 동등 신호 필요
- 24개월 freshness 미충족 시 low-fit
- negation intent 감지 시 기본 low-fit

## Hooks
- gh search repos --json fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount
- validator: --platform-topic --require-provenance

## Platform Gaps
- gh pr checks가 'no checks reported'를 반환하면 merge gate를 통과할 수 없음.
- 일부 lane은 검색 노이즈가 높아 recovery query 필요.
