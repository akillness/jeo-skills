# Solution Landscape: hourly skill survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic_ai_skill | query + relevance gates | kept=5/raw=30 | degraded=none | top=AbdelhakRazi/flutter-bloc-clean-architecture-skill |
| web_frontend_skill | query + relevance gates | kept=0/raw=5 | degraded=low-fit | top=- |
| web_backend_skill | query + relevance gates | kept=0/raw=0 | degraded=no-results | top=- |
| cli_open_source_skill | query + relevance gates | kept=1/raw=1 | degraded=none | top=guarinogabriel/Mac-CLI |
| game_development_skill | query + relevance gates | kept=1/raw=30 | degraded=none | top=tjboudreaux/cc-plugin-unity-gamedev |

## Categories
- discovery evidence
- recommendation-grade keeps
- degraded lane triage

## What People Actually Use
이번 런은 `gh search repos` 기반 indexed snippet 수집과 stage recovery(feed recovery) 조합을 사용했다.

## Frequency Ranking
1. indexed snippet
2. feed recovery
3. direct page retrieval

## Key Gaps
- 일부 lane은 primary query가 0건이라 recovery 의존성이 높음

## Contradictions
- broad recall을 유지하면 low-fit가 증가하고 precision이 하락함

## Key Insight
open PR-first 운영에서 checks 미보고 상태라도 아티팩트 누적은 가능하며, 병합만 엄격히 차단하면 cadence와 안전성을 동시에 유지할 수 있다.
