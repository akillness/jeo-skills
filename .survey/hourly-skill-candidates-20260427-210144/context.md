# Context: oh-my-skills hourly survey maintenance

## Workflow Context
The cron loop must run five fixed keyword families, apply relevance gating, and ship merge-ready PR artifacts every hour. This run executed all lanes and produced recommendation-grade keeps in only two lanes, with deterministic degradation in the other three lanes. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Cron maintainer | Keep survey loop green and merge-safe | advanced |
| Reviewer | Verify evidence quality and lane-status claims | advanced |
| Skill consumers | Reuse updated survey guardrails in future runs | intermediate |

## Current Workarounds
1. Keep degraded lane evidence and report `degraded_causes` instead of forcing weak recommendations. (provenance: indexed snippet)
2. Use lane-specific recovery templates and stage-2 escalation when lane conditions trigger. (provenance: direct page retrieval)
3. Merge low-risk documentation ratchets to tighten deterministic behavior before code-level changes. (provenance: direct page retrieval)

## Adjacent Problems
- Lane template asymmetry: game lane has stage-1 recovery guidance but no explicit stage-2 escalation query.
- Repeated no-results lanes can create false stability if not explicitly ratcheted.
- Transport and schema fragility require strong artifact/validator discipline.

## User Voices
- "Run the five mandatory keyword families every hour and merge only after quality gates." — automation policy
- "If validation fails, do not merge; report root cause and 대응안." — automation policy
