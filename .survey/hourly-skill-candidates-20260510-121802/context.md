# Context: oh-my-skills hourly survey

## Workflow Context
The run executed mandatory five lanes and recovery stages using GitHub search API outputs. Provenance labels used: indexed snippet, feed recovery, direct page retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Reviews hourly PR evidence and merge gates | Advanced |
| Automation operator | Monitors blocked checks and CI bootstrap | Intermediate |

## Current Workarounds
1. Continue updating existing open PR branch when open-PR gate is active.
2. Post blocker comments for no-checks-reported state.

## Adjacent Problems
- Contract drift between evidence schema and validator assumptions.
- Missing deterministic checks for recovery stage coverage.

## User Voices
- "유지보수보다 개발/발전 중심" — scheduler policy
- "no checks reported 상태면 머지 금지" — scheduler policy
