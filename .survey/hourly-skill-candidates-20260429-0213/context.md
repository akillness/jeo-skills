## Workflow Context
Hourly cron performs survey-driven skill improvements and merges PRs when quality gates pass.

## Affected Users
Repository maintainers and reviewers who inspect fallback artifacts during transport outages.

## Current Workarounds
Use GH-native fallback queries and store `web-search-error.log` + error tag/request IDs.

## Adjacent Problems
Without HTTP status, outage triage can be slower across mixed provider failures.

## User Voices
Issue search results frequently include structured error envelopes (`requestId`, `tag`) and status context in transport-failure reports.

Provenance: direct page retrieval
