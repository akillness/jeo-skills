## Workflow Context
- The run executed the required 5 keyword families and persisted evidence in `evidence.json`.
- Candidate filtering currently keeps some low-transfer repos when term hits are present but freshness/license fit is weak.

## Affected Users
- Cron operators expecting high-signal recommendations per hour.
- Skill maintainers reviewing PRs for low-risk, merge-safe quality ratchets.

## Current Workarounds
- Manual reviewer filtering during PR review.
- Ad-hoc seed recovery queries and post-hoc risk notes.

## Adjacent Problems
- Keyword coverage can be complete while quality remains weak.
- Unknown-license and stale-pushed repos add review overhead.

## User Voices
- 'survey 방식 검색 기반 리서치 + 근거 링크 필수' 요구가 반복적으로 명시됨.
- '무리한 파괴적 변경 없이 PR로 개선하고 검증 후 머지' 운영 제약이 지속됨.

Provenance: browser-rendered retrieval; direct page retrieval.