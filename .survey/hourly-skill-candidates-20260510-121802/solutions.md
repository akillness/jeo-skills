# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Contract validator script | Validate lane keys and recovery stage coverage | Prevents silent schema drift | Needs maintenance with schema changes | provenance: direct page retrieval |
| Carry-forward branch updates | Push artifacts to existing open PR branch | Avoids duplicate PR churn | Still blocked if checks absent | provenance: indexed snippet |
| Recovery-query policy | Always log stage-1 and stage-2 | Deterministic auditability | More artifact volume | provenance: feed recovery |

## Categories
- Validation hardening
- PR lifecycle hygiene
- Survey evidence governance

## What People Actually Use
In this repo, maintainers rely on GH CLI checks output and markdown audit bundle before merge.

## Frequency Ranking
1. No-checks-reported blocker handling
2. Evidence contract validation
3. Survey lane recovery fallback

## Key Gaps
- Missing in-repo hourly evidence contract validator script before this run.

## Contradictions
- Desire to merge hourly improvements quickly vs strict no-checks merge gate.

## Key Insight
Substantive value can still ship in blocked-check state by strengthening reusable automation scripts and attaching complete artifacts.
