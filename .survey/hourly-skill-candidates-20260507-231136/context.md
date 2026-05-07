# Context
## Workflow Context
This run executed in open-PR mode. New branch/PR creation was blocked by policy (open PR >=1). We appended a new hourly artifact set to the existing PR branch.

## Affected Users
- Survey maintainers
- Reviewers validating evidence quality

## Current Workarounds
- Continue updates on existing branch when checks are missing
- Post blocker comment with deterministic remediation

## Adjacent Problems
- no checks reported blocks merge despite mergeable diff state
- potential stale or low-fit recommendations without intent/signal gates

## User Voices
- Korean reporting requirement
- explicit run summary: open PR count / new PR 여부 / merge-정리 결과

Provenance: indexed snippet, direct page retrieval.
