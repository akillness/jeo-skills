# Context: oh-my-skills hourly survey maintenance

## Workflow Context
Hourly cron run executes five mandatory keyword lanes, records evidence.json, validates markdown headings/provenance, and prepares PR lifecycle actions. Provenance label: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Review PR and merge policy | advanced |
| Automation operator | Monitor failed/no-check runs | intermediate |

## Current Workarounds
1. Manual re-query by lane when zero results occur.
2. Human filtering of low-fit repos after raw discovery.

## Adjacent Problems
- CI checks not reported can block merge decisions.
- Search metadata shape differences can misclassify license status.

## User Voices
- "매 1시간마다 ... PR 생성 → 품질 게이트 통과 시 merge까지 완료" — job instruction (direct page retrieval)
