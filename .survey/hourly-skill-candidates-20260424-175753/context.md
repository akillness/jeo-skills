# Context: oh-my-skills hourly candidate survey

## Workflow Context
- Run type: repo-maintenance survey before implementation.
- Evidence method: GitHub native search/API (`gh search repos`).
- Provenance label: direct page retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Vet, update, merge skills safely | advanced |
| Agent operators | Reuse reliable skill playbooks | intermediate |

## Current Workarounds
1. Ad-hoc keyword scans without consistent metadata gate.
2. Manual candidate curation without standardized provenance labels.

## Adjacent Problems
- Duplicate proposals when existing skills are not checked first.
- Risk of noisy keyword-only matches.

## User Voices
- "후보 탐색은 반드시 survey 방식의 검색 기반 리서치" — scheduled job requirement
- "검증 실패 시 머지하지 말고 원인/대응안 보고" — scheduled job requirement
