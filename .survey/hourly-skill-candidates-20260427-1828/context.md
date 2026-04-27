# Context: gh-search empty-payload recovery in hourly survey

## Workflow Context
The hourly loop uses keyword-family survey sweeps to discover skill candidates, then applies relevance/freshness/metadata gates before proposing low-risk PR changes.

## Affected Users
- Maintainers who depend on unattended candidate discovery quality.
- Reviewers who need deterministic evidence artifacts for merge decisions.

## Current Workarounds
- Manual rerun with `gh api "search/repositories?..."` when `gh search repos` returns empty.
- Stage-2 broader recovery queries per lane.
- Explicit `transport_status` annotation in artifacts.

## Adjacent Problems
- Web search transport degradation (`INVALID_API_KEY`) can hide primary evidence unless fallback is explicit.
- Unsupported `gh api /search/repositories -f ...` form returns 404; endpoint form must be documented.

## User Voices
- GitHub CLI manual documents `gh search repos` options, but this run showed an empty-success edge case in unattended execution.
- GitHub REST Search endpoint remained retrievable in the same session.
