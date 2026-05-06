# Context: hourly skill candidate survey

## Workflow Context
매 1시간마다 5개 lane(agentic ai/web frontend/web backend/cli OSS/game development)을 GitHub 인덱스 기반으로 조회하고, recovery 쿼리를 포함해 evidence를 누적한다. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | survey 품질/PR 병합 판단 | Advanced |
| Cron Operator | 무인 실행 안정성 보장 | Advanced |

## Current Workarounds
1. no-checks PR 누적 시 수동 triage
2. lane별 잡음 결과를 수동 필터링

## Adjacent Problems
- license 필드 shape 차이로 인한 오탐 degraded
- lane 토큰 중복/negation 문구로 인한 low-fit 오검출

## User Voices
- "rhysmcneill/agentic-ai-library는 agentic ai skill lane 추천 후보로 유지됨" — https://github.com/rhysmcneill/agentic-ai-library (provenance: indexed snippet)
