# Context: survey skill update relevance gate

## Workflow Context
`oh-my-skills`의 스킬 개선 루프는 검색 기반 후보 수집 → 근거 정리 → 개선안/신규안 분류 → 구현/PR 순서로 진행된다. 이때 검색 API/웹 검색이 불안정하면 GitHub 검색 API 직접 조회로 대체하게 되며, 이 경로에서 키워드 매칭만으로는 무관 저장소가 섞인다.

Provenance: direct page retrieval (SSL verification bypassed for metadata only)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| 리포 유지보수자 | 스킬 후보 채택/거절, PR 승인 | 중~상 |
| 자동화 에이전트 | 정기 조사/근거 수집/요약 보고 | 상 |
| 리뷰어 | 근거의 신뢰도/관련성 검증 | 중~상 |

## Current Workarounds
1. 스타 수가 높은 저장소를 우선 채택한다.
2. 수동으로 라이선스/최근 업데이트/아카이브 여부를 재확인한다.
3. 명백히 무관한 결과를 사람이 수동 제외한다.

## Adjacent Problems
- 검색 결과의 언어 혼합/스팸성 설명으로 자동 분류 정확도 하락
- 라이선스 누락 또는 장기 미업데이트 저장소가 상위 노출
- 증거 품질(직접 조회 vs 스니펫) 라벨링은 되어도 관련성 점수가 없음

## User Voices
- "검색은 됐는데 후보가 너무 섞여서 결국 사람이 다시 거른다" — 내부 유지보수 관찰
- "근거 링크는 있는데 왜 이게 우리 스킬 개선과 연결되는지 약하다" — PR 리뷰 피드백 패턴