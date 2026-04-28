# Context: oh-my-skills hourly survey

## Workflow Context
This run executes mandatory survey lanes, applies relevance/safety filters (license, freshness, intent), and selects recommendation-grade candidates for skill updates. Evidence is generated from GitHub search metadata and stored in evidence.json (indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Curate skill quality and merge safe PRs | Advanced |
| Automation operator | Keep hourly loop reliable | Intermediate |
| Skill consumer | Reuse accurate workflows | Mixed |

## Current Workarounds
1. Manual ad-hoc repo browsing without lane coverage guarantees (thin evidence).
2. One-off updates without provenance trail in survey artifacts.

## Adjacent Problems
- Candidate quality drift when intent overlap is not enforced.
- Recommending stale projects by checking presence of pushedAt rather than age.

## User Voices
- "Need PR-based improvements plus review and merge in one loop." — scheduled job requirement (direct page retrieval)
- "Must use survey-based search and evidence links." — operating policy (direct page retrieval)
