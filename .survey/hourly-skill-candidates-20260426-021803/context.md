## Workflow Context
- 매 실행마다 5개 키워드 lane을 동일하게 스캔하고, relevance gate(license/stale/archived/signal/fit)를 적용.
- 근거 수집은 GitHub 검색 결과(indexed snippet) + repo 메타데이터 조회(direct page retrieval)로 이중화.

## Affected Users
- 스킬 유지보수 담당자: 신규 스킬 추가와 기존 스킬 보강 포인트 선별 필요.
- 리뷰어: PR 병합 전 리스크/롤백/검증 근거 확인 필요.

## Current Workarounds
- lane별 raw 후보를 넓게 수집 후, recommendation-grade 후보만 keep.
- 검색 노이즈가 큰 lane은 recovery query로 1회 보강.

## Adjacent Problems
- 특정 lane 편중(single-lane concentration) 발생 가능.
- 저신호(0-star) 결과 급증 시 추천 품질 저하.

## User Voices
- 운영 요구사항: survey 기반 근거 링크 필수, 무근거 추측 금지.
- 운영 요구사항: 검증 실패 시 머지 금지.

- Provenance labels used: indexed snippet, direct page retrieval
