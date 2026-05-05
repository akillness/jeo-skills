# Context: oh-my-skills hourly survey

## Workflow Context
- 5개 필수 lane를 GitHub 검색으로 수집 후 recovery 게이트를 수행했다. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | skill 큐레이션/병합 | Advanced |
| Automation runner | 시간별 수집/검증 | Intermediate |

## Current Workarounds
1. 단일 키워드 검색으로 후보를 수집해 lane 편향 가능성이 높다.

## Adjacent Problems
- checks 미보고(no checks reported) 시 병합 블로킹 처리 필요

## User Voices
- "survey-first로 후보를 찾고 실제 변경+PR+merge까지" — run policy (direct page retrieval)