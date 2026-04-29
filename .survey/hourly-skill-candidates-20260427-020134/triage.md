# Triage
- Problem: Hourly repo-maintenance survey needs deterministic degraded-cause reporting for empty lanes (`raw_count == 0`) and explicit raw-vs-dedup recommendation coverage metrics.
- Audience: Maintainers of akillness/oh-my-skills hourly survey loop
- Why now: Current run produced an empty backend lane (`raw_count=0`, `kept_count=0`) and therefore needs explicit `no-results` reporting; it also benefits from always reporting raw and deduplicated recommendation coverage even when duplicate count is zero.

Provenance: indexed snippet (GitHub search result listings), direct page retrieval (GitHub API license fallback).
