# Context: oh-my-skills hourly survey

## Workflow Context
The run executes five mandatory discovery lanes, applies recovery queries for empty lanes, classifies recommendation-grade keeps, and packages artifacts for PR review. Provenance: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Review and merge quality-gated PRs | Advanced |
| Automation operator | Monitor hourly run health and blockers | Intermediate |

## Current Workarounds
1. Continue updates on existing open PR when checks are missing.
2. Record blocker comments with CI bootstrap steps.

## Adjacent Problems
- False positives from token-only matches without lane intent.
- License/freshness metadata inconsistencies across search payloads.

## User Voices
- "유지보수보다 개발/발전 중심" — scheduler instruction
- "no checks reported 상태면 머지하지 말 것" — scheduler instruction
