# Context: oh-my-skills hourly survey (hourly-skill-candidates-20260425-160822)

## Workflow Context
This run performs survey-first discovery across five required lanes (`agentic ai skill`, `web frontend skill`, `web backend skill`, `cli open source skill`, `game development skill`) and applies relevance/quality gates before proposing repo updates.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Reviews PR, risk, rollback, merge decision | advanced |
| Cron automation | Executes hourly discovery and artifact generation | intermediate |
| Skill consumers | Reuse improved/new skills safely | mixed |

## Current Workarounds
1. Manual ad-hoc browsing of candidate repos per lane.
2. Inconsistent provenance labels causing validator failures (`--require-provenance`).
3. Reviewer effort spent re-checking lane health metrics that were not standardized.

## Adjacent Problems
- Sparse/noisy lanes can produce low-confidence recommendations.
- Graph tooling schema drift (`links` vs `edges`) can block query-time refinement.
- Headless note capture can fail when URI handlers are unavailable.

## User Voices
- "Hourly runs need deterministic lane status and compact metrics for review." — indexed snippet
- "Keep evidence broad, but recommendation-grade keeps strict." — direct page retrieval
