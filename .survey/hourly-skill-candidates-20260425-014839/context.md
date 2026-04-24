# Context: hourly skill candidates 2026-04-25

## Workflow Context
Hourly cron loop performs survey-first discovery before any skill edits. Current run uses GitHub-native retrieval due reliability in unattended mode. (direct page retrieval)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Decide merge/no-merge for skill updates | Advanced |
| Automation agent | Collect evidence and update skill docs safely | Advanced |
| Skill consumers | Reuse improved survey process in later runs | Intermediate |

## Current Workarounds
1. Fallback to `gh search repos` and GitHub metadata when generic web retrieval is degraded. (direct page retrieval)
2. Apply metadata gate to filter noisy keyword hits.

## Adjacent Problems
- Broad queries still produce domain-drift candidates.
- Candidate metadata may be incomplete (e.g., missing license).

## User Voices
- "Need PR-based hourly improvement with evidence links and safe merge gates." — cron directive
- "Survey 방식의 검색 기반 리서치로 근거 수집" — job policy
