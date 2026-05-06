# Context: oh-my-skills hourly survey loop

## Workflow Context
- 매 1시간마다 5개 lane 키워드 스윕을 실행하고, relevance gate로 추천 후보를 정제한다.
- 검색 결과는 `.survey/hourly-skill-candidates-20260506-043144/evidence.json`에 보관하며, markdown 요약에는 validator 허용 provenance 라벨을 포함한다.
- 이번 런은 GitHub 검색 기반으로 수집되었고, lane 상태를 `pass|degraded`로 기록했다. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | 스킬 품질/가드레일 업데이트 및 PR 승인 | advanced |
| Automation operator | 크론 안정성/체크 상태 모니터링 | advanced |

## Current Workarounds
1. lane 노이즈가 많을 때 stage recovery query를 적용한다.
2. 체크 부재 시 merge를 보류하고 blocker를 PR에 남긴다.

## Adjacent Problems
- gh 검색 필드 드리프트로 인한 스키마 불일치
- 낮은 신호(저별점/무면허) 저장소 과대표집

## User Voices
- "제안-only로 끝내지 말고 실제 변경/PR까지 수행" — 운영 요구사항
- "모든 근거는 링크와 함께 남길 것" — 운영 요구사항
