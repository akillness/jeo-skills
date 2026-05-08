# Context: oh-my-skills hourly survey maintenance

## Workflow Context
The hourly run performs mandatory five-lane discovery, builds `.survey/<slug>` artifacts, validates required headings/provenance, and updates the existing open PR branch when open-PR gate is active. Provenance labels used: indexed snippet and feed recovery.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Merge survey improvements safely | Advanced |
| Reviewer | Audit recommendation quality and provenance | Intermediate |
| Automation operator | Keep hourly runs non-interactive | Advanced |

## Current Workarounds
1. Keep creating artifacts even when checks are missing.
2. Post blocker comments with deterministic CI bootstrap steps.
3. Avoid merge until checks are present and green.

## Adjacent Problems
- Lane quality metrics can drift if computed from different subsets.
- Open PR backlog can accumulate without consistent blocker messaging.

## User Voices
- "Survey-first는 유지하되 단순 문장수정만으로 PR을 채우지 말 것" — operator requirement
- "체크 미구성(no checks reported) 상태면 머지하지 말고 blocker 코멘트" — operator requirement

Provenance: indexed snippet, thin evidence
