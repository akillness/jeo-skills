## Workflow Context
This run targets `akillness/oh-my-skills` hourly maintenance. Open-PR backlog is high, so we apply carry-forward mode and land a small, low-risk ratchet.

## Affected Users
- Repo maintainers reviewing hourly survey PRs
- Future automation runs that rely on eval suites for regression detection

## Current Workarounds
Manual reviewer checks currently catch host-absolute error-log paths in evidence, but this is not codified as an eval assertion.

## Adjacent Problems
- Transport degraded mode (`web_search` 401) can produce noisy, non-portable paths.
- Provenance can pass while path portability still regresses.

## User Voices
- "Keep cron output merge-safe and portable across runners."
- "Record degraded transport cause clearly."
