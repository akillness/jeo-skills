# Context: oh-my-skills hourly survey

## Workflow Context
This run follows survey-first discovery across mandatory lanes using GitHub indexed snippet retrieval and staged recovery queries.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review candidate quality and merge safe improvements | advanced |
| Contributor | Reuse survey references/scripts in later runs | intermediate |

## Current Workarounds
1. Manual repo triage when lane relevance is noisy.
2. Manual blocker comments when no checks reported.

## Adjacent Problems
- License metadata drift between search payload variants.
- Lane intent false positives from generic personal repos.

## User Voices
- "Survey-first는 유지하되, 단순 오탈자/경미 문장수정만으로 PR을 채우지 말 것." — scheduler policy (direct page retrieval)
