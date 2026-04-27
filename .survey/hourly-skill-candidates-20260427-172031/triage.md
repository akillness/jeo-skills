# Triage
- Problem: Hourly repo-maintenance survey runs can emit host-specific absolute `transport_status.error_log` paths, reducing reproducibility and cross-run diffability. provenance: direct page retrieval
- Audience: Maintainers reviewing and merging automated survey-driven PRs for `akillness/oh-my-skills`. provenance: direct page retrieval
- Why now: Current run again required transport fallback (`web_search` INVALID_API_KEY), so log-path contract correctness is part of merge-time quality evidence. provenance: indexed snippet
