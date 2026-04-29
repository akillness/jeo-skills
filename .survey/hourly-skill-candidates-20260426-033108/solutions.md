# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| guarinogabriel/Mac-CLI | cli open source skill | stars 9062 / license MIT | 최신 push 및 비아카이브 확인 | https://github.com/guarinogabriel/Mac-CLI (direct page retrieval) |
| abhixdd/ghgrab | cli open source skill | stars 828 / license MIT | 최신 push 및 비아카이브 확인 | https://github.com/abhixdd/ghgrab (direct page retrieval) |
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | agentic ai skill | stars 14 / license Apache-2.0 | 최신 push 및 비아카이브 확인 | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (direct page retrieval) |
| VoDaiLocz/Enhance-Prompt | agentic ai skill | stars 10 / license MIT | 최신 push 및 비아카이브 확인 | https://github.com/VoDaiLocz/Enhance-Prompt (direct page retrieval) |

## Categories
- 신규 스킬 후보 (existing skill 중복 없음)
- 기존 스킬 개선 후보 (existing skill 중복/인접 주제)
- 운영 안정성 개선 후보 (validator, fallback, provenance 규칙)

## What People Actually Use
- `gh search repos` + `gh api repos/...` 조합이 hourly 자동화에서 가장 재현 가능했다.
- 추천급 후보 선별은 `license + freshness + signal + fit` 4중 gate가 효과적이었다.

## Frequency Ranking
1. cli open source skill (kept 2)
2. agentic ai skill (kept 2)
3. web frontend skill (kept 0)
4. web backend skill (kept 0)
5. game development skill (kept 0)

## Key Gaps
- web frontend skill: degraded_causes=license,stale
- web backend skill: degraded_causes=thin evidence
- cli open source skill: degraded_causes=license,stale,low-fit
- game development skill: degraded_causes=license,stale,archived

## Contradictions
- 광범위 discovery(회수율)와 추천급 gate(정밀도) 사이의 trade-off가 존재함.

## Key Insight
- 키워드 lane 전체 커버리지를 유지하되, 추천 목록은 엄격한 gate로 분리해야 PR 품질이 안정적으로 유지된다.
