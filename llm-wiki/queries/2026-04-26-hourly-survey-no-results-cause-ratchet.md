# Hourly survey `no-results` degraded-cause ratchet

## Context
이번 시간대 mandatory 5-lane survey에서 lane별 `lane_status/degraded_causes`를 집계했고, reviewer가 `raw_count == 0` 상태를 명확히 구분할 수 있도록 taxonomy 보강 필요성이 확인되었다.

## Evidence
- Survey slug: `hourly-skill-candidates-20260426-013332`
- Evidence JSON: `.survey/hourly-skill-candidates-20260426-013332/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260426-013332/rtk-summary.md`
- Graphify fallback refined: `.survey/hourly-skill-candidates-20260426-013332/graphify-refined.json`
- Graphify query error captured: `error: could not load graph: 'links'`

## Insight
- `degraded_causes` taxonomy에 `no-results`를 포함하면, sparse/noisy lane 중에서도 **검색 결과 부재**를 별도 축으로 분리해 triage 자동화를 안정화할 수 있다.
- 이는 `license/stale/low-fit/archived/low-signal`과 상보적이며, `raw_count == 0` 시 원인 누락(빈 taxonomy)을 방지한다.

## Proposed repo hardening
1. survey SKILL 문서의 degraded-cause taxonomy에 `no-results` 추가.
2. SKILL.toon 규칙/절차의 taxonomy를 동일하게 동기화.
3. eval 케이스 추가: stage-2 이후에도 `raw_count==0`이면 `no-results`를 명시해야 PASS.

## Provenance
- indexed snippet
- direct page retrieval
