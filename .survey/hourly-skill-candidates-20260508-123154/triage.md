# Triage
- Problem: Hourly discovery needs stronger recommendation precision while preserving broad recall across five mandatory lanes.
- Audience: Maintainers of akillness/oh-my-skills and contributors reviewing hourly PR cadence.
- Why now: Open PR has no checks reported, so we continue artifact+hardening work while preserving merge safety.

## Workflow Context
- This run follows open-PR hard gate and appends work to existing PR branch.
- Survey used mandatory lanes with recovery attempts when needed.
- Provenance labels are included in markdown for validator compatibility.

## Affected Users
- Repository maintainers handling hourly survey throughput.
- Reviewers triaging low-fit/low-signal candidates.

## Current Workarounds
- Manual spot checks for lane-health inconsistencies.
- Manual interpretation of filtered candidates.

## Adjacent Problems
- License field shape drift in GitHub search payloads.
- Stale repositories slipping through if freshness check is presence-only.

## User Voices
- "development-first" requirement prioritizes substantive functional/procedural gains over cosmetic maintenance.
- "no checks reported" must block merge and require explicit blocker guidance.

Provenance: direct page retrieval, feed recovery.
