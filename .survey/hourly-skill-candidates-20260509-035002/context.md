# Context: hourly skill candidate survey

## Workflow Context
This run executed mandatory five lanes and recorded stage-1/stage-2 recovery queries per lane. Provenance labels: indexed snippet, direct page retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review candidate quality and merge PRs | advanced |
| Contributor | Implement new skill/reference updates | intermediate |

## Current Workarounds
1. Continue committing artifacts to existing open PR branch when checks are missing.
2. Use deterministic degraded_causes taxonomy for triage.

## Adjacent Problems
- Missing CI checks prevents merge.
- Candidate lanes can be noisy without intent gating.

## User Voices
- "no checks reported" blocker appears on carry-forward PR branches — direct page retrieval.
