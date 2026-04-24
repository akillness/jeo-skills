## Workflow Context
- Required five keyword lanes were executed with lane-specific recovery when sparse/noisy.
- Evidence and candidate metadata were persisted under this run directory.

## Affected Users
- Hourly cron operators who need predictable recommendation quality.
- Reviewers who must decide merge/no-merge quickly from artifacts.

## Current Workarounds
- Ad-hoc reviewer judgement when a lane has <1 strong keep candidate.
- Manual interpretation of noisy hits without explicit lane pass/fail labels.

## Adjacent Problems
- Coverage can be complete while recommendation quality is uneven by lane.
- CLI lane requires 3+ spotlight candidates but existing rules do not force explicit lane deficiency reporting.

## User Voices
- "survey 방식 검색 기반 리서치 + 근거 링크" requirement is explicit.
- "검증 실패 시 머지 금지" requires deterministic gate output.

Provenance: browser-rendered retrieval; direct page retrieval.
