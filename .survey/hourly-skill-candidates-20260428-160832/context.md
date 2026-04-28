## Workflow Context
Hourly repo-maintenance surveys discover candidate skill updates and should produce merge-safe PRs. Current backlog indicates frequent conflicts, so smaller deterministic ratchets are preferred.

## Affected Users
- Maintainer reviewing many unattended PRs
- Agents executing hourly loops

## Current Workarounds
- Carry-forward merge mode for existing open PRs
- Rebuild a tiny replacement PR from main when selected PR is DIRTY

## Adjacent Problems
- Search transport degradation can misclassify lane health
- Headless note tooling may fail URI execution

## User Voices
- indexed snippet: recurring open PR titles indicate repeated hardening around degraded causes and transport resilience.
- direct page retrieval: PR #207 currently shows CONFLICTING/DIRTY and cannot be merged as-is.
