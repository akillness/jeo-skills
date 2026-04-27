# Context: hourly candidate portability hardening

## Workflow Context
Hourly automation executes five required keyword-family sweeps (`agentic ai skill`, `web frontend skill`, `web backend skill`, `cli open source skill`, `game development skill`) and falls back to GitHub-native retrieval when web transport degrades. The resulting evidence is reviewed through PR before merge. provenance: direct page retrieval

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repository maintainer | Reviews survey artifacts and merges low-risk quality ratchets | advanced |
| Automation operator | Monitors cron lane health and transport degradation handling | advanced |
| Future contributor | Replays artifacts and validates evidence portability | intermediate |

## Current Workarounds
1. Manually interpret host-absolute `error_log` values and mentally convert to repo-relative paths during review. provenance: direct page retrieval
2. Compare runs using surrounding artifact context when paths differ by machine prefix. provenance: indexed snippet

## Adjacent Problems
- Transport fallback visibility can be present but still less portable if path conventions drift.
- Absolute paths increase noise in historical diffs and wiki notes.

## User Voices
- "For unattended hourly runs, standardize the transport error log filename as `.survey/<slug>/web-search-error.log`." — keyword-sweep-and-relevance-rescue.md (direct page retrieval)
- "Reviewers should be able to diff outage evidence consistently." — survey SKILL guidance (direct page retrieval)
