# Context: oh-my-skills hourly survey

## Workflow Context
Hourly run must continue despite CI-check gaps while preserving auditable survey evidence per lane.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Merge and release | advanced |
| Agent operator | Run cron loops | intermediate |

## Current Workarounds
1. Manual inspection of evidence JSON and markdown headings.

## Adjacent Problems
- Recovery query attempts are not always auditable for zero-result lanes.

## User Voices
- "개발/발전 중심으로 실질 개선을 매 실행마다 시도" — scheduler directive (direct page retrieval)
