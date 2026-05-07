## Workflow Context
Hourly cron maintenance loop: detect newly-added skills (3-day window), run standard validator, check security/completeness, then apply minimal reversible fixes and open PR.

## Affected Users
- Skill consumers relying on standardized headings for fast navigation.
- Repository maintainers enforcing validator-driven quality gates.

## Current Workarounds
Manual reading can still find guidance, but missing examples/duplicate headers degrade consistency.

## Adjacent Problems
Other recently added skills may pass validator but still include ambiguous references or risky command framing.

## User Voices
- Requested: prioritize newly added skill packages from the last 3 days.
- Requested: fix quality/security/completeness issues and proceed to PR with strict merge gates.
