# Context: Oh-My-Skills hourly survey maintenance

## Workflow Context
This run follows a survey-first hourly loop over five mandatory lanes, then packages artifacts into an existing open PR when open-PR gate is active. Evidence provenance uses indexed snippet and direct page retrieval labels for validator compatibility.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repository maintainer | Keep skill catalog improving each hour with safe merge gates | Advanced |
| Reviewer | Audit recommendation quality and provenance | Advanced |
| Cron operator | Ensure unattended runs do not deadlock on missing checks | Intermediate |

## Current Workarounds
1. Keep producing artifacts even when no checks are reported.
2. Post deterministic blocker comments instead of merging.
3. Carry improvements on existing open PR branches to avoid duplicate PR churn.

## Adjacent Problems
- Search-lane noise can over-promote low-fit repos.
- Missing recommendation-quality audits make stale/negation/personal-demo leakage harder to catch.

## User Voices
- "유지보수보다 개발/발전 중심" — system instruction (direct page retrieval)
- "no checks reported 상태면 머지하지 말고 blocker 코멘트" — system instruction (direct page retrieval)
