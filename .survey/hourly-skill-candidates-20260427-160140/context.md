# Context: hourly-skill-candidates

## Workflow Context
The hourly job executed mandatory survey lanes using GitHub search and applied quality gates (license, freshness <=24 months, non-archived, signal floor, intent overlap, negation-aware checks). Provenance labels used: direct page retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review and merge quality-gated PRs | Advanced |
| Automation operator | Keep recurring run stable | Intermediate |
| Skill contributor | Add/refresh skill docs safely | Intermediate |

## Current Workarounds
1. Manual lane interpretation when noisy search results dominate.
2. Ad-hoc checks for stale/license-missing repos.

## Adjacent Problems
- PR loops can overstate coverage when recommendations cluster in too few lanes.
- Missing structured storage for run evidence reduces reproducibility.

## User Voices
- "Survey artifacts must include provenance and deterministic quality gates." — automation policy (provenance: direct page retrieval)
- "No destructive edits; include rollback plan." — merge governance (provenance: direct page retrieval)

## Lane Health Snapshot
- agentic-ai: raw=40, kept=3, median_stars=0, status=pass, causes=license,low-signal (provenance: direct page retrieval)
- web-frontend: raw=4, kept=0, median_stars=0, status=degraded, causes=license,low-signal,stale (provenance: direct page retrieval)
- web-backend: raw=1, kept=0, median_stars=7522, status=degraded, causes=license,stale (provenance: direct page retrieval)
- cli-open-source: raw=2, kept=1, median_stars=1575, status=pass, causes=low-fit (provenance: direct page retrieval)
- game-development: raw=40, kept=1, median_stars=0, status=pass, causes=archived,license,low-signal,stale (provenance: direct page retrieval)
