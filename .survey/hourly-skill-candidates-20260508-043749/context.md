# Context: hourly skill survey loop

## Workflow Context
This hourly run executed mandatory lane discovery with provenance labels `indexed snippet` and `direct page retrieval` and applied recommendation-grade gates (license, freshness, signal, fit).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Decide what skill work to implement safely | advanced |
| Automation operator | Keep unattended run deterministic | advanced |

## Current Workarounds
1. Continue carry-forward commits on existing open PR when checks are absent.
2. Record blocker comments and defer merge until checks appear.

## Adjacent Problems
- No checks reported prevents merge despite valid artifacts.
- Lane recovery may return noisy or low-fit repos without strict gating.

## User Voices
- "development-first, not maintenance-only" — scheduler policy
- "no checks reported means no merge" — quality gate policy
