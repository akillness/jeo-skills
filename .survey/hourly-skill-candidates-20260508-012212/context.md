# Context: oh-my-skills hourly survey

## Workflow Context
This run executed the five mandatory lanes and recorded stage-1/recovery queries, lane health metrics, and recommendation gates. Provenance: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Review survey outputs and merge safe improvements | Advanced |
| Automation operator | Keep hourly cadence healthy under CI gaps | Intermediate |

## Current Workarounds
1. Manual inspection of JSON evidence for lane health and fit.
2. Ad-hoc recomputation of counts when recovery queries trigger.

## Adjacent Problems
- CI checks missing (`no checks reported`) blocks merge despite valid content.
- Lane token overlap may match noisy repos without negation-aware filtering.

## User Voices
- "maintenance보다 development 중심" — scheduler instruction (direct page retrieval)
- "no checks reported 상태면 머지하지 말고 blocker 코멘트" — scheduler instruction (direct page retrieval)
