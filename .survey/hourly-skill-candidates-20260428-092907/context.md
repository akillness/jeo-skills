# Context: hourly-skill-candidates

## Workflow Context
This cron run performed the mandatory five keyword families and applied recovery on sparse lanes. Evidence and lane metrics were written to `.survey/hourly-skill-candidates-20260428-092907/evidence.json`. (indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep survey quality gates stable and merge-safe | Advanced |
| PR reviewer | Validate evidence/provenance and lane status | Intermediate |
| Automation operator | Ensure hourly job remains deterministic | Intermediate |

## Current Workarounds
1. Use lane recovery queries when primary results are sparse/noisy. (feed recovery)
2. Re-check missing license values through `gh repo view` and REST fallback. (direct page retrieval)
3. Preserve degraded lane evidence instead of forcing weak recommendations. (indexed snippet)

## Adjacent Problems
- Overly strict metadata parsing can misclassify healthy repositories as unknown-license.
- Single-lane concentration can hide weak coverage across required lanes.
- Sparse web lanes may need improved stage-2 query templates.

## User Voices
- "Hourly runs must remain PR-merge-safe with explicit degraded causes." — automation policy
- "Keep recommendation-grade gates strict but preserve discovery evidence." — survey contract
