# Context: hourly skill candidate survey

## Workflow Context
This hourly job searches five mandatory lanes, captures evidence, and promotes only recommendation-grade candidates for safe skill updates. Provenance: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review and merge hourly PRs | Advanced |
| Contributor | Consume survey outputs for skill updates | Intermediate |

## Current Workarounds
1. Manual triage on noisy lane outputs.
2. Ad-hoc filters for stale/archived repos.

## Adjacent Problems
- Lane imbalance can hide weak coverage.
- Missing explicit degraded causes reduces reviewer auditability.

## User Voices
- "Need deterministic hourly artifacts with provenance and lane-quality rationale." — indexed snippet
