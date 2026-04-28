# RTK Summary

- 목표: 시간당 스킬/서베이 루프 품질 유지 및 PR 머지.
- 이번 실행에서는 `web_search`가 `INVALID_API_KEY`로 전면 실패하여 검색 전송계층이 degraded 상태였음.
- 대체 수집 경로로 `gh api search/repositories`를 사용해 증거 링크를 확보.
- 기존 carry-forward 대상(PR #208)은 `mergeStateStatus=DIRTY`로 자동 머지 불가.
- 저위험 ratchet 후보: survey 스킬에 `transport_status.web_search.error_tag` 및 `request_ids[]` 기록 규칙 추가.
- 기대효과: 동일 장애 재발 시 run 간 상관관계 추적성 향상, 장애 원인 triage 시간 단축.
