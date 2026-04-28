## Settings
- GitHub CLI auth is available; survey should prefer gh API fallback when generic web search is degraded.

## Rules
- In unattended mode, merge-critical path first: validation -> implementation -> PR -> review -> merge.
- If selected carry-forward PR is DIRTY, create replacement branch from main instead of force-rewriting.

## Hooks
- Persist error artifacts for search/graphify/obsidian failures for auditability.

## Platform Gaps
- Mergeability status can remain UNKNOWN transiently; requires bounded rechecks before decision.
