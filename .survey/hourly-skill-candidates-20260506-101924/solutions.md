# Solution Landscape: Hourly Skill Candidate Sweep

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | agentic ai skill candidate | stars=16, license=apache-2.0 | freshness/intent gate 통과 | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill |
| nexu-io/open-design | cli open source skill candidate | stars=27695, license=apache-2.0 | freshness/intent gate 통과 | https://github.com/nexu-io/open-design |
| tjboudreaux/cc-plugin-unity-gamedev | game development skill candidate | stars=3, license=mit | freshness/intent gate 통과 | https://github.com/tjboudreaux/cc-plugin-unity-gamedev |

## Categories
- Agentic AI
- Web Frontend
- Web Backend
- CLI OSS
- Game Development

## What People Actually Use
GitHub star/activity/license가 확인되는 저장소 중심으로 추천 등급을 부여한다. provenance는 indexed snippet + feed recovery로 표시한다.

## Frequency Ranking
1. lane별 raw_count가 높은 영역 우선
2. kept_count가 있는 lane 우선

## Key Gaps
- 일부 lane은 low-fit/no-results로 degraded 가능
- checks 부재 시 merge 중단 필요

## Contradictions
- 검색결과는 많지만 intent overlap이 부족한 경우 추천 불가

## Key Insight
검색 리콜은 유지하되 추천 승격은 signal-floor + intent/freshness/license gate를 통과한 항목만 허용해야 hourly 품질이 안정된다.

Provenance: indexed snippet, feed recovery
