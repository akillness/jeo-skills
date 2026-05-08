# Context: oh-my-skills hourly survey loop

## Workflow Context
The cron loop runs mandatory five-lane discovery and should prioritize development/procedural improvements over formatting-only maintenance. This run operated in carry-forward mode because an open PR already existed. Provenance: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Review and merge quality-gated hourly updates | Advanced |
| Automation operator | Keep unattended loop deterministic and auditable | Advanced |

## Current Workarounds
1. Manually inspect open PR list and run checks before deciding whether to open a new PR.
2. Post ad-hoc blocker comments when checks are missing.

## Adjacent Problems
- Lane quality can degrade unevenly across mandatory keywords.
- Missing CI checks on hourly branches block merge decisions.

## User Voices
- "open PR이 이미 있으면 먼저 해당 PR 상태를 정리하고, 중복 PR 생성 지양." — run policy
- "체크 미구성/no checks reported 상태면 머지하지 말고 blocker 코멘트" — run policy
