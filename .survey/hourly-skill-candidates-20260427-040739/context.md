# Context: oh-my-skills hourly survey

## Workflow Context
- Run slug: hourly-skill-candidates-20260427-040739
- Run time (UTC): 2026-04-26T19:07:39Z
- Mode: repo-maintenance hourly keyword sweep.
- Retrieval: gh search repo listings (indexed snippet) with metadata extraction (direct page retrieval equivalent).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Accept/merge hourly maintenance PRs | advanced |
| Reviewer | Verify evidence quality and risk notes | advanced |
| Automation operator | Monitor cron reliability and degraded lanes | intermediate |

## Current Workarounds
1. Accept lane pass decisions primarily from kept_count thresholds.
2. Manually inspect lane metrics when zero-star saturation appears.
3. Patch run-specific reports after reviewer feedback.

## Adjacent Problems
- High lexical match volume can hide weak recommendation quality.
- Lane health can appear good while traction remains near zero.
- Cross-run comparability degrades when pass/degraded decisions are inconsistent.

## User Voices
- "Keep the run deterministic for unattended cron loops." — maintainer requirement
- "Report degraded causes explicitly rather than claiming healthy coverage." — reviewer expectation
- "Use validator-compatible provenance labels in markdown." — survey validator contract
