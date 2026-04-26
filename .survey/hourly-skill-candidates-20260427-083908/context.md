# Context: hourly-skill-maintenance

## Workflow Context
Hourly automation loop: sync main -> run 5-lane survey sweep -> apply relevance gate -> ship one low-risk improvement/new addition via PR -> self-review -> merge.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repository maintainer | Reviews and trusts unattended hourly PR quality | advanced |
| Cron agent operator | Needs deterministic audit trail for degraded lanes | advanced |
| Skill consumers | Depend on up-to-date docs and stable survey heuristics | mixed |

## Current Workarounds
1. Manually inspect `gh search` reruns when lanes return zero results.
2. Infer recovery behavior from scattered logs instead of one lane transcript block.

## Adjacent Problems
- Open PR accumulation from prior hourly runs can hide which quality-ratchets actually landed.
- Query drift can look like ecosystem absence when retries are not summarized per lane.

## User Voices
- "Survey-based candidate search with evidence is mandatory every run."
- "PR flow should include review and merge when quality gate passes."

## Lane Health Snapshot
- agentic-ai-skill: lane_status=pass, kept_count=3, raw_count=20, median_stars_raw=0.0, zero_star_raw=12
- web-frontend-skill: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0.0, zero_star_raw=3
- web-backend-skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- cli-open-source-skill: lane_status=pass, kept_count=1, raw_count=1, median_stars_raw=9063, zero_star_raw=0
- game-development-skill: lane_status=pass, kept_count=3, raw_count=20, median_stars_raw=1.0, zero_star_raw=10
- recommended_lane_count=3
- single_lane_concentration=false
- Provenance: indexed snippet + direct page retrieval
