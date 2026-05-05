# Platform Map
## What People Actually Use
- GitHub Search API(gh search repos)

## Frequency Ranking
1. agentic ai skill
2. web frontend skill
3. web backend skill
4. cli open source skill
5. game development skill

## Key Gaps
- lane별 검색 품질 편차

## Contradictions
- high-star지만 lane 토큰 부재 리포지토리

## Key Insight
- recovery query + intent gate를 함께 써야 추천 품질 안정화

## Settings
- 조사 범위: 최근 24시간~7일 중심, recovery는 최근 24개월 허용

## Rules
- raw_count==0 이면 stage1/2 복구 시도 필수 기록
- kept_count > raw_count 불가

## Hooks
- validator --platform-topic --require-provenance

## Platform Gaps
- 일부 lane는 no-results 가능
