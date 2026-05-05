# Context: hourly skill survey maintenance

## Workflow Context
시간별 자동 실행이 5개 필수 lane( agentic ai skill / web frontend skill / web backend skill / cli open source skill / game development skill )을 조회하고, recovery query까지 수행한 뒤 증적 아티팩트를 생성한다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 시간별 조사/PR 실행 및 품질 게이트 판단 | Advanced |
| Reviewer | 증적 무결성/재현성 확인 | Intermediate |

## Current Workarounds
1. 검색 결과가 없는 lane은 stage-1/stage-2 recovery query를 강제 기록한다.
2. 추천 후보는 token-overlap, negation guard, signal floor, license/freshness gate를 통과한 경우만 승격한다.

## Adjacent Problems
- GitHub 검색 노이즈로 lane intent 불일치 후보가 다수 유입됨
- stars/업데이트 시점만으로는 실제 적합도 판단이 어려움

## User Voices
- "agentic_ai_skill lane raw=6, kept=0, status=degraded" — evidence.json (provenance: direct page retrieval)
- "web_frontend_skill lane raw=1, kept=0, status=degraded" — evidence.json (provenance: direct page retrieval)
- "web_backend_skill lane raw=0, kept=0, status=degraded" — evidence.json (provenance: direct page retrieval)
- "cli_open_source_skill lane raw=0, kept=0, status=degraded" — evidence.json (provenance: direct page retrieval)
- "game_development_skill lane raw=7, kept=0, status=degraded" — evidence.json (provenance: direct page retrieval)
