# Context
## Workflow Context
- This run executed mandatory keyword families via GitHub REST fallback because web_search returned INVALID_API_KEY (indexed snippet + direct page retrieval mix).
- Evidence indicates many fresh-but-noisy repos with sparse stars and unknown licenses, especially in web frontend/backend lanes.

## Affected Users
- Maintainers reviewing hourly survey PRs.
- Downstream users relying on recommendation-grade keeps rather than raw discovery evidence.

## Current Workarounds
- Manual reviewer filtering for duplicates across lanes.
- Ad-hoc judgement on whether one repository can be counted in multiple lanes.

## Adjacent Problems
- Cross-lane concentration can look healthy by count while actual recommendation diversity is weak.
- No explicit rule for assigning one canonical lane when same repo appears in multiple mandatory lanes.

## User Voices
- direct page retrieval: https://github.com/akillness/oh-my-skills
- indexed snippet: GitHub search results for required keyword families captured in evidence.json
