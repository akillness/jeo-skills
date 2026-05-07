# Context: oh-my-skills hourly survey

## Workflow Context
This run followed open-PR hard gate first, then updated the existing PR branch with a new survey package. Candidate discovery used GitHub indexed results and lane recovery queries (provenance: indexed snippet, feed recovery).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Merge and quality control of hourly survey PRs | Advanced |
| Skill contributors | Review recommendation fit and guardrails | Intermediate |
| Automation operator | Keep unattended cron loop healthy | Advanced |

## Current Workarounds
1. Keep committing hourly artifacts to existing open PR when checks are absent.
2. Post blocker comment with deterministic remediation steps for CI/checks.

## Adjacent Problems
- Missing check wiring on some branches creates merge deadlocks.
- Token-overlap alone can admit weak-fit repos without negation/generic guards.

## User Voices
- "no checks reported on the branch" — gh pr checks output (indexed snippet)
- "must not create a new PR while one is open" — run policy guardrail (direct page retrieval)
