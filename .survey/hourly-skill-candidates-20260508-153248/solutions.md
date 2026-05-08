# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | keyword+recovery | raw 30 | degraded none | top keep: iwe-org/skills |
| web-frontend-skill | keyword+recovery | raw 5 | degraded license,low-signal,stale | top keep: none |
| web-backend-skill | keyword+recovery | raw 1 | degraded low-fit | top keep: none |
| cli-open-source-skill | keyword+recovery | raw 1 | degraded none | top keep: nexu-io/open-design |
| game-development-skill | keyword+recovery | raw 30 | degraded none | top keep: tjboudreaux/cc-plugin-unity-gamedev |

## Categories
- Discovery lanes: agentic/web frontend/web backend/cli/game development.
- Validation lanes: evidence contract, survey artifact headings, provenance.

## What People Actually Use
- GitHub search indexed snippets for broad candidate recall.
- Direct page retrieval for PR/check state and remediation evidence.

## Frequency Ranking
1. Indexed snippet discovery and filtering by lane intent/signal/freshness.
2. Contract validators (`validate_hourly_evidence_contract.py`, `validate_survey_artifacts.py`).
3. PR blocker comments for no-checks conditions.

## Key Gaps
- Some lanes still degrade due to low-fit or stale/no-license candidates.
- CI checks are not reported on active PR branch.

## Contradictions
- Broad recall wants many candidates, while recommendation gates intentionally exclude low-signal/no-fit repos.

## Key Insight
Recommendation concentration is acceptable this run (`recommended_lane_count` = 3), but degraded lanes remain explicit for reviewer triage. Provenance: indexed snippet.
