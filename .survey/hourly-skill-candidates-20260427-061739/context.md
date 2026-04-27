# Context: hourly skill-candidate reliability

## Workflow Context
The hourly loop performs candidate discovery, then applies quality gates before skill updates and PR merge. In this run, the initial web search path failed with `INVALID_API_KEY`; the loop continued using `gh search repos` + `gh api` as fallback. Provenance labels used in artifacts: `direct page retrieval`, `indexed snippet`.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Cron maintainer | Keep hourly survey+PR loop merge-safe | advanced |
| Repo reviewer | Validate evidence quality and degraded causes | advanced |
| Downstream skill users | Rely on stable skill updates from merged PRs | mixed |

## Current Workarounds
1. On web transport failure, run GitHub-native retrieval (`gh search repos`, `gh api repos/<owner>/<repo>`).
2. Preserve fallback output under `.survey/<slug>/evidence.json` and `loop-results.md`.
3. Continue with lane-level metrics (`kept_count`, `raw_count`, `median_stars_raw`, `zero_star_raw`) instead of aborting the run.

## Adjacent Problems
- Noisy keyword hits create apparent false positives unless relevance gates are strict.
- Some lanes degrade from sparse discovery (`raw_count < 8`) even when fallback transport is healthy.
- If transport degradation is not recorded explicitly, reviewers cannot distinguish ecosystem sparsity vs tooling outage.

## User Voices
- "Error searching web: ... INVALID_API_KEY" — web_search tool output (direct page retrieval)
- "Guard for GH CLI JSON-field drift ... preserve stderr in evidence" — survey skill contract (direct page retrieval)
- "Switch to GitHub-native retrieval on degraded search" — survey reference guide (direct page retrieval)
