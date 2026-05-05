# Context: hourly skill candidate sweep

## Workflow Context
매 1시간마다 5개 lane 키워드 스윕을 수행하고, 추천 후보를 근거와 함께 정리한다. lane별 노이즈/희소성 차이가 커서 recovery 및 degraded 분류가 필수다. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agentic AI | 스킬 큐레이션/유지 | 중급 |
| Web Frontend | 스킬 큐레이션/유지 | 중급 |
| Web Backend | 스킬 큐레이션/유지 | 중급 |
| CLI OSS | 스킬 큐레이션/유지 | 중급 |
| Game Dev | 스킬 큐레이션/유지 | 중급 |

## Current Workarounds
1. broad query 결과를 수작업으로 추려 추천 후보를 선별한다. (provenance: indexed snippet)
2. lane가 비거나 노이즈가 클 때 임시 쿼리로 보완한다. (provenance: feed recovery)

## Adjacent Problems
- 추천 후보가 단일 lane에 집중되면 커버리지 건강도가 왜곡된다. (provenance: indexed snippet)
- stale/low-signal 저장소가 추천으로 섞일 수 있다. (provenance: direct page retrieval)

## User Voices
- "agentic_ai_skill lane raw=30, kept=4" — indexed snippet
- "web_frontend_skill lane raw=5, kept=1" — indexed snippet
- "web_backend_skill lane raw=1, kept=0" — indexed snippet
- "cli_open_source_skill lane raw=1, kept=1" — indexed snippet
- "game_development_skill lane raw=30, kept=4" — indexed snippet
