# Context: hourly-skill-candidates

## Workflow Context
Hourly cron run performs survey-first candidate discovery, then implements bounded changes via PR+self-review+merge. This run used required five keyword families and GitHub-native retrieval (`direct page retrieval`) with metadata gating.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repository maintainer | Keep skill corpus current and reliable | advanced |
| Cron operator | Ensure unattended loop remains deterministic | advanced |
| Skill consumers | Reuse curated external skill patterns safely | mixed |

## Current Workarounds
1. Manually eyeballing sparse keyword lanes and guessing whether ecosystem is empty.
2. Repeating ad-hoc recovery queries without a consistent stage transcript.
3. Tracking external skill candidates in scattered notes instead of checked-in docs.

## Adjacent Problems
- Sparse/no-result lanes can hide query-quality issues (`no-results` vs true ecosystem absence).
- Inconsistent lane recovery staging lowers comparability across hourly runs.
- New candidate discoveries are lost if not materialized into repo docs.

## User Voices
- "Hourly repo-maintenance needs survey-based evidence and merge-safe updates." — scheduled-job requirement (direct page retrieval)
- "Mandatory keyword families must run every cycle." — survey contract (direct page retrieval)
