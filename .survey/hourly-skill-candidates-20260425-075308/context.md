# Context
## Workflow Context
- Mandatory five-lane sweep executed (`agentic`, `frontend`, `backend`, `cli`, `game`) with recovery queries when sparse/noisy.
- Recommendation-grade keeps applied with freshness + signal floors from survey policy.
- Provenance labels present in markdown: direct page retrieval.

## Affected Users
- Repository maintainers relying on hourly automation for skill updates.
- Reviewers who need compact lane-health metrics for merge decisions.

## Current Workarounds
- Manual inspection of zero-result lanes and ad-hoc query retries.
- Re-running hourly jobs until enough candidates appear.

## Adjacent Problems
- Overly strict backend recovery query can repeatedly return zero hits.
- Lane degradation taxonomy exists, but second-stage recovery trigger is not explicitly codified in reference docs.

## User Voices
- “survey 방식의 검색 기반 리서치” must remain mandatory each run.
- “검증 실패 시 머지하지 말고 원인/대응안을 보고” requires deterministic quality gates.

## Provenance
- direct page retrieval
