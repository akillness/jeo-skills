# Context: hourly skill-candidate survey run

## Workflow Context
The hourly loop scans five fixed keyword families, then applies relevance/license/freshness/signal gates before promoting low-risk changes.

## Affected Users
- Maintainers depending on unattended quality improvements.
- Reviewers needing auditable evidence and deterministic fallbacks.

## Current Workarounds
- GitHub REST search fallback (`gh api "search/repositories?..."`) when CLI search is degraded.
- Lane-level degraded cause reporting and provenance labeling.

## Adjacent Problems
- Search transport instability can produce sparse/noisy candidate sets.
- Metadata gaps (license/archived) can pollute recommendation-grade keeps.

## User Voices
- GitHub CLI and REST docs emphasize command/API shape but not every unattended failure mode.
- Prior hourly runs repeatedly needed explicit fallback and gating policy codification.
