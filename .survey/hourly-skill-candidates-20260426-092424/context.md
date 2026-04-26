# Context: oh-my-skills hourly maintenance

## Workflow Context
Hourly cron executes survey-first discovery, then turns validated evidence into low-risk skill/docs improvements and PR lifecycle decisions.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Approve/review/merge PRs | Intermediate |
| Automation agent | Run survey + artifact pipeline hourly | Advanced |
| Contributors | Submit skill updates and examples | Intermediate |

## Current Workarounds
1. agentic ai skill: use GitHub-native sweep + metadata gating when web search is noisy. (provenance: indexed snippet, direct page retrieval)
1. web frontend skill: use GitHub-native sweep + metadata gating when web search is noisy. (provenance: indexed snippet, direct page retrieval)
1. web backend skill: use GitHub-native sweep + metadata gating when web search is noisy. (provenance: indexed snippet, direct page retrieval)
1. cli open source skill: use GitHub-native sweep + metadata gating when web search is noisy. (provenance: indexed snippet, direct page retrieval)
1. game development skill: use GitHub-native sweep + metadata gating when web search is noisy. (provenance: indexed snippet, direct page retrieval)

## Adjacent Problems
- agentic ai skill: lane_status=pass, kept_count=3, raw_count=20
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=4
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0
- cli open source skill: lane_status=degraded, kept_count=1, raw_count=1
- game development skill: lane_status=pass, kept_count=1, raw_count=20

## User Voices
- "검색 결과가 잡음이 많아 후보 신뢰도를 유지하기 어렵다." — recurring hourly lane diagnostics (provenance: indexed snippet)
- "라이선스/최근 업데이트 메타데이터가 없으면 PR 추천 근거가 약하다." — maintainer quality gate notes (provenance: direct page retrieval)
