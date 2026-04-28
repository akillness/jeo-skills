# Triage
- Problem: Hourly survey PR backlog is saturated, and carry-forward merges can fail when candidate PRs are DIRTY/unmergeable.
- Audience: Maintainers operating unattended hourly skill-maintenance automation for `akillness/oh-my-skills`.
- Why now: Open backlog is above threshold, so deterministic replacement-PR behavior is needed to keep merge throughput without unsafe history rewrites.
