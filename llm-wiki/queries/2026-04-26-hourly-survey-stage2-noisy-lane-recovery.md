# Hourly survey stage2 noisy-lane recovery note

## Context
- Run slug: `hourly-skill-candidates-20260426-125227`
- Recommended lanes: 4
- Recommendation total: 18

## Lane health snapshot
| lane | status | kept/raw | degraded_causes |
|---|---:|---:|---|
| agentic-ai-skill | pass | 31/70 | license, low-signal |
| web-frontend-skill | pass | 5/23 | license, low-signal, stale |
| web-backend-skill | degraded | 0/6 | license, low-fit, stale |
| cli-open-source-skill | pass | 8/9 | license, stale |
| game-development-skill | pass | 1/35 | archived, license, low-signal, stale |

## Observation
- `web-backend-skill` remained degraded (`kept_count=0`) even after recovery, while other lanes passed.
- Existing survey policy already enforces deterministic stage-2 when `kept_count==0`; evidence suggests backend lane needs stronger rescue templates to reduce recurring degradation.

## Artifacts
- Survey evidence: [evidence.json](../../.survey/hourly-skill-candidates-20260426-125227/evidence.json)
- RTK summary: [rtk-summary.md](../../.survey/hourly-skill-candidates-20260426-125227/rtk-summary.md)
- Graphify fallback: [graphify-refined.json](../../.survey/hourly-skill-candidates-20260426-125227/graphify-refined.json)

## Provenance
- indexed snippet (GitHub search results)
- direct page retrieval (metadata from candidate repository pages via GitHub API where needed)
