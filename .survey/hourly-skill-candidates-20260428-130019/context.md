# Context: oh-my-skills hourly survey

## Workflow Context
Five mandatory keyword families were queried via GitHub search fallback (indexed snippet, direct page retrieval).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review and merge improvements | advanced |
| Automation operator | Keep loop healthy | advanced |

## Current Workarounds
1. Fallback to gh search when web_search path is unavailable.
2. Keep strict metadata gates (signal/fresh/license/archive).

## Adjacent Problems
- Noisy broad matches can overwhelm recommendation quality.
- Artifact schema drift can break downstream steps.

## User Voices
- "PR 기반으로 매 시간 개선/신규 스킬을 처리하고 근거를 남겨라." — scheduler directive (direct page retrieval)
