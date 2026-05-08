# Context: hourly skill candidate survey run

## Workflow Context
- Open-PR gate active: updates are appended to existing PR branch.
- Mandatory lanes executed with stage-0/1/2 recovery metadata.
- Provenance labels used: indexed snippet, direct page retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Merge safe hourly improvements | Advanced |
| Reviewer | Verify evidence quality and gates | Advanced |

## Current Workarounds
1. Carry forward commits onto the existing open PR when checks are missing.
2. Keep blocker comments with deterministic remediation steps.

## Adjacent Problems
- CI bootstrap ambiguity for repos with no reported PR checks.
- Candidate lanes can concentrate in one domain without explicit cross-lane guarding.

## User Voices
- "Prioritize development/progression over pure maintenance wording updates." — run policy
